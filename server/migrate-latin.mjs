import Database from "better-sqlite3";
import { latinifyChunk, cyrToLatUz } from "./src/services/transliteration.js";

const db = new Database("data/teacher_agent.db");

const tables = [
  { table: "kb_chunks", fields: ["content", "keywords"], latinify: { content: latinifyChunk, keywords: cyrToLatUz } },
  { table: "lessons", fields: ["title", "summary", "keywords", "dates", "people", "places", "events", "terms"] },
  { table: "chapters", fields: ["title", "summary"] },
  { table: "ocr_results", fields: ["raw_text"], filter: "kind = 'textbook'", latinify: { raw_text: latinifyChunk } },
];

for (const t of tables) {
  const rows = db.prepare(`SELECT id, ${t.fields.join(", ")} FROM ${t.table}${t.filter ? " WHERE " + t.filter : ""}`).all();
  const update = db.prepare(`UPDATE ${t.table} SET ${t.fields.map((f) => `${f} = ?`).join(", ")} WHERE id = ?`);
  let changed = 0;
  const tx = db.transaction(() => {
    for (const r of rows) {
      const vals = t.fields.map((f) => {
        const v = r[f];
        if (!v) return v;
        const fn = t.latinify?.[f] || cyrToLatUz;
        const converted = fn(v);
        return converted;
      });
      if (vals.some((v, i) => v !== r[t.fields[i]])) changed++;
      update.run(...vals, r.id);
    }
  });
  tx();
  console.log(`${t.table}: ${rows.length} qator, ${changed} ta o'zgartirildi`);
}

const old = db.prepare(`SELECT id, topic FROM tests WHERE topic != ''`).all();
for (const r of old) db.prepare(`UPDATE tests SET topic = ? WHERE id = ?`).run(cyrToLatUz(r.topic), r.id);

const chunks = db.prepare(`SELECT COUNT(*) c FROM kb_chunks`).get();
console.log("\nJami kb_chunks:", chunks.c);
console.log("Namuna:", db.prepare(`SELECT content FROM kb_chunks LIMIT 1`).get().content.slice(0, 200).replace(/\n/g, " | "));
