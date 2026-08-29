import cron from "node-cron";
import db from "../db/index.js";
import { generateLessonPlan, generateHomework } from "./lessonService.js";
import { createFullTest, createTestRecord, saveQuestions, generateTestQuestions } from "./testGenerator.js";

const dayNames = ["", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];

function getTodaySchedule(teacherId = null) {
  const dayOfWeek = db.prepare(`SELECT CAST(strftime('%w', 'now', 'localtime') AS INTEGER) + 1 AS d`).get().d;
  const sql = teacherId
    ? `SELECT s.*, c.name AS class_name, c.subject
       FROM schedule s
       JOIN classes c ON c.id = s.class_id
       WHERE s.day_of_week = ? AND s.teacher_id = ?
       ORDER BY s.start_time`
    : `SELECT s.*, c.name AS class_name, c.subject
       FROM schedule s
       JOIN classes c ON c.id = s.class_id
       WHERE s.day_of_week = ? ORDER BY s.start_time`;
  return teacherId ? db.prepare(sql).all(dayOfWeek, teacherId) : db.prepare(sql).all(dayOfWeek);
}

function getTeacherSettings(teacherId) {
  const rows = db.prepare(`SELECT key, value_json FROM settings WHERE teacher_id = ?`).all(teacherId);
  const settings = {};
  for (const r of rows) settings[r.key] = JSON.parse(r.value_json);
  return settings;
}

export async function prepareMorningBriefing(teacherId) {
  const lessons = getTodaySchedule(teacherId);
  if (lessons.length === 0) return null;

  const settings = getTeacherSettings(teacherId);
  const lines = ["BUGUNGI DARS", ""];
  const prepared = [];

  for (const lesson of lessons) {
    lines.push(`Fan: ${lesson.subject || "Tarix"}`);
    lines.push(`Sinf: ${lesson.class_name}`);
    lines.push(`Vaqt: ${lesson.start_time}`);
    lines.push(`Mavzu: ${lesson.subject || "Tarix"}`);

    const plan = await generateLessonPlan(teacherId, {
      classId: lesson.class_id,
      topic: lesson.subject || "Tarix",
      subject: lesson.subject || "Tarix",
    });
    prepared.push({ class_id: lesson.class_id, topic: lesson.subject || "Tarix", plan });

    const hw = await generateHomework(teacherId, {
      classId: lesson.class_id,
      topic: lesson.subject || "Tarix",
    });

    const topicInfo = db
      .prepare(`SELECT * FROM topics WHERE class_id = ? AND status = 'pending' ORDER BY order_no LIMIT 1`)
      .get(lesson.class_id);
    if (topicInfo) {
      const testCount = settings.test_count || 20;
      const test = createTestRecord(teacherId, {
        class_id: lesson.class_id,
        title: `${topicInfo.title} - mini test`,
        type: "topic",
        topic: topicInfo.title,
        question_count: Math.min(testCount, 10),
      });
      const questions = await generateTestQuestions(teacherId, {
        topic: topicInfo.title,
        subject: lesson.subject || "Tarix",
        count: Math.min(testCount, 10),
      });
      saveQuestions(teacherId, test.id, questions);
      db.prepare(`UPDATE tests SET status = 'ready' WHERE id = ?`).run(test.id);
      prepared.push({ test_id: test.id });
    }

    db.prepare(`UPDATE topics SET status = 'in_progress' WHERE class_id = ? AND status = 'pending' LIMIT 1`).run(lesson.class_id);
    lines.push("");
  }

  lines.push("Bugun tayyorlandi:");
  lines.push("- dars rejasi");
  lines.push("- konspekt");
  lines.push("- uy vazifasi");
  lines.push("- mini test");

  db.prepare(
    `INSERT INTO reminders (teacher_id, message, scheduled_at, status)
     VALUES (?, ?, datetime('now', 'localtime'), 'sent')`
  ).run(teacherId, lines.join("\n"));

  return { message: lines.join("\n"), prepared };
}

export function scheduleWeeklyTest(teacherId) {
  const settings = getTeacherSettings(teacherId);
  const testDay = settings.test_day != null ? settings.test_day : 5;
  const testTime = settings.test_time || "18:00";
  const questionCount = settings.test_count || 20;

  const cronExpr = `${testTime.split(":")[1]} ${testTime.split(":")[0]} * * ${testDay}`;
  const task = cron.schedule(
    cronExpr,
    async () => {
      const classes = db.prepare(`SELECT * FROM classes WHERE teacher_id = ?`).all(teacherId);
      for (const cls of classes) {
        const topicInfo = db
          .prepare(`SELECT * FROM topics WHERE class_id = ? AND status IN ('pending','in_progress') ORDER BY order_no LIMIT 1`)
          .get(cls.id);
        if (!topicInfo) continue;
        const test = createFullTest(teacherId, {
          class_id: cls.id,
          title: `${topicInfo.title} - haftalik test`,
          type: "weekly",
          topic: topicInfo.title,
          question_count: questionCount,
          subject: cls.subject || "Tarix",
        });
        db.prepare(
          `INSERT INTO reminders (teacher_id, message, scheduled_at, status)
           VALUES (?, ?, datetime('now', 'localtime'), 'pending')`
        ).run(
          teacherId,
          `Haftalik test tayyor: "${test.title}" (${test.question_count} savol). Test ID: ${test.id}`
        );
      }
    },
    { scheduled: true }
  );
  return task;
}

