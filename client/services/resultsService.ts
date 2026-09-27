// @/services/resultsService.ts
// COMPLETE REWRITE - ISACTIVE FILTER ELIMINATED
// Version 7.0.0 - Zambian CBC (2023) Secondary Subjects
//   - Full CBC-aligned normalization + SMS abbreviation maps
//   - Subject codes: max 4 chars, GSM-7 safe, no collisions
//   - Compact SMS formatter kept from 6.5.0 (moderate compaction)
//   - MUST stay in sync with functions/src/formatSMSMessage.js

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  writeBatch,
  Timestamp,
  runTransaction,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ==================== ENHANCED TYPES ====================

export interface StudentResult {
  id: string;
  studentId: string; // DOCUMENT ID for queries
  studentName: string;
  classId: string;
  className: string;
  form: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  examType: 'week4' | 'week8' | 'endOfTerm';
  examName: string;
  marks: number; // -1 for absent, -2 for not conducted
  totalMarks: number;
  percentage: number;
  grade: number; // Grade for this specific exam
  term: string;
  year: number;
  status: 'entered' | 'absent' | 'not_entered' | 'not_conducted';
  createdAt: string;
  updatedAt: string;
  customStudentId?: string; // For reference/debugging
}

export interface SubjectResultSummary {
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  week4: number;
  week8: number;
  endOfTerm: number;
  averagePercentage: number;
  grade: number;
  gradeDescription: string;
  comment: string;
  isComplete: boolean;
  missingExams: string[];
}

export interface ReportCardData {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  classId: string;
  form: string;
  overallGrade: number;
  overallGradeDescription: string;
  position: string;
  gender: string;
  totalMarks: number;
  percentage: number;
  status: 'pass' | 'fail';
  improvement: 'improved' | 'declined' | 'stable';
  subjects: SubjectResultSummary[];
  attendance: number;
  teachersComment: string;
  parentsEmail: string;
  parentsPhone?: string;
  generatedDate: string;
  term: string;
  year: number;
  isComplete: boolean;
  completionPercentage: number;
  documentId?: string;
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
    week4: { status: 'complete' | 'missing' | 'absent' | 'not_conducted'; marks?: number };
    week8: { status: 'complete' | 'missing' | 'absent' | 'not_conducted'; marks?: number };
    endOfTerm: { status: 'complete' | 'missing' | 'absent' | 'not_conducted'; marks?: number };
    averagePercentage?: number;
    subjectProgress: number;
    grade?: number;
  }>;
  missingSubjects: number;
  totalSubjects: number;
  documentId?: string;
}

export interface ReportReadinessCheck {
  isReady: boolean;
  studentId: string;
  studentName: string;
  totalSubjects: number;
  completeSubjects: number;
  missingData: Array<{
    subject: string;
    subjectId: string;
    teacherName: string;
    missingExamTypes: string[];
  }>;
  notConductedExams?: Array<{
    subject: string;
    subjectId: string;
    examType: string;
  }>;
}

export interface ClassReportReadiness {
  classId: string;
  className: string;
  term: string;
  year: number;
  totalStudents: number;
  readyStudents: number;
  incompleteStudents: number;
  completionPercentage: number;
  studentDetails: ReportReadinessCheck[];
  expectedSubjects: string[];
  expectedSubjectsWithIds: Array<{ id: string; name: string }>;
  hasAssignments: boolean;
}

export interface SubjectCompletionStatus {
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  className: string;
  term: string;
  year: number;
  week4Complete: boolean;
  week8Complete: boolean;
  endOfTermComplete: boolean;
  percentComplete: number;
  totalStudents: number;
  enteredStudents: {
    week4: number;
    week8: number;
    endOfTerm: number;
  };
  enteredStudentIds: {
    week4: string[];
    week8: string[];
    endOfTerm: string[];
  };
  savedMarks?: {
    [studentId: string]: number;
  };
  notConducted?: {
    week4: boolean;
    week8: boolean;
    endOfTerm: boolean;
  };
}

export interface BulkReportOperation {
  reportCards: ReportCardData[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    avgPercentage: number;
    complete: number;
    incomplete: number;
  };
}

// ==================== SMS TYPES ====================

export interface SMSSubjectLine {
  subjectName: string;
  percentage: number;
}

export interface SMSStudentPayload {
  studentName: string;
  studentId: string;      // custom ID for display
  className: string;
  term: string;
  year: number;
  subjects: SMSSubjectLine[];
  overallPercentage: number;
  overallGrade: number;
}

export interface SMSFormatOptions {
  /** Optional header line — set to false to omit entirely. */
  includeHeader?: boolean;
  /** Optional footer line. Default: "Kalabo Sec School" */
  footer?: string | null;
  /** Optional: show grade short-code next to AVG. Default: true. */
  includeGrade?: boolean;
  /** Max subjects to include before truncating. Default: 20. */
  maxSubjects?: number;
}

export interface SMSSegmentInfo {
  length: number;
  encoding: 'GSM-7' | 'UCS-2';
  segments: number;
}

// ==================== CONSTANTS ====================

const COLLECTIONS = {
  RESULTS: 'results',
  LEARNERS: 'learners',
  CLASSES: 'classes',
  TEACHER_ASSIGNMENTS: 'teacher_assignments',
  USERS: 'users',
  REPORT_CARDS: 'report_cards',
} as const;

// ==================== SUBJECT NORMALIZATION MAP ====================
// Zambian CBC (2023) — Secondary Schools only (Forms 1–6).
// MUST stay in sync with SUBJECT_NORMALIZATION_MAP in
// functions/src/formatSMSMessage.js
const SUBJECT_NORMALIZATION_MAP: Record<string, string> = {
  // --- STEM ---
  'Mathematics': 'Mathematics', 'Maths': 'Mathematics', 'Math': 'Mathematics',
  'Additional Mathematics': 'Additional Mathematics',
  'Add Maths': 'Additional Mathematics', 'Add Math': 'Additional Mathematics',
  'Integrated Science': 'Integrated Science', 'Int Science': 'Integrated Science', 'IS': 'Integrated Science',
  'Physics': 'Physics', 'Phy': 'Physics',
  'Chemistry': 'Chemistry', 'Chem': 'Chemistry',
  'Biology': 'Biology', 'Bio': 'Biology',
  'Agricultural Science': 'Agricultural Science', 'Agric': 'Agricultural Science', 'Agriculture': 'Agricultural Science',
  'Computer Science': 'Computer Science', 'Comp Sci': 'Computer Science', 'Computing': 'Computer Science',
  'ICT': 'ICT', 'Computer Studies': 'ICT',

  // --- Humanities ---
  'Geography': 'Geography', 'Geo': 'Geography',
  'History': 'History', 'Hist': 'History',
  'Civic Education': 'Civic Education', 'Civic Educ': 'Civic Education', 'Civics': 'Civic Education',
  'Religious Education': 'Religious Education', 'RE': 'Religious Education', 'Religious Studies': 'Religious Education',
  'Social Studies': 'Social Studies', 'Social': 'Social Studies',

  // --- Languages ---
  'English': 'English', 'English Language': 'English', 'Eng': 'English',
  'Literature in English': 'Literature in English', 'Literature': 'Literature in English', 'Lit': 'Literature in English',
  'French': 'French', 'FRE': 'French',
  'Chinese': 'Chinese', 'CHI': 'Chinese',
  'Portuguese': 'Portuguese', 'POR': 'Portuguese',
  'Swahili': 'Swahili', 'SWA': 'Swahili',
  'Icibemba': 'Icibemba', 'Bemba': 'Icibemba',
  'Cinyanja': 'Cinyanja', 'Nyanja': 'Cinyanja',
  'Chitonga': 'Chitonga', 'Tonga': 'Chitonga',
  'Silozi': 'Silozi', 'Lozi': 'Silozi',
  'Kiikaonde': 'Kiikaonde', 'Kaonde': 'Kiikaonde',
  'Lunda': 'Lunda',
  'Luvale': 'Luvale',

  // --- Business ---
  'Business Studies': 'Business Studies', 'Business': 'Business Studies',
  'Commerce': 'Commerce', 'Comm': 'Commerce',
  'Principles of Accounts': 'Principles of Accounts', 'Accounts': 'Principles of Accounts',
  'Accounting': 'Principles of Accounts', 'POA': 'Principles of Accounts',
  'Economics': 'Economics', 'Econ': 'Economics',

  // --- Technical / Vocational ---
  'Design & Technology': 'Design & Technology', 'Design and Technology': 'Design & Technology',
  'Technical Drawing': 'Design & Technology', 'DT': 'Design & Technology',
  'Food & Nutrition': 'Food & Nutrition', 'Food and Nutrition': 'Food & Nutrition', 'Foods': 'Food & Nutrition',
  'Home Economics': 'Home Economics', 'Home Econ': 'Home Economics', 'HE': 'Home Economics',
  'Fashion & Fabrics': 'Fashion & Fabrics', 'Fashion and Fabrics': 'Fashion & Fabrics', 'Fashion': 'Fashion & Fabrics',
  'Hospitality Management': 'Hospitality Management', 'Hospitality': 'Hospitality Management',
  'Travel & Tourism': 'Travel & Tourism', 'Travel and Tourism': 'Travel & Tourism', 'Tourism': 'Travel & Tourism',
  'Physical Education': 'Physical Education', 'PE': 'Physical Education',
  'Art & Design': 'Art & Design', 'Art and Design': 'Art & Design', 'Art': 'Art & Design', 'Design': 'Art & Design',
  'Music': 'Music', 'MUS': 'Music',
};

