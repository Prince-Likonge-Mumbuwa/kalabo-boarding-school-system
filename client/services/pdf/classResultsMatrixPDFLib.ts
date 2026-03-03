// @/services/pdf/classResultsMatrixPDFLib.ts
// Generates a comprehensive class results matrix showing all students and their marks
// Week 4, Week 8, End of Term marks per subject with color-coded grades

import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib';

interface StudentSubjectData {
  subjectName: string;
  week4: { marks: number; status: string };
  week8: { marks: number; status: string };
  endOfTerm: { marks: number; status: string; grade: number };
  average: number;
}

interface StudentMatrixData {
  studentId: string;
  studentName: string;
  gender: string;
  subjects: StudentSubjectData[];
  overallAverage: number;
  overallGrade: number;
}

export interface ClassResultsMatrix {
  className: string;
  term: string;
  year: number;
  students: StudentMatrixData[];
  subjects: string[];
  generatedDate: string;
}

// Grade color mapping
const getGradeColor = (grade: number): { r: number; g: number; b: number } => {
  if (grade <= 2) return { r: 0.2, g: 0.6, b: 0.2 }; // Green for Distinction
  if (grade <= 4) return { r: 0.2, g: 0.4, b: 0.8 }; // Blue for Merit
  if (grade <= 6) return { r: 0.8, g: 0.6, b: 0.2 }; // Amber for Credit
  if (grade <= 7) return { r: 0.9, g: 0.5, b: 0.2 }; // Orange for Satisfactory
  return { r: 0.8, g: 0.3, b: 0.3 }; // Red for Fail
};

// Status display mapping
const getStatusDisplay = (marks: number, status: string): string => {
  if (marks >= 0) return marks.toString();
  if (marks === -1) return 'ABS';
  if (marks === -2) return 'NC';
  return '—';
};

// Get status color
const getStatusColor = (marks: number): { r: number; g: number; b: number } => {
  if (marks >= 0) return { r: 0, g: 0, b: 0 }; // Black for normal marks
  if (marks === -1) return { r: 0.5, g: 0.5, b: 0.5 }; // Gray for Absent
  if (marks === -2) return { r: 0.6, g: 0.6, b: 0.6 }; // Light Gray for Not Conducted
  return { r: 0.7, g: 0.7, b: 0.7 }; // Light Gray for missing
};

