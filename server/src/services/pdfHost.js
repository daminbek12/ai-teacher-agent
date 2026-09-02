import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import db from "../db/index.js";
import { generateTestPdf } from "./pdfGenerator.js";
import { UPLOAD_DIR } from "./files.js";

const UA = "AI-Teacher-Agent/1.0";
const SHARE_DIR = path.join(UPLOAD_DIR, "shares");
if (!fs.existsSync(SHARE_DIR)) fs.mkdirSync(SHARE_DIR, { recursive: true });

const HOSTS = [
  { name: "litterbox", upload: uploadLitterbox },
  { name: "gofile", upload: uploadGofile },
  { name: "catbox", upload: uploadCatbox },
  { name: "pixeldrain", upload: uploadPixeldrain },
  { name: "zeroxt", upload: uploadZeroxt },
];

function safeName(name) {
  const base = String(name || "test").replace(/[^\w\d._-]+/g, "_").slice(0, 80);
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

function asBlob(buffer) {
  return new Blob([new Uint8Array(buffer)], { type: "application/pdf" });
}

function publicBase() {
  return String(process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");
}

async function postForm(url, form, { timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "POST", body: form, headers: { "User-Agent": UA }, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 120)}`);
    return text;
  } finally {
    clearTimeout(t);
  }
}

async function uploadLitterbox(buffer, filename) {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("time", "72h");
  form.append("fileToUpload", asBlob(buffer), filename);
  const text = (await postForm("https://litterbox.catbox.moe/resources/internals/api.php", form)).trim();
  if (!/^https?:\/\/litter\.catbox\.moe\//i.test(text)) throw new Error(text.slice(0, 80));
  return text;
}

async function uploadCatbox(buffer, filename) {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("fileToUpload", asBlob(buffer), filename);
  const text = (await postForm("https://catbox.moe/user/api.php", form)).trim();
  if (!/^https?:\/\/files\.catbox\.moe\//i.test(text)) throw new Error(text.slice(0, 80));
  return text;
}

async function uploadPixeldrain(buffer, filename) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`https://pixeldrain.com/api/file/${encodeURIComponent(filename)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf", "User-Agent": UA },
      body: buffer,
      signal: ctrl.signal,
    });
    const json = await res.json();
    if (!json?.id) throw new Error("id yo'q");
    return `https://pixeldrain.com/api/file/${json.id}?download`;
  } finally {
    clearTimeout(t);
  }
}

async function uploadZeroxt(buffer, filename) {
  const form = new FormData();
  form.append("file", asBlob(buffer), filename);
  const text = (await postForm("https://0x0.st", form)).trim();
  if (!/^https?:\/\/0x0\.st\//i.test(text)) throw new Error(text.slice(0, 80));
  return text;
}

async function uploadGofile(buffer, filename) {
  const srvRes = await fetch("https://api.gofile.io/servers", { headers: { "User-Agent": UA } });
  const srv = await srvRes.json();
  const server = srv?.data?.servers?.[0]?.name;
  if (!server) throw new Error("server yo'q");
  const form = new FormData();
  form.append("file", asBlob(buffer), filename);
  const text = await postForm(`https://${server}.gofile.io/contents/uploadfile`, form, { timeoutMs: 20000 });
  const json = JSON.parse(text);
  const url = json?.data?.downloadPage || json?.data?.directLink;
  if (!url) throw new Error("url yo'q");
  return url;
}

export async function uploadPdfToFreeHost(buffer, originalName = "test.pdf") {
  const filename = safeName(originalName);
  const errors = [];
  for (const host of HOSTS) {
    try {
      const url = await host.upload(buffer, filename);
      if (url && /^https?:\/\//i.test(url)) {
        return { ok: true, url, host: host.name, errors };
      }
    } catch (e) {
      errors.push(`${host.name}: ${e.message}`);
    }
  }
  return { ok: false, url: "", host: "", errors };
}

export function getShareFile(token) {
  if (!token || !/^[a-f0-9]{16,64}(-a)?$/i.test(token)) return null;
  const p = path.join(SHARE_DIR, `${token}.pdf`);
  if (!fs.existsSync(p)) return null;
  return p;
}

export function getTestByShareToken(token) {
  if (!token) return null;
  return db.prepare(`SELECT * FROM tests WHERE pdf_share_token = ?`).get(token);
}

function saveLocalShare(buffer, token) {
  fs.writeFileSync(path.join(SHARE_DIR, `${token}.pdf`), buffer);
  const base = publicBase();
  return base ? `${base}/api/share/pdf/${token}` : `/api/share/pdf/${token}`;
}

function buildPdfData(teacher, test, questions, cls, answers) {
  return {
    schoolName: teacher.school_name || "",
    subject: cls?.subject || teacher.subject || "Tarix",
    className: cls?.name || "",
    topic: test.topic || test.title,
    teacherName: teacher.name || "",
    title: test.title,
    questions: questions.map((q) => ({ ...q, options: JSON.parse(q.options_json) })),
    showAnswers: answers,
    beletNumber: test.belet_number || "",
    isHomework: !!test.is_homework,
  };
}

export async function hostTestPdf(teacherId, testId, { answers = false, force = false } = {}) {
  const test = db.prepare(`SELECT * FROM tests WHERE id = ? AND teacher_id = ?`).get(testId, teacherId);
  if (!test) throw new Error("Test topilmadi");

  const urlCol = answers ? "pdf_url_answers" : "pdf_url";
  if (!force && test[urlCol]) {
    return { ok: true, url: test[urlCol], host: "cached", token: test.pdf_share_token, cached: true };
  }

  const teacher = db.prepare(`SELECT * FROM teachers WHERE id = ?`).get(teacherId);
  const cls = db.prepare(`SELECT * FROM classes WHERE id = ?`).get(test.class_id);
  const questions = db.prepare(`SELECT * FROM questions WHERE test_id = ? ORDER BY id`).all(test.id);
  const buffer = await generateTestPdf(buildPdfData(teacher, test, questions, cls, answers));
  const filename = safeName(`${test.title}${answers ? "_javoblar" : ""}.pdf`);

  let token = test.pdf_share_token;
  if (!token) {
    token = crypto.randomBytes(16).toString("hex");
    db.prepare(`UPDATE tests SET pdf_share_token = ? WHERE id = ?`).run(token, test.id);
  }
  const localUrl = saveLocalShare(buffer, answers ? `${token}-a` : token);

  const hosted = await uploadPdfToFreeHost(buffer, filename);
  const url = hosted.ok ? hosted.url : localUrl;
  db.prepare(`UPDATE tests SET ${urlCol} = ? WHERE id = ?`).run(url, test.id);

  return {
    ok: true,
    url,
    host: hosted.ok ? hosted.host : "local",
    token,
    localUrl,
    errors: hosted.errors,
  };
}
