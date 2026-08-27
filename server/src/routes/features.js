import express from "express";
import db from "../db/index.js";
import { authRequired } from "./authMiddleware.js";
import { generateLessonPlan, generateHomework, generateConspectus } from "../services/lessonService.js";
import { weeklyReport, monthlyReport, developmentReport, generateReportSummary } from "../services/reportService.js";
import { generateReportDocx, generatePlanDocx } from "../services/docxGenerator.js";
import { generateReportPdf } from "../services/pdfGenerator.js";
import { prepareMorningBriefing } from "../services/scheduler.js";
import { getUsageStats } from "../services/ai.js";

const router = express.Router();
router.use(authRequired);

// ---------- HOMEWORK ----------
router.get("/homework", (req, res) => {
  const { class_id } = req.query;
  const sql = class_id
    ? `SELECT h.*, c.name AS class_name FROM homework h JOIN classes c ON c.id = h.class_id WHERE h.teacher_id = ? AND h.class_id = ? ORDER BY h.id DESC`
    : `SELECT h.*, c.name AS class_name FROM homework h JOIN classes c ON c.id = h.class_id WHERE h.teacher_id = ? ORDER BY h.id DESC`;
  const params = class_id ? [req.user.id, class_id] : [req.user.id];
  res.json(db.prepare(sql).all(...params));
});

