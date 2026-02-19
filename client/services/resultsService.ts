// @/services/resultsService.ts
// COMPLETE REWRITE - ISACTIVE FILTER ELIMINATED
// Version 5.3.0 - Fixed: Progress bars working, marks appearing in report cards
// Dual ID system: Custom IDs for display, Document IDs for queries

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
  studentId: string; // This stores the DOCUMENT ID for querying
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
  grade: number;
  term: string;
  year: number;
  status: 'entered' | 'absent' | 'not_entered';
  createdAt: string;
  updatedAt: string;
  // Optional: store custom ID for reference if needed
  customStudentId?: string;
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
  isComplete: boolean;
  missingExams: string[];
}

export interface ReportCardData {
  id: string;
  studentId: string; // This is the CUSTOM ID for display
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
  // Optional: include document ID for debugging
  documentId?: string;
}

export interface ReportReadinessCheck {
  isReady: boolean;
  studentId: string; // Custom ID
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

// Student Progress with detailed subject status
export interface StudentProgress {
  studentId: string; // This is the CUSTOM student ID (e.g., STU0240542AV) for display
  studentName: string;
  className: string;
  classId: string;
  form: string;
  // Overall progress
  overallPercentage: number;
  overallGrade: number;
  status: 'pass' | 'fail' | 'pending';
  isComplete: boolean;
  completionPercentage: number;
  // Subject progress
  subjects: Array<{
    subjectId: string;
    subjectName: string;
    teacherName: string;
    week4: { status: 'complete' | 'missing' | 'absent'; marks?: number };
    week8: { status: 'complete' | 'missing' | 'absent'; marks?: number };
    endOfTerm: { status: 'complete' | 'missing' | 'absent'; marks?: number };
    subjectProgress: number; // 0-100%
    grade?: number;
  }>;
  // Missing data info
  missingSubjects: number;
  totalSubjects: number;
  // Optional: store document ID for internal use
  documentId?: string;
}

// ==================== CONSTANTS & CONFIGURATION ====================

const COLLECTIONS = {
  RESULTS: 'results',
  LEARNERS: 'learners',
  CLASSES: 'classes',
  TEACHER_ASSIGNMENTS: 'teacher_assignments',
  USERS: 'users',
  REPORT_CARDS: 'report_cards',
} as const;

const SUBJECT_NORMALIZATION_MAP: Record<string, string> = {
  'Mathematics': 'Mathematics',
  'Maths': 'Mathematics',
  'Math': 'Mathematics',
  'mathematics': 'Mathematics',
  'maths': 'Mathematics',
  'math': 'Mathematics',
  'MATH': 'Mathematics',
  
  'English': 'English',
  'english': 'English',
  'Eng': 'English',
  'eng': 'English',
  'ENGLISH': 'English',
  
  'Science': 'Science',
  'science': 'Science',
  'General Science': 'Science',
  'general science': 'Science',
  'SCIENCE': 'Science',
  
  'Physics': 'Physics',
  'physics': 'Physics',
  'PHYSICS': 'Physics',
  
  'Chemistry': 'Chemistry',
  'chemistry': 'Chemistry',
  'CHEMISTRY': 'Chemistry',
  
  'Biology': 'Biology',
  'biology': 'Biology',
  'BIOLOGY': 'Biology',
  
  'History': 'History',
  'history': 'History',
  'HISTORY': 'History',
  
  'Geography': 'Geography',
  'geography': 'Geography',
  'GEOGRAPHY': 'Geography',
  
  'Physical Education': 'Physical Education',
  'PE': 'Physical Education',
  'P.E.': 'Physical Education',
  'physical education': 'Physical Education',
  'pe': 'Physical Education',
  
  'Art': 'Art',
  'art': 'Art',
  'ART': 'Art',
  'Fine Art': 'Art',
  'fine art': 'Art',
  
  'Music': 'Music',
  'music': 'Music',
  'MUSIC': 'Music',
  
  'ICT': 'ICT',
  'ict': 'ICT',
  'Computer Science': 'ICT',
  'computer science': 'ICT',
  'Computing': 'ICT',
  'computing': 'ICT',
  'COMPUTER SCIENCE': 'ICT',
  
  'Social Studies': 'Social Studies',
  'social studies': 'Social Studies',
  'SOCIAL STUDIES': 'Social Studies',
  'Social': 'Social Studies',
  
  'Religious Education': 'Religious Education',
  'RE': 'Religious Education',
  'R.E.': 'Religious Education',
  'religious education': 'Religious Education',
  're': 'Religious Education',
  
  'Integrated Science': 'Integrated Science',
  'integrated science': 'Integrated Science',
  'INTEGRATED SCIENCE': 'Integrated Science',
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
  9: { min: 0, max: 39, description: 'Unsatisfactory (Fail)' },
  X: { min: -1, max: -1, description: 'Absent' },
} as const;

// ==================== UTILITY FUNCTIONS ====================

export const normalizeSubjectName = (subjectName: string): string => {
  if (!subjectName) return '';
  
  const trimmed = subjectName.trim();
  
  if (SUBJECT_NORMALIZATION_MAP[trimmed]) {
    return SUBJECT_NORMALIZATION_MAP[trimmed];
  }
  
  const lower = trimmed.toLowerCase();
  const lowerMap: Record<string, string> = {};
  Object.entries(SUBJECT_NORMALIZATION_MAP).forEach(([key, value]) => {
    lowerMap[key.toLowerCase()] = value;
  });
  
  if (lowerMap[lower]) {
    return lowerMap[lower];
  }
  
  const upper = trimmed.toUpperCase();
  const upperMap: Record<string, string> = {};
  Object.entries(SUBJECT_NORMALIZATION_MAP).forEach(([key, value]) => {
    upperMap[key.toUpperCase()] = value;
  });
  
  if (upperMap[upper]) {
    return upperMap[upper];
  }
  
  console.warn(`⚠️ No normalization mapping found for subject: "${subjectName}"`);
  return trimmed;
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
  if (grade === -1) return 'Absent';
  const gradeKey = grade as keyof typeof GRADE_SYSTEM;
  return GRADE_SYSTEM[gradeKey]?.description || 'Unknown';
};

export const getGradeDisplay = (grade: number): string => {
  return grade === -1 ? 'X' : grade.toString();
};

// ==================== MAIN SERVICE CLASS ====================

class ResultsService {
  private resultsCollection = collection(db, COLLECTIONS.RESULTS);
  private learnersCollection = collection(db, COLLECTIONS.LEARNERS);
  private classesCollection = collection(db, COLLECTIONS.CLASSES);
  private teacherAssignmentsCollection = collection(db, COLLECTIONS.TEACHER_ASSIGNMENTS);
  private reportCardsCollection = collection(db, COLLECTIONS.REPORT_CARDS);

