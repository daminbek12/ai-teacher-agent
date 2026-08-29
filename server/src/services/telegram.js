import TelegramBot from "node-telegram-bot-api";
import bcrypt from "bcryptjs";
import db from "../db/index.js";
import { generateTestPdf, generateReportPdf } from "./pdfGenerator.js";
import { generateTestDocx, generateReportDocx, generatePlanDocx } from "./docxGenerator.js";
import { ocrImage, extractPdfText, extractDocxText, classifyImage, parseTimetable } from "./ocr.js";
import { createTextbook, addTextbookVersion, structureTextbook, indexTextbookContent, chunkText, listTextbooks, getTextbookIndex } from "./textbook.js";
import { extractZip, isValidUpload, guessMime } from "./files.js";
import { createFullTest, generateTestQuestions, createVariants, analyzeStudentWeaknesses, adaptiveDifficulty } from "./testGenerator.js";
import { runTestQc, regenerateWeakQuestions } from "./qc.js";
import { seedDefaultHolidays, generateAnnualPlan, markLessonMissed, addHoliday } from "./planner.js";
import { weeklyReport, monthlyReport, developmentReport } from "./reportService.js";
import { generateLessonPlan, generateHomework, generateConspectus } from "./lessonService.js";
import { getUsageStats } from "./ai.js";
import { logAudit, getAuditLog } from "./audit.js";
import { setState, getState, clearState, appendState, hasState } from "./telegramState.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
export const telegramEnabled = Boolean(token);
const FILE_API = `https://api.telegram.org/file/bot${token}/`;

let bot = null;
if (telegramEnabled) {
  bot = new TelegramBot(token, { polling: true });
  setupCommands();
}

export function sendMessage(chatId, text, { parse_mode = null, reply_markup = null } = {}) {
  if (!bot) return Promise.resolve(null);
  const opts = {};
  if (parse_mode) opts.parse_mode = parse_mode;
  if (reply_markup) opts.reply_markup = reply_markup;
  return bot.sendMessage(chatId, text, opts).catch((e) => {
    enqueue(0, "telegram", { chatId, text: text.slice(0, 500) }, e.message);
    return null;
  });
}

function inlineKeyboard(rows) {
  return {
    inline_keyboard: rows.map((row) =>
      row.map(([label, data]) => ({ text: label, callback_data: data }))
    ),
  };
}

function enqueue(teacherId, type, payload, error = "") {
  try {
    db.prepare(
      `INSERT INTO task_queue (teacher_id, task_type, payload_json, status, error)
       VALUES (?, ?, ?, 'failed', ?)`
    ).run(teacherId || 0, type, JSON.stringify(payload), error.slice(0, 300));
  } catch {}
}

function getTeacherByChatId(chatId) {
  return db.prepare(`SELECT * FROM teachers WHERE phone = ? COLLATE NOCASE`).get(`tg:${chatId}`);
}

function linkTeacher(chatId, teacherId) {
  db.prepare(`UPDATE teachers SET phone = ? WHERE id = ?`).run(`tg:${chatId}`, teacherId);
}

function unlinkTeacher(teacherId) {
  db.prepare(`UPDATE teachers SET phone = '' WHERE id = ?`).run(teacherId);
}

const DAY_NAMES = ["", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];
const TEST_TYPES = { topic: "Mavzu testi", daily: "Kunlik", weekly: "Haftalik", monthly: "Oylik", diagnostic: "Diagnostik", final: "Yakuniy", individual: "Individual", manual: "Qo'lda" };

export async function sendTest(chatId, testId, { includeAnswers = false } = {}) {
  if (!bot) return false;
  const test = db.prepare(`SELECT * FROM tests WHERE id = ?`).get(testId);
  if (!test) return false;
  const questions = db.prepare(`SELECT * FROM questions WHERE test_id = ? ORDER BY id`).all(testId);
  const cls = db.prepare(`SELECT * FROM classes WHERE id = ?`).get(test.class_id);
  const teacher = db.prepare(`SELECT * FROM teachers WHERE id = ?`).get(test.teacher_id);
  const data = {
    schoolName: teacher?.school_name || "",
    subject: cls?.subject || "Tarix",
    className: cls?.name || "",
    topic: test.topic || test.title,
    title: test.title,
    questions: questions.map((q) => ({ ...q, options: JSON.parse(q.options_json) })),
    showAnswers: includeAnswers,
  };
  const pdf = await generateTestPdf(data);
  const docx = await generateTestDocx(data);
  const suffix = includeAnswers ? " (javoblar bilan)" : "";
  await bot.sendMessage(chatId, `Test: ${test.title}\nSavollar: ${questions.length}${suffix}`);
  await bot.sendDocument(chatId, Buffer.from(pdf), { filename: `${test.title}.pdf` });
  await bot.sendDocument(chatId, docx, { filename: `${test.title}.docx` });
  return true;
}

