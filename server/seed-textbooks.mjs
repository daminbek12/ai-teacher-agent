import fs from "node:fs";
import { createRequire } from "node:module";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const iconv = require("iconv-lite");

const BASE = "http://localhost:3001/api";
const db = new Database("data/teacher_agent.db");

function fixEncoding(text) {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code <= 127 || code > 0xffff) {
      out += ch;
      continue;
    }
    const b = iconv.encode(ch, "cp1252");
    if (b.length === 1 && b[0] !== 0x3f) out += iconv.decode(b, "cp1251");
    else if (ch === "?") out += ch;
    else out += ch;
  }
  return out;
}

async function api(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

const password = "Boshlangich2026!";
const reg = await api("/auth/register", {
  method: "POST",
  body: { name: "Boshlangich sinf", school_name: "Demo maktab", subject: "Boshlang'ich ta'lim", password },
});
const token = reg.token;
console.log("O'qituvchi yaratildi: id =", reg.user.id);

const books = [
  { file: "/tmp/ali_compressed.pdf", title: "Alifbo", subject: "Ona tili", grade: "1", edition_year: "2021" },
  { file: "/tmp/ona_compressed.pdf", title: "Ona tili", subject: "Ona tili", grade: "1", edition_year: "2021" },
  { file: "/tmp/b2_compressed.pdf", title: "Adabiy mehnat", subject: "Adabiy mehnat", grade: "2", edition_year: "2022" },
  { file: "/tmp/mechnat_compressed.pdf", title: "Adabiy mehnat", subject: "Adabiy mehnat", grade: "4", edition_year: "2019" },
];

for (const b of books) {
  const buffer = fs.readFileSync(b.file);
  console.log(`\n>>> ${b.title} (${b.grade}-sinf, ${b.edition_year}) — ${(buffer.length / 1048576).toFixed(1)} MB`);

  const up = await api("/textbooks/upload", {
    method: "POST",
    token,
    body: {
      file_base64: buffer.toString("base64"),
      file_name: `${b.title.toLowerCase().replace(/\s+/g, "_")}_${b.grade}sinf_${b.edition_year}.pdf`,
      subject: b.subject,
      grade: b.grade,
      title: `${b.title} (${b.grade}-sinf)`,
      edition_year: b.edition_year,
      version: `v${b.edition_year}`,
    },
  });
  console.log(`    yuklandi: textbook_id=${up.textbook_id}, ${up.extracted_chars} belgi, ${up.pages} sahifa`);

  const ocrRow = db.prepare(`SELECT id, raw_text FROM ocr_results WHERE file_id = (SELECT file_id FROM textbook_versions WHERE id = ? AND textbook_id = ?)`).get(up.version.id, up.textbook_id)
    || db.prepare(`SELECT id, raw_text FROM ocr_results WHERE teacher_id = ? AND kind = 'textbook' ORDER BY id DESC LIMIT 1`).get(reg.user.id);
  const cleaned = fixEncoding(ocrRow?.raw_text || "");
  if (ocrRow && cleaned.trim()) {
    db.prepare(`UPDATE ocr_results SET raw_text = ? WHERE id = ?`).run(cleaned.slice(0, 200000), ocrRow.id);
    console.log(`    OCR matn tuzatildi: ${cleaned.length} belgi`);
  }

  const st = await api(`/textbooks/${up.textbook_id}/structure`, {
    method: "POST",
    token,
    body: { text: cleaned.trim() ? cleaned : undefined, local_only: true },
  });
  console.log(`    struktura: ${st.chapters} bob, ${st.lessons} dars, ${st.chunks ?? "?"} chunk indekslandi`);
}

const list = await api("/textbooks", { token });
console.log("\n=== TIZIMDAGI DARSLIKLAR ===");
for (const t of list) console.log(`  [${t.id}] ${t.title} | ${t.subject} | ${t.grade}-sinf | ${t.status}`);

console.log("\nLogin: Boshlangich sinf / " + password);
