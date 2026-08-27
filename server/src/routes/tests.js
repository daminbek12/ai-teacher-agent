import express from "express";
import db from "../db/index.js";
import { authRequired } from "./authMiddleware.js";
import {
  createFullTest,
  createTestRecord,
  generateTestQuestions,
  saveQuestions,
  saveResult,
  createVariants,
  adaptiveDifficulty,
  analyzeStudentWeaknesses,
} from "../services/testGenerator.js";
import { generateTestDocx } from "../services/docxGenerator.js";
import { generateTestPdf } from "../services/pdfGenerator.js";
import { sendTest } from "../services/telegram.js";

const router = express.Router();
router.use(authRequired);

function enrichQuestions(questions) {
  return questions.map((q) => ({ ...q, options: JSON.parse(q.options_json) }));
}

// ---------- RESULTS (before /:id routes) ----------
router.get("/results", (req, res) => {
  const { class_id } = req.query;
  const sql = class_id
    ? `SELECT r.*, s.first_name, s.last_name, t.title, t.class_id
       FROM test_results r
       JOIN students s ON s.id = r.student_id
       JOIN tests t ON t.id = r.test_id
       WHERE r.teacher_id = ? AND t.class_id = ?
       ORDER BY r.created_at DESC`
    : `SELECT r.*, s.first_name, s.last_name, t.title, t.class_id
       FROM test_results r
       JOIN students s ON s.id = r.student_id
       JOIN tests t ON t.id = r.test_id
       WHERE r.teacher_id = ?
       ORDER BY r.created_at DESC`;
  const params = class_id ? [req.user.id, class_id] : [req.user.id];
  res.json(db.prepare(sql).all(...params));
});

router.get("/results/weak/:studentId", (req, res) => {
  res.json(analyzeStudentWeaknesses(req.params.studentId));
});

router.get("/results/adaptive/:studentId", (req, res) => {
  const analysis = analyzeStudentWeaknesses(req.params.studentId);
  res.json({ ...adaptiveDifficulty(analysis.recentPercent || 50), analysis });
});

router.get("/", (req, res) => {
  const { class_id } = req.query;
  const sql = class_id
    ? `SELECT t.*, c.name AS class_name FROM tests t JOIN classes c ON c.id = t.class_id WHERE t.teacher_id = ? AND t.class_id = ? ORDER BY t.id DESC`
    : `SELECT t.*, c.name AS class_name FROM tests t JOIN classes c ON c.id = t.class_id WHERE t.teacher_id = ? ORDER BY t.id DESC`;
  const params = class_id ? [req.user.id, class_id] : [req.user.id];
  res.json(db.prepare(sql).all(...params));
});

router.get("/:id", (req, res) => {
  const test = db.prepare(`SELECT * FROM tests WHERE id = ? AND teacher_id = ?`).get(req.params.id, req.user.id);
  if (!test) return res.status(404).json({ error: "Test topilmadi" });
  const questions = enrichQuestions(db.prepare(`SELECT * FROM questions WHERE test_id = ? ORDER BY id`).all(test.id));
  res.json({ ...test, questions });
});