export async function generateClassResultsMatrixPDF(data: ClassResultsMatrix): Promise<Uint8Array> {
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
  const subjectHeaderColor = rgb(0.9, 0.9, 1.0); // Light blue for subject headers
  const totalRowColor = rgb(0.97, 0.97, 0.97); // Very light gray for totals

  // Table configuration
  const margin = 30;
  const availableWidth = width - (2 * margin);
  
  // Calculate column widths
  // Student Info columns
  const studentIdWidth = availableWidth * 0.08; // 8%
  const studentNameWidth = availableWidth * 0.12; // 12%
  const genderWidth = availableWidth * 0.04; // 4%
  
  // For each subject: W4, W8, EOT, Grade, Avg (5 columns per subject)
  const subjectColWidth = availableWidth * 0.05; // 5% per column
  const subjectBlockWidth = subjectColWidth * 5; // 25% per subject
  
  // Overall columns
  const overallAvgWidth = availableWidth * 0.05; // 5%
  const overallGradeWidth = availableWidth * 0.04; // 4%
  
  // Calculate how many subjects we can fit per page
  const maxSubjectsPerPage = Math.floor((availableWidth - studentIdWidth - studentNameWidth - genderWidth - overallAvgWidth - overallGradeWidth) / subjectBlockWidth);
  
  let y = height - margin;
  let currentPage = 1;
  let subjectStartIndex = 0;
  let allSubjectsProcessed = false;

  while (!allSubjectsProcessed) {
    // Get subjects for this page
    const pageSubjects = data.subjects.slice(subjectStartIndex, subjectStartIndex + maxSubjectsPerPage);
    const isFirstPage = subjectStartIndex === 0;
    
    if (pageSubjects.length === 0) {
      allSubjectsProcessed = true;
      continue;
    }

    // Reset Y position for new page if not first page
    if (!isFirstPage) {
      page = pdfDoc.addPage(pageSize);
      y = height - margin;
      currentPage++;
    }

    // Draw header
    y = drawHeader(page, y, data, currentPage);

    // Draw table headers
    y = drawTableHeaders(page, y, margin, {
      studentIdWidth,
      studentNameWidth,
      genderWidth,
      subjectColWidth,
      overallAvgWidth,
      overallGradeWidth,
      pageSubjects,
      font,
      boldFont,
      headerBgColor,
      subjectHeaderColor,
      borderColor,
      black
    });

    // Draw student rows
    for (const student of data.students) {
      // Check if we need a new page
      if (y < 100) {
        page = pdfDoc.addPage(pageSize);
        y = height - margin;
        y = drawHeader(page, y, data, currentPage + 1);
        y = drawTableHeaders(page, y, margin, {
          studentIdWidth,
          studentNameWidth,
          genderWidth,
          subjectColWidth,
          overallAvgWidth,
          overallGradeWidth,
          pageSubjects,
          font,
          boldFont,
          headerBgColor,
          subjectHeaderColor,
          borderColor,
          black
        });
        currentPage++;
      }

      y = drawStudentRow(page, y, margin, {
        student,
        studentIdWidth,
        studentNameWidth,
        genderWidth,
        subjectColWidth,
        overallAvgWidth,
        overallGradeWidth,
        pageSubjects,
        font,
        boldFont,
        borderColor,
        black,
        getStatusDisplay,
        getStatusColor,
        getGradeColor
      });
    }

    // Draw summary row
    if (y < 120) {
      page = pdfDoc.addPage(pageSize);
      y = height - margin;
      y = drawHeader(page, y, data, currentPage + 1);
      y = drawTableHeaders(page, y, margin, {
        studentIdWidth,
        studentNameWidth,
        genderWidth,
        subjectColWidth,
        overallAvgWidth,
        overallGradeWidth,
        pageSubjects,
        font,
        boldFont,
        headerBgColor,
        subjectHeaderColor,
        borderColor,
        black
      });
    }

    y = drawSummaryRow(page, y, margin, {
      studentIdWidth,
      studentNameWidth,
      genderWidth,
      subjectColWidth,
      overallAvgWidth,
      overallGradeWidth,
      pageSubjects,
      data,
      font,
      boldFont,
      borderColor,
      black,
      totalRowColor
    });

    y -= 20; // Spacing before next page

    // Move to next batch of subjects
    subjectStartIndex += maxSubjectsPerPage;
    if (subjectStartIndex >= data.subjects.length) {
      allSubjectsProcessed = true;
    }
  }

  // Draw footer on last page
  drawFooter(page, y - 20, margin, width, data, font, gray, borderColor);

  return pdfDoc.save();
}

// Helper function to draw header
function drawHeader(
  page: any, 
  y: number, 
  data: ClassResultsMatrix,
  pageNum: number
): number {
  let currentY = y;

  // School Name
  const schoolText = 'KALABO BOARDING SECONDARY SCHOOL';
  const schoolWidth = page.doc.context.fonts[page.doc.cache[1]].widthOfTextAtSize(schoolText, 14);
  page.drawText(schoolText, {
    x: (page.getWidth() - schoolWidth) / 2,
    y: currentY,
    size: 14,
    font: page.doc.context.fonts[page.doc.cache[1]],
    color: rgb(0.2, 0.2, 0.2),
  });
  currentY -= 20;

  // Title
  const title = `${data.className} - Class Results Matrix`;
  const titleWidth = page.doc.context.fonts[page.doc.cache[1]].widthOfTextAtSize(title, 16);
  page.drawText(title, {
    x: (page.getWidth() - titleWidth) / 2,
    y: currentY,
    size: 16,
    font: page.doc.context.fonts[page.doc.cache[1]],
    color: rgb(0, 0, 0),
  });
  currentY -= 20;

  // Term and Year
  const termText = `${data.term} ${data.year} • Page ${pageNum}`;
  const termWidth = page.doc.context.fonts[page.doc.cache[0]].widthOfTextAtSize(termText, 10);
  page.drawText(termText, {
    x: (page.getWidth() - termWidth) / 2,
    y: currentY,
    size: 10,
    font: page.doc.context.fonts[page.doc.cache[0]],
    color: rgb(0.4, 0.4, 0.4),
  });
  
  return currentY - 25;
}

