import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import AdmZip from "adm-zip";
import { generateJson, aiEnabled } from "./ai.js";
import { logAudit } from "./audit.js";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const execFileAsync = promisify(execFile);
const TESSDATA_LANG = process.env.TESSERACT_LANG || "eng";

// Tesseract.js singleton worker — Render'da sistemadagi tesseract kerak emas
let tessWorker = null;
let tessLang = null;

// Lokal traineddata fayli (repo ichida) — Render'da CDN dan yuklab olmaslik uchun
const LOCAL_TRAINEDDATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", `${TESSDATA_LANG}.traineddata`);

async function getTessWorker(lang = TESSDATA_LANG) {
  if (tessWorker && tessLang === lang) return tessWorker;
  try {
    if (tessWorker) await tessWorker.terminate().catch(() => {});
    const { createWorker } = await import("tesseract.js");
    const workerOpts = {};
    if (fs.existsSync(LOCAL_TRAINEDDATA)) {
      workerOpts.langPath = path.dirname(LOCAL_TRAINEDDATA);
      console.log(`[ocr] Lokal traineddata ishlatiladi: ${LOCAL_TRAINEDDATA}`);
    }
    const worker = await createWorker(lang, 1, workerOpts);
    tessWorker = worker;
    tessLang = lang;
    return worker;
  } catch (e) {
    tessWorker = null;
    throw e;
  }
}