export function scheduleDailyBriefing(teacherId) {
  const task = cron.schedule(
    "30 7 * * *",
    async () => {
      await prepareMorningBriefing(teacherId);
    },
    { scheduled: true }
  );
  return task;
}

export function scheduleDailyReminders(teacherId) {
  const task = cron.schedule(
    "* * * * *",
    () => {
      const reminders = db
        .prepare(`SELECT * FROM reminders WHERE teacher_id = ? AND status = 'pending' AND scheduled_at <= datetime('now', 'localtime')`)
        .all(teacherId);
      for (const r of reminders) {
        db.prepare(`UPDATE reminders SET status = 'sent' WHERE id = ?`).run(r.id);
        notifyTeacher(teacherId, r.message);
      }
    },
    { scheduled: true }
  );
  return task;
}

export async function prepareDailyTest(teacherId) {
  const settings = getTeacherSettings(teacherId);
  if (settings.daily_test_enabled === false) return null;

  const count = settings.daily_test_count || Math.min(settings.test_count || 10, 10);
  const today = db.prepare(`SELECT date('now', 'localtime') AS d`).get().d;
  const lessons = getTodaySchedule(teacherId);
  if (lessons.length === 0) return [];

  const classIds = [...new Set(lessons.map((l) => l.class_id))];
  const classes = classIds
    .map((id) => db.prepare(`SELECT * FROM classes WHERE id = ?`).get(id))
    .filter(Boolean);
  const created = [];

  for (const cls of classes) {
    const existing = db
      .prepare(`SELECT id FROM tests WHERE teacher_id = ? AND class_id = ? AND type = 'daily' AND date(created_at) = ?`)
      .get(teacherId, cls.id, today);
    if (existing) continue;

    const topicInfo = db
      .prepare(`SELECT * FROM topics WHERE class_id = ? AND status IN ('pending','in_progress') ORDER BY CASE status WHEN 'in_progress' THEN 0 ELSE 1 END, order_no LIMIT 1`)
      .get(cls.id);
    if (!topicInfo) continue;

    try {
      const test = await createFullTest(teacherId, {
        class_id: cls.id,
        title: `Kunlik test: ${cls.name} - ${topicInfo.title} (${today})`,
        type: "daily",
        topic: topicInfo.title,
        question_count: count,
        subject: cls.subject || "Tarix",
        local_only: true,
        skip_qc: true,
      });
      created.push(test);
      db.prepare(
        `INSERT INTO reminders (teacher_id, message, scheduled_at, status)
         VALUES (?, ?, datetime('now', 'localtime'), 'pending')`
      ).run(teacherId, `Kunlik test tayyor: "${test.title}" (${test.question_count} savol). Test ID: ${test.id}`);
    } catch (e) {
      db.prepare(
        `INSERT INTO reminders (teacher_id, message, scheduled_at, status)
         VALUES (?, ?, datetime('now', 'localtime'), 'pending')`
      ).run(teacherId, `Kunlik test xatosi (${cls.name}): ${e.message}`);
    }
  }
  return created;
}

export function scheduleDailyTestRun(teacherId) {
  const settings = getTeacherSettings(teacherId);
  const time = settings.daily_test_time || "08:00";
  const [hh, mm] = String(time).split(":").map(Number);
  const cronExpr = `${mm || 0} ${hh || 8} * * *`;
  return cron.schedule(cronExpr, async () => {
    await prepareDailyTest(teacherId);
  }, { scheduled: true });
}

export function scheduleAll(teacherId) {
  scheduleDailyBriefing(teacherId);
  scheduleDailyReminders(teacherId);
  scheduleWeeklyTest(teacherId);
  scheduleDailyTestRun(teacherId);
}

function notifyTeacher(teacherId, message) {
  const teacher = db.prepare(`SELECT * FROM teachers WHERE id = ?`).get(teacherId);
  if (teacher && teacher.phone && teacher.phone.startsWith("tg:")) {
    import("./telegram.js").then(({ sendMessage }) => sendMessage(teacher.phone.slice(3), message));
  }
  return message;
}