// Helper function to draw table headers
function drawTableHeaders(
  page: any,
  y: number,
  margin: number,
  config: any
): number {
  let currentY = y;
  let x = margin;

  const {
    studentIdWidth,
    studentNameWidth,
    genderWidth,
    subjectColWidth,
    overallAvgWidth,
    overallGradeWidth,
    pageSubjects,
    font,
    boldFont,
    headerBgColor,
    subjectHeaderColor,
    borderColor,
    black
  } = config;

  // Student Info Headers
  const studentHeaders = [
    { text: 'ID', width: studentIdWidth },
    { text: 'Name', width: studentNameWidth },
    { text: 'G', width: genderWidth }
  ];

  studentHeaders.forEach(header => {
    page.drawRectangle({
      x,
      y: currentY - 20,
      width: header.width,
      height: 40,
      color: headerBgColor,
      borderColor,
      borderWidth: 1,
    });

    page.drawText(header.text, {
      x: x + (header.width / 2) - (font.widthOfTextAtSize(header.text, 9) / 2),
      y: currentY - 8,
      size: 9,
      font: boldFont,
      color: black,
    });

    x += header.width;
  });

  // Subject Headers
  pageSubjects.forEach((subject: string) => {
    const subjectX = x;
    
    // Subject name (across all 5 columns)
    page.drawRectangle({
      x: subjectX,
      y: currentY - 20,
      width: subjectColWidth * 5,
      height: 20,
      color: subjectHeaderColor,
      borderColor,
      borderWidth: 1,
    });

    // Truncate subject name if too long
    let displaySubject = subject;
    if (font.widthOfTextAtSize(subject, 8) > subjectColWidth * 5 - 10) {
      displaySubject = subject.substring(0, 12) + '...';
    }

    page.drawText(displaySubject, {
      x: subjectX + 5,
      y: currentY - 12,
      size: 8,
      font: boldFont,
      color: black,
    });

    // Sub-headers for each exam type
    const subHeaders = ['W4', 'W8', 'EOT', 'Grd', 'Avg'];
    let subX = subjectX;

    subHeaders.forEach((subHeader, index) => {
      page.drawRectangle({
        x: subX,
        y: currentY - 40,
        width: subjectColWidth,
        height: 20,
        color: headerBgColor,
        borderColor,
        borderWidth: 1,
      });

      page.drawText(subHeader, {
        x: subX + (subjectColWidth / 2) - (font.widthOfTextAtSize(subHeader, 7) / 2),
        y: currentY - 32,
        size: 7,
        font: boldFont,
        color: black,
      });

      subX += subjectColWidth;
    });

    x += subjectColWidth * 5;
  });

  // Overall Headers
  const overallHeaders = [
    { text: 'Avg%', width: overallAvgWidth },
    { text: 'Gr', width: overallGradeWidth }
  ];

  overallHeaders.forEach(header => {
    page.drawRectangle({
      x,
      y: currentY - 20,
      width: header.width,
      height: 40,
      color: headerBgColor,
      borderColor,
      borderWidth: 1,
    });

    page.drawText(header.text, {
      x: x + (header.width / 2) - (font.widthOfTextAtSize(header.text, 8) / 2),
      y: currentY - 8,
      size: 8,
      font: boldFont,
      color: black,
    });

    x += header.width;
  });

  return currentY - 45;
}