  async initialize(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('🔌 Initializing ResultsService...');
      console.log('📚 Collections configured:', COLLECTIONS);

      const testQuery = query(this.teacherAssignmentsCollection, limit(1));
      const snapshot = await getDocs(testQuery);
      
      console.log(`✅ Successfully connected to ${COLLECTIONS.TEACHER_ASSIGNMENTS} collection`);
      console.log(`📊 Found ${snapshot.size} teacher assignment documents`);
      
      return { success: true };
    } catch (error: any) {
      console.error('❌ Failed to initialize ResultsService:', error);
      
      let errorMessage = 'Unknown error';
      if (error.code === 'permission-denied') {
        errorMessage = `Permission denied accessing ${COLLECTIONS.TEACHER_ASSIGNMENTS}. Check Firebase rules and collection name.`;
      } else if (error.code === 'not-found') {
        errorMessage = `Collection ${COLLECTIONS.TEACHER_ASSIGNMENTS} does not exist. Create it in Firebase Console.`;
      }
      
      return { success: false, error: errorMessage };
    }
  }

  // ==================== LEARNER FETCHING METHODS ====================
  // ALL LEARNER QUERIES - NO ISACTIVE FILTERS ANYWHERE
  // ====================

  /**
   * PUBLIC METHOD: Get all learners in a class - NO STATUS FILTERS
   * Returns learners with their CUSTOM student IDs as the primary identifier
   */
  public async getLearnersInClass(classId: string): Promise<Array<{ 
    id: string; // This will be the CUSTOM student ID (e.g., STU0240542AV)
    name: string; 
    data: any;
    documentId: string; // Firestore document ID for queries
  }>> {
    try {
      console.log(`🔍 Fetching ALL learners for class: ${classId}`);
      
      const learnersQuery = query(
        this.learnersCollection,
        where('classId', '==', classId)
      );
      
      const snapshot = await getDocs(learnersQuery);
      
      const learners: Array<{ id: string; name: string; data: any; documentId: string }> = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        const name = data.name || data.studentName || data.fullName || data.displayName || 'Unknown';
        
        // Get the custom student ID from the learner document
        const customStudentId = data.studentId || 
                               data.id || 
                               data.registrationNumber || 
                               data.admissionNumber;
        
        if (!customStudentId) {
          console.warn(`⚠️ Learner ${doc.id} has no custom student ID! Using document ID as fallback.`);
        }
        
        // Use custom ID as primary, fallback to document ID
        const primaryId = customStudentId || doc.id;
        
        learners.push({
          id: primaryId, // This is the CUSTOM ID for display (e.g., STU0240542AV)
          name,
          data: {
            ...data,
            firestoreDocId: doc.id
          },
          documentId: doc.id // This is the DOCUMENT ID for queries
        });
      });
      
      console.log(`✅ Found ${learners.length} learners in class ${classId}`);
      console.log('📝 Learner mappings:', learners.map(l => `${l.name}: CustomID=${l.id}, DocID=${l.documentId}`).join(', '));
      
