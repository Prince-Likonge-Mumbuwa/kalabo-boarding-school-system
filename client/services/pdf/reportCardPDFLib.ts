// @/services/pdf/reportCardPDFLib.ts
import { PDFDocument, rgb, StandardFonts, PDFImage } from 'pdf-lib';
import { ReportCardData } from '@/pages/admin/ReportCards';

/**
 * Helper function to embed school logo
 */
const embedSchoolLogo = async (pdfDoc: PDFDocument): Promise<PDFImage | null> => {
  try {
    const logoUrl = '/images/school-logo.png';
    const response = await fetch(logoUrl);
    
    if (!response.ok) {
      console.warn('Logo image not found at /images/school-logo.png');
      return null;
    }
    
    const logoImageBytes = await response.arrayBuffer();
    
    try {
      return await pdfDoc.embedPng(logoImageBytes);
    } catch {
      try {
        return await pdfDoc.embedJpg(logoImageBytes);
      } catch {
        console.warn('Logo image format not supported. Please use PNG or JPG.');
        return null;
      }
    }
  } catch (error) {
    console.warn('Could not load logo image:', error);
    return null;
  }
};

export async function generateReportCardPDF(reports: ReportCardData | ReportCardData[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const pageSize: [number, number] = [595.28, 841.89]; // A4 portrait
  
  // Embed logo
  const logoImage = await embedSchoolLogo(pdfDoc);
  
  // Embed fonts
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.95, 0.95, 0.95);
  const darkBlue = rgb(0, 0.3, 0.6);
  const borderColor = rgb(0.8, 0.8, 0.8);

  const leftMargin = 40;
  const rightMargin = 40;
  const width = pageSize[0];
  const height = pageSize[1];
  const tableWidth = width - leftMargin - rightMargin;

  // Helper function to calculate centered X position
  const centerText = (text: string, fontSize: number) => {
    const textWidth = boldFont.widthOfTextAtSize(text, fontSize);
    return (width - textWidth) / 2;
  };

  // Convert single report to array for uniform processing
  const reportArray = Array.isArray(reports) ? reports : [reports];

  // Helper function to draw a single report card on a page
  const drawReportCard = (page: any, report: ReportCardData, pageNumber: number, totalPages: number) => {
    let y = height - 40;

    // ==================== HEADER WITH LOGO ====================
    if (logoImage) {
      // Scale logo appropriately
      const logoDims = logoImage.scale(0.1);
      const logoX = (width - logoDims.width) / 2;
      
      // Draw logo centered at top
      page.drawImage(logoImage, {
        x: logoX,
        y: y - logoDims.height,
        width: logoDims.width,
        height: logoDims.height,
      });
      
      y -= logoDims.height + 10;
      
      // School name
      page.drawText('KALABO BOARDING SECONDARY SCHOOL', {
        x: centerText('KALABO BOARDING SECONDARY SCHOOL', 16),
        y,
        size: 16,
        font: boldFont,
        color: darkBlue,
      });
      y -= 20;
      
      // Ministry of Education
      page.drawText('MINISTRY OF EDUCATION', {
        x: centerText('MINISTRY OF EDUCATION', 12),
        y,
        size: 12,
        font: boldFont,
        color: gray,
      });
      y -= 25;
    } else {
      // Fallback without logo
      page.drawText('MINISTRY OF EDUCATION', {
        x: centerText('MINISTRY OF EDUCATION', 14),
        y,
        size: 14,
        font: boldFont,
        color: gray,
      });
      y -= 20;
      
      page.drawText('KALABO BOARDING SECONDARY SCHOOL', {
        x: centerText('KALABO BOARDING SECONDARY SCHOOL', 16),
        y,
        size: 16,
        font: boldFont,
        color: darkBlue,
      });
      y -= 25;
    }

    // Title
    page.drawText('STUDENT REPORT CARD', {
      x: centerText('STUDENT REPORT CARD', 14),
      y,
      size: 14,
      font: boldFont,
      color: black,
    });
    y -= 5;

    // Exam config summary if available
    if (report.examConfigSummary) {
      y -= 15;
      page.drawText(report.examConfigSummary, {
        x: centerText(report.examConfigSummary, 9),
        y,
        size: 9,
        font,
        color: darkBlue,
      });
      y -= 10;
    }

    y -= 15;

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
    // Determine which columns to show based on configured exams
    const showWeek4 = report.subjects.some(s => s.week4 !== undefined);
    const showWeek8 = report.subjects.some(s => s.week8 !== undefined);
    const showEndOfTerm = report.subjects.some(s => s.endOfTerm !== undefined);

    // Build headers and column widths dynamically
    const headers = ['Subject'];
    const colWidths = [140];
    
    if (showWeek4) {
      headers.push('W4');
      colWidths.push(40);
    }
    if (showWeek8) {
      headers.push('W8');
      colWidths.push(40);
    }
    if (showEndOfTerm) {
      headers.push('EOT');
      colWidths.push(45);
    }
    headers.push('Grade', 'Description');
    colWidths.push(45, tableWidth - colWidths.reduce((a, b) => a + b, 0));

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
      if (header === 'W4' || header === 'W8' || header === 'EOT') {
        textX = tableX + (colWidths[i] / 2) - 8;
      } else if (header === 'Grade') {
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

      // Week 4 (if configured)
      if (showWeek4) {
        const w4 = subject.week4 >= 0 ? `${subject.week4}` : 
                   subject.week4 === -1 ? 'ABS' : 
                   subject.week4 === -2 ? 'NC' : '-';
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
      }

      // Week 8 (if configured)
      if (showWeek8) {
        const w8 = subject.week8 >= 0 ? `${subject.week8}` : 
                   subject.week8 === -1 ? 'ABS' : 
                   subject.week8 === -2 ? 'NC' : '-';
        page.drawRectangle({
          x: tableX,
          y: rowY,
          width: colWidths[showWeek4 ? 2 : 1],
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
        tableX += colWidths[showWeek4 ? 2 : 1];
      }

      // End of Term (if configured)
      if (showEndOfTerm) {
        const eot = subject.endOfTerm >= 0 ? `${subject.endOfTerm}` : 
                    subject.endOfTerm === -1 ? 'ABS' : 
                    subject.endOfTerm === -2 ? 'NC' : '-';
        page.drawRectangle({
          x: tableX,
          y: rowY,
          width: colWidths[colWidths.length - 3],
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
        tableX += colWidths[colWidths.length - 3];
      }

      // Grade
      const grade = subject.grade > 0 ? subject.grade.toString() : 
                    subject.grade === -1 ? 'X' : '-';
      page.drawRectangle({
        x: tableX,
        y: rowY,
        width: colWidths[colWidths.length - 2],
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
      tableX += colWidths[colWidths.length - 2];

      // Description
      page.drawRectangle({
        x: tableX,
        y: rowY,
        width: colWidths[colWidths.length - 1],
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
    
    // Calculate total columns span
    const totalSpanColumns = colWidths.length - 2;
    const totalWidth = colWidths.slice(0, totalSpanColumns).reduce((a, b) => a + b, 0);
    
    page.drawRectangle({
      x: tableX,
      y: totalY,
      width: totalWidth,
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
    tableX += totalWidth;

    page.drawRectangle({
      x: tableX,
      y: totalY,
      width: colWidths[colWidths.length - 2] + colWidths[colWidths.length - 1],
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
    page.drawText('Legend: - = Not entered | ABS = Absent | NC = Not Conducted | X = Incomplete', {
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

    // Page number
    page.drawText(`Page ${pageNumber} of ${totalPages}`, {
      x: width - 100,
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
  };

  // Create pages for each report
  for (let i = 0; i < reportArray.length; i++) {
    const page = pdfDoc.addPage(pageSize);
    drawReportCard(page, reportArray[i], i + 1, reportArray.length);
  }

  return pdfDoc.save();
}