// Helper function to draw a student row
function drawStudentRow(
  page: any,
  y: number,
  margin: number,
  config: any
): number {
  let currentY = y;
  let x = margin;

  const {
    student,
    studentIdWidth,
    studentNameWidth,
    genderWidth,
    subjectColWidth,
    overallAvgWidth,
    overallGradeWidth,
    pageSubjects,
    font,
    boldFont,
    borderColor,
    black,
    getStatusDisplay,
    getStatusColor,
    getGradeColor
  } = config;

  // Student ID
  page.drawRectangle({
    x,
    y: currentY - 20,
    width: studentIdWidth,
    height: 20,
    borderColor,
    borderWidth: 1,
  });

  page.drawText(student.studentId, {
    x: x + 5,
    y: currentY - 12,
    size: 8,
    font,
    color: black,
  });
  x += studentIdWidth;

  // Student Name
  page.drawRectangle({
    x,
    y: currentY - 20,
    width: studentNameWidth,
    height: 20,
    borderColor,
    borderWidth: 1,
  });

  let displayName = student.studentName;
  if (font.widthOfTextAtSize(student.studentName, 8) > studentNameWidth - 10) {
    displayName = student.studentName.substring(0, 15) + '...';
  }

  page.drawText(displayName, {
    x: x + 5,
    y: currentY - 12,
    size: 8,
    font,
    color: black,
  });
  x += studentNameWidth;

  // Gender
  page.drawRectangle({
    x,
    y: currentY - 20,
    width: genderWidth,
    height: 20,
    borderColor,
    borderWidth: 1,
  });

  const genderDisplay = student.gender === 'M' ? '♂' : student.gender === 'F' ? '♀' : '—';
  page.drawText(genderDisplay, {
    x: x + (genderWidth / 2) - (font.widthOfTextAtSize(genderDisplay, 9) / 2),
    y: currentY - 12,
    size: 9,
    font: boldFont,
    color: student.gender === 'M' ? rgb(0.2, 0.4, 0.8) : rgb(0.8, 0.3, 0.5),
  });
  x += genderWidth;

  // Subject data
  pageSubjects.forEach((subjectName: string) => {
    const subject = student.subjects.find(s => s.subjectName === subjectName);
    
    if (subject) {
      // Week 4
      drawCell(page, x, currentY, subjectColWidth, subject.week4.marks, getStatusDisplay, getStatusColor, font, borderColor);
      x += subjectColWidth;

      // Week 8
      drawCell(page, x, currentY, subjectColWidth, subject.week8.marks, getStatusDisplay, getStatusColor, font, borderColor);
      x += subjectColWidth;

      // End of Term
      drawCell(page, x, currentY, subjectColWidth, subject.endOfTerm.marks, getStatusDisplay, getStatusColor, font, borderColor);
      x += subjectColWidth;

      // Grade
      const gradeColor = subject.endOfTerm.grade > 0 ? getGradeColor(subject.endOfTerm.grade) : black;
      page.drawRectangle({
        x,
        y: currentY - 20,
        width: subjectColWidth,
        height: 20,
        borderColor,
        borderWidth: 1,
      });

      const gradeText = subject.endOfTerm.grade > 0 ? subject.endOfTerm.grade.toString() : '—';
      const textColor = subject.endOfTerm.grade > 0 ? gradeColor : black;
      
      page.drawText(gradeText, {
        x: x + (subjectColWidth / 2) - (font.widthOfTextAtSize(gradeText, 9) / 2),
        y: currentY - 12,
        size: 9,
        font: boldFont,
        color: textColor,
      });
      x += subjectColWidth;

      // Average
      drawCell(page, x, currentY, subjectColWidth, subject.average, getStatusDisplay, getStatusColor, font, borderColor);
      x += subjectColWidth;
    } else {
      // No data for this subject
      for (let i = 0; i < 5; i++) {
        page.drawRectangle({
          x,
          y: currentY - 20,
          width: subjectColWidth,
          height: 20,
          borderColor,
          borderWidth: 1,
        });

        page.drawText('—', {
          x: x + (subjectColWidth / 2) - (font.widthOfTextAtSize('—', 9) / 2),
          y: currentY - 12,
          size: 9,
          font,
          color: black,
        });
        x += subjectColWidth;
      }
    }
  });

  // Overall Average
  page.drawRectangle({
    x,
    y: currentY - 20,
    width: overallAvgWidth,
    height: 20,
    borderColor,
    borderWidth: 1,
  });

  const avgText = student.overallAverage > 0 ? `${Math.round(student.overallAverage)}%` : '—';
  page.drawText(avgText, {
    x: x + (overallAvgWidth / 2) - (font.widthOfTextAtSize(avgText, 9) / 2),
    y: currentY - 12,
    size: 9,
    font: boldFont,
    color: student.overallAverage >= 50 ? rgb(0.2, 0.6, 0.2) : rgb(0.8, 0.3, 0.3),
  });
  x += overallAvgWidth;

  // Overall Grade
  const gradeColor = student.overallGrade > 0 ? getGradeColor(student.overallGrade) : black;
  page.drawRectangle({
    x,
    y: currentY - 20,
    width: overallGradeWidth,
    height: 20,
    borderColor,
    borderWidth: 1,
  });

  const gradeText = student.overallGrade > 0 ? student.overallGrade.toString() : '—';
  page.drawText(gradeText, {
    x: x + (overallGradeWidth / 2) - (font.widthOfTextAtSize(gradeText, 9) / 2),
    y: currentY - 12,
    size: 9,
    font: boldFont,
    color: gradeColor,
  });

  return currentY - 20;
}

