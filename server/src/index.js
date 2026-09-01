import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import db from "./db/index.js";
import authRoutes from "./routes/auth.js";
import resourceRoutes from "./routes/resources.js";
import testRoutes from "./routes/tests.js";
import featureRoutes from "./routes/features.js";
import moduleRoutes from "./routes/modules.js";
import adminRoutes from "./routes/admin.js";
import { scheduleAll } from "./services/scheduler.js";
import { telegramEnabled } from "./services/telegram.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "80mb" }));

app.get("/api/health", (req, res) => {
  let tesseract = false;
  try {
    const { execFileSync } = require("node:child_process");
    execFileSync("tesseract", ["--version"], { timeout: 5000, stdio: "pipe" });
    tesseract = true;
  } catch {}
  res.json({ ok: true, aiEnabled: Boolean(process.env.USER_LLM_API_KEY), telegramEnabled: Boolean(process.env.TELEGRAM_BOT_TOKEN), tesseract, db: process.env.DATA_DIR ? path.join(process.env.DATA_DIR, "teacher_agent.db") : path.join(__dirname, "..", "..", "data", "teacher_agent.db") });
});

app.use("/api/auth", authRoutes);
app.use("/api/tests", testRoutes);
app.use("/api", featureRoutes);
app.use("/api", resourceRoutes);
app.use("/api", moduleRoutes);
app.use("/api/admin", adminRoutes);

app.use("/api", (req, res) => res.status(404).json({ error: "API yo'nalishi topilmadi" }));

const frontendDist = path.join(__dirname, "..", "..", "frontend", "dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

db.prepare(`SELECT COUNT(*) FROM teachers`).get();
const teacherIds = db.prepare(`SELECT id FROM teachers`).all();
teacherIds.forEach((t) => {
  try {
    const rows = db.prepare(`SELECT key, value_json FROM settings WHERE teacher_id = ?`).all(t.id);
    const settings = {};
    for (const r of rows) settings[r.key] = JSON.parse(r.value_json);
    if (settings.scheduler_enabled) scheduleAll(t.id);
  } catch {}
});

app.listen(PORT, () => {
  console.log(`AI Teacher Agent server http://localhost:${PORT} da ishlamoqda`);
  console.log(`Telegram bot: ${telegramEnabled ? "yoqilgan (polling)" : "o'chirilgan (token yo'q)"}`);
});
