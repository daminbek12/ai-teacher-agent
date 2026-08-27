import express from "express";
import db from "../db/index.js";
import { authRequired, adminRequired } from "./authMiddleware.js";
import { getUsageStats } from "../services/ai.js";

const router = express.Router();
router.use(authRequired, adminRequired);

router.get("/stats", (req, res) => {
  const teachers = db.prepare(`SELECT COUNT(*) AS c FROM teachers`).get().c;
  const classes = db.prepare(`SELECT COUNT(*) AS c FROM classes`).get().c;
  const students = db.prepare(`SELECT COUNT(*) AS c FROM students`).get().c;
  const tests = db.prepare(`SELECT COUNT(*) AS c FROM tests`).get().c;
  const results = db.prepare(`SELECT COUNT(*) AS c FROM test_results`).get().c;
  const aiCost = db.prepare(`SELECT COALESCE(SUM(cost), 0) AS c FROM ai_costs`).get().c;
  res.json({ teachers, classes, students, tests, results, aiCost });
});

router.get("/teachers", (req, res) => {
  const rows = db.prepare(`SELECT id, name, school_name, subject, role, created_at FROM teachers`).all();
  res.json(rows);
});

router.post("/teachers/:id/role", (req, res) => {
  const { role } = req.body;
  if (!["teacher", "admin"].includes(role)) return res.status(400).json({ error: "Noto'g'ri rol" });
  db.prepare(`UPDATE teachers SET role = ? WHERE id = ?`).run(role, req.params.id);
  res.json({ ok: true });
});

router.get("/ai-usage/:teacherId", (req, res) => {
  res.json(getUsageStats(req.params.teacherId, { period: req.query.period || "all" }));
});

router.get("/activity", (req, res) => {
  const rows = db
    .prepare(
      `SELECT 'test' AS type, t.title AS label, t.created_at AS date FROM tests t
       UNION ALL SELECT 'result', s.first_name || ' ' || s.last_name, r.created_at FROM test_results r JOIN students s ON s.id = r.student_id
       ORDER BY date DESC LIMIT 20`
    )
    .all();
  res.json(rows);
});

export default router;