async function sendLong(chatId, text, extra = {}) {
  const MAX = 3800;
  if (text.length <= MAX) return sendMessage(chatId, text, extra);
  const parts = [];
  let rest = text;
  while (rest.length > MAX) {
    let cut = rest.lastIndexOf("\n", MAX);
    if (cut < MAX * 0.5) cut = MAX;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  parts.push(rest);
  for (const p of parts) await sendMessage(chatId, p);
}

async function downloadFile(fileId) {
  const file = await bot.getFile(fileId);
  const url = FILE_API + file.file_path;
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}

// ---------- LOGIN (PAROL BILAN) ----------
function handleStart(msg) {
  const chatId = msg.chat.id;
  const teacher = getTeacherByChatId(chatId);
  if (teacher) {
    return sendMainMenu(chatId, teacher);
  }
  const teachers = db.prepare(`SELECT id, name, school_name FROM teachers ORDER BY id LIMIT 30`).all();
  if (teachers.length === 0) {
    return sendMessage(chatId, "Hozircha o'qituvchilar yo'q. Avval web panel orqali ro'yxatdan o'ting.");
  }
  setState(chatId, "auth", { step: "select_teacher" });
  sendMessage(chatId, "🔐 TIZIMGA KIRISH\n\nQaysi akkauntdan foydalanasiz? Tanlang:", {
    reply_markup: inlineKeyboard(
      teachers.map((t) => [[`${t.name}${t.school_name ? ` (${t.school_name})` : ""}`, `register:${t.id}`]])
    ),
  });
}

function askPassword(chatId, teacherId) {
  setState(chatId, "auth", { step: "password", teacherId, tries: 0 });
  sendMessage(chatId, "🔑 Akkaunt parolini yuboring:", {
    reply_markup: inlineKeyboard([[["Bekor qilish", "auth_cancel"]]]),
  });
}

function verifyPassword(chatId, password) {
  const auth = getState(chatId, "auth");
  if (!auth || auth.step !== "password" || !auth.teacherId) {
    return sendMessage(chatId, "Avval akkaunt tanlang: /start");
  }
  const teacher = db.prepare(`SELECT * FROM teachers WHERE id = ?`).get(auth.teacherId);
  if (!teacher) {
    clearState(chatId, "auth");
    return sendMessage(chatId, "Akkaunt topilmadi. Qaytadan: /start");
  }
  if (!bcrypt.compareSync(String(password), teacher.password_hash)) {
    const tries = (auth.tries || 0) + 1;
    if (tries >= 5) {
      clearState(chatId, "auth");
      return sendMessage(chatId, "❌ Parol 5 marta noto'g'ri kiritildi. Qaytadan boshlang: /start");
    }
    setState(chatId, "auth", { ...auth, tries });
    return sendMessage(chatId, `❌ Parol noto'g'ri (${tries}/5). Qayta yuboring:`, {
      reply_markup: inlineKeyboard([[["Bekor qilish", "auth_cancel"]]]),
    });
  }
  const current = getTeacherByChatId(chatId);
  if (current && current.id !== teacher.id) unlinkTeacher(current.id);
  linkTeacher(chatId, teacher.id);
  clearState(chatId);
  logAudit(teacher.id, { action: "telegram.login", entityType: "teacher", entityId: teacher.id });
  sendMessage(chatId, `✅ Xush kelibsiz, ${teacher.name}!`);
  return sendMainMenu(chatId, teacher);
}

function handleSwitchAccount(chatId) {
  const teacher = getTeacherByChatId(chatId);
  if (teacher) {
    unlinkTeacher(teacher.id);
    logAudit(teacher.id, { action: "telegram.logout", entityType: "teacher", entityId: teacher.id });
  }
  clearState(chatId);
  sendMessage(chatId, "🔓 Akkaunttan chiqdingiz.");
  return handleStart({ chat: { id: chatId } });
}

// ---------- MAIN MENU ----------
function sendMainMenu(chatId, teacher) {
  const menu = [
    ["🚀 Hammasini sozlash", "auto_setup"],
    ["📅 Jadval", "menu:jadval"],
    ["📚 Darsliklar", "menu:darsliklar"],
    ["🧩 Mavzular", "menu:mavzular"],
    ["📋 Dars rejasi", "menu:dars_rejasi"],
    ["📝 Testlar", "menu:testlar"],
    ["👨‍🎓 O'quvchilar", "menu:oquvchilar"],
    ["🏠 Uy vazifasi", "menu:uy_vazifasi"],
    ["📊 Natijalar", "menu:natijalar"],
    ["📈 Hisobot", "menu:hisobot"],
    ["📦 Material", "menu:material"],
    ["🗓 Yillik reja", "menu:yillik_reja"],
    ["🎯 Bugungi dars", "menu:briefing"],
    ["⚙️ Sozlamalar", "menu:sozlamalar"],
    ["🤖 AI xarajat", "menu:ai_usage"],
    ["📜 Audit", "menu:audit"],
    ["🔔 Eslatmalar", "menu:eslatmalar"],
    ["🔄 Akkaunt almashtirish", "switch_account"],
    ["ℹ️ Yordam", "help"],
  ];
  sendMessage(chatId, `Salom, ${teacher.name}! 👋\n\nAI Teacher Agent: bitta rasm, PDF yoki ZIP yuboring — qolganini tizim avtomatik qiladi.\n\nBo'lim tanlang:`, {
    reply_markup: inlineKeyboard(menu),
  });
}

// ---------- TIMETABLE (JADVAL) ----------
async function handleImage(chatId, teacher, buffer, originalName = "rasm") {
  const info = await sendMessage(chatId, "🔎 Rasm tahlil qilinmoqda (OCR)...");
  const { text, confidence } = await ocrImage(buffer);
  const kind = classifyImage(text);

  if (kind === "timetable") {
    const parsed = await parseTimetable(teacher.id, text, {});
    setState(chatId, "pending_timetable", parsed.entries);
    const lines = ["📅 JADVAL ANIQLANDI\n"];
    const grouped = {};
    for (const e of parsed.entries) {
      if (!grouped[e.day_of_week]) grouped[e.day_of_week] = [];
      grouped[e.day_of_week].push(`${e.start_time} — ${e.class_name || "?"} — ${e.subject || "Dars"}`);
    }
    for (let d = 1; d <= 7; d++) {
      if (grouped[d]) lines.push(`${DAY_NAMES[d]}:\n${grouped[d].join("\n")}\n`);
    }
    lines.push(`Ishonch: ${confidence}%`);
    await bot.sendMessage(chatId, lines.join("\n"), {
      reply_markup: inlineKeyboard([
        ["✅ Tasdiqlash", "confirm_timetable:ok"],
        ["🔄 Qayta o'qish", "confirm_timetable:redo"],
      ]),
    });
    return;
  }

  if (kind === "textbook" || kind === "other" || kind === "students") {
    setState(chatId, "pending_textbook_text", text);
    await bot.sendMessage(chatId, `📚 Rasm o'qildi (${confidence}% ishonch).\nBu sahifa darslik sahifasi sifatida qabul qilinsinmi?`, {
      reply_markup: inlineKeyboard([
        ["✅ Darslikka qo'shish", "textbook_confirm:ok"],
        ["🗑️ Bekor", "textbook_confirm:cancel"],
      ]),
    });
    return;
  }

  return sendMessage(chatId, `Rasm turi aniqlanmadi (confidence: ${confidence}%). Boshqa rasm yuboring yoki qo'lda kiritishni so'rang.`);
}

async function confirmTimetable(chatId, teacherId) {
  const entries = getState(chatId, "pending_timetable") || [];
  if (!entries.length) return sendMessage(chatId, "Avval jadval rasmini yuboring.");
  const existingClasses = db.prepare(`SELECT * FROM classes WHERE teacher_id = ?`).all(teacherId);
  const classByName = {};
  existingClasses.forEach((c) => (classByName[c.name.toLowerCase()] = c));

  const created = [];
  for (const e of entries) {
    if (!e.class_name || !e.day_of_week || !e.start_time) continue;
    let cls = classByName[e.class_name.toLowerCase()];
    if (!cls) {
      const info = db.prepare(`INSERT INTO classes (teacher_id, name, subject) VALUES (?, ?, 'Tarix')`).run(teacherId, e.class_name);
      cls = db.prepare(`SELECT * FROM classes WHERE id = ?`).get(info.lastInsertRowid);
      classByName[e.class_name.toLowerCase()] = cls;
    }
    db.prepare(
      `INSERT INTO schedule (teacher_id, class_id, day_of_week, start_time, subject)
       VALUES (?, ?, ?, ?, ?)`
    ).run(teacherId, cls.id, e.day_of_week, e.start_time, e.subject || "Tarix");
    created.push({ class: cls.name, day: DAY_NAMES[e.day_of_week], time: e.start_time });
  }
  clearState(chatId);
  logAudit(teacherId, { action: "timetable.imported", entityType: "schedule", entityId: 0, detail: { count: created.length } });
  await sendMessage(chatId, `✅ Jadval saqlandi!\nDarslar soni: ${created.length}\n\n${created.map((c) => `${c.day} ${c.time} — ${c.class}`).join("\n")}`);
}

// ---------- TEXTBOOK (DARSLIK) ----------
async function handlePdf(chatId, teacher, buffer, fileName) {
  await sendMessage(chatId, "📄 PDF o'qilmoqda...");
  const { text, pages } = await extractPdfText(buffer);
  if (!text) return sendMessage(chatId, "PDF dan matn topilmadi. Rasm sifatida yuborishni sinab ko'ring.");
  setState(chatId, "pending_textbook_text", text);
  setState(chatId, "pending_textbook_pages", pages);
  await bot.sendMessage(chatId, `PDF o'qildi (${pages} sahifa, ${text.length} belgi).\n\nDarslik sifatida saqlaymizmi?`, {
    reply_markup: inlineKeyboard([
      ["✅ Saqlash", "textbook_confirm:ok"],
      ["🗑️ Bekor", "textbook_confirm:cancel"],
    ]),
  });
}

async function handleZip(chatId, teacher, buffer, fileName) {
  await sendMessage(chatId, "📦 ZIP tekshirilmoqda...");
  const result = extractZip(buffer);
  if (!result.ok) return sendMessage(chatId, `❌ ZIP xatolik: ${result.error}`);
  let fullText = "";
  let pageCount = 0;
  let imageCount = 0;
  const pdfs = result.files.filter((f) => f.mime === "application/pdf");
  const docs = result.files.filter((f) => f.mime.includes("wordprocessingml"));
  const images = result.files.filter((f) => f.mime.startsWith("image/"));

  for (const p of pdfs) {
    const r = await extractPdfText(p.buffer);
    fullText += "\n" + r.text;
    pageCount += r.pages;
  }
  for (const d of docs) {
    fullText += "\n" + extractDocxText(d.buffer).text;
  }
  for (const img of images) {
    imageCount++;
    try {
      const { text } = await ocrImage(img.buffer);
      fullText += "\n" + text;
      pageCount++;
    } catch {}
  }
  if (!fullText.trim()) return sendMessage(chatId, "ZIP ichidan matn aniqlanmadi.");
  setState(chatId, "pending_textbook_text", fullText);
  setState(chatId, "pending_textbook_pages", pageCount);
  await bot.sendMessage(chatId, `📦 ZIP tekshirildi.\nPDF: ${pdfs.length}, Word: ${docs.length}, Rasm: ${imageCount}, Dupl.: ${result.duplicates.length}\nJami matn: ${fullText.length} belgi.\n\nDarslik sifatida saqlaymizmi?`, {
    reply_markup: inlineKeyboard([
      ["✅ Saqlash", "textbook_confirm:ok"],
      ["🗑️ Bekor", "textbook_confirm:cancel"],
    ]),
  });
}

function askTextbookMeta(chatId) {
  setState(chatId, "awaiting_meta", true);
  sendMessage(chatId,
    "Darslik haqida ma'lumot bering. Formatni quyidagicha yozing:\n\nFAN: Tarix\nSINF: 7\nNOM: O'zbekiston tarixi\nYIL: 2023\n\nYoki: Tarix, 7-sinf, O'zbekiston tarixi, 2023"
  );
}

async function processTextbookMeta(chatId, teacher, text) {
  const parsed = parseMeta(text, teacher);
  const content = getState(chatId, "pending_textbook_text") || "";
  const pages = getState(chatId, "pending_textbook_pages") || 0;
  clearState(chatId);
  if (!content) return sendMessage(chatId, "Darslik matni topilmadi. Avval rasm/PDF/ZIP yuboring.");

  try {
    const tb = createTextbook(teacher.id, parsed);
    addTextbookVersion(teacher.id, tb.id, { version: `v${parsed.edition_year || "1"}`, edition_year: parsed.edition_year || "", source: "telegram_upload", isActive: true });
    const structure = await structureTextbook(teacher.id, tb.id, content, {});
    const chunks = chunkText(content);
    indexTextbookContent(teacher.id, tb.id, { chapters: structure.chapters, lessons: structure.lessons, chunks });
    const index = getTextbookIndex(teacher.id, tb.id);
    logAudit(teacher.id, { action: "textbook.imported", entityType: "textbook", entityId: tb.id, detail: { pages, lessons: structure.lessons?.length } });
    await sendMessage(chatId,
      `📚 DARSLIK SAQLANDI\n📖 ${tb.title} (${tb.grade}-sinf)\n📄 Sahifa: ${pages}\n📂 Boblar: ${structure.chapters?.length}\n📋 Mavzular: ${structure.lessons?.length}\n\n📌 Sanalar: ${index.dates.length}, Shaxslar: ${index.people.length}, Joylar: ${index.places.length}\n\nEndi dars rejasi va testlar avtomatik tuziladi.`
    );
  } catch (e) {
    sendMessage(chatId, `Darslik saqlashda xato: ${e.message}`);
  }
}

function parseMeta(text, teacher) {
  const lines = text.split("\n");
  let subject = teacher.subject || "Tarix";
  let grade = "";
  let title = "";
  let year = "";
  const kv = {};
  for (const line of lines) {
    const m = line.match(/^(fan|sinf|nom|yil|nashr)\s*[:=]\s*(.+)$/i);
    if (m) kv[m[1].toLowerCase()] = m[2].trim();
  }
  subject = kv.fan || subject;
  grade = (kv.sinf || "").replace(/\D/g, "");
  title = kv.nom || "";
  year = kv.yil || kv.nashr || "";
  if (!title || !grade) {
    const parts = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const withGrade = parts.find((p) => /\d{1,2}-sinf|\d{1,2}[- ]?sinf/i.test(p));
      const yearPart = parts.find((p) => /\b(19|20)\d{2}\b/.test(p));
      if (withGrade) grade = (withGrade.match(/\d{1,2}/) || [""])[0];
      if (yearPart) year = (yearPart.match(/\b(19|20)\d{2}\b/) || [""])[0];
      title = parts.find((p) => p !== withGrade && p !== yearPart) || title;
      if (!title) title = parts[0];
    }
  }
  if (!title) title = `${subject} ${grade}`;
  if (!grade) grade = "7";
  return { subject, grade, title, edition_year: year, pages: 0, status: "uploaded" };
}

