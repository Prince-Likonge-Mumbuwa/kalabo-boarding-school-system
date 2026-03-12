// @/services/pdf/teacherListPDF.ts - COMPLETE FIXED VERSION
import { PDFDocument, rgb, StandardFonts, PDFImage } from 'pdf-lib';

interface Teacher {
  id: string;
  name: string;
  email: string;
  phone?: string;
  department?: string;
  subjects?: string[];
  status?: string;
  isFormTeacher?: boolean;
  nrc?: string;
  tsNumber?: string;
  employeeNumber?: string;
  dateOfBirth?: string;
  dateOfFirstAppointment?: string;
  dateOfCurrentAppointment?: string;
}

interface TeacherAssignment {
  classId: string;
  className?: string;
  subject: string;
  isFormTeacher: boolean;
}

interface TeacherListPDFOptions {
  teachers: Teacher[];
  classes: Array<{ id: string; name: string }>;
  teacherAssignments: Record<string, TeacherAssignment[]>;
  filterInfo?: string;
  schoolName?: string;
  schoolAddress?: string;
}

/**
 * Helper function to embed school logo with better error handling
 */
const embedSchoolLogo = async (pdfDoc: PDFDocument): Promise<PDFImage | null> => {
  try {
    // Try multiple possible paths to ensure logo is found
    const paths = [
      '/images/school-logo.png',
      '/public/images/school-logo.png',
      '/assets/images/school-logo.png',
      '/school-logo.png'
    ];
    
    for (const path of paths) {
      try {
        const response = await fetch(path);
        if (response.ok) {
          const logoImageBytes = await response.arrayBuffer();
          
          // Try to embed as PNG first
          try {
            return await pdfDoc.embedPng(logoImageBytes);
          } catch {
            // Fall back to JPG
            try {
              return await pdfDoc.embedJpg(logoImageBytes);
            } catch {
              console.warn(`Logo at ${path} is not a supported format`);
              continue;
            }
          }
        }
      } catch {
        continue; // Try next path
      }
    }
    
    console.warn('Logo image not found. Continuing without logo.');
    return null;
  } catch (error) {
    console.warn('Could not load logo image:', error);
    return null;
  }
};

/**
 * Helper function to format date
 */
const formatDate = (dateString?: string): string => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString; // Return original if invalid
    
    return date.toLocaleDateString('en-ZM', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  } catch {
    return dateString;
  }
};

/**
 * Generate a PDF teacher list with assignment information
 */
