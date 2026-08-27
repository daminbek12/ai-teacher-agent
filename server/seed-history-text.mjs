import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const iconv = require("iconv-lite");
const pt = promisify(execFile);

const BASE = "http://localhost:3001/api";
const db = new Database("data/teacher_agent.db");

function fixEncoding(text) {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code <= 127 || code > 0xffff) {
      out += ch;
      continue;
    }
    try {
      const b = iconv.encode(ch, "cp1252");
      if (b.length === 1 && b[0] !== 0x3f) out += iconv.decode(b, "cp1251");
      else out += ch;
    } catch {
      out += ch;
    }
  }
  return out;
}

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

const password = "Tarix2026!";
let token = null;
let teacherId = null;
try {
  const login = await api("/auth/login", { method: "POST", body: { name: "Tarix ustozi", password } });
  token = login.token;
  teacherId = login.user.id;
} catch {
  const reg = await api("/auth/register", {
    method: "POST",
    body: { name: "Tarix ustozi", school_name: "Demo maktab", subject: "Tarix", password },
  });
  token = reg.token;
  teacherId = reg.user.id;
}
console.log("O'qituvchi: id =", teacherId);

const books = [
  { file: "tarix_7sinf.pdf", title: "O'zbekiston tarixi (7-sinf)", grade: "7", edition_year: "2017" },
  { file: "tarix_11sinf_1qism.pdf", title: "O'zbekiston tarixi (11-sinf, 1-qism)", grade: "11", edition_year: "2020" },
  { file: "tarix_11sinf_2qism.pdf", title: "O'zbekiston tarixi (11-sinf, 2-qism)", grade: "11", edition_year: "2020" },
];

const dir = "data/textbooks-history";
for (const b of books) {
  const filePath = path.join(dir, b.file);
  console.log(`\n>>> ${b.title}`);
  const { stdout } = await pt("pdftotext", [filePath, "-"], { maxBuffer: 200 * 1048576 });
  const cleaned = fixEncoding(stdout);
  console.log(`    matn: ${cleaned.length} belgi`);

  const tb = await api("/textbooks", {
    method: "POST",
    token,
    body: { subject: "Tarix", grade: b.grade, title: b.title, edition_year: b.edition_year, publisher: "Atamura", status: "verified" },
  });
  console.log(`    textbook id=${tb.id} yaratildi`);

  const st = await api(`/textbooks/${tb.id}/structure`, {
    method: "POST",
    token,
    body: { text: cleaned, local_only: true },
  });
  console.log(`    struktura: ${st.chapters} bob, ${st.lessons} dars, ${st.chunks ?? "?"} chunk`);
}

const list = await api("/textbooks", { token });
console.log("\n=== TARIX DARSLIKLARI ===");
for (const t of list.filter((x) => x.subject === "Tarix" && teacherId === 13)) console.log(`  [${t.id}] ${t.title} | ${t.grade}-sinf | ${t.status}`);
