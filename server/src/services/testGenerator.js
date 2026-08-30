import db from "../db/index.js";
import { generateJson, aiEnabled } from "./ai.js";
import { searchKnowledgeBase } from "./textbook.js";
import { runTestQc } from "./qc.js";
import { logAudit } from "./audit.js";
import { getCached, setCached, hashInput } from "./cache.js";
import { pickQuestionsFromBank, markBankUsed, loadBankFromFile } from "./questionBank.js";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeOptions(options) {
  if (Array.isArray(options)) {
    const letters = ["A", "B", "C", "D", "E"];
    return letters.slice(0, options.length).map((l, i) => ({ letter: l, text: options[i] }));
  }
  return options;
}

function getUsedQuestionTexts(teacherId, topic) {
  const rows = db
    .prepare(
      `SELECT question_text FROM questions WHERE teacher_id = ? AND topic = ?`
    )
    .all(teacherId, topic || "");
  return new Set(rows.map((r) => r.question_text.trim().toLowerCase()));
}

export function getTestDifficultyConfig(testId) {
  const test = db.prepare(`SELECT * FROM tests WHERE id = ?`).get(testId);
  if (!test) return null;
  return {
    easy: test.difficulty_easy,
    medium: test.difficulty_medium,
    hard: test.difficulty_hard,
  };
}

export function buildTestPlan(questionCount, cfg) {
  const easy = Math.round((questionCount * cfg.easy) / 100);
  const hard = Math.round((questionCount * cfg.hard) / 100);
  const medium = questionCount - easy - hard;
  return { easy, medium, hard };
}

function historyQuestionPrompt(teacherId, topic) {
  const used = getUsedQuestionTexts(teacherId, topic);
  const list = [...used].slice(-15);
  return list.length
    ? `Oldingi testlarda quyidagi savollar ishlatilgan, ularni takrorlama:
${list.map((q) => "- " + q).join("\n")}`
    : "";
}

async function generateQuestionsWithAI(teacherId, { topic, subject, classLevel, count, difficulties, questionTypes, exclude }) {
  const typeList = Array.isArray(questionTypes) && questionTypes.length
    ? questionTypes
    : [
        "sana_topish",
        "shaxsni_aniqlash",
        "voqeani_aniqlash",
        "sababni_aniqlash",
        "oqibatni_aniqlash",
        "atamani_aniqlash",
        "xronologiya",
        "taqqoslash",
      ];

  const messages = [
    {
      role: "system",
      content: `Sen ${subject} fanidan ${classLevel}-sinf o'qituvchisiga test tuzuvchi AI yordamchisan.
Savollar o'quv dasturiga mos, aniq, chalkash bo'lmagan va fakt jihatdan to'g'ri bo'lishi kerak.
Har bir savol 4 ta variantdan (A, B, C, D) iborat bo'lsin.`,
    },
    {
      role: "user",
      content: `"${topic}" mavzusidan ${count} ta test savoli tuz.
Qiyinlik taqsimoti: oson ${difficulties.easy}%, o'rta ${difficulties.medium}%, qiyin ${difficulties.hard}%.
Savol turlari: ${typeList.join(", ")}.

${historyQuestionPrompt(teacherId, topic)}

Javob formati (faqat JSON array):
[
  {
    "question": "savol matni",
    "options": ["to'g'ri variant", "noto'g'ri 1", "noto'g'ri 2", "noto'g'ri 3"],
    "correct_index": 0,
    "difficulty": "easy|medium|hard",
    "topic": "${topic}"
  }
]
To'g'ri javob birinchi bo'lib yoziladi, correct_index uning indeksini ko'rsatadi.`,
    },
  ];

  const data = await generateJson(teacherId, messages, {
    task: "test-generation",
    complexity: "auto",
    temperature: 0.8,
  });

  const arr = Array.isArray(data) ? data : data.questions;
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error("AI savollar yarata olmadi, qayta urinib ko'ring");
  }
  return arr.slice(0, count).map((q) => ({
    question_text: q.question,
    options: q.options || [],
    correct_index: q.correct_index != null ? q.correct_index : 0,
    difficulty: q.difficulty || "medium",
    topic: q.topic || topic,
  }));
}

