import db from "../db/index.js";
import { logAudit } from "./audit.js";

export function isHolidayOrDayOff(teacherId, dateStr) {
  const dayNames = ["", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];
  const d = new Date(dateStr + "T00:00:00Z");
  let dow = d.getUTCDay();
  if (dow === 0) dow = 7;
  if (dow === 7) return { closed: true, reason: "Yakshanba (dam olish)" };
  if (dow === 6) return { closed: true, reason: "Shanba (dam olish)" };
  const holiday = db
    .prepare(`SELECT * FROM holidays WHERE teacher_id = ? AND date = ?`)
    .get(teacherId, dateStr);
  if (holiday) return { closed: true, reason: holiday.name || "Bayram" };
  return { closed: false, dayName: dayNames[dow] };
}

export function addHoliday(teacherId, { date, name = "", is_holiday = 1 }) {
  const info = db.prepare(`INSERT INTO holidays (teacher_id, date, name, is_holiday) VALUES (?, ?, ?, ?)`).run(teacherId, date, name, is_holiday);
  return db.prepare(`SELECT * FROM holidays WHERE id = ?`).get(info.lastInsertRowid);
}

export function defaultHolidays(year, { teacherId } = {}) {
  return [
    { date: `${year}-01-01`, name: "Yangi yil" },
    { date: `${year}-01-14`, name: "Vatan himoyachilari kuni" },
    { date: `${year}-03-08`, name: "Xalqaro xotin-qizlar kuni" },
    { date: `${year}-03-21`, name: "Navro'z bayrami" },
    { date: `${year}-05-09`, name: "Xotira va qadrlash kuni" },
    { date: `${year}-09-01`, name: "Mustaqillik kuni" },
    { date: `${year}-10-01`, name: "O'qituvchilar kuni" },
    { date: `${year}-12-08`, name: "O'zbekiston Respublikasi Konstitutsiyasi kuni" },
  ];
}

export function seedDefaultHolidays(teacherId, year) {
  const list = defaultHolidays(year, { teacherId });
  const insert = db.prepare(`INSERT INTO holidays (teacher_id, date, name, is_holiday) VALUES (?, ?, ?, 1)`);
  const tx = db.transaction((rows) => rows.forEach((r) => insert.run(teacherId, r.date, r.name)));
  tx(list.filter((r) => !db.prepare(`SELECT id FROM holidays WHERE teacher_id = ? AND date = ?`).get(teacherId, r.date)));
  return list.length;
}

export function generateAnnualPlan(teacherId, { classId, academicStart = "2026-09-01", academicEnd = "2027-05-31", weeksPerYear = 34 } = {}) {
  const topics = db
    .prepare(`SELECT * FROM topics WHERE teacher_id = ? AND class_id = ? AND status != 'done' ORDER BY order_no`)
    .all(teacherId, classId);
  const schedule = db
    .prepare(`SELECT * FROM schedule WHERE teacher_id = ? AND class_id = ? ORDER BY day_of_week, start_time`)
    .all(teacherId, classId);

  if (!topics.length) throw new Error("Mavzular topilmadi. Avval mavzularni qo'shing yoki darslik yuklang.");
  if (!schedule.length) throw new Error("Jadval topilmadi.");

  const lessonDates = [];
  let cursor = new Date(academicStart + "T00:00:00Z");
  const end = new Date(academicEnd + "T00:00:00Z");
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    const status = isHolidayOrDayOff(teacherId, iso);
    if (!status.closed) {
      let dow = cursor.getUTCDay();
      if (dow === 0) dow = 7;
      if (schedule.some((s) => Number(s.day_of_week) === dow)) {
        lessonDates.push({ date: iso, dayName: status.dayName, lessonCount: schedule.filter((s) => Number(s.day_of_week) === dow).length });
      }
    }
    cursor = new Date(cursor.getTime() + 24 * 3600 * 1000);
  }

  const totalSlots = lessonDates.reduce((s, d) => s + d.lessonCount, 0);
  const plan = [];
  let idx = 0;
  let topicIdx = 0;
  for (const day of lessonDates) {
    for (let s = 0; s < day.lessonCount; s++) {
      const topic = topics[Math.min(topicIdx, topics.length - 1)];
      const isLast = topicIdx >= topics.length - 1 && idx > topics.length - 1;
      plan.push({
        lesson_no: idx + 1,
        date: day.date,
        dayName: day.dayName,
        topic_id: isLast ? null : topic.id,
        topicTitle: isLast ? "Takrorlash" : topic.title,
        status: topic.status,
      });
      idx++;
      if (!isLast) topicIdx++;
    }
  }

  return {
    plan,
    totalSlots,
    topicsCount: topics.length,
    lessonDates: lessonDates.length,
    weeksPlanned: Math.ceil((new Date(academicEnd).getTime() - new Date(academicStart).getTime()) / (7 * 24 * 3600 * 1000)),
  };
}

export function markLessonMissed(teacherId, { date, classId, reason = "" }) {
  const nextTopics = db
    .prepare(`SELECT * FROM topics WHERE teacher_id = ? AND class_id = ? AND status IN ('pending','in_progress') ORDER BY order_no`)
    .all(teacherId, classId);
  if (!nextTopics.length) throw new Error("Qayta taqsimlanadigan mavzular yo'q");
  const schedule = db.prepare(`SELECT * FROM schedule WHERE teacher_id = ? AND class_id = ?`).all(teacherId, classId);

  let cursor = new Date(date + "T00:00:00Z");
  cursor = new Date(cursor.getTime() + 24 * 3600 * 1000);
  const moved = [];
  const remaining = nextTopics.slice(0, 1);

  for (let tries = 0; tries < 60 && remaining.length; tries++) {
    const iso = cursor.toISOString().slice(0, 10);
    const status = isHolidayOrDayOff(teacherId, iso);
    if (!status.closed) {
      let dow = cursor.getUTCDay();
      if (dow === 0) dow = 7;
      if (schedule.some((s) => Number(s.day_of_week) === dow)) {
        const t = remaining.shift();
        moved.push({ topic_id: t.id, topic: t.title, old_date: date, new_date: iso, reason });
      }
    }
    cursor = new Date(cursor.getTime() + 24 * 3600 * 1000);
  }

  logAudit(teacherId, { action: "lesson.missed", entityType: "schedule", entityId: 0, detail: { date, classId, reason, moved } });
  return { moved, message: `Dars belgilangan ${date} dan keyingi kunlarga surildi: ${moved.map((m) => `${m.topic} → ${m.new_date}`).join(", ")}` };
}

export function getTestSchedulePrep(teacherId) {
  return db.prepare(`SELECT * FROM test_preparations WHERE teacher_id = ? ORDER BY id DESC LIMIT 20`).all(teacherId);
}
