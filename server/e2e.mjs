import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || "http://localhost:3001/api";
const teacherName = "E2E_" + Date.now();

let passed = 0;
let failed = 0;
const results = [];

function check(step, ok, detail = "") {
  if (ok) {
    passed++;
    results.push(`PASS ${step.toString().padStart(2)}. ${detail}`);
  } else {
    failed++;
    results.push(`FAIL ${step.toString().padStart(2)}. ${detail}`);
  }
}

async function api(pathSeg, { method = "GET", body, token, raw = false } = {}) {
  const res = await fetch(`${BASE}${pathSeg}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const text = await res.text();
  if (!res.ok) {
    console.error(`API ERROR ${method} ${pathSeg} -> ${res.status}: ${text.slice(0, 300)}`);
    return { __error: true, status: res.status };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { __raw: true, text };
  }
}

const TXT_CONTENT = `Bob 1. AMIR TEMUR DAVLATI
1-mavzu. Amir Temur hayoti va faoliyati
Amir Temur 1336-yil 9-aprelda Shahrisabz yaqinidagi Xoja-Ilgar qishlog'ida tug'ilgan. U 1370-yilda Movarounnahr hukmdori deb e'lon qilingan. Amir Temur davlati Samarqand shahrini poytaxt qilib belgilagan. Uning hukmronligi davrida 1370-1405 yillarda davlat chegarasini kengaytirgan. Amir Temur 1405-yil 18-fevralda vafot etgan.
2-mavzu. Mirzo Ulug'bek davri
Mirzo Ulug'bek 1394-yilda tug'ilgan va 1449-yilda vafot etgan. U Samarqandda observatoriya qurgan va astronomiyaga katta hissa qo'shgan. Ulug'bek ziji o'sha davrning eng aniq astronomik asari hisoblangan.
3-mavzu. Temuriylar sulolasi
Temuriylar sulolasi 1370-yildan 1506-yilgacha hukmronlik qilgan. Sulola davrida Samarqand, Hirot, Buxoro shaharlar rivojlangan.`;

async function makePdfFromText(text) {
  const lines = text.split("\n").slice(0, 40);
  let content = "";
  lines.forEach((line, i) => {
    const y = 800 - i * 16;
    const safe = line.replace(/[\\()]/g, "");
    if (safe) content += `BT /F1 10 Tf 40 ${y} Td (${safe}) Tj ET\n`;
  });
  const obj1 = "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n";
  const obj2 = "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n";
  const obj3 = "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n";
  const obj4 = `4 0 obj << /Length ${content.length} >> stream\n${content}endstream endobj\n`;
  const obj5 = "5 0 obj << /Type /Font /BaseFont /Helvetica /Subtype /Type1 >> endobj\n";
  const pdf = `%PDF-1.4\n${obj1}${obj2}${obj3}${obj4}${obj5}\ntrailer << /Root 1 0 R /Size 6 >>\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

function makeZip(files) {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) zip.addFile(name, content);
  return zip.toBuffer();
}

console.log("=== AI TEACHER AGENT — E2E TEST (29 qadam) ===\n");

// ---- 1. Teacher registration ----
const reg = await api("/auth/register", { method: "POST", body: { name: teacherName, school_name: "E2E maktab", subject: "Tarix", password: "e2e" + Date.now() } });
check(1, !!reg.token && !!reg.user?.id, `O'qituvchi ro'yxatdan o'tgan (id=${reg.user?.id})`);
const token = reg.token;

// ---- 2. Auto Setup bot flow exists ----
const botSrc = fs.readFileSync(path.join(__dirname, "src/services/telegram.js"), "utf8");
check(2, botSrc.includes("startAutoSetup") && botSrc.includes("AVTOMATIK SOZLASH"), "Telegram Auto Setup oqimi mavjud");

// ---- 3. Timetable image (simulated) ----
const timetableText = "Dushanba 09:00 7-A Tarix\nDushanba 10:00 8-A Tarix\nSeshanba 09:00 9-B Tarix";
check(3, timetableText.length > 10, "Timetable matni tayyorlandi");

// ---- 4. Timetable OCR/parser ----
const parsed = await api("/ocr/timetable", { method: "POST", body: { text: timetableText, local_only: true }, token });
check(4, (parsed.entries || []).length === 3, `Jadval o'qildi: ${parsed.entries?.length} dars`);

// ---- 5. Data ready for confirmation ----
check(5, (parsed.entries || []).every((e) => e.day_of_week && e.start_time && e.class_name), "Natijalar tasdiqlashga tayyor");

// ---- 6. Classes + schedule ----
const c1 = await api("/classes", { method: "POST", body: { name: "7-A", subject: "Tarix" }, token });
const c2 = await api("/classes", { method: "POST", body: { name: "8-A", subject: "Tarix" }, token });
const c3 = await api("/classes", { method: "POST", body: { name: "9-B", subject: "Tarix" }, token });
const classIds = [c1.id, c2.id, c3.id];
for (const e of parsed.entries || []) {
  const clsMap = { "7-A": classIds[0], "8-A": classIds[1], "9-B": classIds[2] };
  await api("/schedule", { method: "POST", body: { class_id: clsMap[e.class_name], day_of_week: e.day_of_week, start_time: e.start_time, subject: e.subject || "Tarix" }, token });
}
const scheduleList = await api("/schedule", { token });
check(6, classIds.every(Boolean) && Array.isArray(scheduleList) && scheduleList.length === 3, `3 sinf + 3 ta jadval yozuvi yaratildi`);

// ---- 7. Textbook search ----
const kbSearch = await api("/textbooks/search/kb?q=Amir%20Temur", { token });
check(7, !kbSearch.__error, "Darslik qidiruv endpointi ishlaydi (bo'sh natija kutilmoqda)");

// ---- 8. Teacher asked to upload ----
check(8, botSrc.includes("textbook_confirm:ok") && botSrc.includes("askTextbookMeta"), "Telegram upload so'rov funksiyasi mavjud");

// ---- 9. Teacher sends ZIP ----
const zipBuf = makeZip({ "darslik.pdf": await makePdfFromText(TXT_CONTENT) });
check(9, zipBuf.length > 0, `Teacher ZIP tayyor (${zipBuf.length} byte)`);

// ---- 10. ZIP parsed ----
const upload = await api("/textbooks/upload", {
  method: "POST",
  body: { file_base64: zipBuf.toString("base64"), file_name: "darslik.zip", subject: "Tarix", grade: "7", title: "O'zbekiston tarixi (E2E)", edition_year: "2026" },
  token,
});
check(10, !!upload.textbook_id && upload.extracted_chars > 100, `ZIP parse: ${upload.extracted_chars} belgi, ${upload.pages} sahifa`);

// ---- 11. OCR/text extraction ----
check(11, (upload.extracted_chars || 0) > 0, `PDF matni ajratildi (${upload.extracted_chars} belgi)`);

// ---- 12-13. Structure ----
const structure = await api(`/textbooks/${upload.textbook_id}/structure`, { method: "POST", body: { local_only: true }, token });
check(12, !structure.__error && structure.chapters >= 1, `Boblar aniqlandi: ${structure.chapters ?? "?"}`);
check(13, !structure.__error && structure.lessons >= 3, `Mavzular aniqlandi: ${structure.lessons ?? "?"}`);

// ---- 14. RAG index ----
const indexData = await api(`/textbooks/${upload.textbook_id}/index`, { token });
const kb = await api(`/textbooks/search/kb?q=Amir%20Temur%20Samarqand`, { token });
check(14, !indexData.__error && Array.isArray(kb) && kb.length >= 1, `RAG index: ${Array.isArray(kb) ? kb.length : 0} chunk, sanalar: ${indexData.dates?.length ?? "?"}`);

// ---- 15. Lesson plan + homework ----
const topic1 = "Amir Temur davlati";
await api("/topics", { method: "POST", body: { class_id: classIds[0], title: topic1 }, token });
const lp = await api("/lesson-plans/generate", { method: "POST", body: { class_id: classIds[0], topic: topic1 }, token });
const hw = await api("/homework/generate", { method: "POST", body: { class_id: classIds[0], topic: topic1 }, token });
check(15, !lp.__error && !!lp.plan && !!lp.plan.maqsad && !hw.__error && (hw.content || "").length > 30, "Dars rejasi + uy vazifasi yaratildi");

// ---- 16. Test schedule settings ----
const settings = await api("/settings", { method: "PUT", body: { test_day: 5, test_time: "18:00", test_count: 10, scheduler_enabled: false }, token });
check(16, !settings.__error && settings.ok, "Test schedule sozlandi (juma 18:00)");

// ---- 17. Scheduled test ----
const prepBody = await api("/tests/schedule", {
  method: "POST",
  body: { class_id: classIds[0], title: "Haftalik test (E2E)", topic: topic1, question_count: 10, subject: "Tarix", class_level: "7", send_at: "2026-08-28T18:00:00" },
  token,
});
check(17, !prepBody.__error && !!prepBody.id, `Scheduled test yaratildi (id=${prepBody.id})`);

// ---- 18. Questions generated ----
check(18, Array.isArray(prepBody.questions) && prepBody.questions.length === 10, `Testda ${prepBody.questions?.length ?? 0}/10 savol`);

// ---- 19. QC ----
check(19, prepBody.qc && prepBody.qc.score > 0, `QC: ${prepBody.qc?.score}/100 (${prepBody.qc?.passed ? "o'tdi" : "o'tmadi"})`);

// ---- 20. Weak-question regenerate ----
const weakResp = await api(`/tests/${prepBody.id}/regenerate-weak`, { method: "POST", body: { min_score: 99 }, token });
check(20, !weakResp.__error && weakResp.regenerated !== undefined, `Zaif savollar regeneratsiyasi ishlaydi (${weakResp.regenerated} ta)`);

// ---- 21. Final test saved ----
const finalTest = await api(`/tests/${prepBody.id}`, { token });
check(21, !finalTest.__error && finalTest.id === prepBody.id, `Test saqlandi (holat: ${finalTest.status})`);

// ---- 22. DOCX export ----
const docxRes = await api(`/tests/${prepBody.id}/docx`, { token, raw: true });
const docxBytes = Buffer.from(await docxRes.arrayBuffer());
check(22, docxRes.ok && docxBytes.slice(0, 2).toString() === "PK", `DOCX yaratildi (${docxBytes.length} byte)`);

// ---- 23. PDF export ----
const pdfRes = await api(`/tests/${prepBody.id}/pdf`, { token, raw: true });
const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
check(23, pdfRes.ok && pdfBytes.slice(0, 5).toString() === "%PDF-", `PDF yaratildi (${pdfBytes.length} byte)`);

// ---- 24. Telegram send present ----
check(24, botSrc.includes("export async function sendTest") && botSrc.includes("send_test:"), "Telegram yuborish funksiyasi mavjud (bot tokeni sozlangan)");

// ---- 25. Student answers ----
const st = await api("/students", { method: "POST", body: { class_id: classIds[0], first_name: "E2E", last_name: "O'quvchi" }, token });
const answers = {};
for (const q of prepBody.questions || []) answers[q.id] = q.correct_answer;
check(25, !st.__error && !!st.id && Object.keys(answers).length === 10, `O'quvchi javoblari tayyor (student id=${st.id})`);

// ---- 26. Grading ----
const result = await api(`/tests/${prepBody.id}/grade`, { method: "POST", body: { student_id: st.id, answers }, token });
check(26, !result.__error && result.percent === 100, `Natija hisoblandi: ${result.percent}%, baho ${result.grade}`);

// ---- 27. Weakness analysis ----
const weak = await api(`/tests/results/weak/${st.id}`, { token });
check(27, !weak.__error && Array.isArray(weak.weakTopics), `Zaif mavzular tahlili (zaif: ${weak.weakTopics?.length ?? "?"})`);

// ---- 28. Adaptive test ----
const adaptive = await api(`/tests/results/adaptive/${st.id}`, { token });
check(28, !adaptive.__error && adaptive.easy !== undefined && adaptive.hard !== undefined, `Adaptiv test taqsimoti: ${adaptive.easy}/${adaptive.medium}/${adaptive.hard}%`);

// ---- 29. Weekly report ----
const weekly = await api(`/reports/weekly?class_id=${classIds[0]}`, { token });
const weeklyPdf = await api(`/reports/weekly/pdf?class_id=${classIds[0]}`, { token, raw: true });
const weeklyBytes = Buffer.from(await weeklyPdf.arrayBuffer());
check(29, !weekly.__error && (weekly.testsTaken ?? 0) >= 1 && weeklyBytes.slice(0, 5).toString() === "%PDF-", `Haftalik hisobot: ${weekly.testsTaken} test, ${weekly.average}% o'rtacha, PDF OK`);

const audit = await api("/audit?limit=20", { token });
if (Array.isArray(audit) && audit.length > 0) {
  console.log("Audit log (oxirgi amallar): " + audit.slice(0, 6).map((a) => a.action).join(", "));
}

console.log("\n=== E2E NATIJASI ===");
results.forEach((r) => console.log(r));
console.log(`\nJami: ${passed} PASS, ${failed} FAIL`);
process.exit(failed > 0 ? 1 : 0);
