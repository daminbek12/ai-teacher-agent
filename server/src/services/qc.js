import db from "../db/index.js";
import { generateJson, aiEnabled } from "./ai.js";
import { logAudit } from "./audit.js";

export function localQcQuestion(q, { allQuestions }) {
  const issues = [];
  const text = q.question_text.trim();
  const options = q.options || [];

  if (text.length < 10) issues.push("Savol juda qisqa");
  if (text.length > 400) issues.push("Savol juda uzun");
  if (!q.correct_answer) issues.push("To'g'ri javob yo'q");
  if (options.length < 3) issues.push("Kamida 4 ta variant bo'lishi kerak");
  if (!/^[A-D]$/.test(q.correct_answer || "")) issues.push("Noto'g'ri javob formati");

  const correctText = options.find((o) => o.letter === q.correct_answer);
  if (correctText && correctText.text.length < 3) issues.push("To'g'ri javob juda qisqa");

  const dupInTest = allQuestions.filter((o) => o.question_text.trim().toLowerCase() === text.toLowerCase()).length;
  if (dupInTest > 1) issues.push("Testda bir xil savol takrorlangan");

  const optTexts = options.map((o) => o.text.trim().toLowerCase());
  if (new Set(optTexts).size !== optTexts.length) issues.push("Variantlar takrorlangan");

  const answerDist = {};
  allQuestions.forEach((a) => { answerDist[a.correct_answer] = (answerDist[a.correct_answer] || 0) + 1; });

  let score = 100;
  score -= issues.length * 10;
  if (text.length < 15) score -= 10;
  score = Math.max(0, Math.min(100, score));
  return { score, issues, passed: score >= 85 };
}

export async function aiQcQuestion(teacherId, q, { subject = "Tarix" } = {}) {
  if (!aiEnabled) return null;
  try {
    const review = await generateJson(
      teacherId,
      [
        {
          role: "system",
          content: `Sen ${subject} fanidan test savollarini sifat tekshiruvchi reviewer AI yordamchisan. Fakt to'g'riligi, chalkashlik, imlo va qiyinlikni tekshirasan. O'zbek tilida ishlaysan.`,
        },
        {
          role: "user",
          content: `Ushbu savolni 0-100 baholang va muammolarni sanab bering:\nSavol: ${q.question_text}\nVariantlar: ${(q.options || []).map((o) => `${o.letter}) ${o.text}`).join("\n")}\nTo'g'ri javob: ${q.correct_answer}\n\nJSON: {"score": 0-100, "issues": ["..."]}`,
        },
      ],
      { task: "qc", complexity: "auto", temperature: 0.1, maxTokens: 700 }
    );
    return { score: Math.round(review.score || 0), issues: review.issues || [], passed: (review.score || 0) >= 85 };
  } catch {
    return null;
  }
}

export async function runTestQc(teacherId, testId, { minScore = 85, withAI = false } = {}) {
  const questions = db.prepare(`SELECT * FROM questions WHERE test_id = ? ORDER BY id`).all(testId);
  if (questions.length === 0) return { score: 0, passed: false, reviews: [] };

  const reviews = [];
  for (const q of questions) {
    const qObj = { ...q, options: JSON.parse(q.options_json) };
    let local = localQcQuestion(qObj, { allQuestions: questions.map((x) => ({ ...x, options: JSON.parse(x.options_json) })) });
    let ai = null;
    if (withAI) ai = await aiQcQuestion(teacherId, qObj);
    let finalScore = local.score;
    let issues = [...local.issues];
    if (ai) {
      finalScore = Math.round(local.score * 0.6 + ai.score * 0.4);
      issues = [...issues, ...ai.issues.map((i) => `AI: ${i}`)];
    }
    db.prepare(
      `INSERT INTO question_reviews (question_id, teacher_id, score, issues_json, passed, reviewer)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(q.id, teacherId, finalScore, JSON.stringify(issues), finalScore >= minScore ? 1 : 0, ai ? "ai+local" : "local");
    reviews.push({ question_id: q.id, score: finalScore, issues, passed: finalScore >= minScore });
  }

  const avg = Math.round(reviews.reduce((s, r) => s + r.score, 0) / reviews.length);
  const passedCount = reviews.filter((r) => r.passed).length;
  db.prepare(`UPDATE tests SET status = ? WHERE id = ?`).run(avg >= minScore ? "ready" : "needs_revision", testId);
  logAudit(teacherId, { action: "test.qc", entityType: "test", entityId: testId, detail: { avg, passed: passedCount, total: reviews.length } });
  return { score: avg, passed: avg >= minScore, passedQuestions: passedCount, totalQuestions: reviews.length, reviews };
}

export function regenerateWeakQuestions(teacherId, testId, { regenerateAll = false } = {}) {
  const reviews = db
    .prepare(`SELECT r.*, q.question_text, q.difficulty, q.topic FROM question_reviews r JOIN questions q ON q.id = r.question_id WHERE r.question_id IN (SELECT id FROM questions WHERE test_id = ?) ORDER BY r.id`)
    .all(testId);
  const weak = regenerateAll
    ? reviews
    : reviews.filter((r) => !r.passed || r.score < 85);
  return weak.map((w) => ({
    question_id: w.question_id,
    question_text: w.question_text,
    difficulty: w.difficulty,
    topic: w.topic,
    score: w.score,
  }));
}