function generateQuestionsLocal({ topic, subject, count, difficulties, exclude }) {
  const templates = [
    {
      difficulty: "easy",
      make: (i) => ({
        question_text: `"${topic}" mavzusiga oid asosiy tushuncha nima?`,
        options: [`${topic} bilan bog'liq asosiy tushuncha`, "Tushuncha emas", "Boshqa mavzu", "Aniqlanmagan"],
        correct_index: 0,
      }),
    },
    {
      difficulty: "easy",
      make: (i) => ({
        question_text: `${topic} mavzusi qaysi fan doirasida o'rganiladi?`,
        options: [subject, "Matematika", "Fizika", "Chet tili"],
        correct_index: 0,
      }),
    },
    {
      difficulty: "medium",
      make: (i) => ({
        question_text: `${topic} mavzusida qaysi jihat eng muhim hisoblanadi?`,
        options: ["Sabab va oqibatlar", "Faqat sanalar", "Faqat ismlar", "Hech qaysi"],
        correct_index: 0,
      }),
    },
    {
      difficulty: "medium",
      make: (i) => ({
        question_text: `${topic} mavzusini o'rganishdan maqsad nima?`,
        options: ["Bilim va ko'nikmalarni shakllantirish", "Vaqt o'tkazish", "Yod olish", "Baholash"],
        correct_index: 0,
      }),
    },
    {
      difficulty: "hard",
      make: (i) => ({
        question_text: `${topic} mavzusida sabab-oqibat bog'liqligini to'g'ri ifodalang.`,
        options: ["Voqea sabablari va natijalari o'zaro bog'liq", "Sabab va oqibat aloqasi yo'q", "Faqat oqibat muhim", "Faqat sabab muhim"],
        correct_index: 0,
      }),
    },
    {
      difficulty: "hard",
      make: (i) => ({
        question_text: `${topic} mavzusini tahlil qilishda qaysi yondashuv to'g'ri?`,
        options: ["Manbalarni tanqidiy tahlil qilish", "Bitta manbaga ishonish", "Yodlash", "Taxmin qilish"],
        correct_index: 0,
      }),
    },
  ];

  const plan = buildTestPlan(count, difficulties);
  const pool = [];
  for (let i = 0; i < plan.easy; i++) pool.push(templates.filter((t) => t.difficulty === "easy"));
  for (let i = 0; i < plan.medium; i++) pool.push(templates.filter((t) => t.difficulty === "medium"));
  for (let i = 0; i < plan.hard; i++) pool.push(templates.filter((t) => t.difficulty === "hard"));

  const result = [];
  let idx = 0;
  pool.forEach((bucket) => {
    const tpl = bucket[idx % bucket.length];
    const q = tpl.make(result.length + 1);
    result.push({
      question_text: q.question_text,
      options: q.options,
      correct_index: q.correct_index,
      difficulty: tpl.difficulty,
      topic,
    });
    idx++;
  });
  return result;
}