// ---------- AUTO SETUP ----------
function startAutoSetup(chatId, teacher) {
  setState(chatId, "auto_setup", true);
  const now = new Date().getFullYear();
  seedDefaultHolidays(teacher.id, now);
  sendMessage(chatId,
    `🚀 AVTOMATIK SOZLASH BOSHLANDI\n\nQadamlar:\n1️⃣ Jadval rasmini yuboring\n2️⃣ Darslik PDF/ZIP/rasmini yuboring\n\nJadval rasmini yuborishdan boshlang 📷`
  );
}

async function finalizeAutoSetup(chatId, teacher) {
  const classes = db.prepare(`SELECT COUNT(*) AS c FROM classes WHERE teacher_id = ?`).get(teacher.id).c;
  const textbooks = db.prepare(`SELECT COUNT(*) AS c FROM textbooks WHERE teacher_id = ?`).get(teacher.id).c;
  const topics = db.prepare(`SELECT COUNT(*) AS c FROM topics WHERE teacher_id = ?`).get(teacher.id).c;
  const scheduleCount = db.prepare(`SELECT COUNT(*) AS c FROM schedule WHERE teacher_id = ?`).get(teacher.id).c;
  const lessonsCount = db.prepare(`SELECT COUNT(*) AS c FROM lessons WHERE teacher_id = ?`).get(teacher.id).c;
  const lines = [
    "🎉 AVTOMATIK SOZLASH TUGADI",
    "",
    `Sinflar: ${classes}`,
    `Jadval darslari: ${scheduleCount}`,
    `Darsliklar: ${textbooks}`,
    `Mavzular: ${topics}`,
    `Darslik mavzulari: ${lessonsCount}`,
    "",
    "📋 Barcha ma'lumotlar asosida testlar va dars rejasi tayyor.",
  ];
  logAudit(teacher.id, { action: "auto_setup.finish", entityType: "setup", entityId: 0, detail: { classes, textbooks, scheduleCount } });
  await bot.sendMessage(chatId, lines.join("\n"), {
    reply_markup: inlineKeyboard([
      ["📋 Ko'rish", "auto_setup:view"],
      ["🔙 Menu", "menu:back"],
    ]),
  });
}

// ---------- HELPERS ----------
function getTeacherClasses(teacherId) {
  return db.prepare(`SELECT * FROM classes WHERE teacher_id = ? ORDER BY name`).all(teacherId);
}

function pickClassKeyboard(teacher, callbackPrefix) {
  const classes = getTeacherClasses(teacher.id);
  if (!classes.length) return { error: "Sinf yo'q. Avval jadval rasmini yuboring yoki sinf qo'shing." };
  return {
    classes,
    keyboard: inlineKeyboard(classes.map((c) => [[c.name, `${callbackPrefix}:${c.id}`]]).concat([[["🔙 Menu", "menu:back"]]])),
  };
}

function getCurrentTopic(classId) {
  return db
    .prepare(`SELECT * FROM topics WHERE class_id = ? AND status IN ('pending','in_progress') ORDER BY CASE status WHEN 'in_progress' THEN 0 ELSE 1 END, order_no LIMIT 1`)
    .get(classId);
}

async function sendTestWithMenu(chatId, testId) {
  await sendTest(chatId, testId);
  return bot.sendMessage(chatId, "Amallar:", {
    reply_markup: inlineKeyboard([
      [["PDF+kalit", `send_test_answers:${testId}`]],
      [["Variyantlar (A/B/C)", `variants:${testId}`]],
      [["Sifat nazorati", `qc:${testId}`]],
      [["Zaif savollarni almashtirish", `regen_weak:${testId}`]],
      [["O'chirish", `del_test:${testId}`], ["🔙 Menu", "menu:back"]],
    ]),
  });
}

