// @/services/resultsService.ts
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
  and,
  or
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
  marks: number; // -1 for absent (X), 0-100 for actual marks
  totalMarks: number;
  percentage: number;
  grade: number; // 1-9 scale, -1 for absent (X)
  term: string;
  year: number;
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
  generatedDate: string;
  term: string;
  year: number;
}

export interface GradeDistribution {
  grade: number;
  count: number;
  percentage: number;
}

export interface PerformanceTrend {
  period: string;
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
  const gradeKey = grade === -1 ? 'X' : grade;
  return GRADE_SYSTEM[gradeKey]?.description || 'Unknown';
};

// ==================== RESULTS SERVICE ====================

class ResultsService {
  private resultsCollection = collection(db, 'results');

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
    return `${studentId}_${subjectId}_${examType}_${term}_${year}`;
  }

  /**
   * Save class results for a specific exam/test
   * Teachers call this after entering results for their class
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
  }): Promise<StudentResult[]> {
    try {
      const batch = writeBatch(db);
      const savedResults: StudentResult[] = [];
      const now = new Date().toISOString();

      data.results.forEach(result => {
        const percentage = result.marks < 0 ? -1 : (result.marks / data.totalMarks) * 100;
        const grade = calculateGrade(percentage);

        const resultData: StudentResult = {
          id: this.generateResultId(result.studentId, data.subjectId, data.examType, data.term, data.year),
          studentId: result.studentId,
          studentName: result.studentName,
          classId: data.classId,
          className: data.className,
          form: data.className.match(/Form (\d+)/)?.[1] || '1',
          subjectId: data.subjectId,
          subjectName: data.subjectName,
          teacherId: data.teacherId,
          teacherName: data.teacherName,
          examType: data.examType,
          marks: result.marks,
          totalMarks: data.totalMarks,
          percentage,
          grade,
          term: data.term,
          year: data.year,
          createdAt: now,
          updatedAt: now,
        };

        const docRef = doc(this.resultsCollection, resultData.id);
        batch.set(docRef, resultData, { merge: true });
        savedResults.push(resultData);
      });

      await batch.commit();
      return savedResults;
    } catch (error) {
      console.error('Error saving class results:', error);
      throw error;
    }
  }

  /**
   * Get all results for a teacher's classes
   * FIXED: Now properly filters by subjectId at Firestore level
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
      // Start with base query for teacherId
      const constraints = [where('teacherId', '==', teacherId)];

      // Add other filters
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

      // Create query with all constraints
      const q = query(this.resultsCollection, ...constraints, orderBy('className'), orderBy('studentName'));
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

  /**
   * Get results for a specific student
   */
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
        constraints.push(where('subjectId', '==', filters.subjectId));
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

  /**
   * Get all results (for admin)
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

      // Apply Firestore-supported filters
      if (filters?.classId) constraints.push(where('classId', '==', filters.classId));
      if (filters?.subjectId) constraints.push(where('subjectId', '==', filters.subjectId));
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

      // Sort results
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

  /**
   * Get results for a specific class and subject
   * Used by teachers to view/edit their class results
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
        where('subjectId', '==', subjectId)
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

  /**
   * Update a single student result
   */
  async updateStudentResult(
    resultId: string,
    marks: number,
    totalMarks: number
  ): Promise<StudentResult> {
    try {
      const percentage = marks < 0 ? -1 : (marks / totalMarks) * 100;
      const grade = calculateGrade(percentage);

      const docRef = doc(this.resultsCollection, resultId);
      await updateDoc(docRef, {
        marks,
        totalMarks,
        percentage,
        grade,
        updatedAt: new Date().toISOString(),
      });

      const updatedDoc = await getDoc(docRef);
      return updatedDoc.data() as StudentResult;
    } catch (error) {
      console.error('Error updating student result:', error);
      throw error;
    }
  }

  /**
   * Generate report card for a student
   * Aggregates all subjects from different teachers
   */
  async generateReportCard(
    studentId: string,
    term: string,
    year: number
  ): Promise<ReportCardData | null> {
    try {
      // Get all results for this student for the term
      const results = await this.getStudentResults(studentId, { term, year });

      if (results.length === 0) return null;

      // Group results by subject (each subject should have week4, week8, endOfTerm)
      const subjectMap = new Map<string, {
        subjectId: string;
        subjectName: string;
        teacherId: string;
        teacherName: string;
        week4?: number;
        week8?: number;
        endOfTerm?: number;
      }>();

      results.forEach(result => {
        const key = result.subjectId;
        if (!subjectMap.has(key)) {
          subjectMap.set(key, {
            subjectId: result.subjectId,
            subjectName: result.subjectName,
            teacherId: result.teacherId,
            teacherName: result.teacherName,
          });
        }

        const subject = subjectMap.get(key)!;
        if (result.examType === 'week4') subject.week4 = result.percentage;
        if (result.examType === 'week8') subject.week8 = result.percentage;
        if (result.examType === 'endOfTerm') subject.endOfTerm = result.percentage;
      });

      // Convert to array and calculate grades
      const subjects: SubjectResultSummary[] = Array.from(subjectMap.values()).map(subject => {
        const endOfTerm = subject.endOfTerm ?? 0;
        const grade = calculateGrade(endOfTerm);
        
        return {
          ...subject,
          week4: subject.week4 ?? 0,
          week8: subject.week8 ?? 0,
          endOfTerm,
          grade,
          comment: this.generateSubjectComment(grade, endOfTerm),
        };
      });

      // Calculate overall statistics
      const validSubjects = subjects.filter(s => s.endOfTerm >= 0);
      const totalPercentage = validSubjects.reduce((sum, s) => sum + s.endOfTerm, 0);
      const averagePercentage = validSubjects.length > 0 
        ? Math.round(totalPercentage / validSubjects.length) 
        : 0;
      const overallGrade = calculateGrade(averagePercentage);

      // Get student information
      const firstResult = results[0];
      
      // Fetch additional student data from Firebase
      const studentDoc = await getDoc(doc(db, 'students', studentId));
      const studentData = studentDoc.exists() ? studentDoc.data() : null;

      // Calculate position
      const position = await this.calculatePosition(studentId, firstResult.classId, term, year);

      // Determine improvement
      const improvement = await this.calculateImprovement(studentId, term, year);

      return {
        id: `report-${studentId}-${term}-${year}`,
        studentId,
        studentName: firstResult.studentName,
        className: firstResult.className,
        classId: firstResult.classId,
        form: firstResult.form,
        grade: overallGrade,
        position,
        gender: studentData?.gender || 'Unknown',
        totalMarks: validSubjects.reduce((sum, s) => sum + s.endOfTerm, 0),
        percentage: averagePercentage,
        status: averagePercentage >= 50 ? 'pass' : 'fail',
        improvement,
        subjects,
        attendance: studentData?.attendance || 0,
        teachersComment: this.generateTeacherComment(overallGrade, averagePercentage, subjects),
        parentsEmail: studentData?.parentsEmail || '',
        generatedDate: new Date().toISOString().split('T')[0],
        term,
        year,
      };
    } catch (error) {
      console.error('Error generating report card:', error);
      throw error;
    }
  }

  /**
   * Calculate grade distribution
   */
  calculateGradeDistribution(results: StudentResult[]): GradeDistribution[] {
    const gradeCounts = new Map<number, number>();
    
    // Initialize all grades
    for (let i = 1; i <= 9; i++) {
      gradeCounts.set(i, 0);
    }

    // Count each grade
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
    }));
  }

  /**
   * Calculate performance trend over time
   */
  async calculatePerformanceTrend(results: StudentResult[]): Promise<PerformanceTrend[]> {
    // Group by exam type
    const trends = new Map<string, { total: number; count: number; passed: number }>();

    results.forEach(result => {
      const key = result.examType;
      if (!trends.has(key)) {
        trends.set(key, { total: 0, count: 0, passed: 0 });
      }

      const trend = trends.get(key)!;
      if (result.percentage >= 0) {
        trend.total += result.percentage;
        trend.count += 1;
        if (result.percentage >= 50) trend.passed += 1;
      }
    });

    return Array.from(trends.entries()).map(([period, data]) => ({
      period,
      avgMarks: data.count > 0 ? Math.round(data.total / data.count) : 0,
      passRate: data.count > 0 ? Math.round((data.passed / data.count) * 100) : 0,
      totalStudents: data.count,
    }));
  }

  /**
   * Calculate class comparison statistics
   */
  async calculateClassComparison(filters?: {
    term?: string;
    year?: number;
  }): Promise<ClassComparison[]> {
    try {
      const results = await this.getAllResults(filters);

      // Group by class
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

      return Array.from(classMap.values()).map(data => ({
        classId: data.classId,
        className: data.className,
        form: data.form,
        avgMarks: data.count > 0 ? Math.round(data.total / data.count) : 0,
        passRate: data.count > 0 ? Math.round((data.passed / data.count) * 100) : 0,
        totalStudents: data.count,
        improvement: 0, // Would need historical data
      }));
    } catch (error) {
      console.error('Error calculating class comparison:', error);
      throw error;
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  private generateSubjectComment(grade: number, percentage: number): string {
    if (percentage < 0) return 'Student was absent for this assessment.';
    
    const comments = {
      1: 'Outstanding performance showing exceptional mastery.',
      2: 'Excellent work with strong understanding demonstrated.',
      3: 'Very good performance with solid comprehension.',
      4: 'Good grasp of concepts with consistent effort.',
      5: 'Commendable effort showing satisfactory understanding.',
      6: 'Acceptable performance meeting basic requirements.',
      7: 'Fair performance; more practice needed.',
      8: 'Below expectations; requires additional support.',
      9: 'Needs immediate intervention and extra help.',
    };
    
    return comments[grade] || 'Assessment pending.';
  }

  private generateTeacherComment(
    overallGrade: number,
    percentage: number,
    subjects: SubjectResultSummary[]
  ): string {
    const gradeDesc = getGradeDescription(overallGrade);
    const passCount = subjects.filter(s => s.endOfTerm >= 50).length;
    const totalSubjects = subjects.filter(s => s.endOfTerm >= 0).length;

    if (overallGrade <= 2) {
      return `Excellent performance overall. The student has achieved ${gradeDesc} status with an average of ${percentage}%. Keep up the outstanding work!`;
    } else if (overallGrade <= 4) {
      return `Good performance with ${passCount}/${totalSubjects} subjects passed. The student shows strong understanding and should continue with consistent effort.`;
    } else if (overallGrade <= 6) {
      return `Satisfactory performance with an average of ${percentage}%. Encourage more practice in weaker subjects to improve overall standing.`;
    } else {
      return `Performance requires improvement. The student needs additional support and focused attention in several subjects. Please arrange for remedial classes.`;
    }
  }

  private async calculatePosition(
    studentId: string,
    classId: string,
    term: string,
    year: number
  ): Promise<string> {
    try {
      // Get all endOfTerm results for the class
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

      // Calculate average for each student
      const studentAverages = new Map<string, number[]>();
      results.forEach(result => {
        if (!studentAverages.has(result.studentId)) {
          studentAverages.set(result.studentId, []);
        }
        studentAverages.get(result.studentId)!.push(result.percentage);
      });

      // Calculate averages
      const averages = Array.from(studentAverages.entries()).map(([id, percentages]) => ({
        studentId: id,
        average: percentages.reduce((a, b) => a + b, 0) / percentages.length,
      }));

      // Sort by average (descending)
      averages.sort((a, b) => b.average - a.average);

      // Find position
      const position = averages.findIndex(a => a.studentId === studentId) + 1;
      const total = averages.length;

      return `${position}/${total}`;
    } catch (error) {
      console.error('Error calculating position:', error);
      return '1/1';
    }
  }

  private async calculateImprovement(
    studentId: string,
    currentTerm: string,
    currentYear: number
  ): Promise<'improved' | 'declined' | 'stable'> {
    // This would need historical data comparison
    // For now, returning stable
    return 'stable';
  }
}

export const resultsService = new ResultsService();