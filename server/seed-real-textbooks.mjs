import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3001/api";
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
  if (!res.ok) throw new Error(`${method} ${pathSeg} -> ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const login = await api("/auth/login", { method: "POST", body: { name: "Tarix ustozi", password } });
const token = login.token;
console.log("O'qituvchi: id =", login.user.id);

const books = [
  { file: "/tmp/uzbooks/uzt_8s.pdf", title: "O'zbekiston tarixi (8-sinf, 2024)", grade: "8", edition_year: "2024" },
  { file: "/tmp/uzbooks/uzt_9s.pdf", title: "O'zbekiston tarixi (9-sinf, 2024)", grade: "9", edition_year: "2024" },
  { file: "/tmp/uzbooks/jt_8s_full.pdf", title: "Jahon tarixi (8-sinf, 2024)", grade: "8", edition_year: "2024" },
  { file: "/tmp/uzbooks/jt_9s_full.pdf", title: "Jahon tarixi (9-sinf, 2024)", grade: "9", edition_year: "2024" },
  { file: "/tmp/uztarix_9s.pdf", title: "O'zbekiston tarixi imtihon savollari (9-sinf)", grade: "9", edition_year: "2026" },
];

const existing = await api("/textbooks", { token });
const titles = existing.map((t) => t.title);

for (const b of books) {
  if (titles.includes(b.title)) {
    console.log(`\n--- ${b.title}: allaqachon yuklangan`);
    continue;
  }
  const buf = fs.readFileSync(b.file);
  console.log(`\n>>> ${b.title} (${(buf.length / 1048576).toFixed(1)} MB)`);
  const up = await api("/textbooks/upload", {
    method: "POST",
    token,
    body: {
      file_base64: buf.toString("base64"),
      file_name: path.basename(b.file),
      subject: "Tarix",
      grade: b.grade,
      title: b.title,
      edition_year: b.edition_year,
      version: `v${b.edition_year}`,
      localOnly: true,
    },
  });
  console.log(`    textbook id=${up.textbook_id}, ${up.extracted_chars} belgi, ${up.pages} sahifa`);

  const st = await api(`/textbooks/${up.textbook_id}/structure`, {
    method: "POST",
    token,
    body: { local_only: true },
  });
  console.log(`    struktura: ${st.chapters} bob, ${st.lessons} dars, ${st.chunks} chunk`);
}

const list = await api("/textbooks", { token });
console.log("\n=== QOLGAN DARSLIKLAR ===");
for (const t of list.filter((x) => x.subject === "Tarix")) {
  console.log(`  [${t.id}] ${t.title} | ${t.grade}-sinf | ${t.pages} sahifa | ${t.status}`);
}
