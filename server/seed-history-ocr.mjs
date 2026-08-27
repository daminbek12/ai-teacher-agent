import fs from "node:fs";
import Database from "better-sqlite3";

const BASE = "http://localhost:3001/api";
const db = new Database("data/teacher_agent.db");

const ocrDir = "data/textbook-ocr";
const password = "Tarix2026!";

async function api(pathSeg, { method = "GET", body, token } = {}) {
  const res = await fetch(`${BASE}${pathSeg}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${pathSeg} -> ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

const meta = {
  tarix_5sinf: { title: "O'zbekiston tarixi (5-sinf)", grade: "5", edition_year: "2017" },
  tarix_6sinf_a: { title: "O'zbekiston tarixi (6-sinf, A)", grade: "6", edition_year: "2017" },
  tarix_6sinf_b: { title: "O'zbekiston tarixi (6-sinf, B)", grade: "6", edition_year: "2017" },
  tarix_8sinf_a: { title: "O'zbekiston tarixi (8-sinf, A)", grade: "8", edition_year: "2017" },
  tarix_8sinf_b: { title: "O'zbekiston tarixi (8-sinf, B)", grade: "8", edition_year: "2017" },
  tarix_9sinf_a: { title: "O'zbekiston tarixi (9-sinf, A)", grade: "9", edition_year: "2017" },
  tarix_9sinf_b: { title: "O'zbekiston tarixi (9-sinf, B)", grade: "9", edition_year: "2017" },
  tarix_9sinf_c: { title: "O'zbekiston tarixi (9-sinf, C)", grade: "9", edition_year: "2017" },
  tarix_10sinf: { title: "O'zbekiston tarixi (10-sinf)", grade: "10", edition_year: "2017" },
};

const login = await api("/auth/login", { method: "POST", body: { name: "Tarix ustozi", password } });
const token = login.token;
console.log("O'qituvchi: id =", login.user.id);

const done = db.prepare(`SELECT title FROM textbooks WHERE teacher_id = ?`).all(login.user.id).map((r) => r.title);

let seededCount = 0;
for (const [key, b] of Object.entries(meta)) {
  const txtFile = `${ocrDir}/${key}.txt`;
  const doneFile = `${ocrDir}/${key}.done`;
  if (!fs.existsSync(doneFile)) {
    console.log(`\n--- ${key}: OCR hali tugamagan, o'tkazib yuborildi`);
    continue;
  }
  if (done.includes(b.title)) {
    console.log(`\n--- ${b.title}: allaqachon yuklangan`);
    continue;
  }
  const text = fs.readFileSync(txtFile, "utf8");
  console.log(`\n>>> ${b.title} (${text.length} belgi)`);

  const tb = await api("/textbooks", {
    method: "POST",
    token,
    body: { subject: "Tarix", grade: b.grade, title: b.title, edition_year: b.edition_year, publisher: "Mektep", status: "verified" },
  });
  console.log(`    textbook id=${tb.id} yaratildi`);

  const st = await api(`/textbooks/${tb.id}/structure`, {
    method: "POST",
    token,
    body: { text, local_only: true },
  });
  console.log(`    struktura: ${st.chapters} bob, ${st.lessons} dars, ${st.chunks ?? "?"} chunk`);
  seededCount++;
}

console.log(`\nYuklandi: ${seededCount} ta yangi tarix darsligi`);
const list = await api("/textbooks", { token });
console.log("\n=== BARCHA TARIX DARSLIKLARI ===");
for (const t of list.filter((x) => x.subject === "Tarix")) console.log(`  [${t.id}] ${t.title} | ${t.grade}-sinf | ${t.status}`);
