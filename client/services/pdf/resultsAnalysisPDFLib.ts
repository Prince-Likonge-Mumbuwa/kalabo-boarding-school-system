// @/services/pdf/resultsAnalysisPDFLib.ts
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

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
  // Create PDF document
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([841.89, 595.28]); // A4 landscape
  const { width, height } = page.getSize();

  // Embed fonts
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Colors
  const black = rgb(0, 0, 0);
  const gray = rgb(0.3, 0.3, 0.3);
  const lightGray = rgb(0.95, 0.95, 0.95);
  const borderColor = rgb(0.8, 0.8, 0.8);

  let y = height - 40;

  // ==================== HEADER ====================
  // Ministry of Education
  page.drawText('MINISTRY OF EDUCATION', {
    x: width / 2 - 100,
    y,
    size: 16,
    font: boldFont,
    color: black,
  });
  y -= 25;

  // School Name
  page.drawText(data.schoolName, {
    x: width / 2 - 90,
    y,
    size: 14,
    font: boldFont,
    color: black,
  });
  y -= 20;

  // Address
  page.drawText(data.address, {
    x: width / 2 - 60,
    y,
    size: 12,
    font,
    color: gray,
  });
  y -= 30;

  // Class/Subject Line
  const title = 'subject' in data 
    ? `${data.className} - ${data.subject} Results Analysis`
    : `${data.className} Results Analysis`;
  
  page.drawText(title, {
    x: width / 2 - 80,
    y,
    size: 14,
    font: boldFont,
    color: black,
  });
  y -= 20;

  // Term and Year
  page.drawText(`${data.term} ${data.year}`, {
    x: width / 2 - 30,
    y,
    size: 12,
    font,
    color: gray,
  });
  y -= 30;

  // ==================== TABLE CONFIGURATION ====================
  const startX = 50;
  const colWidths = [
    60,  // Category
    50,  // Registered
    40,  // Sat
    45,  // Absent
    50,  // DIST(1-2)
    50,  // MERIT(3-4)
    50,  // CREDIT(5-6)
    45,  // PASS(7-8)
    40,  // FAIL(9)
    45,  // QLTY(1-4)
    45,  // QTY(1-8)
  ];

  const headers = [
    'Category', 'Reg', 'Sat', 'Abs',
    'DIST(1-2)', 'MERIT(3-4)', 'CREDIT(5-6)',
    'PASS(7-8)', 'FAIL(9)', 'QLTY(1-4)', 'QTY(1-8)'
  ];

  // Helper function to draw a table for given metrics
  const drawTable = (
    page: any,
    startY: number,
    boysMetrics: SubjectMetrics,
    girlsMetrics: SubjectMetrics,
    subjectName?: string
  ): number => {
    let currentY = startY;

    // Draw subject name if provided
    if (subjectName) {
      page.drawText(subjectName, {
        x: startX,
        y: currentY,
        size: 12,
        font: boldFont,
        color: black,
      });
      currentY -= 20;
    }

    // Draw table headers
    let x = startX;
    headers.forEach((header, i) => {
      page.drawRectangle({
        x,
        y: currentY - 15,
        width: colWidths[i],
        height: 25,
        color: lightGray,
        borderColor,
        borderWidth: 1,
      });

      page.drawText(header, {
        x: x + 5,
        y: currentY - 5,
        size: 8,
        font: boldFont,
        color: black,
      });

      x += colWidths[i];
    });

    currentY -= 40;

    // Row data
    const rowData = [
      { label: 'BOYS', ...boysMetrics },
      { label: 'GIRLS', ...girlsMetrics },
      { 
        label: 'TOTAL',
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
      }
    ];

    // Draw rows
    rowData.forEach((row) => {
      x = startX;
      
      // Category column
      page.drawRectangle({
        x,
        y: currentY - 15,
        width: colWidths[0],
        height: 25,
        borderColor,
        borderWidth: 1,
      });
      page.drawText(row.label, {
        x: x + 5,
        y: currentY - 5,
        size: 10,
        font: row.label === 'TOTAL' ? boldFont : font,
        color: black,
      });
      x += colWidths[0];

      // Data columns
      const columns = [
        row.registered,
        row.sat,
        row.absent,
        row.dist,
        row.merit,
        row.credit,
        row.pass,
        row.fail,
        row.quality,
        row.quantity,
      ];

      columns.forEach((value, i) => {
        page.drawRectangle({
          x,
          y: currentY - 15,
          width: colWidths[i + 1],
          height: 25,
          borderColor,
          borderWidth: 1,
        });
        
        page.drawText(value.toString(), {
          x: x + (colWidths[i + 1] / 2) - 5,
          y: currentY - 5,
          size: 10,
          font: row.label === 'TOTAL' ? boldFont : font,
          color: black,
        });
        
        x += colWidths[i + 1];
      });

      currentY -= 25;
    });

    return currentY - 20; // Return Y position after table + spacing
  };

  // Draw appropriate tables based on data type
  if ('subject' in data) {
    // Teacher view - single table
    y = drawTable(page, y, data.boys, data.girls);
  } else {
    // Admin view - multiple tables (one per subject)
    for (const subject of data.subjects) {
      // Check if we need a new page
      if (y < 150) {
        page = pdfDoc.addPage([841.89, 595.28]);
        y = height - 40;
        
        // Redraw header on new page
        page.drawText('MINISTRY OF EDUCATION', {
          x: width / 2 - 100,
          y,
          size: 16,
          font: boldFont,
          color: black,
        });
        y -= 25;
        
        page.drawText(data.schoolName, {
          x: width / 2 - 90,
          y,
          size: 14,
          font: boldFont,
          color: black,
        });
        y -= 20;
        
        page.drawText(data.address, {
          x: width / 2 - 60,
          y,
          size: 12,
          font,
          color: gray,
        });
        y -= 30;
        
        page.drawText(`${data.className} Results Analysis (continued)`, {
          x: width / 2 - 100,
          y,
          size: 14,
          font: boldFont,
          color: black,
        });
        y -= 20;
        
        page.drawText(`${data.term} ${data.year}`, {
          x: width / 2 - 30,
          y,
          size: 12,
          font,
          color: gray,
        });
        y -= 30;
      }

      y = drawTable(page, y, subject.boys, subject.girls, subject.name);
    }
  }

  // ==================== FOOTER ====================
  if (y < 100) {
    page = pdfDoc.addPage([841.89, 595.28]);
    y = height - 40;
  }

  y -= 20;
  page.drawText(`Generated: ${data.generatedDate}`, {
    x: width - 200,
    y,
    size: 8,
    font,
    color: gray,
  });

  // Legend at bottom
  y -= 15;
  page.drawText('DIST = Distinction (1-2) | MERIT = Merit (3-4) | CREDIT = Credit (5-6) | PASS = Satisfactory (7-8) | FAIL = Grade 9', {
    x: 50,
    y,
    size: 7,
    font,
    color: gray,
  });
  
  y -= 12;
  page.drawText('QLTY = Quality Pass (Grades 1-4) | QTY = Quantity Pass (Grades 1-8)', {
    x: 50,
    y,
    size: 7,
    font,
    color: gray,
  });

  return pdfDoc.save();
}