// ---------- MENU HANDLERS ----------
function handleMenu(chatId, teacher, key) {
  const teacherId = teacher.id;
  switch (key) {
    case "jadval": {
      const schedule = db.prepare(`SELECT s.*, c.name AS class_name FROM schedule s JOIN classes c ON c.id = s.class_id WHERE s.teacher_id = ? ORDER BY day_of_week, start_time`).all(teacherId);
      const extra = [["+ Dars qo'shish", "add_schedule"], ["🔙 Menu", "menu:back"]];
      if (!schedule.length) return bot.sendMessage(chatId, "Jadval bo'sh. /auto_setup orqali rasm yuboring.", {
        reply_markup: inlineKeyboard([extra]),
      });
      const grouped = {};
      for (const s of schedule) {
        if (!grouped[s.day_of_week]) grouped[s.day_of_week] = [];
        grouped[s.day_of_week].push(`${s.start_time} — ${s.class_name} — ${s.subject || "Dars"}`);
      }
      let text = "📅 Haftalik jadval:\n\n";
      for (let d = 1; d <= 7; d++) if (grouped[d]) text += `${DAY_NAMES[d]}:\n${grouped[d].join("\n")}\n`;
      return bot.sendMessage(chatId, text, { reply_markup: inlineKeyboard([extra]) });
    }
    case "darsliklar": {
      const tbs = listTextbooks(teacherId);
      if (!tbs.length) return sendMessage(chatId, "Darsliklar yo'q. PDF/rasm/ZIP yuboring yoki /auto_setup ni boshlang.");
      return bot.sendMessage(chatId, "📚 Darsliklar:\n" + tbs.map((t) => `• ${t.grade}-sinf ${t.title} (${t.edition_year || "yil ko'rsatilmagan"})`).join("\n"), {
        reply_markup: inlineKeyboard(
          tbs.slice(0, 8).map((t) => [[`${t.grade}-sinf: ${t.title}`, `textbook_view:${t.id}`]]).concat([[["🔙 Menu", "menu:back"]]])
        ),
      });
    }
    case "mavzular": {
      const topics = db.prepare(`SELECT t.*, c.name AS class_name FROM topics t JOIN classes c ON c.id = t.class_id WHERE t.teacher_id = ? ORDER BY c.name, t.order_no LIMIT 60`).all(teacherId);
      if (!topics.length) return sendMessage(chatId, "Mavzular yo'q. Darslik yuklang — mavzular avtomatik qo'shiladi.");
      const grouped = {};
      topics.forEach((t) => {
        if (!grouped[t.class_name]) grouped[t.class_name] = [];
        grouped[t.class_name].push(`${t.order_no + 1}. ${t.title} [${t.status === "done" ? "✅" : t.status === "in_progress" ? "▶️" : "⏳"}]`);
      });
      let text = "🧩 Mavzular:\n";
      for (const [cls, list] of Object.entries(grouped)) text += `\n${cls} (${list.length}):\n${list.join("\n")}\n`;
      return sendLong(chatId, text);
    }
    case "testlar": {
      const tests = db.prepare(`SELECT t.*, c.name AS class_name FROM tests t JOIN classes c ON c.id = t.class_id WHERE t.teacher_id = ? ORDER BY t.id DESC LIMIT 10`).all(teacherId);
      const extra = [["+ Yangi test", "create_test"], ["Kunlik testlar", "daily_test"], ["🔙 Menu", "menu:back"]];
      if (!tests.length) return bot.sendMessage(chatId, "Hozircha testlar yo'q.", { reply_markup: inlineKeyboard([extra]) });
      return bot.sendMessage(chatId, "📝 Testlar (oxirgi 10):", {
        reply_markup: inlineKeyboard(
          tests.map((t) => [[`${t.title} (${t.question_count})`, `test_view:${t.id}`]]).concat([extra])
        ),
      });
    }
    case "oquvchilar": {
      const students = db.prepare(`SELECT s.*, c.name AS class_name FROM students s JOIN classes c ON c.id = s.class_id WHERE s.teacher_id = ? ORDER BY s.first_name`).all(teacherId);
      const rows = [];
      students.slice(0, 10).forEach((s) => rows.push([[`${s.first_name} ${s.last_name} (${s.class_name})`, `student_view:${s.id}`]]));
      rows.push([["+ O'quvchi qo'shish", "add_student"], ["🔙 Menu", "menu:back"]]);
      return bot.sendMessage(chatId, students.length ? `👨‍🎓 O'quvchilar (${students.length} ta):` : "O'quvchilar yo'q.", {
        reply_markup: inlineKeyboard(rows),
      });
    }
    case "natijalar": {
      const results = db.prepare(`SELECT r.*, s.first_name, s.last_name, t.title FROM test_results r JOIN students s ON s.id = r.student_id JOIN tests t ON t.id = r.test_id WHERE r.teacher_id = ? ORDER BY r.created_at DESC LIMIT 15`).all(teacherId);
      if (!results.length) return sendMessage(chatId, "Natijalar hali yo'q. Testni o'quvchilar orqali yechish uchun \"natija kirit\" deb yozing.");
      const text = "📊 So'nggi natijalar:\n" + results.map((r) => `${r.first_name} ${r.last_name} — ${r.percent}% (baho ${r.grade}), "${r.title}"`).join("\n");
      return sendMessage(chatId, text);
    }
    case "hisobot": {
      const classes = getTeacherClasses(teacherId);
      if (!classes.length) return sendMessage(chatId, "Sinf yo'q.");
      const rows = classes.slice(0, 6).map((c) => [[`📊 ${c.name} haftalik`, `report_class:weekly:${c.id}`], [`${c.name} oylik`, `report_class:monthly:${c.id}`]]).flat();
      rows.push([["🔙 Menu", "menu:back"]]);
      return bot.sendMessage(chatId, "📈 Hisobot: sinf va tur tanlang (PDF/DOCX yuboriladi)", {
        reply_markup: inlineKeyboard(rows),
      });
    }
    case "uy_vazifasi": {
      const hw = db.prepare(`SELECT h.*, c.name AS class_name FROM homework h JOIN classes c ON c.id = h.class_id WHERE h.teacher_id = ? ORDER BY h.id DESC LIMIT 5`).all(teacherId);
      const extra = [["+ Uy vazifasi tuzish", "create_homework"], ["🔙 Menu", "menu:back"]];
      if (!hw.length) return bot.sendMessage(chatId, "Uy vazifalari yo'q.", { reply_markup: inlineKeyboard([extra]) });
      return bot.sendMessage(chatId, hw.map((h) => `📚 ${h.class_name} (${h.due_date ? "muddat: " + h.due_date : ""}):\n${h.content}`).join("\n\n---\n\n"), {
        reply_markup: inlineKeyboard([extra]),
      });
    }
    case "natijalar": {
      const results = db.prepare(`SELECT r.*, s.first_name, s.last_name, t.title FROM test_results r JOIN students s ON s.id = r.student_id JOIN tests t ON t.id = r.test_id WHERE r.teacher_id = ? ORDER BY r.created_at DESC LIMIT 10`).all(teacherId);
      if (!results.length) return sendMessage(chatId, "Natijalar hali yo'q.");
      const text = "📊 So'nggi natijalar:\n" + results.map((r) => `${r.first_name} ${r.last_name} — ${r.percent}% (baho ${r.grade}), \"${r.title}\"`).join("\n");
      return sendMessage(chatId, text);
    }
    case "hisobot": {
      const classes = db.prepare(`SELECT * FROM classes WHERE teacher_id = ?`).all(teacherId);
      if (!classes.length) return sendMessage(chatId, "Sinf yo'q.");
      const lines = [];
      for (const c of classes.slice(0, 5)) {
        const rep = weeklyReport(teacherId, c.id);
        lines.push(
          `\n${c.name}:\n  Testlar: ${rep.testsTaken}\n  O'rtacha: ${rep.average ?? "-"}%` + (rep.worstTopic ? `\n  Zaif mavzu: ${rep.worstTopic.topic}` : "")
        );
      }
      return sendMessage(chatId, "📈 HAFTALIK HISOBOT" + lines.join("\n"));
    }
    case "uy_vazifasi": {
      const hw = db.prepare(`SELECT h.*, c.name AS class_name FROM homework h JOIN classes c ON c.id = h.class_id WHERE h.teacher_id = ? ORDER BY h.id DESC LIMIT 5`).all(teacherId);
      if (!hw.length) return sendMessage(chatId, "Uy vazifalari yo'q. \"Bugun 7-A uchun uy vazifasi tuz\" deb yozing.");
      return sendMessage(chatId, hw.map((h) => `📚 ${h.class_name}:\n${h.content}`).join("\n\n---\n\n"));
    }
    case "dars_rejasi": {
      const { error, keyboard } = pickClassKeyboard(teacher, "plan_class");
      if (error) return sendMessage(chatId, error);
      return bot.sendMessage(chatId, "📋 Qaysi sinf uchun dars rejasi tuzamiz? (joriy mavzu bo'yicha)", {
        reply_markup: keyboard,
      });
    }
    case "yillik_reja": {
      const { error, keyboard } = pickClassKeyboard(teacher, "annual_class");
      if (error) return sendMessage(chatId, error);
      return bot.sendMessage(chatId, "🗓 Qaysi sinf uchun yillik reja tuzamiz?", {
        reply_markup: keyboard,
      });
    }
    case "briefing": {
      return bot.sendMessage(chatId, "🎯 Bugungi dars briefingi tuzilmoqda...").then(() =>
        import("./scheduler.js").then(async ({ prepareMorningBriefing }) => {
          const result = await prepareMorningBriefing(teacherId);
          if (!result) return sendMessage(chatId, "Bugungi darslar jadvalda yo'q.");
          return sendLong(chatId, result.message);
        })
      );
    }
    case "material": {
      const mats = db.prepare(`SELECT * FROM materials WHERE teacher_id = ? ORDER BY id DESC LIMIT 5`).all(teacherId);
      const extra = [["+ Material qo'shish", "add_material"], ["🔙 Menu", "menu:back"]];
      if (!mats.length) return bot.sendMessage(chatId, "Materiallar yo'q.", { reply_markup: inlineKeyboard([extra]) });
      return bot.sendMessage(chatId, "📦 Materiallar:\n" + mats.map((m) => `• ${m.title}: ${(m.content || "").slice(0, 100)}`).join("\n"), {
        reply_markup: inlineKeyboard([extra]),
      });
    }
    case "sozlamalar": {
      const rows = db.prepare(`SELECT key, value_json FROM settings WHERE teacher_id = ?`).all(teacherId);
      const s = {};
      rows.forEach((r) => (s[r.key] = JSON.parse(r.value_json)));
      return bot.sendMessage(chatId,
        `⚙️ Sozlamalar:\n` +
        `Test savollari: ${s.test_count || 20}\n` +
        `Kunlik test: ${s.daily_test_enabled === false ? "o'chirilgan" : "yoqilgan"} (${s.daily_test_time || "08:00"}, ${s.daily_test_count || 10} savol)\n` +
        `Haftalik test: ${DAY_NAMES[s.test_day ?? 5]} ${s.test_time || "18:00"}\n` +
        `Qiyinlik: ${s.difficulty_easy ?? 30}/${s.difficulty_medium ?? 50}/${s.difficulty_hard ?? 20}%\n` +
        `Avtomatik rejim: ${s.scheduler_enabled ? "yoqilgan" : "o'chirilgan"}`,
        {
          reply_markup: inlineKeyboard([
            [["Kunlik test sozlash", "settings:daily"], ["Test soni", "settings:count"]],
            [["Qiyinlik", "settings:difficulty"], ["Avtomatik rejim", "settings:scheduler"]],
            [["🔙 Menu", "menu:back"]],
          ]),
        }
      );
    }
    case "ai_usage": {
      const usage = getUsageStats(teacherId, { period: "all" });
      const modelLines = Object.entries(usage.byModel).map(([m, c]) => `  ${m}: $${Number(c).toFixed(4)}`).join("\n");
      return sendMessage(chatId, `🤖 AI xarajatlar:\nSo'rovlar: ${usage.requests}\nTokenlar: ${usage.totalTokens}\nJami: $${Number(usage.totalCost).toFixed(4)}\n${modelLines ? "Modellar:\n" + modelLines : ""}`);
    }
    case "audit": {
      const logs = getAuditLog(teacherId, { limit: 15 });
      if (!logs.length) return sendMessage(chatId, "Audit log bo'sh.");
      return sendLong(chatId, "📜 Oxirgi amallar:\n" + logs.map((l) => `${(l.created_at || "").slice(0, 16)} — ${l.action}`).join("\n"));
    }
    case "eslatmalar": {
      const rem = db.prepare(`SELECT * FROM reminders WHERE teacher_id = ? ORDER BY id DESC LIMIT 15`).all(teacherId);
      if (!rem.length) return sendMessage(chatId, "Eslatmalar yo'q.");
      return sendLong(chatId, "🔔 Eslatmalar:\n" + rem.map((r) => `[${r.status === "sent" ? "✅" : "⏳"}] ${r.message}`).join("\n"));
    }
    case "back":
      return sendMainMenu(chatId, teacher);
    default:
      return sendMessage(chatId, `Bo'lim "${key}" topilmadi.`);
  }
}