export async function generateTestQuestions(teacherId, { topic, subject = "Tarix", classLevel = "7", count = 20, difficulties = { easy: 30, medium: 50, hard: 20 }, questionTypes = null, localOnly = false, useBank = true }) {
  const used = getUsedQuestionTexts(teacherId, topic);
  let questions = [];
  const bankIds = [];

  if (useBank && /tarix|tarikh|history|tarixi/i.test(subject || "Tarix")) {
    try {
      const bankQuestions = pickQuestionsFromBank({ subject: "Tarix", topic, count, difficulties, exclude: used });
      for (const q of bankQuestions) {
        questions.push(q);
        if (q.bankId) bankIds.push(q.bankId);
      }
    } catch {}
  }

  if (questions.length < count) {
    try {
      const ragQuestions = await generateRagQuestions(teacherId, { topic, subject, grade: classLevel, count: count - questions.length, difficulties, localOnly });
      if (ragQuestions && ragQuestions.length) questions = questions.concat(ragQuestions);
    } catch {}
  }

  if (questions.length === 0) {
    if (aiEnabled && !localOnly) {
      try {
        questions = await generateQuestionsWithAI(teacherId, {
          topic, subject, classLevel, count, difficulties, questionTypes, exclude: used,
        });
      } catch (e) {
        questions = [];
      }
    }
    if (questions.length === 0) {
      questions = generateQuestionsLocal({ topic, subject, count, difficulties, exclude: used });
    }
  }

  const usedSet = new Set(used);
  const unique = [];
  for (const q of questions) {
    const key = q.question_text.trim().toLowerCase();
    if (usedSet.has(key)) continue;
    unique.push(q);
    usedSet.add(key);
  }
  let attempts = 0;
  while (unique.length < count && attempts < 5 && !localOnly) {
    attempts++;
    const extra = generateQuestionsLocal({ topic, subject, count: count - unique.length + attempts, difficulties, exclude: used });
    const added = extra.filter((q) => !usedSet.has(q.question_text.trim().toLowerCase()));
    if (!added.length) break;
    unique.push(...added);
    added.forEach((q) => usedSet.add(q.question_text.trim().toLowerCase()));
  }
  const finalQuestions = unique.slice(0, count).map((q) => {
    const options = normalizeOptions(q.options);
    const letters = ["A", "B", "C", "D"];
    const correctIndex = q.correct_index != null ? q.correct_index : 0;
    const indices = shuffle(options.map((_, i) => i));
    const orderedOptions = indices.map((idx, pos) => ({ letter: letters[pos], text: options[idx] ? options[idx].text : "" }));
    const correctLetter = letters[indices.indexOf(correctIndex)];
    return {
      question_text: q.question_text,
      options: orderedOptions,
      correct_answer: correctLetter,
      difficulty: q.difficulty,
      topic: q.topic || topic,
      source: q.source || null,
      bankId: q.bankId || null,
    };
  });
  markBankUsed(bankIds.filter((id) => finalQuestions.some((q) => q.bankId === id)));
  return finalQuestions;
}