      return learners;
    } catch (error) {
      console.error(`❌ Error fetching learners for class ${classId}:`, error);
      return [];
    }
  }

  /**
   * PUBLIC METHOD: Get total count of learners in a class
   */
  public async getLearnerCountInClass(classId: string): Promise<number> {
    try {
      const learners = await this.getLearnersInClass(classId);
      return learners.length;
    } catch (error) {
      console.error(`❌ Error getting learner count for class ${classId}:`, error);
      return 0;
    }
  }

  /**
   * PRIVATE METHOD: Resolve document ID from custom ID
   */
  private async resolveDocumentId(customId: string): Promise<string | null> {
    try {
      // Try to find by custom ID field
      const customIdQuery = query(
        this.learnersCollection,
        where('studentId', '==', customId)
      );
      const customSnapshot = await getDocs(customIdQuery);
      
      if (!customSnapshot.empty) {
        return customSnapshot.docs[0].id;
      }

      // Try other possible ID fields
      const regQuery = query(
        this.learnersCollection,
        where('registrationNumber', '==', customId)
      );
      const regSnapshot = await getDocs(regQuery);
      
      if (!regSnapshot.empty) {
        return regSnapshot.docs[0].id;
      }

      const admissionQuery = query(
        this.learnersCollection,
        where('admissionNumber', '==', customId)
      );
      const admissionSnapshot = await getDocs(admissionQuery);
      
      if (!admissionSnapshot.empty) {
        return admissionSnapshot.docs[0].id;
      }

      // Check if it's already a document ID
      const docRef = doc(this.learnersCollection, customId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return customId;
      }

      return null;
    } catch (error) {
      console.error('Error resolving document ID:', error);
      return null;
    }
  }

  /**
   * PRIVATE METHOD: Get student document and IDs from any input ID
   */
  private async getStudentDocument(inputId: string): Promise<{
    doc: any;
    documentId: string;
    customId: string;
    data: any;
  } | null> {
    try {
      // Try to find by custom ID first
      const customIdQuery = query(
        this.learnersCollection,
        where('studentId', '==', inputId)
      );
      const customSnapshot = await getDocs(customIdQuery);
      
      if (!customSnapshot.empty) {
        const doc = customSnapshot.docs[0];
        const data = doc.data();
        const customId = data.studentId || data.id || data.registrationNumber || data.admissionNumber || inputId;
        
        return {
          doc,
          documentId: doc.id,
          customId,
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
          doc: docSnap,
          documentId: inputId,
          customId,
          data
        };
      }

      return null;
    } catch (error) {
      console.error('Error getting student document:', error);
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
      console.log(`🔍 Fetching teacher assignments for class: ${classId}`);
      
      const assignmentsQuery = query(
        this.teacherAssignmentsCollection,
        where('classId', '==', classId)
      );
      
      const snapshot = await getDocs(assignmentsQuery);
      
      if (snapshot.empty) {
        console.warn(`⚠️ No teacher assignments found for class ${classId}`);
        return [];
      }

      const assignments = snapshot.docs.map(doc => {
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

      console.log(`📚 Found ${assignments.length} teacher assignments for class ${classId}`);
      
      return assignments;
    } catch (error) {
      console.error('❌ Error getting teacher assignments for class:', error);
      return [];
    }
  }

  /**
   * PUBLIC METHOD: Get expected subjects for a class from teacher assignments
   */
  public async getExpectedSubjectsForClass(classId: string): Promise<Array<{ id: string; name: string }>> {
    try {
      const assignments = await this.getTeacherAssignmentsForClass(classId);
      
      const subjectMap = new Map<string, string>();
      assignments.forEach(assignment => {
        subjectMap.set(assignment.subjectId, assignment.subject);
      });
      
      const subjects = Array.from(subjectMap.entries()).map(([id, name]) => ({
        id,
        name
      }));
      
      console.log(`✅ Expected subjects for class ${classId}:`, subjects.map(s => `${s.name} (${s.id})`));
      
      return subjects;
    } catch (error) {
      console.error('❌ Error getting expected subjects for class:', error);
      return [];
    }
  }

  // ==================== DEBUG METHOD ====================
  /**
   * Debug method to check student data
   */
  async debugCheckStudentData(
    studentId: string,
    term: string,
    year: number
  ): Promise<void> {
    console.log(`🔍 DEBUG: Checking data for student ${studentId}, ${term} ${year}`);
    
    const studentDoc = await this.getStudentDocument(studentId);
    if (!studentDoc) {
      console.log(`❌ Student not found: ${studentId}`);
      return;
    }
    
    console.log(`✅ Student found:`, {
      name: studentDoc.data.name,
      customId: studentDoc.customId,
      documentId: studentDoc.documentId,
      classId: studentDoc.data.classId
    });
    
    const resultsQuery = query(
      this.resultsCollection,
      where('studentId', '==', studentDoc.documentId),
      where('term', '==', term),
      where('year', '==', year)
    );
    
    const snapshot = await getDocs(resultsQuery);
    
    console.log(`📊 Found ${snapshot.size} results:`);
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`   - ${data.subjectName} (${data.examType}): ${data.marks}/${data.totalMarks} = ${data.percentage}% (Grade: ${data.grade})`);
    });
    
    if (studentDoc.data.classId) {
      const expectedSubjects = await this.getExpectedSubjectsForClass(studentDoc.data.classId);
      console.log(`📚 Expected subjects (${expectedSubjects.length}):`, expectedSubjects.map(s => s.name));
    }
  }

  // ==================== GET STUDENT PROGRESS ====================
  /**
   * Get ALL students with their progress data - FIXED: Progress bars now work correctly
   */
  async getStudentProgress(
    classId: string,
    term: string,
    year: number
  ): Promise<StudentProgress[]> {
    try {
      console.log(`🔍 Getting student progress for class: ${classId}, ${term} ${year}`);
      
      // 1. Get ALL learners with their mappings
      const learners = await this.getLearnersInClass(classId);
      
      if (learners.length === 0) {
        console.warn(`⚠️ No learners found in class ${classId}`);
        return [];
      }
      
      // 2. Get expected subjects
      const expectedSubjects = await this.getExpectedSubjectsForClass(classId);
      
      // 3. Get all results for this class/term/year
      const resultsQuery = query(
        this.resultsCollection,
        where('classId', '==', classId),
        where('term', '==', term),
        where('year', '==', year)
      );
      
      const resultsSnapshot = await getDocs(resultsQuery);
      const allResults: StudentResult[] = [];
      resultsSnapshot.forEach(doc => {
        allResults.push(doc.data() as StudentResult);
      });
      
      console.log(`📊 Found ${allResults.length} total result entries`);
      
      // Group results by studentId (which stores DOCUMENT IDs)
      const resultsByDocumentId = new Map<string, StudentResult[]>();
      allResults.forEach(result => {
        if (!resultsByDocumentId.has(result.studentId)) {
          resultsByDocumentId.set(result.studentId, []);
        }
        resultsByDocumentId.get(result.studentId)!.push(result);
      });
      
      // 4. Build progress for each student
      const studentProgress: StudentProgress[] = [];
      
      for (const learner of learners) {
        // Get results using the learner's DOCUMENT ID
        const studentResults = resultsByDocumentId.get(learner.documentId) || [];
        
        console.log(`📊 Building progress for ${learner.name}: ${studentResults.length} results found`);
        
        // Build subject progress
        const subjects: StudentProgress['subjects'] = [];
        let totalSubjectsCompleted = 0;
        let totalPercentage = 0;
        let subjectsWithScores = 0;
        
        for (const subject of expectedSubjects) {
          const subjectResults = studentResults.filter(r => r.subjectId === subject.id);
          
          const assignments = await this.getTeacherAssignmentsForClass(classId);
          const teacherAssignment = assignments.find(a => a.subjectId === subject.id);
          
          // Check each exam type and get the actual marks
          const week4Result = subjectResults.find(r => r.examType === 'week4');
          const week8Result = subjectResults.find(r => r.examType === 'week8');
          const endOfTermResult = subjectResults.find(r => r.examType === 'endOfTerm');
          
          // Log what we found for debugging
          if (week4Result || week8Result || endOfTermResult) {
            console.log(`   📝 ${subject.name}:`, {
              week4: week4Result?.percentage ?? 'missing',
              week8: week8Result?.percentage ?? 'missing',
              endOfTerm: endOfTermResult?.percentage ?? 'missing'
            });
          }
          
          // Calculate subject completion - an exam is complete if a result document exists
          const week4Complete = week4Result !== undefined;
          const week8Complete = week8Result !== undefined;
          const endOfTermComplete = endOfTermResult !== undefined;
          
          let completedExams = 0;
          if (week4Complete) completedExams++;
          if (week8Complete) completedExams++;
          if (endOfTermComplete) completedExams++;
          
          const subjectProgress = Math.round((completedExams / 3) * 100);
          if (subjectProgress === 100) totalSubjectsCompleted++;
          
          // Track overall percentage using end of term if available
          if (endOfTermResult && endOfTermResult.percentage >= 0) {
            totalPercentage += endOfTermResult.percentage;
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
            subjectProgress,
            grade: endOfTermResult?.grade
          });
        }
        
        const overallPercentage = subjectsWithScores > 0 
          ? Math.round(totalPercentage / subjectsWithScores) 
          : 0;
        
        const overallGrade = overallPercentage > 0 ? calculateGrade(overallPercentage) : -1;
        
        const completionPercentage = expectedSubjects.length > 0
          ? Math.round((totalSubjectsCompleted / expectedSubjects.length) * 100)
          : 0;
        
        const isComplete = totalSubjectsCompleted === expectedSubjects.length && expectedSubjects.length > 0;
        
        const className = learner.data.className || 
                         (await this.getClassData(classId))?.name || 
                         'Unknown';
        
        const form = learner.data.form || 
                    learner.data.level?.toString() || 
                    (await this.getClassData(classId))?.level?.toString() || 
                    '1';
        
        studentProgress.push({
          studentId: learner.id, // This is the CUSTOM ID for display
          studentName: learner.name,
          className,
          classId,
          form,
          overallPercentage,
          overallGrade,
          status: overallPercentage >= 50 ? 'pass' : (overallPercentage > 0 ? 'fail' : 'pending'),
          isComplete,
          completionPercentage,
          subjects,
          missingSubjects: expectedSubjects.length - totalSubjectsCompleted,
          totalSubjects: expectedSubjects.length,
          documentId: learner.documentId // Include document ID for internal use
        });
        
        console.log(`✅ Built progress for ${learner.name}: ${completionPercentage}% complete, ${studentResults.length} results`);
      }
      
      const sorted = studentProgress.sort((a, b) => a.studentName.localeCompare(b.studentName));
      
      console.log(`✅ Found progress data for ${sorted.length} students`);
      console.log(`   Complete: ${sorted.filter(s => s.isComplete).length}`);
      console.log(`   Average completion: ${Math.round(sorted.reduce((acc, s) => acc + s.completionPercentage, 0) / sorted.length)}%`);
      
      return sorted;
    } catch (error) {
      console.error('❌ Error getting student progress:', error);
      return [];
    }
  }

  // ==================== EXISTING RESULTS CHECK ====================

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

  // ==================== SUBJECT COMPLETION STATUS ====================

  async getSubjectCompletionStatus(
    classId: string,
    term: string,
    year: number
  ): Promise<SubjectCompletionStatus[]> {
    try {
      const classDoc = await getDoc(doc(this.classesCollection, classId));
      const classData = classDoc.data();
      if (!classData) {
        throw new Error('Class not found');
      }

      const expectedSubjects = await this.getExpectedSubjectsForClass(classId);
      
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
        const normalizedId = normalizeSubjectName(subject.id);
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
      throw error;
    }
  }

  // ==================== REPORT READINESS ====================

  async validateReportCardReadiness(
    studentId: string, // Can be custom ID or document ID
    term: string,
    year: number
  ): Promise<ReportReadinessCheck> {
    try {
      console.log(`🔍 Validating report readiness for student: ${studentId}`);
      
      const studentDoc = await this.getStudentDocument(studentId);
      
      if (!studentDoc) {
        throw new Error(`Student not found: ${studentId}`);
      }
      
      const { data: studentData, customId, documentId } = studentDoc;
      const studentName = studentData.name || studentData.studentName || 'Unknown';
      const classId = studentData.classId;

      if (!classId) {
        throw new Error(`Student ${studentId} has no class assigned`);
      }

      const expectedSubjects = await this.getExpectedSubjectsForClass(classId);
      
      console.log(`📚 Student ${studentName} in class ${classId} expects ${expectedSubjects.length} subjects`);

      const results = await this.getStudentResults(documentId, { term, year });
      
      console.log(`📝 Found ${results.length} result entries for student`);

      const subjectMap = new Map<string, {
        subjectName: string;
        subjectId: string;
        teacherId: string;
        teacherName: string;
        hasWeek4: boolean;
        hasWeek8: boolean;
        hasEndOfTerm: boolean;
      }>();

      expectedSubjects.forEach(subject => {
        const normalizedId = subject.id;
        subjectMap.set(normalizedId, {
          subjectName: subject.name,
          subjectId: normalizedId,
          teacherId: 'pending',
          teacherName: 'Not assigned',
          hasWeek4: false,
          hasWeek8: false,
          hasEndOfTerm: false,
        });
      });

      results.forEach(result => {
        const key = result.subjectId;
        if (!subjectMap.has(key)) {
          console.log(`➕ Adding unexpected subject: ${result.subjectName} (${key})`);
          subjectMap.set(key, {
            subjectName: result.subjectName,
            subjectId: result.subjectId,
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

      const isReady = missingData.length === 0 && subjectMap.size > 0;

      return {
        isReady,
        studentId: customId, // Return custom ID for display
        studentName,
        totalSubjects: subjectMap.size,
        completeSubjects,
        missingData,
      };
    } catch (error) {
      console.error('❌ Error validating report card readiness:', error);
      throw error;
    }
  }

  async validateClassReportReadiness(
    classId: string,
    term: string,
    year: number
  ): Promise<ClassReportReadiness> {
    try {
      console.log(`🔍 Validating class report readiness: ${classId} for ${term} ${year}`);
      
      const classDoc = await getDoc(doc(this.classesCollection, classId));
      if (!classDoc.exists()) {
        throw new Error(`Class not found: ${classId}`);
      }
      const classData = classDoc.data();

      const expectedSubjectsWithIds = await this.getExpectedSubjectsForClass(classId);
      const expectedSubjectIds = expectedSubjectsWithIds.map(s => s.id);
      const hasAssignments = expectedSubjectsWithIds.length > 0;

      const learners = await this.getLearnersInClass(classId);
      
      console.log(`👥 Found ${learners.length} total students in class`);

      const readinessChecks = await Promise.allSettled(
        learners.map(learner =>
          this.validateReportCardReadiness(learner.id, term, year)
        )
      );

      const studentDetails: ReportReadinessCheck[] = [];
      readinessChecks.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          studentDetails.push(result.value);
        } else {
          console.error(`Failed to validate student ${learners[index]?.id}:`, result.reason);
          studentDetails.push({
            isReady: false,
            studentId: learners[index]?.id || 'unknown',
            studentName: learners[index]?.name || 'Unknown',
            totalSubjects: 0,
            completeSubjects: 0,
            missingData: [{
              subject: 'Validation Error',
              subjectId: 'error',
              teacherName: 'System',
              missingExamTypes: ['Failed to validate student data'],
            }],
          });
        }
      });

      const readyStudents = studentDetails.filter(check => check.isReady).length;
      const incompleteStudents = studentDetails.length - readyStudents;
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
        incompleteStudents,
        completionPercentage,
        studentDetails,
        expectedSubjects: expectedSubjectIds,
        expectedSubjectsWithIds,
        hasAssignments,
      };
    } catch (error) {
      console.error('❌ Error validating class report readiness:', error);
      throw error;
    }
  }

  // ==================== SAVE RESULTS ====================

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
      studentId: string; // This can be either custom ID or document ID
      studentName: string;
      marks: number;
    }>;
  }, options?: {
    overwrite?: boolean;
  }): Promise<{ success: boolean; count: number; results: StudentResult[]; overwritten: boolean }> {
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
          `Found ${existing.count} existing entries.`
        );
      }

      const batch = writeBatch(db);
      const savedResults: StudentResult[] = [];
      const now = new Date().toISOString();

      const classDoc = await getDoc(doc(this.classesCollection, data.classId));
      const classData = classDoc.data();
      const form = classData?.level?.toString() || '1';

      for (const result of data.results) {
        // Resolve the document ID for this student
        const studentDoc = await this.getStudentDocument(result.studentId);
        
        if (!studentDoc) {
          console.warn(`⚠️ Could not resolve student ID: ${result.studentId}, skipping...`);
          continue;
        }

        const percentage = result.marks < 0
          ? -1
          : Math.round((result.marks / data.totalMarks) * 100);
        const grade = calculateGrade(percentage);

        const status: StudentResult['status'] =
          result.marks < 0 ? 'absent' : 'entered';

        const resultData: StudentResult = {
          id: this.generateResultId(
            studentDoc.documentId, // Use document ID for the result ID
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
          customStudentId: studentDoc.customId // Optionally store custom ID for reference
        };

        const docRef = doc(this.resultsCollection, resultData.id);
        batch.set(docRef, resultData, { merge: true });
        savedResults.push(resultData);
      }

      await batch.commit();
      console.log(`✅ Saved ${savedResults.length} results for ${normalizedSubjectName}`);

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

  // ==================== GENERATE REPORT CARD ====================
  
  async generateReportCard(
    studentId: string, // This is the CUSTOM ID from the UI (e.g., STU0240542AV)
    term: string,
    year: number,
    options?: {
      includeIncomplete?: boolean;
      markMissing?: boolean;
    }
  ): Promise<ReportCardData | null> {
    try {
      console.log(`📝 Generating report card for student with custom ID: ${studentId}, ${term} ${year}`);
      
      // STEP 1: Get student document and both IDs
      const studentDoc = await this.getStudentDocument(studentId);
      
      if (!studentDoc) {
        console.warn(`⚠️ Student not found: ${studentId}`);
        return null;
      }
      
      const { data: studentData, documentId, customId } = studentDoc;
      const studentName = studentData.name || studentData.studentName || 'Unknown';
      const classId = studentData.classId;
      
      if (!classId) {
        console.warn(`⚠️ Student ${studentId} has no class assigned`);
        return null;
      }

      // Get class data
      const classDoc = await getDoc(doc(this.classesCollection, classId));
      if (!classDoc.exists()) {
        console.warn(`⚠️ Class not found: ${classId}`);
        return null;
      }
      const classData = classDoc.data();
      const className = classData.name || 'Unknown';
      const form = classData.level?.toString() || '1';

      // STEP 2: Fetch results using the DOCUMENT ID
      console.log(`🔍 Fetching results using document ID: ${documentId}`);
      
      const resultsQuery = query(
        this.resultsCollection,
        where('studentId', '==', documentId), // Use document ID here!
        where('term', '==', term),
        where('year', '==', year)
      );

      const snapshot = await getDocs(resultsQuery);
      
      if (snapshot.empty) {
        console.log(`📭 No results found for student ${studentName} in ${term} ${year}`);
        return null;
      }

      const allResults: StudentResult[] = [];
      snapshot.forEach(doc => {
        allResults.push(doc.data() as StudentResult);
      });

      console.log(`📚 Found ${allResults.length} result records using document ID: ${documentId}`);
      allResults.forEach(r => {
        console.log(`   - ${r.subjectName} (${r.examType}): ${r.marks}/${r.totalMarks} = ${r.percentage}%`);
      });

      // Process results into subject map
      const subjectMap = new Map<string, {
        subjectId: string;
        subjectName: string;
        teacherId: string;
        teacherName: string;
        week4: number;
        week8: number;
        endOfTerm: number;
      }>();

      allResults.forEach(result => {
        const normalizedSubjectId = normalizeSubjectName(result.subjectId || result.subjectName);
        
        if (!subjectMap.has(normalizedSubjectId)) {
          subjectMap.set(normalizedSubjectId, {
            subjectId: normalizedSubjectId,
            subjectName: result.subjectName,
            teacherId: result.teacherId,
            teacherName: result.teacherName,
            week4: -1,
            week8: -1,
            endOfTerm: -1,
          });
        }

        const subject = subjectMap.get(normalizedSubjectId)!;
        
        if (result.examType === 'week4') subject.week4 = result.percentage;
        if (result.examType === 'week8') subject.week8 = result.percentage;
        if (result.examType === 'endOfTerm') subject.endOfTerm = result.percentage;
      });

      // Build subjects array
      const subjects: SubjectResultSummary[] = [];
      let totalPercentage = 0;
      let validSubjectsCount = 0;

      subjectMap.forEach((subjectData) => {
        const missingExams: string[] = [];
        if (subjectData.week4 === -1) missingExams.push('Week 4');
        if (subjectData.week8 === -1) missingExams.push('Week 8');
        if (subjectData.endOfTerm === -1) missingExams.push('End of Term');

        const isComplete = missingExams.length === 0;
        const endOfTermScore = subjectData.endOfTerm;
        const grade = endOfTermScore >= 0 ? calculateGrade(endOfTermScore) : -1;

        let comment = grade >= 0 
          ? this.generateSubjectComment(grade, endOfTermScore)
          : 'Assessment pending';

        if (!isComplete && options?.markMissing) {
          comment = `⚠️ Missing: ${missingExams.join(', ')}. ${comment}`;
        }

        subjects.push({
          subjectId: subjectData.subjectId,
          subjectName: subjectData.subjectName,
          teacherId: subjectData.teacherId,
          teacherName: subjectData.teacherName,
          week4: subjectData.week4,
          week8: subjectData.week8,
          endOfTerm: endOfTermScore,
          grade,
          comment,
          isComplete,
          missingExams,
        });

        if (endOfTermScore >= 0) {
          totalPercentage += endOfTermScore;
          validSubjectsCount++;
        }
      });

      const averagePercentage = validSubjectsCount > 0 
        ? Math.round(totalPercentage / validSubjectsCount)
        : 0;
      const overallGrade = averagePercentage > 0 ? calculateGrade(averagePercentage) : -1;
      
      const completeSubjects = subjects.filter(s => s.isComplete).length;
      const completionPercentage = subjects.length > 0
        ? Math.round((completeSubjects / subjects.length) * 100)
        : 0;

      const isComplete = completeSubjects === subjects.length && subjects.length > 0;

      if (!isComplete && !options?.includeIncomplete) {
        console.log(`⚠️ Report incomplete (${completionPercentage}%) and includeIncomplete=false`);
        return null;
      }

      const position = await this.calculatePosition(documentId, classId, term, year);
      const teachersComment = this.generateTeacherComment(
        overallGrade,
        averagePercentage,
        subjects
      );

      // STEP 3: Return report card with CUSTOM ID for display
      const reportCard: ReportCardData = {
        id: `report-${customId}-${term}-${year}`,
        studentId: customId, // Return the CUSTOM ID for display
        studentName,
        className,
        classId,
        form,
        grade: overallGrade,
        position,
        gender: studentData.gender || 'Not specified',
        totalMarks: totalPercentage,
        percentage: averagePercentage,
        status: averagePercentage >= 50 && averagePercentage > 0 ? 'pass' : 'fail',
        improvement: await this.calculateImprovement(documentId, term, year),
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
        documentId // Include for debugging if needed
      };

      console.log(`✅ Generated report card for ${studentName}: ${averagePercentage}%`);
      console.log(`   Display ID: ${customId}, Document ID used for queries: ${documentId}`);
      console.log(`   Subjects with marks:`, subjects.map(s => `${s.subjectName}: ${s.endOfTerm}%`));

      return reportCard;
    } catch (error) {
      console.error(`❌ Error generating report card for student ${studentId}:`, error);
      return null;
    }
  }

  // ==================== GENERATE CLASS REPORT CARDS ====================
  
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
      console.log(`🎓 Generating class report cards for: ${classId}, ${term} ${year}`);
      
      const learners = await this.getLearnersInClass(classId);
      
      if (learners.length === 0) {
        console.warn(`⚠️ No learners found in class ${classId}`);
        return {
          reportCards: [],
          summary: {
            total: 0,
            passed: 0,
            failed: 0,
            avgPercentage: 0,
            complete: 0,
            incomplete: 0,
          },
        };
      }

      console.log(`👥 Generating reports for ${learners.length} learners`);

      const reportCardsPromises = learners.map(learner =>
        this.generateReportCard(learner.id, term, year, {
          includeIncomplete: options?.includeIncomplete ?? true,
          markMissing: options?.markMissing ?? true,
        })
      );

      const reportCardsResults = await Promise.allSettled(reportCardsPromises);

      const reportCards: ReportCardData[] = [];
      let successCount = 0;
      let nullCount = 0;
      let errorCount = 0;

      reportCardsResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          if (result.value !== null) {
            reportCards.push(result.value);
            successCount++;
          } else {
            nullCount++;
          }
        } else {
          console.error(`❌ Failed to generate report for student ${learners[index]?.id}:`, result.reason);
          errorCount++;
        }
      });

      console.log(`📊 Report generation complete: ${successCount} success, ${nullCount} no data, ${errorCount} errors`);

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
      console.error('❌ Error generating class report cards:', error);
      throw error;
    }
  }

  // ==================== QUERY METHODS ====================

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
      
      return results;
    } catch (error) {
      console.error('Error fetching teacher results:', error);
      throw error;
    }
  }

  async getStudentResults(
    studentId: string, // This should be the DOCUMENT ID for queries
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

  // ==================== ANALYTICS METHODS ====================

  async calculateClassComparison(options?: {
    term?: string;
    year?: number;
  }): Promise<any[]> {
    try {
      const constraints = [];
      if (options?.term) constraints.push(where('term', '==', options.term));
      if (options?.year) constraints.push(where('year', '==', options.year));
      
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

  calculateGradeDistribution(results: StudentResult[]): any[] {
    const gradeCounts = new Map<number, number>();
    
    for (let i = 1; i <= 9; i++) {
      gradeCounts.set(i, 0);
    }

    results
      .filter(r => r.examType === 'endOfTerm' && r.grade > 0)
      .forEach(result => {
        gradeCounts.set(result.grade, (gradeCounts.get(result.grade) || 0) + 1);
      });

    const total = results.filter(r => r.examType === 'endOfTerm' && r.grade > 0).length;

    return Array.from(gradeCounts.entries())
      .map(([grade, count]) => ({
        grade,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        description: getGradeDescription(grade),
      }))
      .filter(g => g.count > 0);
  }

  calculatePerformanceTrend(results: StudentResult[]): any[] {
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
        improvement: 'stable' as const,
      };
    });

    return trendData.map((data, index) => {
      if (index === 0) return data;
      
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
        topGrade: results.length > 0
          ? Math.min(...results.filter(r => r.grade > 0).map(r => r.grade)).toString()
          : 'N/A',
      };
    } catch (error) {
      console.error('Error getting analytics summary:', error);
      throw error;
    }
  }

  // ==================== PUBLIC HELPER METHODS ====================

  public async getClassData(classId: string): Promise<any> {
    try {
      const classDoc = await getDoc(doc(this.classesCollection, classId));
      return classDoc.exists() ? classDoc.data() : null;
    } catch (error) {
      console.error('Error getting class data:', error);
      return null;
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  private generateResultId(
    studentId: string, // This should be the DOCUMENT ID
    subjectId: string,
    examType: string,
    term: string,
    year: number
  ): string {
    const cleanTerm = term.replace(/\s+/g, '');
    const normalizedSubject = normalizeSubjectName(subjectId);
    return `${studentId}_${normalizedSubject}_${examType}_${cleanTerm}_${year}`;
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
    studentDocId: string, // This should be the DOCUMENT ID
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

      const position = rankings.findIndex(r => r.studentId === studentDocId) + 1;
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
    studentDocId: string, // This should be the DOCUMENT ID
    currentTerm: string,
    currentYear: number
  ): Promise<'improved' | 'declined' | 'stable'> {
    try {
      const termMap = { 'Term 1': 'Term 3', 'Term 2': 'Term 1', 'Term 3': 'Term 2' };
      const previousTerm = termMap[currentTerm as keyof typeof termMap];
      const previousYear = currentTerm === 'Term 1' ? currentYear - 1 : currentYear;

      const currentResults = await this.getStudentResults(studentDocId, {
        term: currentTerm,
        year: currentYear,
      });
      
      const currentEndOfTerm = currentResults.filter(r => r.examType === 'endOfTerm' && r.percentage >= 0);
      const currentAvg = currentEndOfTerm.length > 0
        ? currentEndOfTerm.reduce((sum, r) => sum + r.percentage, 0) / currentEndOfTerm.length
        : 0;

      const previousResults = await this.getStudentResults(studentDocId, {
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