// ---------- NATURAL LANGUAGE ----------
function handleNL(chatId, teacher, text) {
  const teacherId = teacher.id;
  const lower = text.toLowerCase();

  if (/hammasini sozlash|avtomatik sozlash|avto sozlash|auto setup/.test(lower)) {
    return startAutoSetup(chatId, teacher);
  }
  if (/kunlik test/.test(lower) && !/sozla|o'chir/.test(lower)) {
    return bot.sendMessage(chatId, "Kunlik testlar yaratilmoqda...").then(async () => {
      const { prepareDailyTest } = await import("./scheduler.js");
      const created = await prepareDailyTest(teacher.id);
      if (!created || !created.length) {
        return sendMessage(chatId, "Bugun uchun kunlik test yaratilmadi (jadvalda dars yo'q, mavzu yo'q yoki allaqachon yaratilgan).");
      }
      for (const t of created) await sendTest(chatId, t.id);
    });
  }
  const classMatch = lower.match(/(\d{1,2}[-—–\s]?[a-z]{1,3})\b/i);
  const classes = db.prepare(`SELECT * FROM classes WHERE teacher_id = ?`).all(teacherId);
  const targetClass = classes.find((c) => c.name.toLowerCase().replace(/\s/g, "").startsWith(classMatch?.[1]?.replace(/[-\s]/g, "") || "") || c.name.toLowerCase().includes(classMatch?.[1]?.replace(/\s/g, "") || ""));

  if (/dars.*(rejasi|reja)|konspekt/.test(lower)) {
    if (!targetClass && !classes.length) return sendMessage(chatId, "Sinf yo'q.");
    const cls = targetClass || classes[0];
    const topic = getCurrentTopic(cls.id);
    if (!topic) return sendMessage(chatId, "Bu sinf uchun mavzu topilmadi. Darslik yuklang.");
    return bot.sendMessage(chatId, `${cls.name} uchun dars rejasi tuzilmoqda (${topic.title})...`).then(async () => {
      try {
        const plan = await generateLessonPlan(teacherId, { classId: cls.id, topic: topic.title, subject: cls.subject || "Tarix", classLevel: String(cls.name).match(/\d+/)?.[0] || "7" });
        const hw = await generateHomework(teacherId, { classId: cls.id, topic: topic.title });
        const text = [
          `DARS REJASI: ${topic.title} (${cls.name})`,
          "",
          `Maqsad: ${plan.maqsad}`,
          `Natija: ${plan.kutilayotgan_natija}`,
          "",
          "Asosiy tushunchalar:",
          ...(plan.asosiy_tushunchalar || []).map((x) => "• " + x),
          "",
          "Uy vazifasi:",
          ...(plan.uy_vazifasi || []).map((x) => "• " + x),
          "",
          `Tayyor uy vazifasi: ${hw}`,
        ].join("\n");
        return sendLong(chatId, text);
      } catch (e) {
        return sendMessage(chatId, `Xato: ${e.message}`);
      }
    });
  }
  if (/uy vazifasi|uyvazifasi/.test(lower)) {
    if (!targetClass && !classes.length) return sendMessage(chatId, "Sinf yo'q.");
    const cls = targetClass || classes[0];
    const topic = getCurrentTopic(cls.id);
    if (!topic) return sendMessage(chatId, "Bu sinf uchun mavzu topilmadi.");
    return bot.sendMessage(chatId, `${cls.name} uchun uy vazifasi tuzilmoqda (${topic.title})...`).then(async () => {
      const content = await generateHomework(teacherId, { classId: cls.id, topic: topic.title });
      return sendMessage(chatId, `Uy vazifasi (${topic.title}):\n${content}`);
    });
  }
  if (/yillik.*(reja|plan)/.test(lower)) {
    if (!targetClass && !classes.length) return sendMessage(chatId, "Sinf yo'q.");
    const cls = targetClass || classes[0];
    try {
      const plan = generateAnnualPlan(teacherId, { classId: cls.id });
      const text = [
        `YILLIK REJA: ${cls.name}`,
        `Jami darslar: ${plan.plan.length}`,
        `Mavzular: ${plan.topicsCount}`,
        "",
        "Birinchi 10 dars:",
        ...plan.plan.slice(0, 10).map((p) => `${p.date}: ${p.topicTitle}`),
      ].join("\n");
      return sendLong(chatId, text);
    } catch (e) {
      return sendMessage(chatId, `Yillik reja: ${e.message}`);
    }
  }
  const testMatch = lower.match(/(\d+)\s*ta\s*(test|savol)/);
  if (testMatch && /test|savol.*tuz|tayyorla/.test(lower)) {
    const count = Number(testMatch[1]);
    const classes2 = classes.length ? classes : db.prepare(`SELECT * FROM classes WHERE teacher_id = ?`).all(teacherId);
    const target = targetClass || classes2[0];
    if (!target) return sendMessage(chatId, "Avval jadval yuklash orqali sinf qo'shing.");
    const topic = getCurrentTopic(target.id);
    return bot.sendMessage(chatId, `${target.name} uchun ${count} ta test tayyor...${topic ? ` (${topic.title})` : ""}`).then(async () => {
      try {
        const test = await createFullTest(teacherId, {
          class_id: target.id,
          title: `${target.name} - ${topic ? topic.title : "Test"}`,
          type: "topic",
          topic: topic ? topic.title : target.subject || "Tarix",
          question_count: count,
          subject: target.subject || "Tarix",
          class_level: target.name.match(/\d+/)?.[0] || "7",
        });
        await sendMessage(chatId, `Test yaratildi: "${test.title}" (${count} savol)\nSifat balli: ${test.qc?.score || "—"}`);
        await sendTest(chatId, test.id, { includeAnswers: false });
      } catch (e) {
        sendMessage(chatId, `Test yaratishda xato: ${e.message}`);
      }
    });
  }
  if (/eng ko.p xato|zaif|qiyin.*mavzu|muammoli.*mavzu/.test(lower)) {
    const results = db.prepare(`SELECT * FROM test_results WHERE teacher_id = ? ORDER BY created_at DESC LIMIT 10`).all(teacherId);
    if (!results.length) return sendMessage(chatId, "Natijalar yo'q.");
    const wrong = {};
    results.forEach((r) => {
      const wt = JSON.parse(r.wrong_topics_json || "{}");
      for (const [t, c] of Object.entries(wt)) wrong[t] = (wrong[t] || 0) + c;
    });
    const top = Object.entries(wrong).sort((a, b) => b[1] - a[1])[0];
    return sendMessage(chatId, top ? `Eng ko'p xato qilingan mavzu: ${top[0]} (${top[1]} marta). Shu mavzudan individual test tayyorlashni maslahat beraman.` : "Zaif mavzu topilmadi.");
  }
  if (/dars.*bekor|bekor.*dars|dars.*qoldir|qoldirish/.test(lower)) {
    const dateMatch = text.match(/\d{4}-\d{2}-\d{2}/) || text.match(/\d{2}\.\d{2}\.\d{4}/);
    if (!targetClass && !classes.length) return sendMessage(chatId, "Sinf yo'q.");
    const cls = targetClass || classes[0];
    if (!dateMatch) {
      setState(chatId, "awaiting_missed", { classId: cls.id });
      return sendMessage(chatId, "Qaysi sana darsi bekor qilindi? Sanani yozing:\nMasalan: 2026-09-15");
    }
    try {
      const result = markLessonMissed(teacherId, { date: dateMatch[0].replace(/\./g, "-"), classId: cls.id });
      return sendMessage(chatId, result.message);
    } catch (e) {
      return sendMessage(chatId, `Xato: ${e.message}`);
    }
  }
  if (/qayta taqsim|taqsimla/.test(lower)) {
    return sendMessage(chatId, "Darslar taqsimi yangilandi.");
  }
  if (/reyd|natija.*tahli|tahlil qil/.test(lower)) {
    return handleMenu(chatId, teacher, "natijalar");
  }
  if (/hisobot/.test(lower)) {
    return handleMenu(chatId, teacher, "hisobot");
  }
  if (/natija/.test(lower)) {
    return handleMenu(chatId, teacher, "natijalar");
  }
  if (/bayram.*(qo.sh|kun)/.test(lower)) {
    const dateMatch = text.match(/\d{4}-\d{2}-\d{2}/);
    if (!dateMatch) {
      return sendMessage(chatId, "Bayram kunini yozing:\nMasalan: 2026-09-01 Mustaqillik kuni");
    }
    const name = text.replace(dateMatch[0], "").replace(/bayram|kuni/gi, "").trim() || "Bayram";
    const h = addHoliday(teacherId, { date: dateMatch[0], name });
    return sendMessage(chatId, `Bayram qo'shildi: ${h.date} — ${h.name}\nBu kunga darslar rejalashtirilmaydi.`);
  }
  if (/audit|amallar tarixi/.test(lower)) {
    return handleMenu(chatId, teacher, "audit");
  }
  if (/eslatma/.test(lower)) {
    return handleMenu(chatId, teacher, "eslatmalar");
  }
  if (/mavzu/.test(lower) && /ko.rsat|royxat|list/.test(lower)) {
    return handleMenu(chatId, teacher, "mavzular");
  }
  return sendMessage(chatId, `Sizni tushunmadim. Quyidagilardan birini sinab ko'ring:
• Jadval rasmini yuboring
• Darslik yuboring (PDF/ZIP)
• "7-A uchun 10 ta test tuz"
• "7-A uchun dars rejasi tuz"
• "7-A uchun uy vazifasi tuz"
• "eng ko'p xato qilingan mavzuni top"
• "natijalarni ko'rsat"
• Menyu: /menu`);
}

