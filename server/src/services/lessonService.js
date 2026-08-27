import db from "../db/index.js";
import { generateJson, aiEnabled } from "./ai.js";

export async function generateLessonPlan(teacherId, { classId, topic, subject = "Tarix", classLevel = "7", localOnly = false }) {
  const existing = db
    .prepare(`SELECT * FROM lesson_plans WHERE teacher_id = ? AND class_id = ? AND topic = ? ORDER BY id DESC LIMIT 1`)
    .get(teacherId, classId, topic);
  if (existing) return JSON.parse(existing.plan_json);

  let plan;
  if (aiEnabled && !localOnly) {
    try {
      plan = await generateJson(
        teacherId,
        [
          {
            role: "system",
            content: `Sen ${subject} fanidan ${classLevel}-sinf o'qituvchisiga dars rejasi tuzuvchi AI yordamchisan. O'zbek tilida javob ber.`,
          },
          {
            role: "user",
            content: `"${topic}" mavzusida to'liq dars rejasi tuz. Formati (JSON):
{
  "maqsad": "...",
  "kutilayotgan_natija": "...",
  "kirish_qismi": "...",
  "asosiy_tushunchalar": ["..."],
  "tarixiy_faktlar": ["..."],
  "savol_javob": [{"savol": "...", "javob": "..."}],
  "mustahkamlash": ["..."],
  "mini_test": [{"savol": "...", "variantlar": ["A) ...", "B) ...", "C) ...", "D) ..."], "javob": "A"}],
  "uy_vazifasi": ["..."]
}`,
          },
        ],
        { task: "lesson-plan", complexity: "auto", temperature: 0.7, maxTokens: 2500 }
      );
    } catch {
      plan = localPlan(topic, subject);
    }
  } else {
    plan = localPlan(topic, subject);
  }

  db.prepare(
    `INSERT INTO lesson_plans (teacher_id, class_id, topic, plan_json, scheduled_date)
     VALUES (?, ?, ?, ?, date('now', 'localtime'))`
  ).run(teacherId, classId, topic, JSON.stringify(plan));

  return plan;
}

function localPlan(topic, subject) {
  return {
    maqsad: `${topic} mavzusini o'rganish orqali o'quvchilarda bilim va ko'nikmalarni shakllantirish`,
    kutilayotgan_natija: "O'quvchilar mavzu bo'yicha asosiy tushunchalarni bilishadi va savollarga javob bera oladilar",
    kirish_qismi: "Yangi mavzuga qiziqish uyg'otish uchun savol-javob va kirish suhbati",
    asosiy_tushunchalar: [`${topic} mavzusining asosiy tushunchalari`, "Sabab-oqibat bog'liqligi"],
    tarixiy_faktlar: [`${topic} mavzusiga oid asosiy faktlar`],
    savol_javob: [
      { savol: `${topic} mavzusining asosiy g'oyasi nima?`, javob: "O'quvchilar og'zaki javob beradi" },
      { savol: `${topic} mavzusida qaysi shaxslar muhim?`, javob: "Darslik asosida aniqlanadi" },
    ],
    mustahkamlash: [`${topic} bo'yicha og'zaki mashqlar`, "Asosiy sanalar bilan ishlash"],
    mini_test: [
      {
        savol: `${topic} mavzusi qaysi fan doirasida o'rganiladi?`,
        variantlar: [`A) ${subject}`, "B) Matematika", "C) Fizika", "D) Kimyo"],
        javob: "A",
      },
    ],
    uy_vazifasi: [`${topic} mavzusini o'qib kelish`, "5 ta savol tuzish", "10 ta test savoliga javob berish"],
  };
}

export async function generateHomework(teacherId, { classId, topic, studentLevel = "o'rta", localOnly = false }) {
  if (aiEnabled && !localOnly) {
    try {
      const hw = await generateJson(
        teacherId,
        [
          {
            role: "system",
            content: "Sen o'qituvchiga uy vazifasi tuzuvchi AI yordamchisan. O'zbek tilida, qisqa va aniq javob ber.",
          },
          {
            role: "user",
            content: `"${topic}" mavzusida, bilim darajasi "${studentLevel}" bo'lgan o'quvchi uchun uy vazifasi tuz. 4-6 band. JSON: {"vazifalar": ["..."]}`,
          },
        ],
        { task: "homework", complexity: "cheap", maxTokens: 800 }
      );
      const content = (hw.vazifalar || []).join("\n");
      db.prepare(
        `INSERT INTO homework (teacher_id, class_id, topic, content, due_date, status)
         VALUES (?, ?, ?, ?, date('now', '+7 days'), 'active')`
      ).run(teacherId, classId, topic, content);
      return content;
    } catch {
      // fallthrough to local
    }
  }
  const content = [
    `"${topic}" mavzusini o'qib kelish.`,
    "Mavzu bo'yicha 5 ta savolga javob berish.",
    "10 ta test savolini yechish.",
    "Mavzuga oid 3 ta tarixiy sanani yodlash.",
    "Voqealar xronologiyasini tuzish.",
  ].join("\n");
  db.prepare(
    `INSERT INTO homework (teacher_id, class_id, topic, content, due_date, status)
     VALUES (?, ?, ?, ?, date('now', '+7 days'), 'active')`
  ).run(teacherId, classId, topic, content);
  return content;
}

export async function generateConspectus(teacherId, { topic, subject = "Tarix", classLevel = "7", localOnly = false }) {
  if (aiEnabled && !localOnly) {
    try {
      const conspectus = await generateJson(
        teacherId,
        [
          {
            role: "system",
            content: `Sen ${subject} fanidan ${classLevel}-sinf o'qituvchisiga konspekt tuzuvchi AI yordamchisan. O'zbek tilida javob ber. Faktlarni o'ylab chiqma, ishonchli manbalarga tayan.`,
          },
          {
            role: "user",
            content: `"${topic}" mavzusida qisqa konspekt tuz. JSON: {"kirish": "...", "asosiy_holatlar": ["..."], "xulosa": "..."}`,
          },
        ],
        { task: "conspectus", complexity: "auto", maxTokens: 1500 }
      );
      return conspectus;
    } catch {
      // fallthrough
    }
  }
  return {
    kirish: `${topic} mavzusi tarix fanining muhim bo'limlaridan biri hisoblanadi.`,
    asosiy_holatlar: [
      `${topic} mavzusining asosiy voqealari va sanalari.`,
      `Mavzuga oid tarixiy shaxslar va ularning roli.`,
      `Sabab va oqibat bog'liqligini tahlil qilish.`,
    ],
    xulosa: `${topic} mavzusi o'quvchilarning tarixiy tafakkurini rivojlantiradi.`,
  };
}
