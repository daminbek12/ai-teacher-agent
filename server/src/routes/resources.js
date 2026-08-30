import express from "express";
import db from "../db/index.js";
import { authRequired } from "./authMiddleware.js";
import { scheduleAll } from "../services/scheduler.js";

const router = express.Router();
router.use(authRequired);

// ---------- CLASSES ----------
router.get("/classes", (req, res) => {
  const rows = db.prepare(`SELECT * FROM classes WHERE teacher_id = ? ORDER BY name`).all(req.user.id);
  res.json(rows);
});

router.post("/classes", (req, res) => {
  const { name, subject = "" } = req.body;
  if (!name) return res.status(400).json({ error: "Sinf nomi talab qilinadi" });
  const info = db
    .prepare(`INSERT INTO classes (teacher_id, name, subject) VALUES (?, ?, ?)`)
    .run(req.user.id, name, subject);
  res.json(db.prepare(`SELECT * FROM classes WHERE id = ?`).get(info.lastInsertRowid));
});

router.put("/classes/:id", (req, res) => {
  const cls = db.prepare(`SELECT * FROM classes WHERE id = ? AND teacher_id = ?`).get(req.params.id, req.user.id);
  if (!cls) return res.status(404).json({ error: "Sinf topilmadi" });
  const { name, subject } = req.body;
  db.prepare(`UPDATE classes SET name = COALESCE(?, name), subject = COALESCE(?, subject) WHERE id = ?`).run(
    name ?? null, subject ?? null, req.params.id
  );
  res.json(db.prepare(`SELECT * FROM classes WHERE id = ?`).get(req.params.id));
});

