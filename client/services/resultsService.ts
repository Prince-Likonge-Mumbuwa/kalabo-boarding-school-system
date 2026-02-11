// @/services/resultsService.ts - ENHANCED VERSION WITH VALIDATION
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

// ==================== TYPES ====================
export interface StudentResult {
  id: string;
  studentId: string;
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
  marks: number; // -1 for absent (X), 0-100 for actual marks
  totalMarks: number;
  percentage: number;
  grade: number; // 1-9 scale, -1 for absent (X)
  term: string;
  year: number;
  status: 'entered' | 'absent' | 'not_entered'; // NEW: Track entry status
  createdAt: string;
  updatedAt: string;
}

export interface SubjectResultSummary {
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  week4: number;
  week8: number;
  endOfTerm: number;
  grade: number;
  comment: string;
  isComplete: boolean; // NEW: All exams entered
  missingExams: string[]; // NEW: Which exams are missing
}

export interface ReportCardData {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  classId: string;
  form: string;
  grade: number; // Overall grade 1-9
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
  isComplete: boolean; // NEW: All results entered
  completionPercentage: number; // NEW: % of complete subjects
}

// NEW: Validation types
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
  // NEW: Expected subjects from teacher assignments
  expectedSubjects: string[];
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

export interface GradeDistribution {
  grade: number;
  count: number;
  percentage: number;
  description: string;
}

export interface PerformanceTrend {
  period: string;
  examType: 'week4' | 'week8' | 'endOfTerm';
  passRate: number;
  avgMarks: number;
  totalStudents: number;
}

export interface ClassComparison {
  classId: string;
  className: string;
  form: string;
  passRate: number;
  avgMarks: number;
  totalStudents: number;
  improvement: number;
}

export interface SubjectAnalysis {
  subjectId: string;
  subjectName: string;
  passRate: number;
  avgScore: number;
  topGrade: number;
  totalStudents: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface BulkReportOperation {
  reportCards: ReportCardData[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    avgPercentage: number;
    complete: number; // NEW: Fully complete reports
    incomplete: number; // NEW: Missing some data
  };
}

// ==================== SUBJECT NORMALIZATION ====================
// Master subject mapping to prevent inconsistencies
const SUBJECT_NORMALIZATION_MAP: Record<string, string> = {
  // Mathematics variations
  'Mathematics': 'Mathematics',
  'Maths': 'Mathematics',
  'Math': 'Mathematics',
  'mathematics': 'Mathematics',
  'maths': 'Mathematics',
  // English variations
  'English': 'English',
  'english': 'English',
  'Eng': 'English',
  // Science variations
  'Science': 'Science',
  'science': 'Science',
  'General Science': 'Science',
  // Add more subjects as needed
};

/**
 * Normalize subject name to prevent duplicates
 */
const normalizeSubjectName = (subjectName: string): string => {
  return SUBJECT_NORMALIZATION_MAP[subjectName] || subjectName;
};

// ==================== GRADING SYSTEM ====================
export const GRADE_SYSTEM = {
  1: { min: 75, max: 100, description: 'Distinction' },
  2: { min: 70, max: 74, description: 'Distinction' },
  3: { min: 65, max: 69, description: 'Merit' },
  4: { min: 60, max: 64, description: 'Merit' },
  5: { min: 55, max: 59, description: 'Credit' },
  6: { min: 50, max: 54, description: 'Credit' },
  7: { min: 45, max: 49, description: 'Satisfactory' },
  8: { min: 40, max: 44, description: 'Satisfactory' },
  9: { min: 0, max: 39, description: 'Unsatisfactory (Fail)' },
  X: { min: -1, max: -1, description: 'Absent' },
} as const;

export const calculateGrade = (percentage: number): number => {
  if (percentage < 0) return -1; // Absent
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
  if (grade === -1) return 'Absent';
  const gradeKey = grade as keyof typeof GRADE_SYSTEM;
  return GRADE_SYSTEM[gradeKey]?.description || 'Unknown';
};

export const getGradeDisplay = (grade: number): string => {
  return grade === -1 ? 'X' : grade.toString();
};

// ==================== RESULTS SERVICE ====================
class ResultsService {
  private resultsCollection = collection(db, 'results');
  private learnersCollection = collection(db, 'learners');
  private classesCollection = collection(db, 'classes');
  private teacherAssignmentsCollection = collection(db, 'teacherAssignments'); // NEW

  /**
   * Generate unique ID for result
   * Format: {studentId}_{subjectId}_{examType}_{term}_{year}
   */
  private generateResultId(
    studentId: string,
    subjectId: string,
    examType: string,
    term: string,
    year: number
  ): string {
    const cleanTerm = term.replace(/\s+/g, '');
    const normalizedSubject = normalizeSubjectName(subjectId);
    return `${studentId}_${normalizedSubject}_${examType}_${cleanTerm}_${year}`;
  }

