import fs from "node:fs";
import path from "node:path";
import { storeUploadedFile } from "./src/services/files.js";
import db from "./src/db/index.js";

const TEACHER = 13;

const classesToCreate = [
  { name: "5-sinf", subject: "Tarix" },
  { name: "6-sinf", subject: "Tarix" },
  { name: "7-sinf", subject: "Tarix" },
  { name: "8-sinf", subject: "Tarix" },
  { name: "9-sinf", subject: "Tarix" },
  { name: "10-sinf", subject: "Tarix" },
  { name: "11-sinf", subject: "Tarix" },
];

const existing = db.prepare(`SELECT name FROM classes WHERE teacher_id = ?`).all(TEACHER).map((r) => r.name.trim());
const insert = db.prepare(`INSERT INTO classes (teacher_id, name, subject) VALUES (?, ?, ?)`);
for (const c of classesToCreate) {
  if (!existing.includes(c.name)) {
    insert.run(TEACHER, c.name, c.subject);
    console.log(`Sinf yaratildi: ${c.name}`);
  } else {
    console.log(`Sinf mavjud: ${c.name}`);
  }
}

const fileMap = {
  "O'zbekiston tarixi (5-sinf)": "tarix_5sinf.pdf",
  "O'zbekiston tarixi (6-sinf, A)": "tarix_6sinf_a.pdf",
  "O'zbekiston tarixi (6-sinf, B)": "tarix_6sinf_b.pdf",
  "O'zbekiston tarixi (7-sinf)": "tarix_7sinf.pdf",
  "O'zbekiston tarixi (8-sinf, A)": "tarix_8sinf_a.pdf",
  "O'zbekiston tarixi (8-sinf, B)": "tarix_8sinf_b.pdf",
  "O'zbekiston tarixi (9-sinf, A)": "tarix_9sinf_a.pdf",
  "O'zbekiston tarixi (9-sinf, B)": "tarix_9sinf_b.pdf",
  "O'zbekiston tarixi (9-sinf, C)": "tarix_9sinf_c.pdf",
  "O'zbekiston tarixi (10-sinf)": "tarix_10sinf.pdf",
  "O'zbekiston tarixi (11-sinf, 1-qism)": "tarix_11sinf_1qism.pdf",
  "O'zbekiston tarixi (11-sinf, 2-qism)": "tarix_11sinf_2qism.pdf",
};

const dir = "data/textbooks-history";
// For the text-layer PDFs the "source PDF" is the same file; OCR-based ones use the scanned PDF as the file.
const upsertFile = db.prepare(
  `INSERT INTO uploaded_files (teacher_id, original_name, stored_name, mime_type, size, category, status, file_path) VALUES (?, ?, ?, 'application/pdf', ?, 'textbook', 'processed', ?)`
);
const linkVersion = db.prepare(`UPDATE textbook_versions SET file_id = ? WHERE teacher_id = ? AND textbook_id = ?`);
const setPages = db.prepare(`UPDATE textbooks SET pages = ? WHERE id = ?`);

let linked = 0;
for (const [title, fname] of Object.entries(fileMap)) {
  const tb = db.prepare(`SELECT id FROM textbooks WHERE teacher_id = ? AND title = ?`).get(TEACHER, title);
  if (!tb) {
    console.log(`Darslik topilmadi: ${title}`);
    continue;
  }
  const v = db.prepare(`SELECT id, file_id FROM textbook_versions WHERE teacher_id = ? AND textbook_id = ? LIMIT 1`).get(TEACHER, tb.id);
  if (v?.file_id) {
    console.log(`Band: ${title}`);
    continue;
  }
  const src = path.join(dir, fname);
  if (!fs.existsSync(src)) {
    console.log(`PDF topilmadi: ${src}`);
    continue;
  }
  const buffer = fs.readFileSync(src);
  const stored = storeUploadedFile(TEACHER, { buffer, originalName: fname, mime: "application/pdf", category: "textbook" });
  const info = upsertFile.run(TEACHER, fname, stored.storedName, buffer.length, stored.filePath);
  linkVersion.run(info.lastInsertRowid, TEACHER, tb.id);
  linked++;
  console.log(`PDF bandlandi: ${title} -> ${fname} (${(buffer.length / 1048576).toFixed(1)} MB)`);
}

console.log(`\nJami: ${linked} ta PDF bandlandi`);
const classes = db.prepare(`SELECT id, name FROM classes WHERE teacher_id = ? ORDER BY name`).all(TEACHER);
console.log("Sinflar:", classes.map((c) => c.name).join(", "));
