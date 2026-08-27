import fs from "node:fs";
import path from "node:path";
import db from "./src/db/index.js";

const backupDir = path.join("data", "backup-eski-qozoq");
fs.mkdirSync(backupDir, { recursive: true });

const stats = {};
const collect = (k, n) => (stats[k] = (stats[k] || 0) + n);

const tx = db.transaction(() => {
  const e2e = db.prepare(`SELECT id FROM teachers WHERE name LIKE 'E2E_%' OR name IN ('TestOquvchi', 'Test2', 'Debug')`).all();
  for (const t of e2e) collect("teachers_test", db.prepare(`DELETE FROM teachers WHERE id = ?`).run(t.id).changes);

  const kz = db
    .prepare(`SELECT id FROM textbooks WHERE teacher_id = 13 AND subject = 'Tarix'`)
    .all()
    .map((r) => r.id);

  const fileIds = new Set();
  for (const id of kz) {
    const versions = db.prepare(`SELECT id, file_id FROM textbook_versions WHERE textbook_id = ?`).all(id);
    for (const v of versions) {
      if (v.file_id) fileIds.add(v.file_id);
    }
  }

  for (const fid of fileIds) {
    const row = db.prepare(`SELECT id, original_name, file_path FROM uploaded_files WHERE id = ?`).get(fid);
    if (!row) continue;
    const stillUsed = db.prepare(`SELECT COUNT(*) AS n FROM textbook_versions WHERE file_id = ?`).get(fid).n;
    if (stillUsed - 0 >= 0 && kz.some(() => true)) {
      const owners = db
        .prepare(`SELECT tv.textbook_id FROM textbook_versions tv WHERE tv.file_id = ? AND tv.textbook_id NOT IN (${kz.join(",") || 0})`)
        .all(fid);
      if (owners.length) continue;
    }
    collect("ocr_results", db.prepare(`DELETE FROM ocr_results WHERE file_id = ?`).run(fid).changes);
    collect("uploaded_files", db.prepare(`DELETE FROM uploaded_files WHERE id = ?`).run(fid).changes);
    if (row.file_path && fs.existsSync(row.file_path)) {
      const dest = path.join(backupDir, `${row.id}-${row.original_name}`);
      fs.renameSync(row.file_path, dest);
    }
  }

  collect("question_reviews", db.prepare(`DELETE FROM question_reviews WHERE teacher_id = 13`).run().changes);
  collect("test_results", db.prepare(`DELETE FROM test_results WHERE teacher_id = 13`).run().changes);
  collect("test_preparations", db.prepare(`DELETE FROM test_preparations WHERE teacher_id = 13`).run().changes);
  collect("questions", db.prepare(`DELETE FROM questions WHERE teacher_id = 13`).run().changes);
  collect("tests", db.prepare(`DELETE FROM tests WHERE teacher_id = 13`).run().changes);
  collect("lesson_plans", db.prepare(`DELETE FROM lesson_plans WHERE teacher_id = 13`).run().changes);
  collect("homework", db.prepare(`DELETE FROM homework WHERE teacher_id = 13`).run().changes);

  for (const id of kz) {
    collect("kb_chunks", db.prepare(`DELETE FROM kb_chunks WHERE textbook_id = ?`).run(id).changes);
    collect("lessons", db.prepare(`DELETE FROM lessons WHERE textbook_id = ?`).run(id).changes);
    collect("chapters", db.prepare(`DELETE FROM chapters WHERE textbook_id = ?`).run(id).changes);
    collect("textbook_versions", db.prepare(`DELETE FROM textbook_versions WHERE textbook_id = ?`).run(id).changes);
    collect("textbooks", db.prepare(`DELETE FROM textbooks WHERE id = ?`).run(id).changes);
  }
});

tx();

const movedDirs = [];
for (const dir of ["data/textbooks-history", "data/textbook-ocr"]) {
  if (!fs.existsSync(dir)) continue;
  const target = path.join(backupDir, path.basename(dir));
  fs.mkdirSync(target, { recursive: true });
  for (const f of fs.readdirSync(dir)) {
    fs.renameSync(path.join(dir, f), path.join(target, f));
    movedDirs.push(f);
  }
  try { fs.rmdir(dir); } catch {}
}

console.log("=== TOZALASH NATIJASI ===");
for (const [k, v] of Object.entries(stats)) if (v) console.log(`  ${k}: ${v}`);
console.log(`  backup fayllar (data/backup-eski-qozoq/): ${fs.readdirSync(backupDir).length} ta`);

console.log("\nQolgan teachers:");
for (const t of db.prepare(`SELECT id, name, subject FROM teachers ORDER BY id`).all()) console.log(`  [${t.id}] ${t.name} (${t.subject})`);
console.log("\nQolgan textbooks:");
for (const t of db.prepare(`SELECT id, teacher_id, title, subject, grade FROM textbooks ORDER BY teacher_id, id`).all()) console.log(`  [${t.id}] (t=${t.teacher_id}) ${t.title} | ${t.subject} ${t.grade}`);
console.log(
  "\nJadvallar:",
  "chapters=" + db.prepare(`SELECT COUNT(*) AS n FROM chapters`).get().n,
  "lessons=" + db.prepare(`SELECT COUNT(*) AS n FROM lessons`).get().n,
  "kb_chunks=" + db.prepare(`SELECT COUNT(*) AS n FROM kb_chunks`).get().n,
  "tests=" + db.prepare(`SELECT COUNT(*) AS n FROM tests`).get().n,
  "questions=" + db.prepare(`SELECT COUNT(*) AS n FROM questions`).get().n,
  "question_bank=" + db.prepare(`SELECT COUNT(*) AS n FROM question_bank`).get().n,
  "classes=" + db.prepare(`SELECT COUNT(*) AS n FROM classes`).get().n
);
