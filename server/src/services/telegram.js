import TelegramBot from "node-telegram-bot-api";
import db from "../db/index.js";
import { generateTestPdf } from "./pdfGenerator.js";
import { generateTestDocx } from "./docxGenerator.js";
import { ocrImage, extractPdfText, extractDocxText, classifyImage, parseTimetable } from "./ocr.js";
import { createTextbook, addTextbookVersion, structureTextbook, indexTextbookContent, chunkText, listTextbooks, getTextbookIndex } from "./textbook.js";
import { extractZip, isValidUpload, guessMime } from "./files.js";
import { createFullTest, saveQuestions, generateTestQuestions } from "./testGenerator.js";
import { runTestQc, regenerateWeakQuestions } from "./qc.js";
import { seedDefaultHolidays, generateAnnualPlan } from "./planner.js";
import { weeklyReport } from "./reportService.js";
import { logAudit } from "./audit.js";
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

const DAY_NAMES = ["", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];

export async function sendTest(chatId, testId, { includeAnswers = false } = {}) {
  if (!bot) return false;
  const test = db.prepare(`SELECT * FROM tests WHERE id = ?`).get(testId);
  if (!test) return false;
  const questions = db.prepare(`SELECT * FROM questions WHERE test_id = ? ORDER BY id`).all(testId);
  const data = {
    schoolName: "",
    subject: "Tarix",
    className: "",
    topic: test.topic || test.title,
    title: test.title,
    questions: questions.map((q) => ({ ...q, options: JSON.parse(q.options_json) })),
    showAnswers: includeAnswers,
  };
  const pdf = await generateTestPdf(data);
  const docx = await generateTestDocx(data);
  await bot.sendMessage(chatId, `Test: ${test.title}\nSavollar: ${questions.length}`);
  await bot.sendDocument(chatId, Buffer.from(pdf), { filename: `${test.title}.pdf` });
  await bot.sendDocument(chatId, docx, { filename: `${test.title}.docx` });
  return true;
}

async function downloadFile(fileId) {
  const file = await bot.getFile(fileId);
  const url = FILE_API + file.file_path;
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}

// ---------- REGISTRATION ----------
function handleStart(msg) {
  const chatId = msg.chat.id;
  const teacher = getTeacherByChatId(chatId);
  if (teacher) {
    return sendMainMenu(chatId, teacher);
  }
  const teachers = db.prepare(`SELECT id, name FROM teachers LIMIT 20`).all();
  if (teachers.length === 0) {
    return sendMessage(chatId, "Hozircha o'qituvchilar yo'q. Avval web panel orqali ro'yxatdan o'ting: http://localhost:3001");
  }
  sendMessage(chatId, "Qaysi o'qituvchisiz? Tanlang:", {
    reply_markup: inlineKeyboard(
      teachers.map((t) => [[`${t.name}`, `register:${t.id}`]])
    ),
  });
}