router.post("/", async (req, res) => {
  try {
    const test = await createFullTest(req.user.id, { ...req.body, teacher_id: req.user.id });
    const questions = enrichQuestions(db.prepare(`SELECT * FROM questions WHERE test_id = ? ORDER BY id`).all(test.id));
    res.json({ ...test, questions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/daily", async (req, res) => {
  try {
    const { prepareDailyTest } = await import("../services/scheduler.js");
    const created = await prepareDailyTest(req.user.id);
    if (!created || created.length === 0) {
      return res.json({ tests: [], message: "Bugun uchun kunlik test yaratilmadi (klass yoki mavzu yo'q, yoki allaqachon yaratilgan)" });
    }
    const tests = created.map((t) => ({
      ...t,
      questions: enrichQuestions(db.prepare(`SELECT * FROM questions WHERE test_id = ? ORDER BY id`).all(t.id)),
    }));
    res.json({ tests });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/manual", async (req, res) => {
  try {
    const { class_id, title, topic = "", question_count = 20, duration_minutes = 25, questions = [] } = req.body;
    const test = createTestRecord(req.user.id, { class_id, title, type: "manual", topic, question_count: question_count || questions.length, duration_minutes });
    const saved = saveQuestions(
      req.user.id,
      test.id,
      questions.map((q) => ({
        question_text: q.question_text,
        options: (q.options || []).map((o, i) => ({ letter: String.fromCharCode(65 + i), text: o.text || o })),
        correct_answer: q.correct_answer,
        difficulty: q.difficulty || "medium",
        topic: q.topic || topic,
      }))
    );
    db.prepare(`UPDATE tests SET status = 'ready' WHERE id = ?`).run(test.id);
    res.json({ ...test, questions: enrichQuestions(saved) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/:id/generate-questions", async (req, res) => {
  try {
    const test = db.prepare(`SELECT * FROM tests WHERE id = ? AND teacher_id = ?`).get(req.params.id, req.user.id);
    if (!test) return res.status(404).json({ error: "Test topilmadi" });
    const { question_count = test.question_count, question_types = null, local_only = false } = req.body;
    const questions = await generateTestQuestions(req.user.id, {
      topic: test.topic || test.title,
      subject: test.subject || "Tarix",
      classLevel: "7",
      count: question_count,
      difficulties: { easy: test.difficulty_easy, medium: test.difficulty_medium, hard: test.difficulty_hard },
      questionTypes: question_types,
      localOnly: local_only,
    });
    db.prepare(`DELETE FROM questions WHERE test_id = ?`).run(test.id);
    const saved = saveQuestions(req.user.id, test.id, questions);
    db.prepare(`UPDATE tests SET question_count = ?, status = 'ready' WHERE id = ?`).run(saved.length, test.id);
    res.json({ questions: enrichQuestions(saved) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/:id/variants", (req, res) => {
  const test = db.prepare(`SELECT * FROM tests WHERE id = ? AND teacher_id = ?`).get(req.params.id, req.user.id);
  if (!test) return res.status(404).json({ error: "Test topilmadi" });
  const count = req.body.variant_count || 3;
  const variants = createVariants(req.user.id, test.id, count);
  res.json({ variants });
});

router.get("/:id/docx", async (req, res) => {
  const test = db.prepare(`SELECT * FROM tests WHERE id = ? AND teacher_id = ?`).get(req.params.id, req.user.id);
  if (!test) return res.status(404).json({ error: "Test topilmadi" });
  const questions = enrichQuestions(db.prepare(`SELECT * FROM questions WHERE test_id = ? ORDER BY id`).all(test.id));
  const cls = db.prepare(`SELECT * FROM classes WHERE id = ?`).get(test.class_id);
  const buffer = await generateTestDocx({
    schoolName: req.user.school_name || "",
    subject: cls?.subject || req.user.subject || "Tarix",
    className: cls?.name || "",
    topic: test.topic || test.title,
    teacherName: req.user.name,
    title: test.title,
    questions,
    showAnswers: req.query.answers === "true",
  });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(test.title)}.docx"`);
  res.send(buffer);
});

router.get("/:id/pdf", async (req, res) => {
  const test = db.prepare(`SELECT * FROM tests WHERE id = ? AND teacher_id = ?`).get(req.params.id, req.user.id);
  if (!test) return res.status(404).json({ error: "Test topilmadi" });
  const questions = enrichQuestions(db.prepare(`SELECT * FROM questions WHERE test_id = ? ORDER BY id`).all(test.id));
  const cls = db.prepare(`SELECT * FROM classes WHERE id = ?`).get(test.class_id);
  const buffer = await generateTestPdf({
    schoolName: req.user.school_name || "",
    subject: cls?.subject || req.user.subject || "Tarix",
    className: cls?.name || "",
    topic: test.topic || test.title,
    teacherName: req.user.name,
    title: test.title,
    questions,
    showAnswers: req.query.answers === "true",
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(test.title)}.pdf"`);
  res.send(buffer);
});

router.post("/:id/send-telegram", async (req, res) => {
  const teacher = req.user;
  if (!teacher.phone || !teacher.phone.startsWith("tg:")) {
    return res.status(400).json({ error: "Telegram ulanish topilmadi" });
  }
  const chatId = teacher.phone.slice(3);
  const ok = await sendTest(chatId, req.params.id, { includeAnswers: req.body.include_answers });
  res.json({ ok });
});

router.post("/:id/grade", (req, res) => {
  const test = db.prepare(`SELECT * FROM tests WHERE id = ? AND teacher_id = ?`).get(req.params.id, req.user.id);
  if (!test) return res.status(404).json({ error: "Test topilmadi" });
  const { student_id, answers } = req.body;
  if (!student_id || !answers) return res.status(400).json({ error: "student_id va answers talab qilinadi" });
  const result = saveResult(req.user.id, { testId: test.id, studentId: student_id, answers });
  res.json(result);
});

router.delete("/:id", (req, res) => {
  db.prepare(`DELETE FROM tests WHERE id = ? AND teacher_id = ?`).run(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default router;
