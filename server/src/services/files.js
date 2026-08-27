import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
export const UPLOAD_DIR = path.join(dataDir, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "application/pdf",
  "application/zip", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

const EXT_MIME = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".pdf": "application/pdf", ".zip": "application/zip",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
};

const DANGEROUS_EXT = new Set([
  ".exe", ".bat", ".cmd", ".com", ".sh", ".bin", ".dll", ".so", ".dylib",
  ".msi", ".ps1", ".vbs", ".jar", ".apk", ".ipa", ".scr", ".pif", ".gadget",
]);

export function guessMime(originalName) {
  const ext = path.extname(originalName || "").toLowerCase();
  return EXT_MIME[ext] || "application/octet-stream";
}

export function isImage(mime) {
  return mime.startsWith("image/");
}

export function isValidUpload(mime, size) {
  if (size > MAX_FILE_SIZE) return { ok: false, error: "Fayl hajmi 50MB dan oshadi" };
  if (!ALLOWED_MIME.has(mime)) return { ok: false, error: `Ruxsat etilmagan fayl turi: ${mime}` };
  return { ok: true };
}

export function storeUploadedFile(teacherId, { buffer, originalName, mime, size, category = "other" }) {
  const storedName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${path.extname(originalName || ".bin")}`;
  const filePath = path.join(UPLOAD_DIR, storedName);
  fs.writeFileSync(filePath, buffer);
  return {
    storedName,
    filePath,
    originalName,
    mime: mime || guessMime(originalName),
    size: size || buffer.length,
    category,
  };
}

export function readStoredFile(storedName) {
  const p = path.join(UPLOAD_DIR, storedName);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}

export function extractZip(buffer, { maxTotalBytes = 100 * 1024 * 1024 } = {}) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const files = [];
  let total = 0;
  const seenNames = new Set();
  const duplicates = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName.replace(/\\/g, "/");
    const ext = path.extname(name).toLowerCase();
    if (DANGEROUS_EXT.has(ext)) {
      return { ok: false, error: `Xavfli fayl topildi: ${name} — executable ishga tushirilmaydi` };
    }
    if (seenNames.has(name)) {
      duplicates.push(name);
      continue;
    }
    seenNames.add(name);
    const data = entry.getData();
    total += data.length;
    if (total > maxTotalBytes) {
      return { ok: false, error: "ZIP ichidagi fayllar hajmi limitdan oshadi" };
    }
    const mime = guessMime(name);
    files.push({ name, mime, size: data.length, buffer: data, ext });
  }

  return { ok: true, files, duplicates };
}

export function cleanupStoredFile(storedName) {
  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, storedName));
  } catch {}
}
