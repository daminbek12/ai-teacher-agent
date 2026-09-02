import PDFDocument from "pdfkit";

function writeTestPdf(doc, data) {
  const { schoolName = "", subject = "Tarix", className = "", topic = "", teacherName = "", date = "", title = "TEST", questions = [], showAnswers = false, beletNumber = "", isHomework = false } = data;

  if (schoolName) {
    doc.font("Helvetica-Bold").fontSize(16).text(schoolName, { align: "center" });
    doc.moveDown(0.5);
  }
  doc.font("Helvetica").fontSize(11);
  doc.text(`Fan: ${subject}`);
  doc.text(`Sinf: ${className}`);
  doc.text(`Mavzu: ${topic}`);
  doc.text(`O'qituvchi: ${teacherName || "__________"}`);
  doc.text(`Sana: ${date || "__________"}`);
  if (isHomework) {
    doc.text(`Uyga vazifa: HA`);
  }
  if (beletNumber) {
    doc.font("Helvetica-Bold").fontSize(12).text(`Belet raqami: № ${beletNumber}`, { align: "right" });
    doc.font("Helvetica").fontSize(11);
  }
  doc.moveDown();
  doc.font("Helvetica-Bold").fontSize(16).text(title, { align: "center" });
  doc.moveDown();

  questions.forEach((q, idx) => {
    doc.font("Helvetica-Bold").fontSize(11).text(`${idx + 1}. ${q.question_text}`, { lineGap: 3 });
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(10);
    const options = typeof q.options === "string" ? JSON.parse(q.options) : q.options;
    options.forEach((opt) => {
      doc.text(`    ${opt.letter}) ${opt.text}`, { lineGap: 2 });
    });
    if (showAnswers) {
      doc.fillColor("#2E7D32").font("Helvetica-Bold").text(`    To'g'ri javob: ${q.correct_answer}`);
      doc.fillColor("black");
    }
    doc.moveDown(0.4);
  });

  doc.moveDown();
  doc.font("Helvetica-Bold").fontSize(13).text("JAVOBLAR VARAQASI", { align: "center" });
  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(11);
  const lines = [];
  let line = "";
  questions.forEach((_, idx) => {
    line += `${idx + 1} — __   `;
    if ((idx + 1) % 4 === 0) {
      lines.push(line.trim());
      line = "";
    }
  });
  if (line) lines.push(line.trim());
  lines.forEach((l) => doc.text(l, { lineGap: 6 }));

  if (showAnswers) {
    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(13).text("O'QITUVCHI UCHUN JAVOBLAR KALITI", { align: "center" });
    doc.moveDown(0.5);
    let kline = "";
    questions.forEach((q, idx) => {
      kline += `${idx + 1} — ${q.correct_answer}   `;
      if ((idx + 1) % 4 === 0) {
        doc.font("Helvetica").fontSize(11).text(kline.trim());
        kline = "";
      }
    });
    if (kline) doc.font("Helvetica").fontSize(11).text(kline.trim());
  }
}

function writeReportPdf(doc, { title = "HISOBOT", sections = [] }) {
  doc.font("Helvetica-Bold").fontSize(18).text(title, { align: "center" });
  doc.moveDown();
  for (const sec of sections) {
    if (sec.heading) {
      doc.font("Helvetica-Bold").fontSize(13).text(sec.heading);
      doc.moveDown(0.3);
    }
    if (Array.isArray(sec.items)) {
      doc.font("Helvetica").fontSize(11);
      sec.items.forEach((item) => {
        doc.text(`• ${item}`, { lineGap: 3 });
      });
      doc.moveDown(0.5);
    } else if (typeof sec.body === "string") {
      doc.font("Helvetica").fontSize(11).text(sec.body);
      doc.moveDown(0.5);
    }
  }
}

export function generateTestPdf(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 50 });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    writeTestPdf(doc, data);
    doc.end();
  });
}

export function generateReportPdf(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 50 });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    writeReportPdf(doc, data);
    doc.end();
  });
}
