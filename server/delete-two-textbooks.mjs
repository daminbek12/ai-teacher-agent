import db from "./src/db/index.js";
import fs from "node:fs";

for (const tbId of [34, 35]) {
  const tb = db.prepare("SELECT title FROM textbooks WHERE id = ?").get(tbId);
  if (!tb) { console.log("darslik topilmadi:", tbId); continue; }
  const versions = db.prepare("SELECT id, file_id FROM textbook_versions WHERE textbook_id = ?").all(tbId);
  for (const v of versions) {
    if (v.file_id) {
      const f = db.prepare("SELECT file_path FROM uploaded_files WHERE id = ?").get(v.file_id);
      if (f && f.file_path && fs.existsSync(f.file_path)) {
        fs.unlinkSync(f.file_path);
        console.log("PDF o'chirildi:", f.file_path.split("/").pop());
      }
      db.prepare("DELETE FROM uploaded_files WHERE id = ?").run(v.file_id);
    }
    db.prepare("DELETE FROM ocr_results WHERE file_id = ?").run(v.file_id);
    db.prepare("DELETE FROM textbook_versions WHERE id = ?").run(v.id);
  }
  db.prepare("DELETE FROM textbooks WHERE id = ?").run(tbId);
  console.log("darslik o'chirildi:", tbId, tb.title);
}
console.log("qolgan darsliklar:", db.prepare("SELECT COUNT(*) n FROM textbooks").get().n);
