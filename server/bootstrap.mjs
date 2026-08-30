// Bootstrap seed for fresh Render DB: creates teacher account, classes, holidays directly in SQLite.
// Server boshlanishidan oldin ishga tushiriladi: node bootstrap.mjs && node src/index.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import db from "./src/db/index.js";
import { seedDefaultHolidays } from "./src/services/planner.js";
import { importStructuredJson, syncLessonsToTopics, cleanTopicTitle } from "./src/services/textbook.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const password = process.env.TEACHER_PASSWORD || "Tarix2026!";

let teacher = db.prepare(`SELECT * FROM teachers WHERE name = ?`).get("Tarix ustozi");
if (!teacher) {
  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare(`INSERT INTO teachers (name, school_name, subject, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, 'teacher')`)
    .run("Tarix ustozi", "Umumta'lim maktabi", "Tarix", "", hash);
  teacher = db.prepare(`SELECT * FROM teachers WHERE id = ?`).get(info.lastInsertRowid);
  console.log("Yangi o'qituvchi yaratildi: id =", teacher.id);
} else {
  console.log("O'qituvchi allaqachon bor: id =", teacher.id);
}

const existing = db.prepare(`SELECT name FROM classes WHERE teacher_id = ?`).all(teacher.id).map((c) => c.name);
const insertClass = db.prepare(`INSERT INTO classes (teacher_id, name, subject, student_count) VALUES (?, ?, ?, 0)`);
for (let g = 5; g <= 11; g++) {
  const name = `${g}-sinf`;
  if (!existing.includes(name)) {
    insertClass.run(teacher.id, name, "Tarix");
    console.log("klass yaratildi:", name);
  }
}

const year = new Date().getFullYear();
const holidaysCount = seedDefaultHolidays(teacher.id, year);
console.log(`bayram kunlari: ${holidaysCount} ta (${year})`);

// 4. Strukturni o'z ichiga olgan JSON darsliklar (git'dan keladi)
const importDir = path.join(__dirname, "textbook_imports");
const manifestPath = path.join(importDir, "manifest.json");
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const entry of manifest) {
    const file = path.join(importDir, entry.file);
    if (!fs.existsSync(file)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      const res = importStructuredJson(teacher.id, { title: entry.title, grade: entry.grade, edition_year: entry.edition_year, data, subject: entry.subject });
      if (res.skipped) {
        console.log(`- ${entry.title}: ${res.reason}`);
      } else {
        console.log(`+ ${entry.title}: ${res.lessons} dars, ${res.chunks} chunk, ${res.pages} sahifa`);
      }
    } catch (e) {
      console.log(`xato (${entry.file}):`, e.message);
    }
  }
}

// 5. Migration: subject bo'sh qolgan eski mavzularni darslik subject'iga moslab to'ldiramiz
// (backfill'dan oldin ishlaydi — shunda backfill dedup keyi subject|title mos kelib, dublikat qo'shmaydi)
const textbookRows = db.prepare(`SELECT id, grade, title, subject FROM textbooks WHERE teacher_id = ?`).all(teacher.id);
let subjectFixed = 0;
for (const tb of textbookRows) {
  const subject = tb.subject || "Tarix";
  const lessons = db.prepare(`SELECT title FROM lessons WHERE textbook_id = ? AND teacher_id = ?`).all(tb.id, teacher.id);
  const classRow = db.prepare(`SELECT id FROM classes WHERE teacher_id = ? AND name = ?`).get(teacher.id, `${tb.grade}-sinf`);
  if (!classRow) continue;
  const titles = lessons.map((l) => cleanTopicTitle(l.title)).filter(Boolean);
  const update = db.prepare(`UPDATE topics SET subject = ? WHERE teacher_id = ? AND class_id = ? AND (subject = '' OR subject IS NULL) AND title = ?`);
  const tx = db.transaction((ts) => ts.forEach((title) => { subjectFixed += update.run(subject, teacher.id, classRow.id, title).changes; }));
  tx([...new Set(titles)]);
}
if (subjectFixed) console.log(`topics subject migration: ${subjectFixed} ta mavzuning fani to'ldirildi`);

// 6. Backfill: allaqachon import qilingan darsliklarning mavzularini topics jadvaliga sinxronlash
// subject'ga qarab alohida sinxronlaymiz (O'zbekiston tarixi va Jahon tarixi bir-biriga aralashmasligi uchun)
const backfill = new Map();
for (const tb of textbookRows) {
  const lessons = db.prepare(`SELECT lesson_no, title FROM lessons WHERE textbook_id = ? AND teacher_id = ? ORDER BY lesson_no`).all(tb.id, teacher.id);
  const key = `${tb.grade}|${tb.subject || "Tarix"}`;
  if (!backfill.has(key)) backfill.set(key, { grade: tb.grade, subject: tb.subject || "Tarix", lessons: [] });
  backfill.get(key).lessons.push(...lessons);
}
let backfilled = 0;
for (const [, { grade, subject, lessons }] of backfill) {
  backfilled += syncLessonsToTopics(teacher.id, grade, lessons, subject);
}
if (backfilled) console.log(`topics backfill: ${backfilled} ta mavzu qo'shildi`);

console.log("Bootstrap tugadi. Login: Tarix ustozi /", password);