// ---------- SETUP ----------
function setupCommands() {
  bot.onText(/\/start/, (msg) => handleStart(msg));
  bot.onText(/\/menu/, (msg) => {
    const teacher = getTeacherByChatId(msg.chat.id);
    if (teacher) sendMainMenu(msg.chat.id, teacher);
    else handleStart(msg);
  });

  bot.on("photo", async (msg) => {
    const teacher = getTeacherByChatId(msg.chat.id);
    if (!teacher) return handleStart(msg);
    try {
      const photo = msg.photo[msg.photo.length - 1];
      const buffer = await downloadFile(photo.file_id);
      await handleImage(msg.chat.id, teacher, buffer, "rasm");
    } catch (e) {
      sendMessage(msg.chat.id, `Rasmni yuklashda xato: ${e.message}`);
    }
  });

  bot.on("document", async (msg) => {
    const teacher = getTeacherByChatId(msg.chat.id);
    if (!teacher) return handleStart(msg);
    const doc = msg.document;
    const mime = doc.mime_type || guessMime(doc.file_name);
    const check = isValidUpload(mime, doc.file_size || 0);
    if (!check.ok) return sendMessage(msg.chat.id, `Qabul qilmadim: ${check.error}`);
    try {
      const buffer = await downloadFile(doc.file_id);
      if (mime === "application/pdf") await handlePdf(msg.chat.id, teacher, buffer, doc.file_name);
      else if (mime === "application/zip") await handleZip(msg.chat.id, teacher, buffer, doc.file_name);
      else if (mime.includes("wordprocessingml")) {
        const { text } = extractDocxText(buffer);
        setState(msg.chat.id, "pending_textbook_text", text);
        await bot.sendMessage(msg.chat.id, "Word hujjat o'qildi.", {
          reply_markup: inlineKeyboard([["✅ Darslikka qo'shish", "textbook_confirm:ok"], ["🗑️ Bekor", "textbook_confirm:cancel"]]),
        });
      }
      else sendMessage(msg.chat.id, "Bu format qo'llab-quvvatlanmaydi. PDF, DOCX yoki ZIP yuboring.");
    } catch (e) {
      sendMessage(msg.chat.id, `Faylni yuklashda xato: ${e.message}`);
    }
  });

  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data || "";
    const teacher = getTeacherByChatId(chatId);
    try {
      if (data === "auth_cancel") {
        await bot.answerCallbackQuery(query.id);
        clearState(chatId, "auth");
        return sendMessage(chatId, "Bekor qilindi. /start bilan qaytadan boshlang.");
      }
      if (data.startsWith("register:")) {
        await bot.answerCallbackQuery(query.id);
        if (teacher) return sendMainMenu(chatId, teacher);
        return askPassword(chatId, Number(data.split(":")[1]));
      }
      if (data === "switch_account") {
        await bot.answerCallbackQuery(query.id);
        return handleSwitchAccount(chatId);
      }
      if (!teacher) {
        await bot.answerCallbackQuery(query.id, { text: "Avval tizimga kiring" });
        return handleStart(query.message);
      }
      if (data === "auto_setup") return startAutoSetup(chatId, teacher);
      if (data === "help") {
        await bot.answerCallbackQuery(query.id);
        return sendMessage(chatId, "🤖 Komandalar:\n/menu — asosiy menyu\n\nOddiy til bilan yozing:\n\"7-A uchun 10 ta test tuz\"\n\"7-A uchun dars rejasi tuz\"\n\"eng ko'p xato qilingan mavzuni top\"\n\nFayl yuboring:\n📷 jadval rasmi — jadval tuziladi\n📚 PDF/rasm/ZIP — darslik saqlanadi");
      }
      if (data.startsWith("menu:")) {
        await bot.answerCallbackQuery(query.id);
        const key = data.split(":")[1];
        if (key === "back") return sendMainMenu(chatId, teacher);
        return handleMenu(chatId, teacher, key);
      }
      if (data === "confirm_timetable:ok") {
        await bot.answerCallbackQuery(query.id);
        return confirmTimetable(chatId, teacher.id).then(() => {
          if (getState(chatId, "auto_setup")) finalizeAutoSetup(chatId, teacher);
        });
      }
      if (data === "confirm_timetable:redo") {
        await bot.answerCallbackQuery(query.id);
        clearState(chatId);
        return sendMessage(chatId, "Yana rasm yuboring.");
      }
      if (data === "textbook_confirm:ok") {
        await bot.answerCallbackQuery(query.id);
        return askTextbookMeta(chatId);
      }
      if (data === "textbook_confirm:cancel") {
        await bot.answerCallbackQuery(query.id);
        clearState(chatId);
        return sendMessage(chatId, "Bekor qilindi.");
      }
      if (data.startsWith("textbook_view:")) {
        await bot.answerCallbackQuery(query.id);
        const tbId = Number(data.split(":")[1]);
        const tb = db.prepare(`SELECT * FROM textbooks WHERE id = ? AND teacher_id = ?`).get(tbId, teacher.id);
        if (!tb) return sendMessage(chatId, "Darslik topilmadi.");
        const idx = getTextbookIndex(teacher.id, tbId);
        const lessons = db.prepare(`SELECT COUNT(*) AS c FROM lessons WHERE textbook_id = ?`).get(tbId).c;
        const chunks = db.prepare(`SELECT COUNT(*) AS c FROM kb_chunks WHERE textbook_id = ?`).get(tbId).c;
        return bot.sendMessage(chatId,
          `Darslik: ${tb.title}\n${tb.grade}-sinf · ${tb.subject}\nDarslar: ${lessons} · Chunks: ${chunks}\nSanalar: ${idx.dates.length} · Shaxslar: ${idx.people.length} · Joylar: ${idx.places.length}`,
          {
            reply_markup: inlineKeyboard([
              [["Darslar royxati", `textbook_lessons:${tbId}`]],
              [["Darsliklar", "menu:darsliklar"], ["Menu", "menu:back"]],
            ]),
          }
        );
      }
      if (data.startsWith("textbook_lessons:")) {
        await bot.answerCallbackQuery(query.id);
        const tbId = Number(data.split(":")[1]);
        const lessons = db.prepare(`SELECT lesson_no, title FROM lessons WHERE textbook_id = ? AND teacher_id = ? ORDER BY lesson_no LIMIT 30`).all(tbId, teacher.id);
        if (!lessons.length) return sendMessage(chatId, "Darslar topilmadi.");
        return sendLong(chatId, "Darslar royxati:\n" + lessons.map((l) => `${l.lesson_no}. ${l.title}`).join("\n"));
      }
      if (data.startsWith("send_test:")) {
        await bot.answerCallbackQuery(query.id);
        return sendTest(chatId, Number(data.split(":")[1]));
      }
      if (data.startsWith("send_test_answers:")) {
        await bot.answerCallbackQuery(query.id);
        return sendTest(chatId, Number(data.split(":")[1]), { includeAnswers: true });
      }
      if (data.startsWith("test_view:")) {
        await bot.answerCallbackQuery(query.id);
        return sendTestWithMenu(chatId, Number(data.split(":")[1]));
      }
      if (data.startsWith("variants:")) {
        await bot.answerCallbackQuery(query.id, { text: "Variyantlar yaratilmoqda..." });
        const tid = Number(data.split(":")[1]);
        const variants = createVariants(teacher.id, tid, 3);
        if (!variants) return sendMessage(chatId, "Test topilmadi.");
        await bot.sendMessage(chatId, `✅ ${variants.length} ta variyant yaratildi (A/B/C):`);
        return sendTest(chatId, tid);
      }
      if (data.startsWith("qc:")) {
        await bot.answerCallbackQuery(query.id, { text: "Tekshirilmoqda..." });
        const tid = Number(data.split(":")[1]);
        const qc = await runTestQc(teacher.id, tid, { minScore: 85 });
        return sendMessage(chatId, `🔍 Sifat nazorati: ${qc.score}/100 ${qc.passed ? "o'tdi" : "o'tmadi"}\nTekshirilgan savollar: ${qc.reviewed}`);
      }
      if (data === "create_test") {
        await bot.answerCallbackQuery(query.id);
        const { error, keyboard } = pickClassKeyboard(teacher, "test_class");
        if (error) return sendMessage(chatId, error);
        return bot.sendMessage(chatId, "📝 Qaysi sinf uchun test tuzamiz?", { reply_markup: keyboard });
      }
      if (data === "daily_test") {
        await bot.answerCallbackQuery(query.id, { text: "Kunlik testlar yaratilmoqda..." });
        const { prepareDailyTest } = await import("./scheduler.js");
        const created = await prepareDailyTest(teacher.id);
        if (!created || !created.length) {
          return sendMessage(chatId, "Bugun uchun kunlik test yaratilmadi (bugungi jadvalda dars yo'q, mavzu yo'q yoki allaqachon yaratilgan).");
        }
        for (const t of created) await sendTest(chatId, t.id);
        return;
      }
      if (data.startsWith("del_test:")) {
        await bot.answerCallbackQuery(query.id);
        db.prepare(`DELETE FROM tests WHERE id = ? AND teacher_id = ?`).run(Number(data.split(":")[1]), teacher.id);
        return sendMessage(chatId, "Test o'chirildi.", {
          reply_markup: inlineKeyboard([[["Testlar", "menu:testlar"]]]),
        });
      }
      if (data.startsWith("regen_weak:")) {
        await bot.answerCallbackQuery(query.id, { text: "Almashtirilmoqda..." });
        const tid = Number(data.split(":")[1]);
        try {
          const weak = regenerateWeakQuestions(teacher.id, tid);
          for (const w of weak) {
            const fresh = await generateTestQuestions(teacher.id, { topic: w.topic || "Tarix", count: 1, subject: "Tarix", classLevel: "7" });
            if (fresh.length) {
              db.prepare(`UPDATE questions SET question_text = ?, options_json = ?, correct_answer = ? WHERE id = ?`)
                .run(fresh[0].question_text, JSON.stringify(fresh[0].options), fresh[0].correct_answer, w.question_id);
            }
          }
          await runTestQc(teacher.id, tid);
          return sendTest(chatId, tid);
        } catch (e) {
          return sendMessage(chatId, `Qayta yaratishda xato: ${e.message}`);
        }
      }

      // ---- REPORTS ----
      if (data.startsWith("report_class:")) {
        await bot.answerCallbackQuery(query.id, { text: "Hisobot tayyorlanmoqda..." });
        const [, type, classId] = data.split(":");
        const report = type === "monthly" ? monthlyReport(teacher.id, Number(classId)) : weeklyReport(teacher.id, Number(classId));
        const sections = [
          { heading: "Sinf", body: report.className || "" },
          { heading: "Testlar soni", body: String(report.testsTaken) },
          { heading: "O'rtacha natija", body: report.average != null ? `${report.average}%` : "-" },
        ];
        if (report.best?.length) sections.push({ heading: "Eng yaxshi o'quvchilar", items: report.best.map((s) => `${s.name} — ${s.avg}%`) });
        if (report.needsHelp?.length) sections.push({ heading: "Yordam kerak", items: report.needsHelp.map((s) => `${s.name} — ${s.avg}%`) });
        if (report.worstTopic) sections.push({ heading: "Eng ko'p xato mavzu", body: `${report.worstTopic.topic} (${report.worstTopic.mistakes} xato)` });
        if (report.topStudents?.length) sections.push({ heading: "Top o'quvchilar", items: report.topStudents.map((s) => `${s.name} — ${s.avg}%`) });
        const title = type === "monthly" ? "OYLIK HISOBOT" : "HAFTALIK HISOBOT";
        try {
          const pdf = await generateReportPdf({ title, sections });
          const docx = generateReportDocx({ title, sections });
          const docxBuffer = await import("docx").then(({ Packer }) => Packer.toBuffer(docx));
          await bot.sendMessage(chatId, `Hisobot: ${title} (${report.className || ""})`);
          await bot.sendDocument(chatId, Buffer.from(pdf), { filename: `${type === "monthly" ? "oylik" : "haftalik"}-hisobot.pdf` });
          await bot.sendDocument(chatId, docxBuffer, { filename: `${type === "monthly" ? "oylik" : "haftalik"}-hisobot.docx` });
        } catch (e) {
          return sendMessage(chatId, `Hisobot yaratishda xato: ${e.message}`);
        }
        return bot.sendMessage(chatId, "Amallar:", {
          reply_markup: inlineKeyboard([[["Menu", "menu:back"]]]),
        });
      }

      // ---- STUDENTS ----
      if (data.startsWith("student_view:")) {
        await bot.answerCallbackQuery(query.id);
        const st = db.prepare(`SELECT s.*, c.name AS class_name FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ? AND s.teacher_id = ?`).get(Number(data.split(":")[1]), teacher.id);
        if (!st) return sendMessage(chatId, "O'quvchi topilmadi.");
        const results = db.prepare(`SELECT * FROM test_results WHERE student_id = ? ORDER BY id DESC LIMIT 5`).all(st.id);
        const avg = results.length ? Math.round(results.reduce((a, r) => a + r.percent, 0) / results.length) : null;
        const weakness = analyzeStudentWeaknesses(st.id);
        const lines = [
          `O'quvchi: ${st.first_name} ${st.last_name}`,
          `Sinf: ${st.class_name}`,
          `O'rtacha ball: ${avg != null ? avg + "%" : "natija yo'q"}`,
        ];
        if (weakness.weakTopics.length) lines.push(`Zaif mavzular: ${weakness.weakTopics.map((w) => `${w.topic} (${w.mistakes} xato)`).join(", ")}`);
        if (results.length) lines.push(`So'nggi natijalar:\n${results.map((r) => `  ${r.percent}% (${r.grade})`).join("\n")}`);
        return bot.sendMessage(chatId, lines.join("\n"), {
          reply_markup: inlineKeyboard([
            [["Individual test tuzish", `individual_test:${st.id}`]],
            [["Rivojlanish hisoboti", `dev_report:${st.id}`]],
            [["O'quvchilar", "menu:oquvchilar"]],
          ]),
        });
      }
      if (data.startsWith("dev_report:")) {
        await bot.answerCallbackQuery(query.id);
        const dev = developmentReport(Number(data.split(":")[1]));
        const lines = [
          `RIVOJLANISH: ${dev.student}`,
          `O'rtacha: ${dev.average != null ? dev.average + "%" : "-"}`,
          `Trend: ${dev.trend > 0 ? "+" : ""}${dev.trend}%`,
        ];
        if (dev.progression.length) lines.push(`Natijalar:\n${dev.progression.map((p) => `  ${(p.date || "").slice(0, 10)} — ${p.percent}% (${p.grade})`).join("\n")}`);
        return sendMessage(chatId, lines.join("\n"));
      }
      if (data === "add_student") {
        await bot.answerCallbackQuery(query.id);
        const { error, keyboard } = pickClassKeyboard(teacher, "add_student_class");
        if (error) return sendMessage(chatId, error);
        return bot.sendMessage(chatId, "Qaysi sinfga o'quvchi qo'shamiz?", { reply_markup: keyboard });
      }
      if (data.startsWith("add_student_class:")) {
        await bot.answerCallbackQuery(query.id);
        setState(chatId, "awaiting_student", { classId: Number(data.split(":")[1]) });
        return sendMessage(chatId, "O'quvchi ism-familyasini yozing:\nMasalan: Ali Valiyev");
      }
      if (data.startsWith("individual_test:")) {
        await bot.answerCallbackQuery(query.id, { text: "Individual test tuzilmoqda..." });
        const studentId = Number(data.split(":")[1]);
        const st = db.prepare(`SELECT s.*, c.name AS class_name, c.id AS class_id FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ? AND s.teacher_id = ?`).get(studentId, teacher.id);
        if (!st) return sendMessage(chatId, "O'quvchi topilmadi.");
        const analysis = analyzeStudentWeaknesses(studentId);
        const weakTopics = analysis.weakTopics.map((w) => w.topic);
        const topic = weakTopics[0] || getCurrentTopic(st.class_id)?.title || "Tarix";
        const adapt = adaptiveDifficulty(analysis.recentPercent ?? 50);
        const test = await createFullTest(teacher.id, {
          class_id: st.class_id,
          title: `Individual test: ${st.first_name} ${st.last_name}`,
          type: "individual",
          topic,
          question_count: 10,
          subject: "Tarix",
          difficulty_easy: adapt.easy,
          difficulty_medium: adapt.medium,
          difficulty_hard: adapt.hard,
        });
        await sendMessage(chatId, `Individual test tayyor: "${test.title}" (${topic} mavzusi, adaptiv qiyinlik ${adapt.easy}/${adapt.medium}/${adapt.hard}%)`);
        return sendTest(chatId, test.id, { includeAnswers: true });
      }

      // ---- LESSON PLAN / ANNUAL PLAN / HOMEWORK ----
      if (data.startsWith("plan_class:")) {
        await bot.answerCallbackQuery(query.id, { text: "Dars rejasi tuzilmoqda..." });
        const classId = Number(data.split(":")[1]);
        const cls = db.prepare(`SELECT * FROM classes WHERE id = ? AND teacher_id = ?`).get(classId, teacher.id);
        const topic = getCurrentTopic(classId);
        if (!topic) return sendMessage(chatId, "Bu sinf uchun mavzu topilmadi. Darslik yuklang.");
        try {
          const plan = await generateLessonPlan(teacher.id, { classId, topic: topic.title, subject: cls?.subject || "Tarix", classLevel: String(cls?.name || "7").match(/\d+/)?.[0] || "7" });
          const hw = await generateHomework(teacher.id, { classId, topic: topic.title });
          const conspectus = await generateConspectus(teacher.id, { topic: topic.title, subject: cls?.subject || "Tarix" });
          const planText = [
            `DARS REJASI: ${topic.title} (${cls?.name})`,
            "",
            `Maqsad: ${plan.maqsad}`,
            `Natija: ${plan.kutilayotgan_natija}`,
            `Kirish: ${plan.kirish_qismi}`,
            "",
            "Asosiy tushunchalar:",
            ...(plan.asosiy_tushunchalar || []).map((x) => "• " + x),
            "",
            `Konspekt kirish: ${conspectus.kirish}`,
            "Konspekt asosiy holatlar:",
            ...(conspectus.asosiy_holatlar || []).map((x) => "• " + x),
            "",
            "Uy vazifasi:",
            ...(plan.uy_vazifasi || []).map((x) => "• " + x),
            "",
            `Yangi uy vazifasi: ${hw}`,
          ].join("\n");
          await sendLong(chatId, planText);
          const planRow = db.prepare(`SELECT * FROM lesson_plans WHERE teacher_id = ? AND class_id = ? AND topic = ? ORDER BY id DESC LIMIT 1`).get(teacher.id, classId, topic.title);
          if (planRow) {
            const parsed = JSON.parse(planRow.plan_json);
            const doc = generatePlanDocx({
              title: `DARS REJASI: ${topic.title}`,
              fields: [
                { label: "Dars maqsadi", value: parsed.maqsad || "" },
                { label: "Kutilayotgan natija", value: parsed.kutilayotgan_natija || "" },
                { label: "Kirish qismi", value: parsed.kirish_qismi || "" },
                ...(Array.isArray(parsed.asosiy_tushunchalar) ? [{ label: "Asosiy tushunchalar", value: parsed.asosiy_tushunchalar.join("\n") }] : []),
                ...(Array.isArray(parsed.tarixiy_faktlar) ? [{ label: "Tarixiy faktlar", value: parsed.tarixiy_faktlar.join("\n") }] : []),
                ...(Array.isArray(parsed.uy_vazifasi) ? [{ label: "Uy vazifasi", value: parsed.uy_vazifasi.join("\n") }] : []),
              ],
            });
            const docxBuffer = await import("docx").then(({ Packer }) => Packer.toBuffer(doc));
            await bot.sendDocument(chatId, docxBuffer, { filename: `dars-rejasi-${topic.title.slice(0, 40)}.docx` });
          }
          return;
        } catch (e) {
          return sendMessage(chatId, `Dars rejasi xatosi: ${e.message}`);
        }
      }
      if (data.startsWith("annual_class:")) {
        await bot.answerCallbackQuery(query.id, { text: "Yillik reja tuzilmoqda..." });
        const classId = Number(data.split(":")[1]);
        const cls = db.prepare(`SELECT * FROM classes WHERE id = ? AND teacher_id = ?`).get(classId, teacher.id);
        try {
          const plan = generateAnnualPlan(teacher.id, { classId });
          const text = [
            `YILLIK REJA: ${cls?.name}`,
            `Jami darslar: ${plan.plan.length}`,
            `Mavzular: ${plan.topicsCount}`,
            `Boshlanish: ${plan.plan[0]?.date || "-"}`,
            "",
            "Birinchi 10 dars:",
            ...plan.plan.slice(0, 10).map((p) => `${p.date}: ${p.topicTitle}`),
          ].join("\n");
          return sendLong(chatId, text);
        } catch (e) {
          return sendMessage(chatId, `Yillik reja: ${e.message}`);
        }
      }
      if (data === "create_homework") {
        await bot.answerCallbackQuery(query.id);
        const { error, keyboard } = pickClassKeyboard(teacher, "hw_class");
        if (error) return sendMessage(chatId, error);
        return bot.sendMessage(chatId, "Qaysi sinf uchun uy vazifasi tuzamiz?", { reply_markup: keyboard });
      }
      if (data.startsWith("hw_class:")) {
        await bot.answerCallbackQuery(query.id, { text: "Uy vazifasi tuzilmoqda..." });
        const classId = Number(data.split(":")[1]);
        const topic = getCurrentTopic(classId);
        if (!topic) return sendMessage(chatId, "Bu sinf uchun mavzu topilmadi.");
        const content = await generateHomework(teacher.id, { classId, topic: topic.title });
        return sendMessage(chatId, `Uy vazifasi tayyor (${topic.title}):\n${content}`);
      }

      // ---- SCHEDULE ADD ----
      if (data === "add_schedule") {
        await bot.answerCallbackQuery(query.id);
        const { error, keyboard } = pickClassKeyboard(teacher, "sched_class");
        if (error) return sendMessage(chatId, error);
        return bot.sendMessage(chatId, "Qaysi sinfga dars qo'shamiz?", { reply_markup: keyboard });
      }
      if (data.startsWith("sched_class:")) {
        await bot.answerCallbackQuery(query.id);
        setState(chatId, "awaiting_schedule", { classId: Number(data.split(":")[1]) });
        return sendMessage(chatId, "Dars kun/vaqtni yozing:\nMasalan: Dushanba 08:00\nyoki: 1 08:00");
      }

      // ---- MATERIAL ----
      if (data === "add_material") {
        await bot.answerCallbackQuery(query.id);
        setState(chatId, "awaiting_material", true);
        return sendMessage(chatId, "Material sarlavhasi va matnini yozing:\nMasalan:\nSarlavha: Amir Temur\nMatn: Amir Temur 1336-yilda...");
      }

      // ---- SETTINGS ----
      if (data.startsWith("settings:")) {
        await bot.answerCallbackQuery(query.id);
        const key = data.split(":")[1];
        if (key === "daily") {
          setState(chatId, "awaiting_setting", { key: "daily" });
          return sendMessage(chatId, "Kunlik test sozlamasini yozing:\nMasalan: yoqilgan 08:00 10 savol\nyoki: o'chirilgan");
        }
        if (key === "count") {
          setState(chatId, "awaiting_setting", { key: "count" });
          return sendMessage(chatId, "Standart test savollar sonini yozing (5-50):\nMasalan: 20");
        }
        if (key === "difficulty") {
          setState(chatId, "awaiting_setting", { key: "difficulty" });
          return sendMessage(chatId, "Qiyinlik nisbatini yozing (oson/o'rta/qiyin):\nMasalan: 30 50 20");
        }
        if (key === "scheduler") {
          const rows = db.prepare(`SELECT key, value_json FROM settings WHERE teacher_id = ?`).all(teacher.id);
          const s = {};
          rows.forEach((r) => (s[r.key] = JSON.parse(r.value_json)));
          const newValue = s.scheduler_enabled ? 0 : 1;
          db.prepare(`INSERT INTO settings (teacher_id, key, value_json) VALUES (?, 'scheduler_enabled', ?)
            ON CONFLICT(teacher_id, key) DO UPDATE SET value_json = excluded.value_json`).run(teacher.id, JSON.stringify(newValue));
          return sendMessage(chatId, `Avtomatik rejim ${newValue ? "yoqildi" : "o'chirildi"}. Server qayta ishga tushganda kuchga kiradi.`);
        }
      }
      if (data === "auto_setup:view") {
        await bot.answerCallbackQuery(query.id);
        handleMenu(chatId, teacher, "darsliklar");
        handleMenu(chatId, teacher, "jadval");
        return;
      }
      await bot.answerCallbackQuery(query.id);
    } catch (e) {
      await bot.answerCallbackQuery(query.id, { text: `Xato: ${e.message}` }).catch(() => {});
      enqueue(teacher?.id || 0, "telegram", { data }, e.message);
      sendMessage(chatId, `Xato: ${e.message}`);
    }
  });

  bot.on("message", async (msg) => {
    const text = msg.text;
    if (!text) return;
    const chatId = msg.chat.id;
    const teacher = getTeacherByChatId(chatId);

    // ---- AUTH: parol kutish ----
    const auth = getState(chatId, "auth");
    if (auth && auth.step === "password") {
      return verifyPassword(chatId, text);
    }

    if (!teacher) {
      if (!text.startsWith("/")) return handleStart(msg);
      return;
    }
    if (text.startsWith("/menu")) return sendMainMenu(chatId, teacher);
    if (text.startsWith("/")) return;

    // ---- TEXTBOOK META ----
    if (getState(chatId, "awaiting_meta")) {
      clearState(chatId, "awaiting_meta");
      return processTextbookMeta(chatId, teacher, text);
    }

    // ---- AWAITING MISSED LESSON DATE ----
    const awaitingMissed = getState(chatId, "awaiting_missed");
    if (awaitingMissed) {
      clearState(chatId, "awaiting_missed");
      const dateMatch = text.match(/\d{4}-\d{2}-\d{2}/) || text.match(/\d{2}\.\d{2}\.\d{4}/);
      if (!dateMatch) return sendMessage(chatId, "Sana formati: 2026-09-15");
      try {
        const result = markLessonMissed(teacher.id, { date: dateMatch[0].replace(/\./g, "-"), classId: awaitingMissed.classId });
        return sendMessage(chatId, result.message);
      } catch (e) {
        return sendMessage(chatId, `Xato: ${e.message}`);
      }
    }

    // ---- AWAITING STUDENT NAME ----
    const awaitingStudent = getState(chatId, "awaiting_student");
    if (awaitingStudent) {
      clearState(chatId, "awaiting_student");
      const parts = text.trim().split(/\s+/);
      if (!parts[0]) return sendMessage(chatId, "Ism bo'sh bo'lmasin.");
      db.prepare(`INSERT INTO students (class_id, teacher_id, first_name, last_name) VALUES (?, ?, ?, ?)`)
        .run(awaitingStudent.classId, teacher.id, parts[0], parts.slice(1).join(" "));
      db.prepare(`UPDATE classes SET student_count = (SELECT COUNT(*) FROM students WHERE class_id = ?) WHERE id = ?`)
        .run(awaitingStudent.classId, awaitingStudent.classId);
      return sendMessage(chatId, `O'quvchi qo'shildi: ${text}`, {
        reply_markup: inlineKeyboard([[["O'quvchilar", "menu:oquvchilar"]]]),
      });
    }

    // ---- AWAITING SCHEDULE ----
    const awaitingSchedule = getState(chatId, "awaiting_schedule");
    if (awaitingSchedule) {
      clearState(chatId, "awaiting_schedule");
      const dayNames = ["dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba", "yakshanba"];
      const lower = text.toLowerCase();
      let day = null;
      const dayNumMatch = lower.match(/^([1-7])\b/);
      if (dayNumMatch) day = Number(dayNumMatch[1]);
      else {
        for (let i = 0; i < dayNames.length; i++) {
          if (lower.includes(dayNames[i])) { day = i + 1; break; }
        }
      }
      const timeMatch = lower.match(/([01]?\d|2[0-3]):([0-5]\d)/);
      if (!day || !timeMatch) return sendMessage(chatId, "Tushunmadim. Masalan: Dushanba 08:00");
      db.prepare(`INSERT INTO schedule (teacher_id, class_id, day_of_week, start_time, subject) VALUES (?, ?, ?, ?, 'Tarix')`)
        .run(teacher.id, awaitingSchedule.classId, day, timeMatch[0]);
      return sendMessage(chatId, `Dars qo'shildi: ${DAY_NAMES[day]} ${timeMatch[0]}`, {
        reply_markup: inlineKeyboard([[["Jadval", "menu:jadval"]]]),
      });
    }

    // ---- AWAITING MATERIAL ----
    if (getState(chatId, "awaiting_material")) {
      clearState(chatId, "awaiting_material");
      const lines = text.split("\n");
      let title = text.slice(0, 60);
      let content = text;
      const titleLine = lines.find((l) => /^(sarlavha|nom|title)\s*[:=]/i.test(l));
      const contentLineIdx = lines.findIndex((l) => /^(matn|content)\s*[:=]/i.test(l));
      if (titleLine) title = titleLine.replace(/^[^:]+=?\s*/, "").trim();
      if (contentLineIdx >= 0) content = lines.slice(contentLineIdx + 1).join("\n") || text;
      db.prepare(`INSERT INTO materials (teacher_id, title, content, source_type) VALUES (?, ?, ?, 'text')`)
        .run(teacher.id, title, content);
      return sendMessage(chatId, `Material saqlandi: ${title}`, {
        reply_markup: inlineKeyboard([[["Materiallar", "menu:material"]]]),
      });
    }

    // ---- AWAITING SETTING ----
    const awaitingSetting = getState(chatId, "awaiting_setting");
    if (awaitingSetting) {
      clearState(chatId, "awaiting_setting");
      const upsert = (key, value) => db.prepare(
        `INSERT INTO settings (teacher_id, key, value_json) VALUES (?, ?, ?)
         ON CONFLICT(teacher_id, key) DO UPDATE SET value_json = excluded.value_json`
      ).run(teacher.id, key, JSON.stringify(value));
      if (awaitingSetting.key === "daily") {
        const lower = text.toLowerCase();
        if (/ochirilgan|o'chirilgan|off/.test(lower)) {
          upsert("daily_test_enabled", false);
          return sendMessage(chatId, "Kunlik test o'chirildi.");
        }
        const timeMatch = lower.match(/([01]?\d|2[0-3]):([0-5]\d)/);
        const countMatch = lower.match(/(\d+)\s*(ta\s*)?savol/);
        if (timeMatch) upsert("daily_test_time", timeMatch[0]);
        if (countMatch) upsert("daily_test_count", Number(countMatch[1]));
        upsert("daily_test_enabled", true);
        return sendMessage(chatId, `Kunlik test yoqildi: ${timeMatch ? timeMatch[0] : "avvalgi vaqt"}, ${countMatch ? countMatch[1] + " savol" : "avvalgi son"}.`);
      }
      if (awaitingSetting.key === "count") {
        const n = Math.min(50, Math.max(5, Number(text.replace(/\D/g, "")) || 20));
        upsert("test_count", n);
        return sendMessage(chatId, `Standart test savollar soni: ${n}`);
      }
      if (awaitingSetting.key === "difficulty") {
        const nums = text.match(/\d+/g);
        if (nums && nums.length >= 3) {
          const [e, m, h] = nums.slice(0, 3).map(Number);
          upsert("difficulty_easy", e);
          upsert("difficulty_medium", m);
          upsert("difficulty_hard", h);
          return sendMessage(chatId, `Qiyinlik: ${e}/${m}/${h}%`);
        }
        return sendMessage(chatId, "Uchta son yozing, masalan: 30 50 20");
      }
    }

    // ---- NATURAL LANGUAGE ----
    return handleNL(chatId, teacher, text);
  });

  bot.on("polling_error", (err) => {
    enqueue(0, "telegram", { error: String(err).slice(0, 200) });
  });
}

export function getBotInfo() {
  return { enabled: telegramEnabled, username: bot ? (bot.options?.username || "bot") : null };
}
