// Bootstrap seed for fresh Render DB: creates teacher account, classes, holidays directly in SQLite.
// Server boshlanishidan oldin ishga tushiriladi: node bootstrap.mjs && node src/index.js
import bcrypt from "bcryptjs";
import db from "./src/db/index.js";
import { seedDefaultHolidays } from "./src/services/planner.js";

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

console.log("Bootstrap tugadi. Login: Tarix ustozi /", password);
