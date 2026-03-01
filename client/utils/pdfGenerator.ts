// @/utils/pdfGenerator.ts
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Learner } from '@/types/school';

interface PDFGenerationOptions {
  classId: string;
  className: string;
  learners: Learner[];
  format: 'simple' | 'detailed' | 'summary';
  includeStats: boolean;
  schoolName: string;
  academicYear: string;
}

/**
 * Generate a PDF class list with learner information
 */
export const generateClassListPDF = async ({
  classId,
  className,
  learners,
  format,
  includeStats,
  schoolName,
  academicYear
}: PDFGenerationOptions): Promise<void> => {
  try {
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Embed fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Add a page
    let page = pdfDoc.addPage([595.28, 841.89]); // A4 size
    const { width, height } = page.getSize();
    
    let yPosition = height - 50;
    const margin = 50;
    const lineHeight = 20;
    
    // Helper function to add new page when needed
    const checkAndAddPage = () => {
      if (yPosition < 100) {
        page = pdfDoc.addPage([595.28, 841.89]);
        yPosition = height - 50;
        
        // Add header to new page
        page.drawText(`${schoolName} - ${className} (Continued)`, {
          x: margin,
          y: yPosition,
          size: 12,
          font: helveticaBold,
          color: rgb(0, 0, 0.5),
        });
        yPosition -= lineHeight * 2;
      }
    };

    // ===== HEADER =====
    // School name
    page.drawText(schoolName, {
      x: margin,
      y: yPosition,
      size: 24,
      font: helveticaBold,
      color: rgb(0, 0.2, 0.6),
    });
    yPosition -= lineHeight * 1.5;

    // Document title
    page.drawText(`${className} - Class List`, {
      x: margin,
      y: yPosition,
      size: 18,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    yPosition -= lineHeight;

    // Academic year
    page.drawText(`Academic Year: ${academicYear}`, {
      x: margin,
      y: yPosition,
      size: 12,
      font: helveticaFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    yPosition -= lineHeight;

    // Generation date
    const generationDate = new Date().toLocaleDateString('en-ZM', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    page.drawText(`Generated on: ${generationDate}`, {
      x: margin,
      y: yPosition,
      size: 10,
      font: helveticaFont,
      color: rgb(0.5, 0.5, 0.5),
    });
    yPosition -= lineHeight * 2;

    // ===== STATISTICS SECTION (if requested) =====
    if (includeStats) {
      // Draw stats box
      page.drawRectangle({
        x: margin,
        y: yPosition - 60,
        width: width - (margin * 2),
        height: 70,
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 1,
      });

      page.drawText('CLASS STATISTICS', {
        x: margin + 10,
        y: yPosition - 5,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });

      // Calculate statistics
      const totalLearners = learners.length;
      const boys = learners.filter(l => l.gender === 'male').length;
      const girls = learners.filter(l => l.gender === 'female').length;
      
      // Count by sponsor (if data available)
      const sponsorMap = new Map<string, number>();
      learners.forEach(learner => {
        if (learner.sponsor) {
          const count = sponsorMap.get(learner.sponsor) || 0;
          sponsorMap.set(learner.sponsor, count + 1);
        }
      });

      page.drawText(`Total Learners: ${totalLearners}`, {
        x: margin + 20,
        y: yPosition - 25,
        size: 11,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });

      page.drawText(`Boys: ${boys} (${totalLearners > 0 ? Math.round((boys/totalLearners)*100) : 0}%)`, {
        x: margin + 200,
        y: yPosition - 25,
        size: 11,
        font: helveticaFont,
        color: rgb(0, 0, 0.6),
      });

      page.drawText(`Girls: ${girls} (${totalLearners > 0 ? Math.round((girls/totalLearners)*100) : 0}%)`, {
        x: margin + 350,
        y: yPosition - 25,
        size: 11,
        font: helveticaFont,
        color: rgb(0.6, 0, 0.6),
      });

      // Sponsorship breakdown
      let sponsorY = yPosition - 45;
      Array.from(sponsorMap.entries()).forEach(([sponsor, count]) => {
        page.drawText(`${sponsor}: ${count}`, {
          x: margin + 20,
          y: sponsorY,
          size: 10,
          font: helveticaFont,
          color: rgb(0.3, 0.3, 0.3),
        });
        sponsorY -= 15;
      });

      yPosition -= 80;
    }

    // ===== LEARNERS LIST =====
    yPosition -= lineHeight;

    // Table headers based on format
    if (format === 'simple') {
      // Simple format headers
      page.drawLine({
        start: { x: margin, y: yPosition + 5 },
        end: { x: width - margin, y: yPosition + 5 },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
      });

      page.drawText('#', { x: margin, y: yPosition, size: 11, font: helveticaBold });
      page.drawText('Student ID', { x: margin + 40, y: yPosition, size: 11, font: helveticaBold });
      page.drawText('Full Name', { x: margin + 150, y: yPosition, size: 11, font: helveticaBold });
      page.drawText('Gender', { x: margin + 350, y: yPosition, size: 11, font: helveticaBold });
      page.drawText('Guardian', { x: margin + 420, y: yPosition, size: 11, font: helveticaBold });

      yPosition -= lineHeight;

      // Sort learners by name or student ID
      const sortedLearners = [...learners].sort((a, b) => 
        (a.studentId || '').localeCompare(b.studentId || '')
      );

      // Draw learners
      sortedLearners.forEach((learner, index) => {
        checkAndAddPage();

        page.drawText(`${index + 1}`, { x: margin, y: yPosition, size: 10, font: helveticaFont });
        page.drawText(learner.studentId || 'N/A', { x: margin + 40, y: yPosition, size: 10, font: helveticaFont });
        
        // Truncate name if too long
        const fullName = learner.fullName || learner.name || 'N/A';
        const displayName = fullName.length > 25 ? fullName.substring(0, 22) + '...' : fullName;
        page.drawText(displayName, { x: margin + 150, y: yPosition, size: 10, font: helveticaFont });
        
        // Gender with color
        const genderColor = learner.gender === 'male' ? rgb(0, 0, 0.6) : rgb(0.6, 0, 0.6);
        page.drawText(learner.gender || 'N/A', { 
          x: margin + 350, 
          y: yPosition, 
          size: 10, 
          font: helveticaFont,
          color: genderColor 
        });
        
        const guardian = learner.guardian || 'N/A';
        const displayGuardian = guardian.length > 20 ? guardian.substring(0, 17) + '...' : guardian;
        page.drawText(displayGuardian, { x: margin + 420, y: yPosition, size: 10, font: helveticaFont });

        yPosition -= lineHeight;
      });

    } else if (format === 'detailed') {
      // Detailed format headers
      page.drawLine({
        start: { x: margin, y: yPosition + 5 },
        end: { x: width - margin, y: yPosition + 5 },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
      });

      page.drawText('#', { x: margin, y: yPosition, size: 11, font: helveticaBold });
      page.drawText('Student ID', { x: margin + 30, y: yPosition, size: 11, font: helveticaBold });
      page.drawText('Full Name', { x: margin + 130, y: yPosition, size: 11, font: helveticaBold });
      page.drawText('Gender', { x: margin + 260, y: yPosition, size: 11, font: helveticaBold });
      page.drawText('Birth Year', { x: margin + 320, y: yPosition, size: 11, font: helveticaBold });
      page.drawText('Guardian', { x: margin + 390, y: yPosition, size: 11, font: helveticaBold });
      page.drawText('Phone', { x: margin + 490, y: yPosition, size: 11, font: helveticaBold });

      yPosition -= lineHeight;

      // Sort learners
      const sortedLearners = [...learners].sort((a, b) => 
        (a.studentId || '').localeCompare(b.studentId || '')
      );

      // Draw learners with detailed info
      sortedLearners.forEach((learner, index) => {
        checkAndAddPage();

        page.drawText(`${index + 1}`, { x: margin, y: yPosition, size: 9, font: helveticaFont });
        page.drawText(learner.studentId || 'N/A', { x: margin + 30, y: yPosition, size: 9, font: helveticaFont });
        
        const fullName = learner.fullName || learner.name || 'N/A';
        const displayName = fullName.length > 20 ? fullName.substring(0, 17) + '...' : fullName;
        page.drawText(displayName, { x: margin + 130, y: yPosition, size: 9, font: helveticaFont });
        
        const genderColor = learner.gender === 'male' ? rgb(0, 0, 0.6) : rgb(0.6, 0, 0.6);
        page.drawText(learner.gender || 'N/A', { 
          x: margin + 260, 
          y: yPosition, 
          size: 9, 
          font: helveticaFont,
          color: genderColor 
        });
        
        page.drawText(learner.birthYear?.toString() || 'N/A', { x: margin + 320, y: yPosition, size: 9, font: helveticaFont });
        
        const guardian = learner.guardian || 'N/A';
        const displayGuardian = guardian.length > 15 ? guardian.substring(0, 12) + '...' : guardian;
        page.drawText(displayGuardian, { x: margin + 390, y: yPosition, size: 9, font: helveticaFont });
        
        page.drawText(learner.guardianPhone || 'N/A', { x: margin + 490, y: yPosition, size: 9, font: helveticaFont });

        yPosition -= lineHeight;

        // Add address if available
        if (learner.address) {
          checkAndAddPage();
          page.drawText(`  Address: ${learner.address}`, {
            x: margin + 30,
            y: yPosition,
            size: 8,
            font: helveticaFont,
            color: rgb(0.4, 0.4, 0.4),
          });
          yPosition -= lineHeight - 5;
        }

        // Add sponsor if available
        if (learner.sponsor) {
          checkAndAddPage();
          page.drawText(`  Sponsor: ${learner.sponsor}`, {
            x: margin + 30,
            y: yPosition,
            size: 8,
            font: helveticaFont,
            color: rgb(0.4, 0.4, 0.4),
          });
          yPosition -= lineHeight - 5;
        }
      });

    } else if (format === 'summary') {
      // Summary format - just names and IDs
      page.drawLine({
        start: { x: margin, y: yPosition + 5 },
        end: { x: width - margin, y: yPosition + 5 },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
      });

      page.drawText('#', { x: margin, y: yPosition, size: 11, font: helveticaBold });
      page.drawText('Student ID', { x: margin + 40, y: yPosition, size: 11, font: helveticaBold });
      page.drawText('Full Name', { x: margin + 200, y: yPosition, size: 11, font: helveticaBold });

      yPosition -= lineHeight;

      // Sort learners
      const sortedLearners = [...learners].sort((a, b) => 
        (a.fullName || a.name || '').localeCompare(b.fullName || b.name || '')
      );

      // Draw learners
      sortedLearners.forEach((learner, index) => {
        checkAndAddPage();

        page.drawText(`${index + 1}`, { x: margin, y: yPosition, size: 10, font: helveticaFont });
        page.drawText(learner.studentId || 'N/A', { x: margin + 40, y: yPosition, size: 10, font: helveticaFont });
        
        const fullName = learner.fullName || learner.name || 'N/A';
        const displayName = fullName.length > 40 ? fullName.substring(0, 37) + '...' : fullName;
        page.drawText(displayName, { x: margin + 200, y: yPosition, size: 10, font: helveticaFont });

        yPosition -= lineHeight;
      });
    }

    // ===== FOOTER =====
    // Add page numbers
    const pageCount = pdfDoc.getPageCount();
    for (let i = 0; i < pageCount; i++) {
      const currentPage = pdfDoc.getPage(i);
      currentPage.drawText(`Page ${i + 1} of ${pageCount}`, {
        x: width - 100,
        y: 30,
        size: 10,
        font: helveticaFont,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    // Save the PDF - FIXED: Convert Uint8Array to Buffer or cast to any for Blob
    const pdfBytes = await pdfDoc.save();
    
    // Create download link - FIXED: Cast to any to avoid type issues
    const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${className}_Class_List_${new Date().toISOString().split('T')[0]}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};

/**
 * Generate individual learner report PDF
 */
export const generateLearnerReportPDF = async (
  learner: Learner,
  className: string,
  schoolName: string
): Promise<void> => {
  try {
    const pdfDoc = await PDFDocument.create();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    
    let yPosition = height - 50;
    const margin = 50;
    const lineHeight = 20;

    // Header
    page.drawText(schoolName, {
      x: margin,
      y: yPosition,
      size: 24,
      font: helveticaBold,
      color: rgb(0, 0.2, 0.6),
    });
    yPosition -= lineHeight * 2;

    // Learner name and ID
    const fullName = learner.fullName || learner.name || 'N/A';
    page.drawText(fullName, {
      x: margin,
      y: yPosition,
      size: 20,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    yPosition -= lineHeight;

    page.drawText(`Student ID: ${learner.studentId || 'N/A'}`, {
      x: margin,
      y: yPosition,
      size: 14,
      font: helveticaFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    yPosition -= lineHeight * 2;

    // Class information
    page.drawText(`Class: ${className}`, {
      x: margin,
      y: yPosition,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    yPosition -= lineHeight;

    // Personal Information
    page.drawText('PERSONAL INFORMATION', {
      x: margin,
      y: yPosition,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0.2, 0.6),
    });
    yPosition -= lineHeight;

    const personalInfo = [
      { label: 'Gender:', value: learner.gender || 'N/A' },
      { label: 'Birth Year:', value: learner.birthYear?.toString() || 'N/A' },
      { label: 'Age:', value: learner.age?.toString() || 'N/A' },
      { label: 'Address:', value: learner.address || 'N/A' },
    ];

    personalInfo.forEach(info => {
      page.drawText(info.label, {
        x: margin + 20,
        y: yPosition,
        size: 11,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      page.drawText(info.value, {
        x: margin + 150,
        y: yPosition,
        size: 11,
        font: helveticaFont,
        color: rgb(0.2, 0.2, 0.2),
      });
      yPosition -= lineHeight;
    });
    yPosition -= lineHeight;

    // Guardian Information
    page.drawText('GUARDIAN INFORMATION', {
      x: margin,
      y: yPosition,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0.2, 0.6),
    });
    yPosition -= lineHeight;

    const guardianInfo = [
      { label: 'Primary Guardian:', value: learner.guardian || 'N/A' },
      { label: 'Phone:', value: learner.guardianPhone || 'N/A' },
      { label: 'Alternative Guardian:', value: learner.alternativeGuardian || 'N/A' },
      { label: 'Alt. Phone:', value: learner.alternativeGuardianPhone || 'N/A' },
    ];

    guardianInfo.forEach(info => {
      page.drawText(info.label, {
        x: margin + 20,
        y: yPosition,
        size: 11,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      page.drawText(info.value, {
        x: margin + 180,
        y: yPosition,
        size: 11,
        font: helveticaFont,
        color: rgb(0.2, 0.2, 0.2),
      });
      yPosition -= lineHeight;
    });
    yPosition -= lineHeight;

    // Academic Information
    page.drawText('ACADEMIC INFORMATION', {
      x: margin,
      y: yPosition,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0.2, 0.6),
    });
    yPosition -= lineHeight;

    const academicInfo = [
      { label: 'Date of First Entry:', value: learner.dateOfFirstEntry || 'N/A' },
      { label: 'Enrollment Date:', value: learner.enrollmentDate?.toLocaleDateString() || 'N/A' },
      { label: 'Previous School:', value: learner.previousSchool || 'N/A' },
      { label: 'Sponsor:', value: learner.sponsor || 'N/A' },
    ];

    academicInfo.forEach(info => {
      page.drawText(info.label, {
        x: margin + 20,
        y: yPosition,
        size: 11,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      page.drawText(info.value, {
        x: margin + 180,
        y: yPosition,
        size: 11,
        font: helveticaFont,
        color: rgb(0.2, 0.2, 0.2),
      });
      yPosition -= lineHeight;
    });

    // Health Information (if available)
    if (learner.medicalNotes || learner.allergies?.length) {
      yPosition -= lineHeight;
      page.drawText('HEALTH INFORMATION', {
        x: margin,
        y: yPosition,
        size: 14,
        font: helveticaBold,
        color: rgb(0, 0.2, 0.6),
      });
      yPosition -= lineHeight;

      if (learner.medicalNotes) {
        page.drawText('Medical Notes:', {
          x: margin + 20,
          y: yPosition,
          size: 11,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });
        page.drawText(learner.medicalNotes, {
          x: margin + 150,
          y: yPosition,
          size: 11,
          font: helveticaFont,
          color: rgb(0.2, 0.2, 0.2),
        });
        yPosition -= lineHeight;
      }

      if (learner.allergies?.length) {
        page.drawText('Allergies:', {
          x: margin + 20,
          y: yPosition,
          size: 11,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });
        page.drawText(learner.allergies.join(', '), {
          x: margin + 150,
          y: yPosition,
          size: 11,
          font: helveticaFont,
          color: rgb(0.2, 0.2, 0.2),
        });
        yPosition -= lineHeight;
      }
    }

    // Footer
    page.drawText(`Generated on: ${new Date().toLocaleDateString()}`, {
      x: margin,
      y: 50,
      size: 10,
      font: helveticaFont,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Save PDF - FIXED: Convert Uint8Array to Buffer or cast to any for Blob
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fullName}_Report_${new Date().toISOString().split('T')[0]}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

  } catch (error) {
    console.error('Error generating learner report:', error);
    throw error;
  }
};