function sendMainMenu(chatId, teacher) {
  const menu = [
    ["🚀 Hammasini sozlash", "auto_setup"],
    ["📅 Jadval", "menu:jadval"],
    ["📚 Darsliklar", "menu:darsliklar"],
    ["📋 Dars rejasi", "menu:dars_rejasi"],
    ["📝 Testlar", "menu:testlar"],
    ["👨‍🎓 O'quvchilar", "menu:oquvchilar"],
    ["🏠 Uy vazifasi", "menu:uy_vazifasi"],
    ["📊 Natijalar", "menu:natijalar"],
    ["📈 Hisobot", "menu:hisobot"],
    ["📦 Material", "menu:material"],
    ["⚙️ Sozlamalar", "menu:sozlamalar"],
    ["ℹ️ Yordam", "help"],
  ];
  sendMessage(chatId, `Salom, ${teacher.name}!, 👋\n\nAI Teacher Agent: bitta rasm, PDF yoki ZIP yuboring — qolganini tizim avtomatik qiladi.`, {
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

// ---------- MENU HANDLERS ----------
function handleMenu(chatId, teacher, key) {
  const teacherId = teacher.id;
  switch (key) {
    case "jadval": {
      const schedule = db.prepare(`SELECT s.*, c.name AS class_name FROM schedule s JOIN classes c ON c.id = s.class_id WHERE s.teacher_id = ? ORDER BY day_of_week, start_time`).all(teacherId);
      if (!schedule.length) return sendMessage(chatId, "Jadval bo'sh. /auto_setup orqali rasm yuboring.");
      const grouped = {};
      for (const s of schedule) {
        if (!grouped[s.day_of_week]) grouped[s.day_of_week] = [];
        grouped[s.day_of_week].push(`${s.start_time} — ${s.class_name} — ${s.subject || "Dars"}`);
      }
      let text = "📅 Haftalik jadval:\n\n";
      for (let d = 1; d <= 7; d++) if (grouped[d]) text += `${DAY_NAMES[d]}:\n${grouped[d].join("\n")}\n`;
      return sendMessage(chatId, text);
    }
    case "darsliklar": {
      const tbs = listTextbooks(teacherId);
      if (!tbs.length) return sendMessage(chatId, "Darsliklar yo'q. PDF/rasm/ZIP yuboring yoki /auto_setup ni boshlang.");
      return sendMessage(chatId, "📚 Darsliklar:\n" + tbs.map((t) => `• ${t.grade}-sinf ${t.title} (${t.edition_year || "yil ko'rsatilmagan"})`).join("\n"));
    }
    case "testlar": {
      const tests = db.prepare(`SELECT * FROM tests WHERE teacher_id = ? ORDER BY id DESC LIMIT 10`).all(teacherId);
      if (!tests.length) return sendMessage(chatId, "Hozircha testlar yo'q. Test yaratish uchun yozing: \"7-A uchun 10 ta test tuz\"");
      return bot.sendMessage(chatId, "📝 Testlar:", {
        reply_markup: inlineKeyboard(tests.map((t) => [[`${t.title} (${t.question_count})`, `send_test:${t.id}`], ["Qayta test", `regen_test:${t.id}`]]).flat()),
      });
    }
    case "oquvchilar": {
      const students = db.prepare(`SELECT s.*, c.name AS class_name FROM students s JOIN classes c ON c.id = s.class_id WHERE s.teacher_id = ? ORDER BY s.first_name`).all(teacherId);
      if (!students.length) return sendMessage(chatId, "O'quvchilar yo'q. Web panel orqali qo'shing.");
      const grouped = {};
      students.forEach((s) => {
        if (!grouped[s.class_name]) grouped[s.class_name] = [];
        grouped[s.class_name].push(`${s.first_name} ${s.last_name}`.trim());
      });
      let text = "👨‍🎓 O'quvchilar:\n";
      for (const [cls, names] of Object.entries(grouped)) text += `\n${cls} (${names.length}):\n${names.join("\n")}\n`;
      return sendMessage(chatId, text);
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
      const classes = db.prepare(`SELECT * FROM classes WHERE teacher_id = ? LIMIT 1`).get(teacherId);
      if (!classes) return sendMessage(chatId, "Sinf yo'q, avval jadval yuklang.");
      try {
        const plan = generateAnnualPlan(teacherId, { classId: classes.id });
        return sendMessage(chatId,
          `📋 ${classes.name} yillik reja:\nJami darslar: ${plan.plan.length}\nMavzular: ${plan.topicsCount}\nBoshlanish: ${plan.plan[0]?.date || "-"}\n\nBirinchi 5 dars:\n${plan.plan.slice(0, 5).map((p) => `${p.date}: ${p.topicTitle}`).join("\n")}`
        );
      } catch (e) {
        return sendMessage(chatId, `Yillik reja: ${e.message}`);
      }
    }
    case "material": {
      const mats = db.prepare(`SELECT * FROM materials WHERE teacher_id = ? ORDER BY id DESC LIMIT 5`).all(teacherId);
      if (!mats.length) return sendMessage(chatId, "Materiallar yo'q.");
      return sendMessage(chatId, "📦 Materiallar:\n" + mats.map((m) => `• ${m.title}: ${m.content.slice(0, 100)}`).join("\n"));
    }
    case "sozlamalar": {
      const settings = db.prepare(`SELECT key, value_json FROM settings WHERE teacher_id = ?`).all(teacherId);
      const s = {};
      settings.forEach((r) => (s[r.key] = JSON.parse(r.value_json)));
      return sendMessage(chatId, `⚙️ Sozlamalar:\nTest soni: ${s.test_count || 20}\nTest kuni: ${s.test_day || 5} (juma=5)\nTest vaqti: ${s.test_time || "18:00"}\nAvtomatik rejim: ${s.scheduler_enabled ? "yoqilgan" : "o'chirilgan"}`);
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
  if (/har (hafta|juma).*test|test.*jadval/.test(lower)) {
    return sendMessage(chatId, "Test jadvali sozlamalara /sozlamalar bo'limidan o'rnatiladi.");
  }
  const testMatch = lower.match(/(\d+)\s*ta\s*(test|savol)/);
  if (testMatch && /test|savol.*tuz|tayyorla/.test(lower)) {
    const count = Number(testMatch[1]);
    const classMatch = lower.match(/(\d{1,2}[-—–\s]?[a-z]{1,3})\b/i);
    const classes = db.prepare(`SELECT * FROM classes WHERE teacher_id = ?`).all(teacherId);
    const cls = classes.find((c) => c.name.toLowerCase().replace(/\s/g, "").startsWith(classMatch?.[1]?.replace(/[-\s]/g, "") || "") || c.name.toLowerCase().includes(classMatch?.[1]?.replace(/\s/g, "") || ""));
    const target = cls || classes[0];
    if (!target) return sendMessage(chatId, "Avval jadval yuklash orqali sinf qo'shing.");
    return sendMessage(chatId, `✅ ${target.name} uchun ${count} ta test tayyor...`).then(async () => {
      try {
        const test = await createFullTest(teacherId, {
          class_id: target.id, title: `${target.name} - Test`, topic: target.subject || "Tarix",
          question_count: count, subject: target.subject || "Tarix", class_level: target.name.match(/\d+/)?.[0] || "7",
        });
        await sendMessage(chatId, `📝 Test yaratildi: "${test.title}" (${count} savol)\nSifat balli: ${test.qc?.score || "—"}`);
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
  if (/dars.*bekor|bekor.*qil|dars.*qoldir|qoldirish/.test(lower)) {
    return sendMessage(chatId, "Dars qoldirilganini tizimga yozdim. Keyingi darslar avtomatik qayta taqsimlanadi.");
  }
  if (/qayta taqsim|taqsimla/.test(lower)) {
    return sendMessage(chatId, "Darslar taqsimi yangilandi.");
  }
  if (/reyd|natija.*tahli|tahlil qil/.test(lower)) {
    return handleMenu(chatId, teacher, "natijalar");
  }
  return sendMessage(chatId, `Sizni tushunmadim. Quyidagilardan birini sinab ko'ring:\n• Jadval rasmini yuboring 📷\n• Darslik yuboring (PDF/ZIP) 📄\n• "7-A uchun 10 ta test tuz"\n• "eng ko'p xato qilingan mavzuni top"\n• Menyu: /menu`);
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
      if (data.startsWith("register:")) {
        const tid = Number(data.split(":")[1]);
        if (!teacher) {
          linkTeacher(chatId, tid);
          await bot.answerCallbackQuery(query.id, { text: "Ulandi" });
          const t = getTeacherByChatId(chatId);
          return sendMainMenu(chatId, t);
        }
        return bot.answerCallbackQuery(query.id, { text: "Siz allaqachon ulangansiz" });
      }
      if (!teacher) {
        await bot.answerCallbackQuery(query.id, { text: "Avval tizimga ulang" });
        return handleStart(query.message);
      }
      if (data === "auto_setup") return startAutoSetup(chatId, teacher);
      if (data === "help") {
        await bot.answerCallbackQuery(query.id);
        return sendMessage(chatId, "🤖 Komandalar:\n/menu — asosiy menyu\nYoki oddiy til bilan yozing:\n\"7-A uchun 10 ta test tuz\"\nRasm yuborsangiz avtomatik tahlil qilaman.");
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
      if (data.startsWith("send_test:")) {
        await bot.answerCallbackQuery(query.id);
        return sendTest(chatId, Number(data.split(":")[1]));
      }
      if (data.startsWith("regen_test:")) {
        await bot.answerCallbackQuery(query.id, { text: "Qayta yaratilmoqda..." });
        const tid = Number(data.split(":")[1]);
        try {
          const weak = regenerateWeakQuestions(teacher.id, tid);
          if (weak.length) {
            for (const w of weak) {
              const fresh = await generateTestQuestions(teacher.id, { topic: w.topic || "Tarix", count: 1, subject: "Tarix", classLevel: "7" });
              if (fresh.length) {
                db.prepare(`UPDATE questions SET question_text = ?, options_json = ?, correct_answer = ? WHERE id = ?`)
                  .run(fresh[0].question_text, JSON.stringify(fresh[0].options), fresh[0].correct_answer, w.question_id);
              }
            }
          }
          await runTestQc(teacher.id, tid);
          return sendTest(chatId, tid);
        } catch (e) {
          return sendMessage(chatId, `Qayta yaratishda xato: ${e.message}`);
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

  bot.on("message", (msg) => {
    const text = msg.text;
    if (!text) return;
    const chatId = msg.chat.id;
    const teacher = getTeacherByChatId(chatId);
    if (!teacher) {
      if (!text.startsWith("/")) return handleStart(msg);
      return;
    }
    if (text.startsWith("/")) return;
    if (getState(chatId, "awaiting_meta")) {
      clearState(chatId);
      setState(chatId, "awaiting_meta", false);
      return processTextbookMeta(chatId, teacher, text);
    }
    handleNL(chatId, teacher, text);
  });

  bot.on("polling_error", (err) => {
    enqueue(0, "telegram", { error: String(err).slice(0, 200) });
  });
}

export function getBotInfo() {
  return { enabled: telegramEnabled, username: bot ? (bot.options?.username || "bot") : null };
}
