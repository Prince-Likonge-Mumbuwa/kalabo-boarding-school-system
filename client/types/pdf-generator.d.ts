// @/types/pdf-generator.d.ts
declare module '@/utils/pdfGenerator' {
  export interface PDFGenerationOptions {
    classId: string;
    className: string;
    learners: any[];
    format: 'simple' | 'detailed' | 'summary';
    includeStats: boolean;
    schoolName: string;
    academicYear: string;
  }

  export function generateClassListPDF(options: PDFGenerationOptions): Promise<void>;
}