// @/services/resultsService.ts
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  Timestamp,
  serverTimestamp,
  DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ==================== TYPES ====================

export interface SubjectResult {
  name: string;
  marks: number;
  total: number;
  percentage: number;
  grade: string;
  teacher: string;
  teacherId: string;
}

export interface StudentResult {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  examType: 'test' | 'midterm' | 'final' | 'assignment';
  examName: string;
  marks: number;
  totalMarks: number;
  percentage: number;
  grade: string;
  term: string;
  year: number;
  enteredAt: Date;
  updatedAt?: Date;
  createdAt: Date;
}

export interface ClassResults {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  examType: string;
  examName: string;
  results: StudentResult[];
  averageScore: number;
  passRate: number;
  highestScore: number;
  lowestScore: number;
  totalStudents: number;
  term: string;
  year: number;
}

export interface GradeDistribution {
  grade: string;
  count: number;
  percentage: number;
  students: string[];
}

export interface PerformanceTrend {
  examName: string;
  examType: string;
  date: Date;
  avgMarks: number;
  passRate: number;
  totalStudents: number;
}

export interface ReportCardData {
  studentId: string;
  studentName: string;
  className: string;
  classId: string;
  term: string;
  year: number;
  subjects: SubjectResult[];
  totalMarks: number;
  totalPossible: number;
  percentage: number;
  overallGrade: string;
  position: number;
  attendance: number;
  remarks: string;
  generatedAt: Date;
}

// ==================== HELPER FUNCTIONS ====================

const toDate = (timestamp: any): Date => {
  if (!timestamp) return new Date();
  if (timestamp instanceof Date) return timestamp;
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  if (timestamp.seconds) {
    return new Date(timestamp.seconds * 1000);
  }
  return new Date();
};

const calculateGrade = (percentage: number): string => {
  if (percentage >= 90) return 'A+';
  if (percentage >= 85) return 'A';
  if (percentage >= 80) return 'A-';
  if (percentage >= 75) return 'B+';
  if (percentage >= 70) return 'B';
  if (percentage >= 65) return 'B-';
  if (percentage >= 60) return 'C+';
  if (percentage >= 55) return 'C';
  if (percentage >= 50) return 'C-';
  if (percentage >= 45) return 'D+';
  if (percentage >= 40) return 'D';
  if (percentage >= 35) return 'D-';
  return 'F';
};

// ==================== RESULTS SERVICE ====================