// Helper function to draw a cell with proper formatting
function drawCell(
  page: any,
  x: number,
  y: number,
  width: number,
  value: number,
  getStatusDisplay: Function,
  getStatusColor: Function,
  font: any,
  borderColor: any
): void {
  page.drawRectangle({
    x,
    y: y - 20,
    width,
    height: 20,
    borderColor,
    borderWidth: 1,
  });

  let displayText: string;
  let textColor: any;

  if (value >= 0) {
    displayText = value.toString();
    textColor = getStatusColor(value);
  } else if (value === -1) {
    displayText = 'ABS';
    textColor = rgb(0.5, 0.5, 0.5);
  } else if (value === -2) {
    displayText = 'NC';
    textColor = rgb(0.6, 0.6, 0.6);
  } else {
    displayText = '—';
    textColor = rgb(0.7, 0.7, 0.7);
  }

  page.drawText(displayText, {
    x: x + (width / 2) - (font.widthOfTextAtSize(displayText, 8) / 2),
    y: y - 12,
    size: 8,
    font,
    color: textColor,
  });
}

// Helper function to draw summary row
function drawSummaryRow(
  page: any,
  y: number,
  margin: number,
  config: any
): number {
  let currentY = y;
  let x = margin;

  const {
    studentIdWidth,
    studentNameWidth,
    genderWidth,
    subjectColWidth,
    overallAvgWidth,
    overallGradeWidth,
    pageSubjects,
    data,
    font,
    boldFont,
    borderColor,
    black,
    totalRowColor
  } = config;

  // Draw total row background
  page.drawRectangle({
    x: margin,
    y: currentY - 20,
    width: page.getWidth() - (2 * margin),
    height: 20,
    color: totalRowColor,
    borderColor,
    borderWidth: 1,
  });

  // Student Info cells
  page.drawRectangle({
    x,
    y: currentY - 20,
    width: studentIdWidth,
    height: 20,
    borderColor,
    borderWidth: 1,
  });

  page.drawText('TOTAL', {
    x: x + 5,
    y: currentY - 12,
    size: 8,
    font: boldFont,
    color: black,
  });
  x += studentIdWidth;

  page.drawRectangle({
    x,
    y: currentY - 20,
    width: studentNameWidth,
    height: 20,
    borderColor,
    borderWidth: 1,
  });
  x += studentNameWidth;

  page.drawRectangle({
    x,
    y: currentY - 20,
    width: genderWidth,
    height: 20,
    borderColor,
    borderWidth: 1,
  });
  x += genderWidth;

  // Calculate averages for each subject column
  pageSubjects.forEach((subjectName: string) => {
    const subjectAverages = {
      week4: { sum: 0, count: 0 },
      week8: { sum: 0, count: 0 },
      eot: { sum: 0, count: 0 },
      grade: { sum: 0, count: 0 },
      avg: { sum: 0, count: 0 }
    };

    data.students.forEach(student => {
      const subject = student.subjects.find(s => s.subjectName === subjectName);
      if (subject) {
        if (subject.week4.marks >= 0) {
          subjectAverages.week4.sum += subject.week4.marks;
          subjectAverages.week4.count++;
        }
        if (subject.week8.marks >= 0) {
          subjectAverages.week8.sum += subject.week8.marks;
          subjectAverages.week8.count++;
        }
        if (subject.endOfTerm.marks >= 0) {
          subjectAverages.eot.sum += subject.endOfTerm.marks;
          subjectAverages.eot.count++;
        }
        if (subject.endOfTerm.grade > 0) {
          subjectAverages.grade.sum += subject.endOfTerm.grade;
          subjectAverages.grade.count++;
        }
        if (subject.average >= 0) {
          subjectAverages.avg.sum += subject.average;
          subjectAverages.avg.count++;
        }
      }
    });

    // Week 4 average
    const week4Avg = subjectAverages.week4.count > 0 
      ? Math.round(subjectAverages.week4.sum / subjectAverages.week4.count) 
      : null;
    drawSummaryCell(page, x, currentY, subjectColWidth, week4Avg, font, boldFont, borderColor);
    x += subjectColWidth;

    // Week 8 average
    const week8Avg = subjectAverages.week8.count > 0 
      ? Math.round(subjectAverages.week8.sum / subjectAverages.week8.count) 
      : null;
    drawSummaryCell(page, x, currentY, subjectColWidth, week8Avg, font, boldFont, borderColor);
    x += subjectColWidth;

    // EOT average
    const eotAvg = subjectAverages.eot.count > 0 
      ? Math.round(subjectAverages.eot.sum / subjectAverages.eot.count) 
      : null;
    drawSummaryCell(page, x, currentY, subjectColWidth, eotAvg, font, boldFont, borderColor);
    x += subjectColWidth;

    // Grade average
    const gradeAvg = subjectAverages.grade.count > 0 
      ? (subjectAverages.grade.sum / subjectAverages.grade.count).toFixed(1)
      : null;
    drawSummaryCell(page, x, currentY, subjectColWidth, gradeAvg, font, boldFont, borderColor);
    x += subjectColWidth;

    // Overall average
    const avgValue = subjectAverages.avg.count > 0 
      ? Math.round(subjectAverages.avg.sum / subjectAverages.avg.count)
      : null;
    drawSummaryCell(page, x, currentY, subjectColWidth, avgValue, font, boldFont, borderColor);
    x += subjectColWidth;
  });

  // Overall averages
  const overallAvg = data.students.reduce((sum, s) => sum + s.overallAverage, 0) / data.students.length;
  drawSummaryCell(page, x, currentY, overallAvgWidth, Math.round(overallAvg), font, boldFont, borderColor);
  x += overallAvgWidth;

  const overallGradeAvg = data.students.reduce((sum, s) => sum + s.overallGrade, 0) / data.students.length;
  drawSummaryCell(page, x, currentY, overallGradeWidth, overallGradeAvg.toFixed(1), font, boldFont, borderColor);

  return currentY - 20;
}

