import jwt from "jsonwebtoken";
import db from "../db/index.js";

const JWT_SECRET = process.env.JWT_SECRET || "ai-teacher-agent-dev-secret";

export function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Avtorizatsiya talab qilinadi" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare(`SELECT * FROM teachers WHERE id = ?`).get(payload.id);
    if (!user) return res.status(401).json({ error: "Foydalanuvchi topilmadi" });
    req.user = user;
    req.userRole = user.role;
    next();
  } catch {
    return res.status(401).json({ error: "Token muddati o'tgan" });
  }
}

export function adminRequired(req, res, next) {
  if (req.userRole !== "admin") {
    return res.status(403).json({ error: "Bu amal uchun admin huquqi kerak" });
  }
  next();
}
