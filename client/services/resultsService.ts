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
import { getAuth } from 'firebase/auth';
import type { DocumentData } from 'firebase/firestore';
import * as engine from '@/services/assignmentEngine';
import {
  MARK,
  buildReportCard,
  classPositions,
  gradeForPercentage,
  learnerProgress,
  subjectProgress,
  type GridCell,
  type ReportCard,
} from '@/services/resultsGrid';
import {
  loadClassGrid,
  loadClassRoster,
  loadClassSubjects,
  slotKeyFor,
  type LoadedClassGrid,
} from '@/services/resultsGridLoader';

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
  /** Slot key segment (class_slots/{classId}__{normalizedSubject}) — used by Firestore rules. */
  normalizedSubject?: string;
  /** uid that first saved this row (set once, never changed). */
  enteredBy?: string;
  /** uid of the last save. */
  lastEditedBy?: string;
}

export interface SaveClassResultsResponse {
  success: boolean;
  count: number;
  results: StudentResult[];
  overwritten: boolean;
  /** Rows that were NOT saved, with the reason (never dropped silently). */
  skipped: Array<{ studentId: string; studentName: string; reason: string }>;
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

/**
 * A report card. Built by the shared grid (resultsGrid.buildReportCard), so
 * the admin card, PDFs, SMS and Parent Portal all use the same numbers.
 */
export type ReportCardData = ReportCard;

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
  gender?: string;
  /** Exams active for the term (the only ones counted). */
  activeExams?: string[];
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
  /** Active learners (document ids) still without a mark, per exam. */
  missingStudentIds?: {
    week4: string[];
    week8: string[];
    endOfTerm: string[];
  };
  /** Exams active for the term (the only ones counted). */
  activeExams?: string[];
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
  /** Some subjects still have pending marks — the SMS says PROVISIONAL. */
  provisional?: boolean;
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

/** ECZ grade 1–9 (single definition lives in resultsGrid). */
export const calculateGrade = (percentage: number): number => gradeForPercentage(percentage);

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
  lines.push(`AVG ${payload.overallPercentage}${gradePart}${payload.provisional ? ' PROVISIONAL' : ''}`);

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

  /**
   * Find a learner by Firestore document id (preferred) or custom id.
   * If several learners share a custom id, an active one is preferred.
   */
  private async resolveStudentDocument(inputId: string): Promise<{
    documentId: string;
    customId: string;
    data: any;
  } | null> {
    if (!inputId) return null;
    try {
      const docSnap = await getDoc(doc(this.learnersCollection, inputId));
      if (docSnap.exists()) {
        const data = docSnap.data();
        return { documentId: inputId, customId: data.studentId || inputId, data };
      }
    } catch {
      // not a valid document id — fall through to the custom-id lookup
    }
    const customSnapshot = await getDocs(query(this.learnersCollection, where('studentId', '==', inputId)));
    if (customSnapshot.empty) return null;
    const pick =
      customSnapshot.docs.find(d => (d.data().status ?? 'active') === 'active') ?? customSnapshot.docs[0];
    return { documentId: pick.id, customId: inputId, data: pick.data() };
  }

  // ==================== TEACHER ASSIGNMENTS ====================

  /**
   * The subjects a class currently takes and who is responsible for each.
   *
   * Source: class_slots (or current assignment rows before the slot
   * migration) via the shared grid loader. Ended assignment rows and the
   * Form Teacher role are NOT subjects — counting them made removed subjects
   * and the Form Teacher show up as "expected" on report cards.
   *
   * `teacherId` is whoever may enter marks right now (live cover/TP, else
   * the owner). `id` is the slot key.
   */
  async getTeacherAssignmentsForClass(classId: string): Promise<Array<{
    id: string;
    subject: string;
    subjectId: string;
    teacherId: string;
    teacherName: string;
    classId: string;
  }>> {
    const subjects = await loadClassSubjects(classId);
    return subjects
      .filter(s => !s.isVacant)
      .map(s => ({
        id: s.slotKey,
        subject: s.subjectName,
        subjectId: s.subjectId,
        teacherId: s.operatorTeacherId || s.ownerTeacherId || 'unknown',
        teacherName: s.operatorTeacherName || s.ownerTeacherName || 'Not Assigned',
        classId,
      }));
  }