// ==================== SMS SUBJECT ABBREVIATIONS ====================
// Zambian CBC (2023) — Secondary Schools only (Forms 1–6).
// All codes GSM-7 safe. Max 4 chars. No collisions.
// MUST stay in sync with SUBJECT_SMS_ABBREVIATIONS in
// functions/src/formatSMSMessage.js
export const SUBJECT_SMS_ABBREVIATIONS: Record<string, string> = {
  // ----- STEM & Natural Sciences -----
  'Mathematics':              'MATH',
  'Additional Mathematics':   'ADMA',
  'Integrated Science':       'IS',
  'Physics':                  'PHY',
  'Chemistry':                'CHEM',
  'Biology':                  'BIO',
  'Agricultural Science':     'AGR',
  'Computer Science':         'CS',
  'ICT':                      'ICT',

  // ----- Social Sciences & Humanities -----
  'Geography':                'GEO',
  'History':                  'HIST',
  'Civic Education':          'CIV',
  'Religious Education':      'RE',
  'Social Studies':           'SOC',

  // ----- Languages & Literature -----
  'English':                  'ENG',
  'Literature in English':    'LIT',
  'French':                   'FRE',
  'Chinese':                  'CHI',
  'Portuguese':               'POR',
  'Swahili':                  'SWA',
  'Icibemba':                 'BEM',
  'Cinyanja':                 'NYA',
  'Chitonga':                 'TON',
  'Silozi':                   'SIL',
  'Kiikaonde':                'KIK',
  'Lunda':                    'LUN',
  'Luvale':                   'LUV',

  // ----- Business & Commercial -----
  'Business Studies':         'BS',
  'Commerce':                 'COM',
  'Principles of Accounts':   'PA',
  'Economics':                'ECON',

  // ----- Technical, Practical & Vocational -----
  'Design & Technology':      'DT',
  'Food & Nutrition':         'FN',
  'Home Economics':           'HE',
  'Fashion & Fabrics':        'FF',
  'Hospitality Management':   'HM',
  'Travel & Tourism':         'TT',
  'Physical Education':       'PE',
  'Art & Design':             'ART',
  'Music':                    'MUS',
};

export const GRADE_SYSTEM = {
  1: { min: 75, max: 100, description: 'Distinction' },
  2: { min: 70, max: 74, description: 'Distinction' },
  3: { min: 65, max: 69, description: 'Merit' },
  4: { min: 60, max: 64, description: 'Merit' },
  5: { min: 55, max: 59, description: 'Credit' },
  6: { min: 50, max: 54, description: 'Credit' },
  7: { min: 45, max: 49, description: 'Satisfactory' },
  8: { min: 40, max: 44, description: 'Satisfactory' },
  9: { min: 0, max: 39, description: 'Unsatisfactory' },
} as const;

// ==================== UTILITY FUNCTIONS ====================

export const normalizeSubjectName = (subjectName: string): string => {
  if (!subjectName) return '';

  const trimmed = subjectName.trim();
  if (SUBJECT_NORMALIZATION_MAP[trimmed]) return SUBJECT_NORMALIZATION_MAP[trimmed];

  const lower = trimmed.toLowerCase();
  const lowerMap: Record<string, string> = {};
  Object.entries(SUBJECT_NORMALIZATION_MAP).forEach(([key, value]) => {
    lowerMap[key.toLowerCase()] = value;
  });

  return lowerMap[lower] || trimmed;
};

/**
 * Get the SMS-friendly abbreviation for a subject.
 * Falls back to first word (3 chars, uppercase) if not mapped.
 *
 * MUST stay in sync with getSubjectSmsCode in
 * functions/src/formatSMSMessage.js
 */
export const getSubjectSmsCode = (subjectName: string): string => {
  if (!subjectName) return '???';
  const normalized = normalizeSubjectName(subjectName);
  if (SUBJECT_SMS_ABBREVIATIONS[normalized]) {
    return SUBJECT_SMS_ABBREVIATIONS[normalized];
  }
  // Fallback: first word, first 3 chars
  const firstWord = normalized.trim().split(/\s+/)[0] || '???';
  return firstWord.substring(0, 3).toUpperCase();
};

/**
 * Get short grade code (D1, M2, C1, S2, U) for SMS.
 * MUST stay in sync with grade().short in formatSMSMessage.js
 */
export const getGradeShortCode = (gradeNum: number): string => {
  const map: Record<number, string> = {
    1: 'D1', 2: 'D2', 3: 'M1', 4: 'M2',
    5: 'C1', 6: 'C2', 7: 'S1', 8: 'S2', 9: 'U',
  };
  return map[gradeNum] || '-';
};

export const calculateGrade = (percentage: number): number => {
  if (percentage < 0) return -1;
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

export const getGradeDescription = (grade: number): string => {
  if (grade === -1) return 'Incomplete';
  const gradeKey = grade as keyof typeof GRADE_SYSTEM;
  return GRADE_SYSTEM[gradeKey]?.description || 'Unknown';
};

export const getGradeDisplay = (grade: number): string => {
  return grade === -1 ? 'X' : grade.toString();
};

export const calculateAveragePercentage = (scores: number[]): number => {
  const validScores = scores.filter(s => s >= 0);
  if (validScores.length === 0) return -1;
  return Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length);
};

// ==================== SMS FORMATTER ====================
// Moderate compaction — NOT ultra-compact.
// Keeps full student name + readable subject codes so guardians understand it.

/**
 * Format an SMS body for a single student's term results.
 *
 * Target length: ~130–160 chars for typical 5-9 subject terms.
 * Output sample (~145 chars):
 *
 *   KALABO SEC - T1 2026
 *   Viti Pious Likonge (G12A_025) Grade 12A
 *   BIO 72 CHEM 95 CIV 51 ENG 46 MATH 68 PHY 60
 *   AVG 65 (M1)
 *   Kalabo Sec School
 */
export const formatStudentResultsSMS = (
  payload: SMSStudentPayload,
  options: SMSFormatOptions = {}
): string => {
  const {
    includeHeader = true,
    footer = 'Kalabo Sec School',
    includeGrade = true,
    maxSubjects = 20,
  } = options;

  const lines: string[] = [];

  // --- Header ---
  if (includeHeader) {
    const termShort = (payload.term || '').replace(/^Term\s*/i, 'T');
    lines.push(`KALABO SEC - ${termShort} ${payload.year}`);
  }

  // --- Student line: "Name (ID) Class" ---
  const idPart = payload.studentId ? ` (${payload.studentId})` : '';
  const classPart = payload.className ? ` ${payload.className}` : '';
  lines.push(`${payload.studentName}${idPart}${classPart}`);

  // --- Subject line: "CODE score CODE score ..." ---
  const subjects = (payload.subjects || []).slice(0, maxSubjects);
  const subjectTokens = subjects
    .filter(s => typeof s.percentage === 'number' && s.percentage >= 0)
    .map(s => `${getSubjectSmsCode(s.subjectName)} ${s.percentage}`);

  if (subjectTokens.length > 0) {
    lines.push(subjectTokens.join(' '));
  }

  // --- Average line ---
  const gradePart =
    includeGrade && payload.overallGrade > 0
      ? ` (${getGradeShortCode(payload.overallGrade)})`
      : '';
  lines.push(`AVG ${payload.overallPercentage}${gradePart}`);

  // --- Footer ---
  if (footer && footer.trim()) {
    lines.push(footer.trim());
  }

  return lines.join('\n');
};

// ==================== SMS ENCODING / SEGMENT COUNTER ====================

/**
 * Check if a string contains only GSM-7 compatible characters.
 * If true → 160 chars/SMS (153 for multipart).
 * If false → 70 chars/SMS (67 for multipart) — MUCH more expensive.
 */
export const isGsm7 = (text: string): boolean => {
  const gsm7Basic =
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡" +
    "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
  for (let i = 0; i < text.length; i++) {
    if (!gsm7Basic.includes(text[i])) {
      if (text[i] === '{' || text[i] === '}' || text[i] === '[' || text[i] === ']' ||
          text[i] === '~' || text[i] === '|' || text[i] === '^' || text[i] === '\\') {
        continue;
      }
      return false;
    }
  }
  return true;
};

/**
 * Return SMS segment info for cost estimation.
 */
export const getSmsSegments = (text: string): SMSSegmentInfo => {
  const length = text.length;
  const gsm = isGsm7(text);
  if (gsm) {
    return {
      length,
      encoding: 'GSM-7',
      segments: length <= 160 ? 1 : Math.ceil(length / 153),
    };
  }
  return {
    length,
    encoding: 'UCS-2',
    segments: length <= 70 ? 1 : Math.ceil(length / 67),
  };
};

// ==================== MAIN SERVICE ====================

