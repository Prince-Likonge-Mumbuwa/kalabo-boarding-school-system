import { ClassPerformance } from '@/types/school';

interface TeacherPDFData {
  teacherName: string;
  subjects: string[];
  classes: ClassPerformance[];
  term: string;
  year: number;
  generatedDate: string;
}

export const generateTeacherResultsPDF = async (data: TeacherPDFData) => {
  // Dynamically import pdfMake only when needed
  const pdfMake = (await import('pdfmake/build/pdfmake')).default;
  const pdfFonts = (await import('pdfmake/build/vfs_fonts')).default;
  
  // Initialize pdfMake with fonts
  if (pdfFonts && pdfFonts.pdfMake && pdfFonts.pdfMake.vfs) {
    pdfMake.vfs = pdfFonts.pdfMake.vfs;
  } else {
    console.warn('pdfMake fonts not loaded properly');
    throw new Error('PDF fonts failed to load');
  }
  
  const getGradeColor = (grade: number): string => {
    if (grade <= 2) return '#10b981';
    if (grade <= 4) return '#3b82f6';
    if (grade <= 6) return '#f59e0b';
    if (grade <= 8) return '#f97316';
    return '#ef4444';
  };

  const docDefinition: any = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [20, 20, 20, 20],
    
    header: (currentPage: number, pageCount: number) => {
      return {
        text: `Kalabo Boarding Secondary School - Page ${currentPage} of ${pageCount}`,
        alignment: 'center',
        fontSize: 8,
        margin: [0, 10, 0, 0],
        color: '#64748b'
      };
    },
    
    footer: (currentPage: number, pageCount: number) => {
      return {
        text: `Generated: ${data.generatedDate}`,
        alignment: 'center',
        fontSize: 7,
        margin: [0, 0, 0, 10],
        color: '#94a3b8'
      };
    },
    
    content: [
      // Header
      {
        text: 'MINISTRY OF EDUCATION',
        style: 'ministryHeader',
        alignment: 'center',
        margin: [0, 0, 0, 5]
      },
      {
        text: 'Kalabo Boarding Secondary School',
        style: 'schoolHeader',
        alignment: 'center',
        margin: [0, 0, 0, 10]
      },
      {
        text: 'TEACHER RESULTS ANALYSIS REPORT',
        style: 'title',
        alignment: 'center',
        margin: [0, 0, 0, 5]
      },
      {
        text: `Teacher: ${data.teacherName} | Subject(s): ${data.subjects.join(', ')}`,
        style: 'subtitle',
        alignment: 'center',
        margin: [0, 0, 0, 5]
      },
      {
        text: `${data.term} ${data.year}`,
        style: 'subtitle',
        alignment: 'center',
        margin: [0, 0, 0, 15]
      },

      // Performance per class
      ...data.classes.map((cls, classIndex) => [
        // Class Header
        {
          text: cls.className,
          style: 'sectionTitle',
          margin: [0, classIndex > 0 ? 20 : 0, 0, 10]
        },

        // Performance Cards
        {
          columns: [
            {
              width: '*',
              stack: [
                { text: 'Quality Pass', style: 'cardLabel' },
                { text: `${cls.performance.quality.percentage}%`, style: 'cardValueGreen', margin: [0, 5, 0, 2] },
                { text: 'Grades 1-6', style: 'cardSubValue' }
              ],
              style: 'card',
              background: '#f0fdf4'
            },
            {
              width: '*',
              stack: [
                { text: 'Quantity Pass', style: 'cardLabel' },
                { text: `${cls.performance.quantity.percentage}%`, style: 'cardValueBlue', margin: [0, 5, 0, 2] },
                { text: 'Grades 1-8', style: 'cardSubValue' }
              ],
              style: 'card',
              background: '#eff6ff'
            },
            {
              width: '*',
              stack: [
                { text: 'Fail Rate', style: 'cardLabel' },
                { text: `${cls.performance.fail.percentage}%`, style: 'cardValueRed', margin: [0, 5, 0, 2] },
                { text: 'Grade 9', style: 'cardSubValue' }
              ],
              style: 'card',
              background: '#fee2e2'
            }
          ],
          columnGap: 5,
          margin: [0, 0, 0, 15]
        },

        // Main Results Table
        {
          table: {
            headerRows: 1,
            widths: [30, 15, 15, 15, 15, 15, 15, 15, 15, 15, 20, 20, 20],
            body: [
              // Header
              [
                { text: '', style: 'tableHeader' },
                { text: '1', style: 'tableHeader' },
                { text: '2', style: 'tableHeader' },
                { text: '3', style: 'tableHeader' },
                { text: '4', style: 'tableHeader' },
                { text: '5', style: 'tableHeader' },
                { text: '6', style: 'tableHeader' },
                { text: '7', style: 'tableHeader' },
                { text: '8', style: 'tableHeader' },
                { text: '9', style: 'tableHeader' },
                { text: 'QLTY', style: 'tableHeader' },
                { text: 'QNTY', style: 'tableHeader' },
                { text: 'FAIL', style: 'tableHeader' }
              ],
              // Candidates row
              [
                { text: 'Candidates', style: 'tableCellBold' },
                { text: '', colSpan: 9, alignment: 'center' },
                {}, {}, {}, {}, {}, {}, {}, {},
                { text: `B:${cls.candidates.boys}`, alignment: 'center', fontSize: 8 },
                { text: `G:${cls.candidates.girls}`, alignment: 'center', fontSize: 8 },
                { text: `T:${cls.candidates.total}`, alignment: 'center', fontSize: 8 }
              ],
              // SAT row
              [
                { text: 'SAT', style: 'tableCellBold' },
                { text: '', colSpan: 9, alignment: 'center' },
                {}, {}, {}, {}, {}, {}, {}, {},
                { text: `B:${cls.sat.boys}`, alignment: 'center', fontSize: 8 },
                { text: `G:${cls.sat.girls}`, alignment: 'center', fontSize: 8 },
                { text: `T:${cls.sat.total}`, alignment: 'center', fontSize: 8 }
              ],
              // Boys row
              [
                { text: 'Boys', style: 'tableCellBold' },
                ...Array.from({ length: 9 }, (_, i) => {
                  const grade = i + 1;
                  const gradeData = cls.gradeDistribution.find(g => g.grade === grade);
                  return {
                    text: gradeData?.boys.toString() || '0',
                    alignment: 'center',
                    color: gradeData?.boys ? '#2563eb' : '#94a3b8',
                    bold: !!gradeData?.boys
                  };
                }),
                { text: cls.performance.quality.boys.toString(), alignment: 'center', color: '#16a34a', bold: true },
                { text: cls.performance.quantity.boys.toString(), alignment: 'center', color: '#2563eb', bold: true },
                { text: cls.performance.fail.boys.toString(), alignment: 'center', color: '#dc2626', bold: true }
              ],
              // Girls row
              [
                { text: 'Girls', style: 'tableCellBold' },
                ...Array.from({ length: 9 }, (_, i) => {
                  const grade = i + 1;
                  const gradeData = cls.gradeDistribution.find(g => g.grade === grade);
                  return {
                    text: gradeData?.girls.toString() || '0',
                    alignment: 'center',
                    color: gradeData?.girls ? '#db2777' : '#94a3b8',
                    bold: !!gradeData?.girls
                  };
                }),
                { text: cls.performance.quality.girls.toString(), alignment: 'center', color: '#16a34a', bold: true },
                { text: cls.performance.quantity.girls.toString(), alignment: 'center', color: '#2563eb', bold: true },
                { text: cls.performance.fail.girls.toString(), alignment: 'center', color: '#dc2626', bold: true }
              ],
              // Total row
              [
                { text: 'Total', style: 'tableCellBold' },
                ...Array.from({ length: 9 }, (_, i) => {
                  const grade = i + 1;
                  const gradeData = cls.gradeDistribution.find(g => g.grade === grade);
                  return {
                    text: gradeData?.total.toString() || '0',
                    alignment: 'center',
                    bold: true
                  };
                }),
                { text: cls.performance.quality.total.toString(), alignment: 'center', bold: true },
                { text: cls.performance.quantity.total.toString(), alignment: 'center', bold: true },
                { text: cls.performance.fail.total.toString(), alignment: 'center', bold: true }
              ],
              // Percentage row
              [
                { text: '%', style: 'tableCellBold' },
                ...Array.from({ length: 9 }, (_, i) => {
                  const grade = i + 1;
                  const gradeData = cls.gradeDistribution.find(g => g.grade === grade);
                  return {
                    text: gradeData?.percentage ? `${gradeData.percentage}%` : '0%',
                    alignment: 'center',
                    fontSize: 7
                  };
                }),
                { text: `${cls.performance.quality.percentage}%`, alignment: 'center', bold: true, color: '#16a34a' },
                { text: `${cls.performance.quantity.percentage}%`, alignment: 'center', bold: true, color: '#2563eb' },
                { text: `${cls.performance.fail.percentage}%`, alignment: 'center', bold: true, color: '#dc2626' }
              ]
            ]
          },
          layout: {
            fillColor: (rowIndex: number, node: any, colIndex: number) => {
              if (rowIndex === 0) return '#1e293b';
              if (rowIndex === 1 || rowIndex === 2) return '#f1f5f9';
              return rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
            },
            hLineWidth: (i: number, node: any) => 0.5,
            vLineWidth: (i: number, node: any) => 0.5,
            hLineColor: (i: number, node: any) => '#e2e8f0',
            vLineColor: (i: number, node: any) => '#e2e8f0',
          },
          margin: [0, 0, 0, 20]
        },

        // Grade Key
        {
          columns: [
            { text: '● Distinction (1-2)', color: '#10b981', fontSize: 7 },
            { text: '● Merit (3-4)', color: '#3b82f6', fontSize: 7 },
            { text: '● Credit (5-6)', color: '#f59e0b', fontSize: 7 },
            { text: '● Satisfactory (7-8)', color: '#f97316', fontSize: 7 },
            { text: '● Fail (9)', color: '#ef4444', fontSize: 7 }
          ],
          columnGap: 5,
          margin: [0, 0, 0, 15]
        }
      ]).flat(),

      // Teacher's Comments Page
      {
        text: 'Teacher\'s Comments',
        style: 'sectionTitle',
        pageBreak: 'before',
        margin: [0, 0, 0, 20]
      },

      // Comments for each class
      ...data.classes.map(cls => [
        {
          text: cls.className,
          style: 'subSectionTitle',
          margin: [0, 0, 0, 10]
        },
        {
          canvas: [
            { type: 'line', x1: 0, y1: 0, x2: 750, y2: 0, lineWidth: 0.5, lineColor: '#e2e8f0' },
            { type: 'line', x1: 0, y1: 15, x2: 750, y2: 15, lineWidth: 0.5, lineColor: '#e2e8f0' },
            { type: 'line', x1: 0, y1: 30, x2: 750, y2: 30, lineWidth: 0.5, lineColor: '#e2e8f0' },
            { type: 'line', x1: 0, y1: 45, x2: 750, y2: 45, lineWidth: 0.5, lineColor: '#e2e8f0' }
          ],
          margin: [0, 0, 0, 20]
        }
      ]),

      // Signatures
      {
        columns: [
          {
            width: '*',
            stack: [
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, lineWidth: 0.5, lineColor: '#94a3b8' }] },
              { text: 'Teacher\'s Signature', fontSize: 8, color: '#64748b', margin: [0, 3, 0, 0] },
              { text: 'Date: _______________', fontSize: 8, color: '#64748b', margin: [0, 3, 0, 0] }
            ]
          },
          {
            width: '*',
            stack: [
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, lineWidth: 0.5, lineColor: '#94a3b8' }] },
              { text: 'Head of Department', fontSize: 8, color: '#64748b', margin: [0, 3, 0, 0] },
              { text: 'Date: _______________', fontSize: 8, color: '#64748b', margin: [0, 3, 0, 0] }
            ]
          }
        ],
        columnGap: 20,
        margin: [0, 20, 0, 0]
      }
    ],

    styles: {
      ministryHeader: {
        fontSize: 14,
        bold: true,
        color: '#1e293b'
      },
      schoolHeader: {
        fontSize: 20,
        bold: true,
        color: '#0f172a'
      },
      title: {
        fontSize: 16,
        bold: true,
        color: '#2563eb'
      },
      subtitle: {
        fontSize: 11,
        color: '#475569'
      },
      sectionTitle: {
        fontSize: 14,
        bold: true,
        color: '#0f172a',
        decoration: 'underline',
        decorationColor: '#2563eb'
      },
      subSectionTitle: {
        fontSize: 12,
        bold: true,
        color: '#334155'
      },
      card: {
        margin: [0, 0, 0, 0],
        padding: [8, 10, 8, 10],
        alignment: 'center'
      },
      cardLabel: {
        fontSize: 9,
        color: '#475569',
        alignment: 'center'
      },
      cardValueGreen: {
        fontSize: 18,
        bold: true,
        color: '#16a34a',
        alignment: 'center'
      },
      cardValueBlue: {
        fontSize: 18,
        bold: true,
        color: '#2563eb',
        alignment: 'center'
      },
      cardValueRed: {
        fontSize: 18,
        bold: true,
        color: '#dc2626',
        alignment: 'center'
      },
      cardSubValue: {
        fontSize: 7,
        color: '#64748b',
        alignment: 'center'
      },
      tableHeader: {
        fontSize: 9,
        bold: true,
        color: '#ffffff',
        fillColor: '#1e293b',
        alignment: 'center'
      },
      tableCellBold: {
        fontSize: 9,
        bold: true,
        alignment: 'center'
      }
    },

    defaultStyle: {
      fontSize: 8,
      font: 'Roboto'
    }
  };

  return docDefinition;
};