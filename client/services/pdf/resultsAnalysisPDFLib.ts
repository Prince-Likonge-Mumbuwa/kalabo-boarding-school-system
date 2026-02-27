// @/services/pdf/resultsAnalysisPDFLib.ts
import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib';

interface SubjectMetrics {
  registered: number;
  sat: number;
  absent: number;
  dist: number; // grades 1-2
  merit: number; // grades 3-4
  credit: number; // grades 5-6
  pass: number; // grades 7-8
  fail: number; // grade 9
  quality: number; // grades 1-4
  quantity: number; // grades 1-8
}

interface SubjectData {
  name: string;
  boys: SubjectMetrics;
  girls: SubjectMetrics;
}

// For teacher view (single subject)
interface TeacherResultsData {
  schoolName: string;
  address: string;
  className: string;
  subject: string;
  term: string;
  year: number;
  boys: SubjectMetrics;
  girls: SubjectMetrics;
  generatedDate: string;
}

// For admin view (multiple subjects)
interface AdminResultsData {
  schoolName: string;
  address: string;
  className: string;
  term: string;
  year: number;
  subjects: SubjectData[];
  generatedDate: string;
}

export type ResultsAnalysisData = TeacherResultsData | AdminResultsData;

export async function generateResultsAnalysisPDF(data: ResultsAnalysisData): Promise<Uint8Array> {
  // Create PDF document with A4 landscape
  const pdfDoc = await PDFDocument.create();
  const pageSize = PageSizes.A4;
  const width = pageSize[0];
  const height = pageSize[1];
  
  let page = pdfDoc.addPage(pageSize);

  // Embed fonts
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Colors
  const black = rgb(0, 0, 0);
  const darkGray = rgb(0.2, 0.2, 0.2);
  const gray = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.95, 0.95, 0.95);
  const borderColor = rgb(0.7, 0.7, 0.7);
  const headerBgColor = rgb(0.85, 0.85, 0.85);

  // Table configuration
  const margin = 40;
  const availableWidth = width - (2 * margin);
  
  // Calculate column widths (proportional)
  const colWidths = [
    availableWidth * 0.10, // Category
    availableWidth * 0.06, // Reg
    availableWidth * 0.06, // Sat
    availableWidth * 0.06, // Abs
    availableWidth * 0.08, // DIST(1-2)
    availableWidth * 0.08, // MERIT(3-4)
    availableWidth * 0.08, // CREDIT(5-6)
    availableWidth * 0.08, // PASS(7-8)
    availableWidth * 0.08, // FAIL(9)
    availableWidth * 0.06, // FAIL%
    availableWidth * 0.08, // QLTY(1-4)
    availableWidth * 0.08, // QTY(1-8)
  ];

  const headers = [
    'Category', 'Reg', 'Sat', 'Abs',
    'DIST', 'MERIT', 'CREDIT',
    'PASS', 'FAIL', 'FAIL%',
    'QLTY', 'QTY'
  ];

  const subHeaders = [
    '', '', '', '',
    '(1-2)', '(3-4)', '(5-6)',
    '(7-8)', '(9)', '',
    '(1-4)', '(1-8)'
  ];

  let y = height - margin;

  // Helper function to draw header section
  const drawHeader = (page: any, yPos: number, isContinued: boolean = false): number => {
    let currentY = yPos;

    // Ministry of Education
    const ministryText = 'MINISTRY OF EDUCATION';
    const ministryWidth = boldFont.widthOfTextAtSize(ministryText, 16);
    page.drawText(ministryText, {
      x: (width - ministryWidth) / 2,
      y: currentY,
      size: 16,
      font: boldFont,
      color: darkGray,
    });
    currentY -= 25;

    // School Name
    const schoolText = data.schoolName;
    const schoolWidth = boldFont.widthOfTextAtSize(schoolText, 14);
    page.drawText(schoolText, {
      x: (width - schoolWidth) / 2,
      y: currentY,
      size: 14,
      font: boldFont,
      color: darkGray,
    });
    currentY -= 20;

    // Address
    const addressText = data.address;
    const addressWidth = font.widthOfTextAtSize(addressText, 12);
    page.drawText(addressText, {
      x: (width - addressWidth) / 2,
      y: currentY,
      size: 12,
      font,
      color: gray,
    });
    currentY -= 30;

    // Title
    const title = isContinued ? `${data.className} Results Analysis (Continued)` :
                  ('subject' in data 
                    ? `${data.className} - ${data.subject} Results Analysis`
                    : `${data.className} Results Analysis`);
    
    const titleWidth = boldFont.widthOfTextAtSize(title, 14);
    page.drawText(title, {
      x: (width - titleWidth) / 2,
      y: currentY,
      size: 14,
      font: boldFont,
      color: darkGray,
    });
    currentY -= 20;

    // Term and Year
    const termText = `${data.term} ${data.year}`;
    const termWidth = font.widthOfTextAtSize(termText, 12);
    page.drawText(termText, {
      x: (width - termWidth) / 2,
      y: currentY,
      size: 12,
      font,
      color: gray,
    });
    
    return currentY - 30;
  };

  // Draw initial header
  y = drawHeader(page, y, false);

  // Helper function to draw table headers
  const drawTableHeaders = (page: any, startX: number, startY: number): number => {
    let currentY = startY;
    let x = startX;

    // Draw main headers
    headers.forEach((header, i) => {
      page.drawRectangle({
        x,
        y: currentY - 20,
        width: colWidths[i],
        height: 20,
        color: headerBgColor,
        borderColor,
        borderWidth: 1,
      });

      page.drawText(header, {
        x: x + (colWidths[i] / 2) - (font.widthOfTextAtSize(header, 8) / 2),
        y: currentY - 12,
        size: 8,
        font: boldFont,
        color: black,
      });

      x += colWidths[i];
    });

    currentY -= 20;
    x = startX;

    // Draw sub-headers
    subHeaders.forEach((subHeader, i) => {
      page.drawRectangle({
        x,
        y: currentY - 20,
        width: colWidths[i],
        height: 20,
        color: lightGray,
        borderColor,
        borderWidth: 1,
      });

      if (subHeader) {
        page.drawText(subHeader, {
          x: x + (colWidths[i] / 2) - (font.widthOfTextAtSize(subHeader, 7) / 2),
          y: currentY - 12,
          size: 7,
          font,
          color: gray,
        });
      }

      x += colWidths[i];
    });

    return currentY - 25;
  };

  // Helper function to calculate fail percentage
  const calculateFailPercentage = (sat: number, fail: number): string => {
    if (sat === 0) return '0.0';
    return ((fail / sat) * 100).toFixed(1);
  };

  // Helper function to draw a data row
  const drawDataRow = (
    page: any, 
    startX: number, 
    startY: number, 
    label: string,
    metrics: SubjectMetrics,
    isTotal: boolean = false
  ): number => {
    let x = startX;
    const rowY = startY - 20;

    // Calculate fail percentage
    const failPercentage = calculateFailPercentage(metrics.sat, metrics.fail);

    const rowData = [
      metrics.registered,
      metrics.sat,
      metrics.absent,
      metrics.dist,
      metrics.merit,
      metrics.credit,
      metrics.pass,
      metrics.fail,
      failPercentage,
      metrics.quality,
      metrics.quantity,
    ];

    // Category column
    page.drawRectangle({
      x,
      y: rowY,
      width: colWidths[0],
      height: 20,
      borderColor,
      borderWidth: 1,
    });
    
    page.drawText(label, {
      x: x + 5,
      y: rowY + 5,
      size: 9,
      font: isTotal ? boldFont : font,
      color: black,
    });
    x += colWidths[0];

    // Data columns
    rowData.forEach((value, i) => {
      page.drawRectangle({
        x,
        y: rowY,
        width: colWidths[i + 1],
        height: 20,
        borderColor,
        borderWidth: 1,
      });
      
      const text = typeof value === 'number' ? value.toString() : value;
      const textWidth = font.widthOfTextAtSize(text, 9);
      
      page.drawText(text, {
        x: x + (colWidths[i + 1] / 2) - (textWidth / 2),
        y: rowY + 5,
        size: 9,
        font: isTotal ? boldFont : font,
        color: black,
      });
      
      x += colWidths[i + 1];
    });

    return startY - 20;
  };

  // Helper function to draw a complete subject table
  const drawSubjectTable = (
    page: any,
    startY: number,
    boysMetrics: SubjectMetrics,
    girlsMetrics: SubjectMetrics,
    subjectName?: string
  ): number => {
    let currentY = startY;
    const startX = margin;

    // Draw subject name if provided
    if (subjectName) {
      page.drawText(subjectName, {
        x: startX,
        y: currentY,
        size: 12,
        font: boldFont,
        color: darkGray,
      });
      currentY -= 25;
    }

    // Draw table headers
    currentY = drawTableHeaders(page, startX, currentY);

    // Calculate totals
    const totals: SubjectMetrics = {
      registered: boysMetrics.registered + girlsMetrics.registered,
      sat: boysMetrics.sat + girlsMetrics.sat,
      absent: boysMetrics.absent + girlsMetrics.absent,
      dist: boysMetrics.dist + girlsMetrics.dist,
      merit: boysMetrics.merit + girlsMetrics.merit,
      credit: boysMetrics.credit + girlsMetrics.credit,
      pass: boysMetrics.pass + girlsMetrics.pass,
      fail: boysMetrics.fail + girlsMetrics.fail,
      quality: boysMetrics.quality + girlsMetrics.quality,
      quantity: boysMetrics.quantity + girlsMetrics.quantity,
    };

    // Draw data rows
    currentY = drawDataRow(page, startX, currentY, 'BOYS', boysMetrics);
    currentY = drawDataRow(page, startX, currentY, 'GIRLS', girlsMetrics);
    currentY = drawDataRow(page, startX, currentY - 5, 'TOTAL', totals, true);

    return currentY - 25; // Return Y position after table + spacing
  };

  // Draw tables based on data type
  if ('subject' in data) {
    // Teacher view - single table
    y = drawSubjectTable(page, y, data.boys, data.girls);
  } else {
    // Admin view - multiple tables (one per subject)
    for (let i = 0; i < data.subjects.length; i++) {
      const subject = data.subjects[i];
      
      // Check if we need a new page
      if (y < 200) {
        page = pdfDoc.addPage(pageSize);
        y = height - margin;
        y = drawHeader(page, y, true);
      }

      y = drawSubjectTable(page, y, subject.boys, subject.girls, subject.name);
      
      // Add spacing between subjects except for the last one
      if (i < data.subjects.length - 1) {
        y -= 15;
      }
    }
  }

  // ==================== FOOTER ====================
  if (y < 100) {
    page = pdfDoc.addPage(pageSize);
    y = height - margin;
    y = drawHeader(page, y, true);
  }

  y -= 20;

  // Generation date (right-aligned)
  const dateText = `Generated: ${data.generatedDate}`;
  const dateWidth = font.widthOfTextAtSize(dateText, 8);
  page.drawText(dateText, {
    x: width - margin - dateWidth,
    y,
    size: 8,
    font,
    color: gray,
  });

  // Legend at bottom (centered)
  y -= 15;
  const legend1 = 'DIST = Distinction (1-2) | MERIT = Merit (3-4) | CREDIT = Credit (5-6) | PASS = Satisfactory (7-8) | FAIL = Grade 9';
  const legend1Width = font.widthOfTextAtSize(legend1, 7);
  page.drawText(legend1, {
    x: (width - legend1Width) / 2,
    y,
    size: 7,
    font,
    color: gray,
  });
  
  y -= 12;
  const legend2 = 'QLTY = Quality Pass (Grades 1-4) | QTY = Quantity Pass (Grades 1-8) | FAIL% = (Fail/Sat) × 100';
  const legend2Width = font.widthOfTextAtSize(legend2, 7);
  page.drawText(legend2, {
    x: (width - legend2Width) / 2,
    y,
    size: 7,
    font,
    color: gray,
  });

  // Draw footer line
  page.drawLine({
    start: { x: margin, y: y - 5 },
    end: { x: width - margin, y: y - 5 },
    thickness: 0.5,
    color: borderColor,
  });

  return pdfDoc.save();
}