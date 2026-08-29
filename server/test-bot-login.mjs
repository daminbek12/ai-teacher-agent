import db from "./src/db/index.js";
import bcrypt from "bcryptjs";

db.pragma("foreign_keys = ON");

const assert = (cond, msg) => {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("PASS:", msg);
};

const hash = bcrypt.hashSync("Parol123!", 10);
const t1 = db.prepare(`INSERT INTO teachers (name, school_name, subject, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, 'teacher')`)
  .run("Bot Test 1", "Maktab1", "Tarix", "", hash).lastInsertRowid;
const t2 = db.prepare(`INSERT INTO teachers (name, school_name, subject, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, 'teacher')`)
  .run("Bot Test 2", "Maktab2", "Tarix", "", hash).lastInsertRowid;

// Simulyatsiya: telegram.js dagi link/unlink/verify logikasi
const chatId = 111222333;

const linkTeacher = (cid, tid) => db.prepare(`UPDATE teachers SET phone = ? WHERE id = ?`).run(`tg:${cid}`, tid);
const unlinkTeacher = (tid) => db.prepare(`UPDATE teachers SET phone = '' WHERE id = ?`).run(tid);
const getTeacherByChatId = (cid) => db.prepare(`SELECT * FROM teachers WHERE phone = ? COLLATE NOCASE`).get(`tg:${cid}`);

// 1. Parol bilan ulanish (verifyPassword simulyatsiyasi)
let teacher = db.prepare(`SELECT * FROM teachers WHERE id = ?`).get(t1);
assert(bcrypt.compareSync("Parol123!", teacher.password_hash), "parol tekshiruvi to'g'ri");

const current = getTeacherByChatId(chatId);
if (current && current.id !== teacher.id) unlinkTeacher(current.id);
linkTeacher(chatId, teacher.id);
assert(getTeacherByChatId(chatId).id === t1, "chat t1 ga bog'landi");

// 2. Noto'g'ri parol
assert(!bcrypt.compareSync("xato", teacher.password_hash), "noto'g'ri parol rad etiladi");

// 3. Akkaunt almashtirish (switch_account simulyatsiyasi)
const cur = getTeacherByChatId(chatId);
unlinkTeacher(cur.id);
linkTeacher(chatId, t2);
const now = getTeacherByChatId(chatId);
assert(now.id === t2, "akkaunt t2 ga almashtirildi");
assert(db.prepare(`SELECT phone FROM teachers WHERE id = ?`).get(t1).phone === "", "t1 chatdan uzildi");

// 4. Bir chat — bitta o'qituvchi (getTeacherByChatId faqat bitta qaytaradi)
const all = db.prepare(`SELECT * FROM teachers WHERE phone = ?`).all(`tg:${chatId}`);
assert(all.length === 1, "bir chat faqat bitta o'qituvchiga bog'liq");

console.log("\n=== LOGIN TEST: HAMMASI O'TDI ===");
process.exit(0);