export function createTestRecord(teacherId, data) {
  const { class_id, title, type = "topic", topic = "", subject = "", question_count = 20, duration_minutes = 25, difficulty_easy = 30, difficulty_medium = 50, difficulty_hard = 20, scheduled_for = null } = data;
  const info = db
    .prepare(
      `INSERT INTO tests (teacher_id, class_id, title, type, topic, subject, question_count, duration_minutes, difficulty_easy, difficulty_medium, difficulty_hard, scheduled_for)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(teacherId, class_id, title, type, topic, subject, question_count, duration_minutes, difficulty_easy, difficulty_medium, difficulty_hard, scheduled_for);
  return db.prepare(`SELECT * FROM tests WHERE id = ?`).get(info.lastInsertRowid);
}

export function saveQuestions(teacherId, testId, questions) {
  const stmt = db.prepare(
    `INSERT INTO questions (test_id, teacher_id, question_text, options_json, correct_answer, difficulty, topic, source_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const tx = db.transaction((qs) => {
    for (const q of qs) {
      stmt.run(
        testId,
        teacherId,
        q.question_text,
        JSON.stringify(q.options),
        q.correct_answer,
        q.difficulty,
        q.topic,
        q.source ? JSON.stringify(q.source) : "{}"
      );
    }
  });
  tx(questions);
  return db.prepare(`SELECT * FROM questions WHERE test_id = ? ORDER BY id`).all(testId);
}

export async function gatherRagContext(teacherId, { topic, subject, grade, limit = 6 }) {
  const cacheKey = `kb:${teacherId}:${hashInput(topic + "|" + subject + "|" + grade)}:${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const chunks = searchKnowledgeBase(teacherId, topic, { subject, grade, limit }).concat(
    searchKnowledgeBase(teacherId, subject || "", { limit: 2 })
  );
  const seenIds = new Set();
  const unique = chunks.filter((c) => {
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    return true;
  }).slice(0, limit + 2);
  return setCached(cacheKey, unique);
}

function chunkToSource(chunk) {
  const src = {
    textbook: chunk.textbook_title || "",
    textbook_id: chunk.textbook_id || null,
    page: chunk.page || 0,
    chapter: chunk.chapter_title || "",
    lesson: chunk.lesson_title || "",
  };
  if (chunk.textbook_title && chunk.lesson_title) {
    src.label = `${chunk.textbook_title} — ${chunk.lesson_title || ""} — Page ${chunk.page || "?"}`;
  } else if (chunk.textbook_title) {
    src.label = `${chunk.textbook_title} — Page ${chunk.page || "?"}`;
  } else {
    src.label = "";
  }
  return src;
}

const STOP_WORDS = new Set([
  "va", "bilan", "uchun", "qilgan", "bo'lgan", "olgan", "degan", "yilda", "yil", "sinf",
  "keyin", "oldin", "esa", "ham", "bu", "shu", "uning", "ular", "bo'yicha", "orasida",
  "sahifa", "mavzu", "darslik",
]);

function cleanToken(w) {
  return w.replace(/[.,;:!?"«»()]+/g, "").trim();
}

function isLatinToken(w) {
  return /[A-Za-z]/.test(w) && w.length >= 4 && !STOP_WORDS.has(w.toLowerCase());
}

function isCapitalized(word) {
  return /^[A-Z]/.test(word) && /[a-z]/.test(word);
}

function extractDatesSentence(sentence) {
  const m = sentence.match(/\b(1[0-9]{3}|20[0-9]{2})[-\s]?(?:yil|жыл|жили|йил)?\b/i);
  return m ? m[1] : null;
}

function clozeSentence(sentence, target) {
  return sentence.replace(target, "______");
}

function nearYears(year) {
  const offsets = [-25, -15, -8, 8, 15, 25, -50, 50];
  const pool = offsets.map((o) => String(Number(year) + o)).filter((y) => Number(y) > 1000);
  return shuffle(pool).slice(0, 3);
}

function pickProperNoun(sentence) {
  const words = sentence.split(/\s+/).map(cleanToken).filter((w) => isLatinToken(w) && isCapitalized(w));
  const seen = new Set();
  const unique = words.filter((w) => (seen.has(w.toLowerCase()) ? false : (seen.add(w.toLowerCase()), true)));
  return unique[0] || null;
}

function pickKeyTerm(chunk) {
  const text = (chunk.keywords || "") + " " + (chunk.lesson_title || "") + " " + (chunk.chapter_title || "");
  const words = text.split(/[,;|\s]+/).map(cleanToken).filter((w) => w.length >= 3);
  return words.length ? words[0] : null;
}

function fillDistractors(correctText, pool) {
  const list = pool.filter((w) => w && w !== correctText);
  const seen = new Set([correctText.toLowerCase()]);
  const unique = list.filter((w) => (seen.has(w.toLowerCase()) ? false : (seen.add(w.toLowerCase()), true)));
  while (unique.length < 3) {
    unique.push(`${correctText.slice(0, 4)}… (${unique.length + 2}-variant)`);
  }
  return unique.slice(0, 3);
}

function localQuestionsFromChunks({ topic, chunks, count, difficulties }) {
  const result = [];
  const plan = buildTestPlan(count, difficulties);
  const dist = [
    ...Array(plan.easy).fill("easy"),
    ...Array(plan.medium).fill("medium"),
    ...Array(plan.hard).fill("hard"),
  ];

  const candidates = [];
  for (const chunk of chunks) {
    const content = chunk.content || "";
    if (content.replace(/\s+/g, " ").match(/(umumta'?lim maktablari|Vse uchebniki|UDK|BBK|ISBN|nashriyot|tarjimon|mualliflar)/i) && content.length < 500) continue;
    const sentences = content
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 30 && s.length < 260 && /[A-Za-z0-9]{4,}/.test(s))
      .filter((s) => !s.includes("______"))
      .filter((s) => !/(umumta'?lim maktablari|Vse uchebniki|UDK |BBK |ISBN|dar[s]lik|mualliflar|tarjimon|nashriyot)/i.test(s))
      .slice(1);
    for (const sentence of sentences) candidates.push({ chunk, sentence });
  }

  const usedSentences = new Set();
  let cursor = 0;

  for (let i = 0; i < count && candidates.length; i++) {
    let chosen = null;
    for (let tries = 0; tries < candidates.length; tries++) {
      const cand = candidates[(cursor + tries) % candidates.length];
      if (!usedSentences.has(cand.sentence)) {
        chosen = cand;
        cursor = (cursor + tries + 1) % candidates.length;
        break;
      }
    }
    if (!chosen) break;
    usedSentences.add(chosen.sentence);
    const { chunk, sentence } = chosen;
    const source = chunkToSource(chunk);
    const year = extractDatesSentence(sentence);
    const noun = pickProperNoun(sentence);
    const term = pickKeyTerm(chunk);

    if (year && dist[i] !== "hard") {
      const blanked = clozeSentence(sentence, year);
      const options = fillDistractors(year, nearYears(year));
      result.push({
        question_text: `Quyidagi gapda qaysi yil ko'rsatilgan?\n"${blanked}"`,
        options: [year, ...options].map((t) => String(t)),
        correct_index: 0,
        difficulty: dist[i],
        topic,
        source,
      });
    } else if (term && dist[i] === "hard") {
      const options = fillDistractors(term, chunks.map((c) => pickKeyTerm(c)).filter(Boolean));
      result.push({
        question_text: `Qaysi atama "${topic}" mavzusi bilan bevosita bog'liq?`,
        options: [term, ...options].map((t) => String(t)),
        correct_index: 0,
        difficulty: dist[i],
        topic,
        source,
      });
    } else if (noun) {
      const blanked = clozeSentence(sentence, noun);
      const localPool = sentence.split(/\s+/).map(cleanToken).filter((w) => isLatinToken(w));
      const globalPool = chunks.flatMap((c) => (c.content || "").split(/\s+/)).map(cleanToken).filter((w) => /^[A-Z]/.test(w) && isLatinToken(w));
      const options = fillDistractors(noun, [...localPool, ...shuffle(globalPool).slice(0, 40)]);
      result.push({
        question_text: `Bo'sh joyni to'ldiring:\n"${blanked}"`,
        options: [noun, ...options].map((t) => String(t)),
        correct_index: 0,
        difficulty: dist[i],
        topic,
        source,
      });
    } else {
      const key = pickKeyTerm(chunk) || topic;
      const options = fillDistractors(key, chunks.map((c) => pickKeyTerm(c)).filter(Boolean));
      result.push({
        question_text: `Darslikning ${source.page || "?"}-sahifasidagi matn qaysi tushunchaga oid?`,
        options: [key, ...options].map((t) => String(t)),
        correct_index: 0,
        difficulty: dist[i],
        topic,
        source,
      });
    }
  }
  return result;
}