export const generateTeacherListPDF = async ({
  teachers,
  classes,
  teacherAssignments,
  filterInfo,
  schoolName = 'KALABO BOARDING SECONDARY SCHOOL',
  schoolAddress = 'P.O BOX 930096'
}: TeacherListPDFOptions): Promise<Uint8Array> => {
  try {
    const pdfDoc = await PDFDocument.create();
    
    // Define page size as a tuple [width, height] to satisfy TypeScript
    const pageSize: [number, number] = [841.89, 595.28]; // A4 Landscape
    const width = pageSize[0];
    const height = pageSize[1];
    
    // Embed fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Embed logo (with error handling)
    let logoImage: PDFImage | null = null;
    try {
      logoImage = await embedSchoolLogo(pdfDoc);
    } catch (error) {
      console.warn('Logo embedding failed, continuing without logo:', error);
    }
    
    let page = pdfDoc.addPage(pageSize);
    let yPosition = height - 50;
    const margin = 40;
    const contentWidth = width - (margin * 2);

    // Helper function to calculate centered X position
    const centerText = (text: string, fontSize: number) => {
      const textWidth = boldFont.widthOfTextAtSize(text, fontSize);
      return (width - textWidth) / 2;
    };

    // Helper function to add header to page
    const addHeader = (page: any, pageNum: number, isContinued: boolean = false) => {
      try {
        let headerY = height - margin;

        if (logoImage) {
          try {
            // Scale logo appropriately
            const logoDims = logoImage.scale(0.1);
            const logoX = (width - logoDims.width) / 2;
            
            // Draw logo centered at top
            page.drawImage(logoImage, {
              x: logoX,
              y: headerY - logoDims.height,
              width: logoDims.width,
              height: logoDims.height,
            });
            
            headerY -= logoDims.height + 10;
          } catch (error) {
            console.warn('Error drawing logo:', error);
            // Continue without logo
          }
        }
        
        // School name
        page.drawText(schoolName, {
          x: centerText(schoolName, 16),
          y: headerY,
          size: 16,
          font: boldFont,
          color: rgb(0, 0.2, 0.4),
        });
        headerY -= 18;
        
        // Ministry of Education
        const ministryText = 'MINISTRY OF EDUCATION';
        page.drawText(ministryText, {
          x: centerText(ministryText, 11),
          y: headerY,
          size: 11,
          font: boldFont,
          color: rgb(0.3, 0.3, 0.3),
        });
        headerY -= 22;

        // Title
        const title = isContinued ? 'TEACHERS MASTER LIST (Continued)' : 'TEACHERS MASTER LIST';
        page.drawText(title, {
          x: centerText(title, 15),
          y: headerY,
          size: 15,
          font: boldFont,
          color: rgb(0, 0, 0),
        });
        headerY -= 22;

        // Filter info if provided
        if (filterInfo) {
          page.drawText(`Filter: ${filterInfo}`, {
            x: margin,
            y: headerY,
            size: 9,
            font,
            color: rgb(0.4, 0.4, 0.4),
          });
          headerY -= 14;
        }

        // Generation date
        const date = new Date().toLocaleDateString('en-ZM', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        page.drawText(`Generated on: ${date}`, {
          x: margin,
          y: headerY,
          size: 8,
          font,
          color: rgb(0.4, 0.4, 0.4),
        });
        headerY -= 16;

        // Total count
        page.drawText(`Total Teachers: ${teachers.length}`, {
          x: margin,
          y: headerY,
          size: 11,
          font: boldFont,
          color: rgb(0, 0, 0.6),
        });

        return headerY - 15;
      } catch (error) {
        console.error('Error in addHeader:', error);
        // Return a safe fallback Y position
        return height - 150;
      }
    };

    // Add header to first page with error handling
    try {
      yPosition = addHeader(page, 1);
    } catch (error) {
      console.error('Error adding header to first page:', error);
      yPosition = height - 100; // Fallback position
    }

    // Define table column widths for teacher details
    const tableColumns = [
      { header: '#', width: 20 },
      { header: 'Name', width: 100 },
      { header: 'Status', width: 45 },
      { header: 'NRC', width: 75 },
      { header: 'TS #', width: 50 },
      { header: 'Emp #', width: 55 },
      { header: 'Dept', width: 50 },
      { header: 'DOB', width: 65 },
      { header: '1st Appt', width: 65 },
      { header: 'Curr Appt', width: 65 },
      { header: 'Email', width: 110 },
      { header: 'Phone', width: 70 },
    ];

    // Calculate starting X positions for each column
    const colPositions: number[] = [];
    let currentX = margin;
    tableColumns.forEach(col => {
      colPositions.push(currentX);
      currentX += col.width;
    });

    // Draw table headers
    const drawTableHeaders = (y: number) => {
      try {
        // Header background
        page.drawRectangle({
          x: margin,
          y: y - 3,
          width: contentWidth,
          height: 18,
          color: rgb(0.2, 0.4, 0.6),
        });

        // Draw each header
        tableColumns.forEach((col, index) => {
          page.drawText(col.header, {
            x: colPositions[index] + 2,
            y: y + 2,
            size: 8,
            font: boldFont,
            color: rgb(1, 1, 1),
          });
        });

        return y - 18;
      } catch (error) {
        console.error('Error drawing table headers:', error);
        return y - 20; // Return a safe fallback
      }
    };

    // Draw table headers with error handling
    try {
      yPosition = drawTableHeaders(yPosition);
      yPosition -= 5;
    } catch (error) {
      console.error('Error drawing initial table headers:', error);
      yPosition -= 30; // Fallback
    }

    // Function to draw teacher details in table format
    const drawTeacherTableRow = (teacher: Teacher, index: number, y: number) => {
      try {
        // Alternate row background
        if (index % 2 === 0) {
          page.drawRectangle({
            x: margin,
            y: y - 3,
            width: contentWidth,
            height: 16,
            color: rgb(0.97, 0.97, 0.97),
          });
        }

        // Row number
        page.drawText(`${index + 1}`, {
          x: colPositions[0] + 2,
          y: y,
          size: 8,
          font,
        });

        // Name (truncate if needed)
        const name = teacher.name.length > 18 ? teacher.name.substring(0, 15) + '...' : teacher.name;
        page.drawText(name, {
          x: colPositions[1] + 2,
          y: y,
          size: 8,
          font: boldFont,
        });

        // Status with color
        const status = teacher.status || 'active';
        const statusColor = status === 'active' ? rgb(0, 0.6, 0) : 
                           status === 'inactive' ? rgb(0.5, 0.5, 0.5) :
                           status === 'on_leave' ? rgb(0.8, 0.6, 0) : rgb(0, 0.4, 0.8);
        const statusDisplay = status === 'on_leave' ? 'Leave' : 
                             status === 'transferred' ? 'Trans' : 
                             status.charAt(0).toUpperCase() + status.slice(1, 3);
        page.drawText(statusDisplay, {
          x: colPositions[2] + 2,
          y: y,
          size: 8,
          font,
          color: statusColor,
        });

        // NRC
        const nrc = teacher.nrc || '-';
        const nrcDisplay = nrc.length > 12 ? nrc.substring(0, 9) + '...' : nrc;
        page.drawText(nrcDisplay, {
          x: colPositions[3] + 2,
          y: y,
          size: 8,
          font,
        });

        // TS Number
        const tsNumber = teacher.tsNumber || '-';
        const tsDisplay = tsNumber.length > 8 ? tsNumber.substring(0, 5) + '...' : tsNumber;
        page.drawText(tsDisplay, {
          x: colPositions[4] + 2,
          y: y,
          size: 8,
          font,
        });

        // Employee Number
        const empNumber = teacher.employeeNumber || '-';
        const empDisplay = empNumber.length > 8 ? empNumber.substring(0, 5) + '...' : empNumber;
        page.drawText(empDisplay, {
          x: colPositions[5] + 2,
          y: y,
          size: 8,
          font,
        });

        // Department
        const dept = teacher.department || '-';
        const deptDisplay = dept.length > 6 ? dept.substring(0, 4) + '...' : dept;
        page.drawText(deptDisplay, {
          x: colPositions[6] + 2,
          y: y,
          size: 8,
          font,
        });

        // Date of Birth
        const dob = formatDate(teacher.dateOfBirth);
        page.drawText(dob, {
          x: colPositions[7] + 2,
          y: y,
          size: 8,
          font,
        });

        // First Appointment
        const firstAppt = formatDate(teacher.dateOfFirstAppointment);
        page.drawText(firstAppt, {
          x: colPositions[8] + 2,
          y: y,
          size: 8,
          font,
        });

        // Current Appointment
        const currAppt = formatDate(teacher.dateOfCurrentAppointment);
        page.drawText(currAppt, {
          x: colPositions[9] + 2,
          y: y,
          size: 8,
          font,
        });

        // Email (truncate)
        const email = teacher.email || '-';
        const emailDisplay = email.length > 18 ? email.substring(0, 15) + '...' : email;
        page.drawText(emailDisplay, {
          x: colPositions[10] + 2,
          y: y,
          size: 8,
          font,
        });

        // Phone
        const phone = teacher.phone || '-';
        page.drawText(phone, {
          x: colPositions[11] + 2,
          y: y,
          size: 8,
          font,
        });

        return y - 15;
      } catch (error) {
        console.error(`Error drawing row for teacher ${teacher.name}:`, error);
        return y - 15; // Return fallback position
      }
    };

    // Loop through each teacher
    for (let i = 0; i < teachers.length; i++) {
      const teacher = teachers[i];
      
      try {
        // Check if we need a new page before drawing the table row
        if (yPosition < 120) {
          page = pdfDoc.addPage(pageSize);
          yPosition = addHeader(page, pdfDoc.getPageCount(), true);
          yPosition = drawTableHeaders(yPosition);
          yPosition -= 5;
        }

        // Draw teacher table row
        yPosition = drawTeacherTableRow(teacher, i, yPosition);
        yPosition -= 2;

        // Draw subjects if any (below the table row)
        if (teacher.subjects && teacher.subjects.length > 0) {
          const subjectsText = teacher.subjects.join(', ');
          
          if (yPosition < 80) {
            page = pdfDoc.addPage(pageSize);
            yPosition = addHeader(page, pdfDoc.getPageCount(), true);
            yPosition = drawTableHeaders(yPosition);
            yPosition -= 5;
          }
          
          page.drawText(`  Subjects: ${subjectsText}`, {
            x: margin + 10,
            y: yPosition,
            size: 7,
            font,
            color: rgb(0.3, 0.3, 0.6),
          });
          yPosition -= 12;
        }

        // Draw current assignments if any
        const teacherAssignmentData = teacherAssignments[teacher.id] || [];
        if (teacherAssignmentData.length > 0) {
          // Group assignments by class
          const classMap = new Map();
          teacherAssignmentData.forEach((assignment: any) => {
            if (!classMap.has(assignment.classId)) {
              const className = classes.find(c => c.id === assignment.classId)?.name || 'Unknown Class';
              classMap.set(assignment.classId, {
                className,
                subjects: [],
                isFormTeacher: false
              });
            }
            const classData = classMap.get(assignment.classId);
            if (assignment.subject && assignment.subject !== 'Form Teacher') {
              classData.subjects.push(assignment.subject);
            }
            if (assignment.isFormTeacher) {
              classData.isFormTeacher = true;
            }
          });

          // Display assignments
          for (const [classId, classData] of classMap) {
            if (yPosition < 70) {
              page = pdfDoc.addPage(pageSize);
              yPosition = addHeader(page, pdfDoc.getPageCount(), true);
              yPosition = drawTableHeaders(yPosition);
              yPosition -= 5;
            }
            
            // Class name with form teacher indicator
            const className = `${classData.className} ${classData.isFormTeacher ? '★' : ''}`;
            page.drawText(`  ▸ ${className}`, {
              x: margin + 20,
              y: yPosition,
              size: 8,
              font: classData.isFormTeacher ? boldFont : font,
              color: classData.isFormTeacher ? rgb(0.6, 0.2, 0.8) : rgb(0, 0, 0.3),
            });
            yPosition -= 11;
            
            // Subjects for this class
            if (classData.subjects.length > 0) {
              const subjectsLine = classData.subjects.join(' • ');
              
              if (yPosition < 70) {
                page = pdfDoc.addPage(pageSize);
                yPosition = addHeader(page, pdfDoc.getPageCount(), true);
                yPosition = drawTableHeaders(yPosition);
                yPosition -= 5;
              }
              
              page.drawText(`    - ${subjectsLine}`, {
                x: margin + 30,
                y: yPosition,
                size: 7,
                font,
                color: rgb(0.4, 0.4, 0.4),
              });
              yPosition -= 11;
            }
          }
        }

        // Add spacing between teachers
        yPosition -= 5;
      } catch (error) {
        console.error(`Error processing teacher ${teacher.name}:`, error);
        // Continue with next teacher
        yPosition -= 20; // Ensure we move down to avoid infinite loop
      }
    }

    // Add page numbers and footer to all pages
    const pageCount = pdfDoc.getPageCount();
    for (let i = 0; i < pageCount; i++) {
      try {
        const currentPage = pdfDoc.getPage(i);
        currentPage.drawText(`Page ${i + 1} of ${pageCount}`, {
          x: width - 100,
          y: 20,
          size: 8,
          font,
          color: rgb(0.5, 0.5, 0.5),
        });
        
        // Add generation timestamp to footer
        currentPage.drawText(`Generated: ${new Date().toLocaleDateString()}`, {
          x: margin,
          y: 20,
          size: 8,
          font,
          color: rgb(0.5, 0.5, 0.5),
        });
      } catch (error) {
        console.error(`Error adding footer to page ${i + 1}:`, error);
      }
    }
    
    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    
    // Verify we have valid bytes
    if (!pdfBytes || pdfBytes.length === 0) {
      throw new Error('Generated PDF is empty');
    }
    
    return pdfBytes;
    
  } catch (error) {
    console.error('Error generating teacher list PDF:', error);
    // Re-throw with more context
    throw new Error(`Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};