router.post("/homework/generate", async (req, res) => {
  try {
    const content = await generateHomework(req.user.id, {
      classId: req.body.class_id,
      topic: req.body.topic,
      studentLevel: req.body.student_level || "o'rta",
      localOnly: req.body.local_only || false,
    });
    res.json({ content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/homework", (req, res) => {
  const { class_id, topic = "", content } = req.body;
  if (!class_id || !content) return res.status(400).json({ error: "Sinf va mazmun talab qilinadi" });
  const info = db
    .prepare(`INSERT INTO homework (teacher_id, class_id, topic, content, due_date, status) VALUES (?, ?, ?, ?, date('now', '+7 days'), 'active')`)
    .run(req.user.id, class_id, topic, content);
  res.json(db.prepare(`SELECT * FROM homework WHERE id = ?`).get(info.lastInsertRowid));
});

router.delete("/homework/:id", (req, res) => {
  db.prepare(`DELETE FROM homework WHERE id = ? AND teacher_id = ?`).run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ---------- LESSON PLANS ----------
router.get("/lesson-plans", (req, res) => {
  const rows = db.prepare(`SELECT * FROM lesson_plans WHERE teacher_id = ? ORDER BY id DESC`).all(req.user.id);
  res.json(rows.map((r) => ({ ...r, plan: JSON.parse(r.plan_json) })));
});

router.post("/lesson-plans/generate", async (req, res) => {
  try {
    const plan = await generateLessonPlan(req.user.id, {
      classId: req.body.class_id,
      topic: req.body.topic,
      subject: req.body.subject || "Tarix",
      classLevel: req.body.class_level || "7",
      localOnly: req.body.local_only || false,
    });
    res.json({ plan });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/conspectus/generate", async (req, res) => {
  try {
    const conspectus = await generateConspectus(req.user.id, { ...req.body, localOnly: req.body.local_only || false });
    res.json({ conspectus });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/lesson-plans/:id/docx", async (req, res) => {
  const plan = db.prepare(`SELECT * FROM lesson_plans WHERE id = ? AND teacher_id = ?`).get(req.params.id, req.user.id);
  if (!plan) return res.status(404).json({ error: "Dars rejasi topilmadi" });
  const parsed = JSON.parse(plan.plan_json);
  const fields = [
    { label: "Dars maqsadi", value: parsed.maqsad || "" },
    { label: "Kutilayotgan natija", value: parsed.kutilayotgan_natija || "" },
    { label: "Kirish qismi", value: parsed.kirish_qismi || "" },
  ];
  if (Array.isArray(parsed.asosiy_tushunchalar)) fields.push({ label: "Asosiy tushunchalar", value: parsed.asosiy_tushunchalar.join("\n") });
  if (Array.isArray(parsed.tarixiy_faktlar)) fields.push({ label: "Tarixiy faktlar", value: parsed.tarixiy_faktlar.join("\n") });
  if (Array.isArray(parsed.mustahkamlash)) fields.push({ label: "Mustahkamlash", value: parsed.mustahkamlash.join("\n") });
  if (Array.isArray(parsed.uy_vazifasi)) fields.push({ label: "Uy vazifasi", value: parsed.uy_vazifasi.join("\n") });
  const buffer = await generatePlanDocx({ title: `DARS REJASI: ${plan.topic}`, fields });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="dars-rejasi-${encodeURIComponent(plan.topic)}.docx"`);
  res.send(buffer);
});

// ---------- REPORTS ----------
router.get("/reports/weekly", (req, res) => {
  const classId = req.query.class_id;
  if (!classId) return res.status(400).json({ error: "class_id talab qilinadi" });
  res.json(weeklyReport(req.user.id, classId));
});

router.get("/reports/monthly", (req, res) => {
  const classId = req.query.class_id;
  if (!classId) return res.status(400).json({ error: "class_id talab qilinadi" });
  res.json(monthlyReport(req.user.id, classId));
});

router.get("/reports/development/:studentId", (req, res) => {
  res.json(developmentReport(req.params.studentId));
});

router.get("/reports/summary", async (req, res) => {
  const classId = req.query.class_id;
  const type = req.query.type || "weekly";
  const report = type === "monthly" ? monthlyReport(req.user.id, classId) : weeklyReport(req.user.id, classId);
  const summary = await generateReportSummary(req.user.id, report, type);
  res.json({ report, summary });
});

router.get("/reports/weekly/docx", async (req, res) => {
  const classId = req.query.class_id;
  const report = weeklyReport(req.user.id, classId);
  const doc = generateReportDocx({
    title: "HAFTALIK HISOBOT",
    sections: [
      { heading: "Sinf", body: report.className },
      { heading: "Testlar soni", body: String(report.testsTaken) },
      { heading: "O'rtacha natija", body: report.average != null ? `${report.average}%` : "-" },
      { heading: "Eng yaxshi o'quvchilar", items: (report.best || []).map((s) => `${s.name} — ${s.avg}%`) },
      { heading: "Yordam kerak bo'lgan o'quvchilar", items: (report.needsHelp || []).map((s) => `${s.name} — ${s.avg}%`) },
      report.worstTopic ? { heading: "Eng ko'p xato mavzu", body: `${report.worstTopic.topic} (${report.worstTopic.mistakes} xato)` } : null,
    ].filter(Boolean),
  });
  const buffer = await import("docx").then(({ Packer }) => Packer.toBuffer(doc));
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", "attachment; filename=haftalik-hisobot.docx");
  res.send(buffer);
});

router.get("/reports/weekly/pdf", async (req, res) => {
  const classId = req.query.class_id;
  const report = weeklyReport(req.user.id, classId);
  const buffer = await generateReportPdf({
    title: "HAFTALIK HISOBOT",
    sections: [
      { heading: "Sinf", body: report.className },
      { heading: "Testlar soni", body: String(report.testsTaken) },
      { heading: "O'rtacha natija", body: report.average != null ? `${report.average}%` : "-" },
      { heading: "Eng yaxshi o'quvchilar", items: (report.best || []).map((s) => `${s.name} — ${s.avg}%`) },
      { heading: "Yordam kerak bo'lgan o'quvchilar", items: (report.needsHelp || []).map((s) => `${s.name} — ${s.avg}%`) },
      report.worstTopic ? { heading: "Eng ko'p xato mavzu", body: `${report.worstTopic.topic} (${report.worstTopic.mistakes} xato)` } : null,
    ].filter(Boolean),
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=haftalik-hisobot.pdf");
  res.send(buffer);
});

// ---------- BRIEFING ----------
router.post("/briefing", async (req, res) => {
  try {
    const result = await prepareMorningBriefing(req.user.id);
    res.json(result || { message: "Bugungi darslar jadvalda yo'q" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- AI USAGE ----------
router.get("/ai-usage", (req, res) => {
  res.json(getUsageStats(req.user.id, { period: req.query.period || "all" }));
});

// ---------- REMINDERS ----------
router.get("/reminders", (req, res) => {
  res.json(db.prepare(`SELECT * FROM reminders WHERE teacher_id = ? ORDER BY id DESC LIMIT 50`).all(req.user.id));
});

export default router;