export async function generateRagQuestions(teacherId, { topic, subject, grade, count = 20, difficulties, localOnly = false }) {
  const chunks = await gatherRagContext(teacherId, { topic, subject, grade }).catch(() => []);
  if (!chunks.length) return null;

  if (aiEnabled && !localOnly) {
    try {
      const contextText = chunks.map((c, i) => `[Manba ${i + 1}: ${chunkToSource(c).label}]\n${c.content.slice(0, 900)}`).join("\n\n");
      const data = await generateJson(
        teacherId,
        [
          {
            role: "system",
            content: `Sen ${subject || "Tarix"} fanidan test tuzuvchi AI yordamchisan. Savollarni FAQAT berilgan darslik matnlariga asosan tuzasan. Hech qanday ma'lumotni o'zing to'kib chiqarma. Har savol uchun qaysi [Manba N] dan foydalanganingni qaytaramasan.`,
          },
          {
            role: "user",
            content: `Quyidagi darslik manbalariga asosan "${topic}" mavzusidan ${count} ta test savoli tuz.\nQiyinlik: oson ${difficulties.easy}%, o'rta ${difficulties.medium}%, qiyin ${difficulties.hard}%.\n\n${contextText}\n\nJSON array:\n[{"question":"savol","options":["to'g'ri javob","x1","x2","x3"],"correct_index":0,"difficulty":"easy|medium|hard","source_index":1}]\nsource_index — qaysi [Manba N] dan olinganini ko'rsatadi (1 dan boshlab). To'g'ri javob variantlar ichida to'g'ri pozitsiyada bo'lishi shart.`,
          },
        ],
        { task: "rag-test", complexity: "auto", temperature: 0.7, maxTokens: 3500 }
      );
      const arr = Array.isArray(data) ? data : data.questions;
      if (Array.isArray(arr) && arr.length) {
        return arr.slice(0, count).map((q) => {
          const idx = Math.min(Math.max((q.source_index || 1) - 1, 0), chunks.length - 1);
          return {
            question_text: q.question,
            options: q.options || [],
            correct_index: q.correct_index != null ? q.correct_index : 0,
            difficulty: q.difficulty || "medium",
            topic,
            source: chunkToSource(chunks[idx]),
          };
        });
      }
    } catch {
      // fallthrough
    }
  }
  return localQuestionsFromChunks({ topic, chunks, count, difficulties });
}

