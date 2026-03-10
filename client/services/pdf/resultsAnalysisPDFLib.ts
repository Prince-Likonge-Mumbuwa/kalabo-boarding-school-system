// @/services/pdf/resultsAnalysisPDFLib.ts
// UPDATED WITH CENTERED LOGO AND HEADER
// Quality: Grades 1-2 only (Distinction)
// Quantity: Grades 3-7 (Merit through Satisfactory)
// Fail: Grades 8-9 (Satisfactory Low and Unsatisfactory)

import { PDFDocument, rgb, StandardFonts, PageSizes, PDFImage } from 'pdf-lib';

interface SubjectMetrics {
  registered: number;
  sat: number;
  absent: number;
  dist: number;      // grades 1-2
  merit: number;     // grades 3-4
  credit: number;    // grades 5-6
  pass: number;      // grade 7 only
  fail: number;      // grades 8-9
  quality: number;   // grades 1-2
  quantity: number;  // grades 3-7
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
  examConfigSummary?: string;
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
  examConfigSummary?: string;
}

export type ResultsAnalysisData = TeacherResultsData | AdminResultsData;

/**
 * Helper function to embed school logo
 */
const embedSchoolLogo = async (pdfDoc: PDFDocument): Promise<PDFImage | null> => {
  try {
    // Try to load logo from public/images/school-logo.png
    const logoUrl = '/images/school-logo.png';
    const response = await fetch(logoUrl);
    
    if (!response.ok) {
      console.warn('Logo image not found at /images/school-logo.png');
      return null;
    }
    
    const logoImageBytes = await response.arrayBuffer();
    
    // Try to embed as PNG first, then as JPG
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

export async function generateResultsAnalysisPDF(data: ResultsAnalysisData): Promise<Uint8Array> {
  // Create PDF document with A4 landscape
  const pdfDoc = await PDFDocument.create();
  const pageSize = PageSizes.A4;
  const width = pageSize[0];
  const height = pageSize[1];
  
  // Embed logo
  const logoImage = await embedSchoolLogo(pdfDoc);
  
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
  const qualityColor = rgb(0.2, 0.6, 0.2); // Green for quality
  const quantityColor = rgb(0.2, 0.4, 0.8); // Blue for quantity
  const failColor = rgb(0.8, 0.3, 0.3); // Red for fail

  // Table configuration
  const margin = 40;
  const availableWidth = width - (2 * margin);
  
  // Calculate column widths (proportional)
  const colWidths = [
    availableWidth * 0.10, // Category
    availableWidth * 0.06, // Reg
    availableWidth * 0.06, // Sat
    availableWidth * 0.06, // Abs
    availableWidth * 0.07, // DIST(1-2)
    availableWidth * 0.07, // MERIT(3-4)
    availableWidth * 0.07, // CREDIT(5-6)
    availableWidth * 0.07, // PASS(7)
    availableWidth * 0.07, // FAIL(8-9)
    availableWidth * 0.07, // FAIL%
    availableWidth * 0.07, // QLTY(1-2)
    availableWidth * 0.07, // QTY(3-7)
    availableWidth * 0.06, // QLTY%
    availableWidth * 0.06, // QTY%
  ];

  const headers = [
    'Category', 'Reg', 'Sat', 'Abs',
    'DIST', 'MERIT', 'CREDIT',
    'PASS', 'FAIL', 'FAIL%',
    'QLTY', 'QTY', 'QLTY%', 'QTY%'
  ];

  const subHeaders = [
    '', '', '', '',
    '(1-2)', '(3-4)', '(5-6)',
    '(7)', '(8-9)', '',
    '(1-2)', '(3-7)', '%', '%'
  ];

  let y = height - margin;

  // Helper function to calculate centered X position
  const centerText = (text: string, fontSize: number) => {
    const textWidth = boldFont.widthOfTextAtSize(text, fontSize);
    return (width - textWidth) / 2;
  };

  // Helper function to draw header section with centered logo
  const drawHeader = async (page: any, yPos: number, isContinued: boolean = false): Promise<number> => {
    let currentY = yPos;

    if (logoImage) {
      // Scale logo appropriately
      const logoDims = logoImage.scale(0.12);
      const logoX = (width - logoDims.width) / 2;
      
      // Draw logo centered at top
      page.drawImage(logoImage, {
        x: logoX,
        y: currentY - logoDims.height,
        width: logoDims.width,
        height: logoDims.height,
      });
      
      currentY -= logoDims.height + 15;
      
      // School Name
      const schoolText = data.schoolName;
      page.drawText(schoolText, {
        x: centerText(schoolText, 16),
        y: currentY,
        size: 16,
        font: boldFont,
        color: darkGray,
      });
      currentY -= 20;
      
      // Ministry of Education
      const ministryText = 'MINISTRY OF EDUCATION';
      page.drawText(ministryText, {
        x: centerText(ministryText, 14),
        y: currentY,
        size: 14,
        font: boldFont,
        color: gray,
      });
      currentY -= 25;
    } else {
      // Fallback without logo
      const ministryText = 'MINISTRY OF EDUCATION';
      page.drawText(ministryText, {
        x: centerText(ministryText, 16),
        y: currentY,
        size: 16,
        font: boldFont,
        color: darkGray,
      });
      currentY -= 25;

      // School Name
      const schoolText = data.schoolName;
      page.drawText(schoolText, {
        x: centerText(schoolText, 14),
        y: currentY,
        size: 14,
        font: boldFont,
        color: darkGray,
      });
      currentY -= 20;
    }

    // Address
    const addressText = data.address;
    page.drawText(addressText, {
      x: centerText(addressText, 12),
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
    
    page.drawText(title, {
      x: centerText(title, 14),
      y: currentY,
      size: 14,
      font: boldFont,
      color: darkGray,
    });
    currentY -= 20;

    // Term and Year
    const termText = `${data.term} ${data.year}`;
    page.drawText(termText, {
      x: centerText(termText, 12),
      y: currentY,
      size: 12,
      font,
      color: gray,
    });
    
    // Exam config summary if available
    if (data.examConfigSummary) {
      currentY -= 20;
      page.drawText(data.examConfigSummary, {
        x: centerText(data.examConfigSummary, 10),
        y: currentY,
        size: 10,
        font,
        color: rgb(0.3, 0.3, 0.8),
      });
      currentY -= 5;
    }
    
    return currentY - 25;
  };

  // Draw initial header
  y = await drawHeader(page, y, false);

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

      // Special coloring for quality/quantity/fail headers
      let textColor = black;
      if (header === 'QLTY' || header === 'QLTY%') textColor = qualityColor;
      if (header === 'QTY' || header === 'QTY%') textColor = quantityColor;
      if (header === 'FAIL' || header === 'FAIL%') textColor = failColor;

      page.drawText(header, {
        x: x + (colWidths[i] / 2) - (font.widthOfTextAtSize(header, 8) / 2),
        y: currentY - 12,
        size: 8,
        font: boldFont,
        color: textColor,
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

  // Helper function to calculate percentages
  const calculateFailPercentage = (sat: number, fail: number): string => {
    if (sat === 0) return '0.0';
    return ((fail / sat) * 100).toFixed(1);
  };

  const calculateQualityPercentage = (sat: number, quality: number): string => {
    if (sat === 0) return '0.0';
    return ((quality / sat) * 100).toFixed(1);
  };

  const calculateQuantityPercentage = (sat: number, quantity: number): string => {
    if (sat === 0) return '0.0';
    return ((quantity / sat) * 100).toFixed(1);
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

    // Calculate percentages
    const failPercentage = calculateFailPercentage(metrics.sat, metrics.fail);
    const qualityPercentage = calculateQualityPercentage(metrics.sat, metrics.quality);
    const quantityPercentage = calculateQuantityPercentage(metrics.sat, metrics.quantity);

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
      qualityPercentage,
      quantityPercentage,
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
      const colIndex = i + 1;
      
      page.drawRectangle({
        x,
        y: rowY,
        width: colWidths[colIndex],
        height: 20,
        borderColor,
        borderWidth: 1,
      });
      
      // Special coloring for percentage columns
      let textColor = black;
      if (i === 8) textColor = failColor; // FAIL%
      if (i === 11) textColor = qualityColor; // QLTY%
      if (i === 12) textColor = quantityColor; // QTY%
      
      const text = typeof value === 'number' ? value.toString() : value;
      const textWidth = font.widthOfTextAtSize(text, 9);
      
      page.drawText(text, {
        x: x + (colWidths[colIndex] / 2) - (textWidth / 2),
        y: rowY + 5,
        size: 9,
        font: isTotal ? boldFont : font,
        color: textColor,
      });
      
      x += colWidths[colIndex];
    });

    return startY - 20;
  };

  // Helper function to draw a complete subject table
  const drawSubjectTable = async (
    page: any,
    startY: number,
    boysMetrics: SubjectMetrics,
    girlsMetrics: SubjectMetrics,
    subjectName?: string
  ): Promise<number> => {
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
    y = await drawSubjectTable(page, y, data.boys, data.girls);
  } else {
    // Admin view - multiple tables (one per subject)
    for (let i = 0; i < data.subjects.length; i++) {
      const subject = data.subjects[i];
      
      // Check if we need a new page
      if (y < 250) {
        page = pdfDoc.addPage(pageSize);
        y = height - margin;
        y = await drawHeader(page, y, true);
      }

      y = await drawSubjectTable(page, y, subject.boys, subject.girls, subject.name);
      
      // Add spacing between subjects except for the last one
      if (i < data.subjects.length - 1) {
        y -= 15;
      }
    }
  }

  // ==================== FOOTER ====================
  if (y < 150) {
    page = pdfDoc.addPage(pageSize);
    y = height - margin;
    y = await drawHeader(page, y, true);
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
  const legend1 = 'DIST = Distinction (1-2) | MERIT = Merit (3-4) | CREDIT = Credit (5-6) | PASS = Satisfactory (7) | FAIL = Grades 8-9';
  const legend1Width = font.widthOfTextAtSize(legend1, 7);
  page.drawText(legend1, {
    x: (width - legend1Width) / 2,
    y,
    size: 7,
    font,
    color: gray,
  });
  
  y -= 12;
  const legend2 = 'QLTY = Quality Pass (Grades 1-2) | QTY = Quantity Pass (Grades 3-7) | FAIL% = (Fail/Sat) × 100 | QLTY% = (Quality/Sat) × 100 | QTY% = (Quantity/Sat) × 100';
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