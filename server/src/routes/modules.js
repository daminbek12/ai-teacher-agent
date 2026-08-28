import express from "express";
import fs from "node:fs";
import path from "node:path";
import db from "../db/index.js";
import { authRequired } from "./authMiddleware.js";
import {
  createTextbook, addTextbookVersion, activateTextbookVersion, listTextbooks, getTextbook,
  structureTextbook, indexTextbookContent, chunkText, searchKnowledgeBase, getTextbookIndex,
} from "../services/textbook.js";
import { extractPdfText, extractDocxText, ocrImage, classifyImage, parseTimetable } from "../services/ocr.js";
import { isValidUpload, guessMime, storeUploadedFile, extractZip } from "../services/files.js";
import { runTestQc, regenerateWeakQuestions } from "../services/qc.js";
import { generateAnnualPlan, markLessonMissed, addHoliday, seedDefaultHolidays, isHolidayOrDayOff, getTestSchedulePrep } from "../services/planner.js";
import { createFullTest, prepareScheduledTest } from "../services/testGenerator.js";
import { getAuditLog } from "../services/audit.js";
import { logAudit } from "../services/audit.js";

const router = express.Router();
router.use(authRequired);

// ---------- TEXTBOOKS ----------
router.get("/textbooks", (req, res) => {
  res.json(listTextbooks(req.user.id));
});

router.get("/textbooks/:id", (req, res) => {
  const tb = getTextbook(req.user.id, req.params.id);
  if (!tb) return res.status(404).json({ error: "Darslik topilmadi" });
  res.json(tb);
});

