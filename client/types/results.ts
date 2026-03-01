// @/types/results.ts

// ==================== RESULTS TYPES ====================
export interface StudentResult {
  id: string;
  studentId: string;
  studentName: string;
  subjectId: string;
  subjectName: string;
  examType: 'week4' | 'week8' | 'endOfTerm';
  examName: string;
  marks: number; // -1 for absent
  percentage?: number;
  grade?: number;
  term: string;
  year: number;
  teacherId: string;
  teacherName: string;
  classId: string;
  className: string;
  totalMarks: number;
  status?: 'complete' | 'absent' | 'missing';
  submittedAt: Date;
  updatedAt?: Date;
}

export interface SubjectCompletionStatus {
  subjectId: string;
  subjectName: string;
  teacherName: string;
  totalStudents: number;
  
  // Completion status flags
  week4Complete: boolean;
  week8Complete: boolean;
  endOfTermComplete: boolean;
  
  // Count of students with marks entered
  enteredStudents: {
    week4: number;
    week8: number;
    endOfTerm: number;
  };
  
  // Student IDs that have marks for each exam type (for lookup)
  enteredStudentIds: {
    week4: string[];
    week8: string[];
    endOfTerm: string[];
  };
  
  // Saved marks for quick lookup when editing
  savedMarks?: {
    [studentId: string]: number; // -1 for absent
  };
  
  // Overall progress percentage
  percentComplete: number;
}

export interface ReportCardData {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  classId: string;
  form: string;
  grade: number;
  position: string;
  gender: string;
  totalMarks: number;
  percentage: number;
  status: 'pass' | 'fail';
  improvement: 'improved' | 'declined' | 'stable';
  subjects: Array<{
    subjectId: string;
    subjectName: string;
    week4: number;
    week8: number;
    endOfTerm: number;
    grade: number;
    gradeDescription: string;
  }>;
  attendance: number;
  teachersComment: string;
  parentsEmail: string;
  parentsPhone?: string;
  generatedDate: string;
  term: string;
  year: number;
  isComplete: boolean;
  completionPercentage: number;
}

export interface ReportReadinessCheck {
  studentId: string;
  studentName: string;
  isReady: boolean;
  missingSubjects: string[];
  missingExams: Array<{
    subject: string;
    examType: string;
  }>;
  totalSubjects: number;
  completedSubjects: number;
  completionPercentage: number;
  issues: string[];
}

export interface ClassReportReadiness {
  classId: string;
  className: string;
  totalStudents: number;
  readyStudents: number;
  notReadyStudents: number;
  readinessPercentage: number;
  students: Array<{
    studentId: string;
    studentName: string;
    isReady: boolean;
    missingSubjects: number;
  }>;
}

export interface BulkReportOperation {
  classId: string;
  className: string;
  term: string;
  year: number;
  reportCards: ReportCardData[];
  summary: {
    total: number;
    complete: number;
    incomplete: number;
    averagePercentage: number;
  };
}

export interface StudentProgress {
  studentId: string;
  studentName: string;
  className: string;
  classId: string;
  form: string;
  overallPercentage: number;
  overallGrade: number;
  status: 'pass' | 'fail' | 'pending';
  isComplete: boolean;
  completionPercentage: number;
  subjects: Array<{
    subjectId: string;
    subjectName: string;
    teacherName: string;
    week4: { status: 'complete' | 'missing' | 'absent'; marks?: number };
    week8: { status: 'complete' | 'missing' | 'absent'; marks?: number };
    endOfTerm: { status: 'complete' | 'missing' | 'absent'; marks?: number };
    subjectProgress: number;
    grade?: number;
  }>;
  missingSubjects: number;
  totalSubjects: number;
}

// ==================== REQUEST/RESPONSE TYPES ====================
export interface SaveResultsRequest {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  examType: 'week4' | 'week8' | 'endOfTerm';
  examName: string;
  term: string;
  year: number;
  totalMarks: number;
  results: Array<{
    studentId: string;
    studentName: string;
    marks: number;
  }>;
  overwrite?: boolean;
}

export interface SaveResultsResponse {
  success: boolean;
  count: number;
  overwritten: boolean;
  errors?: string[];
}

export interface EditResultsRequest {
  classId: string;
  subjectId: string;
  examType: 'week4' | 'week8' | 'endOfTerm';
  term: string;
  year: number;
}

export interface EditResultsResponse {
  success: boolean;
  message: string;
  unlockedCount: number;
}

export interface CheckExistingRequest {
  classId: string;
  subjectId: string;
  examType: string;
  term: string;
  year: number;
}

export interface CheckExistingResponse {
  exists: boolean;
  count: number;
  results: StudentResult[];
}

// ==================== FILTER TYPES ====================
export interface ResultsFilter {
  classId?: string;
  subjectId?: string;
  teacherId?: string;
  studentId?: string;
  examType?: string;
  term?: string;
  year?: number;
  fromDate?: Date;
  toDate?: Date;
}

// ==================== ANALYTICS TYPES ====================
export interface GradeDistributionItem {
  grade: number;
  count: number;
  percentage: number;
  students: string[];
}

export interface PerformanceTrendItem {
  examType: string;
  term: string;
  year: number;
  averagePercentage: number;
  passRate: number;
  studentCount: number;
}

export interface SubjectAnalysisItem {
  subjectId: string;
  subjectName: string;
  teacherName: string;
  averageGrade: number;
  averagePercentage: number;
  passRate: number;
  distinctionRate: number;
  failRate: number;
  studentCount: number;
  classCount: number;
}

export interface ClassComparisonItem {
  classId: string;
  className: string;
  averagePercentage: number;
  passRate: number;
  studentCount: number;
  subjectCount: number;
}