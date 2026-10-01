// @/services/pdf/teacherListPDF.ts - COMPLETE FIXED VERSION
import { PDFDocument, rgb, StandardFonts, PDFImage } from 'pdf-lib';

// ==================== TYPES ====================

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

/**
 * Assignment shape accepted by the PDF generator.
 *
 * All temporal fields are optional so this works with both the legacy
 * shape (only classId/subject/isFormTeacher) and the new one
 * (roleType/status/startDate/endDate/coversTeacherId).
 */
interface TeacherAssignment {
  classId: string;
  className?: string;
  subject: string;
  isFormTeacher: boolean;

  // Temporal / role fields — NEW
  roleType?: 'substantive' | 'tp' | 'leave-cover';
  status?: 'active' | 'suspended' | 'ended';
  startDate?: Date | string;
  endDate?: Date | string | null;
  coversTeacherId?: string | null;
  normalizedSubjectId?: string;
}

interface TeacherListPDFOptions {
  teachers: Teacher[];
  classes: Array<{ id: string; name: string }>;
  teacherAssignments: Record<string, TeacherAssignment[]>;
  filterInfo?: string;
  schoolName?: string;
  schoolAddress?: string;
}

// ==================== ENCODING SANITIZER ====================

/**
 * pdf-lib's standard fonts (Helvetica, etc.) use WinAnsi encoding
 * (Windows-1252). Any character outside that range throws at draw time:
 *
 *   "WinAnsi cannot encode '▸' (0x25b8)"
 *
 * This sanitizer replaces common offenders with WinAnsi-safe equivalents
 * and drops anything else that still can't be encoded. It runs on every
 * string before drawText, so a single odd character in one teacher's
 * name can't crash the whole PDF.
 */
const sanitizeForWinAnsi = (input: unknown): string => {
  if (input === null || input === undefined) return '';
  let s = String(input);

  // Known glyph replacements (kept for readability in the output)
  s = s
    .replace(/[\u25B6\u25B8\u25BA\u25BC\u25B2]/g, '>')  // ► ▸ ► ▼ ▲ → >
    .replace(/[\u2605\u2606]/g, '*')                     // ★ ☆ → *
    .replace(/[\u2018\u2019\u201B]/g, "'")               // ' ' ‛ → '
    .replace(/[\u201C\u201D\u201F]/g, '"')               // " " ‟ → "
    .replace(/[\u2013\u2014]/g, '-')                     // – — → -
    .replace(/\u2026/g, '...')                           // … → ...
    .replace(/\u00A0/g, ' ');                            // non-breaking space → space

  // Drop anything still outside Latin-1 (U+0000–U+00FF)
  s = s.replace(/[^\x00-\xFF]/g, '');

  return s;
};

// ==================== HELPERS ====================

/**
 * Helper function to embed school logo with better error handling
 */
