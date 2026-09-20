// @/services/pdf/reportCardPDFLib.ts

import {
  PDFDocument,
  rgb,
  StandardFonts,
  PDFImage,
  PDFPage,
  PDFFont,
} from 'pdf-lib';

import { ReportCardData } from '@/pages/admin/ReportCards';

/* ============================================================
   SCHOOL LOGO
   ============================================================ */

const embedSchoolLogo = async (
  pdfDoc: PDFDocument
): Promise<PDFImage | null> => {
  try {
    const logoUrl = '/images/school-logo.png';

    const response = await fetch(logoUrl);

    if (!response.ok) {
      console.warn('Logo image not found at /images/school-logo.png');
      return null;
    }

    const logoImageBytes = await response.arrayBuffer();

    try {
      return await pdfDoc.embedPng(logoImageBytes);
    } catch {
      try {
        return await pdfDoc.embedJpg(logoImageBytes);
      } catch {
        console.warn(
          'Logo image format not supported. Please use PNG or JPG.'
        );
        return null;
      }
    }
  } catch (error) {
    console.warn('Could not load school logo:', error);
    return null;
  }
};

/* ============================================================
   MAIN FUNCTION
   ============================================================ */

export async function generateReportCardPDF(
  reports: ReportCardData | ReportCardData[],
  configuredExamTypes?: string[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  // A4 portrait
  const pageSize: [number, number] = [595.28, 841.89];

  const width = pageSize[0];
  const height = pageSize[1];

  /* ==========================================================
     FONTS
     ========================================================== */

  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  /* ==========================================================
     COLORS
     ========================================================== */

  const white = rgb(1, 1, 1);

  const navy = rgb(0.055, 0.20, 0.42);
  const primaryBlue = rgb(0.02, 0.35, 0.70);

  const textDark = rgb(0.08, 0.16, 0.28);
  const textMuted = rgb(0.34, 0.41, 0.53);

  const border = rgb(0.78, 0.86, 0.94);

  const panelFill = rgb(0.965, 0.982, 1);
  const rowFill = rgb(0.965, 0.978, 0.995);

  const tableHeader = rgb(0.025, 0.28, 0.58);

  /* ==========================================================
     PAGE CONSTANTS
     ========================================================== */

  const margin = 40;

  const contentWidth = width - margin * 2;

  const logo = await embedSchoolLogo(pdfDoc);

  const reportArray = Array.isArray(reports)
    ? reports
    : [reports];

  /* ==========================================================
     COLUMN VISIBILITY (exam-config driven)
     ==========================================================
     week4/week8/endOfTerm on each subject are plain `number`
     fields (with -1/-2 sentinels for absent/not-conducted), so
     they are never `undefined`. Inferring visibility from
     "does any subject have a value" therefore always evaluated
     to true and every column rendered regardless of what was
     actually configured for the term.

     One PDF generation call always covers a single class/term/
     year, which maps to a single exam configuration, so these
     flags are computed once for the whole batch rather than
     per report/page.

     When configuredExamTypes isn't passed, default to showing
     all three columns, matching ReportModal's own default of
     ['week4', 'week8', 'endOfTerm'] so behavior is unchanged
     for any caller that hasn't been updated yet.
     ========================================================== */

  const showWeek4 = configuredExamTypes
    ? configuredExamTypes.includes('week4')
    : true;

  const showWeek8 = configuredExamTypes
    ? configuredExamTypes.includes('week8')
    : true;

  const showEndOfTerm = configuredExamTypes
    ? configuredExamTypes.includes('endOfTerm')
    : true;

  /* ==========================================================
     HELPERS
     ========================================================== */

  /**
   * Draw centered text.
   */
  const drawCenteredText = (
    page: PDFPage,
    text: string,
    y: number,
    font: PDFFont,
    size: number,
    color = textDark
  ) => {
    const textWidth = font.widthOfTextAtSize(text, size);

    page.drawText(text, {
      x: (width - textWidth) / 2,
      y,
      size,
      font,
      color,
    });
  };

  /**
   * Draw text vertically centered inside a row.
   */
  const drawVerticalText = (
    page: PDFPage,
    text: string,
    x: number,
    rowY: number,
    rowHeight: number,
    font: PDFFont,
    size: number,
    color = textDark
  ) => {
    const textHeight = font.heightAtSize(size);

    page.drawText(text, {
      x,
      y: rowY + (rowHeight - textHeight) / 2 + 1,
      size,
      font,
      color,
    });
  };

  /**
   * Wrap text according to available width.
   */
  const wrapText = (
    text: string,
    font: PDFFont,
    size: number,
    maxWidth: number
  ): string[] => {
    if (!text) return [];

    const words = text.split(/\s+/);
    const lines: string[] = [];

    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine
        ? `${currentLine} ${word}`
        : word;

      const testWidth = font.widthOfTextAtSize(
        testLine,
        size
      );

      if (testWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }

        currentLine = word;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  };

  /**
   * Draw wrapped text.
   */
  const drawWrappedText = (
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    font: PDFFont,
    size: number,
    lineHeight: number,
    color = textDark
  ) => {
    const lines = wrapText(
      text,
      font,
      size,
      maxWidth
    );

    lines.forEach((line, index) => {
      page.drawText(line, {
        x,
        y: y - index * lineHeight,
        size,
        font,
        color,
      });
    });

    return lines.length;
  };

  /**
   * Draw a rounded-style panel.
   *
   * pdf-lib's basic rectangle API doesn't provide the same
   * rounded rectangle API across all versions, so we use a
   * clean rectangle with subtle border treatment.
   */
  const drawPanel = (
    page: PDFPage,
    x: number,
    y: number,
    panelWidth: number,
    panelHeight: number,
    fill = panelFill,
    borderColor = border
  ) => {
    page.drawRectangle({
      x,
      y,
      width: panelWidth,
      height: panelHeight,
      color: fill,
      borderColor,
      borderWidth: 0.8,
    });
  };

  /**
   * Get readable value for assessment fields.
   */
  const formatAssessmentValue = (
    value: number | undefined
  ): string => {
    if (value === undefined) return '-';

    if (value >= 0) {
      return String(value);
    }

    if (value === -1) return 'ABS';
    if (value === -2) return 'NC';

    return '-';
  };

  /**
   * Get grade value.
   */
  const formatGrade = (grade: number): string => {
    if (grade > 0) return String(grade);

    if (grade === -1) return 'X';

    return '-';
  };

  /**
   * Get subject average (unweighted mean of available exam scores,
   * computed by processReportForConfig against configuredExamTypes).
   * -1 sentinel means "no available scores" → render '-'.
   */
  const formatAverage = (
    average: number | undefined
  ): string => {
    if (typeof average !== 'number') return '-';
    if (average >= 0) return String(average);
    return '-';
  };

  /* ============================================================
     DRAW REPORT CARD
     ============================================================ */

  const drawReportCard = (
    page: PDFPage,
    report: ReportCardData,
    pageNumber: number,
    totalPages: number
  ) => {
    let y = height - 28;

    /* ========================================================
       1. HEADER
       ======================================================== */

    if (logo) {
      const logoDims = logo.scale(0.095);

      const logoMaxWidth = 70;
      const logoMaxHeight = 70;

      const logoScale = Math.min(
        logoMaxWidth / logoDims.width,
        logoMaxHeight / logoDims.height
      );

      const finalLogoWidth =
        logoDims.width * logoScale;

      const finalLogoHeight =
        logoDims.height * logoScale;

      page.drawImage(logo, {
        x: (width - finalLogoWidth) / 2,
        y: y - finalLogoHeight,
        width: finalLogoWidth,
        height: finalLogoHeight,
      });

      y -= finalLogoHeight + 18;
    }

    drawCenteredText(
      page,
      'KALABO BOARDING SECONDARY SCHOOL',
      y,
      boldFont,
      17,
      primaryBlue
    );

    y -= 22;

    drawCenteredText(
      page,
      'MINISTRY OF EDUCATION',
      y,
      boldFont,
      11,
      textMuted
    );

    y -= 16;

    /* Header divider */

    page.drawLine({
      start: {
        x: margin,
        y,
      },
      end: {
        x: width - margin,
        y,
      },
      thickness: 1.5,
      color: primaryBlue,
    });

    y -= 31;

    /* ========================================================
       2. DOCUMENT TITLE
       ======================================================== */

    drawCenteredText(
      page,
      'STUDENT REPORT CARD',
      y,
      boldFont,
      19,
      navy
    );

    y -= 28;

    /* Optional exam configuration */

    if (report.examConfigSummary) {
      drawCenteredText(
        page,
        report.examConfigSummary,
        y,
        regularFont,
        8.5,
        primaryBlue
      );

      y -= 18;
    }

    /* ========================================================
       3. STUDENT INFORMATION PANEL
       ======================================================== */

    const studentPanelHeight = 102;

    const studentPanelY =
      y - studentPanelHeight;

    drawPanel(
      page,
      margin,
      studentPanelY,
      contentWidth,
      studentPanelHeight
    );

    const innerPadding = 17;

    const leftX = margin + innerPadding;

    const rightX =
      margin +
      contentWidth / 2 +
      15;

    const dividerX =
      margin + contentWidth / 2;

    /* Vertical divider */

    page.drawLine({
      start: {
        x: dividerX,
        y: studentPanelY + 15,
      },
      end: {
        x: dividerX,
        y: studentPanelY +
          studentPanelHeight -
          15,
      },
      thickness: 0.8,
      color: border,
    });

    const leftItems = [
      ['Student Name:', report.studentName],
      ['Student ID:', report.studentId],
      ['Class:', report.className],
      ['Gender:', report.gender],
    ];

    const rightItems = [
      ['Term:', report.term],
      ['Position:', report.position],
      ['Average:', `${report.percentage}%`],
    ];

    const infoRowHeight = 21;

    /* LEFT */

    leftItems.forEach(([label, value], index) => {
      const rowY =
        studentPanelY +
        studentPanelHeight -
        27 -
        index * infoRowHeight;

      page.drawText(label, {
        x: leftX,
        y: rowY,
        size: 9.5,
        font: boldFont,
        color: textMuted,
      });

      page.drawText(value, {
        x: leftX + 91,
        y: rowY,
        size: 10.5,
        font: regularFont,
        color: textDark,
      });
    });

    /* RIGHT */

    rightItems.forEach(([label, value], index) => {
      const rowY =
        studentPanelY +
        studentPanelHeight -
        27 -
        index * infoRowHeight;

      page.drawText(label, {
        x: rightX,
        y: rowY,
        size: 9.5,
        font: boldFont,
        color: textMuted,
      });

      page.drawText(value, {
        x: rightX + 74,
        y: rowY,
        size: index === 2 ? 13 : 10.5,
        font: index === 2
          ? boldFont
          : regularFont,
        color: index === 2
          ? primaryBlue
          : textDark,
      });
    });

    y = studentPanelY - 17;

    /* ========================================================
       4. RESULTS TABLE
       ======================================================== */

    const columns: {
      key: string;
      label: string;
      width: number;
      align: 'left' | 'center';
    }[] = [];

    columns.push({
      key: 'subject',
      label: 'Subject',
      width: 132,
      align: 'left',
    });

    if (showWeek4) {
      columns.push({
        key: 'week4',
        label: 'W4',
        width: 42,
        align: 'center',
      });
    }

    if (showWeek8) {
      columns.push({
        key: 'week8',
        label: 'W8',
        width: 42,
        align: 'center',
      });
    }

    if (showEndOfTerm) {
      columns.push({
        key: 'eot',
        label: 'EOT',
        width: 48,
        align: 'center',
      });
    }

    columns.push({
      key: 'avg',
      label: 'Avg',
      width: 46,
      align: 'center',
    });

    columns.push({
      key: 'grade',
      label: 'Grade',
      width: 48,
      align: 'center',
    });

    const fixedWidth = columns.reduce(
      (sum, column) => sum + column.width,
      0
    );

    columns.push({
      key: 'description',
      label: 'Description',
      width: contentWidth - fixedWidth,
      align: 'left',
    });

    const headerHeight = 27;
    const rowHeight = 26;

    let tableX = margin;

    /* Header */

    columns.forEach((column) => {
      page.drawRectangle({
        x: tableX,
        y: y - headerHeight,
        width: column.width,
        height: headerHeight,
        color: tableHeader,
      });

      const textWidth =
        boldFont.widthOfTextAtSize(
          column.label,
          9
        );

      const textX =
        column.align === 'center'
          ? tableX +
            (column.width - textWidth) / 2
          : tableX + 9;

      page.drawText(column.label, {
        x: textX,
        y:
          y -
          headerHeight +
          9,
        size: 9,
        font: boldFont,
        color: white,
      });

      tableX += column.width;
    });

    y -= headerHeight;

    /* Rows */

    report.subjects.forEach((subject, index) => {
      const rowY = y - rowHeight;

      const rowColor =
        index % 2 === 0
          ? white
          : rowFill;

      tableX = margin;

      const values: Record<string, string> = {
        subject: subject.subjectName,

        week4: formatAssessmentValue(
          subject.week4
        ),

        week8: formatAssessmentValue(
          subject.week8
        ),

        eot: formatAssessmentValue(
          subject.endOfTerm
        ),

        avg: formatAverage(
          subject.average
        ),

        grade: formatGrade(subject.grade),

        description:
          subject.gradeDescription || '-',
      };

      columns.forEach((column) => {
        page.drawRectangle({
          x: tableX,
          y: rowY,
          width: column.width,
          height: rowHeight,
          color: rowColor,
          borderColor: border,
          borderWidth: 0.55,
        });

        const value =
          values[column.key] || '-';

        let font = regularFont;
        let size = 9;

        if (
          column.key === 'grade' ||
          column.key === 'eot' ||
          column.key === 'avg'
        ) {
          font = boldFont;
        }

        if (column.key === 'description') {
          size = 8.5;
        }

        const textWidth =
          font.widthOfTextAtSize(
            value,
            size
          );

        let textX =
          column.align === 'center'
            ? tableX +
              (column.width - textWidth) / 2
            : tableX + 9;

        /*
         * Prevent long descriptions from escaping.
         */
        if (column.key === 'description') {
          textX = tableX + 9;
        }

        drawVerticalText(
          page,
          value,
          textX,
          rowY,
          rowHeight,
          font,
          size,
          column.key === 'eot'
            ? primaryBlue
            : column.key === 'avg'
              ? navy
              : column.key === 'description'
                ? textMuted
                : textDark
        );

        tableX += column.width;
      });

      y -= rowHeight;
    });

    /* ========================================================
       5. OVERALL AVERAGE
       ======================================================== */

    const averageHeight = 34;
    const averageY = y - averageHeight;

    const labelWidth =
      contentWidth * 0.65;

    page.drawRectangle({
      x: margin,
      y: averageY,
      width: labelWidth,
      height: averageHeight,
      color: panelFill,
      borderColor: border,
      borderWidth: 0.8,
    });

    page.drawRectangle({
      x: margin + labelWidth,
      y: averageY,
      width: contentWidth - labelWidth,
      height: averageHeight,
      color: panelFill,
      borderColor: border,
      borderWidth: 0.8,
    });

    page.drawText('Overall Average:', {
      x: margin + 10,
      y: averageY + 11,
      size: 10,
      font: boldFont,
      color: navy,
    });

    const averageText =
      `${report.percentage}%`;

    const averageTextWidth =
      boldFont.widthOfTextAtSize(
        averageText,
        13
      );

    page.drawText(averageText, {
      x:
        margin +
        labelWidth +
        (contentWidth - labelWidth -
          averageTextWidth) /
          2,
      y: averageY + 9,
      size: 13,
      font: boldFont,
      color: primaryBlue,
    });

    y = averageY - 24;

    /* ========================================================
       6. TEACHER'S COMMENT
       ======================================================== */

    page.drawText("Teacher's Comment:", {
      x: margin,
      y,
      size: 11,
      font: boldFont,
      color: navy,
    });

    y -= 10;

    const commentPadding = 13;

    const commentLines = wrapText(
      report.teachersComment || '',
      regularFont,
      9,
      contentWidth -
        commentPadding * 2
    );

    const commentLineHeight = 14;

    const commentHeight = Math.max(
      53,
      commentLines.length *
        commentLineHeight +
        commentPadding * 2
    );

    const commentY =
      y - commentHeight;

    drawPanel(
      page,
      margin,
      commentY,
      contentWidth,
      commentHeight,
      panelFill
    );

    commentLines.forEach(
      (line, index) => {
        page.drawText(
          index === 0
            ? `"${line}`
            : index === commentLines.length - 1
              ? `${line}"`
              : line,
          {
            x:
              margin +
              commentPadding,
            y:
              commentY +
              commentHeight -
              commentPadding -
              10 -
              index *
                commentLineHeight,
            size: 9,
            font: regularFont,
            color: textDark,
          }
        );
      }
    );

    y = commentY - 24;

    /* ========================================================
       7. LEGEND
       ======================================================== */

    page.drawLine({
      start: {
        x: margin,
        y,
      },
      end: {
        x: width - margin,
        y,
      },
      thickness: 0.8,
      color: primaryBlue,
    });

    y -= 19;

    page.drawText('Legend:', {
      x: margin,
      y,
      size: 8.5,
      font: boldFont,
      color: navy,
    });

    page.drawText(
      'ABS = Absent     |     NC = Not Conducted     |     X = Incomplete',
      {
        x: margin + 42,
        y,
        size: 8.2,
        font: regularFont,
        color: textMuted,
      }
    );

    /* ========================================================
       8. FOOTER
       ======================================================== */

    const footerY = 48;

    page.drawText(
      `Generated: ${report.generatedDate}`,
      {
        x: margin,
        y: footerY,
        size: 8,
        font: regularFont,
        color: textMuted,
      }
    );

    const pageText =
      `Page ${pageNumber} of ${totalPages}`;

    const pageTextWidth =
      regularFont.widthOfTextAtSize(
        pageText,
        8
      );

    page.drawText(pageText, {
      x:
        (width - pageTextWidth) / 2,
      y: footerY,
      size: 8,
      font: regularFont,
      color: textMuted,
    });

    /* Signature */

    const signatureWidth = 145;

    const signatureX =
      width -
      margin -
      signatureWidth;

    page.drawLine({
      start: {
        x: signatureX,
        y: footerY + 14,
      },
      end: {
        x:
          signatureX +
          signatureWidth,
        y: footerY + 14,
      },
      thickness: 0.8,
      color: primaryBlue,
    });

    const signatureText =
      "Teacher's Signature";

    const signatureTextWidth =
      regularFont.widthOfTextAtSize(
        signatureText,
        8
      );

    page.drawText(signatureText, {
      x:
        signatureX +
        (signatureWidth -
          signatureTextWidth) /
          2,
      y: footerY - 1,
      size: 8,
      font: boldFont,
      color: navy,
    });
  };

  /* ============================================================
     CREATE PAGES
     ============================================================ */

  for (let i = 0; i < reportArray.length; i++) {
    const page = pdfDoc.addPage(pageSize);

    drawReportCard(
      page,
      reportArray[i],
      i + 1,
      reportArray.length
    );
  }

  return pdfDoc.save();
}