router.delete("/classes/:id", (req, res) => {
  db.prepare(`DELETE FROM classes WHERE id = ? AND teacher_id = ?`).run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ---------- STUDENTS ----------
router.get("/students", (req, res) => {
  const { class_id } = req.query;
  const sql = class_id
    ? `SELECT * FROM students WHERE teacher_id = ? AND class_id = ? ORDER BY first_name`
    : `SELECT s.*, c.name AS class_name FROM students s JOIN classes c ON c.id = s.class_id WHERE s.teacher_id = ? ORDER BY s.first_name`;
  const params = class_id ? [req.user.id, class_id] : [req.user.id];
  res.json(db.prepare(sql).all(...params));
});

router.post("/students", (req, res) => {
  const { class_id, first_name, last_name = "" } = req.body;
  if (!class_id || !first_name) return res.status(400).json({ error: "Sinf va ism talab qilinadi" });
  const cls = db.prepare(`SELECT * FROM classes WHERE id = ? AND teacher_id = ?`).get(class_id, req.user.id);
  if (!cls) return res.status(404).json({ error: "Sinf topilmadi" });
  const info = db
    .prepare(`INSERT INTO students (class_id, teacher_id, first_name, last_name) VALUES (?, ?, ?, ?)`)
    .run(class_id, req.user.id, first_name, last_name);
  db.prepare(`UPDATE classes SET student_count = (SELECT COUNT(*) FROM students WHERE class_id = ?) WHERE id = ?`).run(class_id, class_id);
  res.json(db.prepare(`SELECT * FROM students WHERE id = ?`).get(info.lastInsertRowid));
});

router.put("/students/:id", (req, res) => {
  const st = db.prepare(`SELECT * FROM students WHERE id = ? AND teacher_id = ?`).get(req.params.id, req.user.id);
  if (!st) return res.status(404).json({ error: "O'quvchi topilmadi" });
  const { first_name, last_name, class_id, attendance } = req.body;
  db.prepare(`UPDATE students SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), class_id = COALESCE(?, class_id), attendance = COALESCE(?, attendance) WHERE id = ?`).run(
    first_name ?? null, last_name ?? null, class_id ?? null, attendance ?? null, req.params.id
  );
  res.json(db.prepare(`SELECT * FROM students WHERE id = ?`).get(req.params.id));
});

router.delete("/students/:id", (req, res) => {
  const st = db.prepare(`SELECT * FROM students WHERE id = ? AND teacher_id = ?`).get(req.params.id, req.user.id);
  db.prepare(`DELETE FROM students WHERE id = ? AND teacher_id = ?`).run(req.params.id, req.user.id);
  if (st) {
    db.prepare(`UPDATE classes SET student_count = (SELECT COUNT(*) FROM students WHERE class_id = ?) WHERE id = ?`).run(st.class_id, st.class_id);
  }
  res.json({ ok: true });
});

// ---------- SCHEDULE ----------
router.get("/schedule", (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.*, c.name AS class_name FROM schedule s JOIN classes c ON c.id = s.class_id WHERE s.teacher_id = ? ORDER BY s.day_of_week, s.start_time`
    )
    .all(req.user.id);
  res.json(rows);
});

router.post("/schedule", (req, res) => {
  const { class_id, day_of_week, start_time, subject = "" } = req.body;
  if (!class_id || !day_of_week || !start_time) {
    return res.status(400).json({ error: "Sinf, kun va vaqt talab qilinadi" });
  }
  const cls = db.prepare(`SELECT * FROM classes WHERE id = ? AND teacher_id = ?`).get(class_id, req.user.id);
  if (!cls) return res.status(404).json({ error: "Sinf topilmadi" });
  const info = db
    .prepare(`INSERT INTO schedule (teacher_id, class_id, day_of_week, start_time, subject) VALUES (?, ?, ?, ?, ?)`)
    .run(req.user.id, class_id, day_of_week, start_time, subject || cls.subject);
  res.json(db.prepare(`SELECT * FROM schedule WHERE id = ?`).get(info.lastInsertRowid));
});

router.delete("/schedule/:id", (req, res) => {
  db.prepare(`DELETE FROM schedule WHERE id = ? AND teacher_id = ?`).run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ---------- TOPICS ----------
router.get("/topics", (req, res) => {
  const { class_id, subject } = req.query;
  const sql = class_id
    ? `SELECT * FROM topics WHERE teacher_id = ? AND class_id = ?${subject ? ` AND subject = ?` : ""} ORDER BY subject, order_no`
    : `SELECT t.*, c.name AS class_name FROM topics t JOIN classes c ON c.id = t.class_id WHERE t.teacher_id = ?${subject ? ` AND t.subject = ?` : ""} ORDER BY t.subject, t.order_no`;
  const params = class_id ? [req.user.id, class_id, ...(subject ? [subject] : [])] : [req.user.id, ...(subject ? [subject] : [])];
  res.json(db.prepare(sql).all(...params));
});

router.post("/topics", (req, res) => {
  const { class_id, title, description = "", subject = "", order_no = 0 } = req.body;
  if (!class_id || !title) return res.status(400).json({ error: "Sinf va mavzu talab qilinadi" });
  const cls = db.prepare(`SELECT * FROM classes WHERE id = ? AND teacher_id = ?`).get(class_id, req.user.id);
  if (!cls) return res.status(404).json({ error: "Sinf topilmadi" });
  const info = db
    .prepare(`INSERT INTO topics (teacher_id, class_id, title, description, subject, order_no, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`)
    .run(req.user.id, class_id, title, description, subject, order_no);
  res.json(db.prepare(`SELECT * FROM topics WHERE id = ?`).get(info.lastInsertRowid));
});

router.post("/topics/bulk", (req, res) => {
  const { class_id, titles, subject = "" } = req.body;
  if (!class_id || !Array.isArray(titles)) return res.status(400).json({ error: "class_id va titles talab qilinadi" });
  const cls = db.prepare(`SELECT * FROM classes WHERE id = ? AND teacher_id = ?`).get(class_id, req.user.id);
  if (!cls) return res.status(404).json({ error: "Sinf topilmadi" });
  const insert = db.prepare(`INSERT INTO topics (teacher_id, class_id, title, subject, order_no, status) VALUES (?, ?, ?, ?, ?, 'pending')`);
  const tx = db.transaction((ts) => ts.forEach((t, i) => insert.run(req.user.id, class_id, t, subject, i)));
  tx(titles);
  res.json({ ok: true, count: titles.length });
});

router.put("/topics/:id", (req, res) => {
  const t = db.prepare(`SELECT * FROM topics WHERE id = ? AND teacher_id = ?`).get(req.params.id, req.user.id);
  if (!t) return res.status(404).json({ error: "Mavzu topilmadi" });
  const { title, description, subject, order_no, status } = req.body;
  db.prepare(`UPDATE topics SET title = COALESCE(?, title), description = COALESCE(?, description), subject = COALESCE(?, subject), order_no = COALESCE(?, order_no), status = COALESCE(?, status) WHERE id = ?`).run(
    title ?? null, description ?? null, subject ?? null, order_no ?? null, status ?? null, req.params.id
  );
  res.json(db.prepare(`SELECT * FROM topics WHERE id = ?`).get(req.params.id));
});

router.delete("/topics/:id", (req, res) => {
  db.prepare(`DELETE FROM topics WHERE id = ? AND teacher_id = ?`).run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ---------- SETTINGS ----------
router.get("/settings", (req, res) => {
  const rows = db.prepare(`SELECT key, value_json FROM settings WHERE teacher_id = ?`).all(req.user.id);
  const settings = {};
  for (const r of rows) settings[r.key] = JSON.parse(r.value_json);
  res.json(settings);
});

router.put("/settings", (req, res) => {
  const body = req.body;
  const upsert = db.prepare(
    `INSERT INTO settings (teacher_id, key, value_json, updated_at) VALUES (?, ?, ?, datetime('now', 'localtime'))
     ON CONFLICT(teacher_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
  );
  const tx = db.transaction((entries) => {
    for (const [key, value] of Object.entries(entries)) {
      upsert.run(req.user.id, key, JSON.stringify(value));
    }
  });
  tx(body);
  if (body.hasOwnProperty("scheduler_enabled") && body.scheduler_enabled) {
    scheduleAll(req.user.id);
  }
  res.json({ ok: true });
});

// ---------- MATERIALS ----------
router.get("/materials", (req, res) => {
  const rows = db
    .prepare(`SELECT m.*, c.name AS class_name FROM materials m LEFT JOIN classes c ON c.id = m.class_id WHERE m.teacher_id = ? ORDER BY m.id DESC`)
    .all(req.user.id);
  res.json(rows);
});

router.post("/materials", (req, res) => {
  const { title, content = "", class_id = null, source_type = "text" } = req.body;
  if (!title) return res.status(400).json({ error: "Sarlavha talab qilinadi" });
  const info = db
    .prepare(`INSERT INTO materials (teacher_id, class_id, title, content, source_type) VALUES (?, ?, ?, ?, ?)`)
    .run(req.user.id, class_id, title, content, source_type);
  res.json(db.prepare(`SELECT * FROM materials WHERE id = ?`).get(info.lastInsertRowid));
});

router.delete("/materials/:id", (req, res) => {
  db.prepare(`DELETE FROM materials WHERE id = ? AND teacher_id = ?`).run(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default router;
