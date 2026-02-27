// @/services/pdf/reportCardPDFLib.ts
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { ReportCardData } from '@/pages/admin/ReportCards';

export async function generateReportCardPDF(report: ReportCardData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.95, 0.95, 0.95);
  const darkBlue = rgb(0, 0.3, 0.6);
  const borderColor = rgb(0.8, 0.8, 0.8);

  const leftMargin = 40;
  const rightMargin = 40;
  const tableWidth = width - leftMargin - rightMargin;
  
  let y = height - 40;

  // ==================== HEADER ====================
  page.drawText('KALABO BOARDING SECONDARY SCHOOL', {
    x: width / 2 - 130,
    y,
    size: 16,
    font: boldFont,
    color: black,
  });
  y -= 22;

  page.drawText('STUDENT REPORT CARD', {
    x: width / 2 - 70,
    y,
    size: 14,
    font: boldFont,
    color: darkBlue,
  });
  y -= 30;

  // ==================== STUDENT INFO ====================
  // Two-column layout
  const col1X = leftMargin;
  const col2X = width / 2 + 20;
  
  const infoItems = [
    { label: 'Student Name:', value: report.studentName },
    { label: 'Student ID:', value: report.studentId },
    { label: 'Class:', value: report.className },
    { label: 'Gender:', value: report.gender },
    { label: 'Term:', value: report.term },
    { label: 'Position:', value: report.position },
    { label: 'Average:', value: `${report.percentage}%` },
  ];

  // Left column (first 4 items)
  for (let i = 0; i < 4; i++) {
    page.drawText(infoItems[i].label, {
      x: col1X,
      y: y - (i * 18),
      size: 10,
      font: boldFont,
      color: gray,
    });
    page.drawText(infoItems[i].value, {
      x: col1X + 80,
      y: y - (i * 18),
      size: 11,
      font: font,
      color: black,
    });
  }

  // Right column (remaining items)
  for (let i = 4; i < infoItems.length; i++) {
    const index = i - 4;
    page.drawText(infoItems[i].label, {
      x: col2X,
      y: y - (index * 18),
      size: 10,
      font: boldFont,
      color: gray,
    });
    page.drawText(infoItems[i].value, {
      x: col2X + 70,
      y: y - (index * 18),
      size: 11,
      font: i === 6 ? boldFont : font,
      color: i === 6 ? darkBlue : black,
    });
  }
  
  y -= 90;

  // ==================== SUBJECTS TABLE ====================
  // Adjusted column widths for better fit
  const headers = ['Subject', 'W4', 'W8', 'EOT', 'Grade', 'Description'];
  const colWidths = [140, 40, 40, 45, 45, tableWidth - 310]; // Remaining width for description
  let tableX = leftMargin;

  // Table header
  headers.forEach((header, i) => {
    page.drawRectangle({
      x: tableX,
      y: y - 18,
      width: colWidths[i],
      height: 22,
      color: lightGray,
      borderColor: borderColor,
      borderWidth: 1,
    });
    
    // Center align numbers, left align text
    let textX = tableX + 5;
    if (i >= 1 && i <= 3) {
      textX = tableX + (colWidths[i] / 2) - 8;
    } else if (i === 4) {
      textX = tableX + (colWidths[i] / 2) - 10;
    }
    
    page.drawText(header, {
      x: textX,
      y: y - 12,
      size: 9,
      font: boldFont,
      color: black,
    });
    tableX += colWidths[i];
  });
  y -= 24;

  // Table rows
  report.subjects.forEach((subject, index) => {
    tableX = leftMargin;
    const rowY = y - 14;
    const bgColor = index % 2 === 0 ? lightGray : rgb(1, 1, 1);

    // Subject
    page.drawRectangle({
      x: tableX,
      y: rowY,
      width: colWidths[0],
      height: 20,
      color: bgColor,
      borderColor: borderColor,
      borderWidth: 1,
    });
    page.drawText(subject.subjectName, {
      x: tableX + 5,
      y: y - 9,
      size: 9,
      font: font,
    });
    tableX += colWidths[0];

    // Week 4
    const w4 = subject.week4 >= 0 ? `${subject.week4}` : subject.week4 === -1 ? 'ABS' : '-';
    page.drawRectangle({
      x: tableX,
      y: rowY,
      width: colWidths[1],
      height: 20,
      color: bgColor,
      borderColor: borderColor,
      borderWidth: 1,
    });
    page.drawText(w4, {
      x: tableX + 12,
      y: y - 9,
      size: 9,
      font: font,
    });
    tableX += colWidths[1];

    // Week 8
    const w8 = subject.week8 >= 0 ? `${subject.week8}` : subject.week8 === -1 ? 'ABS' : '-';
    page.drawRectangle({
      x: tableX,
      y: rowY,
      width: colWidths[2],
      height: 20,
      color: bgColor,
      borderColor: borderColor,
      borderWidth: 1,
    });
    page.drawText(w8, {
      x: tableX + 12,
      y: y - 9,
      size: 9,
      font: font,
    });
    tableX += colWidths[2];

    // EOT
    const eot = subject.endOfTerm >= 0 ? `${subject.endOfTerm}` : subject.endOfTerm === -1 ? 'ABS' : '-';
    page.drawRectangle({
      x: tableX,
      y: rowY,
      width: colWidths[3],
      height: 20,
      color: bgColor,
      borderColor: borderColor,
      borderWidth: 1,
    });
    page.drawText(eot, {
      x: tableX + 14,
      y: y - 9,
      size: 9,
      font: boldFont,
      color: darkBlue,
    });
    tableX += colWidths[3];

    // Grade
    const grade = subject.grade > 0 ? subject.grade.toString() : subject.grade === -1 ? 'X' : '-';
    page.drawRectangle({
      x: tableX,
      y: rowY,
      width: colWidths[4],
      height: 20,
      color: bgColor,
      borderColor: borderColor,
      borderWidth: 1,
    });
    page.drawText(grade, {
      x: tableX + 16,
      y: y - 9,
      size: 9,
      font: boldFont,
    });
    tableX += colWidths[4];

    // Description
    page.drawRectangle({
      x: tableX,
      y: rowY,
      width: colWidths[5],
      height: 20,
      color: bgColor,
      borderColor: borderColor,
      borderWidth: 1,
    });
    page.drawText(subject.gradeDescription, {
      x: tableX + 5,
      y: y - 9,
      size: 8,
      font: font,
      color: gray,
    });

    y -= 20;
  });

  // Total row
  y -= 2;
  tableX = leftMargin;
  const totalY = y - 14;
  
  page.drawRectangle({
    x: tableX,
    y: totalY,
    width: colWidths[0] + colWidths[1] + colWidths[2],
    height: 22,
    borderColor: borderColor,
    borderWidth: 1,
  });
  page.drawText('Overall Average:', {
    x: tableX + 5,
    y: y - 8,
    size: 9,
    font: boldFont,
  });
  tableX += colWidths[0] + colWidths[1] + colWidths[2];

  page.drawRectangle({
    x: tableX,
    y: totalY,
    width: colWidths[3] + colWidths[4] + colWidths[5],
    height: 22,
    borderColor: borderColor,
    borderWidth: 1,
  });
  page.drawText(`${report.percentage}%`, {
    x: tableX + 60,
    y: y - 8,
    size: 10,
    font: boldFont,
    color: darkBlue,
  });
  y -= 35;

  // ==================== TEACHER'S COMMENT ====================
  page.drawText("Teacher's Comment:", {
    x: leftMargin,
    y,
    size: 10,
    font: boldFont,
  });
  y -= 16;
  
  page.drawText(`"${report.teachersComment}"`, {
    x: leftMargin + 10,
    y,
    size: 9,
    font: font,
    color: gray,
  });
  y -= 25;

  // ==================== LEGEND ====================
  page.drawText('Legend: - = Not entered | ABS = Absent | X = Incomplete', {
    x: leftMargin,
    y,
    size: 8,
    font: font,
    color: gray,
  });

  // ==================== FOOTER ====================
  page.drawText(`Generated: ${report.generatedDate}`, {
    x: leftMargin,
    y: 40,
    size: 8,
    font: font,
    color: gray,
  });

  page.drawLine({
    start: { x: width - 180, y: 45 },
    end: { x: width - 50, y: 45 },
    thickness: 1,
    color: gray,
  });
  page.drawText("Teacher's Signature", {
    x: width - 165,
    y: 30,
    size: 8,
    font: font,
    color: gray,
  });

  return pdfDoc.save();
}