router.post("/textbooks", (req, res) => {
  try {
    const tb = createTextbook(req.user.id, req.body);
    if (req.body.version || req.body.edition_year) {
      addTextbookVersion(req.user.id, tb.id, {
        version: req.body.version || `v${req.body.edition_year || "1"}`,
        edition_year: req.body.edition_year || "",
        source: req.body.source || "",
        isActive: true,
      });
    }
    res.json(getTextbook(req.user.id, tb.id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/textbooks/:id/versions", (req, res) => {
  try {
    const v = addTextbookVersion(req.user.id, req.params.id, req.body);
    res.json(v);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/textbooks/:id/versions/:versionId/activate", (req, res) => {
  try {
    const v = activateTextbookVersion(req.user.id, req.params.id, req.params.versionId);
    res.json(v);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

const UPLOAD_CHUNK_DIR = process.env.UPLOAD_CHUNK_DIR || "/tmp/teacher_upload_chunks";

function extractJsonTextbookContent(buffer) {
  const data = JSON.parse(buffer.toString("utf8"));
  if (typeof data === "string") return data;
  const parts = [];
  if (data.content) parts.push(data.content);
  for (const l of data.lessons || data.darslar || []) {
    if (l.title) parts.push(`\n${l.lesson_no ?? ""}-dars. ${l.title}`);
    if (l.summary) parts.push(l.summary);
    if (l.keywords) parts.push(l.keywords);
    if (l.content) parts.push(l.content);
  }
  return parts.join("\n");
}

function getChunkDir(uploadId) {
  return path.join(UPLOAD_CHUNK_DIR, String(uploadId));
}

async function processUploadedBuffer(teacherId, { buffer, file_name, subject, grade, title, edition_year = "", version = "", localOnly = false }) {
  const mime = guessMime(file_name);
  const check = isValidUpload(mime, buffer.length);
  if (!check.ok) return { error: check.error };

  const stored = storeUploadedFile(teacherId, { buffer, originalName: file_name, mime, category: "textbook" });
  const info = db
    .prepare(`INSERT INTO uploaded_files (teacher_id, original_name, stored_name, mime_type, size, category, status, file_path) VALUES (?, ?, ?, ?, ?, 'textbook', 'uploaded', ?)`)
    .run(teacherId, file_name, stored.storedName, mime, buffer.length, stored.filePath);
  const fileId = info.lastInsertRowid;

  let pages = 0;
  let fullText = "";
  let ocrConfidence = null;

  if (mime === "application/pdf") {
    const r = await extractPdfText(buffer);
    fullText = r.text;
    pages = r.pages;
  } else if (mime.includes("wordprocessingml")) {
    const r = extractDocxText(buffer);
    fullText = r.text;
  } else if (mime.startsWith("image/")) {
    try {
      const { text, confidence } = await ocrImage(buffer);
      fullText = text;
      ocrConfidence = confidence ?? null;
    } catch (e) {
      ocrConfidence = null;
    }
  } else if (mime === "text/plain") {
    fullText = buffer.toString("utf8");
  } else if (mime === "application/json") {
    fullText = extractJsonTextbookContent(buffer);
  } else if (mime === "application/zip") {
    const result = extractZip(buffer);
    if (!result.ok) {
      db.prepare(`UPDATE uploaded_files SET status = 'rejected' WHERE id = ?`).run(fileId);
      return { error: result.error };
    }
    for (const f of result.files) {
      if (f.mime === "application/pdf" && !fullText) {
        const r = await extractPdfText(f.buffer);
        fullText = r.text;
        pages += r.pages;
      } else if (f.mime.includes("wordprocessingml") && !fullText) {
        fullText = extractDocxText(f.buffer).text;
      } else if (f.mime.startsWith("image/")) {
        pages++;
      }
    }
  }

  const tb = createTextbook(teacherId, { subject, grade, title, edition_year, pages, status: "pending_review" });
  const v = addTextbookVersion(teacherId, tb.id, {
    version: version || `v${edition_year || "1"}`,
    edition_year,
    source: "manual_upload",
    fileId,
    isActive: true,
  });
  db.prepare(`UPDATE uploaded_files SET status = 'processed' WHERE id = ?`).run(fileId);
  db.prepare(`INSERT INTO ocr_results (teacher_id, file_id, kind, raw_text, confidence, status) VALUES (?, ?, 'textbook', ?, ?, 'done')`)
    .run(teacherId, fileId, fullText.slice(0, 200000), ocrConfidence);

  return {
    textbook_id: tb.id,
    version: v,
    extracted_chars: fullText.length,
    pages,
    needs_structure: true,
    message: "Darslik yuklandi. Endi /textbooks/:id/structure orqali bob/mavzularga ajrating.",
  };
}

// Upload file (teacher manual upload): PDF, DOCX, ZIP, image, txt
router.post("/textbooks/upload", async (req, res) => {
  const { file_base64, file_name, subject, grade, title, edition_year = "", version = "", localOnly = false } = req.body;
  if (!file_base64 || !file_name) return res.status(400).json({ error: "file_base64 va file_name talab qilinadi" });
  if (!subject || !grade || !title) return res.status(400).json({ error: "subject, grade, title talab qilinadi" });

  const buffer = Buffer.from(file_base64, "base64");
  const mime = guessMime(file_name);
  const check = isValidUpload(mime, buffer.length);
  if (!check.ok) return res.status(400).json({ error: check.error });

  const result = await processUploadedBuffer(req.user.id, { buffer, file_name, subject, grade, title, edition_year, version, localOnly });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

// Chunked upload: client splits large file into chunks to bypass proxy body limits
router.post("/textbooks/upload-chunk", async (req, res) => {
  const { upload_id, chunk_index, total_chunks, chunk_base64, file_name, subject, grade, title, edition_year = "" } = req.body;
  if (chunk_index === undefined || total_chunks === undefined || !chunk_base64) {
    return res.status(400).json({ error: "upload_id, chunk_index, total_chunks, chunk_base64 talab qilinadi" });
  }

  const chunkDir = getChunkDir(upload_id);
  fs.mkdirSync(chunkDir, { recursive: true });
  const chunkPath = path.join(chunkDir, `${chunk_index}.bin`);
  fs.writeFileSync(chunkPath, Buffer.from(chunk_base64, "base64"));

  const received = fs.readdirSync(chunkDir).filter((f) => f.endsWith(".bin")).length;
  if (received < total_chunks) {
    return res.json({ done: false, received, total_chunks });
  }

  const parts = [];
  for (let i = 0; i < total_chunks; i++) {
    const p = path.join(chunkDir, `${i}.bin`);
    if (!fs.existsSync(p)) {
      return res.status(400).json({ error: `Chunk ${i} topilmadi` });
    }
    parts.push(fs.readFileSync(p));
  }
  const buffer = Buffer.concat(parts);
  fs.rmSync(chunkDir, { recursive: true, force: true });

  if (!file_name || !subject || !grade || !title) {
    return res.status(400).json({ error: "file_name, subject, grade, title talab qilinadi" });
  }

  const result = await processUploadedBuffer(req.user.id, { buffer, file_name, subject, grade, title, edition_year });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ done: true, ...result });
});

// Structure and index textbook content
router.post("/textbooks/:id/structure", async (req, res) => {
  try {
    const teacherId = req.user.id;
    const tb = db.prepare(`SELECT * FROM textbooks WHERE id = ? AND teacher_id = ?`).get(req.params.id, teacherId);
    if (!tb) return res.status(404).json({ error: "Darslik topilmadi" });

    const { text, local_only = false, chapters, lessons } = req.body;
    let structure = null;
    let sourceText = text;

    if (!sourceText && !chapters) {
      const ocr = db
        .prepare(`SELECT raw_text FROM ocr_results o JOIN uploaded_files f ON f.id = o.file_id WHERE f.teacher_id = ? AND o.kind = 'textbook' ORDER BY o.id DESC LIMIT 1`)
        .get(teacherId);
      sourceText = ocr ? ocr.raw_text : "";
    }

    if (chapters || lessons) {
      structure = { chapters: chapters || [], lessons: lessons || [] };
    } else {
      if (!sourceText) return res.status(400).json({ error: "Matn topilmadi" });
      structure = await structureTextbook(teacherId, Number(req.params.id), sourceText, { localOnly: local_only });
    }

    const chunks = chunkText(sourceText || structure.lessons.map((l) => l.summary).join("\n"));
    const result = indexTextbookContent(teacherId, Number(req.params.id), {
      chapters: structure.chapters || [],
      lessons: structure.lessons || [],
      chunks,
    });
    logAudit(teacherId, { action: "textbook.structure", entityType: "textbook", entityId: tb.id, detail: result });
    res.json({ ...result, textbook_id: tb.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/textbooks/:id/file", (req, res) => {
  const tb = db.prepare(`SELECT * FROM textbooks WHERE id = ? AND teacher_id = ?`).get(req.params.id, req.user.id);
  if (!tb) return res.status(404).json({ error: "Darslik topilmadi" });
  const version = db
    .prepare(`SELECT v.*, f.file_path, f.original_name, f.mime_type FROM textbook_versions v LEFT JOIN uploaded_files f ON f.id = v.file_id WHERE v.teacher_id = ? AND v.textbook_id = ? ORDER BY v.is_active DESC, v.id DESC LIMIT 1`)
    .get(req.user.id, req.params.id);
  if (!version?.file_path || !fs.existsSync(version.file_path)) {
    return res.status(404).json({ error: "Bu darslik uchun PDF fayl topilmadi" });
  }
  const fileName = version.original_name || `darslik_${tb.id}.pdf`;
  res.setHeader("Content-Type", version.mime_type || "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  fs.createReadStream(version.file_path).pipe(res);
});

router.get("/textbooks/:id/index", (req, res) => {
  res.json(getTextbookIndex(req.user.id, req.params.id));
});

router.get("/textbooks/search/kb", (req, res) => {
  const { q, textbook_id, subject, grade } = req.query;
  if (!q) return res.status(400).json({ error: "q (so'rov) talab qilinadi" });
  const results = searchKnowledgeBase(req.user.id, q, {
    textbookId: textbook_id ? Number(textbook_id) : null,
    subject,
    grade,
    limit: 6,
  });
  res.json(results);
});

// ---------- OCR endpoints ----------
router.post("/ocr/image", (req, res) => {
  const { file_base64, kind } = req.body;
  if (!file_base64) return res.status(400).json({ error: "file_base64 talab qilinadi" });
  const buffer = Buffer.from(file_base64, "base64");
  db.prepare(`INSERT INTO uploaded_files (teacher_id, original_name, stored_name, mime_type, size, category, status, file_path) VALUES (?, 'image', '', 'image/jpeg', ?, 'image', 'uploaded', '')`)
    .run(req.user.id, buffer.length);
  ocrImage(buffer).then(({ text, confidence }) => {
    const detectedKind = kind || classifyImage(text);
    db.prepare(`INSERT INTO ocr_results (teacher_id, file_id, kind, raw_text, confidence, status) VALUES (?, ?, ?, ?, ?, 'done')`)
      .run(req.user.id, null, detectedKind, text.slice(0, 200000), confidence);
    res.json({ text: text.slice(0, 50000), confidence, kind: detectedKind });
  }).catch((e) => res.status(500).json({ error: e.message }));
});

router.post("/ocr/timetable", async (req, res) => {
  try {
    const { text, local_only = false } = req.body;
    if (!text) return res.status(400).json({ error: "text talab qilinadi" });
    const parsed = await parseTimetable(req.user.id, text, { localOnly: local_only });
    res.json(parsed);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- QC ----------
router.post("/tests/:id/qc", async (req, res) => {
  try {
    const qc = await runTestQc(req.user.id, req.params.id, {
      minScore: req.body.min_score ?? 85,
      withAI: !!req.body.with_ai,
    });
    res.json(qc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/tests/:id/qc", (req, res) => {
  const reviews = db
    .prepare(`SELECT * FROM question_reviews WHERE question_id IN (SELECT id FROM questions WHERE test_id = ?) ORDER BY id DESC`)
    .all(req.params.id);
  res.json(reviews.map((r) => ({ ...r, issues: JSON.parse(r.issues_json) })));
});

router.post("/tests/:id/regenerate-weak", async (req, res) => {
  try {
    const weak = regenerateWeakQuestions(req.user.id, req.params.id);
    if (!weak.length) return res.json({ regenerated: 0, message: "Zaif savollar topilmadi" });
    for (const w of weak) {
      const newQuestions = await import("../services/testGenerator.js").then(({ generateTestQuestions }) =>
        generateTestQuestions(req.user.id, {
          topic: w.topic || "",
          subject: "Tarix",
          classLevel: "7",
          count: 1,
          difficulties: w.difficulty === "hard" ? { easy: 0, medium: 0, hard: 100 } : w.difficulty === "easy" ? { easy: 100, medium: 0, hard: 0 } : { easy: 0, medium: 100, hard: 0 },
        })
      );
      if (newQuestions.length) {
        const q = newQuestions[0];
        db.prepare(`UPDATE questions SET question_text = ?, options_json = ?, correct_answer = ?, difficulty = ? WHERE id = ?`)
          .run(q.question_text, JSON.stringify(q.options), q.correct_answer, q.difficulty, w.question_id);
      }
    }
    const qc = await runTestQc(req.user.id, req.params.id, { minScore: req.body.min_score ?? 85 });
    logAudit(req.user.id, { action: "test.regen-weak", entityType: "test", entityId: req.params.id, detail: { count: weak.length, newScore: qc.score } });
    res.json({ regenerated: weak.length, qc });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- PLANNER ----------
router.post("/plan/annual", (req, res) => {
  try {
    const result = generateAnnualPlan(req.user.id, {
      classId: req.body.class_id,
      academicStart: req.body.start || "2026-09-01",
      academicEnd: req.body.end || "2027-05-31",
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/plan/lesson-missed", (req, res) => {
  try {
    const result = markLessonMissed(req.user.id, req.body);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/holidays", (req, res) => {
  const h = addHoliday(req.user.id, req.body);
  res.json(h);
});

router.post("/holidays/seed", (req, res) => {
  const year = req.body.year || new Date().getFullYear();
  const count = seedDefaultHolidays(req.user.id, year);
  res.json({ seeded: count, year });
});

router.get("/holidays", (req, res) => {
  res.json(db.prepare(`SELECT * FROM holidays WHERE teacher_id = ? ORDER BY date`).all(req.user.id));
});

router.get("/planner/check-date/:date", (req, res) => {
  res.json(isHolidayOrDayOff(req.user.id, req.params.date));
});

// Scheduled preparations
router.get("/test-preparations", (req, res) => {
  res.json(getTestSchedulePrep(req.user.id));
});

router.post("/tests/schedule", async (req, res) => {
  try {
    const { send_at, ...data } = req.body;
    const test = await prepareScheduledTest(req.user.id, data, { sendAt: send_at || null });
    res.json(test);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- AUDIT ----------
router.get("/audit", (req, res) => {
  res.json(getAuditLog(req.user.id, { limit: req.query.limit ? Number(req.query.limit) : 50 }));
});

export default router;
