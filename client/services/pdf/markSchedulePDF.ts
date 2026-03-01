// @/services/pdf/markSchedulePDF.ts
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

interface MarkScheduleOptions {
  className: string;
  subject: string;
  examType: string;
  term: string;
  year: number;
  totalMarks: number;
  students: Array<{
    name: string;
    studentId: string;
    marks: string;
  }>;
  teacherName: string;
  schoolName: string;
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
  schoolName
}: MarkScheduleOptions): Promise<void> => {
  try {
    const pdfDoc = await PDFDocument.create();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    
    let yPosition = height - 50;
    const margin = 50;
    const lineHeight = 20;

    // Header
    page.drawText(schoolName, {
      x: margin,
      y: yPosition,
      size: 18,
      font: helveticaBold,
      color: rgb(0, 0.2, 0.6),
    });
    yPosition -= lineHeight * 1.5;

    page.drawText('MARK SCHEDULE', {
      x: margin,
      y: yPosition,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    yPosition -= lineHeight * 2;

    // Info Grid
    const infoItems = [
      { label: 'Class:', value: className },
      { label: 'Subject:', value: subject },
      { label: 'Exam:', value: examType },
      { label: 'Term/Year:', value: `${term} ${year}` },
      { label: 'Total Marks:', value: totalMarks.toString() },
      { label: 'Teacher:', value: teacherName },
      { label: 'Date:', value: new Date().toLocaleDateString() },
    ];

    infoItems.forEach(item => {
      page.drawText(item.label, {
        x: margin,
        y: yPosition,
        size: 10,
        font: helveticaBold,
        color: rgb(0.3, 0.3, 0.3),
      });
      page.drawText(item.value, {
        x: margin + 80,
        y: yPosition,
        size: 10,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
      yPosition -= lineHeight - 5;
    });

    yPosition -= lineHeight;

    // Table Headers
    page.drawLine({
      start: { x: margin, y: yPosition + 5 },
      end: { x: width - margin, y: yPosition + 5 },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });

    page.drawText('#', { x: margin, y: yPosition, size: 10, font: helveticaBold });
    page.drawText('Student Name', { x: margin + 30, y: yPosition, size: 10, font: helveticaBold });
    page.drawText('Student ID', { x: margin + 250, y: yPosition, size: 10, font: helveticaBold });
    page.drawText('Marks', { x: margin + 400, y: yPosition, size: 10, font: helveticaBold });
    page.drawText('Grade', { x: margin + 480, y: yPosition, size: 10, font: helveticaBold });

    yPosition -= lineHeight;

    // Calculate grade function
    const calculateGrade = (marksNum: number | null, totalMarks: number): number | null => {
      if (marksNum === null) return null;
      if (marksNum === -1) return -1;
      const percentage = (marksNum / totalMarks) * 100;
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

    // Table Rows
    students.forEach((student, index) => {
      if (yPosition < 100) {
        // Add new page
        page.drawText('Continued...', { x: margin, y: 50, size: 10, font: helveticaFont });
        // In a real implementation, you'd add a new page here
        return;
      }

      const marks = student.marks;
      const isAbsent = marks.toLowerCase() === 'x';
      const marksNum = marks && !isAbsent ? parseInt(marks) : null;
      const grade = marksNum !== null ? calculateGrade(marksNum, totalMarks) : null;

      page.drawText(`${index + 1}`, { x: margin, y: yPosition, size: 9, font: helveticaFont });
      
      const name = student.name.length > 30 ? student.name.substring(0, 27) + '...' : student.name;
      page.drawText(name, { x: margin + 30, y: yPosition, size: 9, font: helveticaFont });
      
      page.drawText(student.studentId, { x: margin + 250, y: yPosition, size: 9, font: helveticaFont });
      
      if (marks) {
        const marksText = isAbsent ? 'ABS' : marks;
        page.drawText(marksText, { x: margin + 400, y: yPosition, size: 9, font: helveticaFont });
      } else {
        page.drawText('—', { x: margin + 400, y: yPosition, size: 9, font: helveticaFont });
      }
      
      if (grade !== null) {
        const gradeText = grade === -1 ? 'X' : grade.toString();
        page.drawText(gradeText, { x: margin + 480, y: yPosition, size: 9, font: helveticaFont });
      } else {
        page.drawText('—', { x: margin + 480, y: yPosition, size: 9, font: helveticaFont });
      }

      yPosition -= lineHeight - 5;
    });

    // Footer
    const enteredCount = students.filter(s => s.marks && s.marks !== '').length;
    page.drawText(`Total Students: ${students.length} | Entered: ${enteredCount} | Pending: ${students.length - enteredCount}`, {
      x: margin,
      y: 50,
      size: 9,
      font: helveticaFont,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Save PDF
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `marks-${className}-${subject}-${examType}-${term}-${year}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};