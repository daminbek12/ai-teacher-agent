// Bootstrap seed for fresh Render DB: creates teacher account, classes, holidays directly in SQLite.
// Server boshlanishidan oldin ishga tushiriladi: node bootstrap.mjs && node src/index.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import db from "./src/db/index.js";
import { seedDefaultHolidays } from "./src/services/planner.js";
import { importStructuredJson } from "./src/services/textbook.js";

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
      const res = importStructuredJson(teacher.id, { title: entry.title, grade: entry.grade, edition_year: entry.edition_year, data });
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

console.log("Bootstrap tugadi. Login: Tarix ustozi /", password);
