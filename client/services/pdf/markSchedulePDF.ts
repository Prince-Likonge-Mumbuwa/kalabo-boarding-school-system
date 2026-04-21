// @/services/pdf/markSchedulePDF.ts - COMPLETE FIXED VERSION
// Features: Clean minimalism, proper alignment, correct math, professional layout
import { PDFDocument, rgb, StandardFonts, PDFImage } from 'pdf-lib';

interface MarkScheduleOptions {
  className: string;
  subject: string;
  examType: 'week4' | 'week8' | 'endOfTerm';
  term: string;
  year: number;
  totalMarks: number;
  students: Array<{
    name: string;
    studentId: string;
    marks: string;
    id?: string;
    marksNum?: number | null;
    percentage?: string | null;
    grade?: number | null;
    isAbsent?: boolean;
  }>;
  teacherName: string;
  schoolName: string;
  allExamData?: {
    week4?: Array<{ studentId: string; marks: number; studentName: string; student_id?: string }>;
    week8?: Array<{ studentId: string; marks: number; studentName: string; student_id?: string }>;
    endOfTerm?: Array<{ studentId: string; marks: number; studentName: string; student_id?: string }>;
  };
  isNotConducted?: boolean;
}

// ==================== OFFICIAL GRADE SYSTEM ====================
const GRADE_SYSTEM: Record<number, { min: number; max: number; description: string; color: [number, number, number] }> = {
  1: { min: 75, max: 100, description: 'Distinction', color: [0, 0.5, 0] },
  2: { min: 70, max: 74, description: 'Distinction', color: [0.2, 0.6, 0.2] },
  3: { min: 65, max: 69, description: 'Merit', color: [0.3, 0.7, 0.3] },
  4: { min: 60, max: 64, description: 'Merit', color: [0.2, 0.5, 0.8] },
  5: { min: 55, max: 59, description: 'Credit', color: [0.4, 0.5, 0.9] },
  6: { min: 50, max: 54, description: 'Credit', color: [0.7, 0.7, 0.2] },
  7: { min: 45, max: 49, description: 'Satisfactory', color: [0.9, 0.5, 0.2] },
  8: { min: 40, max: 44, description: 'Satisfactory', color: [0.9, 0.4, 0.2] },
  9: { min: 0, max: 39, description: 'Unsatisfactory', color: [0.8, 0.2, 0.2] },
};

const calculateOfficialGrade = (percentage: number): number => {
  if (percentage < 0) return -1;
  if (percentage >= 75) return 1;
  if (percentage >= 70) return 2;
  if (percentage >= 65) return 3;
  if (percentage >= 60) return 4;
  if (percentage >= 55) return 5;
  if (percentage >= 50) return 6;
  if (percentage >= 45) return 7;
  if (percentage >= 40) return 8;
  return 9;
};

const getGradeColor = (grade: number): [number, number, number] => {
  if (grade === -1) return [0.5, 0.5, 0.5];
  const gradeInfo = GRADE_SYSTEM[grade];
  return gradeInfo ? gradeInfo.color : [0.5, 0.5, 0.5];
};

