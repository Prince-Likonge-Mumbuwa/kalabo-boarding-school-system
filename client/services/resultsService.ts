// @/services/resultsService.ts
// COMPLETE REWRITE - ISACTIVE FILTER ELIMINATED
// Version 6.2.0 - Added missing analytics methods for teacher dashboard and results analysis

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
  marks: number;
  totalMarks: number;
  percentage: number;
  grade: number; // Grade for this specific exam
  term: string;
  year: number;
  status: 'entered' | 'absent' | 'not_entered';
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
  averagePercentage: number; // Average of all exams
  grade: number; // Grade based on average
  gradeDescription: string; // Description of the grade
  comment: string;
  isComplete: boolean;
  missingExams: string[];
}

export interface ReportCardData {
  id: string;
  studentId: string; // CUSTOM ID for display
  studentName: string;
  className: string;
  classId: string;
  form: string;
  overallGrade: number; // Grade based on overall average
  overallGradeDescription: string;
  position: string;
  gender: string;
  totalMarks: number;
  percentage: number; // Overall average percentage
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
  documentId?: string; // For debugging
}

export interface StudentProgress {
  studentId: string; // CUSTOM ID for display
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
    averagePercentage?: number; // Average of available scores
    subjectProgress: number;
    grade?: number;
  }>;
  missingSubjects: number;
  totalSubjects: number;
  documentId?: string;
}

