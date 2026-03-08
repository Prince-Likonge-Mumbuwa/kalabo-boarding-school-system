// @/types/exam.ts
export interface ExamConfig {
  id: string;
  term: string; // 'Term 1', 'Term 2', 'Term 3'
  year: number;
  examTypes: {
    week4: boolean;
    week8: boolean;
    endOfTerm: boolean;
  };
  week4Date?: string;
  week8Date?: string;
  endOfTermDate?: string;
  week4TotalMarks?: number;
  week8TotalMarks?: number;
  endOfTermTotalMarks?: number;
  isActive: boolean;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ExamConfigFilters {
  year?: number;
  term?: string;
  isActive?: boolean;
}