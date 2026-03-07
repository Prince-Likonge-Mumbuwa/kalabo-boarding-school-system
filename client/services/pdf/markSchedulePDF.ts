// @/services/pdf/markSchedulePDF.ts - FIXED VERSION

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

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
    id?: string; // Add optional id field
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
    console.log('📄 PDF Generator - Starting with data:', {
      className,
      subject,
      examType,
      term,
      year,
      totalMarks,
      studentCount: students.length,
      isNotConducted,
      studentsWithMarks: students.filter(s => s.marks && s.marks !== '' && s.marks !== 'N/A').length,
      sampleStudent: students[0] ? {
        name: students[0].name,
        marks: students[0].marks
      } : null
    });

    const pdfDoc = await PDFDocument.create();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    
    const pageWidth = 595.28; // A4 width
    const pageHeight = 841.89; // A4 height
    const margin = 50;
    const contentWidth = pageWidth - (margin * 2);
    
    let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let yPosition = pageHeight - margin;

    // Helper function to calculate centered X position
    const centerText = (text: string, fontSize: number) => {
      const textWidth = helveticaBold.widthOfTextAtSize(text, fontSize);
      return (pageWidth - textWidth) / 2;
    };

    // Helper function to add header to page
    const addHeader = (page: typeof currentPage, pageNum: number) => {
      const headerY = pageHeight - margin;
      
      // School header
      const schoolText = schoolName.toUpperCase();
      page.drawText(schoolText, {
        x: centerText(schoolText, 20),
        y: headerY,
        size: 20,
        font: helveticaBold,
        color: rgb(0, 0.2, 0.4),
      });
      
      const ministryText = 'MINISTRY OF EDUCATION';
      page.drawText(ministryText, {
        x: centerText(ministryText, 14),
        y: headerY - 25,
        size: 14,
        font: helveticaBold,
        color: rgb(0.3, 0.3, 0.3),
      });

      // Decorative line
      page.drawLine({
        start: { x: margin + 50, y: headerY - 40 },
        end: { x: pageWidth - margin - 50, y: headerY - 40 },
        thickness: 1.5,
        color: rgb(0, 0.2, 0.4),
      });

      // MARK SCHEDULE title
      const titleText = 'MARK SCHEDULE';
      page.drawText(titleText, {
        x: centerText(titleText, 18),
        y: headerY - 60,
        size: 18,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });

      // Page number
      page.drawText(`Page ${pageNum}`, {
        x: pageWidth - margin - 40,
        y: margin - 15,
        size: 8,
        font: helveticaFont,
        color: rgb(0.5, 0.5, 0.5),
      });
    };

    // Add header to first page
    addHeader(currentPage, 1);
    yPosition = pageHeight - margin - 85; // Adjust starting position after header

    // Create info box
    const infoBoxY = yPosition;
    const infoBoxHeight = 80;
    
    // Draw info box background
    currentPage.drawRectangle({
      x: margin,
      y: infoBoxY - infoBoxHeight,
      width: contentWidth,
      height: infoBoxHeight,
      color: isNotConducted ? rgb(0.97, 0.97, 0.97) : rgb(0.95, 0.97, 1),
      borderColor: isNotConducted ? rgb(0.8, 0.8, 0.8) : rgb(0.7, 0.7, 0.7),
      borderWidth: 0.5,
    });

    // If not conducted, add a prominent badge
    if (isNotConducted) {
      const badgeText = 'TEST NOT CONDUCTED';
      currentPage.drawText(badgeText, {
        x: centerText(badgeText, 14),
        y: infoBoxY - 15,
        size: 14,
        font: helveticaBold,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    // Format exam type for display
    const examTypeDisplay = examType === 'week4' ? 'Week 4' : 
                           examType === 'week8' ? 'Week 8' : 'End of Term';

    // Count entered marks and calculate statistics
    const enteredMarks = students.filter(s => 
      s.marks && s.marks !== '' && s.marks.toLowerCase() !== 'x' && s.marks !== 'N/A'
    );
    const absentCount = students.filter(s => s.marks.toLowerCase() === 'x').length;
    const notConductedCount = students.filter(s => s.marks === 'N/A').length;
    const enteredCount = enteredMarks.length;
    
    // Calculate average if there are marks
    let averageMark = 'N/A';
    if (enteredCount > 0) {
      const sum = enteredMarks.reduce((acc, s) => {
        const mark = parseInt(s.marks);
        return acc + (isNaN(mark) ? 0 : mark);
      }, 0);
      const avg = (sum / enteredCount).toFixed(1);
      averageMark = `${avg}/${totalMarks}`;
    }

    // Info grid - left column
    let infoX = margin + 10;
    let infoY = infoBoxY - 20;
    
    const drawInfoItem = (label: string, value: string, x: number, y: number) => {
      currentPage.drawText(label, {
        x,
        y,
        size: 9,
        font: helveticaBold,
        color: rgb(0.3, 0.3, 0.3),
      });
      currentPage.drawText(value, {
        x: x + 55,
        y,
        size: 9,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
    };

    // Row 1
    drawInfoItem('Class:', className, infoX, infoY);
    drawInfoItem('Subject:', subject, infoX + 150, infoY);
    drawInfoItem('Exam:', examTypeDisplay, infoX + 300, infoY);

    // Row 2
    infoY -= 18;
    drawInfoItem('Term:', `${term} ${year}`, infoX, infoY);
    drawInfoItem('Total:', isNotConducted ? 'N/A' : totalMarks.toString(), infoX + 150, infoY);
    drawInfoItem('Teacher:', teacherName, infoX + 300, infoY);

    // Row 3
    infoY -= 18;
    const today = new Date();
    drawInfoItem('Date:', today.toLocaleDateString(), infoX, infoY);
    drawInfoItem('Students:', students.length.toString(), infoX + 150, infoY);
    drawInfoItem('Entered:', isNotConducted ? 'N/A' : `${enteredCount}/${students.length}`, infoX + 300, infoY);

    // Row 4 - Additional stats when not conducted
    if (isNotConducted) {
      infoY -= 18;
      drawInfoItem('Status:', 'NOT CONDUCTED', infoX + 150, infoY);
    } else if (notConductedCount > 0) {
      infoY -= 18;
      drawInfoItem('N/A:', notConductedCount.toString(), infoX + 150, infoY);
    }

    yPosition = infoBoxY - infoBoxHeight - 20;

    // Table headers
    const headers = [
      { text: '#', x: margin + 5, width: 25 },
      { text: 'Student Name', x: margin + 35, width: 180 },
      { text: 'Student ID', x: margin + 220, width: 90 },
      { text: 'Marks', x: margin + 315, width: 45 },
      { text: 'Score', x: margin + 365, width: 55 },
      { text: '%', x: margin + 425, width: 35 },
      { text: 'Grade', x: margin + 465, width: 40 }
    ];

    // Draw header background
    currentPage.drawRectangle({
      x: margin,
      y: yPosition - 5,
      width: contentWidth,
      height: 20,
      color: isNotConducted ? rgb(0.5, 0.5, 0.5) : rgb(0.2, 0.4, 0.6),
    });

    // Draw header text
    headers.forEach(header => {
      currentPage.drawText(header.text, {
        x: header.x,
        y: yPosition,
        size: 9,
        font: helveticaBold,
        color: rgb(1, 1, 1),
      });
    });

    yPosition -= 18;

    // Helper function to calculate grade
    const calculateGrade = (marksNum: number | null): { grade: string; color: any } => {
      if (marksNum === null || isNaN(marksNum)) return { grade: '-', color: rgb(0.5, 0.5, 0.5) };
      if (marksNum === -1) return { grade: 'ABS', color: rgb(0.7, 0.3, 0.3) };
      if (marksNum === -2) return { grade: 'N/A', color: rgb(0.5, 0.5, 0.5) };
      
      const percentage = (marksNum / totalMarks) * 100;
      
      if (percentage >= 80) return { grade: '1', color: rgb(0, 0.6, 0) };
      if (percentage >= 70) return { grade: '2', color: rgb(0.2, 0.7, 0.2) };
      if (percentage >= 65) return { grade: '3', color: rgb(0.4, 0.8, 0.4) };
      if (percentage >= 60) return { grade: '4', color: rgb(0.3, 0.6, 1) };
      if (percentage >= 55) return { grade: '5', color: rgb(0.5, 0.5, 1) };
      if (percentage >= 50) return { grade: '6', color: rgb(0.8, 0.8, 0.2) };
      if (percentage >= 45) return { grade: '7', color: rgb(1, 0.6, 0.2) };
      if (percentage >= 40) return { grade: '8', color: rgb(1, 0.4, 0.2) };
      return { grade: '9', color: rgb(1, 0.2, 0.2) };
    };

    // FIXED: Create saved marks map for current exam type
    const savedMarksMap = new Map();
    if (allExamData && !isNotConducted) {
      const currentExamData = allExamData[examType] || [];
      console.log(`📊 PDF - Current exam data for ${examType}:`, currentExamData);
      
      currentExamData.forEach(item => {
        // Store by studentId
        if (item.studentId) {
          savedMarksMap.set(item.studentId, item.marks);
        }
        // Also store by student_id if different
        if (item.student_id) {
          savedMarksMap.set(item.student_id, item.marks);
        }
      });
    }

    // Table rows
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      
      // Check if we need a new page
      if (yPosition < margin + 60) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        addHeader(currentPage, pdfDoc.getPageCount());
        yPosition = pageHeight - margin - 40;
        
        // Redraw headers on new page
        currentPage.drawRectangle({
          x: margin,
          y: yPosition - 5,
          width: contentWidth,
          height: 20,
          color: isNotConducted ? rgb(0.5, 0.5, 0.5) : rgb(0.2, 0.4, 0.6),
        });

        headers.forEach(header => {
          currentPage.drawText(header.text, {
            x: header.x,
            y: yPosition,
            size: 9,
            font: helveticaBold,
            color: rgb(1, 1, 1),
          });
        });

        yPosition -= 18;
      }

      // Alternate row background
      if (i % 2 === 0) {
        currentPage.drawRectangle({
          x: margin,
          y: yPosition - 3,
          width: contentWidth,
          height: 16,
          color: rgb(0.97, 0.97, 0.97),
        });
      }

      // FIXED: Get marks - prioritize current input, fall back to saved marks
      let marksValue = student.marks || '';
      let isFromSaved = false;
      
      // If current input is empty, check for saved marks
      if ((!marksValue || marksValue === '') && !isNotConducted) {
        // Try to find saved mark using multiple ID fields
        let savedMark = savedMarksMap.get(student.studentId);
        
        // If not found by studentId, try by document id if available
        if (!savedMark && student.id) {
          savedMark = savedMarksMap.get(student.id);
        }
        
        if (savedMark !== undefined) {
          isFromSaved = true;
          if (savedMark === -1) {
            marksValue = 'X';
          } else if (savedMark === -2) {
            marksValue = 'N/A';
          } else if (savedMark >= 0) {
            marksValue = savedMark.toString();
          }
        }
      }
      
      const marksStr = marksValue.toString().trim();
      const isAbsent = marksStr.toLowerCase() === 'x';
      const isNA = marksStr === 'N/A' || marksStr === 'na';
      
      // Parse marks number if not absent, not NA, and not empty
      let marksNum: number | null = null;
      if (!isAbsent && !isNA && marksStr !== '') {
        marksNum = parseInt(marksStr);
        if (isNaN(marksNum)) marksNum = null;
      }
      
      const percentage = marksNum !== null && !isNaN(marksNum) ? ((marksNum / totalMarks) * 100).toFixed(0) : null;
      const { grade, color: gradeColor } = calculateGrade(isNA ? -2 : marksNum);

      // Draw row data
      currentPage.drawText(`${i + 1}`, {
        x: margin + 10,
        y: yPosition,
        size: 9,
        font: helveticaFont,
      });

      // Truncate long names
      const displayName = student.name.length > 28 ? student.name.substring(0, 25) + '...' : student.name;
      currentPage.drawText(displayName, {
        x: margin + 35,
        y: yPosition,
        size: 9,
        font: helveticaFont,
      });

      currentPage.drawText(student.studentId, {
        x: margin + 220,
        y: yPosition,
        size: 9,
        font: helveticaFont,
      });

      // IMPROVED: Marks display with better handling of different states
      if (isNotConducted) {
        // Entire test not conducted
        currentPage.drawText('N/A', {
          x: margin + 315,
          y: yPosition,
          size: 9,
          font: helveticaOblique,
          color: rgb(0.5, 0.5, 0.5),
        });
      } else if (isNA) {
        // Individual student marked as N/A
        currentPage.drawText('N/A', {
          x: margin + 315,
          y: yPosition,
          size: 9,
          font: helveticaOblique,
          color: rgb(0.5, 0.5, 0.5),
        });
      } else if (isAbsent) {
        // Student is absent
        currentPage.drawText('ABS', {
          x: margin + 315,
          y: yPosition,
          size: 9,
          font: helveticaOblique,
          color: rgb(0.7, 0.3, 0.3),
        });
      } else if (marksStr !== '') {
        // Student has a mark
        currentPage.drawText(marksStr, {
          x: margin + 315,
          y: yPosition,
          size: 9,
          font: helveticaFont,
        });
        
        // Optionally indicate if mark came from saved data
        if (isFromSaved) {
          currentPage.drawText('*', {
            x: margin + 310,
            y: yPosition,
            size: 9,
            font: helveticaBold,
            color: rgb(0, 0.5, 0),
          });
        }
      } else {
        // No mark entered - show dash
        currentPage.drawText('-', {
          x: margin + 315,
          y: yPosition,
          size: 9,
          font: helveticaFont,
          color: rgb(0.7, 0.7, 0.7),
        });
      }

      // Score
      let score = '-';
      if (isNotConducted || isNA) {
        score = 'N/A';
      } else if (marksNum !== null && !isNaN(marksNum)) {
        score = `${marksNum}/${totalMarks}`;
      }
      currentPage.drawText(score, {
        x: margin + 365,
        y: yPosition,
        size: 9,
        font: helveticaFont,
      });

      // Percentage
      let percentText = '-';
      if (isNotConducted || isNA) {
        percentText = 'N/A';
      } else if (percentage) {
        percentText = `${percentage}%`;
      }
      currentPage.drawText(percentText, {
        x: margin + 430,
        y: yPosition,
        size: 9,
        font: helveticaFont,
      });

      // Grade
      currentPage.drawText(grade, {
        x: margin + 475,
        y: yPosition,
        size: 9,
        font: helveticaBold,
        color: gradeColor,
      });

      yPosition -= 16;
    }

    // Summary section
    yPosition -= 10;
    
    // Draw summary box
    currentPage.drawRectangle({
      x: margin,
      y: yPosition - 30,
      width: contentWidth,
      height: 40,
      color: isNotConducted ? rgb(0.97, 0.97, 0.97) : rgb(0.95, 0.95, 0.95),
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 0.5,
    });

    // Summary text
    currentPage.drawText('SUMMARY STATISTICS', {
      x: margin + 10,
      y: yPosition - 10,
      size: 10,
      font: helveticaBold,
    });

    let summaryItems: string[];
    if (isNotConducted) {
      summaryItems = [
        `Total Students: ${students.length}`,
        `Status: NOT CONDUCTED`,
        `-`,
        `-`,
        `-`,
      ];
    } else {
      summaryItems = [
        `Total Students: ${students.length}`,
        `Marks Entered: ${enteredCount}`,
        `Absent: ${absentCount}`,
        `N/A: ${notConductedCount}`,
        `Pending: ${students.length - enteredCount - absentCount - notConductedCount}`,
        `Average: ${averageMark}`,
      ];
    }

    summaryItems.forEach((item, index) => {
      if (item !== '-') {
        currentPage.drawText(item, {
          x: margin + 10 + (index * 85),
          y: yPosition - 22,
          size: 8,
          font: helveticaFont,
        });
      }
    });

    // Add a legend if we used saved marks
    if (!isNotConducted && savedMarksMap.size > 0) {
      currentPage.drawText('* Mark loaded from saved data', {
        x: margin + 10,
        y: yPosition - 45,
        size: 7,
        font: helveticaOblique,
        color: rgb(0, 0.5, 0),
      });
    }

    // FIXED: Term summary page with proper data mapping
    if (allExamData && (allExamData.week4?.length || allExamData.week8?.length || allExamData.endOfTerm?.length) && !isNotConducted) {
      console.log('📊 Adding term summary page with all exam data:', {
        week4Count: allExamData.week4?.length,
        week8Count: allExamData.week8?.length,
        endOfTermCount: allExamData.endOfTerm?.length
      });
      
      const summaryPage = pdfDoc.addPage([pageWidth, pageHeight]);
      addHeader(summaryPage, pdfDoc.getPageCount());
      
      let summaryY = pageHeight - margin - 40;

      // Title for term summary
      const termTitle = 'TERM PERFORMANCE SUMMARY';
      summaryPage.drawText(termTitle, {
        x: centerText(termTitle, 14),
        y: summaryY,
        size: 14,
        font: helveticaBold,
        color: rgb(0, 0.2, 0.4),
      });

      summaryY -= 30;

      // Table headers for term summary
      const termHeaders = [
        { text: '#', x: margin + 5, width: 25 },
        { text: 'Student Name', x: margin + 35, width: 170 },
        { text: 'Student ID', x: margin + 210, width: 85 },
        { text: 'Week 4', x: margin + 300, width: 40 },
        { text: 'Week 8', x: margin + 345, width: 40 },
        { text: 'End Term', x: margin + 390, width: 40 },
        { text: 'Average', x: margin + 435, width: 45 },
        { text: 'Grade', x: margin + 485, width: 35 }
      ];

      // Draw header background
      summaryPage.drawRectangle({
        x: margin,
        y: summaryY - 5,
        width: contentWidth,
        height: 20,
        color: rgb(0.3, 0.5, 0.7),
      });

      termHeaders.forEach(header => {
        summaryPage.drawText(header.text, {
          x: header.x,
          y: summaryY,
          size: 8,
          font: helveticaBold,
          color: rgb(1, 1, 1),
        });
      });

      summaryY -= 18;

      // FIXED: Create comprehensive maps of marks by student
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

      // Display each student's term performance
      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        
        if (summaryY < margin + 60) {
          // Add a note about truncation
          summaryPage.drawText('... more students (truncated for space)', {
            x: margin + 35,
            y: summaryY,
            size: 8,
            font: helveticaOblique,
            color: rgb(0.5, 0.5, 0.5),
          });
          break;
        }

        // FIXED: Try to find marks by various identifiers
        const week4Mark = week4Map.get(student.studentId);
        const week8Mark = week8Map.get(student.studentId);
        const eotMark = eotMap.get(student.studentId);
        
        // Calculate average of valid marks (not absent, not N/A, and not undefined)
        const validMarks = [
          week4Mark !== undefined && week4Mark !== -1 && week4Mark !== -2 ? week4Mark : null,
          week8Mark !== undefined && week8Mark !== -1 && week8Mark !== -2 ? week8Mark : null,
          eotMark !== undefined && eotMark !== -1 && eotMark !== -2 ? eotMark : null
        ].filter((m): m is number => m !== null);
        
        const avg = validMarks.length > 0 
          ? (validMarks.reduce((a, b) => a + b, 0) / validMarks.length).toFixed(1)
          : '-';
        
        // Calculate overall grade based on average
        const avgNum = avg !== '-' ? parseFloat(avg) : null;
        const avgGrade = avgNum !== null ? calculateGrade(avgNum).grade : '-';
        const avgGradeColor = avgNum !== null ? calculateGrade(avgNum).color : rgb(0.5, 0.5, 0.5);

        // Alternate row background
        if (i % 2 === 0) {
          summaryPage.drawRectangle({
            x: margin,
            y: summaryY - 3,
            width: contentWidth,
            height: 15,
            color: rgb(0.97, 0.97, 0.97),
          });
        }

        summaryPage.drawText(`${i + 1}`, { x: margin + 10, y: summaryY, size: 8, font: helveticaFont });
        
        const displayName = student.name.length > 25 ? student.name.substring(0, 22) + '...' : student.name;
        summaryPage.drawText(displayName, { x: margin + 35, y: summaryY, size: 8, font: helveticaFont });
        summaryPage.drawText(student.studentId, { x: margin + 210, y: summaryY, size: 8, font: helveticaFont });
        
        // Draw marks with appropriate styling
        const drawMark = (mark: number | undefined, x: number) => {
          if (mark === undefined) {
            summaryPage.drawText('-', { x, y: summaryY, size: 8, font: helveticaFont, color: rgb(0.7, 0.7, 0.7) });
          } else if (mark === -1) {
            summaryPage.drawText('ABS', { x, y: summaryY, size: 8, font: helveticaOblique, color: rgb(0.7, 0.3, 0.3) });
          } else if (mark === -2) {
            summaryPage.drawText('N/A', { x, y: summaryY, size: 8, font: helveticaOblique, color: rgb(0.5, 0.5, 0.5) });
          } else {
            summaryPage.drawText(mark.toString(), { x, y: summaryY, size: 8, font: helveticaFont });
          }
        };

        drawMark(week4Mark, margin + 300);
        drawMark(week8Mark, margin + 345);
        drawMark(eotMark, margin + 390);
        
        summaryPage.drawText(avg.toString(), { x: margin + 440, y: summaryY, size: 8, font: helveticaBold });
        summaryPage.drawText(avgGrade, { x: margin + 495, y: summaryY, size: 8, font: helveticaBold, color: avgGradeColor });

        summaryY -= 15;
      }
    }

    // Footer on all pages
    for (let i = 0; i < pdfDoc.getPageCount(); i++) {
      const page = pdfDoc.getPage(i);
      
      // Generation info
      page.drawText(`Generated on ${new Date().toLocaleString()}`, {
        x: margin,
        y: margin - 15,
        size: 7,
        font: helveticaFont,
        color: rgb(0.6, 0.6, 0.6),
      });

      // Teacher signature line
      page.drawText('Teacher\'s Signature: _________________________', {
        x: pageWidth - margin - 200,
        y: margin - 15,
        size: 8,
        font: helveticaFont,
      });
    }

    // Save PDF
    const pdfBytes = await pdfDoc.save();
    
    console.log('✅ PDF generated successfully, size:', pdfBytes.length, 'bytes');
    
    // Create blob and download
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Generate filename with actual data
    const status = isNotConducted ? '_NOT_CONDUCTED' : '';
    const fileName = `${schoolName.replace(/\s+/g, '_')}_${className.replace(/\s+/g, '_')}_${subject.replace(/\s+/g, '_')}_${examType}${status}_${term.replace(/\s+/g, '_')}_${year}.pdf`;
    
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

  } catch (error) {
    console.error('❌ Error generating PDF:', error);
    throw error;
  }
};