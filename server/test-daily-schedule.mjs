import path from "node:path";
import bcrypt from "bcryptjs";
import db from "./src/db/index.js";
import { prepareDailyTest, prepareMorningBriefing } from "./src/services/scheduler.js";

db.pragma("foreign_keys = ON");

const hash = bcrypt.hashSync("TestPass123!", 10);
const t = db
  .prepare(`INSERT INTO teachers (name, school_name, subject, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, 'teacher')`)
  .run("Test Ustozi", "Maktab", "Tarix", "", hash);
const teacherId = t.lastInsertRowid;

const insClass = db.prepare(`INSERT INTO classes (teacher_id, name, subject, student_count) VALUES (?, ?, ?, 0)`);
const c1 = insClass.run(teacherId, "7-A", "Tarix").lastInsertRowid;
const c2 = insClass.run(teacherId, "8-B", "Tarix").lastInsertRowid;
const c3 = insClass.run(teacherId, "9-V", "Tarix").lastInsertRowid;

const insTopic = db.prepare(`INSERT INTO topics (teacher_id, class_id, title, order_no, status) VALUES (?, ?, ?, ?, ?)`);
insTopic.run(teacherId, c1, "Amir Temur davlati", 0, "pending");
insTopic.run(teacherId, c1, "Boburiylar imperiyasi", 1, "pending");
insTopic.run(teacherId, c2, "Jadidchilik harakati", 0, "pending");
insTopic.run(teacherId, c3, "Mustaqillik yillari", 0, "pending");

const dayOfWeek = db.prepare(`SELECT CAST(strftime('%w', 'now', 'localtime') AS INTEGER) + 1 AS d`).get().d;
const insSched = db.prepare(`INSERT INTO schedule (teacher_id, class_id, day_of_week, start_time, subject) VALUES (?, ?, ?, ?, ?)`);
insSched.run(teacherId, c1, dayOfWeek, "08:00", "Tarix");
insSched.run(teacherId, c2, dayOfWeek, "09:00", "Tarix");
insSched.run(teacherId, c3, (dayOfWeek % 7) + 1, "08:00", "Tarix");

const settings = { daily_test_enabled: true, daily_test_count: 5, test_count: 20 };
for (const [k, v] of Object.entries(settings)) {
  db.prepare(`INSERT INTO settings (teacher_id, key, value_json) VALUES (?, ?, ?)`).run(teacherId, k, JSON.stringify(v));
}

const created = await prepareDailyTest(teacherId);
console.log("=== prepareDailyTest ===");
console.log("yaratilgan testlar:", created.length);
for (const test of created) console.log(` - [${test.id}] ${test.title} (topic=${test.topic}, questions=${test.question_count})`);

const testClasses = new Set(
  db.prepare(`SELECT DISTINCT class_id FROM tests WHERE teacher_id = ? AND type = 'daily'`).all(teacherId).map((r) => r.class_id)
);

if (created.length !== 2) {
  console.error(`XATO: 2 ta test bo'lishi kerak (7-A va 8-B bugungi jadvalda), lekin ${created.length} ta`);
  process.exit(1);
}
if (!testClasses.has(c1) || !testClasses.has(c2) || testClasses.has(c3)) {
  console.error("XATO: faqat bugungi jadvaldagi sinflar (7-A, 8-B) test olishi kerak, 9-V olmasligi kerak");
  process.exit(1);
}
for (const test of created) {
  const qs = db.prepare(`SELECT * FROM questions WHERE test_id = ?`).all(test.id);
  if (qs.length === 0) {
    console.error(`XATO: ${test.title} savollari bo'sh`);
    process.exit(1);
  }
  if (qs.some((q) => q.topic !== test.topic)) {
    console.error(`XATO: savol mavzusi test mavzusiga mos emas (${test.topic})`);
    process.exit(1);
  }
}

const duplicate = await prepareDailyTest(teacherId);
if (duplicate.length !== 0) {
  console.error("XATO: qayta chaqirilganda yangi test yaratilmasligi kerak (kuniga bitta)");
  process.exit(1);
}

const briefing = await prepareMorningBriefing(teacherId);
console.log("=== prepareMorningBriefing ===");
console.log("briefing tayyorlandi:", briefing ? briefing.prepared.length : "null");

console.log("\n=== TEST: PASS ===");
process.exit(0);