export const resultsService = {
  // ==================== CREATE/UPDATE RESULTS ====================
  
  /**
   * Save results for multiple students in a class for a specific exam
   */
  saveClassResults: async (data: {
    classId: string;
    className: string;
    subjectId: string;
    subjectName: string;
    teacherId: string;
    teacherName: string;
    examType: 'test' | 'midterm' | 'final' | 'assignment';
    examName: string;
    term: string;
    year: number;
    totalMarks: number;
    results: Array<{
      studentId: string;
      studentName: string;
      marks: number;
    }>;
  }): Promise<{ success: number; failed: number }> => {
    const batch = writeBatch(db);
    let success = 0;
    let failed = 0;

    try {
      for (const studentResult of data.results) {
        try {
          const percentage = (studentResult.marks / data.totalMarks) * 100;
          const grade = calculateGrade(percentage);

          const resultRef = doc(collection(db, 'results'));
          batch.set(resultRef, {
            studentId: studentResult.studentId,
            studentName: studentResult.studentName,
            classId: data.classId,
            className: data.className,
            subjectId: data.subjectId,
            subjectName: data.subjectName,
            teacherId: data.teacherId,
            teacherName: data.teacherName,
            examType: data.examType,
            examName: data.examName,
            marks: studentResult.marks,
            totalMarks: data.totalMarks,
            percentage,
            grade,
            term: data.term,
            year: data.year,
            enteredAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          success++;
        } catch (error) {
          console.error('Error processing student result:', studentResult, error);
          failed++;
        }
      }

      await batch.commit();
      return { success, failed };
    } catch (error) {
      console.error('Error saving class results:', error);
      throw error;
    }
  },

  /**
   * Update a single student's result
   */
  updateStudentResult: async (resultId: string, marks: number, totalMarks: number): Promise<void> => {
    try {
      const percentage = (marks / totalMarks) * 100;
      const grade = calculateGrade(percentage);

      const resultRef = doc(db, 'results', resultId);
      await updateDoc(resultRef, {
        marks,
        totalMarks,
        percentage,
        grade,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating student result:', error);
      throw error;
    }
  },

  // ==================== FETCH RESULTS ====================

  /**
   * Get results for a specific class and subject
   */
  getClassSubjectResults: async (
    classId: string,
    subjectId: string,
    filters?: {
      examType?: string;
      term?: string;
      year?: number;
    }
  ): Promise<StudentResult[]> => {
    try {
      const resultsRef = collection(db, 'results');
      let constraints: any[] = [
        where('classId', '==', classId),
        where('subjectId', '==', subjectId),
      ];

      if (filters?.examType) {
        constraints.push(where('examType', '==', filters.examType));
      }
      if (filters?.term) {
        constraints.push(where('term', '==', filters.term));
      }
      if (filters?.year) {
        constraints.push(where('year', '==', filters.year));
      }

      constraints.push(orderBy('enteredAt', 'desc'));

      const q = query(resultsRef, ...constraints);
      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => {
        const data = doc.data() as DocumentData;
        return {
          id: doc.id,
          studentId: data.studentId,
          studentName: data.studentName,
          classId: data.classId,
          className: data.className,
          subjectId: data.subjectId,
          subjectName: data.subjectName,
          teacherId: data.teacherId,
          teacherName: data.teacherName,
          examType: data.examType,
          examName: data.examName,
          marks: data.marks,
          totalMarks: data.totalMarks,
          percentage: data.percentage,
          grade: data.grade,
          term: data.term,
          year: data.year,
          enteredAt: toDate(data.enteredAt),
          updatedAt: toDate(data.updatedAt),
          createdAt: toDate(data.createdAt),
        } as StudentResult;
      });
    } catch (error) {
      console.error('Error fetching class subject results:', error);
      throw error;
    }
  },

  /**
   * Get all results for a teacher's classes
   */
  getTeacherResults: async (
    teacherId: string,
    filters?: {
      classId?: string;
      subjectId?: string;
      term?: string;
      year?: number;
    }
  ): Promise<StudentResult[]> => {
    try {
      const resultsRef = collection(db, 'results');
      let constraints: any[] = [where('teacherId', '==', teacherId)];

      if (filters?.classId) {
        constraints.push(where('classId', '==', filters.classId));
      }
      if (filters?.subjectId) {
        constraints.push(where('subjectId', '==', filters.subjectId));
      }
      if (filters?.term) {
        constraints.push(where('term', '==', filters.term));
      }
      if (filters?.year) {
        constraints.push(where('year', '==', filters.year));
      }

      constraints.push(orderBy('enteredAt', 'desc'));

      const q = query(resultsRef, ...constraints);
      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => {
        const data = doc.data() as DocumentData;
        return {
          id: doc.id,
          studentId: data.studentId,
          studentName: data.studentName,
          classId: data.classId,
          className: data.className,
          subjectId: data.subjectId,
          subjectName: data.subjectName,
          teacherId: data.teacherId,
          teacherName: data.teacherName,
          examType: data.examType,
          examName: data.examName,
          marks: data.marks,
          totalMarks: data.totalMarks,
          percentage: data.percentage,
          grade: data.grade,
          term: data.term,
          year: data.year,
          enteredAt: toDate(data.enteredAt),
          updatedAt: toDate(data.updatedAt),
          createdAt: toDate(data.createdAt),
        } as StudentResult;
      });
    } catch (error) {
      console.error('Error fetching teacher results:', error);
      throw error;
    }
  },

  /**
   * Get all results for admin (all classes, all subjects)
   */
  getAllResults: async (filters?: {
    classId?: string;
    subjectId?: string;
    term?: string;
    year?: number;
    examType?: string;
  }): Promise<StudentResult[]> => {
    try {
      const resultsRef = collection(db, 'results');
      let constraints: any[] = [];

      if (filters?.classId) {
        constraints.push(where('classId', '==', filters.classId));
      }
      if (filters?.subjectId) {
        constraints.push(where('subjectId', '==', filters.subjectId));
      }
      if (filters?.term) {
        constraints.push(where('term', '==', filters.term));
      }
      if (filters?.year) {
        constraints.push(where('year', '==', filters.year));
      }
      if (filters?.examType) {
        constraints.push(where('examType', '==', filters.examType));
      }

      constraints.push(orderBy('enteredAt', 'desc'));

      const q = query(resultsRef, ...constraints);
      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => {
        const data = doc.data() as DocumentData;
        return {
          id: doc.id,
          studentId: data.studentId,
          studentName: data.studentName,
          classId: data.classId,
          className: data.className,
          subjectId: data.subjectId,
          subjectName: data.subjectName,
          teacherId: data.teacherId,
          teacherName: data.teacherName,
          examType: data.examType,
          examName: data.examName,
          marks: data.marks,
          totalMarks: data.totalMarks,
          percentage: data.percentage,
          grade: data.grade,
          term: data.term,
          year: data.year,
          enteredAt: toDate(data.enteredAt),
          updatedAt: toDate(data.updatedAt),
          createdAt: toDate(data.createdAt),
        } as StudentResult;
      });
    } catch (error) {
      console.error('Error fetching all results:', error);
      throw error;
    }
  },

  /**
   * Get results for a specific student
   */
  getStudentResults: async (
    studentId: string,
    filters?: {
      term?: string;
      year?: number;
      subjectId?: string;
    }
  ): Promise<StudentResult[]> => {
    try {
      const resultsRef = collection(db, 'results');
      let constraints: any[] = [where('studentId', '==', studentId)];

      if (filters?.term) {
        constraints.push(where('term', '==', filters.term));
      }
      if (filters?.year) {
        constraints.push(where('year', '==', filters.year));
      }
      if (filters?.subjectId) {
        constraints.push(where('subjectId', '==', filters.subjectId));
      }

      constraints.push(orderBy('enteredAt', 'desc'));

      const q = query(resultsRef, ...constraints);
      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => {
        const data = doc.data() as DocumentData;
        return {
          id: doc.id,
          studentId: data.studentId,
          studentName: data.studentName,
          classId: data.classId,
          className: data.className,
          subjectId: data.subjectId,
          subjectName: data.subjectName,
          teacherId: data.teacherId,
          teacherName: data.teacherName,
          examType: data.examType,
          examName: data.examName,
          marks: data.marks,
          totalMarks: data.totalMarks,
          percentage: data.percentage,
          grade: data.grade,
          term: data.term,
          year: data.year,
          enteredAt: toDate(data.enteredAt),
          updatedAt: toDate(data.updatedAt),
          createdAt: toDate(data.createdAt),
        } as StudentResult;
      });
    } catch (error) {
      console.error('Error fetching student results:', error);
      throw error;
    }
  },

  // ==================== ANALYTICS ====================

  /**
   * Calculate grade distribution for a set of results
   */
  calculateGradeDistribution: (results: StudentResult[]): GradeDistribution[] => {
    const gradeMap = new Map<string, string[]>();
    const gradeOrder = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'];

    results.forEach(result => {
      const students = gradeMap.get(result.grade) || [];
      students.push(result.studentName);
      gradeMap.set(result.grade, students);
    });

    const total = results.length;

    return gradeOrder.map(grade => {
      const students = gradeMap.get(grade) || [];
      return {
        grade,
        count: students.length,
        percentage: total > 0 ? Math.round((students.length / total) * 100) : 0,
        students,
      };
    }).filter(dist => dist.count > 0);
  },

  /**
   * Calculate performance trend over time
   */
  calculatePerformanceTrend: (results: StudentResult[]): PerformanceTrend[] => {
    // Group results by exam
    const examMap = new Map<string, StudentResult[]>();

    results.forEach(result => {
      const key = `${result.examName}-${result.examType}`;
      const examResults = examMap.get(key) || [];
      examResults.push(result);
      examMap.set(key, examResults);
    });

    // Calculate average and pass rate for each exam
    const trends: PerformanceTrend[] = [];

    examMap.forEach((examResults, key) => {
      const totalMarks = examResults.reduce((sum, r) => sum + r.percentage, 0);
      const avgMarks = examResults.length > 0 ? totalMarks / examResults.length : 0;
      const passedCount = examResults.filter(r => r.percentage >= 50).length;
      const passRate = examResults.length > 0 ? (passedCount / examResults.length) * 100 : 0;

      // Use the most recent date from results
      const dates = examResults.map(r => r.enteredAt).sort((a, b) => b.getTime() - a.getTime());

      trends.push({
        examName: examResults[0].examName,
        examType: examResults[0].examType,
        date: dates[0],
        avgMarks: Math.round(avgMarks * 10) / 10,
        passRate: Math.round(passRate * 10) / 10,
        totalStudents: examResults.length,
      });
    });

    // Sort by date
    return trends.sort((a, b) => a.date.getTime() - b.date.getTime());
  },

  /**
   * Calculate class comparison statistics
   */
  calculateClassComparison: async (filters?: {
    term?: string;
    year?: number;
  }): Promise<Array<{
    classId: string;
    className: string;
    avgMarks: number;
    passRate: number;
    totalStudents: number;
    topGrade: string;
  }>> => {
    try {
      const results = await resultsService.getAllResults(filters);

      // Group by class
      const classMap = new Map<string, StudentResult[]>();

      results.forEach(result => {
        const classResults = classMap.get(result.classId) || [];
        classResults.push(result);
        classMap.set(result.classId, classResults);
      });

      // Calculate stats for each class
      const comparison: Array<any> = [];

      classMap.forEach((classResults, classId) => {
        const totalMarks = classResults.reduce((sum, r) => sum + r.percentage, 0);
        const avgMarks = classResults.length > 0 ? totalMarks / classResults.length : 0;
        const passedCount = classResults.filter(r => r.percentage >= 50).length;
        const passRate = classResults.length > 0 ? (passedCount / classResults.length) * 100 : 0;

        // Get top grade
        const gradeOrder = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'];
        const topGrade = gradeOrder.find(grade => 
          classResults.some(r => r.grade === grade)
        ) || 'F';

        comparison.push({
          classId,
          className: classResults[0].className,
          avgMarks: Math.round(avgMarks * 10) / 10,
          passRate: Math.round(passRate * 10) / 10,
          totalStudents: classResults.length,
          topGrade,
        });
      });

      return comparison.sort((a, b) => b.avgMarks - a.avgMarks);
    } catch (error) {
      console.error('Error calculating class comparison:', error);
      throw error;
    }
  },

  /**
   * Generate report card data for a student
   */
  generateReportCard: async (
    studentId: string,
    term: string,
    year: number
  ): Promise<ReportCardData | null> => {
    try {
      const results = await resultsService.getStudentResults(studentId, { term, year });

      if (results.length === 0) {
        return null;
      }

      // Group by subject to get latest result for each
      const subjectMap = new Map<string, StudentResult[]>();

      results.forEach(result => {
        const subjectResults = subjectMap.get(result.subjectId) || [];
        subjectResults.push(result);
        subjectMap.set(result.subjectId, subjectResults);
      });

      // Get final/latest result for each subject
      const subjectResults: SubjectResult[] = [];
      let totalMarks = 0;
      let totalPossible = 0;

      subjectMap.forEach((subjectResultsList) => {
        // Sort by date and get most recent
        const sorted = subjectResultsList.sort((a, b) => 
          b.enteredAt.getTime() - a.enteredAt.getTime()
        );
        const latest = sorted[0];

        subjectResults.push({
          name: latest.subjectName,
          marks: latest.marks,
          total: latest.totalMarks,
          percentage: latest.percentage,
          grade: latest.grade,
          teacher: latest.teacherName,
          teacherId: latest.teacherId,
        });

        totalMarks += latest.marks;
        totalPossible += latest.totalMarks;
      });

      const percentage = totalPossible > 0 ? (totalMarks / totalPossible) * 100 : 0;
      const overallGrade = calculateGrade(percentage);

      // Calculate position (would need all students' data for accurate position)
      // For now, we'll set a placeholder
      const position = 1;

      return {
        studentId,
        studentName: results[0].studentName,
        className: results[0].className,
        classId: results[0].classId,
        term,
        year,
        subjects: subjectResults,
        totalMarks,
        totalPossible,
        percentage: Math.round(percentage * 10) / 10,
        overallGrade,
        position,
        attendance: 95, // Placeholder - would come from attendance system
        remarks: '', // Would be added by teacher/admin
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error('Error generating report card:', error);
      throw error;
    }
  },
};