const embedSchoolLogo = async (pdfDoc: PDFDocument): Promise<PDFImage | null> => {
  try {
    const paths = [
      '/images/school-logo.png',
      '/public/images/school-logo.png',
      '/assets/images/school-logo.png',
      '/school-logo.png',
    ];

    for (const path of paths) {
      try {
        const response = await fetch(path);
        if (response.ok) {
          const logoImageBytes = await response.arrayBuffer();

          try {
            return await pdfDoc.embedPng(logoImageBytes);
          } catch {
            try {
              return await pdfDoc.embedJpg(logoImageBytes);
            } catch {
              console.warn(`Logo at ${path} is not a supported format`);
              continue;
            }
          }
        }
      } catch {
        continue;
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
    if (isNaN(date.getTime())) return dateString;

    return date.toLocaleDateString('en-ZM', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return dateString;
  }
};

/**
 * Format a Date-or-string into a short human string ("30 Nov 2026").
 * Used for role windows. Returns '' when the value is empty/null/invalid.
 */
const formatShortDate = (value?: Date | string | null): string => {
  if (!value) return '';
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-ZM', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
};

/**
 * Human-readable role label for PDF display.
 */
const roleLabel = (role?: TeacherAssignment['roleType']): string => {
  switch (role) {
    case 'tp':
      return 'TP';
    case 'leave-cover':
      return 'Leave Cover';
    case 'substantive':
    default:
      return 'Substantive';
  }
};

// ==================== MAIN ====================

/**
 * Generate a PDF teacher list with assignment information
 */
export const generateTeacherListPDF = async ({
  teachers,
  classes,
  teacherAssignments,
  filterInfo,
  schoolName = 'KALABO BOARDING SECONDARY SCHOOL',
  schoolAddress = 'P.O BOX 930096',
}: TeacherListPDFOptions): Promise<Uint8Array> => {
  try {
    const pdfDoc = await PDFDocument.create();

    const pageSize: [number, number] = [841.89, 595.28]; // A4 Landscape
    const width = pageSize[0];
    const height = pageSize[1];

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let logoImage: PDFImage | null = null;
    try {
      logoImage = await embedSchoolLogo(pdfDoc);
    } catch (error) {
      console.warn('Logo embedding failed, continuing without logo:', error);
    }

    let page = pdfDoc.addPage(pageSize);
    let yPosition = height - 50;
    const margin = 40;
    const contentWidth = width - margin * 2;

    const centerText = (text: string, fontSize: number) => {
      const textWidth = boldFont.widthOfTextAtSize(sanitizeForWinAnsi(text), fontSize);
      return (width - textWidth) / 2;
    };

    // ── Compute role summary counts across all teachers ──────────
    // Used for the header "Substantive: X | TP: Y | Leave Cover: Z"
    // Only non-ended rows count.
    let substantiveCount = 0;
    let tpCount = 0;
    let leaveCoverCount = 0;
    let coveredSlotsCount = 0;

    for (const teacher of teachers) {
      const list = teacherAssignments[teacher.id] || [];
      for (const a of list) {
        if (a.status === 'ended') continue;
        if (a.roleType === 'tp') tpCount++;
        else if (a.roleType === 'leave-cover') leaveCoverCount++;
        else substantiveCount++; // legacy rows with no roleType count as substantive

        if (a.status === 'suspended') coveredSlotsCount++;
      }
    }

    // ── Header ───────────────────────────────────────────────────
    const addHeader = (page: any, pageNum: number, isContinued: boolean = false) => {
      try {
        let headerY = height - margin;

        if (logoImage) {
          try {
            const logoDims = logoImage.scale(0.1);
            const logoX = (width - logoDims.width) / 2;

            page.drawImage(logoImage, {
              x: logoX,
              y: headerY - logoDims.height,
              width: logoDims.width,
              height: logoDims.height,
            });

            headerY -= logoDims.height + 10;
          } catch (error) {
            console.warn('Error drawing logo:', error);
          }
        }

        page.drawText(sanitizeForWinAnsi(schoolName), {
          x: centerText(schoolName, 16),
          y: headerY,
          size: 16,
          font: boldFont,
          color: rgb(0, 0.2, 0.4),
        });
        headerY -= 18;

        const ministryText = 'MINISTRY OF EDUCATION';
        page.drawText(ministryText, {
          x: centerText(ministryText, 11),
          y: headerY,
          size: 11,
          font: boldFont,
          color: rgb(0.3, 0.3, 0.3),
        });
        headerY -= 22;

        const title = isContinued
          ? 'TEACHERS MASTER LIST (Continued)'
          : 'TEACHERS MASTER LIST';
        page.drawText(title, {
          x: centerText(title, 15),
          y: headerY,
          size: 15,
          font: boldFont,
          color: rgb(0, 0, 0),
        });
        headerY -= 22;

        if (filterInfo) {
          page.drawText(sanitizeForWinAnsi(`Filter: ${filterInfo}`), {
            x: margin,
            y: headerY,
            size: 9,
            font,
            color: rgb(0.4, 0.4, 0.4),
          });
          headerY -= 14;
        }

        const date = new Date().toLocaleDateString('en-ZM', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        page.drawText(`Generated on: ${date}`, {
          x: margin,
          y: headerY,
          size: 8,
          font,
          color: rgb(0.4, 0.4, 0.4),
        });
        headerY -= 16;

        // Total count + role summary on same line
        page.drawText(`Total Teachers: ${teachers.length}`, {
          x: margin,
          y: headerY,
          size: 11,
          font: boldFont,
          color: rgb(0, 0, 0.6),
        });

        // Compact role summary, right of the total
        const roleSummaryLine =
          `Roles: Substantive ${substantiveCount} - TP ${tpCount} - Leave Cover ${leaveCoverCount}` +
          (coveredSlotsCount > 0 ? ` - Covered ${coveredSlotsCount}` : '');
        page.drawText(sanitizeForWinAnsi(roleSummaryLine), {
          x: margin + 160,
          y: headerY,
          size: 9,
          font,
          color: rgb(0.3, 0.3, 0.3),
        });

        headerY -= 15;
        return headerY;
      } catch (error) {
        console.error('Error in addHeader:', error);
        return height - 150;
      }
    };

    try {
      yPosition = addHeader(page, 1);
    } catch (error) {
      console.error('Error adding header to first page:', error);
      yPosition = height - 100;
    }

    // ── Table columns ────────────────────────────────────────────
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

    const colPositions: number[] = [];
    let currentX = margin;
    tableColumns.forEach(col => {
      colPositions.push(currentX);
      currentX += col.width;
    });

    const drawTableHeaders = (y: number) => {
      try {
        page.drawRectangle({
          x: margin,
          y: y - 3,
          width: contentWidth,
          height: 18,
          color: rgb(0.2, 0.4, 0.6),
        });

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
        return y - 20;
      }
    };

    try {
      yPosition = drawTableHeaders(yPosition);
      yPosition -= 5;
    } catch (error) {
      console.error('Error drawing initial table headers:', error);
      yPosition -= 30;
    }

    // ── Draw teacher row ────────────────────────────────────────
    const drawTeacherTableRow = (teacher: Teacher, index: number, y: number) => {
      try {
        if (index % 2 === 0) {
          page.drawRectangle({
            x: margin,
            y: y - 3,
            width: contentWidth,
            height: 16,
            color: rgb(0.97, 0.97, 0.97),
          });
        }

        page.drawText(`${index + 1}`, {
          x: colPositions[0] + 2,
          y,
          size: 8,
          font,
        });

        const name =
          teacher.name.length > 18
            ? teacher.name.substring(0, 15) + '...'
            : teacher.name;
        page.drawText(sanitizeForWinAnsi(name), {
          x: colPositions[1] + 2,
          y,
          size: 8,
          font: boldFont,
        });

        const status = teacher.status || 'active';
        const statusColor =
          status === 'active'
            ? rgb(0, 0.6, 0)
            : status === 'inactive'
            ? rgb(0.5, 0.5, 0.5)
            : status === 'on_leave'
            ? rgb(0.8, 0.6, 0)
            : rgb(0, 0.4, 0.8);
        const statusDisplay =
          status === 'on_leave'
            ? 'Leave'
            : status === 'transferred'
            ? 'Trans'
            : status.charAt(0).toUpperCase() + status.slice(1, 3);
        page.drawText(statusDisplay, {
          x: colPositions[2] + 2,
          y,
          size: 8,
          font,
          color: statusColor,
        });

        const nrc = teacher.nrc || '-';
        const nrcDisplay = nrc.length > 12 ? nrc.substring(0, 9) + '...' : nrc;
        page.drawText(sanitizeForWinAnsi(nrcDisplay), {
          x: colPositions[3] + 2,
          y,
          size: 8,
          font,
        });

        const tsNumber = teacher.tsNumber || '-';
        const tsDisplay =
          tsNumber.length > 8 ? tsNumber.substring(0, 5) + '...' : tsNumber;
        page.drawText(sanitizeForWinAnsi(tsDisplay), {
          x: colPositions[4] + 2,
          y,
          size: 8,
          font,
        });

        const empNumber = teacher.employeeNumber || '-';
        const empDisplay =
          empNumber.length > 8 ? empNumber.substring(0, 5) + '...' : empNumber;
        page.drawText(sanitizeForWinAnsi(empDisplay), {
          x: colPositions[5] + 2,
          y,
          size: 8,
          font,
        });

        const dept = teacher.department || '-';
        const deptDisplay =
          dept.length > 6 ? dept.substring(0, 4) + '...' : dept;
        page.drawText(sanitizeForWinAnsi(deptDisplay), {
          x: colPositions[6] + 2,
          y,
          size: 8,
          font,
        });

        const dob = formatDate(teacher.dateOfBirth);
        page.drawText(dob, {
          x: colPositions[7] + 2,
          y,
          size: 8,
          font,
        });

        const firstAppt = formatDate(teacher.dateOfFirstAppointment);
        page.drawText(firstAppt, {
          x: colPositions[8] + 2,
          y,
          size: 8,
          font,
        });

        const currAppt = formatDate(teacher.dateOfCurrentAppointment);
        page.drawText(currAppt, {
          x: colPositions[9] + 2,
          y,
          size: 8,
          font,
        });

        const email = teacher.email || '-';
        const emailDisplay =
          email.length > 18 ? email.substring(0, 15) + '...' : email;
        page.drawText(sanitizeForWinAnsi(emailDisplay), {
          x: colPositions[10] + 2,
          y,
          size: 8,
          font,
        });

        const phone = teacher.phone || '-';
        page.drawText(sanitizeForWinAnsi(phone), {
          x: colPositions[11] + 2,
          y,
          size: 8,
          font,
        });

        return y - 15;
      } catch (error) {
        console.error(`Error drawing row for teacher ${teacher.name}:`, error);
        return y - 15;
      }
    };

    // ── Helper to start a new page with a fresh header + table ──
    const startNewPage = () => {
      page = pdfDoc.addPage(pageSize);
      let y = addHeader(page, pdfDoc.getPageCount(), true);
      y = drawTableHeaders(y);
      y -= 5;
      return y;
    };

    // ── Main loop ────────────────────────────────────────────────
    for (let i = 0; i < teachers.length; i++) {
      const teacher = teachers[i];

      try {
        if (yPosition < 120) {
          yPosition = startNewPage();
        }

        yPosition = drawTeacherTableRow(teacher, i, yPosition);
        yPosition -= 2;

        // ── Subjects (teacher's qualifications) ────────────────
        if (teacher.subjects && teacher.subjects.length > 0) {
          const subjectsText = teacher.subjects.join(', ');

          if (yPosition < 80) {
            yPosition = startNewPage();
          }

          page.drawText(sanitizeForWinAnsi(`  Subjects: ${subjectsText}`), {
            x: margin + 10,
            y: yPosition,
            size: 7,
            font,
            color: rgb(0.3, 0.3, 0.6),
          });
          yPosition -= 12;
        }

        // ── Assignments (grouped by class) ─────────────────────
        const teacherAssignmentData = teacherAssignments[teacher.id] || [];

        if (teacherAssignmentData.length === 0) {
          if (yPosition < 60) {
            yPosition = startNewPage();
          }
          page.drawText('  No current assignments', {
            x: margin + 10,
            y: yPosition,
            size: 7,
            font,
            color: rgb(0.6, 0.6, 0.6),
          });
          yPosition -= 12;
        } else {
          // Group assignments by class
          const classMap = new Map<
            string,
            {
              className: string;
              isFormTeacher: boolean;
              subjects: Array<{
                subject: string;
                roleType?: TeacherAssignment['roleType'];
                status?: TeacherAssignment['status'];
                startDate?: Date | string;
                endDate?: Date | string | null;
                coversTeacherId?: string | null;
              }>;
            }
          >();

          teacherAssignmentData.forEach(a => {
            if (a.status === 'ended') return; // skip history rows in the printed list

            if (!classMap.has(a.classId)) {
              const className =
                a.className ||
                classes.find(c => c.id === a.classId)?.name ||
                'Unknown Class';
              classMap.set(a.classId, {
                className,
                isFormTeacher: false,
                subjects: [],
              });
            }
            const entry = classMap.get(a.classId)!;

            if (a.subject && a.subject !== 'Form Teacher') {
              entry.subjects.push({
                subject: a.subject,
                roleType: a.roleType,
                status: a.status,
                startDate: a.startDate,
                endDate: a.endDate,
                coversTeacherId: a.coversTeacherId,
              });
            }
            if (a.isFormTeacher) entry.isFormTeacher = true;
          });

          for (const [, classData] of classMap) {
            if (yPosition < 70) {
              yPosition = startNewPage();
            }

            // ASCII-only prefix: ">" instead of "▸"
            // ASCII-only form-teacher marker: "*" instead of "★"
            const className = `${classData.className}${
              classData.isFormTeacher ? ' *' : ''
            }`;
            page.drawText(sanitizeForWinAnsi(`  > ${className}`), {
              x: margin + 20,
              y: yPosition,
              size: 8,
              font: classData.isFormTeacher ? boldFont : font,
              color: classData.isFormTeacher
                ? rgb(0.6, 0.2, 0.8)
                : rgb(0, 0, 0.3),
            });
            yPosition -= 11;

            // ── Subjects with role + window ─────────────────────
            if (classData.subjects.length > 0) {
              // Build one compact line per subject.
              // Example: "Math - TP until 30 Nov 2026"
              //          "Science - Leave Cover until 12 Dec 2026"
              //          "English - Substantive (covered)"
              const lines = classData.subjects.map(s => {
                const role = roleLabel(s.roleType);
                const parts: string[] = [s.subject, '-', role];

                if (s.roleType === 'tp' || s.roleType === 'leave-cover') {
                  const until = formatShortDate(s.endDate);
                  if (until) parts.push(`until ${until}`);
                }

                if (s.status === 'suspended') {
                  parts.push('(covered)');
                }

                return parts.join(' ');
              });

              for (const line of lines) {
                if (yPosition < 70) {
                  yPosition = startNewPage();
                }
                page.drawText(sanitizeForWinAnsi(`    - ${line}`), {
                  x: margin + 30,
                  y: yPosition,
                  size: 7,
                  font,
                  color: rgb(0.4, 0.4, 0.4),
                });
                yPosition -= 10;
              }
            }
          }
        }

        yPosition -= 5;
      } catch (error) {
        console.error(`Error processing teacher ${teacher.name}:`, error);
        yPosition -= 20;
      }
    }

    // ── Footer + page numbers ───────────────────────────────────
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

        currentPage.drawText(
          `Generated: ${new Date().toLocaleDateString()}`,
          {
            x: margin,
            y: 20,
            size: 8,
            font,
            color: rgb(0.5, 0.5, 0.5),
          }
        );
      } catch (error) {
        console.error(`Error adding footer to page ${i + 1}:`, error);
      }
    }

    const pdfBytes = await pdfDoc.save();

    if (!pdfBytes || pdfBytes.length === 0) {
      throw new Error('Generated PDF is empty');
    }

    return pdfBytes;
  } catch (error) {
    console.error('Error generating teacher list PDF:', error);
    throw new Error(
      `Failed to generate PDF: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
};