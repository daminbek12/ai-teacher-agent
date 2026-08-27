import db from "../db/index.js";
import { generateJson, aiEnabled } from "./ai.js";

export function getClassResults(classId) {
  const results = db
    .prepare(
      `SELECT r.*, s.first_name, s.last_name
       FROM test_results r
       JOIN students s ON s.id = r.student_id
       JOIN tests t ON t.id = r.test_id
       WHERE t.class_id = ? ORDER BY r.created_at DESC`
    )
    .all(classId);
  return results;
}

export function weeklyReport(teacherId, classId) {
  const classInfo = db.prepare(`SELECT * FROM classes WHERE id = ?`).get(classId);
  const since = db.prepare(`SELECT date('now', '-7 days') AS d`).get().d;
  const results = db
    .prepare(
      `SELECT r.*, s.first_name, s.last_name FROM test_results r
       JOIN students s ON s.id = r.student_id
       JOIN tests t ON t.id = r.test_id
       WHERE r.teacher_id = ? AND t.class_id = ? AND date(r.created_at) >= ?`
    )
    .all(teacherId, classId, since);

  const studentMap = {};
  const topicMistakes = {};
  for (const r of results) {
    if (!studentMap[r.student_id]) studentMap[r.student_id] = { name: `${r.first_name} ${r.last_name}`, percents: [] };
    studentMap[r.student_id].percents.push(r.percent);
    const wrong = JSON.parse(r.wrong_topics_json || "{}");
    for (const [t, c] of Object.entries(wrong)) topicMistakes[t] = (topicMistakes[t] || 0) + c;
  }

  const perStudent = Object.values(studentMap).map((s) => ({
    name: s.name,
    avg: Math.round(s.percents.reduce((a, b) => a + b, 0) / s.percents.length),
  }));
  const average = results.length
    ? Math.round(results.reduce((s, r) => s + r.percent, 0) / results.length)
    : null;
  const sorted = [...perStudent].sort((a, b) => b.avg - a.avg);
  const worstTopic = Object.entries(topicMistakes).sort((a, b) => b[1] - a[1])[0];

  return {
    className: classInfo ? classInfo.name : "",
    testsTaken: results.length,
    average,
    best: sorted.slice(0, 5),
    needsHelp: sorted.slice(-5).reverse(),
    worstTopic: worstTopic ? { topic: worstTopic[0], mistakes: worstTopic[1] } : null,
    topicMistakes,
  };
}

export function monthlyReport(teacherId, classId) {
  const since = db.prepare(`SELECT date('now', '-30 days') AS d`).get().d;
  const results = db
    .prepare(
      `SELECT r.*, s.first_name, s.last_name FROM test_results r
       JOIN students s ON s.id = r.student_id
       JOIN tests t ON t.id = r.test_id
       WHERE r.teacher_id = ? AND t.class_id = ? AND date(r.created_at) >= ?`
    )
    .all(teacherId, classId, since);

  const studentProgression = {};
  for (const r of results) {
    if (!studentProgression[r.student_id]) {
      studentProgression[r.student_id] = { name: `${r.first_name} ${r.last_name}`, percents: [] };
    }
    studentProgression[r.student_id].percents.push(r.percent);
  }

  const perStudent = Object.values(studentProgression).map((s) => ({
    name: s.name,
    avg: Math.round(s.percents.reduce((a, b) => a + b, 0) / s.percents.length),
    trend: s.percents.length >= 2 ? s.percents[s.percents.length - 1] - s.percents[0] : 0,
    percents: s.percents,
  }));

  const allPercents = results.map((r) => r.percent);
  const average = allPercents.length ? Math.round(allPercents.reduce((a, b) => a + b, 0) / allPercents.length) : null;
  const topStudents = [...perStudent].sort((a, b) => b.avg - a.avg).slice(0, 5);
  const improved = [...perStudent].filter((s) => s.trend > 10).sort((a, b) => b.trend - a.trend);

  return {
    testsTaken: results.length,
    students: perStudent.length,
    average,
    topStudents,
    improved,
    perStudent: perStudent.sort((a, b) => b.avg - a.avg),
  };
}

export function developmentReport(studentId) {
  const results = db
    .prepare(`SELECT * FROM test_results WHERE student_id = ? ORDER BY created_at ASC`)
    .all(studentId);
  const student = db.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId);
  return {
    student: student ? `${student.first_name} ${student.last_name}` : "",
    progression: results.map((r) => ({ percent: r.percent, grade: r.grade, date: r.created_at })),
    trend: results.length >= 2 ? results[results.length - 1].percent - results[0].percent : 0,
    average: results.length ? Math.round(results.reduce((s, r) => s + r.percent, 0) / results.length) : null,
  };
}

export async function generateReportSummary(teacherId, report, type = "weekly") {
  if (!aiEnabled) return null;
  try {
    return await generateJson(
      teacherId,
      [
        {
          role: "system",
          content: "Sen o'qituvchiga hisobot tahlili tuzuvchi AI yordamchisan. O'zbek tilida qisqa va aniq javob ber.",
        },
        {
          role: "user",
          content: `Quyidagi ${type === "weekly" ? "haftalik" : "oylik"} hisobot ma'lumotlari asosida qisqa tahlil va keyingi hafta/oy tavsiyasini bering (5-7 jumla):
${JSON.stringify(report, null, 2)}`,
        },
      ],
      { task: "report", complexity: "strong", maxTokens: 1000 }
    );
  } catch {
    return null;
  }
}