// ==================== HELPER FUNCTIONS ====================
const embedSchoolLogo = async (pdfDoc: PDFDocument): Promise<PDFImage | null> => {
  try {
    const logoUrl = '/images/school-logo.png';
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const logoImageBytes = await response.arrayBuffer();
    try {
      return await pdfDoc.embedPng(logoImageBytes);
    } catch {
      try {
        return await pdfDoc.embedJpg(logoImageBytes);
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
};

const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

export const generateMarkSchedulePDF = async ({
  className,
  subject,
  examType,
  term,
  year,
  totalMarks,
  students,
  teacherName,
  schoolName,
  allExamData,
  isNotConducted = false
}: MarkScheduleOptions): Promise<void> => {
  try {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    
    const logoImage = await embedSchoolLogo(pdfDoc);
    
    // Page dimensions - A4
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 48;
    const contentWidth = pageWidth - (margin * 2);
    
    // Color palette - Clean minimalism
    const colors = {
      primary: rgb(0.05, 0.25, 0.45),      // Deep navy blue
      secondary: rgb(0.4, 0.6, 0.8),       // Soft blue
      accent: rgb(0.2, 0.5, 0.3),          // Muted green
      text: rgb(0.15, 0.15, 0.15),         // Dark gray
      textLight: rgb(0.5, 0.5, 0.5),       // Medium gray
      border: rgb(0.85, 0.85, 0.85),       // Light gray
      background: rgb(0.98, 0.98, 0.98),   // Off-white
      warning: rgb(0.8, 0.3, 0.2),         // Muted red
    };
    
    let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let yPosition = pageHeight - margin;
    
    // Helper: Center text horizontally
    const centerX = (text: string, size: number, fontObj: any = fontBold): number => {
      const width = fontObj.widthOfTextAtSize(text, size);
      return (pageWidth - width) / 2;
    };
    
    // ==================== HEADER SECTION ====================
    const addHeader = async (page: typeof currentPage, pageNum: number) => {
      let y = pageHeight - margin;
      
      // Logo
      if (logoImage) {
        const logoDims = logoImage.scale(0.1);
        const logoX = (pageWidth - logoDims.width) / 2;
        page.drawImage(logoImage, {
          x: logoX,
          y: y - logoDims.height,
          width: logoDims.width,
          height: logoDims.height,
        });
        y -= logoDims.height + 12;
      }
      
      // School name
      const schoolText = schoolName.toUpperCase();
      page.drawText(schoolText, {
        x: centerX(schoolText, 16),
        y,
        size: 16,
        font: fontBold,
        color: colors.primary,
      });
      y -= 18;
      
      // Ministry line
      const ministryText = 'MINISTRY OF EDUCATION';
      page.drawText(ministryText, {
        x: centerX(ministryText, 9),
        y,
        size: 9,
        font: font,
        color: colors.textLight,
      });
      y -= 20;
      
      // Main title
      const titleText = isNotConducted ? 'MARK SCHEDULE - NOT CONDUCTED' : 'MARK SCHEDULE';
      page.drawText(titleText, {
        x: centerX(titleText, 20),
        y,
        size: 20,
        font: fontBold,
        color: colors.primary,
      });
      y -= 28;
      
      // Decorative line
      page.drawLine({
        start: { x: margin + 50, y: y + 8 },
        end: { x: pageWidth - margin - 50, y: y + 8 },
        thickness: 1.5,
        color: colors.primary,
      });
      
      // Page number
      page.drawText(`Page ${pageNum}`, {
        x: pageWidth - margin - 50,
        y: margin - 12,
        size: 8,
        font: font,
        color: colors.textLight,
      });
      
      return y;
    };
    
    yPosition = await addHeader(currentPage, 1);
    
    // ==================== INFO CARD - COMPLETELY RESTRUCTURED ====================
    const cardHeight = 120;
    const cardY = yPosition - cardHeight;
    
    // Card background
    currentPage.drawRectangle({
      x: margin,
      y: cardY,
      width: contentWidth,
      height: cardHeight,
      color: colors.background,
      borderColor: colors.border,
      borderWidth: 0.5,
    });
    
    // ===== METADATA SECTION =====
    let currentY = yPosition - 20;
    const labelWidth = 85;
    const col1X = margin + 16;
    const col2X = margin + contentWidth / 2 + 8;
    
    const examTypeDisplay = examType === 'week4' ? 'Week 4' : 
                           examType === 'week8' ? 'Week 8' : 'End of Term';
    
    const drawAlignedRow = (label: string, value: string, x: number, y: number) => {
      currentPage.drawText(label, {
        x,
        y,
        size: 8,
        font: fontBold,
        color: colors.textLight,
      });
      currentPage.drawText(value, {
        x: x + labelWidth,
        y,
        size: 9,
        font: font,
        color: colors.text,
      });
    };
    
    // Metadata rows
    drawAlignedRow('CLASS:', className, col1X, currentY);
    drawAlignedRow('SUBJECT:', subject, col2X, currentY);
    
    currentY -= 22;
    drawAlignedRow('EXAM:', examTypeDisplay, col1X, currentY);
    drawAlignedRow('TERM:', `${term} ${year}`, col2X, currentY);
    
    currentY -= 22;
    drawAlignedRow('TEACHER:', teacherName, col1X, currentY);
    drawAlignedRow('TOTAL MARKS:', isNotConducted ? 'N/A' : totalMarks.toString(), col2X, currentY);
    
    currentY -= 22;
    const dateStr = new Date().toLocaleDateString('en-GB');
    drawAlignedRow('DATE:', dateStr, col1X, currentY);
    drawAlignedRow('STUDENTS:', students.length.toString(), col2X, currentY);
    
    // ===== STATISTICS SECTION =====
    currentY -= 32;
    
    // Divider
    currentPage.drawLine({
      start: { x: margin + 10, y: currentY + 10 },
      end: { x: pageWidth - margin - 10, y: currentY + 10 },
      thickness: 0.5,
      color: colors.border,
    });
    
    if (!isNotConducted) {
      const enteredCount = students.filter(s => 
        s.marks && s.marks !== '' && s.marks.toLowerCase() !== 'x' && s.marks !== 'N/A'
      ).length;
      const absentCount = students.filter(s => s.marks.toLowerCase() === 'x').length;
      const notConductedCount = students.filter(s => s.marks === 'N/A').length;
      const pendingCount = students.length - enteredCount - absentCount - notConductedCount;
      
      const stats = [
        { label: 'Entered', value: enteredCount, color: colors.accent },
        { label: 'Absent', value: absentCount, color: colors.warning },
        { label: 'N/A', value: notConductedCount, color: colors.textLight },
        { label: 'Pending', value: pendingCount, color: colors.secondary },
      ];
      
      const statWidth = contentWidth / stats.length;
      
      stats.forEach((stat, idx) => {
        const statX = margin + (idx * statWidth);
        const centerXPos = statX + (statWidth / 2);
        const valueStr = stat.value.toString();
        
        currentPage.drawText(valueStr, {
          x: centerXPos - (fontBold.widthOfTextAtSize(valueStr, 16) / 2),
          y: currentY,
          size: 16,
          font: fontBold,
          color: stat.color,
        });
        
        currentPage.drawText(stat.label, {
          x: centerXPos - (font.widthOfTextAtSize(stat.label, 8) / 2),
          y: currentY - 16,
          size: 8,
          font: font,
          color: colors.textLight,
        });
      });
      
      yPosition = cardY - 16;
    } else {
      const badgeText = 'NOT CONDUCTED';
      currentPage.drawText(badgeText, {
        x: centerX(badgeText, 14),
        y: currentY,
        size: 14,
        font: fontBold,
        color: colors.textLight,
      });
      
      yPosition = cardY - 36;
    }
    
    // ==================== STUDENT TABLE ====================
    const tableHeaders = [
      { text: '#', width: 30, align: 'center' },
      { text: 'Student Name', width: 170, align: 'left' },
      { text: 'Student ID', width: 100, align: 'left' },
      { text: 'Marks', width: 50, align: 'center' },
      { text: 'Score', width: 60, align: 'center' },
      { text: '%', width: 45, align: 'center' },
      { text: 'Grade', width: 45, align: 'center' },
    ];
    
    // Header background
    const headerY = yPosition;
    currentPage.drawRectangle({
      x: margin,
      y: headerY - 22,
      width: contentWidth,
      height: 22,
      color: colors.primary,
    });
    
    // Header text
    let currentX = margin;
    tableHeaders.forEach(header => {
      const textX = header.align === 'center' 
        ? currentX + (header.width / 2) - (fontBold.widthOfTextAtSize(header.text, 9) / 2)
        : currentX + 8;
      
      currentPage.drawText(header.text, {
        x: textX,
        y: headerY - 14,
        size: 9,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      currentX += header.width;
    });
    
    yPosition = headerY - 24;
    
    // Table rows
    const rowHeight = 18;
    const savedMarksMap = new Map();
    
    if (allExamData && !isNotConducted) {
      const currentExamData = allExamData[examType] || [];
      currentExamData.forEach(item => {
        if (item.studentId) savedMarksMap.set(item.studentId, item.marks);
        if (item.student_id) savedMarksMap.set(item.student_id, item.marks);
      });
    }
    
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      
      // Check for new page
      if (yPosition < margin + 50) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        yPosition = await addHeader(currentPage, pdfDoc.getPageCount());
        
        // Redraw header on new page
        currentPage.drawRectangle({
          x: margin,
          y: yPosition - 22,
          width: contentWidth,
          height: 22,
          color: colors.primary,
        });
        
        let headerX = margin;
        tableHeaders.forEach(header => {
          const textX = header.align === 'center' 
            ? headerX + (header.width / 2) - (fontBold.widthOfTextAtSize(header.text, 9) / 2)
            : headerX + 8;
          
          currentPage.drawText(header.text, {
            x: textX,
            y: yPosition - 14,
            size: 9,
            font: fontBold,
            color: rgb(1, 1, 1),
          });
          headerX += header.width;
        });
        yPosition -= 24;
      }
      
      // Row background (zebra striping)
      if (i % 2 === 0) {
        currentPage.drawRectangle({
          x: margin,
          y: yPosition - rowHeight + 2,
          width: contentWidth,
          height: rowHeight,
          color: colors.background,
        });
      }
      
      // Get marks
      let marksValue = student.marks || '';
      let isFromSaved = false;
      
      if ((!marksValue || marksValue === '') && !isNotConducted) {
        const savedMark = savedMarksMap.get(student.studentId) || savedMarksMap.get(student.id);
        if (savedMark !== undefined) {
          isFromSaved = true;
          if (savedMark === -1) marksValue = 'X';
          else if (savedMark === -2) marksValue = 'N/A';
          else if (savedMark >= 0) marksValue = savedMark.toString();
        }
      }
      
      const marksStr = marksValue.toString().trim();
      const isAbsent = marksStr.toLowerCase() === 'x';
      const isNA = marksStr === 'N/A' || marksStr === 'na';
      
      let marksNum: number | null = null;
      if (!isAbsent && !isNA && marksStr !== '') {
        marksNum = parseInt(marksStr);
        if (isNaN(marksNum)) marksNum = null;
      }
      
      // CORRECT percentage and grade calculation
      let percentage: string | null = null;
      let gradeNum = -1;
      
      if (!isNotConducted && !isNA && marksNum !== null && !isNaN(marksNum)) {
        const percentValue = (marksNum / totalMarks) * 100;
        percentage = percentValue.toFixed(0);
        gradeNum = calculateOfficialGrade(percentValue);
      } else if (isNA) {
        gradeNum = -2;
      } else if (isAbsent) {
        gradeNum = -1;
      }
      
      const gradeText = isNA ? 'N/A' : (isAbsent ? 'ABS' : (gradeNum === -1 ? '-' : gradeNum.toString()));
      const gradeColor = isNA ? colors.textLight : (isAbsent ? colors.warning : rgb(...getGradeColor(gradeNum)));
      
      const rowY = yPosition - 12;
      
      // Draw row data
      let xPos = margin;
      
      // # column
      const numText = `${i + 1}`;
      currentPage.drawText(numText, {
        x: xPos + (30 / 2) - (font.widthOfTextAtSize(numText, 9) / 2),
        y: rowY,
        size: 9,
        font: font,
        color: colors.text,
      });
      xPos += 30;
      
      // Name column
      const displayName = truncateText(student.name, 28);
      currentPage.drawText(displayName, {
        x: xPos + 8,
        y: rowY,
        size: 9,
        font: font,
        color: colors.text,
      });
      xPos += 170;
      
      // Student ID column
      currentPage.drawText(student.studentId, {
        x: xPos + 8,
        y: rowY,
        size: 9,
        font: font,
        color: colors.text,
      });
      xPos += 100;
      
      // Marks column
      let marksDisplay = '-';
      if (isNotConducted) marksDisplay = 'N/A';
      else if (isNA) marksDisplay = 'N/A';
      else if (isAbsent) marksDisplay = 'ABS';
      else if (marksStr !== '') marksDisplay = marksStr;
      
      currentPage.drawText(marksDisplay, {
        x: xPos + (50 / 2) - (font.widthOfTextAtSize(marksDisplay, 9) / 2),
        y: rowY,
        size: 9,
        font: isAbsent || isNA ? fontOblique : font,
        color: isAbsent ? colors.warning : (isNA ? colors.textLight : colors.text),
      });
      
      // Asterisk for saved marks
      if (isFromSaved && !isNotConducted && !isAbsent && !isNA && marksStr !== '') {
        currentPage.drawText('*', {
          x: xPos + 42,
          y: rowY + 2,
          size: 8,
          font: fontBold,
          color: colors.accent,
        });
      }
      xPos += 50;
      
      // Score column
      let scoreDisplay = '-';
      if (isNotConducted || isNA) scoreDisplay = 'N/A';
      else if (marksNum !== null && !isNaN(marksNum)) scoreDisplay = `${marksNum}/${totalMarks}`;
      
      currentPage.drawText(scoreDisplay, {
        x: xPos + (60 / 2) - (font.widthOfTextAtSize(scoreDisplay, 9) / 2),
        y: rowY,
        size: 8,
        font: font,
        color: colors.text,
      });
      xPos += 60;
      
      // Percentage column
      let percentDisplay = '-';
      if (isNotConducted || isNA) percentDisplay = 'N/A';
      else if (percentage) percentDisplay = `${percentage}%`;
      
      currentPage.drawText(percentDisplay, {
        x: xPos + (45 / 2) - (font.widthOfTextAtSize(percentDisplay, 9) / 2),
        y: rowY,
        size: 9,
        font: fontBold,
        color: colors.text,
      });
      xPos += 45;
      
      // Grade column
      currentPage.drawText(gradeText, {
        x: xPos + (45 / 2) - (fontBold.widthOfTextAtSize(gradeText, 10) / 2),
        y: rowY,
        size: 10,
        font: fontBold,
        color: gradeColor,
      });
      
      yPosition -= rowHeight;
    }
    
    // ==================== FOOTER ====================
    const footerY = margin - 10;
    
    // Light separator line above footer
    currentPage.drawLine({
      start: { x: margin, y: footerY + 20 },
      end: { x: pageWidth - margin, y: footerY + 20 },
      thickness: 0.5,
      color: colors.border,
    });
    
    // Footer text
    currentPage.drawText(`Generated on ${new Date().toLocaleString()}`, {
      x: margin,
      y: footerY,
      size: 7,
      font: font,
      color: colors.textLight,
    });
    
    currentPage.drawText("Teacher's Signature: _________________________", {
      x: pageWidth - margin - 220,
      y: footerY,
      size: 8,
      font: font,
      color: colors.textLight,
    });
    
    if (!isNotConducted && savedMarksMap.size > 0) {
      currentPage.drawText('* Mark loaded from saved data', {
        x: margin,
        y: footerY - 12,
        size: 7,
        font: fontOblique,
        color: colors.accent,
      });
    }
    
    // ==================== TERM SUMMARY PAGE ====================
    if (allExamData && (allExamData.week4?.length || allExamData.week8?.length || allExamData.endOfTerm?.length) && !isNotConducted) {
      const summaryPage = pdfDoc.addPage([pageWidth, pageHeight]);
      let summaryY = await addHeader(summaryPage, pdfDoc.getPageCount());
      
      // Summary title
      const summaryTitle = 'TERM PERFORMANCE SUMMARY';
      summaryPage.drawText(summaryTitle, {
        x: centerX(summaryTitle, 14),
        y: summaryY,
        size: 14,
        font: fontBold,
        color: colors.primary,
      });
      
      summaryY -= 20;
      summaryPage.drawLine({
        start: { x: margin, y: summaryY + 5 },
        end: { x: pageWidth - margin, y: summaryY + 5 },
        thickness: 0.8,
        color: colors.border,
      });
      summaryY -= 20;
      
      // Summary table headers
      const summaryHeaders = [
        { text: '#', width: 25 },
        { text: 'Student Name', width: 160 },
        { text: 'Student ID', width: 85 },
        { text: 'W4', width: 35 },
        { text: 'W8', width: 35 },
        { text: 'EOT', width: 35 },
        { text: 'Avg %', width: 50 },
        { text: 'Grade', width: 40 },
      ];
      
      // Header background
      summaryPage.drawRectangle({
        x: margin,
        y: summaryY - 20,
        width: contentWidth,
        height: 20,
        color: colors.secondary,
      });
      
      let headerX = margin;
      summaryHeaders.forEach(header => {
        summaryPage.drawText(header.text, {
          x: headerX + 8,
          y: summaryY - 14,
          size: 8,
          font: fontBold,
          color: rgb(1, 1, 1),
        });
        headerX += header.width;
      });
      
      summaryY -= 22;
      
      // Create data maps
      const week4Map = new Map();
      allExamData.week4?.forEach(item => {
        if (item.studentId) week4Map.set(item.studentId, item.marks);
        if (item.student_id) week4Map.set(item.student_id, item.marks);
      });
      
      const week8Map = new Map();
      allExamData.week8?.forEach(item => {
        if (item.studentId) week8Map.set(item.studentId, item.marks);
        if (item.student_id) week8Map.set(item.student_id, item.marks);
      });
      
      const eotMap = new Map();
      allExamData.endOfTerm?.forEach(item => {
        if (item.studentId) eotMap.set(item.studentId, item.marks);
        if (item.student_id) eotMap.set(item.student_id, item.marks);
      });
      
      // Display student summaries
      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        
        if (summaryY < margin + 40) {
          summaryPage.drawText('... additional students', {
            x: margin + 8,
            y: summaryY,
            size: 8,
            font: fontOblique,
            color: colors.textLight,
          });
          break;
        }
        
        if (i % 2 === 0) {
          summaryPage.drawRectangle({
            x: margin,
            y: summaryY - 14,
            width: contentWidth,
            height: 14,
            color: colors.background,
          });
        }
        
        const week4Mark = week4Map.get(student.studentId);
        const week8Mark = week8Map.get(student.studentId);
        const eotMark = eotMap.get(student.studentId);
        
        // CORRECT: Calculate percentages using the SAME totalMarks
        const week4Percent = week4Mark !== undefined && week4Mark >= 0 ? (week4Mark / totalMarks) * 100 : null;
        const week8Percent = week8Mark !== undefined && week8Mark >= 0 ? (week8Mark / totalMarks) * 100 : null;
        const eotPercent = eotMark !== undefined && eotMark >= 0 ? (eotMark / totalMarks) * 100 : null;
        
        const validPercentages = [week4Percent, week8Percent, eotPercent].filter((p): p is number => p !== null);
        const avgPercentage = validPercentages.length > 0 
          ? validPercentages.reduce((a, b) => a + b, 0) / validPercentages.length
          : null;
        
        const avgGrade = avgPercentage !== null ? calculateOfficialGrade(avgPercentage) : -1;
        const avgGradeText = avgGrade === -1 ? '-' : avgGrade.toString();
        const avgPercentDisplay = avgPercentage !== null ? `${Math.round(avgPercentage)}%` : '-';
        
        const drawMark = (mark: number | undefined, x: number) => {
          if (mark === undefined) {
            summaryPage.drawText('-', { x, y: summaryY - 8, size: 8, font, color: colors.textLight });
          } else if (mark === -1) {
            summaryPage.drawText('A', { x, y: summaryY - 8, size: 8, font: fontOblique, color: colors.warning });
          } else if (mark === -2) {
            summaryPage.drawText('N', { x, y: summaryY - 8, size: 8, font: fontOblique, color: colors.textLight });
          } else {
            summaryPage.drawText(mark.toString(), { x, y: summaryY - 8, size: 8, font });
          }
        };
        
        let rowX = margin;
        
        // # column
        summaryPage.drawText(`${i + 1}`, { x: rowX + 12, y: summaryY - 8, size: 8, font });
        rowX += 25;
        
        // Name column
        const shortName = truncateText(student.name, 22);
        summaryPage.drawText(shortName, { x: rowX + 8, y: summaryY - 8, size: 8, font });
        rowX += 160;
        
        // Student ID
        summaryPage.drawText(student.studentId, { x: rowX + 8, y: summaryY - 8, size: 8, font });
        rowX += 85;
        
        // Marks
        drawMark(week4Mark, rowX + 12);
        rowX += 35;
        drawMark(week8Mark, rowX + 12);
        rowX += 35;
        drawMark(eotMark, rowX + 12);
        rowX += 35;
        
        // Average percentage
        summaryPage.drawText(avgPercentDisplay, { x: rowX + 12, y: summaryY - 8, size: 8, font: fontBold });
        rowX += 50;
        
        // Grade with color
        const [r, g, b] = getGradeColor(avgGrade);
        summaryPage.drawText(avgGradeText, {
          x: rowX + 16,
          y: summaryY - 8,
          size: 9,
          font: fontBold,
          color: rgb(r, g, b),
        });
        
        summaryY -= 16;
      }
      
      // Summary page footer
      const summaryFooterY = margin - 10;
      summaryPage.drawText(`Generated on ${new Date().toLocaleString()}`, {
        x: margin,
        y: summaryFooterY,
        size: 7,
        font: font,
        color: colors.textLight,
      });
    }
    
    // ==================== SAVE AND DOWNLOAD ====================
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([new Uint8Array(pdfBytes).buffer], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    const status = isNotConducted ? '_NOT_CONDUCTED' : '';
    const fileName = `${schoolName.replace(/\s+/g, '_')}_${className.replace(/\s+/g, '_')}_${subject.replace(/\s+/g, '_')}_${examType}${status}_${term.replace(/\s+/g, '_')}_${year}.pdf`;
    
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    console.log('✅ PDF generated successfully');
    
  } catch (error) {
    console.error('❌ Error generating PDF:', error);
    throw error;
  }
};