// Helper function to draw summary cell
function drawSummaryCell(
  page: any,
  x: number,
  y: number,
  width: number,
  value: number | string | null,
  font: any,
  boldFont: any,
  borderColor: any
): void {
  page.drawRectangle({
    x,
    y: y - 20,
    width,
    height: 20,
    borderColor,
    borderWidth: 1,
  });

  if (value !== null) {
    const text = value.toString();
    page.drawText(text, {
      x: x + (width / 2) - (font.widthOfTextAtSize(text, 8) / 2),
      y: y - 12,
      size: 8,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
  }
}

// Helper function to draw footer
function drawFooter(
  page: any,
  y: number,
  margin: number,
  width: number,
  data: ClassResultsMatrix,
  font: any,
  gray: any,
  borderColor: any
): void {
  let currentY = y;

  // Legend
  currentY -= 15;
  const legend1 = 'ABS = Absent | NC = Not Conducted | — = No Data | Grd = Grade | Avg = Average %';
  const legend1Width = font.widthOfTextAtSize(legend1, 7);
  page.drawText(legend1, {
    x: (width - legend1Width) / 2,
    y: currentY,
    size: 7,
    font,
    color: gray,
  });

  currentY -= 12;
  const legend2 = 'Color coding: Green (Grades 1-2), Blue (3-4), Amber (5-6), Orange (7), Red (8-9)';
  const legend2Width = font.widthOfTextAtSize(legend2, 7);
  page.drawText(legend2, {
    x: (width - legend2Width) / 2,
    y: currentY,
    size: 7,
    font,
    color: gray,
  });

  // Generation date
  currentY -= 20;
  const dateText = `Generated: ${data.generatedDate}`;
  const dateWidth = font.widthOfTextAtSize(dateText, 8);
  page.drawText(dateText, {
    x: width - margin - dateWidth,
    y: currentY,
    size: 8,
    font,
    color: gray,
  });

  // Draw footer line
  page.drawLine({
    start: { x: margin, y: currentY - 5 },
    end: { x: width - margin, y: currentY - 5 },
    thickness: 0.5,
    color: borderColor,
  });
}