function tmpPath(ext) {
  return path.join(os.tmpdir(), `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
}

export async function ocrImage(buffer, { psm = "6" } = {}) {
  // 1) Tesseract.js orqali (sistemaga bog'liq emas, Render'da ishlaydi)
  try {
    const worker = await getTessWorker();
    const { data } = await worker.recognize(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer), {
      psm: Number(psm),
    });
    return { text: (data.text || "").trim(), confidence: Math.round(data.confidence || 0) };
  } catch (e) {
    console.error("[ocr] tesseract.js xato, sistemadagi tesseractga o'tilmoqda:", e.message);
  }

  // 2) Fallback: sistemadagi tesseract binary (lokal ishlab chiqish uchun)
  const tmp = tmpPath(".png");
  fs.writeFileSync(tmp, buffer);
  try {
    const { stdout: text } = await execFileAsync(
      "tesseract",
      [tmp, "stdout", "-l", TESSDATA_LANG, "--psm", psm],
      { maxBuffer: 20 * 1024 * 1024 }
    );
    const { stdout: tsv } = await execFileAsync(
      "tesseract",
      [tmp, "stdout", "-l", TESSDATA_LANG, "--psm", psm, "tsv"],
      { maxBuffer: 20 * 1024 * 1024 }
    );
    const confidence = computeConfidence(tsv);
    return { text: text.trim(), confidence };
  } catch (e) {
    return { text: "", confidence: 0, error: e.message };
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

function computeConfidence(tsv) {
  const lines = tsv.split("\n").slice(1);
  const confs = [];
  for (const line of lines) {
    const cols = line.split("\t");
    const conf = parseFloat(cols[10]);
    if (!Number.isNaN(conf) && conf >= 0) confs.push(conf);
  }
  if (confs.length === 0) return 0;
  return Math.round(confs.reduce((a, b) => a + b, 0) / confs.length);
}

export async function extractPdfText(buffer) {
  let parser = null;
  try {
    parser = new PDFParse({ data: buffer });
    const text = await parser.getText();
    const info = await parser.getInfo().catch(() => null);
    const pages = text?.pages?.length || info?.pages || 0;
    return { text: (text?.text || "").trim(), pages };
  } catch (e) {
    return { text: "", pages: 0, error: e.message };
  } finally {
    try {
      parser?.destroy();
    } catch {}
  }
}

export function extractDocxText(buffer) {
  try {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntry("word/document.xml");
    if (!entry) return { text: "" };
    const xml = entry.getData().toString("utf8");
    const paragraphs = xml
      .split("</w:p>")
      .map((p) => p.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim())
      .filter((p) => p.length > 0);
    return { text: paragraphs.join("\n") };
  } catch (e) {
    return { text: "", error: e.message };
  }
}

export function classifyImage(text) {
  const t = text.toLowerCase();
  const score = (patterns) => patterns.filter((p) => t.includes(p)).length;
  const dayWords = ["dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba", "yakshanba", "monday", "tuesday"];
  const timeWords = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", ":00"];
  const textbookWords = ["mavzu", "bob", "dars", "darslik", "chapter", "lesson", "sahifa", "paragraf", "xulosa", "savol"];
  const studentWords = ["familiya", "ismi", "oquvchi", "sinf", "ro'yxat", "student", "№", "raqam"];
  const examWords = ["nazorat", "imtihon", "test", "variant", "jami", "ball", "baholash"];

  const s = {
    timetable: score(dayWords) * 2 + score(timeWords),
    textbook: score(textbookWords),
    students: score(studentWords),
    exam: score(examWords),
  };

  const best = Object.entries(s).sort((a, b) => b[1] - a[1])[0];
  if (best[1] === 0) return "other";
  return best[0];
}

const WEEKDAY_MAP = { dushanba: 1, seshanba: 2, chorshanba: 3, payshanba: 4, juma: 5, shanba: 6, yakshanba: 7 };

export async function parseTimetable(teacherId, text, { localOnly = false } = {}) {
  if (aiEnabled && !localOnly) {
    try {
      const parsed = await generateJson(
        teacherId,
        [
          {
            role: "system",
            content:
              "Sen dars jadvalini OCR matnidan tahlil qiluvchi AI yordamchisan. Faqat matnda aniq ko'rsatilgan ma'lumotlarni oling, taxmin qilmang. Noaniq bo'lgan maydonlarni bo'sh qoldiring. O'zbek tilida ishlaydi.",
          },
          {
            role: "user",
            content: `Quyidagi OCR matnidan dars jadvalini ajratib oling:\n\n${text}\n\nJSON formati:\n{\n  "entries": [\n    {"day_of_week": 1, "start_time": "09:00", "class_name": "7-A", "subject": "Tarix", "room": "", "confidence_hint": "high|medium|low"}\n  ],\n  "notes": "noaniq joylar haqida izoh"\n}\nKunlar: dushanba=1 ... yakshanba=7. Vaqt format: HH:MM.`,
          },
        ],
        { task: "ocr-parse", complexity: "auto", temperature: 0.1, maxTokens: 2000 }
      );
      return { entries: parsed.entries || [], notes: parsed.notes || "", via: "ai" };
    } catch {
      // fall through to local
    }
  }
  return { entries: parseTimetableLocal(text), notes: "", via: "local" };
}

function parseTimetableLocal(text) {
  const lines = text.split("\n");
  const entries = [];
  let currentDay = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    for (const [name, id] of Object.entries(WEEKDAY_MAP)) {
      if (lower.startsWith(name) || lower.includes(name)) {
        currentDay = id;
        const rest = line.replace(new RegExp(name, "i"), "");
        if (rest.trim()) {
          const e = parseEntryLine(rest.trim(), currentDay);
          if (e) entries.push(e);
        }
        break;
      }
    }
    if (currentDay && !Object.values(WEEKDAY_MAP).some((v) => v === currentDay && lower.includes(Object.keys(WEEKDAY_MAP).find((k) => WEEKDAY_MAP[k] === v)))) {
      const e = parseEntryLine(line, currentDay);
      if (e) entries.push(e);
    }
  }
  return entries;
}

function parseEntryLine(line, day) {
  const timeMatch = line.match(/(\d{1,2})[:.](\d{2})/);
  if (!timeMatch) return null;
  const start_time = `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
  const rest = line.replace(timeMatch[0], "");
  const classMatch = rest.match(/\b(\d{1,2})\s*[-–—]?\s*([A-Za-zА-Яа-я]{1,3})\b/) || rest.match(/\b(\d{1,2})\s*-\s*([A-Za-z])/);
  let class_name = "";
  if (classMatch) {
    class_name = `${classMatch[1]}-${classMatch[2].toUpperCase()}`;
  }
  const knownSubjects = ["tarix", "matematika", "fizika", "kimyo", "biologiya", "geografiya", "ingliz tili", "rus tili", "adabiyot", "ona tili", "jismoniy tarbiya", "informatika", "musiqa", "chizmachilik"];
  const lower = rest.toLowerCase();
  const subject = knownSubjects.find((s) => lower.includes(s)) || "";
  return { day_of_week: day, start_time, class_name, subject, room: "" };
}

export async function ingestTextContent(teacherId, { text, fileId, kind = "text", sourceText = "" }) {
  logAudit(teacherId, { action: "ingest", entityType: "uploaded_files", entityId: fileId || 0, detail: { kind, chars: text.length } });
  return { ok: true, text, chars: text.length };
}