  /**
   * Get expected subjects for a class from teacher assignments
   * NEW: This is the key integration point
   */
  private async getExpectedSubjectsForClass(classId: string): Promise<string[]> {
    try {
      const assignmentsQuery = query(
        this.teacherAssignmentsCollection,
        where('classId', '==', classId)
      );
      const assignmentsSnapshot = await getDocs(assignmentsQuery);
      
      const subjects = new Set<string>();
      assignmentsSnapshot.docs.forEach(doc => {
        const assignment = doc.data();
        if (assignment.subject) {
          subjects.add(normalizeSubjectName(assignment.subject));
        }
      });
      
      return Array.from(subjects);
    } catch (error) {
      console.error('Error getting expected subjects for class:', error);
      return [];
    }
  }

  /**
   * Check if results already exist for this exam
   * NEW: Prevents accidental overwrites
   */
  async checkExistingResults(
    classId: string,
    subjectId: string,
    examType: string,
    term: string,
    year: number
  ): Promise<{ exists: boolean; count: number; results: StudentResult[] }> {
    try {
      const normalizedSubject = normalizeSubjectName(subjectId);
      const q = query(
        this.resultsCollection,
        where('classId', '==', classId),
        where('subjectId', '==', normalizedSubject),
        where('examType', '==', examType),
        where('term', '==', term),
        where('year', '==', year)
      );
      const snapshot = await getDocs(q);
      const results: StudentResult[] = [];
      snapshot.forEach(doc => {
        results.push(doc.data() as StudentResult);
      });
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

  /**
   * Get subject completion status for a class
   * NEW: Track which exam types have been entered
   */
  async getSubjectCompletionStatus(
    classId: string,
    term: string,
    year: number
  ): Promise<SubjectCompletionStatus[]> {
    try {
      // Get class info
      const classDoc = await getDoc(doc(this.classesCollection, classId));
      const classData = classDoc.data();
      if (!classData) {
        throw new Error('Class not found');
      }

      // Get expected subjects from teacher assignments
      const expectedSubjects = await this.getExpectedSubjectsForClass(classId);
      
      // Get all results for this class/term/year
      const q = query(
        this.resultsCollection,
        where('classId', '==', classId),
        where('term', '==', term),
        where('year', '==', year)
      );
      const snapshot = await getDocs(q);
      const results: StudentResult[] = [];
      snapshot.forEach(doc => {
        results.push(doc.data() as StudentResult);
      });

      // Group by subject
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

      // Also include subjects that have no results yet (from expected subjects)
      expectedSubjects.forEach(subject => {
        const normalizedSubject = normalizeSubjectName(subject);
        if (!subjectMap.has(normalizedSubject)) {
          subjectMap.set(normalizedSubject, {
            subjectName: normalizedSubject,
            teacherId: 'unknown',
            teacherName: 'Assigned Teacher',
            week4Students: new Set(),
            week8Students: new Set(),
            endOfTermStudents: new Set(),
          });
        }
      });

      const totalStudents = classData.students || 0;
      return Array.from(subjectMap.entries()).map(([subjectId, data]) => {
        const week4Complete = data.week4Students.size >= totalStudents;
        const week8Complete = data.week8Students.size >= totalStudents;
        const endOfTermComplete = data.endOfTermStudents.size >= totalStudents;
        const completeCount = [week4Complete, week8Complete, endOfTermComplete].filter(Boolean).length;
        const percentComplete = Math.round((completeCount / 3) * 100);
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
      throw error;
    }
  }

  /**
   * Validate single student report readiness
   * ENHANCED: Now uses expected subjects from teacher assignments
   */
  async validateReportCardReadiness(
    studentId: string,
    term: string,
    year: number
  ): Promise<ReportReadinessCheck> {
    try {
      // Get student info
      const studentDoc = await getDoc(doc(this.learnersCollection, studentId));
      const studentData = studentDoc.exists() ? studentDoc.data() : null;
      if (!studentData) {
        throw new Error('Student not found');
      }
      const studentName = studentData.name || 'Unknown';
      const classId = studentData.classId;

      // Get expected subjects from teacher assignments (KEY CHANGE)
      const expectedSubjects = await this.getExpectedSubjectsForClass(classId);

      // Get all results for this student
      const results = await this.getStudentResults(studentId, { term, year });

      // Create subject map from expected subjects (not just existing results)
      const subjectMap = new Map<string, {
        subjectName: string;
        teacherId: string;
        teacherName: string;
        hasWeek4: boolean;
        hasWeek8: boolean;
        hasEndOfTerm: boolean;
      }>();

      // Initialize with expected subjects
      expectedSubjects.forEach(subject => {
        const normalizedSubject = normalizeSubjectName(subject);
        subjectMap.set(normalizedSubject, {
          subjectName: normalizedSubject,
          teacherId: 'unknown',
          teacherName: 'Assigned Teacher',
          hasWeek4: false,
          hasWeek8: false,
          hasEndOfTerm: false,
        });
      });

      // Update with actual results
      results.forEach(result => {
        const key = result.subjectId;
        if (!subjectMap.has(key)) {
          // If there's a result for a subject not in expected list, add it
          subjectMap.set(key, {
            subjectName: result.subjectName,
            teacherId: result.teacherId,
            teacherName: result.teacherName,
            hasWeek4: false,
            hasWeek8: false,
            hasEndOfTerm: false,
          });
        }
        const subject = subjectMap.get(key)!;
        subject.teacherId = result.teacherId;
        subject.teacherName = result.teacherName;
        if (result.examType === 'week4') subject.hasWeek4 = true;
        if (result.examType === 'week8') subject.hasWeek8 = true;
        if (result.examType === 'endOfTerm') subject.hasEndOfTerm = true;
      });

      // Check for missing data
      const missingData: ReportReadinessCheck['missingData'] = [];
      let completeSubjects = 0;
      subjectMap.forEach((subject, subjectId) => {
        const missing: string[] = [];
        if (!subject.hasWeek4) missing.push('Week 4');
        if (!subject.hasWeek8) missing.push('Week 8');
        if (!subject.hasEndOfTerm) missing.push('End of Term');
        if (missing.length > 0) {
          missingData.push({
            subject: subject.subjectName,
            subjectId,
            teacherName: subject.teacherName,
            missingExamTypes: missing,
          });
        } else {
          completeSubjects++;
        }
      });

      return {
        isReady: missingData.length === 0,
        studentId,
        studentName,
        totalSubjects: subjectMap.size,
        completeSubjects,
        missingData,
      };
    } catch (error) {
      console.error('Error validating report card readiness:', error);
      throw error;
    }
  }

  /**
   * Validate entire class report readiness
   * ENHANCED: Now integrates with teacher assignments to know expected subjects
   */
  async validateClassReportReadiness(
    classId: string,
    term: string,
    year: number
  ): Promise<ClassReportReadiness> {
    try {
      // Get class info
      const classDoc = await getDoc(doc(this.classesCollection, classId));
      const classData = classDoc.data();
      if (!classData) {
        throw new Error('Class not found');
      }

      // Get expected subjects from teacher assignments (KEY INTEGRATION)
      const expectedSubjects = await this.getExpectedSubjectsForClass(classId);

      // Get all students in class
      const learnersQuery = query(
        this.learnersCollection,
        where('classId', '==', classId),
        where('isActive', '==', true)
      );
      const learnersSnapshot = await getDocs(learnersQuery);
      const students: Array<{ id: string; name: string }> = [];
      learnersSnapshot.forEach(doc => {
        students.push({
          id: doc.id,
          name: doc.data().name || 'Unknown',
        });
      });

      // Check readiness for each student
      const readinessChecks = await Promise.all(
        students.map(student =>
          this.validateReportCardReadiness(student.id, term, year)
        )
      );

      const readyStudents = readinessChecks.filter(check => check.isReady).length;
      const incompleteStudents = readinessChecks.length - readyStudents;
      const completionPercentage = readinessChecks.length > 0
        ? Math.round((readyStudents / readinessChecks.length) * 100)
        : 0;

      return {
        classId,
        className: classData.name,
        term,
        year,
        totalStudents: students.length,
        readyStudents,
        incompleteStudents,
        completionPercentage,
        studentDetails: readinessChecks,
        expectedSubjects, // NEW: Include expected subjects
      };
    } catch (error) {
      console.error('Error validating class report readiness:', error);
      throw error;
    }
  }

  /**
   * Save class results for a specific exam/test
   * ENHANCED: With validation and duplicate checking
   */
  async saveClassResults(data: {
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
      marks: number; // -1 for absent
    }>;
  }, options?: {
    overwrite?: boolean;
  }): Promise<{ success: boolean; count: number; results: StudentResult[]; overwritten: boolean }> {
    try {
      // Normalize subject name
      const normalizedSubjectId = normalizeSubjectName(data.subjectId);
      const normalizedSubjectName = normalizeSubjectName(data.subjectName);

      // Check for existing results
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
          `Found ${existing.count} existing entries. ` +
          `Set overwrite option to true to replace them.`
        );
      }

      const batch = writeBatch(db);
      const savedResults: StudentResult[] = [];
      const now = new Date().toISOString();

      // Get class form/level
      const classDoc = await getDoc(doc(this.classesCollection, data.classId));
      const classData = classDoc.data();
      const form = classData?.level?.toString() || '1';

      data.results.forEach(result => {
        // Calculate percentage and grade
        const percentage = result.marks < 0
          ? -1
          : Math.round((result.marks / data.totalMarks) * 100);
        const grade = calculateGrade(percentage);

        // Determine status
        const status: StudentResult['status'] =
          result.marks < 0 ? 'absent' : 'entered';

        const resultData: StudentResult = {
          id: this.generateResultId(
            result.studentId,
            normalizedSubjectId,
            data.examType,
            data.term,
            data.year
          ),
          studentId: result.studentId,
          studentName: result.studentName,
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
        };

        const docRef = doc(this.resultsCollection, resultData.id);
        batch.set(docRef, resultData, { merge: true });
        savedResults.push(resultData);
      });

      await batch.commit();
      console.log(`✅ Saved ${savedResults.length} results for ${normalizedSubjectName} - ${data.examName}`);

      return {
        success: true,
        count: savedResults.length,
        results: savedResults,
        overwritten: existing.exists
      };
    } catch (error) {
      console.error('Error saving class results:', error);
      throw error;
    }
  }

  /**
   * Generate report card for a single student
   * ENHANCED: With completion tracking and better error handling
   */
  async generateReportCard(
    studentId: string,
    term: string,
    year: number,
    options?: {
      includeIncomplete?: boolean;  // Generate even if incomplete
      markMissing?: boolean;        // Mark missing data in report
    }
  ): Promise<ReportCardData | null> {
    try {
      // Check readiness first
      const readiness = await this.validateReportCardReadiness(studentId, term, year);
      if (!readiness.isReady && !options?.includeIncomplete) {
        const missingInfo = readiness.missingData
          .map(m => `${m.subject}: ${m.missingExamTypes.join(', ')}`)
          .join('\n');
        throw new Error(
          `Cannot generate complete report card. Missing data:\n${missingInfo}\n` +
          `Use includeIncomplete option to generate partial report.`
        );
      }

      // Get all results for this student for the term
      const results = await this.getStudentResults(studentId, { term, year });
      if (results.length === 0) {
        console.log(`⚠️ No results found for student ${studentId} in ${term} ${year}`);
        return null;
      }

      // Get expected subjects from teacher assignments
      const classId = results[0].classId;
      const expectedSubjects = await this.getExpectedSubjectsForClass(classId);

      // Create subject map initialized with expected subjects
      const subjectMap = new Map<string, {
        subjectId: string;
        subjectName: string;
        teacherId: string;
        teacherName: string;
        week4: number;
        week8: number;
        endOfTerm: number;
        hasWeek4: boolean;
        hasWeek8: boolean;
        hasEndOfTerm: boolean;
      }>();

      // Initialize with expected subjects
      expectedSubjects.forEach(subject => {
        const normalizedSubject = normalizeSubjectName(subject);
        subjectMap.set(normalizedSubject, {
          subjectId: normalizedSubject,
          subjectName: normalizedSubject,
          teacherId: 'unknown',
          teacherName: 'Assigned Teacher',
          week4: -1,
          week8: -1,
          endOfTerm: -1,
          hasWeek4: false,
          hasWeek8: false,
          hasEndOfTerm: false,
        });
      });

      // Update with actual results
      results.forEach(result => {
        const key = result.subjectId;
        if (!subjectMap.has(key)) {
          // Handle unexpected subjects (shouldn't happen normally)
          subjectMap.set(key, {
            subjectId: result.subjectId,
            subjectName: result.subjectName,
            teacherId: result.teacherId,
            teacherName: result.teacherName,
            week4: -1,
            week8: -1,
            endOfTerm: -1,
            hasWeek4: false,
            hasWeek8: false,
            hasEndOfTerm: false,
          });
        }
        const subject = subjectMap.get(key)!;
        subject.teacherId = result.teacherId;
        subject.teacherName = result.teacherName;
        if (result.examType === 'week4') {
          subject.week4 = result.percentage;
          subject.hasWeek4 = true;
        }
        if (result.examType === 'week8') {
          subject.week8 = result.percentage;
          subject.hasWeek8 = true;
        }
        if (result.examType === 'endOfTerm') {
          subject.endOfTerm = result.percentage;
          subject.hasEndOfTerm = true;
        }
      });

      // Convert to array and calculate subject grades
      const subjects: SubjectResultSummary[] = Array.from(subjectMap.values()).map(subject => {
        const endOfTerm = subject.endOfTerm;
        const grade = calculateGrade(endOfTerm);

        // Determine missing exams
        const missingExams: string[] = [];
        if (!subject.hasWeek4) missingExams.push('Week 4');
        if (!subject.hasWeek8) missingExams.push('Week 8');
        if (!subject.hasEndOfTerm) missingExams.push('End of Term');
        const isComplete = missingExams.length === 0;

        // Generate comment
        let comment = this.generateSubjectComment(grade, endOfTerm);
        if (!isComplete && options?.markMissing) {
          comment = `⚠️ Missing: ${missingExams.join(', ')}. ${comment}`;
        }

        return {
          subjectId: subject.subjectId,
          subjectName: subject.subjectName,
          teacherId: subject.teacherId,
          teacherName: subject.teacherName,
          week4: subject.week4,
          week8: subject.week8,
          endOfTerm,
          grade,
          comment,
          isComplete,
          missingExams,
        };
      });

      // Calculate overall statistics (using endOfTerm results only)
      const validSubjects = subjects.filter(s => s.endOfTerm >= 0);
      const totalPercentage = validSubjects.reduce((sum, s) => sum + s.endOfTerm, 0);
      const averagePercentage = validSubjects.length > 0
        ? Math.round(totalPercentage / validSubjects.length)
        : 0;
      const overallGrade = calculateGrade(averagePercentage);

      // Calculate completion percentage
      const completeSubjects = subjects.filter(s => s.isComplete).length;
      const completionPercentage = subjects.length > 0
        ? Math.round((completeSubjects / subjects.length) * 100)
        : 0;

      // Get student information
      const firstResult = results[0];
      const learnerDoc = await getDoc(doc(this.learnersCollection, studentId));
      const learnerData = learnerDoc.exists() ? learnerDoc.data() : null;

      // Calculate position in class
      const position = await this.calculatePosition(studentId, firstResult.classId, term, year);

      // Determine improvement trend
      const improvement = await this.calculateImprovement(studentId, term, year);

      // Generate comprehensive teacher comment
      const teachersComment = this.generateTeacherComment(
        overallGrade,
        averagePercentage,
        subjects
      );

      const reportCard: ReportCardData = {
        id: `report-${studentId}-${term}-${year}`,
        studentId,
        studentName: firstResult.studentName,
        className: firstResult.className,
        classId: firstResult.classId,
        form: firstResult.form,
        grade: overallGrade,
        position,
        gender: learnerData?.gender || 'Not specified',
        totalMarks: validSubjects.reduce((sum, s) => sum + s.endOfTerm, 0),
        percentage: averagePercentage,
        status: averagePercentage >= 50 ? 'pass' : 'fail',
        improvement,
        subjects: subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
        attendance: learnerData?.attendance || 95,
        teachersComment,
        parentsEmail: learnerData?.parentEmail || '',
        parentsPhone: learnerData?.parentPhone || '',
        generatedDate: new Date().toLocaleDateString('en-GB'),
        term,
        year,
        isComplete: completionPercentage === 100,
        completionPercentage,
      };

      console.log(`✅ Generated report card for ${firstResult.studentName} - ${averagePercentage}% (${getGradeDescription(overallGrade)}) - ${completionPercentage}% complete`);
      return reportCard;
    } catch (error) {
      console.error('Error generating report card:', error);
      throw error;
    }
  }

  /**
   * Generate report cards for entire class
   * ENHANCED: With validation and completion tracking
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
      // Validate class readiness first
      const classReadiness = await this.validateClassReportReadiness(classId, term, year);
      console.log(`📊 Class Readiness: ${classReadiness.readyStudents}/${classReadiness.totalStudents} students ready (${classReadiness.completionPercentage}%)`);

      // Get all students in the class
      const classResults = await this.getAllResults({ classId, term, year });
      const studentIds = Array.from(new Set(classResults.map(r => r.studentId)));
      console.log(`📄 Generating ${studentIds.length} report cards for class...`);

      // Generate report card for each student
      const reportCardsPromises = studentIds.map(studentId =>
        this.generateReportCard(studentId, term, year, options)
      );
      const reportCardsResults = await Promise.all(reportCardsPromises);

      // Filter out null results
      const reportCards = reportCardsResults.filter(
        (card): card is ReportCardData => card !== null
      );

      // Calculate summary statistics
      const passed = reportCards.filter(r => r.status === 'pass').length;
      const failed = reportCards.filter(r => r.status === 'fail').length;
      const complete = reportCards.filter(r => r.isComplete).length;
      const incomplete = reportCards.filter(r => !r.isComplete).length;
      const avgPercentage = reportCards.length > 0
        ? Math.round(reportCards.reduce((sum, r) => sum + r.percentage, 0) / reportCards.length)
        : 0;

      return {
        reportCards,
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
      console.error('Error generating class report cards:', error);
      throw error;
    }
  }

  // ... [Rest of the existing methods remain the same]

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
      if (filters?.classId) {
        constraints.push(where('classId', '==', filters.classId));
      }
      if (filters?.subjectId) {
        const normalizedSubject = normalizeSubjectName(filters.subjectId);
        constraints.push(where('subjectId', '==', normalizedSubject));
      }
      if (filters?.term) {
        constraints.push(where('term', '==', filters.term));
      }
      if (filters?.year) {
        constraints.push(where('year', '==', filters.year));
      }
      const q = query(
        this.resultsCollection,
        ...constraints,
        orderBy('className'),
        orderBy('studentName')
      );
      const snapshot = await getDocs(q);
      const results: StudentResult[] = [];
      snapshot.forEach(doc => {
        results.push(doc.data() as StudentResult);
      });
      console.log(`📊 Fetched ${results.length} results for teacher ${teacherId}`);
      return results;
    } catch (error) {
      console.error('Error fetching teacher results:', error);
      throw error;
    }
  }

  async getStudentResults(
    studentId: string,
    filters?: {
      term?: string;
      year?: number;
      subjectId?: string;
    }
  ): Promise<StudentResult[]> {
    try {
      const constraints = [where('studentId', '==', studentId)];
      if (filters?.term) {
        constraints.push(where('term', '==', filters.term));
      }
      if (filters?.year) {
        constraints.push(where('year', '==', filters.year));
      }
      if (filters?.subjectId) {
        const normalizedSubject = normalizeSubjectName(filters.subjectId);
        constraints.push(where('subjectId', '==', normalizedSubject));
      }
      const q = query(this.resultsCollection, ...constraints, orderBy('subjectName'));
      const snapshot = await getDocs(q);
      const results: StudentResult[] = [];
      snapshot.forEach(doc => {
        results.push(doc.data() as StudentResult);
      });
      return results;
    } catch (error) {
      console.error('Error fetching student results:', error);
      throw error;
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
        const normalizedSubject = normalizeSubjectName(filters.subjectId);
        constraints.push(where('subjectId', '==', normalizedSubject));
      }
      if (filters?.term) constraints.push(where('term', '==', filters.term));
      if (filters?.year) constraints.push(where('year', '==', filters.year));
      if (filters?.examType) constraints.push(where('examType', '==', filters.examType));
      let q;
      if (constraints.length > 0) {
        q = query(this.resultsCollection, ...constraints);
      } else {
        q = query(this.resultsCollection);
      }
      const snapshot = await getDocs(q);
      const results: StudentResult[] = [];
      snapshot.forEach(doc => {
        results.push(doc.data() as StudentResult);
      });
      results.sort((a, b) => {
        if (a.className !== b.className) {
          return a.className.localeCompare(b.className);
        }
        return a.studentName.localeCompare(b.studentName);
      });
      console.log(`📊 Fetched ${results.length} total results`);
      return results;
    } catch (error) {
      console.error('Error fetching all results:', error);
      throw error;
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
      const normalizedSubject = normalizeSubjectName(subjectId);
      const constraints = [
        where('classId', '==', classId),
        where('subjectId', '==', normalizedSubject)
      ];
      if (filters?.term) constraints.push(where('term', '==', filters.term));
      if (filters?.year) constraints.push(where('year', '==', filters.year));
      if (filters?.examType) constraints.push(where('examType', '==', filters.examType));
      const q = query(this.resultsCollection, ...constraints, orderBy('studentName'));
      const snapshot = await getDocs(q);
      const results: StudentResult[] = [];
      snapshot.forEach(doc => {
        results.push(doc.data() as StudentResult);
      });
      return results;
    } catch (error) {
      console.error('Error fetching class subject results:', error);
      throw error;
    }
  }

  async updateStudentResult(
    resultId: string,
    marks: number,
    totalMarks: number
  ): Promise<StudentResult> {
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
      console.error('Error updating student result:', error);
      throw error;
    }
  }

  calculateGradeDistribution(results: StudentResult[]): GradeDistribution[] {
    const gradeCounts = new Map<number, number>();
    for (let i = 1; i <= 9; i++) {
      gradeCounts.set(i, 0);
    }
    results.forEach(result => {
      if (result.grade > 0) {
        gradeCounts.set(result.grade, (gradeCounts.get(result.grade) || 0) + 1);
      }
    });
    const total = results.filter(r => r.grade > 0).length;
    return Array.from(gradeCounts.entries()).map(([grade, count]) => ({
      grade,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      description: getGradeDescription(grade),
    }));
  }

  calculatePerformanceTrend(results: StudentResult[]): PerformanceTrend[] {
    const examTypes: Array<'week4' | 'week8' | 'endOfTerm'> = ['week4', 'week8', 'endOfTerm'];
    const trends = new Map<string, {
      total: number;
      count: number;
      passed: number;
      examType: 'week4' | 'week8' | 'endOfTerm';
    }>();
    const labels = {
      week4: 'Week 4 Assessment',
      week8: 'Week 8 Assessment',
      endOfTerm: 'End of Term Exam',
    };
    examTypes.forEach(examType => {
      trends.set(examType, { total: 0, count: 0, passed: 0, examType });
    });
    results.forEach(result => {
      if (trends.has(result.examType)) {
        const trend = trends.get(result.examType)!;
        if (result.percentage >= 0) {
          trend.total += result.percentage;
          trend.count += 1;
          if (result.percentage >= 50) trend.passed += 1;
        }
      }
    });
    return Array.from(trends.entries()).map(([key, data]) => ({
      period: labels[key as 'week4' | 'week8' | 'endOfTerm'],
      examType: data.examType,
      avgMarks: data.count > 0 ? Math.round(data.total / data.count) : 0,
      passRate: data.count > 0 ? Math.round((data.passed / data.count) * 100) : 0,
      totalStudents: data.count,
    }));
  }

  async calculateClassComparison(filters?: {
    term?: string;
    year?: number;
  }): Promise<ClassComparison[]> {
    try {
      const results = await this.getAllResults({
        ...filters,
        examType: 'endOfTerm',
      });
      const classMap = new Map<string, {
        classId: string;
        className: string;
        form: string;
        total: number;
        count: number;
        passed: number;
      }>();
      results.forEach(result => {
        if (!classMap.has(result.classId)) {
          classMap.set(result.classId, {
            classId: result.classId,
            className: result.className,
            form: result.form,
            total: 0,
            count: 0,
            passed: 0,
          });
        }
        const classData = classMap.get(result.classId)!;
        if (result.percentage >= 0) {
          classData.total += result.percentage;
          classData.count += 1;
          if (result.percentage >= 50) classData.passed += 1;
        }
      });
      return Array.from(classMap.values())
        .map(data => ({
          classId: data.classId,
          className: data.className,
          form: data.form,
          avgMarks: data.count > 0 ? Math.round(data.total / data.count) : 0,
          passRate: data.count > 0 ? Math.round((data.passed / data.count) * 100) : 0,
          totalStudents: data.count,
          improvement: 0,
        }))
        .sort((a, b) => b.avgMarks - a.avgMarks);
    } catch (error) {
      console.error('Error calculating class comparison:', error);
      throw error;
    }
  }

  async calculateSubjectAnalysis(filters?: {
    term?: string;
    year?: number;
    classId?: string;
  }): Promise<SubjectAnalysis[]> {
    try {
      const results = await this.getAllResults({
        ...filters,
        examType: 'endOfTerm',
      });
      const subjectMap = new Map<string, {
        subjectId: string;
        subjectName: string;
        percentages: number[];
        grades: number[];
      }>();
      results.forEach(result => {
        if (result.percentage < 0) return;
        const key = result.subjectId;
        if (!subjectMap.has(key)) {
          subjectMap.set(key, {
            subjectId: result.subjectId,
            subjectName: result.subjectName,
            percentages: [],
            grades: [],
          });
        }
        const subject = subjectMap.get(key)!;
        subject.percentages.push(result.percentage);
        subject.grades.push(result.grade);
      });
      return Array.from(subjectMap.values())
        .map(subject => {
          const avgScore = Math.round(
            subject.percentages.reduce((a, b) => a + b, 0) / subject.percentages.length
          );
          const passRate = Math.round(
            (subject.percentages.filter(p => p >= 50).length / subject.percentages.length) * 100
          );
          const gradeCounts = new Map<number, number>();
          subject.grades.forEach(grade => {
            gradeCounts.set(grade, (gradeCounts.get(grade) || 0) + 1);
          });
          const topGrade = Array.from(gradeCounts.entries())
            .sort((a, b) => b[1] - a[1])[0]?.[0] || 9;
          let difficulty: 'easy' | 'medium' | 'hard' = 'medium';
          if (avgScore >= 70) difficulty = 'easy';
          else if (avgScore <= 45) difficulty = 'hard';
          return {
            subjectId: subject.subjectId,
            subjectName: subject.subjectName,
            passRate,
            avgScore,
            topGrade,
            totalStudents: subject.percentages.length,
            difficulty,
          };
        })
        .sort((a, b) => b.passRate - a.passRate);
    } catch (error) {
      console.error('Error calculating subject analysis:', error);
      throw error;
    }
  }

  private generateSubjectComment(grade: number, percentage: number): string {
    if (percentage < 0) return 'Student was absent for this assessment.';
    const comments: Record<number, string> = {
      1: 'Outstanding performance showing exceptional mastery of concepts.',
      2: 'Excellent work with strong understanding demonstrated throughout.',
      3: 'Very good performance with solid comprehension of subject matter.',
      4: 'Good grasp of concepts with consistent effort shown.',
      5: 'Commendable effort showing satisfactory understanding.',
      6: 'Acceptable performance meeting basic subject requirements.',
      7: 'Fair performance; more practice and review needed.',
      8: 'Below expectations; requires additional support and guidance.',
      9: 'Needs immediate intervention and intensive remedial work.',
    };
    return comments[grade] || 'Assessment pending.';
  }

  private generateTeacherComment(
    overallGrade: number,
    percentage: number,
    subjects: SubjectResultSummary[]
  ): string {
    const gradeDesc = getGradeDescription(overallGrade);
    const validSubjects = subjects.filter(s => s.endOfTerm >= 0);
    const passCount = validSubjects.filter(s => s.endOfTerm >= 50).length;
    const totalSubjects = validSubjects.length;
    const sortedSubjects = [...validSubjects].sort((a, b) => b.endOfTerm - a.endOfTerm);
    const strongest = sortedSubjects[0];
    const weakest = sortedSubjects[sortedSubjects.length - 1];

    if (overallGrade <= 2) {
      return `Outstanding performance! The student has achieved ${gradeDesc} status with an impressive average of ${percentage}%. Particularly strong in ${strongest?.subjectName}. Continue this excellent work and maintain this high standard.`;
    } else if (overallGrade <= 4) {
      return `Very good performance with ${passCount}/${totalSubjects} subjects passed (${percentage}% average). Strong showing in ${strongest?.subjectName}. Keep up the consistent effort to achieve even better results next term.`;
    } else if (overallGrade <= 6) {
      return `Satisfactory performance with ${passCount}/${totalSubjects} subjects passed. Average of ${percentage}% shows acceptable understanding. Focus more attention on ${weakest?.subjectName} where improvement is needed. More consistent study habits recommended.`;
    } else if (overallGrade <= 8) {
      return `Performance requires improvement. Only ${passCount}/${totalSubjects} subjects passed with ${percentage}% average. Particular attention needed in ${weakest?.subjectName}. Recommend remedial classes and additional support. Parent-teacher conference advised.`;
    } else {
      return `Serious academic intervention required. Performance well below expectations with ${percentage}% average. Student needs immediate intensive support across multiple subjects, especially ${weakest?.subjectName}. Mandatory parent-teacher meeting to discuss improvement strategy.`;
    }
  }

  private async calculatePosition(
    studentId: string,
    classId: string,
    term: string,
    year: number
  ): Promise<string> {
    try {
      const q = query(
        this.resultsCollection,
        where('classId', '==', classId),
        where('term', '==', term),
        where('year', '==', year),
        where('examType', '==', 'endOfTerm')
      );
      const snapshot = await getDocs(q);
      const results: StudentResult[] = [];
      snapshot.forEach(doc => results.push(doc.data() as StudentResult));

      if (results.length === 0) return '1/1';

      const studentAverages = new Map<string, { name: string; percentages: number[] }>();
      results.forEach(result => {
        if (result.percentage < 0) return;
        if (!studentAverages.has(result.studentId)) {
          studentAverages.set(result.studentId, {
            name: result.studentName,
            percentages: [],
          });
        }
        studentAverages.get(result.studentId)!.percentages.push(result.percentage);
      });

      const rankings = Array.from(studentAverages.entries())
        .map(([id, data]) => ({
          studentId: id,
          name: data.name,
          average: data.percentages.reduce((a, b) => a + b, 0) / data.percentages.length,
        }))
        .sort((a, b) => b.average - a.average);

      const position = rankings.findIndex(r => r.studentId === studentId) + 1;
      const total = rankings.length;
      const suffix = this.getOrdinalSuffix(position);
      return `${position}${suffix} of ${total}`;
    } catch (error) {
      console.error('Error calculating position:', error);
      return '—';
    }
  }

  private getOrdinalSuffix(num: number): string {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return 'st';
    if (j === 2 && k !== 12) return 'nd';
    if (j === 3 && k !== 13) return 'rd';
    return 'th';
  }

  private async calculateImprovement(
    studentId: string,
    currentTerm: string,
    currentYear: number
  ): Promise<'improved' | 'declined' | 'stable'> {
    try {
      const termMap = { 'Term 1': 'Term 3', 'Term 2': 'Term 1', 'Term 3': 'Term 2' };
      const previousTerm = termMap[currentTerm as keyof typeof termMap];
      const previousYear = currentTerm === 'Term 1' ? currentYear - 1 : currentYear;

      const currentResults = await this.getStudentResults(studentId, {
        term: currentTerm,
        year: currentYear,
      });
      const currentEndOfTerm = currentResults.filter(r => r.examType === 'endOfTerm' && r.percentage >= 0);
      const currentAvg = currentEndOfTerm.length > 0
        ? currentEndOfTerm.reduce((sum, r) => sum + r.percentage, 0) / currentEndOfTerm.length
        : 0;

      const previousResults = await this.getStudentResults(studentId, {
        term: previousTerm,
        year: previousYear,
      });
      const previousEndOfTerm = previousResults.filter(r => r.examType === 'endOfTerm' && r.percentage >= 0);
      const previousAvg = previousEndOfTerm.length > 0
        ? previousEndOfTerm.reduce((sum, r) => sum + r.percentage, 0) / previousEndOfTerm.length
        : 0;

      if (previousAvg === 0) return 'stable';
      const difference = currentAvg - previousAvg;
      if (difference > 3) return 'improved';
      if (difference < -3) return 'declined';
      return 'stable';
    } catch (error) {
      console.error('Error calculating improvement:', error);
      return 'stable';
    }
  }
}

export const resultsService = new ResultsService();