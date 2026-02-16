// @/services/pdf/adminResultsPDF.ts
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { ClassPerformance, SubjectPerformance, GradeDistribution } from '@/types/school';

// Initialize pdfMake - FIXED VERSION
if (pdfFonts && pdfFonts.pdfMake && pdfFonts.pdfMake.vfs) {
  pdfMake.vfs = pdfFonts.pdfMake.vfs;
} else {
  console.warn('pdfMake fonts not loaded properly, using fallback');
}

interface PDFData {
  schoolName: string;
  term: string;
  year: number;
  generatedDate: string;
  metrics: {
    totalStudents: number;
    totalAssessments: number;
    averageScore: number;
    passRate: number;
    failRate: number;
    distinctionRate: number;
    classesCount: number;
    subjectsCount: number;
  };
  gradeDistribution: GradeDistribution[];
  classPerformance: ClassPerformance[];
  subjectPerformance: SubjectPerformance[];
  selectedClass: string;
}

export const generateAdminResultsPDF = (data: PDFData) => {
  
  // Helper function to get color based on grade
  const getGradeColor = (grade: number): string => {
    if (grade <= 2) return '#10b981'; // Emerald - Distinction
    if (grade <= 4) return '#3b82f6'; // Blue - Merit
    if (grade <= 6) return '#f59e0b'; // Amber - Credit
    if (grade <= 8) return '#f97316'; // Orange - Satisfactory
    return '#ef4444'; // Red - Fail
  };

  // Helper function to get status text
  const getGradeStatus = (grade: number): string => {
    if (grade <= 2) return 'Distinction';
    if (grade <= 4) return 'Merit';
    if (grade <= 6) return 'Credit';
    if (grade <= 8) return 'Satisfactory';
    return 'Fail';
  };

  // Define document definition
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
      // ==================== PAGE 1: EXECUTIVE SUMMARY ====================
      {
        text: 'MINISTRY OF EDUCATION',
        style: 'ministryHeader',
        alignment: 'center',
        margin: [0, 0, 0, 5]
      },
      {
        text: data.schoolName,
        style: 'schoolHeader',
        alignment: 'center',
        margin: [0, 0, 0, 10]
      },
      {
        text: 'SCHOOL RESULTS ANALYSIS REPORT',
        style: 'title',
        alignment: 'center',
        margin: [0, 0, 0, 5]
      },
      {
        text: `${data.term} ${data.year} | ${data.selectedClass}`,
        style: 'subtitle',
        alignment: 'center',
        margin: [0, 0, 0, 15]
      },

      // Summary Cards - Using a 4-column layout
      {
        columns: [
          // Card 1: Total Students
          {
            width: '*',
            stack: [
              {
                text: 'Total Students',
                style: 'cardLabel'
              },
              {
                text: data.metrics.totalStudents.toString(),
                style: 'cardValueBlue',
                margin: [0, 5, 0, 2]
              },
              {
                text: `${data.metrics.classesCount} classes`,
                style: 'cardSubValue'
              }
            ],
            style: 'card',
            background: '#eff6ff'
          },
          // Card 2: Pass Rate
          {
            width: '*',
            stack: [
              {
                text: 'Pass Rate',
                style: 'cardLabel'
              },
              {
                text: `${data.metrics.passRate}%`,
                style: 'cardValueGreen',
                margin: [0, 5, 0, 2]
              },
              {
                text: `${data.metrics.distinctionRate}% distinction`,
                style: 'cardSubValue'
              }
            ],
            style: 'card',
            background: '#f0fdf4'
          },
          // Card 3: Average Score
          {
            width: '*',
            stack: [
              {
                text: 'Average Score',
                style: 'cardLabel'
              },
              {
                text: `${data.metrics.averageScore}%`,
                style: 'cardValueAmber',
                margin: [0, 5, 0, 2]
              },
              {
                text: 'mean performance',
                style: 'cardSubValue'
              }
            ],
            style: 'card',
            background: '#fef3c7'
          },
          // Card 4: Fail Rate
          {
            width: '*',
            stack: [
              {
                text: 'Fail Rate',
                style: 'cardLabel'
              },
              {
                text: `${data.metrics.failRate}%`,
                style: 'cardValueRed',
                margin: [0, 5, 0, 2]
              },
              {
                text: 'Grade 9 students',
                style: 'cardSubValue'
              }
            ],
            style: 'card',
            background: '#fee2e2'
          }
        ],
        columnGap: 5,
        margin: [0, 0, 0, 20]
      },

      // Grade Distribution Table
      {
        text: 'Grade Distribution Summary',
        style: 'sectionTitle',
        margin: [0, 0, 0, 10]
      },

      {
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
          body: [
            // Header
            [
              { text: 'Grade', style: 'tableHeader' },
              { text: 'Status', style: 'tableHeader' },
              { text: 'Boys', style: 'tableHeader' },
              { text: 'Girls', style: 'tableHeader' },
              { text: 'Total', style: 'tableHeader' },
              { text: 'Percentage', style: 'tableHeader' }
            ],
            // Data rows
            ...data.gradeDistribution.map(g => [
              { 
                text: g.grade.toString(),
                fillColor: getGradeColor(g.grade),
                color: '#ffffff',
                alignment: 'center',
                bold: true
              },
              { text: getGradeStatus(g.grade), alignment: 'center' },
              { text: g.boys.toString(), alignment: 'center' },
              { text: g.girls.toString(), alignment: 'center' },
              { text: g.total.toString(), alignment: 'center', bold: true },
              { text: `${g.percentage}%`, alignment: 'center' }
            ]),
            // Total row
            [
              { text: 'TOTAL', colSpan: 2, alignment: 'center', bold: true },
              {},
              { text: data.gradeDistribution.reduce((sum, g) => sum + g.boys, 0).toString(), alignment: 'center', bold: true },
              { text: data.gradeDistribution.reduce((sum, g) => sum + g.girls, 0).toString(), alignment: 'center', bold: true },
              { text: data.gradeDistribution.reduce((sum, g) => sum + g.total, 0).toString(), alignment: 'center', bold: true },
              { text: '100%', alignment: 'center', bold: true }
            ]
          ]
        },
        layout: {
          fillColor: (rowIndex: number, node: any, colIndex: number) => {
            return rowIndex === 0 ? '#1e293b' : (rowIndex % 2 === 0 ? '#f8fafc' : '#ffffff');
          },
          hLineWidth: (i: number, node: any) => 0.5,
          vLineWidth: (i: number, node: any) => 0.5,
          hLineColor: (i: number, node: any) => '#e2e8f0',
          vLineColor: (i: number, node: any) => '#e2e8f0',
        },
        margin: [0, 0, 0, 15]
      },

      // Grade Key
      {
        columns: [
          { text: '● Distinction (1-2)', color: '#10b981', fontSize: 8, margin: [0, 0, 10, 0] },
          { text: '● Merit (3-4)', color: '#3b82f6', fontSize: 8, margin: [0, 0, 10, 0] },
          { text: '● Credit (5-6)', color: '#f59e0b', fontSize: 8, margin: [0, 0, 10, 0] },
          { text: '● Satisfactory (7-8)', color: '#f97316', fontSize: 8, margin: [0, 0, 10, 0] },
          { text: '● Fail (9)', color: '#ef4444', fontSize: 8 }
        ],
        margin: [0, 0, 0, 20]
      },

      // ==================== PAGE 2: CLASS PERFORMANCE ====================
      {
        text: 'Class Performance Analysis',
        style: 'sectionTitle',
        pageBreak: 'before',
        margin: [0, 0, 0, 10]
      },

      // Class Performance Tables
      ...data.classPerformance.map((cls, index) => [
        {
          text: cls.className,
          style: 'subSectionTitle',
          margin: [0, 10, 0, 5]
        },
        {
          table: {
            headerRows: 1,
            widths: [30, 20, 20, 20, 15, 15, 15, 15, 15, 15, 20, 20, 20],
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
                ...cls.gradeDistribution.map(g => ({
                  text: g.boys.toString(),
                  alignment: 'center',
                  color: g.boys > 0 ? '#2563eb' : '#94a3b8',
                  bold: g.boys > 0
                })),
                { text: cls.performance.quality.boys.toString(), alignment: 'center', color: '#16a34a', bold: true },
                { text: cls.performance.quantity.boys.toString(), alignment: 'center', color: '#2563eb', bold: true },
                { text: cls.performance.fail.boys.toString(), alignment: 'center', color: '#dc2626', bold: true }
              ],
              // Girls row
              [
                { text: 'Girls', style: 'tableCellBold' },
                ...cls.gradeDistribution.map(g => ({
                  text: g.girls.toString(),
                  alignment: 'center',
                  color: g.girls > 0 ? '#db2777' : '#94a3b8',
                  bold: g.girls > 0
                })),
                { text: cls.performance.quality.girls.toString(), alignment: 'center', color: '#16a34a', bold: true },
                { text: cls.performance.quantity.girls.toString(), alignment: 'center', color: '#2563eb', bold: true },
                { text: cls.performance.fail.girls.toString(), alignment: 'center', color: '#dc2626', bold: true }
              ],
              // Total row
              [
                { text: 'Total', style: 'tableCellBold' },
                ...cls.gradeDistribution.map(g => ({
                  text: g.total.toString(),
                  alignment: 'center',
                  bold: true
                })),
                { text: cls.performance.quality.total.toString(), alignment: 'center', bold: true },
                { text: cls.performance.quantity.total.toString(), alignment: 'center', bold: true },
                { text: cls.performance.fail.total.toString(), alignment: 'center', bold: true }
              ],
              // Percentage row
              [
                { text: '%', style: 'tableCellBold' },
                ...cls.gradeDistribution.map(g => ({
                  text: `${g.percentage}%`,
                  alignment: 'center',
                  fontSize: 7
                })),
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
          margin: [0, 0, 0, 15]
        },
        // Subject Performance for this class
        cls.subjectPerformance && cls.subjectPerformance.length > 0 ? {
          table: {
            headerRows: 1,
            widths: ['auto', 'auto', 'auto', 'auto', 'auto'],
            body: [
              [
                { text: 'Subject', style: 'tableHeader' },
                { text: 'Teacher', style: 'tableHeader' },
                { text: 'Quality', style: 'tableHeader' },
                { text: 'Quantity', style: 'tableHeader' },
                { text: 'Fail', style: 'tableHeader' }
              ],
              ...cls.subjectPerformance.map(sub => [
                { text: sub.subject, alignment: 'left' },
                { text: sub.teacher, alignment: 'left' },
                { text: `${sub.quality}%`, alignment: 'center', color: '#16a34a' },
                { text: `${sub.quantity}%`, alignment: 'center', color: '#2563eb' },
                { text: `${sub.fail}%`, alignment: 'center', color: '#dc2626' }
              ])
            ]
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 15]
        } : {}
      ]).flat(),

      // ==================== PAGE 3: SUBJECT PERFORMANCE ====================
      {
        text: 'Subject Performance Analysis',
        style: 'sectionTitle',
        pageBreak: 'before',
        margin: [0, 0, 0, 10]
      },

      {
        table: {
          headerRows: 1,
          widths: [40, 40, 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'Subject', style: 'tableHeader' },
              { text: 'Teacher', style: 'tableHeader' },
              { text: 'Classes', style: 'tableHeader' },
              { text: 'Students', style: 'tableHeader' },
              { text: 'Avg Grade', style: 'tableHeader' },
              { text: 'Quality', style: 'tableHeader' },
              { text: 'Quantity', style: 'tableHeader' },
              { text: 'Fail', style: 'tableHeader' }
            ],
            ...data.subjectPerformance.map(sub => [
              { text: sub.subject, alignment: 'left' },
              { text: sub.teacher, alignment: 'left' },
              { text: sub.classCount.toString(), alignment: 'center' },
              { text: sub.studentCount.toString(), alignment: 'center' },
              { text: sub.averageGrade.toString(), alignment: 'center' },
              { text: `${sub.qualityRate}%`, alignment: 'center', color: '#16a34a', bold: true },
              { text: `${sub.quantityRate}%`, alignment: 'center', color: '#2563eb', bold: true },
              { text: `${sub.failRate}%`, alignment: 'center', color: '#dc2626', bold: true }
            ])
          ]
        },
        layout: {
          fillColor: (rowIndex: number, node: any, colIndex: number) => {
            return rowIndex === 0 ? '#1e293b' : (rowIndex % 2 === 0 ? '#f8fafc' : '#ffffff');
          },
          hLineWidth: (i: number, node: any) => 0.5,
          vLineWidth: (i: number, node: any) => 0.5,
          hLineColor: (i: number, node: any) => '#e2e8f0',
          vLineColor: (i: number, node: any) => '#e2e8f0',
        },
        margin: [0, 0, 0, 20]
      },

      // Key Insights
      {
        text: 'Key Insights',
        style: 'subSectionTitle',
        margin: [0, 10, 0, 5]
      },

      {
        ul: [
          `Top performing subjects: ${data.subjectPerformance.sort((a, b) => b.qualityRate - a.qualityRate).slice(0, 3).map(s => s.subject).join(', ')}`,
          `Subjects needing attention: ${data.subjectPerformance.filter(s => s.failRate > 15).map(s => s.subject).join(', ') || 'None'}`,
          `Overall pass rate: ${data.metrics.passRate}% (Target: 70%)`,
          `Total assessments graded: ${data.metrics.totalAssessments}`
        ],
        fontSize: 9,
        margin: [0, 0, 0, 20]
      },

      // Recommendations
      {
        text: 'Recommendations',
        style: 'subSectionTitle',
        margin: [0, 10, 0, 5]
      },

      {
        stack: [
          {
            text: data.metrics.passRate >= 70 
              ? '✓ Pass rate target met. Maintain current teaching strategies.'
              : '! Pass rate below target. Consider intervention programs for struggling students.',
            color: data.metrics.passRate >= 70 ? '#16a34a' : '#dc2626',
            margin: [0, 0, 0, 3]
          },
          ...(data.subjectPerformance.filter(s => s.failRate > 15).length > 0 ? [{
            text: `! Review teaching approaches for: ${data.subjectPerformance.filter(s => s.failRate > 15).map(s => s.subject).join(', ')}`,
            color: '#f97316',
            margin: [0, 0, 0, 3]
          }] : []),
          { text: '• Schedule parent-teacher meetings for students with Grade 9', margin: [0, 0, 0, 3] },
          { text: '• Conduct department meetings to share best practices', margin: [0, 0, 0, 10] }
        ],
        fontSize: 9
      },

      // Signatures
      {
        columns: [
          {
            width: '*',
            stack: [
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 80, y2: 0, lineWidth: 0.5, lineColor: '#94a3b8' }] },
              { text: 'Head Teacher', fontSize: 8, color: '#64748b', margin: [0, 3, 0, 0] },
              { text: 'Date: _______________', fontSize: 8, color: '#64748b', margin: [0, 3, 0, 0] }
            ]
          },
          {
            width: '*',
            stack: [
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 80, y2: 0, lineWidth: 0.5, lineColor: '#94a3b8' }] },
              { text: 'Academic Coordinator', fontSize: 8, color: '#64748b', margin: [0, 3, 0, 0] },
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
        decorationColor: '#2563eb',
        decorationStyle: 'solid'
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
      cardValueBlue: {
        fontSize: 18,
        bold: true,
        color: '#2563eb',
        alignment: 'center'
      },
      cardValueGreen: {
        fontSize: 18,
        bold: true,
        color: '#16a34a',
        alignment: 'center'
      },
      cardValueAmber: {
        fontSize: 18,
        bold: true,
        color: '#d97706',
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
      font: 'Helvetica'
    }
  };

  return docDefinition;
};