export async function createFullTest(teacherId, data) {
  const test = createTestRecord(teacherId, data);
  const questions = await generateTestQuestions(teacherId, {
    topic: data.topic || test.title,
    subject: data.subject || "Tarix",
    classLevel: data.class_level || "7",
    count: test.question_count,
    difficulties: { easy: test.difficulty_easy, medium: test.difficulty_medium, hard: test.difficulty_hard },
    questionTypes: data.question_types || null,
    localOnly: data.local_only || false,
  });
  const saved = saveQuestions(teacherId, test.id, questions);
  db.prepare(`UPDATE tests SET status = 'ready' WHERE id = ?`).run(test.id);
  if (!data.skip_qc) {
    try {
      const qc = await runTestQc(teacherId, test.id, { minScore: 85, withAI: !!data.with_ai_qc });
      return { ...db.prepare(`SELECT * FROM tests WHERE id = ?`).get(test.id), questions: saved, qc };
    } catch {}
  }
  return { ...db.prepare(`SELECT * FROM tests WHERE id = ?`).get(test.id), questions: saved };
}

export async function prepareScheduledTest(teacherId, data, { sendAt = null } = {}) {
  const test = await createFullTest(teacherId, data);
  const qcScore = test.qc ? test.qc.score : 0;
  db.prepare(
    `INSERT INTO test_preparations (teacher_id, test_id, scheduled_send_at, status, qc_score)
     VALUES (?, ?, ?, ?, ?)`
  ).run(teacherId, test.id, sendAt, test.status === "ready" ? "prepared" : "needs_revision", qcScore);
  logAudit(teacherId, { action: "test.prepared", entityType: "test", entityId: test.id, detail: { qcScore, scheduled_send_at: sendAt } });
  return test;
}