export interface ReportReadinessCheck {
  isReady: boolean;
  studentId: string; // CUSTOM ID
  studentName: string;
  totalSubjects: number;
  completeSubjects: number;
  missingData: Array<{
    subject: string;
    subjectId: string;
    teacherName: string;
    missingExamTypes: string[];
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

// ==================== CONSTANTS ====================

const COLLECTIONS = {
  RESULTS: 'results',
  LEARNERS: 'learners',
  CLASSES: 'classes',
  TEACHER_ASSIGNMENTS: 'teacher_assignments',
  USERS: 'users',
  REPORT_CARDS: 'report_cards',
} as const;

const SUBJECT_NORMALIZATION_MAP: Record<string, string> = {
  'Mathematics': 'Mathematics', 'Maths': 'Mathematics', 'Math': 'Mathematics',
  'English': 'English', 'Eng': 'English',
  'Science': 'Science', 'General Science': 'Science',
  'Physics': 'Physics', 'Chemistry': 'Chemistry', 'Biology': 'Biology',
  'History': 'History', 'Geography': 'Geography',
  'Physical Education': 'Physical Education', 'PE': 'Physical Education',
  'Art': 'Art', 'Music': 'Music',
  'ICT': 'ICT', 'Computer Science': 'ICT', 'Computing': 'ICT',
  'Social Studies': 'Social Studies', 'Social': 'Social Studies',
  'Religious Education': 'Religious Education', 'RE': 'Religious Education',
  'Integrated Science': 'Integrated Science',
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

/**
 * Calculate average percentage from available scores
 * Handles missing scores by averaging only what's available
 */
export const calculateAveragePercentage = (scores: number[]): number => {
  const validScores = scores.filter(s => s >= 0);
  if (validScores.length === 0) return -1;
  return Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length);
};

// ==================== MAIN SERVICE ====================

class ResultsService {
  private resultsCollection = collection(db, COLLECTIONS.RESULTS);
  private learnersCollection = collection(db, COLLECTIONS.LEARNERS);
  private classesCollection = collection(db, COLLECTIONS.CLASSES);
  private teacherAssignmentsCollection = collection(db, COLLECTIONS.TEACHER_ASSIGNMENTS);
  private reportCardsCollection = collection(db, COLLECTIONS.REPORT_CARDS);

  /**
   * Initialize service and test connection
   */
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
  // ALL LEARNER QUERIES - NO ISACTIVE FILTERS

  /**
   * Get all learners in a class - NO STATUS FILTERS
   * Returns learners with CUSTOM IDs for display and document IDs for queries
   */
  async getLearnersInClass(classId: string): Promise<Array<{ 
    id: string; // CUSTOM ID for display
    name: string; 
    data: any;
    documentId: string; // Firestore document ID for queries
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
        
        // Get custom ID from various possible fields
        const customStudentId = data.studentId || 
                               data.id || 
                               data.registrationNumber || 
                               data.admissionNumber ||
                               doc.id; // Fallback to document ID
        
        return {
          id: customStudentId, // CUSTOM ID for display
          name,
          data: { ...data, firestoreDocId: doc.id },
          documentId: doc.id // Document ID for queries
        };
      });
      
      console.log(`✅ Found ${learners.length} learners in class ${classId}`);
      return learners;
    } catch (error) {
      console.error(`❌ Error fetching learners:`, error);
      return [];
    }
  }

  /**
   * Get learner count in a class
   */
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
   * Resolve any input ID to get both custom and document IDs
   * This is the KEY method for the dual ID system
   */
  private async resolveStudentDocument(inputId: string): Promise<{
    documentId: string;
    customId: string;
    data: any;
  } | null> {
    try {
      // Try to find by custom ID field
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

      // Try as document ID
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

  /**
   * Get teacher assignments for a class
   */
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

  /**
   * Get expected subjects for a class
   */
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

  /**
   * Get results for a student (using DOCUMENT ID for query)
   */
  async getStudentResults(
    studentDocumentId: string, // DOCUMENT ID for query
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

  /**
   * Get results for a specific teacher
   */
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

  /**
   * Get all results with filters
   */
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
      
      // Sort for consistent display
      return results.sort((a, b) => {
        if (a.className !== b.className) return a.className.localeCompare(b.className);
        return a.studentName.localeCompare(b.studentName);
      });
    } catch (error) {
      console.error('Error fetching all results:', error);
      return [];
    }
  }

  /**
   * Get results for a specific class and subject
   */
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

  /**
   * Check if results already exist
   */
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

  /**
   * Save class results for a subject/exam type
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
        studentId: string; // Can be custom ID or document ID
        studentName: string;
        marks: number;
      }>;
    },
    options?: { overwrite?: boolean }
  ): Promise<{ success: boolean; count: number; results: StudentResult[]; overwritten: boolean }> {
    try {
      const normalizedSubjectId = normalizeSubjectName(data.subjectId);
      const normalizedSubjectName = normalizeSubjectName(data.subjectName);

      // Check existing
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

      // Get class data for form
      const classDoc = await getDoc(doc(this.classesCollection, data.classId));
      const classData = classDoc.data();
      const form = classData?.level?.toString() || '1';

      for (const result of data.results) {
        // Resolve student IDs
        const studentDoc = await this.resolveStudentDocument(result.studentId);
        
        if (!studentDoc) {
          console.warn(`⚠️ Could not resolve student ID: ${result.studentId}, skipping...`);
          continue;
        }

        const percentage = result.marks < 0 ? -1 : Math.round((result.marks / data.totalMarks) * 100);
        const grade = calculateGrade(percentage);
        const status: StudentResult['status'] = result.marks < 0 ? 'absent' : 'entered';

        const resultData: StudentResult = {
          id: this.generateResultId(
            studentDoc.documentId,
            normalizedSubjectId,
            data.examType,
            data.term,
            data.year
          ),
          studentId: studentDoc.documentId, // Store DOCUMENT ID for queries
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
          customStudentId: studentDoc.customId // Store for reference
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

  /**
   * Update a single student result
   */
  async updateStudentResult(
    resultId: string,
    marks: number,
    totalMarks: number
  ): Promise<StudentResult | null> {
    try {
      const percentage = marks < 0 ? -1 : Math.round((marks / totalMarks) * 100);
      const grade = calculateGrade(percentage);
      const status: StudentResult['status'] = marks < 0 ? 'absent' : 'entered';
      
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

  // ==================== STUDENT PROGRESS ====================

  /**
   * Get progress for all students in a class
   * FIXED: Progress bars now work correctly
   */
  async getStudentProgress(
    classId: string,
    term: string,
    year: number
  ): Promise<StudentProgress[]> {
    try {
      console.log(`🔍 Getting progress for class: ${classId}, ${term} ${year}`);
      
      // Get all learners
      const learners = await this.getLearnersInClass(classId);
      if (learners.length === 0) return [];
      
      // Get expected subjects
      const expectedSubjects = await this.getExpectedSubjectsForClass(classId);
      
      // Get all results for this class
      const resultsQuery = query(
        this.resultsCollection,
        where('classId', '==', classId),
        where('term', '==', term),
        where('year', '==', year)
      );
      
      const resultsSnapshot = await getDocs(resultsQuery);
      const allResults = resultsSnapshot.docs.map(doc => doc.data() as StudentResult);
      
      // Group by student document ID
      const resultsByDocumentId = new Map<string, StudentResult[]>();
      allResults.forEach(result => {
        if (!resultsByDocumentId.has(result.studentId)) {
          resultsByDocumentId.set(result.studentId, []);
        }
        resultsByDocumentId.get(result.studentId)!.push(result);
      });

      // Get teacher assignments for teacher names
      const assignments = await this.getTeacherAssignmentsForClass(classId);
      
      // Build progress for each student
      const studentProgress: StudentProgress[] = [];
      
      for (const learner of learners) {
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
          
          // Calculate completion
          const week4Complete = !!week4Result;
          const week8Complete = !!week8Result;
          const endOfTermComplete = !!endOfTermResult;
          
          const completedExams = [week4Complete, week8Complete, endOfTermComplete].filter(Boolean).length;
          const subjectProgress = Math.round((completedExams / 3) * 100);
          
          if (subjectProgress === 100) totalSubjectsCompleted++;
          
          // Collect available scores for average calculation
          const availableScores = [];
          if (week4Result?.percentage >= 0) availableScores.push(week4Result.percentage);
          if (week8Result?.percentage >= 0) availableScores.push(week8Result.percentage);
          if (endOfTermResult?.percentage >= 0) availableScores.push(endOfTermResult.percentage);
          
          const averagePercentage = availableScores.length > 0 
            ? Math.round(availableScores.reduce((a, b) => a + b, 0) / availableScores.length)
            : undefined;
          
          // For overall percentage, use endOfTerm if available, otherwise average
          const subjectOverallScore = endOfTermResult?.percentage ?? averagePercentage ?? 0;
          if (subjectOverallScore > 0) {
            totalPercentage += subjectOverallScore;
            subjectsWithScores++;
          }
          
          subjects.push({
            subjectId: subject.id,
            subjectName: subject.name,
            teacherName: teacherAssignment?.teacherName || 'Not assigned',
            week4: {
              status: week4Result 
                ? (week4Result.status === 'absent' ? 'absent' : 'complete') 
                : 'missing',
              marks: week4Result?.percentage
            },
            week8: {
              status: week8Result 
                ? (week8Result.status === 'absent' ? 'absent' : 'complete') 
                : 'missing',
              marks: week8Result?.percentage
            },
            endOfTerm: {
              status: endOfTermResult 
                ? (endOfTermResult.status === 'absent' ? 'absent' : 'complete') 
                : 'missing',
              marks: endOfTermResult?.percentage
            },
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
        
        // Get class data for form/className
        const classData = await this.getClassData(classId);
        
        studentProgress.push({
          studentId: learner.id, // CUSTOM ID for display
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
        });
      }
      
      return studentProgress.sort((a, b) => a.studentName.localeCompare(b.studentName));
    } catch (error) {
      console.error('❌ Error getting student progress:', error);
      return [];
    }
  }

  // ==================== REPORT CARD GENERATION ====================

  /**
   * Generate a single report card
   * FIXED: Grade calculation now uses average of all exams
   */
  async generateReportCard(
    inputStudentId: string, // Can be custom ID or document ID
    term: string,
    year: number,
    options?: {
      includeIncomplete?: boolean;
      markMissing?: boolean;
    }
  ): Promise<ReportCardData | null> {
    try {
      console.log(`📝 Generating report card for: ${inputStudentId}, ${term} ${year}`);
      
      // Resolve student IDs
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

      // Get class data
      const classDoc = await getDoc(doc(this.classesCollection, classId));
      if (!classDoc.exists()) {
        console.warn(`⚠️ Class not found: ${classId}`);
        return null;
      }
      const classData = classDoc.data();

      // Get results using DOCUMENT ID
      const results = await this.getStudentResults(documentId, { term, year });
      
      if (results.length === 0) {
        console.log(`📭 No results found`);
        return null;
      }

      // Group results by subject
      const subjectMap = new Map<string, {
        subjectId: string;
        subjectName: string;
        teacherId: string;
        teacherName: string;
        week4: number;
        week8: number;
        endOfTerm: number;
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
        
        if (result.examType === 'week4') subject.week4 = result.percentage;
        if (result.examType === 'week8') subject.week8 = result.percentage;
        if (result.examType === 'endOfTerm') subject.endOfTerm = result.percentage;
      });

      // Build subjects array with averages and grades
      const subjects: SubjectResultSummary[] = [];
      let totalPercentage = 0;
      let validSubjectsCount = 0;

      subjectMap.forEach(subjectData => {
        const missingExams: string[] = [];
        if (subjectData.week4 === -1) missingExams.push('Week 4');
        if (subjectData.week8 === -1) missingExams.push('Week 8');
        if (subjectData.endOfTerm === -1) missingExams.push('End of Term');

        const isComplete = missingExams.length === 0;
        
        // Calculate average from available scores
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
          missingExams
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

        // For overall percentage, use average if available
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

      // Calculate position and improvement
      const position = await this.calculatePosition(documentId, classId, term, year);
      const improvement = await this.calculateImprovement(documentId, term, year);
      const teachersComment = this.generateTeacherComment(
        overallAveragePercentage,
        subjects
      );

      return {
        id: `report-${customId}-${term}-${year}`,
        studentId: customId, // Return CUSTOM ID for display
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
        documentId // For debugging
      };
    } catch (error) {
      console.error(`❌ Error generating report card:`, error);
      return null;
    }
  }

  /**
   * Generate report cards for an entire class
   */
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

  /**
   * Check if a student's report card is ready to generate
   */
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
        teacherName: string;
      }>();

      expectedSubjects.forEach(subject => {
        subjectMap.set(subject.id, {
          name: subject.name,
          hasWeek4: false,
          hasWeek8: false,
          hasEndOfTerm: false,
          teacherName: 'Not assigned',
        });
      });

      results.forEach(result => {
        if (subjectMap.has(result.subjectId)) {
          const subject = subjectMap.get(result.subjectId)!;
          subject.teacherName = result.teacherName;
          if (result.examType === 'week4') subject.hasWeek4 = true;
          if (result.examType === 'week8') subject.hasWeek8 = true;
          if (result.examType === 'endOfTerm') subject.hasEndOfTerm = true;
        }
      });

      const missingData: ReportReadinessCheck['missingData'] = [];
      let completeSubjects = 0;
      
      subjectMap.forEach((subject, subjectId) => {
        const missing: string[] = [];
        if (!subject.hasWeek4) missing.push('Week 4');
        if (!subject.hasWeek8) missing.push('Week 8');
        if (!subject.hasEndOfTerm) missing.push('End of Term');
        
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
      });

      return {
        isReady: missingData.length === 0 && subjectMap.size > 0,
        studentId: customId,
        studentName: studentData.name || 'Unknown',
        totalSubjects: subjectMap.size,
        completeSubjects,
        missingData,
      };
    } catch (error) {
      console.error('❌ Error validating report readiness:', error);
      return null;
    }
  }

  /**
   * Check report readiness for an entire class
   */
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
      
      const studentDetails: ReportReadinessCheck[] = [];
      
      for (const learner of learners) {
        const readiness = await this.validateReportCardReadiness(learner.id, term, year);
        if (readiness) {
          studentDetails.push(readiness);
        }
      }

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

  /**
   * Get completion status for all subjects in a class
   */
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
          });
        }
        const subject = subjectMap.get(key)!;
        if (result.examType === 'week4') subject.week4Students.add(result.studentId);
        if (result.examType === 'week8') subject.week8Students.add(result.studentId);
        if (result.examType === 'endOfTerm') subject.endOfTermStudents.add(result.studentId);
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
          });
        }
      });

      const totalStudents = await this.getLearnerCountInClass(classId);
      
      return Array.from(subjectMap.entries()).map(([subjectId, data]) => {
        const week4Complete = data.week4Students.size >= totalStudents;
        const week8Complete = data.week8Students.size >= totalStudents;
        const endOfTermComplete = data.endOfTermStudents.size >= totalStudents;
        const completeCount = [week4Complete, week8Complete, endOfTermComplete].filter(Boolean).length;
        const percentComplete = totalStudents > 0 ? Math.round((completeCount / 3) * 100) : 0;
        
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
        };
      });
    } catch (error) {
      console.error('Error getting subject completion status:', error);
      return [];
    }
  }

  // ==================== ANALYTICS METHODS ====================

  /**
   * Calculate class comparison statistics
   */
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

      // Group by class
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

  /**
   * Calculate subject analysis statistics
   */
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

  /**
   * Calculate grade distribution from results
   * Now uses average of all exams per subject per student
   */
  calculateGradeDistribution(results: StudentResult[]): Array<{
    grade: number;
    count: number;
    percentage: number;
    description: string;
  }> {
    // Group by student and subject to calculate averages
    const studentSubjectAverages = new Map<string, number[]>();
    
    // First, group results by student+subject
    const resultGroups = new Map<string, StudentResult[]>();
    results
      .filter(r => r.percentage >= 0) // Only valid scores
      .forEach(result => {
        const key = `${result.studentId}_${result.subjectId}`;
        if (!resultGroups.has(key)) {
          resultGroups.set(key, []);
        }
        resultGroups.get(key)!.push(result);
      });
    
    // Calculate average for each student+subject
    resultGroups.forEach((groupResults, key) => {
      const percentages = groupResults.map(r => r.percentage);
      const avgPercentage = percentages.reduce((a, b) => a + b, 0) / percentages.length;
      const grade = calculateGrade(avgPercentage);
      
      if (!studentSubjectAverages.has(key)) {
        studentSubjectAverages.set(key, []);
      }
      studentSubjectAverages.get(key)!.push(grade);
    });

    // Count grade distribution
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

  /**
   * Calculate performance trend across exam types
   */
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

  /**
   * Get analytics summary
   */
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

  /**
   * Get class data by ID
   */
  async getClassData(classId: string): Promise<any> {
    try {
      const classDoc = await getDoc(doc(this.classesCollection, classId));
      return classDoc.exists() ? classDoc.data() : null;
    } catch (error) {
      console.error('Error getting class data:', error);
      return null;
    }
  }

  /**
   * Debug method to check student data
   */
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
      console.log(`   - ${r.subjectName} (${r.examType}): ${r.percentage}%`);
    });
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

  private generateSubjectComment(grade: number, averagePercentage: number, missingExams: string[]): string {
    if (missingExams.length > 0) {
      return `Missing: ${missingExams.join(', ')}. ${averagePercentage >= 0 ? `Average: ${averagePercentage}%.` : ''}`;
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

      // Group by student and subject to calculate averages
      const studentAverages = new Map<string, { name: string; percentages: number[] }>();
      
      // Group by student
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

      // Calculate student averages
      studentResults.forEach((subjectMap, studentId) => {
        const subjectAverages: number[] = [];
        subjectMap.forEach(percentages => {
          const avg = percentages.reduce((a, b) => a + b, 0) / percentages.length;
          subjectAverages.push(avg);
        });
        
        const studentAvg = subjectAverages.reduce((a, b) => a + b, 0) / subjectAverages.length;
        
        // Get student name from first result
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

      // Calculate current average (using subject averages)
      const currentSubjectAverages = this.calculateSubjectAverages(currentResults);
      const currentOverall = currentSubjectAverages.length > 0
        ? currentSubjectAverages.reduce((a, b) => a + b, 0) / currentSubjectAverages.length
        : 0;

      // Calculate previous average
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