  async getExpectedSubjectsForClass(classId: string): Promise<Array<{ id: string; name: string }>> {
    const assignments = await this.getTeacherAssignmentsForClass(classId);
    return assignments.map(a => ({ id: a.subjectId, name: a.subject }));
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
      // Use the document id: older rows may lack an `id` field.
      const results = snapshot.docs.map(d => ({ ...(d.data() as StudentResult), id: d.id }));

      return {
        exists: results.length > 0,
        count: results.length,
        results
      };
    } catch (error) {
      console.error('Error checking existing results:', error);
      // Rethrow: treating a failed read as "nothing saved" would make a save
      // overwrite rows it thinks are new.
      throw error;
    }
  }

  // ==================== SAVE RESULTS ====================

  /**
   * Save marks for one class + subject + exam.
   *
   * - Learners are matched by Firestore document id (custom ids are still
   *   accepted for older callers). Learners who are not active members of the
   *   class are NOT silently dropped: they are returned in `skipped`.
   * - Marks must be -1 (absent), -2 (not conducted) or 0..totalMarks.
   * - The subject's owner (even while covered) or a live cover/TP teacher
   *   may save. Firestore rules enforce the same once
   *   system/assignmentEngine.enforceAuthority is switched on.
   * - Rows carry `normalizedSubject` (the slot key) plus `enteredBy` (set
   *   once, on create) and `lastEditedBy`, which the rules require.
   * - Only learners passed in `results` are written; other saved marks for
   *   the same exam are left as they are.
   */
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
  ): Promise<SaveClassResultsResponse> {
    const normalizedSubjectId = normalizeSubjectName(data.subjectId);
    const normalizedSubjectName = normalizeSubjectName(data.subjectName);
    const year = Number(data.year);
    const totalMarks = Number(data.totalMarks);

    if (!Number.isInteger(year)) throw new Error('Invalid year.');
    if (!(totalMarks > 0)) {
      throw new Error('Total marks for this exam are not set. Ask the admin to set them in Exam Management.');
    }

    // Who may enter marks: the subject's owner (always, even while covered)
    // or a cover/TP teacher while their cover is live. Same rule as
    // firestore.rules (canEnterMarks).
    // The class's real slot (also when it was keyed under an older
    // spelling); its id is what the Firestore rules check.
    const slot = (await engine.isEngineReady())
      ? await this.assertCanEnterMarks(data.teacherId, data.classId, data.subjectId)
      : null;

    const existing = await this.checkExistingResults(
      data.classId, normalizedSubjectId, data.examType, data.term, year
    );
    if (existing.exists && !options?.overwrite) {
      throw new Error(
        `Results already exist for ${normalizedSubjectName} - ${data.examType}. ` +
        `Use overwrite option to replace.`
      );
    }
    const existingIds = new Set(existing.results.map(r => r.id));

    const [classDoc, roster] = await Promise.all([
      getDoc(doc(this.classesCollection, data.classId)),
      loadClassRoster(data.classId),
    ]);
    const form = classDoc.data()?.level?.toString() || '1';
    const byDocId = new Map(roster.map(l => [l.id, l]));
    const byCustomId = new Map(roster.filter(l => l.studentId).map(l => [l.studentId, l]));

    const uid = getAuth().currentUser?.uid ?? data.teacherId;
    const slotKey = slot
      ? slot.id.slice(data.classId.length + 2)
      : slotKeyFor(data.classId, normalizedSubjectId);
    const now = new Date().toISOString();

    const saved: StudentResult[] = [];
    const skipped: SaveClassResultsResponse['skipped'] = [];
    const writes: Array<{ id: string; payload: Record<string, any> }> = [];

    for (const r of data.results) {
      const learner = byDocId.get(r.studentId) ?? byCustomId.get(r.studentId);
      if (!learner) {
        skipped.push({ studentId: r.studentId, studentName: r.studentName, reason: 'Not an active learner in this class' });
        continue;
      }
      const marks = Number(r.marks);
      const valid =
        marks === MARK.ABSENT ||
        marks === MARK.NOT_CONDUCTED ||
        (Number.isFinite(marks) && marks >= 0 && marks <= totalMarks);
      if (!valid) {
        skipped.push({ studentId: r.studentId, studentName: r.studentName, reason: `Mark ${r.marks} is not between 0 and ${totalMarks}` });
        continue;
      }

      let percentage = -1;
      let grade = -1;
      let status: StudentResult['status'];
      if (marks === MARK.NOT_CONDUCTED) status = 'not_conducted';
      else if (marks === MARK.ABSENT) status = 'absent';
      else {
        percentage = Math.round((marks / totalMarks) * 100);
        grade = calculateGrade(percentage);
        status = 'entered';
      }

      const id = this.generateResultId(learner.id, normalizedSubjectId, data.examType, data.term, year);
      const isNew = !existingIds.has(id);
      const resultData: StudentResult = {
        id,
        studentId: learner.id,
        studentName: learner.name || r.studentName,
        classId: data.classId,
        className: data.className,
        form,
        subjectId: normalizedSubjectId,
        subjectName: normalizedSubjectName,
        normalizedSubject: slotKey,
        teacherId: data.teacherId,
        teacherName: data.teacherName,
        examType: data.examType,
        examName: data.examName,
        marks,
        totalMarks,
        percentage,
        grade,
        term: data.term,
        year,
        status,
        updatedAt: now,
        lastEditedBy: uid,
        customStudentId: learner.studentId || learner.id,
        ...(isNew ? { createdAt: now, enteredBy: uid } : {}),
      } as StudentResult;

      writes.push({ id, payload: resultData });
      saved.push(resultData);
    }

    // Firestore batches hold at most 500 writes.
    for (let i = 0; i < writes.length; i += 450) {
      const batch = writeBatch(db);
      for (const w of writes.slice(i, i + 450)) {
        batch.set(doc(this.resultsCollection, w.id), w.payload, { merge: true });
      }
      await batch.commit();
    }
    this.invalidateGrid(data.classId);

    return {
      success: true,
      count: saved.length,
      results: saved,
      overwritten: existing.exists,
      skipped,
    };
  }

  /** Throws unless the teacher owns the slot or is its live cover/TP. */
  private async assertCanEnterMarks(teacherId: string, classId: string, subject: string): Promise<engine.ClassSlot> {
    const slot = await engine.findSlotForSubject(classId, subject);
    const auth = engine.resolveAuthority(slot);
    if (slot && (slot.ownerTeacherId === teacherId || auth.operatorTeacherId === teacherId)) return slot;
    throw new engine.AssignmentRuleError(
      'NOT_OPERATOR',
      `You are not assigned to ${slot?.subject || subject} in ${slot?.className || 'this class'}, ` +
        `so you cannot enter its marks.`
    );
  }

  /**
   * Record that an exam was not held for this class + subject: every active
   * learner gets -2. Refuses if real marks or absences are already saved —
   * those must be deleted first, so nobody's mark is overwritten by mistake.
   */
  async markExamNotConducted(data: {
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
  }): Promise<SaveClassResultsResponse> {
    const existing = await this.checkExistingResults(
      data.classId, normalizeSubjectName(data.subjectId), data.examType, data.term, Number(data.year)
    );
    const real = existing.results.filter(r => r.marks !== MARK.NOT_CONDUCTED);
    if (real.length > 0) {
      throw new Error(
        `${real.length} mark(s) are already saved for this exam. ` +
        `Delete them first if the exam was not conducted.`
      );
    }
    const roster = await loadClassRoster(data.classId);
    return this.saveClassResults(
      {
        ...data,
        results: roster.map(l => ({ studentId: l.id, studentName: l.name, marks: MARK.NOT_CONDUCTED })),
      },
      { overwrite: true }
    );
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
      this.invalidateGrid(data.classId);
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
        lastEditedBy: getAuth().currentUser?.uid ?? null,
      });
      this.invalidateGrid();

      const updatedDoc = await getDoc(docRef);
      return updatedDoc.data() as StudentResult;
    } catch (error) {
      console.error('Error updating result:', error);
      return null;
    }
  }

  // ==================== SHARED GRID (cached briefly) ====================
  //
  // Report Cards, SMS and Parent Portal all read one class grid. A short
  // cache stops a class of 40 from loading the same grid 40 times while one
  // screen builds its cards. Any save or delete clears it.

  private gridCache = new Map<string, { at: number; promise: Promise<LoadedClassGrid> }>();
  private static GRID_TTL_MS = 15_000;

  loadGrid(classId: string, term: string, year: number, opts: { publicView?: boolean } = {}): Promise<LoadedClassGrid> {
    const key = `${classId}|${term}|${year}${opts.publicView ? '|public' : ''}`;
    const hit = this.gridCache.get(key);
    if (hit && Date.now() - hit.at < ResultsService.GRID_TTL_MS) return hit.promise;
    const promise = loadClassGrid(classId, term, Number(year), { publicFallback: !!opts.publicView });
    this.gridCache.set(key, { at: Date.now(), promise });
    promise.catch(() => this.gridCache.delete(key));
    return promise;
  }

  invalidateGrid(classId?: string): void {
    if (!classId) {
      this.gridCache.clear();
      return;
    }
    for (const key of [...this.gridCache.keys()]) {
      if (key.startsWith(`${classId}|`)) this.gridCache.delete(key);
    }
  }

  // ==================== STUDENT PROGRESS (Report Cards list) ====================

  /**
   * One row per active learner, from the shared grid. The progress bar is
   * completed subjects / subjects (Form Teacher and dropped subjects are not
   * subjects); averages use only the term's active exams.
   */
  async getStudentProgress(
    classId: string,
    term: string,
    year: number
  ): Promise<StudentProgress[]> {
    const loaded = await this.loadGrid(classId, term, year);
    return loaded.grid.learners.map(l => this.toStudentProgress(loaded, l.id));
  }

  private toStudentProgress(loaded: LoadedClassGrid, learnerId: string): StudentProgress {
    const { grid, classInfo } = loaded;
    const p = learnerProgress(grid, learnerId);
    const learner = grid.learners.find(l => l.id === learnerId)!;
    const cellOut = (c: GridCell | undefined): StudentProgress['subjects'][number]['week4'] => {
      if (!c) return { status: 'missing' };
      if (c.status === 'entered') return { status: 'complete', marks: c.percentage ?? undefined };
      if (c.status === 'absent') return { status: 'absent', marks: MARK.ABSENT };
      if (c.status === 'not_conducted') return { status: 'not_conducted', marks: MARK.NOT_CONDUCTED };
      return { status: 'missing' };
    };
    const examCount = grid.activeExams.length;
    return {
      studentId: learner.studentId || learner.id,
      documentId: learner.id,
      studentName: p.name,
      className: classInfo.name,
      classId: classInfo.id,
      form: classInfo.form,
      gender: learner.gender,
      overallPercentage: p.overallPercentage,
      overallGrade: p.overallGrade,
      status: p.status,
      isComplete: p.isComplete,
      completionPercentage: p.completionPercentage,
      subjects: p.subjects.map(s => {
        const done = grid.activeExams.filter(e => s.cells[e] && s.cells[e].status !== 'pending').length;
        return {
          subjectId: s.subjectId,
          subjectName: s.subjectName,
          teacherName: s.teacherName,
          week4: cellOut(s.cells.week4),
          week8: cellOut(s.cells.week8),
          endOfTerm: cellOut(s.cells.endOfTerm),
          averagePercentage: s.average >= 0 ? s.average : undefined,
          subjectProgress: examCount > 0 ? Math.round((done / examCount) * 100) : 0,
          grade: s.grade,
        };
      }),
      missingSubjects: p.totalSubjects - p.completedSubjects,
      totalSubjects: p.totalSubjects,
      activeExams: grid.activeExams,
    };
  }

  // ==================== REPORT CARD GENERATION ====================

  private cardFor(
    loaded: LoadedClassGrid,
    learnerId: string,
    learnerData: DocumentData | undefined,
    positions: Map<string, string>,
    improvement: 'improved' | 'declined' | 'stable'
  ): ReportCardData {
    return buildReportCard(loaded.grid, learnerId, {
      classId: loaded.classInfo.id,
      className: loaded.classInfo.name,
      form: loaded.classInfo.form,
      term: loaded.term,
      year: loaded.year,
      gender: learnerData?.gender,
      parentsPhone: learnerData?.guardianPhone || learnerData?.parentPhone || learnerData?.parentsPhone || '',
      parentsEmail: learnerData?.parentEmail || learnerData?.parentsEmail || '',
      positions,
      improvement,
    });
  }

  /** True when at least one cell (entered, absent or not conducted) exists. */
  private hasAnyEntry(card: ReportCardData): boolean {
    return card.subjects.some(s =>
      [s.week4, s.week8, s.endOfTerm].some(v => v !== MARK.PENDING)
    );
  }

  /**
   * Report card for one learner, built from the shared grid — the same
   * numbers the Report Cards list, the admin PDF, the SMS and the Parent
   * Portal show. Returns null when the learner is not an active member of
   * their class or nothing has been entered yet.
   */
  async generateReportCard(
    inputStudentId: string,
    term: string,
    year: number,
    options?: {
      includeIncomplete?: boolean;
      markMissing?: boolean;
      /** Parent Portal (signed out). */
      publicView?: boolean;
    }
  ): Promise<(ReportCardData & { degraded?: boolean }) | null> {
    const studentDoc = await this.resolveStudentDocument(inputStudentId);
    if (!studentDoc) {
      console.warn(`⚠️ Student not found: ${inputStudentId}`);
      return null;
    }
    const classId = studentDoc.data.classId;
    if (!classId) return null;

    const loaded = await this.loadGrid(classId, term, year, { publicView: options?.publicView });
    if (!loaded.grid.learners.some(l => l.id === studentDoc.documentId)) return null;

    const improvement = await this.calculateImprovement(studentDoc.documentId, term, year).catch(
      () => 'stable' as const
    );
    const card = this.cardFor(loaded, studentDoc.documentId, studentDoc.data, classPositions(loaded.grid), improvement);

    if (!this.hasAnyEntry(card)) return null;
    if (!card.isComplete && !options?.includeIncomplete) return null;
    return loaded.degraded ? { ...card, degraded: true } : card;
  }

  /** All report cards for a class from ONE grid load (positions computed once). */
  async generateClassReportCards(
    classId: string,
    term: string,
    year: number,
    options?: {
      includeIncomplete?: boolean;
      markMissing?: boolean;
    }
  ): Promise<BulkReportOperation> {
    const loaded = await this.loadGrid(classId, term, year);
    const positions = classPositions(loaded.grid);
    const learnerDocs = await getDocs(query(this.learnersCollection, where('classId', '==', classId)));
    const dataById = new Map(learnerDocs.docs.map(d => [d.id, d.data()]));
    const includeIncomplete = options?.includeIncomplete ?? true;

    const cards = await Promise.all(
      loaded.grid.learners.map(async l => {
        const improvement = await this.calculateImprovement(l.id, term, year).catch(() => 'stable' as const);
        return this.cardFor(loaded, l.id, dataById.get(l.id), positions, improvement);
      })
    );
    const reportCards = cards
      .filter(c => this.hasAnyEntry(c))
      .filter(c => includeIncomplete || c.isComplete)
      .sort((a, b) => a.studentName.localeCompare(b.studentName));

    const passed = reportCards.filter(r => r.status === 'pass').length;
    const failed = reportCards.filter(r => r.status === 'fail').length;
    const complete = reportCards.filter(r => r.isComplete).length;
    return {
      reportCards,
      summary: {
        total: reportCards.length,
        passed,
        failed,
        avgPercentage: reportCards.length
          ? Math.round(reportCards.reduce((s, r) => s + r.percentage, 0) / reportCards.length)
          : 0,
        complete,
        incomplete: reportCards.length - complete,
      },
    };
  }

  // ==================== SUBJECT COMPLETION (Results Entry) ====================

  /**
   * Per-subject completion for a class, from the shared grid — the same
   * numbers the Results Entry Monitor shows for that class and subject.
   * Exams that are not active this term report 0 and complete = false.
   */
  async getSubjectCompletionStatus(
    classId: string,
    term: string,
    year: number
  ): Promise<SubjectCompletionStatus[]> {
    const { grid, classInfo } = await this.loadGrid(classId, term, year);
    return grid.subjects.map(s => {
      const sp = subjectProgress(grid, s.subjectId);
      const ex = (t: string) => sp.exams.find(e => e.examType === t);
      const doneIds = (t: string) => {
        const e = ex(t);
        if (!e) return [];
        const missing = new Set(e.missingLearnerIds);
        return grid.learners.filter(l => !missing.has(l.id)).map(l => l.id);
      };
      return {
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        teacherId: s.operatorTeacherId || s.ownerTeacherId || '',
        teacherName: s.operatorTeacherName || s.ownerTeacherName || 'Not assigned',
        classId,
        className: classInfo.name,
        term,
        year,
        week4Complete: ex('week4')?.percentage === 100,
        week8Complete: ex('week8')?.percentage === 100,
        endOfTermComplete: ex('endOfTerm')?.percentage === 100,
        percentComplete: sp.completionPercentage,
        totalStudents: sp.totalStudents,
        enteredStudents: {
          week4: ex('week4')?.doneCount ?? 0,
          week8: ex('week8')?.doneCount ?? 0,
          endOfTerm: ex('endOfTerm')?.doneCount ?? 0,
        },
        enteredStudentIds: {
          week4: doneIds('week4'),
          week8: doneIds('week8'),
          endOfTerm: doneIds('endOfTerm'),
        },
        missingStudentIds: {
          week4: ex('week4')?.missingLearnerIds ?? [],
          week8: ex('week8')?.missingLearnerIds ?? [],
          endOfTerm: ex('endOfTerm')?.missingLearnerIds ?? [],
        },
        notConducted: {
          week4: ex('week4')?.notConducted ?? false,
          week8: ex('week8')?.notConducted ?? false,
          endOfTerm: ex('endOfTerm')?.notConducted ?? false,
        },
        activeExams: grid.activeExams,
      };
    });
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

  /** SMS payload from a report card — the same numbers the card prints. */
  smsPayloadFromCard(card: ReportCardData): SMSStudentPayload {
    return {
      studentName: card.studentName,
      studentId: card.studentId,
      className: card.className,
      term: card.term,
      year: card.year,
      subjects: card.subjects.map(s => ({ subjectName: s.subjectName, percentage: s.average })),
      overallPercentage: card.percentage,
      overallGrade: card.grade,
      provisional: card.isProvisional,
    };
  }

  /**
   * Build the SMS body for a single student from their report card, so the
   * guardian receives exactly the average and grade on the report card.
   */
  async formatStudentResultsSMSAsync(
    inputStudentId: string,
    term: string,
    year: number,
    options: SMSFormatOptions = {}
  ): Promise<{ body: string; segments: SMSSegmentInfo; payload: SMSStudentPayload } | null> {
    try {
      const card = await this.generateReportCard(inputStudentId, term, year, { includeIncomplete: true });
      if (!card) {
        console.warn(`⚠️ No report data for ${inputStudentId} — cannot format SMS.`);
        return null;
      }
      const payload = this.smsPayloadFromCard(card);
      const body = formatStudentResultsSMS(payload, options);
      return { body, segments: getSmsSegments(body), payload };
    } catch (error) {
      console.error('Error formatting SMS from DB:', error);
      return null;
    }
  }

  /**
   * SMS bodies for every learner in a class with results, from ONE grid load.
   * `studentId` is the same id the SMS backend has always received
   * (the custom id, or the document id when a learner has none).
   */
  async formatClassResultsSMSAsync(
    classId: string,
    term: string,
    year: number,
    options: SMSFormatOptions = {}
  ): Promise<{
    rosterSize: number;
    messages: Array<{
      studentId: string;
      documentId: string;
      studentName: string;
      body: string;
      segments: SMSSegmentInfo;
      payload: SMSStudentPayload;
    }>;
  }> {
    const [bulk, legacyIds, loaded] = await Promise.all([
      this.generateClassReportCards(classId, term, year, { includeIncomplete: true }),
      this.getLearnersInClass(classId),
      this.loadGrid(classId, term, year),
    ]);
    const smsIdByDoc = new Map(legacyIds.map(l => [l.documentId, l.id]));
    const messages = bulk.reportCards.map(card => {
      const payload = this.smsPayloadFromCard(card);
      const body = formatStudentResultsSMS(payload, options);
      return {
        studentId: smsIdByDoc.get(card.documentId) ?? card.studentId,
        documentId: card.documentId,
        studentName: card.studentName,
        body,
        segments: getSmsSegments(body),
        payload,
      };
    });
    return { rosterSize: loaded.grid.learners.length, messages };
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