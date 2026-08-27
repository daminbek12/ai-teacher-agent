import express from "express";
import bcrypt from "bcryptjs";
import db from "../db/index.js";
import { signToken, authRequired } from "./authMiddleware.js";

const router = express.Router();

router.post("/register", (req, res) => {
  const { name, school_name = "", subject = "", password, phone = "" } = req.body;
  if (!name || !password) {
    return res.status(400).json({ error: "Ism va parol talab qilinadi" });
  }
  const existing = db.prepare(`SELECT * FROM teachers WHERE name = ? AND school_name = ?`).get(name, school_name);
  if (existing) {
    return res.status(409).json({ error: "Bunday o'qituvchi allaqachon ro'yxatdan o'tgan" });
  }
  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare(
      `INSERT INTO teachers (name, school_name, subject, phone, password_hash, role)
       VALUES (?, ?, ?, ?, ?, 'teacher')`
    )
    .run(name, school_name, subject, phone, hash);
  const user = db.prepare(`SELECT * FROM teachers WHERE id = ?`).get(info.lastInsertRowid);
  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

router.post("/login", (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: "Ism va parol talab qilinadi" });
  const user = db.prepare(`SELECT * FROM teachers WHERE name = ?`).get(name);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Ism yoki parol noto'g'ri" });
  }
  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    school_name: u.school_name,
    subject: u.subject,
    role: u.role,
    settings_json: u.settings_json,
  };
}

router.get("/me", authRequired, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.get("/all", (req, res) => {
  const users = db.prepare(`SELECT id, name, school_name, subject, role FROM teachers`).all();
  res.json(users);
});

export default router;
