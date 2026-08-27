import db from "../db/index.js";
import { generateJson, aiEnabled } from "./ai.js";
import { logAudit } from "./audit.js";

export function createTextbook(teacherId, data) {
  const { subject, grade, title, author = "", publisher = "", edition_year = "", isbn = "", pages = 0, source_url = "", status = "uploaded" } = data;
  if (!subject || !grade || !title) throw new Error("subject, grade va title talab qilinadi");
  const info = db
    .prepare(
      `INSERT INTO textbooks (teacher_id, subject, grade, title, author, publisher, edition_year, isbn, pages, source_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(teacherId, subject, grade, title, author, publisher, edition_year, isbn, pages, source_url, status);
  const textbook = db.prepare(`SELECT * FROM textbooks WHERE id = ?`).get(info.lastInsertRowid);
  logAudit(teacherId, { action: "textbook.create", entityType: "textbook", entityId: textbook.id, detail: { title } });
  return textbook;
}

export function addTextbookVersion(teacherId, textbookId, { version, edition_year = "", source = "", fileId = null, isActive = false }) {
  const tb = db.prepare(`SELECT * FROM textbooks WHERE id = ? AND teacher_id = ?`).get(textbookId, teacherId);
  if (!tb) throw new Error("Darslik topilmadi");
  if (isActive) {
    db.prepare(`UPDATE textbook_versions SET is_active = 0 WHERE textbook_id = ?`).run(textbookId);
  }
  const info = db
    .prepare(
      `INSERT INTO textbook_versions (textbook_id, teacher_id, version, edition_year, source, file_id, verification_status, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
    )
    .run(textbookId, teacherId, version, edition_year, source, fileId, isActive ? 1 : 0);
  const row = db.prepare(`SELECT * FROM textbook_versions WHERE id = ?`).get(info.lastInsertRowid);
  logAudit(teacherId, { action: "textbook.version", entityType: "textbook", entityId: textbookId, detail: { version } });
  return row;
}

export function activateTextbookVersion(teacherId, textbookId, versionId) {
  const tb = db.prepare(`SELECT * FROM textbooks WHERE id = ? AND teacher_id = ?`).get(textbookId, teacherId);
  if (!tb) throw new Error("Darslik topilmadi");
  db.prepare(`UPDATE textbook_versions SET is_active = 0 WHERE textbook_id = ?`).run(textbookId);
  db.prepare(`UPDATE textbook_versions SET is_active = 1, verification_status = 'verified' WHERE id = ? AND textbook_id = ?`).run(versionId, textbookId);
  const v = db.prepare(`SELECT * FROM textbook_versions WHERE id = ?`).get(versionId);
  logAudit(teacherId, { action: "textbook.activate", entityType: "textbook", entityId: textbookId, detail: { version: v.version } });
  return v;
}

export function listTextbooks(teacherId) {
  return db.prepare(`SELECT * FROM textbooks WHERE teacher_id = ? ORDER BY id DESC`).all(teacherId);
}

export function getTextbook(teacherId, textbookId) {
  const tb = db.prepare(`SELECT * FROM textbooks WHERE id = ? AND teacher_id = ?`).get(textbookId, teacherId);
  if (!tb) return null;
  tb.versions = db.prepare(`SELECT * FROM textbook_versions WHERE textbook_id = ? ORDER BY id DESC`).all(textbookId);
  tb.chapters = db.prepare(`SELECT * FROM chapters WHERE textbook_id = ? ORDER BY chapter_no`).all(textbookId);
  return tb;
}

export function addChapter(teacherId, textbookId, { chapter_no, title, page_start = 0, page_end = 0, summary = "" }) {
  const info = db
    .prepare(`INSERT INTO chapters (textbook_id, teacher_id, chapter_no, title, page_start, page_end, summary) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(textbookId, teacherId, chapter_no, title, page_start, page_end, summary);
  return db.prepare(`SELECT * FROM chapters WHERE id = ?`).get(info.lastInsertRowid);
}

export function addLesson(teacherId, textbookId, chapterId, data) {
  const { lesson_no, title, page_start = 0, page_end = 0, summary = "", keywords = "", dates = "", people = "", places = "", events = "", terms = "" } = data;
  const info = db
    .prepare(
      `INSERT INTO lessons (textbook_id, chapter_id, teacher_id, lesson_no, title, page_start, page_end, summary, keywords, dates, people, places, events, terms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(textbookId, chapterId || null, teacherId, lesson_no, title, page_start, page_end, summary, keywords, dates, people, places, events, terms);
  return db.prepare(`SELECT * FROM lessons WHERE id = ?`).get(info.lastInsertRowid);
}

export function addKbChunk(teacherId, { textbookId, versionId = null, chapterId = null, lessonId = null, chunkIndex = 0, content, page = 0, keywords = "" }) {
  if (!content || !content.trim()) return null;
  const info = db
    .prepare(
      `INSERT INTO kb_chunks (textbook_id, version_id, chapter_id, lesson_id, teacher_id, chunk_index, content, page, keywords)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(textbookId, versionId, chapterId, lessonId, teacherId, chunkIndex, content, page, keywords);
  return db.prepare(`SELECT * FROM kb_chunks WHERE id = ?`).get(info.lastInsertRowid);
}

export function clearTextbookContent(teacherId, textbookId) {
  db.prepare(`DELETE FROM kb_chunks WHERE textbook_id = ? AND teacher_id = ?`).run(textbookId, teacherId);
  db.prepare(`DELETE FROM lessons WHERE textbook_id = ? AND teacher_id = ?`).run(textbookId, teacherId);
  db.prepare(`DELETE FROM chapters WHERE textbook_id = ? AND teacher_id = ?`).run(textbookId, teacherId);
}

export function chunkText(text, { chunkSize = 800, overlap = 100 } = {}) {
  const clean = text.replace(/\n{3,}/g, "\n\n").trim();
  const chunks = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(i + chunkSize, clean.length);
    chunks.push(clean.slice(i, end));
    if (end >= clean.length) break;
    i = end - overlap;
  }
  return chunks;
}

export function indexTextbookContent(teacherId, textbookId, { chapters, lessons, chunks }) {
  clearTextbookContent(teacherId, textbookId);
  const tb = db.prepare(`SELECT * FROM textbooks WHERE id = ? AND teacher_id = ?`).get(textbookId, teacherId);
  if (!tb) throw new Error("Darslik topilmadi");
  const activeVersion = db.prepare(`SELECT * FROM textbook_versions WHERE textbook_id = ? AND is_active = 1`).get(textbookId);

  let chapterIdMap = {};
  for (const c of chapters || []) {
    const row = addChapter(teacherId, textbookId, c);
    chapterIdMap[c.chapter_no] = row.id;
  }
  for (const l of lessons || []) {
    addLesson(teacherId, textbookId, chapterIdMap[l.chapter_no], l);
  }
  let idx = 0;
  for (const chunk of chunks) {
    addKbChunk(teacherId, {
      textbookId,
      versionId: activeVersion ? activeVersion.id : null,
      chapterId: null,
      lessonId: null,
      chunkIndex: idx++,
      content: chunk.content || chunk,
      page: chunk.page || 0,
      keywords: chunk.keywords || "",
    });
  }
  db.prepare(`UPDATE textbooks SET pages = ?, status = 'verified' WHERE id = ?`).run(tb.pages || chunks.length * 2, textbookId);
  logAudit(teacherId, { action: "textbook.indexed", entityType: "textbook", entityId: textbookId, detail: { chapters: chapters?.length, lessons: lessons?.length, chunks: chunks.length } });
  return { chapters: chapters?.length || 0, lessons: lessons?.length || 0, chunks: chunks.length };
}

const CYR_TO_LAT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "x", ц: "s", ч: "ch", ш: "sh", щ: "sh", ъ: "'", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
  ў: "o'", қ: "q", ғ: "g'", ҳ: "h",
};

const LAT_TO_CYR = {
  "o'": "ў", "g'": "ғ", "'": "ъ", a: "а", b: "б", d: "д", e: "е", f: "ф", g: "г", h: "ҳ",
  i: "и", j: "ж", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", q: "қ", r: "р", s: "с",
  t: "т", u: "у", v: "в", x: "х", y: "й", z: "з", sh: "ш", ch: "ч", ng: "нг",
};

export function cyrToLat(text) {
  let out = "";
  for (const ch of text) {
    const mapped = CYR_TO_LAT[ch.toLowerCase()];
    out += mapped === undefined ? ch : mapped;
  }
  return out;
}

export function latToCyr(text) {
  let out = "";
  const lower = text.toLowerCase();
  let i = 0;
  while (i < lower.length) {
    const two = lower.slice(i, i + 2);
    if (LAT_TO_CYR[two]) {
      out += LAT_TO_CYR[two];
      i += 2;
      continue;
    }
    out += LAT_TO_CYR[lower[i]] ?? lower[i];
    i += 1;
  }
  return out;
}

export function normalizeForSearch(term) {
  const variants = new Set([term]);
  const base = [term, cyrToLat(term), latToCyr(term), cyrToLat(latToCyr(term)), latToCyr(cyrToLat(term))];
  const expanded = [];
  for (const t of base) {
    expanded.push(t);
    expanded.push(t.replace(/e/g, "o").replace(/е/g, "о"));
    expanded.push(t.replace(/o/g, "e").replace(/о/g, "е"));
  }
  for (const t of expanded) {
    variants.add(t);
    if (t.includes("'")) {
      variants.add(t.replace(/'/g, ""));
      variants.add(t.replace(/'/g, "ʻ"));
    }
  }
  return [...variants].filter(Boolean);
}

export function searchKnowledgeBase(teacherId, query, { textbookId = null, grade = null, subject = null, limit = 6 } = {}) {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .flatMap(normalizeForSearch)
    .filter((v, idx, arr) => arr.indexOf(v) === idx);
  const all = db
    .prepare(
      `SELECT k.*, t.grade AS grade, t.subject AS subject, t.title AS textbook_title, t.id AS textbook_id,
              c.title AS chapter_title, l.title AS lesson_title
       FROM kb_chunks k
       JOIN textbooks t ON t.id = k.textbook_id
       LEFT JOIN chapters c ON c.id = k.chapter_id
       LEFT JOIN lessons l ON l.id = k.lesson_id
       WHERE k.teacher_id = ?
       ${textbookId ? "AND k.textbook_id = ?" : ""}
       ${grade ? "AND t.grade = ?" : ""}
       ${subject ? "AND t.subject = ?" : ""}`
    )
    .all(
      ...[
        teacherId,
        textbookId || null,
        grade || null,
        subject || null,
      ].filter((v) => v !== null)
    );

  const scored = all.map((chunk) => {
    const content = chunk.content.toLowerCase();
    const contentVariants = [content, cyrToLat(content), cyrToLat(content).replace(/e/g, "o")];
    let score = 0;
    for (const term of terms) {
      if (contentVariants.some((c) => c.includes(term))) score += 3;
      const kw = (chunk.keywords || "").toLowerCase();
      const kwVariants = [kw, cyrToLat(kw), cyrToLat(kw).replace(/e/g, "o")];
      if (kwVariants.some((k) => k.includes(term))) score += 2;
    }
    return { chunk, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((x) => x.chunk);
}

export function getTextbookIndex(teacherId, textbookId) {
  const lessons = db.prepare(`SELECT * FROM lessons WHERE textbook_id = ? AND teacher_id = ?`).all(textbookId, teacherId);
  const index = { dates: new Set(), people: new Set(), events: new Set(), places: new Set(), terms: new Set() };
  for (const l of lessons) {
    for (const [key, field] of [["dates", "dates"], ["people", "people"], ["events", "events"], ["places", "places"], ["terms", "terms"]]) {
      (l[field] || "").split(/[,;|]/).map((s) => s.trim()).filter(Boolean).forEach((v) => index[key].add(v));
    }
  }
  return {
    dates: [...index.dates],
    people: [...index.people],
    events: [...index.events],
    places: [...index.places],
    terms: [...index.terms],
  };
}

export async function structureTextbook(teacherId, textbookId, text, { localOnly = false } = {}) {
  if (aiEnabled && !localOnly) {
    try {
      const parsed = await generateJson(
        teacherId,
        [
          {
            role: "system",
            content: "Sen darslik matnini tahlil qilib, bob va mavzularga ajratuvchi AI yordamchisan. O'zbek tilida ishlaysan. Faqat matnda bor ma'lumotlarni oling.",
          },
          {
            role: "user",
            content: `Quyidagi darslik matnini tahlil qiling:\n\n${text.slice(0, 12000)}\n\nJSON formati:\n{\n  "chapters": [{"chapter_no": 1, "title": "...", "summary": "..."}],\n  "lessons": [{"chapter_no": 1, "lesson_no": 1, "title": "...", "summary": "..."}]\n}`,
          },
        ],
        { task: "textbook-structure", complexity: "auto", temperature: 0.2, maxTokens: 2500 }
      );
      return parsed;
    } catch {
      // fallthrough
    }
  }
  return structureTextbookLocal(text);
}

function structureTextbookLocal(text) {
  const lines = text.split("\n");
  const chapters = [];
  const lessons = [];
  const lessonMeta = [];
  let chapterNo = 0;
  let lessonNo = 0;
  const chapterPattern = /^(bob|chapter|qism)\s+(\d+)[.\s-]*([\w'’\- ]+)?/i;
  const lessonPattern = /^(\d{1,2})[.)\s-]+mavzu[.\s-]+([\w'’\- ]{3,})|^(\d{1,2})[.)\s-]+([\w'’\- ]{3,})/;

  const lineBuckets = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const ch = line.match(chapterPattern);
    if (ch) {
      chapterNo = Number(ch[2]);
      chapters.push({ chapter_no: chapterNo, title: ch[3] || `Bob ${chapterNo}`, summary: "" });
      lessonNo = 0;
      continue;
    }
    const ls = line.match(lessonPattern);
    if (ls && lessonNo < 500) {
      lessonNo++;
      const title = (ls[2] || ls[4] || "").trim();
      if (title.toLowerCase().includes("test")) continue;
      lessons.push({ chapter_no: chapterNo || 1, lesson_no: lessonNo, title, summary: "" });
      lessonMeta.push({ lines: [] });
      continue;
    }
    if (lessonMeta.length) lessonMeta[lessonMeta.length - 1].lines.push(line);
  }

  lessons.forEach((l, i) => {
    const content = (lessonMeta[i]?.lines || []).slice(0, 10).join(" ");
    l.summary = content.slice(0, 300);
    const idx = extractHistoryEntities(content);
    l.dates = idx.dates.join(", ");
    l.people = idx.people.slice(0, 8).join(", ");
    l.places = idx.places.slice(0, 8).join(", ");
    l.terms = idx.terms.slice(0, 8).join(", ");
    l.keywords = [...l.title.split(/\s+/), ...idx.people.slice(0, 3)].join(", ");
  });

  if (chapters.length === 0) chapters.push({ chapter_no: 1, title: "1-bob", summary: "" });
  if (lessons.length === 0) {
    const chunks = chunkText(text, { chunkSize: 600 });
    chunks.forEach((c, i) => lessons.push({ chapter_no: 1, lesson_no: i + 1, title: `Mavzu ${i + 1}`, summary: c.slice(0, 100) }));
  }
  return { chapters, lessons };
}

const KNOWN_PLACES = [
  "Samarqand", "Buxoro", "Xiva", "Toshkent", "Hirot", "Shahrisabz", "Xo'ja-Ilgar", "Movarounnahr",
  "O'zbekiston", "Turkiston", "Amudaryo", "Sirdaryo", "Zarafshon", "Farg'ona", "Qashqadaryo"
];

export function extractHistoryEntities(text) {
  const dates = new Set();
  const yearMatches = text.match(/\b(1[0-9]{3}|20[0-9]{2})\b/g) || [];
  const dayMonth = text.match(/\b\d{1,2}-(yanvar|fevral|mart|aprel|may|iyun|iyul|avgust|sentyabr|oktyabr|noyabr|dekabr)\b/gi) || [];
  yearMatches.forEach((y) => dates.add(Number(y)));
  const sortedYears = [...dates].filter((d) => typeof d === "number").sort((a, b) => a - b).map(String);
  const dayMonthSet = [...new Set(dayMonth)];

  const places = new Set();
  KNOWN_PLACES.forEach((p) => {
    if (text.toLowerCase().includes(p.toLowerCase())) places.add(p);
  });

  const people = new Set();
  const personHint = /\b(Amir Temur|Mirzo Ulug'|Shaybonixon|Babur|Alisher Navoiy|Zahiriddin|Behbudiy|Fitrat|Avloniy|Qodiriy|Cho'lpon)\s?[A-Za-z'’\-]*/g;
  let m;
  while ((m = personHint.exec(text)) !== null) {
    const name = m[0].replace(/['‘’]+$/, "").trim();
    if (name && !places.has(name)) people.add(name);
  }
  const properNames = text.match(/\b[A-Z][a-z'’]{2,}(?:\s+[A-Z][a-z'’]{2,}){0,2}\b/g) || [];
  properNames
    .map((n) => n.trim())
    .filter((n) => {
      const first = n.split(/\s+/)[0];
      return !["Bob", "Mavzu", "Qism", "Sahifa", "Dars"].some((w) => n.startsWith(w)) && ![...places].some((p) => n === p || n.startsWith(p) || p.startsWith(n));
    })
    .slice(0, 6)
    .forEach((n) => people.add(n));

  const termSet = new Set();
  let tm;
  const parenTerm = /\(([^()]{3,60})\)/g;
  while ((tm = parenTerm.exec(text)) !== null) termSet.add(tm[1].trim());
  const namedTerm = /\b[a-z'’]+\s?[a-z'’]*\s+(davlati|amirligi|imperiyasi|saltanati|harakati|sulolasi|davri)\b/gi;
  while ((tm = namedTerm.exec(text)) !== null) termSet.add(tm[0].trim());

  const events = new Set();
  const eventVerbs = /(vafot etdi|tug'(il|di)|e'lon qilindi|qurildi|qurilgan|asos solingan|asos solingan|kengaytirildi|boshqargan|hukmronlik qilgan|rivojlangan)/gi;
  let em;
  while ((em = eventVerbs.exec(text)) !== null) {
    const context = text.slice(Math.max(0, em.index - 60), em.index + em[0].length + 40).trim();
    events.add(context.replace(/\s+/g, " ").slice(0, 140));
  }

  return {
    dates: [...sortedYears, ...dayMonthSet],
    people: [...people],
    places: [...places],
    terms: [...termSet].slice(0, 8),
    events: [...events].slice(0, 6),
  };
}
