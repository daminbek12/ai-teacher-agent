import { execFileSync } from "node:child_process";
import db from "./src/db/index.js";

const TEACHER = 13;
db.prepare(`DELETE FROM classes WHERE teacher_id = ? AND id IN (20, 24, 25)`).run(TEACHER);

const rows = db
  .prepare(
    `SELECT t.id, t.title, f.file_path FROM textbooks t
     JOIN textbook_versions v ON v.textbook_id = t.id AND v.is_active = 1
     JOIN uploaded_files f ON f.id = v.file_id
     WHERE t.teacher_id = ?`
  )
  .all(TEACHER);

for (const r of rows) {
  try {
    const out = execFileSync("pdfinfo", [r.file_path], { encoding: "utf8" });
    const m = out.match(/^Pages:\s*(\d+)/m);
    if (m) db.prepare(`UPDATE textbooks SET pages = ? WHERE id = ?`).run(Number(m[1]), r.id);
  } catch {}
}

console.log("Sinflar:", db.prepare(`SELECT id, name, subject FROM classes WHERE teacher_id = ? ORDER BY name`).all(TEACHER).map((c) => c.name).join(", "));
console.log("Darsliklar:", db.prepare(`SELECT id, title, grade, pages FROM textbooks WHERE teacher_id = ? ORDER BY CAST(grade AS INTEGER)`).all(TEACHER).map((t) => `${t.title} (${t.pages} p.)`).join("\n            "));