class ResultsService {
  private resultsCollection = collection(db, COLLECTIONS.RESULTS);
  private learnersCollection = collection(db, COLLECTIONS.LEARNERS);
  private classesCollection = collection(db, COLLECTIONS.CLASSES);
  private teacherAssignmentsCollection = collection(db, COLLECTIONS.TEACHER_ASSIGNMENTS);
  private reportCardsCollection = collection(db, COLLECTIONS.REPORT_CARDS);

  async initialize(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('🔌 Initializing ResultsService...');
      const testQuery = query(this.teacherAssignmentsCollection, limit(1));
      const snapshot = await getDocs(testQuery);
      console.log(`✅ Connected to Firestore, found ${snapshot.size} teacher assignments`);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Failed to initialize:', error);
      return {
        success: false,
        error: error.code === 'permission-denied'
          ? 'Permission denied. Check Firebase rules.'
          : 'Failed to connect to Firestore'
      };
    }
  }

  // ==================== LEARNER METHODS ====================

  async getLearnersInClass(classId: string): Promise<Array<{
    id: string;
    name: string;
    data: any;
    documentId: string;
  }>> {
    try {
      console.log(`🔍 Fetching learners for class: ${classId}`);

      const learnersQuery = query(
        this.learnersCollection,
        where('classId', '==', classId)
      );

      const snapshot = await getDocs(learnersQuery);

      const learners = snapshot.docs.map(doc => {
        const data = doc.data();
        const name = data.name || data.studentName || data.fullName || 'Unknown';

        const customStudentId = data.studentId ||
                               data.id ||
                               data.registrationNumber ||
                               data.admissionNumber ||
                               doc.id;

        return {
          id: customStudentId,
          name,
          data: { ...data, firestoreDocId: doc.id },
          documentId: doc.id
        };
      });

      console.log(`✅ Found ${learners.length} learners in class ${classId}`);
      return learners;
    } catch (error) {
      console.error(`❌ Error fetching learners:`, error);
      return [];
    }
  }

  async getLearnerCountInClass(classId: string): Promise<number> {
    try {
      const learners = await this.getLearnersInClass(classId);
      return learners.length;
    } catch (error) {
      console.error(`❌ Error getting learner count:`, error);
      return 0;
    }
  }

  private async resolveStudentDocument(inputId: string): Promise<{
    documentId: string;
    customId: string;
    data: any;
  } | null> {
    try {
      const customIdQuery = query(
        this.learnersCollection,
        where('studentId', '==', inputId)
      );
      const customSnapshot = await getDocs(customIdQuery);

      if (!customSnapshot.empty) {
        const doc = customSnapshot.docs[0];
        const data = doc.data();
        return {
          documentId: doc.id,
          customId: inputId,
          data
        };
      }

      const docRef = doc(this.learnersCollection, inputId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const customId = data.studentId || data.id || data.registrationNumber || data.admissionNumber || inputId;

        return {
          documentId: inputId,
          customId,
          data
        };
      }

      return null;
    } catch (error) {
      console.error('Error resolving student document:', error);
      return null;
    }
  }

  // ==================== TEACHER ASSIGNMENTS ====================

  async getTeacherAssignmentsForClass(classId: string): Promise<Array<{
    id: string;
    subject: string;
    subjectId: string;
    teacherId: string;
    teacherName: string;
    classId: string;
  }>> {
    try {
      const assignmentsQuery = query(
        this.teacherAssignmentsCollection,
        where('classId', '==', classId)
      );

      const snapshot = await getDocs(assignmentsQuery);

      if (snapshot.empty) {
        console.warn(`⚠️ No teacher assignments for class ${classId}`);
        return [];
      }

      return snapshot.docs.map(doc => {
        const data = doc.data();
        const subjectName = data.subject || '';
        const normalizedSubject = normalizeSubjectName(subjectName);

        return {
          id: doc.id,
          subject: subjectName,
          subjectId: normalizedSubject,
          teacherId: data.teacherId || 'unknown',
          teacherName: data.teacherName || 'Not Assigned',
          classId: data.classId,
        };
      });
    } catch (error) {
      console.error('❌ Error getting teacher assignments:', error);
      return [];
    }
  }

  async getExpectedSubjectsForClass(classId: string): Promise<Array<{ id: string; name: string }>> {
    try {
      const assignments = await this.getTeacherAssignmentsForClass(classId);

      const subjectMap = new Map<string, string>();
      assignments.forEach(assignment => {
        subjectMap.set(assignment.subjectId, assignment.subject);
      });

      return Array.from(subjectMap.entries()).map(([id, name]) => ({ id, name }));
    } catch (error) {
      console.error('❌ Error getting expected subjects:', error);
      return [];
    }
  }

  // ==================== RESULTS QUERIES ====================

  async getStudentResults(
    studentDocumentId: string,
    filters?: {
      term?: string;
      year?: number;
      subjectId?: string;
    }
  ): Promise<StudentResult[]> {
    try {
      const constraints = [where('studentId', '==', studentDocumentId)];

      if (filters?.term) constraints.push(where('term', '==', filters.term));
      if (filters?.year) constraints.push(where('year', '==', filters.year));
      if (filters?.subjectId) {
        constraints.push(where('subjectId', '==', normalizeSubjectName(filters.subjectId)));
      }

      const q = query(this.resultsCollection, ...constraints, orderBy('subjectName'));
      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => doc.data() as StudentResult);
    } catch (error) {
      console.error('Error fetching student results:', error);
      return [];
    }
  }

  async getTeacherResults(
    teacherId: string,
    filters?: {
      classId?: string;
      subjectId?: string;
      term?: string;
      year?: number;
    }
  ): Promise<StudentResult[]> {
    try {
      const constraints = [where('teacherId', '==', teacherId)];

      if (filters?.classId) constraints.push(where('classId', '==', filters.classId));
      if (filters?.subjectId) {
        constraints.push(where('subjectId', '==', normalizeSubjectName(filters.subjectId)));
      }
      if (filters?.term) constraints.push(where('term', '==', filters.term));
      if (filters?.year) constraints.push(where('year', '==', filters.year));

      const q = query(this.resultsCollection, ...constraints);
      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => doc.data() as StudentResult);
    } catch (error) {
      console.error('Error fetching teacher results:', error);
      return [];
    }
  }

  async getAllResults(filters?: {
    classId?: string;
    subjectId?: string;
    term?: string;
    year?: number;
    examType?: string;
  }): Promise<StudentResult[]> {
    try {
      const constraints = [];

      if (filters?.classId) constraints.push(where('classId', '==', filters.classId));
      if (filters?.subjectId) {
        constraints.push(where('subjectId', '==', normalizeSubjectName(filters.subjectId)));
      }
      if (filters?.term) constraints.push(where('term', '==', filters.term));
      if (filters?.year) constraints.push(where('year', '==', filters.year));
      if (filters?.examType) constraints.push(where('examType', '==', filters.examType));

      const q = constraints.length > 0
        ? query(this.resultsCollection, ...constraints)
        : query(this.resultsCollection);

      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(doc => doc.data() as StudentResult);

      return results.sort((a, b) => {
        if (a.className !== b.className) return a.className.localeCompare(b.className);
        return a.studentName.localeCompare(b.studentName);
      });
    } catch (error) {
      console.error('Error fetching all results:', error);
      return [];
    }
  }

  async getClassSubjectResults(
    classId: string,
    subjectId: string,
    filters?: {
      examType?: string;
      term?: string;
      year?: number;
    }
  ): Promise<StudentResult[]> {
    try {
      const constraints = [
        where('classId', '==', classId),
        where('subjectId', '==', normalizeSubjectName(subjectId))
      ];

      if (filters?.term) constraints.push(where('term', '==', filters.term));
      if (filters?.year) constraints.push(where('year', '==', filters.year));
      if (filters?.examType) constraints.push(where('examType', '==', filters.examType));

      const q = query(this.resultsCollection, ...constraints, orderBy('studentName'));
      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => doc.data() as StudentResult);
    } catch (error) {
      console.error('Error fetching class subject results:', error);
      return [];
    }
  }

  async checkExistingResults(
    classId: string,
    subjectId: string,
    examType: string,
    term: string,
    year: number
  ): Promise<{ exists: boolean; count: number; results: StudentResult[] }> {
    try {
      const q = query(
        this.resultsCollection,
        where('classId', '==', classId),
        where('subjectId', '==', normalizeSubjectName(subjectId)),
        where('examType', '==', examType),
        where('term', '==', term),
        where('year', '==', year)
      );

      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(doc => doc.data() as StudentResult);

      return {
        exists: results.length > 0,
        count: results.length,
        results
      };
    } catch (error) {
      console.error('Error checking existing results:', error);
      return { exists: false, count: 0, results: [] };
    }
  }

  // ==================== SAVE RESULTS ====================

  async saveClassResults(
    data: {
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
    },
    options?: { overwrite?: boolean }
  ): Promise<{ success: boolean; count: number; results: StudentResult[]; overwritten: boolean }> {
    try {
      const normalizedSubjectId = normalizeSubjectName(data.subjectId);
      const normalizedSubjectName = normalizeSubjectName(data.subjectName);

      const existing = await this.checkExistingResults(
        data.classId,
        normalizedSubjectId,
        data.examType,
        data.term,
        data.year
      );

      if (existing.exists && !options?.overwrite) {
        throw new Error(
          `Results already exist for ${normalizedSubjectName} - ${data.examType}. ` +
          `Use overwrite option to replace.`
        );
      }

      const batch = writeBatch(db);
      const savedResults: StudentResult[] = [];
      const now = new Date().toISOString();

      const classDoc = await getDoc(doc(this.classesCollection, data.classId));
      const classData = classDoc.data();
      const form = classData?.level?.toString() || '1';

      const resolvedStudents = await Promise.all(
        data.results.map(async (result) => ({
          result,
          studentDoc: await this.resolveStudentDocument(result.studentId),
        }))
      );

      for (const { result, studentDoc } of resolvedStudents) {
        if (!studentDoc) {
          console.warn(`⚠️ Could not resolve student ID: ${result.studentId}, skipping...`);
          continue;
        }

        let percentage = -1;
        let grade = -1;
        let status: StudentResult['status'] = 'not_entered';

        if (result.marks === -2) {
          status = 'not_conducted';
          percentage = -1;
          grade = -1;
        } else if (result.marks === -1) {
          status = 'absent';
          percentage = -1;
          grade = -1;
        } else if (result.marks >= 0) {
          percentage = Math.round((result.marks / data.totalMarks) * 100);
          grade = calculateGrade(percentage);
          status = 'entered';
        }

        const resultData: StudentResult = {
          id: this.generateResultId(
            studentDoc.documentId,
            normalizedSubjectId,
            data.examType,
            data.term,
            data.year
          ),
          studentId: studentDoc.documentId,
          studentName: studentDoc.data.name || result.studentName,
          classId: data.classId,
          className: data.className,
          form,
          subjectId: normalizedSubjectId,
          subjectName: normalizedSubjectName,
          teacherId: data.teacherId,
          teacherName: data.teacherName,
          examType: data.examType,
          examName: data.examName,
          marks: result.marks,
          totalMarks: data.totalMarks,
          percentage,
          grade,
          term: data.term,
          year: data.year,
          status,
          createdAt: now,
          updatedAt: now,
          customStudentId: studentDoc.customId
        };

        const docRef = doc(this.resultsCollection, resultData.id);
        batch.set(docRef, resultData, { merge: true });
        savedResults.push(resultData);
      }

      await batch.commit();
      console.log(`✅ Saved ${savedResults.length} results`);

      return {
        success: true,
        count: savedResults.length,
        results: savedResults,
        overwritten: existing.exists
      };
    } catch (error) {
      console.error('Error saving results:', error);
      throw error;
    }
  }

  async deleteClassResults(data: {
    classId: string;
    subjectId: string;
    examType: string;
    term: string;
    year: number;
  }): Promise<{ success: boolean; deletedCount: number }> {
    try {
      const normalizedSubjectId = normalizeSubjectName(data.subjectId);
      const existing = await this.checkExistingResults(
        data.classId,
        normalizedSubjectId,
        data.examType,
        data.term,
        data.year
      );

      if (!existing.exists) {
        console.log('⚠️ No results to delete.');
        return { success: true, deletedCount: 0 };
      }

      const batch = writeBatch(db);
      existing.results.forEach(result => {
        const docRef = doc(this.resultsCollection, result.id);
        batch.delete(docRef);
      });

      await batch.commit();
      console.log(`🗑️ Deleted ${existing.count} results for ${normalizedSubjectId} ${data.examType}`);
      return { success: true, deletedCount: existing.count };
    } catch (error) {
      console.error('Error deleting results:', error);
      throw error;
    }
  }

  async updateStudentResult(
    resultId: string,
    marks: number,
    totalMarks: number
  ): Promise<StudentResult | null> {
    try {
      let percentage = -1;
      let grade = -1;
      let status: StudentResult['status'] = 'not_entered';

      if (marks === -2) {
        status = 'not_conducted';
      } else if (marks === -1) {
        status = 'absent';
      } else if (marks >= 0) {
        percentage = Math.round((marks / totalMarks) * 100);
        grade = calculateGrade(percentage);
        status = 'entered';
      }

      const docRef = doc(this.resultsCollection, resultId);
      await updateDoc(docRef, {
        marks,
        totalMarks,
        percentage,
        grade,
        status,
        updatedAt: new Date().toISOString(),
      });

      const updatedDoc = await getDoc(docRef);
      return updatedDoc.data() as StudentResult;
    } catch (error) {
      console.error('Error updating result:', error);
      return null;
    }
  }

  async editResults(data: {
    classId: string;
    subjectId: string;
    examType: 'week4' | 'week8' | 'endOfTerm';
    term: string;
    year: number;
  }): Promise<{ success: boolean; message: string; unlockedCount: number }> {
    try {
      console.log('🔓 Unlocking results for editing:', data);
      return {
        success: true,
        message: 'Results unlocked for editing',
        unlockedCount: 0
      };
    } catch (error) {
      console.error('Error editing results:', error);
      throw error;
    }
  }

  // ==================== STUDENT PROGRESS ====================

  async getStudentProgress(
    classId: string,
    term: string,
    year: number
  ): Promise<StudentProgress[]> {
    try {
      console.log(`🔍 Getting progress for class: ${classId}, ${term} ${year}`);

      const learners = await this.getLearnersInClass(classId);
      if (learners.length === 0) return [];

      const expectedSubjects = await this.getExpectedSubjectsForClass(classId);

      const resultsQuery = query(
        this.resultsCollection,
        where('classId', '==', classId),
        where('term', '==', term),
        where('year', '==', year)
      );

      const resultsSnapshot = await getDocs(resultsQuery);
      const allResults = resultsSnapshot.docs.map(doc => doc.data() as StudentResult);

      const resultsByDocumentId = new Map<string, StudentResult[]>();
      allResults.forEach(result => {
        if (!resultsByDocumentId.has(result.studentId)) {
          resultsByDocumentId.set(result.studentId, []);
        }
        resultsByDocumentId.get(result.studentId)!.push(result);
      });

      const assignments = await this.getTeacherAssignmentsForClass(classId);
      const classData = await this.getClassData(classId);

      const studentProgress = await Promise.all(
        learners.map(async (learner) => {
          const studentResults = resultsByDocumentId.get(learner.documentId) || [];

          const subjects: StudentProgress['subjects'] = [];
          let totalSubjectsCompleted = 0;
          let totalPercentage = 0;
          let subjectsWithScores = 0;

          for (const subject of expectedSubjects) {
            const subjectResults = studentResults.filter(r => r.subjectId === subject.id);
            const teacherAssignment = assignments.find(a => a.subjectId === subject.id);

            const week4Result = subjectResults.find(r => r.examType === 'week4');
            const week8Result = subjectResults.find(r => r.examType === 'week8');
            const endOfTermResult = subjectResults.find(r => r.examType === 'endOfTerm');

            const week4Status = week4Result
              ? (week4Result.status === 'absent' ? 'absent' :
                 week4Result.status === 'not_conducted' ? 'not_conducted' : 'complete')
              : 'missing';

            const week8Status = week8Result
              ? (week8Result.status === 'absent' ? 'absent' :
                 week8Result.status === 'not_conducted' ? 'not_conducted' : 'complete')
              : 'missing';

            const endOfTermStatus = endOfTermResult
              ? (endOfTermResult.status === 'absent' ? 'absent' :
                 endOfTermResult.status === 'not_conducted' ? 'not_conducted' : 'complete')
              : 'missing';

            const week4Complete = week4Status !== 'missing';
            const week8Complete = week8Status !== 'missing';
            const endOfTermComplete = endOfTermStatus !== 'missing';

            const completedExams = [week4Complete, week8Complete, endOfTermComplete].filter(Boolean).length;
            const subjectProgress = Math.round((completedExams / 3) * 100);

            if (subjectProgress === 100) totalSubjectsCompleted++;

            const availableScores = [];
            if (week4Result?.percentage >= 0) availableScores.push(week4Result.percentage);
            if (week8Result?.percentage >= 0) availableScores.push(week8Result.percentage);
            if (endOfTermResult?.percentage >= 0) availableScores.push(endOfTermResult.percentage);

            const averagePercentage = availableScores.length > 0
              ? Math.round(availableScores.reduce((a, b) => a + b, 0) / availableScores.length)
              : undefined;

            if (averagePercentage && averagePercentage > 0) {
              totalPercentage += averagePercentage;
              subjectsWithScores++;
            }

            subjects.push({
              subjectId: subject.id,
              subjectName: subject.name,
              teacherName: teacherAssignment?.teacherName || 'Not assigned',
              week4: { status: week4Status, marks: week4Result?.percentage },
              week8: { status: week8Status, marks: week8Result?.percentage },
              endOfTerm: { status: endOfTermStatus, marks: endOfTermResult?.percentage },
              averagePercentage,
              subjectProgress,
              grade: endOfTermResult?.grade
            });
          }

          const overallPercentage = subjectsWithScores > 0
            ? Math.round(totalPercentage / subjectsWithScores)
            : 0;

          const completionPercentage = expectedSubjects.length > 0
            ? Math.round((totalSubjectsCompleted / expectedSubjects.length) * 100)
            : 0;

          const isComplete = totalSubjectsCompleted === expectedSubjects.length && expectedSubjects.length > 0;

          return {
            studentId: learner.id,
            studentName: learner.name,
            className: classData?.name || 'Unknown',
            classId,
            form: classData?.level?.toString() || '1',
            overallPercentage,
            overallGrade: calculateGrade(overallPercentage),
            status: overallPercentage >= 50 ? 'pass' : (overallPercentage > 0 ? 'fail' : 'pending'),
            isComplete,
            completionPercentage,
            subjects,
            missingSubjects: expectedSubjects.length - totalSubjectsCompleted,
            totalSubjects: expectedSubjects.length,
            documentId: learner.documentId
          } as StudentProgress;
        })
      );

      return studentProgress.sort((a, b) => a.studentName.localeCompare(b.studentName));
    } catch (error) {
      console.error('❌ Error getting student progress:', error);
      return [];
    }
  }

  // ==================== REPORT CARD GENERATION ====================

  async generateReportCard(
    inputStudentId: string,
    term: string,
    year: number,
    options?: {
      includeIncomplete?: boolean;
      markMissing?: boolean;
    }
  ): Promise<ReportCardData | null> {
    try {
      console.log(`📝 Generating report card for: ${inputStudentId}, ${term} ${year}`);

      const studentDoc = await this.resolveStudentDocument(inputStudentId);

      if (!studentDoc) {
        console.warn(`⚠️ Student not found: ${inputStudentId}`);
        return null;
      }

      const { data: studentData, documentId, customId } = studentDoc;
      const studentName = studentData.name || studentData.studentName || 'Unknown';
      const classId = studentData.classId;

      if (!classId) {
        console.warn(`⚠️ Student has no class assigned`);
        return null;
      }

      const classDoc = await getDoc(doc(this.classesCollection, classId));
      if (!classDoc.exists()) {
        console.warn(`⚠️ Class not found: ${classId}`);
        return null;
      }
      const classData = classDoc.data();

      const results = await this.getStudentResults(documentId, { term, year });

      if (results.length === 0) {
        console.log(`📭 No results found`);
        return null;
      }

      const subjectMap = new Map<string, {
        subjectId: string;
        subjectName: string;
        teacherId: string;
        teacherName: string;
        week4: number;
        week8: number;
        endOfTerm: number;
        week4Status?: string;
        week8Status?: string;
        endOfTermStatus?: string;
      }>();

      results.forEach(result => {
        const subjectId = result.subjectId;

        if (!subjectMap.has(subjectId)) {
          subjectMap.set(subjectId, {
            subjectId,
            subjectName: result.subjectName,
            teacherId: result.teacherId,
            teacherName: result.teacherName,
            week4: -1,
            week8: -1,
            endOfTerm: -1,
          });
        }

        const subject = subjectMap.get(subjectId)!;

        if (result.examType === 'week4') {
          subject.week4 = result.marks === -2 ? -2 : result.percentage;
        }
        if (result.examType === 'week8') {
          subject.week8 = result.marks === -2 ? -2 : result.percentage;
        }
        if (result.examType === 'endOfTerm') {
          subject.endOfTerm = result.marks === -2 ? -2 : result.percentage;
        }
      });

      const subjects: SubjectResultSummary[] = [];
      let totalPercentage = 0;
      let validSubjectsCount = 0;

      subjectMap.forEach(subjectData => {
        const missingExams: string[] = [];
        if (subjectData.week4 === -1) missingExams.push('Week 4');
        if (subjectData.week8 === -1) missingExams.push('Week 8');
        if (subjectData.endOfTerm === -1) missingExams.push('End of Term');

        const isComplete = missingExams.length === 0;

        const availableScores = [];
        if (subjectData.week4 >= 0) availableScores.push(subjectData.week4);
        if (subjectData.week8 >= 0) availableScores.push(subjectData.week8);
        if (subjectData.endOfTerm >= 0) availableScores.push(subjectData.endOfTerm);

        const averagePercentage = availableScores.length > 0
          ? Math.round(availableScores.reduce((a, b) => a + b, 0) / availableScores.length)
          : -1;

        const grade = averagePercentage >= 0 ? calculateGrade(averagePercentage) : -1;
        const gradeDescription = getGradeDescription(grade);

        const comment = this.generateSubjectComment(
          grade,
          averagePercentage,
          missingExams,
          subjectData.week4 === -2 || subjectData.week8 === -2 || subjectData.endOfTerm === -2
        );

        subjects.push({
          subjectId: subjectData.subjectId,
          subjectName: subjectData.subjectName,
          teacherId: subjectData.teacherId,
          teacherName: subjectData.teacherName,
          week4: subjectData.week4,
          week8: subjectData.week8,
          endOfTerm: subjectData.endOfTerm,
          averagePercentage,
          grade,
          gradeDescription,
          comment,
          isComplete,
          missingExams,
        });

        if (averagePercentage >= 0) {
          totalPercentage += averagePercentage;
          validSubjectsCount++;
        }
      });

      const overallAveragePercentage = validSubjectsCount > 0
        ? Math.round(totalPercentage / validSubjectsCount)
        : 0;

      const overallGrade = overallAveragePercentage > 0 ? calculateGrade(overallAveragePercentage) : -1;
      const overallGradeDescription = getGradeDescription(overallGrade);

      const completeSubjects = subjects.filter(s => s.isComplete).length;
      const completionPercentage = subjects.length > 0
        ? Math.round((completeSubjects / subjects.length) * 100)
        : 0;

      const isComplete = completeSubjects === subjects.length && subjects.length > 0;

      if (!isComplete && !options?.includeIncomplete) {
        console.log(`⚠️ Report incomplete (${completionPercentage}%)`);
        return null;
      }

      const position = await this.calculatePosition(documentId, classId, term, year);
      const improvement = await this.calculateImprovement(documentId, term, year);
      const teachersComment = this.generateTeacherComment(
        overallAveragePercentage,
        subjects
      );

      return {
        id: `report-${customId}-${term}-${year}`,
        studentId: customId,
        studentName,
        className: classData.name,
        classId,
        form: classData.level?.toString() || '1',
        overallGrade,
        overallGradeDescription,
        position,
        gender: studentData.gender || 'Not specified',
        totalMarks: totalPercentage,
        percentage: overallAveragePercentage,
        status: overallAveragePercentage >= 50 ? 'pass' : 'fail',
        improvement,
        subjects: subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
        attendance: studentData.attendance || 95,
        teachersComment,
        parentsEmail: studentData.parentEmail || studentData.parentsEmail || '',
        parentsPhone: studentData.parentPhone || studentData.parentsPhone || '',
        generatedDate: new Date().toLocaleDateString('en-GB'),
        term,
        year,
        isComplete,
        completionPercentage,
        documentId
      };
    } catch (error) {
      console.error(`❌ Error generating report card:`, error);
      return null;
    }
  }

  async generateClassReportCards(
    classId: string,
    term: string,
    year: number,
    options?: {
      includeIncomplete?: boolean;
      markMissing?: boolean;
    }
  ): Promise<BulkReportOperation> {
    try {
      console.log(`🎓 Generating reports for class: ${classId}, ${term} ${year}`);

      const learners = await this.getLearnersInClass(classId);

      if (learners.length === 0) {
        return {
          reportCards: [],
          summary: { total: 0, passed: 0, failed: 0, avgPercentage: 0, complete: 0, incomplete: 0 },
        };
      }

      const reportCardsPromises = learners.map(learner =>
        this.generateReportCard(learner.id, term, year, {
          includeIncomplete: options?.includeIncomplete ?? true,
          markMissing: options?.markMissing ?? true,
        })
      );

      const results = await Promise.allSettled(reportCardsPromises);

      const reportCards: ReportCardData[] = [];
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          reportCards.push(result.value);
        }
      });

      const passed = reportCards.filter(r => r.status === 'pass').length;
      const failed = reportCards.filter(r => r.status === 'fail').length;
      const complete = reportCards.filter(r => r.isComplete).length;
      const incomplete = reportCards.filter(r => !r.isComplete).length;

      const avgPercentage = reportCards.length > 0
        ? Math.round(reportCards.reduce((sum, r) => sum + r.percentage, 0) / reportCards.length)
        : 0;

      return {
        reportCards: reportCards.sort((a, b) => a.studentName.localeCompare(b.studentName)),
        summary: {
          total: reportCards.length,
          passed,
          failed,
          avgPercentage,
          complete,
          incomplete,
        },
      };
    } catch (error) {
      console.error('❌ Error generating class reports:', error);
      throw error;
    }
  }

  // ==================== REPORT READINESS ====================

  async validateReportCardReadiness(
    inputStudentId: string,
    term: string,
    year: number
  ): Promise<ReportReadinessCheck | null> {
    try {
      const studentDoc = await this.resolveStudentDocument(inputStudentId);

      if (!studentDoc) {
        return null;
      }

      const { data: studentData, customId } = studentDoc;
      const classId = studentData.classId;

      if (!classId) {
        return null;
      }

      const expectedSubjects = await this.getExpectedSubjectsForClass(classId);
      const results = await this.getStudentResults(studentDoc.documentId, { term, year });

      const subjectMap = new Map<string, {
        name: string;
        hasWeek4: boolean;
        hasWeek8: boolean;
        hasEndOfTerm: boolean;
        isNotConductedWeek4?: boolean;
        isNotConductedWeek8?: boolean;
        isNotConductedEndOfTerm?: boolean;
        teacherName: string;
      }>();

      expectedSubjects.forEach(subject => {
        subjectMap.set(subject.id, {
          name: subject.name,
          hasWeek4: false,
          hasWeek8: false,
          hasEndOfTerm: false,
          isNotConductedWeek4: false,
          isNotConductedWeek8: false,
          isNotConductedEndOfTerm: false,
          teacherName: 'Not assigned',
        });
      });

      results.forEach(result => {
        if (subjectMap.has(result.subjectId)) {
          const subject = subjectMap.get(result.subjectId)!;
          subject.teacherName = result.teacherName;

          if (result.examType === 'week4') {
            subject.hasWeek4 = true;
            subject.isNotConductedWeek4 = result.marks === -2;
          }
          if (result.examType === 'week8') {
            subject.hasWeek8 = true;
            subject.isNotConductedWeek8 = result.marks === -2;
          }
          if (result.examType === 'endOfTerm') {
            subject.hasEndOfTerm = true;
            subject.isNotConductedEndOfTerm = result.marks === -2;
          }
        }
      });

      const missingData: ReportReadinessCheck['missingData'] = [];
      const notConductedExams: Array<{ subject: string; subjectId: string; examType: string }> = [];
      let completeSubjects = 0;

      subjectMap.forEach((subject, subjectId) => {
        const missing: string[] = [];

        if (!subject.hasWeek4 && !subject.isNotConductedWeek4) missing.push('Week 4');
        if (!subject.hasWeek8 && !subject.isNotConductedWeek8) missing.push('Week 8');
        if (!subject.hasEndOfTerm && !subject.isNotConductedEndOfTerm) missing.push('End of Term');

        if (missing.length > 0) {
          missingData.push({
            subject: subject.name,
            subjectId,
            teacherName: subject.teacherName,
            missingExamTypes: missing,
          });
        } else {
          completeSubjects++;
        }

        if (subject.isNotConductedWeek4) {
          notConductedExams.push({ subject: subject.name, subjectId, examType: 'Week 4' });
        }
        if (subject.isNotConductedWeek8) {
          notConductedExams.push({ subject: subject.name, subjectId, examType: 'Week 8' });
        }
        if (subject.isNotConductedEndOfTerm) {
          notConductedExams.push({ subject: subject.name, subjectId, examType: 'End of Term' });
        }
      });

      return {
        isReady: missingData.length === 0 && subjectMap.size > 0,
        studentId: customId,
        studentName: studentData.name || 'Unknown',
        totalSubjects: subjectMap.size,
        completeSubjects,
        missingData,
        notConductedExams,
      };
    } catch (error) {
      console.error('❌ Error validating report readiness:', error);
      return null;
    }
  }

  async validateClassReportReadiness(
    classId: string,
    term: string,
    year: number
  ): Promise<ClassReportReadiness | null> {
    try {
      const classDoc = await getDoc(doc(this.classesCollection, classId));
      if (!classDoc.exists()) {
        return null;
      }
      const classData = classDoc.data();

      const expectedSubjectsWithIds = await this.getExpectedSubjectsForClass(classId);
      const hasAssignments = expectedSubjectsWithIds.length > 0;

      const learners = await this.getLearnersInClass(classId);

      const readinessResults = await Promise.allSettled(
        learners.map(learner => this.validateReportCardReadiness(learner.id, term, year))
      );

      const studentDetails: ReportReadinessCheck[] = readinessResults
        .filter((r): r is PromiseFulfilledResult<ReportReadinessCheck | null> => r.status === 'fulfilled')
        .map(r => r.value)
        .filter((r): r is ReportReadinessCheck => r !== null);

      const readyStudents = studentDetails.filter(check => check.isReady).length;
      const completionPercentage = studentDetails.length > 0
        ? Math.round((readyStudents / studentDetails.length) * 100)
        : 0;

      return {
        classId,
        className: classData.name,
        term,
        year,
        totalStudents: learners.length,
        readyStudents,
        incompleteStudents: learners.length - readyStudents,
        completionPercentage,
        studentDetails,
        expectedSubjects: expectedSubjectsWithIds.map(s => s.id),
        expectedSubjectsWithIds,
        hasAssignments,
      };
    } catch (error) {
      console.error('❌ Error validating class readiness:', error);
      return null;
    }
  }

  // ==================== SUBJECT COMPLETION ====================

  async getSubjectCompletionStatus(
    classId: string,
    term: string,
    year: number
  ): Promise<SubjectCompletionStatus[]> {
    try {
      const classDoc = await getDoc(doc(this.classesCollection, classId));
      if (!classDoc.exists()) {
        throw new Error('Class not found');
      }
      const classData = classDoc.data();

      const expectedSubjects = await this.getExpectedSubjectsForClass(classId);

      const q = query(
        this.resultsCollection,
        where('classId', '==', classId),
        where('term', '==', term),
        where('year', '==', year)
      );

      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(doc => doc.data() as StudentResult);

      const subjectMap = new Map<string, {
        subjectName: string;
        teacherId: string;
        teacherName: string;
        week4Students: Set<string>;
        week8Students: Set<string>;
        endOfTermStudents: Set<string>;
        week4Marks: Map<string, number>;
        week8Marks: Map<string, number>;
        endOfTermMarks: Map<string, number>;
        week4NotConducted?: boolean;
        week8NotConducted?: boolean;
        endOfTermNotConducted?: boolean;
      }>();

      results.forEach(result => {
        const key = result.subjectId;
        if (!subjectMap.has(key)) {
          subjectMap.set(key, {
            subjectName: result.subjectName,
            teacherId: result.teacherId,
            teacherName: result.teacherName,
            week4Students: new Set(),
            week8Students: new Set(),
            endOfTermStudents: new Set(),
            week4Marks: new Map(),
            week8Marks: new Map(),
            endOfTermMarks: new Map(),
            week4NotConducted: false,
            week8NotConducted: false,
            endOfTermNotConducted: false,
          });
        }
        const subject = subjectMap.get(key)!;

        if (result.examType === 'week4') {
          if (result.marks === -2) subject.week4NotConducted = true;
          subject.week4Students.add(result.studentId);
          subject.week4Marks.set(result.studentId, result.marks);
        }
        if (result.examType === 'week8') {
          if (result.marks === -2) subject.week8NotConducted = true;
          subject.week8Students.add(result.studentId);
          subject.week8Marks.set(result.studentId, result.marks);
        }
        if (result.examType === 'endOfTerm') {
          if (result.marks === -2) subject.endOfTermNotConducted = true;
          subject.endOfTermStudents.add(result.studentId);
          subject.endOfTermMarks.set(result.studentId, result.marks);
        }
      });

      expectedSubjects.forEach(subject => {
        const normalizedId = subject.id;
        if (!subjectMap.has(normalizedId)) {
          subjectMap.set(normalizedId, {
            subjectName: subject.name,
            teacherId: 'pending',
            teacherName: 'Not entered',
            week4Students: new Set(),
            week8Students: new Set(),
            endOfTermStudents: new Set(),
            week4Marks: new Map(),
            week8Marks: new Map(),
            endOfTermMarks: new Map(),
            week4NotConducted: false,
            week8NotConducted: false,
            endOfTermNotConducted: false,
          });
        }
      });

      const totalStudents = await this.getLearnerCountInClass(classId);

      return Array.from(subjectMap.entries()).map(([subjectId, data]) => {
        const week4NotConducted = data.week4NotConducted ||
          (data.week4Students.size > 0 && Array.from(data.week4Marks.values()).every(mark => mark === -2));
        const week8NotConducted = data.week8NotConducted ||
          (data.week8Students.size > 0 && Array.from(data.week8Marks.values()).every(mark => mark === -2));
        const endOfTermNotConducted = data.endOfTermNotConducted ||
          (data.endOfTermStudents.size > 0 && Array.from(data.endOfTermMarks.values()).every(mark => mark === -2));

        const week4Complete = week4NotConducted || data.week4Students.size >= totalStudents;
        const week8Complete = week8NotConducted || data.week8Students.size >= totalStudents;
        const endOfTermComplete = endOfTermNotConducted || data.endOfTermStudents.size >= totalStudents;

        const completeCount = [week4Complete, week8Complete, endOfTermComplete].filter(Boolean).length;
        const percentComplete = totalStudents > 0 ? Math.round((completeCount / 3) * 100) : 0;

        const savedMarks: { [studentId: string]: number } = {};

        data.week4Marks.forEach((marks, studentId) => { savedMarks[studentId] = marks; });
        data.week8Marks.forEach((marks, studentId) => { savedMarks[studentId] = marks; });
        data.endOfTermMarks.forEach((marks, studentId) => { savedMarks[studentId] = marks; });

        return {
          subjectId,
          subjectName: data.subjectName,
          teacherId: data.teacherId,
          teacherName: data.teacherName,
          classId,
          className: classData.name,
          term,
          year,
          week4Complete,
          week8Complete,
          endOfTermComplete,
          percentComplete,
          totalStudents,
          enteredStudents: {
            week4: data.week4Students.size,
            week8: data.week8Students.size,
            endOfTerm: data.endOfTermStudents.size,
          },
          enteredStudentIds: {
            week4: Array.from(data.week4Students),
            week8: Array.from(data.week8Students),
            endOfTerm: Array.from(data.endOfTermStudents),
          },
          savedMarks,
          notConducted: {
            week4: week4NotConducted,
            week8: week8NotConducted,
            endOfTerm: endOfTermNotConducted,
          },
        };
      });
    } catch (error) {
      console.error('Error getting subject completion status:', error);
      return [];
    }
  }

  // ==================== ANALYTICS METHODS ====================

  async calculateClassComparison(options?: {
    term?: string;
    year?: number;
  }): Promise<any[]> {
    try {
      const constraints = [];
      if (options?.term) constraints.push(where('term', '==', options.term));
      if (options?.year) constraints.push(where('year', '==', options.year));

      const q = constraints.length > 0
        ? query(this.resultsCollection, ...constraints)
        : query(this.resultsCollection);

      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(doc => doc.data() as StudentResult);

      const classMap = new Map<string, {
        className: string;
        form: string;
        percentages: number[];
        students: Set<string>;
      }>();

      results
        .filter(r => r.examType === 'endOfTerm' && r.percentage >= 0)
        .forEach(result => {
          const key = result.classId;
          if (!classMap.has(key)) {
            classMap.set(key, {
              className: result.className,
              form: result.form,
              percentages: [],
              students: new Set(),
            });
          }
          const classData = classMap.get(key)!;
          classData.percentages.push(result.percentage);
          classData.students.add(result.studentId);
        });

      return Array.from(classMap.entries()).map(([classId, data]) => {
        const avgMarks = data.percentages.length > 0
          ? Math.round(data.percentages.reduce((a, b) => a + b, 0) / data.percentages.length)
          : 0;
        const passRate = data.percentages.length > 0
          ? Math.round((data.percentages.filter(p => p >= 50).length / data.percentages.length) * 100)
          : 0;

        return {
          class: data.className,
          className: data.className,
          form: data.form,
          passRate,
          avgMarks,
          totalStudents: data.students.size,
          improvement: 0,
        };
      }).sort((a, b) => b.passRate - a.passRate);
    } catch (error) {
      console.error('Error calculating class comparison:', error);
      return [];
    }
  }

  async calculateSubjectAnalysis(options?: {
    term?: string;
    year?: number;
    classId?: string;
  }): Promise<any[]> {
    try {
      const constraints = [];
      if (options?.term) constraints.push(where('term', '==', options.term));
      if (options?.year) constraints.push(where('year', '==', options.year));
      if (options?.classId) constraints.push(where('classId', '==', options.classId));

      const q = constraints.length > 0
        ? query(this.resultsCollection, ...constraints)
        : query(this.resultsCollection);

      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(doc => doc.data() as StudentResult);

      const subjectMap = new Map<string, {
        subject: string;
        percentages: number[];
        grades: number[];
      }>();

      results
        .filter(r => r.examType === 'endOfTerm' && r.percentage >= 0)
        .forEach(result => {
          const key = result.subjectId;
          if (!subjectMap.has(key)) {
            subjectMap.set(key, {
              subject: result.subjectName,
              percentages: [],
              grades: [],
            });
          }
          const subject = subjectMap.get(key)!;
          subject.percentages.push(result.percentage);
          subject.grades.push(result.grade);
        });

      return Array.from(subjectMap.entries()).map(([subjectId, data]) => {
        const avgScore = data.percentages.length > 0
          ? Math.round(data.percentages.reduce((a, b) => a + b, 0) / data.percentages.length)
          : 0;
        const passRate = data.percentages.length > 0
          ? Math.round((data.percentages.filter(p => p >= 50).length / data.percentages.length) * 100)
          : 0;

        const gradeCounts = new Map<number, number>();
        data.grades.forEach(grade => {
          gradeCounts.set(grade, (gradeCounts.get(grade) || 0) + 1);
        });

        let topGrade = 'N/A';
        let maxCount = 0;
        gradeCounts.forEach((count, grade) => {
          if (count > maxCount) {
            maxCount = count;
            topGrade = grade.toString();
          }
        });

        let difficulty: 'easy' | 'medium' | 'hard' = 'medium';
        if (avgScore >= 70) difficulty = 'easy';
        else if (avgScore <= 40) difficulty = 'hard';

        return {
          subject: data.subject,
          passRate,
          avgScore,
          topGrade,
          difficulty,
        };
      }).sort((a, b) => b.passRate - a.passRate);
    } catch (error) {
      console.error('Error calculating subject analysis:', error);
      return [];
    }
  }

  calculateGradeDistribution(results: StudentResult[]): Array<{
    grade: number;
    count: number;
    percentage: number;
    description: string;
  }> {
    const studentSubjectAverages = new Map<string, number[]>();

    const resultGroups = new Map<string, StudentResult[]>();
    results
      .filter(r => r.percentage >= 0)
      .forEach(result => {
        const key = `${result.studentId}_${result.subjectId}`;
        if (!resultGroups.has(key)) {
          resultGroups.set(key, []);
        }
        resultGroups.get(key)!.push(result);
      });

    resultGroups.forEach((groupResults, key) => {
      const percentages = groupResults.map(r => r.percentage);
      const avgPercentage = percentages.reduce((a, b) => a + b, 0) / percentages.length;
      const grade = calculateGrade(avgPercentage);

      if (!studentSubjectAverages.has(key)) {
        studentSubjectAverages.set(key, []);
      }
      studentSubjectAverages.get(key)!.push(grade);
    });

    const gradeCounts = new Map<number, number>();
    for (let i = 1; i <= 9; i++) {
      gradeCounts.set(i, 0);
    }

    studentSubjectAverages.forEach(grades => {
      grades.forEach(grade => {
        gradeCounts.set(grade, (gradeCounts.get(grade) || 0) + 1);
      });
    });

    const total = Array.from(studentSubjectAverages.values())
      .reduce((sum, grades) => sum + grades.length, 0);

    return Array.from(gradeCounts.entries())
      .map(([grade, count]) => ({
        grade,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        description: getGradeDescription(grade),
      }))
      .filter(g => g.count > 0);
  }

  calculatePerformanceTrend(results: StudentResult[]): Array<{
    month: string;
    avgMarks: number;
    passRate: number;
    improvement: 'up' | 'down' | 'stable';
  }> {
    const examTypes = ['week4', 'week8', 'endOfTerm'] as const;
    const examLabels = {
      week4: 'Week 4',
      week8: 'Week 8',
      endOfTerm: 'End of Term',
    };

    const trendData = examTypes.map(examType => {
      const examResults = results.filter(r => r.examType === examType && r.percentage >= 0);
      const totalPercentage = examResults.reduce((sum, r) => sum + r.percentage, 0);
      const avgMarks = examResults.length > 0 ? Math.round(totalPercentage / examResults.length) : 0;
      const passRate = examResults.length > 0
        ? Math.round((examResults.filter(r => r.percentage >= 50).length / examResults.length) * 100)
        : 0;

      return {
        month: examLabels[examType],
        avgMarks,
        passRate,
      };
    });

    return trendData.map((data, index) => {
      if (index === 0) return { ...data, improvement: 'stable' as const };

      const prevData = trendData[index - 1];
      const avgDiff = data.avgMarks - prevData.avgMarks;
      const passDiff = data.passRate - prevData.passRate;

      let improvement: 'up' | 'down' | 'stable' = 'stable';
      if (avgDiff > 2 || passDiff > 3) improvement = 'up';
      else if (avgDiff < -2 || passDiff < -3) improvement = 'down';

      return { ...data, improvement };
    });
  }

  async getAnalyticsSummary(options?: {
    term?: string;
    year?: number;
    classId?: string;
  }): Promise<any> {
    try {
      const results = await this.getAllResults(options);

      return {
        gradeDistribution: this.calculateGradeDistribution(results),
        performanceTrend: this.calculatePerformanceTrend(results),
        totalStudents: Array.from(new Set(results.map(r => r.studentId))).length,
        averagePercentage: results.length > 0
          ? Math.round(
              results
                .filter(r => r.percentage >= 0)
                .reduce((sum, r) => sum + r.percentage, 0) /
              Math.max(results.filter(r => r.percentage >= 0).length, 1)
            )
          : 0,
        passRate: results.length > 0
          ? Math.round(
              (results.filter(r => r.percentage >= 50).length /
               Math.max(results.filter(r => r.percentage >= 0).length, 1)) * 100
            )
          : 0,
      };
    } catch (error) {
      console.error('Error getting analytics summary:', error);
      throw error;
    }
  }

  // ==================== HELPER METHODS ====================

  async getClassData(classId: string): Promise<any> {
    try {
      const classDoc = await getDoc(doc(this.classesCollection, classId));
      return classDoc.exists() ? classDoc.data() : null;
    } catch (error) {
      console.error('Error getting class data:', error);
      return null;
    }
  }

  async debugCheckStudentData(
    studentId: string,
    term: string,
    year: number
  ): Promise<void> {
    console.log(`🔍 DEBUG: Checking data for student ${studentId}, ${term} ${year}`);

    const studentDoc = await this.resolveStudentDocument(studentId);
    if (!studentDoc) {
      console.log(`❌ Student not found`);
      return;
    }

    console.log(`✅ Student found:`, {
      name: studentDoc.data.name,
      customId: studentDoc.customId,
      documentId: studentDoc.documentId,
      classId: studentDoc.data.classId
    });

    const results = await this.getStudentResults(studentDoc.documentId, { term, year });

    console.log(`📊 Found ${results.length} results:`);
    results.forEach(r => {
      console.log(`   - ${r.subjectName} (${r.examType}): ${r.marks === -2 ? 'N/A' : (r.marks === -1 ? 'ABS' : r.percentage + '%')}`);
    });
  }

  // ==================== SMS COMPOSITION METHODS ====================

  /**
   * Build the SMS body for a single student using the current DB state.
   * Moderate compaction — readable, single-segment where possible.
   */
  async formatStudentResultsSMSAsync(
    inputStudentId: string,
    term: string,
    year: number,
    options: SMSFormatOptions = {}
  ): Promise<{ body: string; segments: SMSSegmentInfo; payload: SMSStudentPayload } | null> {
    try {
      const report = await this.generateReportCard(inputStudentId, term, year, {
        includeIncomplete: true,
        markMissing: true,
      });

      if (!report) {
        console.warn(`⚠️ No report data for ${inputStudentId} — cannot format SMS.`);
        return null;
      }

      const payload: SMSStudentPayload = {
        studentName: report.studentName,
        studentId: report.studentId,
        className: report.className,
        term: report.term,
        year: report.year,
        subjects: report.subjects.map(s => ({
          subjectName: s.subjectName,
          percentage: typeof s.averagePercentage === 'number' && s.averagePercentage >= 0
            ? s.averagePercentage
            : (typeof s.endOfTerm === 'number' && s.endOfTerm >= 0 ? s.endOfTerm : -1),
        })),
        overallPercentage: report.percentage,
        overallGrade: report.overallGrade,
      };

      const body = formatStudentResultsSMS(payload, options);
      const segments = getSmsSegments(body);

      return { body, segments, payload };
    } catch (error) {
      console.error('Error formatting SMS from DB:', error);
      return null;
    }
  }

  // ==================== PRIVATE HELPERS ====================

  private generateResultId(
    studentDocumentId: string,
    subjectId: string,
    examType: string,
    term: string,
    year: number
  ): string {
    const cleanTerm = term.replace(/\s+/g, '');
    return `${studentDocumentId}_${subjectId}_${examType}_${cleanTerm}_${year}`;
  }

  private generateSubjectComment(
    grade: number,
    averagePercentage: number,
    missingExams: string[],
    hasNotConducted: boolean = false
  ): string {
    if (missingExams.length > 0) {
      return `Missing: ${missingExams.join(', ')}. ${averagePercentage >= 0 ? `Average: ${averagePercentage}%.` : ''}`;
    }

    if (hasNotConducted) {
      return 'Some assessments were not conducted.';
    }

    if (averagePercentage < 0) return 'No assessment data available.';

    const comments: Record<number, string> = {
      1: 'Outstanding performance showing exceptional mastery across all assessments.',
      2: 'Excellent work with strong understanding demonstrated consistently.',
      3: 'Very good performance with solid comprehension throughout.',
      4: 'Good grasp of concepts with consistent effort shown in all tests.',
      5: 'Commendable effort showing satisfactory understanding overall.',
      6: 'Acceptable performance meeting basic subject requirements.',
      7: 'Fair performance across assessments; more practice and review needed.',
      8: 'Below expectations; requires additional support and guidance.',
      9: 'Needs immediate intervention and intensive remedial work.',
    };

    return comments[grade] || 'Assessment completed.';
  }

  private generateTeacherComment(overallPercentage: number, subjects: SubjectResultSummary[]): string {
    const validSubjects = subjects.filter(s => s.averagePercentage >= 0);
    const passCount = validSubjects.filter(s => s.averagePercentage >= 50).length;
    const totalSubjects = validSubjects.length;

    const sortedSubjects = [...validSubjects].sort((a, b) => b.averagePercentage - a.averagePercentage);
    const strongest = sortedSubjects[0];
    const weakest = sortedSubjects[sortedSubjects.length - 1];

    if (overallPercentage >= 70) {
      return `Excellent overall performance with ${overallPercentage}% average. Particularly strong in ${strongest?.subjectName}. Keep up the outstanding work across all subjects!`;
    } else if (overallPercentage >= 50) {
      return `Good overall performance with ${passCount}/${totalSubjects} subjects passed (${overallPercentage}% average). Focus more attention on ${weakest?.subjectName} for improvement next term.`;
    } else {
      return `Performance requires improvement with ${overallPercentage}% average. Need to focus on ${weakest?.subjectName} and all core subjects. Additional support and remedial classes recommended.`;
    }
  }

  private async calculatePosition(
    studentDocumentId: string,
    classId: string,
    term: string,
    year: number
  ): Promise<string> {
    try {
      const q = query(
        this.resultsCollection,
        where('classId', '==', classId),
        where('term', '==', term),
        where('year', '==', year)
      );

      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(doc => doc.data() as StudentResult);

      if (results.length === 0) return '1/1';

      const studentAverages = new Map<string, { name: string; percentages: number[] }>();
      const studentResults = new Map<string, Map<string, number[]>>();

      results
        .filter(r => r.percentage >= 0)
        .forEach(result => {
          if (!studentResults.has(result.studentId)) {
            studentResults.set(result.studentId, new Map());
          }
          const subjectMap = studentResults.get(result.studentId)!;
          if (!subjectMap.has(result.subjectId)) {
            subjectMap.set(result.subjectId, []);
          }
          subjectMap.get(result.subjectId)!.push(result.percentage);
        });

      studentResults.forEach((subjectMap, studentId) => {
        const subjectAverages: number[] = [];
        subjectMap.forEach(percentages => {
          const avg = percentages.reduce((a, b) => a + b, 0) / percentages.length;
          subjectAverages.push(avg);
        });

        const studentAvg = subjectAverages.reduce((a, b) => a + b, 0) / subjectAverages.length;
        const studentResult = results.find(r => r.studentId === studentId);

        studentAverages.set(studentId, {
          name: studentResult?.studentName || 'Unknown',
          percentages: [studentAvg]
        });
      });

      const rankings = Array.from(studentAverages.entries())
        .map(([id, data]) => ({
          studentId: id,
          name: data.name,
          average: data.percentages[0],
        }))
        .sort((a, b) => b.average - a.average);

      const position = rankings.findIndex(r => r.studentId === studentDocumentId) + 1;
      const total = rankings.length;

      return `${position}/${total}`;
    } catch (error) {
      console.error('Error calculating position:', error);
      return '—';
    }
  }

  private async calculateImprovement(
    studentDocumentId: string,
    currentTerm: string,
    currentYear: number
  ): Promise<'improved' | 'declined' | 'stable'> {
    try {
      const termMap = { 'Term 1': 'Term 3', 'Term 2': 'Term 1', 'Term 3': 'Term 2' };
      const previousTerm = termMap[currentTerm as keyof typeof termMap];
      const previousYear = currentTerm === 'Term 1' ? currentYear - 1 : currentYear;

      const currentResults = await this.getStudentResults(studentDocumentId, {
        term: currentTerm,
        year: currentYear,
      });

      const previousResults = await this.getStudentResults(studentDocumentId, {
        term: previousTerm,
        year: previousYear,
      });

      const currentSubjectAverages = this.calculateSubjectAverages(currentResults);
      const currentOverall = currentSubjectAverages.length > 0
        ? currentSubjectAverages.reduce((a, b) => a + b, 0) / currentSubjectAverages.length
        : 0;

      const previousSubjectAverages = this.calculateSubjectAverages(previousResults);
      const previousOverall = previousSubjectAverages.length > 0
        ? previousSubjectAverages.reduce((a, b) => a + b, 0) / previousSubjectAverages.length
        : 0;

      if (previousOverall === 0) return 'stable';

      const difference = currentOverall - previousOverall;
      if (difference > 3) return 'improved';
      if (difference < -3) return 'declined';
      return 'stable';
    } catch (error) {
      console.error('Error calculating improvement:', error);
      return 'stable';
    }
  }

  private calculateSubjectAverages(results: StudentResult[]): number[] {
    const subjectGroups = new Map<string, number[]>();

    results
      .filter(r => r.percentage >= 0)
      .forEach(result => {
        if (!subjectGroups.has(result.subjectId)) {
          subjectGroups.set(result.subjectId, []);
        }
        subjectGroups.get(result.subjectId)!.push(result.percentage);
      });

    const averages: number[] = [];
    subjectGroups.forEach(percentages => {
      const avg = percentages.reduce((a, b) => a + b, 0) / percentages.length;
      averages.push(avg);
    });

    return averages;
  }
}

// Export singleton instance
export const resultsService = new ResultsService();