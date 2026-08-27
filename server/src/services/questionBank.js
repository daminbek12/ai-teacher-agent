import db from "../db/index.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BANK_FILE = path.join(__dirname, "..", "question_banks", "uz_history_bank.json");
const BANK_SOURCE = "uz_history_bank";

export function bankSize(subject = "Tarix") {
  return db.prepare(`SELECT COUNT(*) AS n FROM question_bank WHERE subject = ?`).get(subject).n;
}

export function loadBankFromFile(force = false) {
  const existing = db.prepare(`SELECT COUNT(*) AS n FROM question_bank`).get().n;
  if (existing > 0 && !force) return 0;
  if (!fs.existsSync(BANK_FILE)) return 0;
  const raw = JSON.parse(fs.readFileSync(BANK_FILE, "utf8"));
  const insert = db.prepare(
    `INSERT OR IGNORE INTO question_bank (subject, topic, grade, question_text, options_json, correct_index, source)
     VALUES (?, ?, '', ?, ?, ?, ?)`
  );
  let added = 0;
  const tx = db.transaction(() => {
    for (const item of raw) {
      const info = insert.run("Tarix", item.t || "Umumiy tarix", item.q, JSON.stringify(item.opts), item.ci, BANK_SOURCE);
      if (info.changes) added++;
    }
  });
  tx();
  return added;
}

function norm(s) {
  return String(s || "")
    .toLocaleLowerCase("en-US")
    .replace(/[ʻʼʹʿ'"‘’`´]/g, "'")
    .replace(/['']{2,}/g, "'")
    .trim();
}

function topicMatch(itemTopic, queryTopic) {
  if (!queryTopic) return 1;
  const it = norm(itemTopic);
  const qt = norm(queryTopic);
  if (it === qt || it.includes(qt) || qt.includes(it)) return 2;
  const itWords = new Set(it.split(/[^a-z'’]+/i).filter((w) => w.length > 3));
  const qtWords = qt.split(/[^a-z'’]+/i).filter((w) => w.length > 3);
  if (qtWords.length && qtWords.some((w) => itWords.has(w))) return 1;
  return 0;
}

function estimateDifficulty(q) {
  const t = norm(q);
  const factSignals = /(qachon|nechanchi yil|nechta|necha foiz|necha baravar|sana|yil|davri|o'rin|o'ringa)/;
  const conceptSignals = /(nimada|qanday|nima|asosiy|afzallik|to'siq|tamoyil|sharti|xususiyat|farqi|sabab|mohiyati|mazmuni)/;
  if (conceptSignals.test(t)) return "hard";
  if (factSignals.test(t)) return "easy";
  return "medium";
}

export function pickQuestionsFromBank({ subject = "Tarix", topic = "", count = 10, difficulties = { easy: 30, medium: 50, hard: 20 }, exclude = new Set() }) {
  loadBankFromFile();
  const plan = buildBankPlan(count, difficulties);
  const rows = db.prepare(`SELECT * FROM question_bank WHERE subject = ?`).all(subject);
  if (!rows.length) return [];

  const pool = rows
    .filter((r) => !exclude.has(norm(r.question_text)))
    .map((r) => ({
      row: r,
      topicScore: topicMatch(r.topic, topic),
      difficulty: estimateDifficulty(r.question_text),
      weight: r.used_count,
    }));

  const byDiff = { easy: [], medium: [], hard: [] };
  for (const p of pool) byDiff[p.difficulty].push(p);
  const sortFn = (a, b) => b.topicScore - a.topicScore || a.weight - b.weight;
  byDiff.easy.sort(sortFn);
  byDiff.medium.sort(sortFn);
  byDiff.hard.sort(sortFn);

  const picked = [];
  const need = [
    ...Array(plan.easy).fill("easy"),
    ...Array(plan.medium).fill("medium"),
    ...Array(plan.hard).fill("hard"),
  ];
  for (const diff of need) {
    let cand = byDiff[diff].shift();
    if (!cand) {
      const fallback = ["medium", "easy", "hard"].find((d) => byDiff[d].length);
      if (fallback) cand = byDiff[fallback].shift();
    }
    if (!cand) break;
    picked.push(cand);
  }

  return picked.map((p) => {
    const options = JSON.parse(p.row.options_json);
    return {
      question_text: p.row.question_text,
      options,
      correct_index: p.row.correct_index,
      difficulty: p.difficulty,
      topic: topic || p.row.topic,
      bankId: p.row.id,
      source: { type: "bank", bank: p.row.source, topic: p.row.topic },
    };
  });
}

function buildBankPlan(count, difficulties) {
  const easy = Math.round((count * (difficulties.easy || 0)) / 100);
  const hard = Math.round((count * (difficulties.hard || 0)) / 100);
  return { easy, hard, medium: Math.max(0, count - easy - hard) };
}

export function markBankUsed(bankIds = []) {
  if (!bankIds.length) return;
  const stmt = db.prepare(`UPDATE question_bank SET used_count = used_count + 1 WHERE id = ?`);
  const tx = db.transaction(() => bankIds.forEach((id) => stmt.run(id)));
  tx();
}

export function getBankStats(teacherId) {
  loadBankFromFile();
  const total = db.prepare(`SELECT COUNT(*) AS n FROM question_bank`).get().n;
  const topics = db.prepare(`SELECT topic, COUNT(*) AS n FROM question_bank GROUP BY topic ORDER BY n DESC`).all();
  return { total, topics };
}
