import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";

function buildTestDoc({ schoolName = "", subject = "Tarix", className = "", topic = "", teacherName = "", date = "", title = "TEST", questions = [], showAnswers = false, beletNumber = "", isHomework = false }) {
  const children = [];

  if (schoolName) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: schoolName, bold: true, size: 28 })],
      })
    );
  }

  children.push(new Paragraph({ text: "", spacing: { after: 100 } }));

  const meta = [
    `Fan: ${subject}`,
    `Sinf: ${className}`,
    `Mavzu: ${topic}`,
    `O'qituvchi: ${teacherName || "__________"}`,
    `Sana: ${date || "__________"}`,
  ];
  if (isHomework) meta.push("Uyga vazifa: HA");
  for (const m of meta) {
    children.push(new Paragraph({ children: [new TextRun({ text: m, size: 22 })] }));
  }
  if (beletNumber) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: `Belet raqami: № ${beletNumber}`, bold: true, size: 22 })],
      })
    );
  }

  children.push(new Paragraph({ text: "", spacing: { after: 100 } }));
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: title, bold: true, size: 32 })],
    })
  );
  children.push(new Paragraph({ text: "", spacing: { after: 100 } }));

  questions.forEach((q, idx) => {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [
          new TextRun({ text: `${idx + 1}. ${q.question_text}`, bold: true, size: 24 }),
        ],
      })
    );
    const options = typeof q.options === "string" ? JSON.parse(q.options) : q.options;
    options.forEach((opt) => {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          children: [
            new TextRun({
              text: `${opt.letter}) ${opt.text}`,
              size: 22,
            }),
          ],
        })
      );
    });
    if (showAnswers) {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          children: [new TextRun({ text: `To'g'ri javob: ${q.correct_answer}`, size: 22, bold: true, color: "2E7D32" })],
        })
      );
    }
  });

  children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "JAVOBLAR VARAQASI", bold: true, size: 26 })],
    })
  );
  children.push(new Paragraph({ text: "", spacing: { after: 100 } }));

  const answerRows = [];
  for (let i = 0; i < questions.length; i += 5) {
    const cells = [];
    for (let j = i; j < i + 5 && j < questions.length; j++) {
      cells.push(
        new TableCell({
          width: { size: 20, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: `${j + 1} — __`, size: 22 })] })],
        })
      );
    }
    answerRows.push(new TableRow({ children: cells }));
  }
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: answerRows }));

  if (showAnswers) {
    children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "O'QITUVCHI UCHUN JAVOBLAR KALITI", bold: true, size: 26 })],
      })
    );
    children.push(new Paragraph({ text: "", spacing: { after: 100 } }));
    let line = "";
    questions.forEach((q, idx) => {
      line += `${idx + 1} — ${q.correct_answer}`;
      if ((idx + 1) % 5 === 0 || idx === questions.length - 1) {
        children.push(new Paragraph({ children: [new TextRun({ text: line, size: 22 })] }));
        line = "";
      } else {
        line += "    ";
      }
    });
  }

  return new Document({ sections: [{ properties: {}, children }] });
}

export async function generateTestDocx(data) {
  const doc = buildTestDoc(data);
  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

export function generateReportDocx({ title = "HISOBOT", sections = [] }) {
  const children = [];
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: title, bold: true, size: 32 })],
    })
  );
  for (const sec of sections) {
    if (sec.heading) {
      children.push(
        new Paragraph({
          spacing: { before: 300, after: 100 },
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: sec.heading, bold: true, size: 26 })],
        })
      );
    }
    if (Array.isArray(sec.items)) {
      sec.items.forEach((item) => {
        children.push(
          new Paragraph({
            indent: { left: 360 },
            children: [new TextRun({ text: String(item), size: 22 })],
          })
        );
      });
    } else if (typeof sec.body === "string") {
      children.push(new Paragraph({ children: [new TextRun({ text: sec.body, size: 22 })] }));
    }
  }
  return new Document({ sections: [{ properties: {}, children }] });
}

export async function generateTextDocx(text, { title = "MATN" } = {}) {
  const children = [];
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: title, bold: true, size: 32 })],
    })
  );
  const lines = String(text).split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) {
      children.push(new Paragraph({ text: "" }));
      continue;
    }
    children.push(
      new Paragraph({
        spacing: { after: 100 },
        children: [new TextRun({ text: line, size: 22 })],
      })
    );
  }
  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}

export function generatePlanDocx({ title = "DARS REJASI", fields = [] }) {
  const children = [];
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: title, bold: true, size: 32 })],
    })
  );
  for (const f of fields) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 60 },
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: f.label, bold: true, size: 24 })],
      })
    );
    children.push(new Paragraph({ children: [new TextRun({ text: f.value, size: 22 })] }));
  }
  return new Document({ sections: [{ properties: {}, children }] });
}
