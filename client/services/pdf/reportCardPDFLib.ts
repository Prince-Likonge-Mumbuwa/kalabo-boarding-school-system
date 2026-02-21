// @/services/pdf/reportCardPDFLib.ts
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { ReportCardData } from '@/pages/admin/ReportCards'; // Adjust path if needed

export async function generateReportCardPDF(report: ReportCardData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0, 0, 0);
  const gray = rgb(0.3, 0.3, 0.3);
  const lightGray = rgb(0.95, 0.95, 0.95);
  const blue = rgb(0, 0.2, 0.8);
  const borderColor = rgb(0.8, 0.8, 0.8);

  let y = height - 40;

  // ==================== HEADER ====================
  page.drawText('MINISTRY OF EDUCATION', {
    x: width / 2 - 80,
    y,
    size: 14,
    font: boldFont,
    color: black,
  });
  y -= 20;

  page.drawText('KALABO BOARDING SECONDARY SCHOOL', {
    x: width / 2 - 100,
    y,
    size: 12,
    font: boldFont,
    color: black,
  });
  y -= 20;

  page.drawText('LEARNER REPORT CARD', {
    x: width / 2 - 60,
    y,
    size: 14,
    font: boldFont,
    color: blue,
  });
  y -= 30;

  // ==================== STUDENT INFO GRID ====================
  const infoStartX = 50;
  const infoColWidths = [150, 80, 80, 70, 70, 80, 80];
  const infoLabels = ['Student Name', 'ID', 'Class', 'Gender', 'Term', 'Position', 'Average'];
  const infoValues = [
    report.studentName,
    report.studentId,
    report.className,
    report.gender,
    report.term,
    report.position,
    `${report.percentage}%`,
  ];

  let infoX = infoStartX;
  infoLabels.forEach((label, i) => {
    // Background
    page.drawRectangle({
      x: infoX,
      y: y - 20,
      width: infoColWidths[i],
      height: 40,
      borderColor,
      borderWidth: 1,
      color: lightGray,
    });
    // Label
    page.drawText(label, {
      x: infoX + 5,
      y: y - 5,
      size: 8,
      font: boldFont,
      color: gray,
    });
    // Value
    page.drawText(infoValues[i], {
      x: infoX + 5,
      y: y - 18,
      size: 10,
      font: i === 6 ? boldFont : font,
      color: i === 6 ? blue : black,
    });
    infoX += infoColWidths[i];
  });
  y -= 50;

  // ==================== SUBJECTS TABLE ====================
  const tableHeaders = ['Subject', 'W4', 'W8', 'EOT', 'Grade', 'Description'];
  const colWidths = [200, 50, 50, 50, 50, 150];
  let tableX = 50;

  // Draw header
  tableHeaders.forEach((header, i) => {
    page.drawRectangle({
      x: tableX,
      y: y - 15,
      width: colWidths[i],
      height: 25,
      color: lightGray,
      borderColor,
      borderWidth: 1,
    });
    page.drawText(header, {
      x: tableX + 5,
      y: y - 5,
      size: 9,
      font: boldFont,
      color: black,
    });
    tableX += colWidths[i];
  });
  y -= 25;

  // Draw rows
  report.subjects.forEach((subject) => {
    tableX = 50;
    const rowY = y - 15;

    // Subject
    page.drawRectangle({
      x: tableX,
      y: rowY,
      width: colWidths[0],
      height: 25,
      borderColor,
      borderWidth: 1,
    });
    page.drawText(subject.subjectName, {
      x: tableX + 5,
      y: y - 5,
      size: 9,
      font,
      color: black,
    });
    tableX += colWidths[0];

    // W4
    const w4Text = subject.week4 >= 0 ? `${subject.week4}%` : subject.week4 === -1 ? 'ABS' : '—';
    page.drawRectangle({
      x: tableX,
      y: rowY,
      width: colWidths[1],
      height: 25,
      borderColor,
      borderWidth: 1,
    });
    page.drawText(w4Text, {
      x: tableX + 15,
      y: y - 5,
      size: 9,
      font,
      color: black,
    });
    tableX += colWidths[1];

    // W8
    const w8Text = subject.week8 >= 0 ? `${subject.week8}%` : subject.week8 === -1 ? 'ABS' : '—';
    page.drawRectangle({
      x: tableX,
      y: rowY,
      width: colWidths[2],
      height: 25,
      borderColor,
      borderWidth: 1,
    });
    page.drawText(w8Text, {
      x: tableX + 15,
      y: y - 5,
      size: 9,
      font,
      color: black,
    });
    tableX += colWidths[2];

    // EOT
    const eotText = subject.endOfTerm >= 0 ? `${subject.endOfTerm}%` : subject.endOfTerm === -1 ? 'ABS' : '—';
    page.drawRectangle({
      x: tableX,
      y: rowY,
      width: colWidths[3],
      height: 25,
      borderColor,
      borderWidth: 1,
      color: lightGray,
    });
    page.drawText(eotText, {
      x: tableX + 15,
      y: y - 5,
      size: 9,
      font: boldFont,
      color: blue,
    });
    tableX += colWidths[3];

    // Grade
    const gradeDisplay = subject.grade > 0 ? subject.grade.toString() : subject.grade === -1 ? 'X' : '—';
    page.drawRectangle({
      x: tableX,
      y: rowY,
      width: colWidths[4],
      height: 25,
      borderColor,
      borderWidth: 1,
      color: lightGray,
    });
    page.drawText(gradeDisplay, {
      x: tableX + 20,
      y: y - 5,
      size: 9,
      font: boldFont,
      color: blue,
    });
    tableX += colWidths[4];

    // Description
    page.drawRectangle({
      x: tableX,
      y: rowY,
      width: colWidths[5],
      height: 25,
      borderColor,
      borderWidth: 1,
    });
    page.drawText(subject.gradeDescription, {
      x: tableX + 5,
      y: y - 5,
      size: 9,
      font,
      color: black,
    });

    y -= 25;
  });

  // Total row
  tableX = 50;
  const totalY = y - 15;
  page.drawRectangle({
    x: tableX,
    y: totalY,
    width: colWidths[0] + colWidths[1] + colWidths[2],
    height: 25,
    borderColor,
    borderWidth: 1,
    color: lightGray,
  });
  page.drawText('Overall Average:', {
    x: tableX + 5,
    y: y - 5,
    size: 9,
    font: boldFont,
    color: black,
  });
  tableX += colWidths[0] + colWidths[1] + colWidths[2];

  page.drawRectangle({
    x: tableX,
    y: totalY,
    width: colWidths[3] + colWidths[4] + colWidths[5],
    height: 25,
    borderColor,
    borderWidth: 1,
    color: lightGray,
  });
  page.drawText(`${report.percentage}%`, {
    x: tableX + 20,
    y: y - 5,
    size: 10,
    font: boldFont,
    color: blue,
  });
  y -= 30;

  // ==================== TEACHER'S COMMENT ====================
  page.drawText("Teacher's Comment", {
    x: 50,
    y: y - 10,
    size: 10,
    font: boldFont,
    color: black,
  });
  y -= 20;
  page.drawText(`"${report.teachersComment}"`, {
    x: 50,
    y: y - 10,
    size: 9,
    font,
    color: black,
  });
  y -= 20;

  // ==================== LEGEND ====================
  page.drawText('— = Not Entered | ABS = Absent', {
    x: 50,
    y: y - 10,
    size: 8,
    font,
    color: gray,
  });
  y -= 20;

  // ==================== FOOTER ====================
  page.drawText(`Generated: ${report.generatedDate}`, {
    x: width - 150,
    y: y - 10,
    size: 8,
    font,
    color: gray,
  });

  return pdfDoc.save();
}