export function createVariants(teacherId, testId, variantCount = 3) {
  const test = db.prepare(`SELECT * FROM tests WHERE id = ?`).get(testId);
  if (!test) return null;
  const questions = db.prepare(`SELECT * FROM questions WHERE test_id = ? ORDER BY id`).all(testId);
  const variants = [];
  for (let v = 0; v < variantCount; v++) {
    const shuffled = shuffle(questions).map((q) => {
      const options = JSON.parse(q.options_json);
      const letters = ["A", "B", "C", "D"];
      const correctIndex = letters.indexOf(q.correct_answer);
      const indices = shuffle(options.map((_, i) => i));
      const orderedOptions = indices.map((idx, pos) => ({ letter: letters[pos], text: options[idx] ? options[idx].text : "" }));
      const newCorrect = letters[indices.indexOf(correctIndex)];
      return {
        ...q,
        options_json: JSON.stringify(orderedOptions),
        correct_answer: newCorrect,
      };
    });
    variants.push({
      variant: String.fromCharCode(65 + v),
      title: `${test.title} (Variant ${String.fromCharCode(65 + v)})`,
      questions: shuffled,
    });
  }
  return variants;
}

export function gradeTest({ answers, questions }) {
  let score = 0;
  const wrong = [];
  const wrongTopics = {};
  const result = questions.map((q) => {
    const given = answers[q.id] || answers[q.question_text] || "";
    const correct = given === q.correct_answer;
    if (correct) score++;
    else {
      wrong.push({ id: q.id, question: q.question_text, correct: q.correct_answer, given, topic: q.topic });
      const t = q.topic || "umumiy";
      wrongTopics[t] = (wrongTopics[t] || 0) + 1;
    }
    return { id: q.id, correct };
  });
  const total = questions.length;
  const percent = total ? Math.round((score / total) * 100) : 0;
  let grade;
  if (percent >= 90) grade = "5";
  else if (percent >= 70) grade = "4";
  else if (percent >= 50) grade = "3";
  else grade = "2";
  return { score, total, percent, grade, wrong, wrongTopics };
}

export function saveResult(teacherId, { testId, studentId, answers }) {
  const questions = db.prepare(`SELECT * FROM questions WHERE test_id = ?`).all(testId);
  const graded = gradeTest({ answers, questions });
  const info = db
    .prepare(
      `INSERT INTO test_results (test_id, student_id, teacher_id, score, total, percent, grade, answers_json, wrong_questions_json, wrong_topics_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      testId,
      studentId,
      teacherId,
      graded.score,
      graded.total,
      graded.percent,
      graded.grade,
      JSON.stringify(answers),
      JSON.stringify(graded.wrong),
      JSON.stringify(graded.wrongTopics)
    );
  return { ...graded, id: info.lastInsertRowid };
}

export function adaptiveDifficulty(percent) {
  if (percent >= 80) return { easy: 15, medium: 45, hard: 40 };
  if (percent >= 60) return { easy: 25, medium: 50, hard: 25 };
  if (percent >= 40) return { easy: 40, medium: 45, hard: 15 };
  return { easy: 60, medium: 35, hard: 5 };
}

export function analyzeStudentWeaknesses(studentId) {
  const results = db
    .prepare(`SELECT * FROM test_results WHERE student_id = ? ORDER BY created_at DESC LIMIT 10`)
    .all(studentId);
  const topicStats = {};
  const recent = results[0];
  for (const r of results) {
    const wrong = JSON.parse(r.wrong_topics_json || "{}");
    for (const [topic, count] of Object.entries(wrong)) {
      topicStats[topic] = (topicStats[topic] || 0) + count;
    }
  }
  const sorted = Object.entries(topicStats).sort((a, b) => b[1] - a[1]);
  return {
    recentPercent: recent ? recent.percent : null,
    average: results.length ? Math.round(results.reduce((s, r) => s + r.percent, 0) / results.length) : null,
    weakTopics: sorted.slice(0, 5).map(([topic, count]) => ({ topic, mistakes: count })),
    results,
  };
}
