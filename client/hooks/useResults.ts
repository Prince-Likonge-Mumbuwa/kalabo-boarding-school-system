// @/hooks/useResults.ts - ENHANCED VERSION WITH VALIDATION
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  resultsService, 
  StudentResult, 
  ReportCardData, 
  SubjectAnalysis,
  SubjectCompletionStatus,
  ReportReadinessCheck,
  ClassReportReadiness,
} from '@/services/resultsService';
import { teacherService } from '@/services/schoolService'; // NEW: Import teacher service

// ==================== MAIN RESULTS HOOK ====================

export const useResults = (options?: {
  teacherId?: string;
  classId?: string;
  subjectId?: string;
  studentId?: string;
  term?: string;
  year?: number;
  examType?: string;
}) => {
  const queryClient = useQueryClient();

  const shouldFetchTeacherResults = !!options?.teacherId;
  const shouldFetchStudentResults = !!options?.studentId;
  const shouldFetchAllResults = !shouldFetchTeacherResults && !shouldFetchStudentResults;

  const teacherResultsQuery = useQuery({
    queryKey: ['results', 'teacher', options?.teacherId, options],
    queryFn: () => {
      if (!options?.teacherId) throw new Error('Teacher ID required');
      return resultsService.getTeacherResults(options.teacherId, {
        classId: options?.classId,
        subjectId: options?.subjectId,
        term: options?.term,
        year: options?.year,
      });
    },
    enabled: shouldFetchTeacherResults,
    staleTime: 2 * 60 * 1000,
  });

  const studentResultsQuery = useQuery({
    queryKey: ['results', 'student', options?.studentId, options],
    queryFn: () => {
      if (!options?.studentId) throw new Error('Student ID required');
      return resultsService.getStudentResults(options.studentId, {
        term: options?.term,
        year: options?.year,
        subjectId: options?.subjectId,
      });
    },
    enabled: shouldFetchStudentResults,
    staleTime: 2 * 60 * 1000,
  });

  const allResultsQuery = useQuery({
    queryKey: ['results', 'all', options],
    queryFn: () => resultsService.getAllResults({
      classId: options?.classId,
      subjectId: options?.subjectId,
      term: options?.term,
      year: options?.year,
      examType: options?.examType,
    }),
    enabled: shouldFetchAllResults,
    staleTime: 2 * 60 * 1000,
  });

  const results = shouldFetchTeacherResults
    ? teacherResultsQuery.data
    : shouldFetchStudentResults
    ? studentResultsQuery.data
    : allResultsQuery.data;

  // NEW: Check for existing results before saving
  const checkExistingMutation = useMutation({
    mutationFn: (data: {
      classId: string;
      subjectId: string;
      examType: string;
      term: string;
      year: number;
    }) => resultsService.checkExistingResults(
      data.classId,
      data.subjectId,
      data.examType,
      data.term,
      data.year
    ),
  });

  const saveResultsMutation = useMutation({
    mutationFn: (data: {
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
      overwrite?: boolean; // NEW: Allow overwriting
    }) => resultsService.saveClassResults(data, { overwrite: data.overwrite }),
    onSuccess: (data, variables) => {
      console.log(`✅ Saved ${data.count} results successfully${data.overwritten ? ' (overwritten)' : ''}`);
      
      queryClient.invalidateQueries({ queryKey: ['results'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['reportCards'] });
      queryClient.invalidateQueries({ queryKey: ['subjectAnalysis'] });
      queryClient.invalidateQueries({ queryKey: ['subjectCompletion'] }); // NEW
      queryClient.invalidateQueries({ queryKey: ['reportReadiness'] }); // NEW
      queryClient.invalidateQueries({ queryKey: ['teacherAssignments'] }); // NEW: Also invalidate assignments
    },
    onError: (error) => {
      console.error('❌ Failed to save results:', error);
    },
  });

  const updateResultMutation = useMutation({
    mutationFn: ({ resultId, marks, totalMarks }: {
      resultId: string;
      marks: number;
      totalMarks: number;
    }) => resultsService.updateStudentResult(resultId, marks, totalMarks),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['results'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['reportCards'] });
    },
  });

  return {
    results: results || [],
    
    isLoading: teacherResultsQuery.isLoading || studentResultsQuery.isLoading || allResultsQuery.isLoading,
    isFetching: teacherResultsQuery.isFetching || studentResultsQuery.isFetching || allResultsQuery.isFetching,
    isError: teacherResultsQuery.isError || studentResultsQuery.isError || allResultsQuery.isError,
    error: teacherResultsQuery.error || studentResultsQuery.error || allResultsQuery.error,
    
    // NEW: Validation methods
    checkExisting: checkExistingMutation.mutateAsync,
    isCheckingExisting: checkExistingMutation.isPending,
    
    saveResults: saveResultsMutation.mutateAsync,
    updateResult: updateResultMutation.mutateAsync,
    isSaving: saveResultsMutation.isPending,
    isUpdating: updateResultMutation.isPending,
    
    refetch: () => {
      teacherResultsQuery.refetch();
      studentResultsQuery.refetch();
      allResultsQuery.refetch();
    },
  };
};

// ==================== NEW: SUBJECT COMPLETION HOOK ====================

export const useSubjectCompletion = (options: {
  classId?: string;
  term: string;
  year: number;
}) => {
  const queryClient = useQueryClient();

  const completionQuery = useQuery({
    queryKey: ['subjectCompletion', options.classId, options.term, options.year],
    queryFn: () => {
      if (!options.classId) throw new Error('Class ID required');
      return resultsService.getSubjectCompletionStatus(
        options.classId,
        options.term,
        options.year
      );
    },
    enabled: !!options.classId,
    staleTime: 2 * 60 * 1000,
  });

  return {
    completionStatus: completionQuery.data || [],
    isLoading: completionQuery.isLoading,
    isFetching: completionQuery.isFetching,
    isError: completionQuery.isError,
    error: completionQuery.error,
    refetch: completionQuery.refetch,
  };
};

// ==================== ENHANCED: REPORT READINESS HOOK ====================
// This hook now integrates with teacher assignments to know expected subjects

export const useReportReadiness = (options: {
  studentId?: string;
  classId?: string;
  term: string;
  year: number;
}) => {
  const queryClient = useQueryClient();

  // NEW: Fetch teacher assignments for the class to know expected subjects
  const teacherAssignmentsQuery = useQuery({
    queryKey: ['teacherAssignments', 'class', options.classId],
    queryFn: async () => {
      if (!options.classId) return [];
      // This assumes we have a method to get assignments by class
      // If not available, we'll need to get all assignments and filter
      try {
        // Try to get assignments by class if the service supports it
        return await teacherService.getTeacherAssignmentsByClass(options.classId);
      } catch (error) {
        // Fallback: get all assignments and filter (less efficient but works)
        const allAssignments = await teacherService.getAllTeacherAssignments();
        return allAssignments.filter(a => a.classId === options.classId);
      }
    },
    enabled: !!options.classId,
    staleTime: 5 * 60 * 1000,
  });

  // Single student readiness check
  const studentReadinessQuery = useQuery({
    queryKey: ['reportReadiness', 'student', options.studentId, options.term, options.year],
    queryFn: () => {
      if (!options.studentId) throw new Error('Student ID required');
      return resultsService.validateReportCardReadiness(
        options.studentId,
        options.term,
        options.year
      );
    },
    enabled: !!options.studentId,
    staleTime: 2 * 60 * 1000,
  });

  // Class-wide readiness check - ENHANCED with teacher assignments
  const classReadinessQuery = useQuery({
    queryKey: ['reportReadiness', 'class', options.classId, options.term, options.year],
    queryFn: async () => {
      if (!options.classId) throw new Error('Class ID required');
      
      // Get teacher assignments for this class to know expected subjects
      let expectedSubjects: string[] = [];
      try {
        const assignments = await teacherService.getTeacherAssignmentsByClass(options.classId);
        expectedSubjects = Array.from(new Set(assignments.map(a => a.subject)));
      } catch (error) {
        // If we can't get assignments by class, try to get all and filter
        try {
          const allAssignments = await teacherService.getAllTeacherAssignments();
          const classAssignments = allAssignments.filter(a => a.classId === options.classId);
          expectedSubjects = Array.from(new Set(classAssignments.map(a => a.subject)));
        } catch (assignmentError) {
          console.warn('Could not fetch teacher assignments for readiness validation:', assignmentError);
          // Continue with existing logic if assignments unavailable
        }
      }
      
      // Call the enhanced validation method
      return resultsService.validateClassReportReadiness(
        options.classId,
        options.term,
        options.year,
        expectedSubjects // Pass expected subjects to validation
      );
    },
    enabled: !!options.classId && !options.studentId,
    staleTime: 2 * 60 * 1000,
  });

  return {
    // Single student data
    studentReadiness: studentReadinessQuery.data,
    
    // Class-wide data
    classReadiness: classReadinessQuery.data,
    
    // Teacher assignments data
    teacherAssignments: teacherAssignmentsQuery.data,
    assignmentsLoading: teacherAssignmentsQuery.isLoading,
    
    // Loading states
    isLoading: studentReadinessQuery.isLoading || classReadinessQuery.isLoading || teacherAssignmentsQuery.isLoading,
    isFetching: studentReadinessQuery.isFetching || classReadinessQuery.isFetching || teacherAssignmentsQuery.isFetching,
    isError: studentReadinessQuery.isError || classReadinessQuery.isError || teacherAssignmentsQuery.isError,
    error: studentReadinessQuery.error || classReadinessQuery.error || teacherAssignmentsQuery.error,
    
    // Refetch
    refetch: () => {
      studentReadinessQuery.refetch();
      classReadinessQuery.refetch();
      teacherAssignmentsQuery.refetch();
    },
  };
};

// ==================== ANALYTICS HOOK ====================

export const useResultsAnalytics = (options?: {
  classId?: string;
  subjectId?: string;
  teacherId?: string;
  term?: string;
  year?: number;
}) => {
  const queryClient = useQueryClient();

  const resultsQuery = useQuery({
    queryKey: ['results', 'analytics', options],
    queryFn: () => {
      if (options?.teacherId) {
        return resultsService.getTeacherResults(options.teacherId, {
          classId: options?.classId,
          subjectId: options?.subjectId,
          term: options?.term,
          year: options?.year,
        });
      } else {
        return resultsService.getAllResults({
          classId: options?.classId,
          subjectId: options?.subjectId,
          term: options?.term,
          year: options?.year,
        });
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const classComparisonQuery = useQuery({
    queryKey: ['analytics', 'classComparison', options?.term, options?.year],
    queryFn: () => resultsService.calculateClassComparison({
      term: options?.term,
      year: options?.year,
    }),
    staleTime: 5 * 60 * 1000,
  });

  const subjectAnalysisQuery = useQuery({
    queryKey: ['analytics', 'subjectAnalysis', options],
    queryFn: () => resultsService.calculateSubjectAnalysis({
      term: options?.term,
      year: options?.year,
      classId: options?.classId,
    }),
    enabled: !options?.teacherId,
    staleTime: 5 * 60 * 1000,
  });

  const analytics = resultsQuery.data ? {
    gradeDistribution: resultsService.calculateGradeDistribution(resultsQuery.data),
    performanceTrend: resultsService.calculatePerformanceTrend(resultsQuery.data),
    totalStudents: Array.from(new Set(resultsQuery.data.map(r => r.studentId))).length,
    averagePercentage: resultsQuery.data.length > 0
      ? Math.round(
          resultsQuery.data
            .filter(r => r.percentage >= 0)
            .reduce((sum, r) => sum + r.percentage, 0) / 
          resultsQuery.data.filter(r => r.percentage >= 0).length
        )
      : 0,
    passRate: resultsQuery.data.length > 0
      ? Math.round(
          (resultsQuery.data.filter(r => r.percentage >= 50).length / 
           resultsQuery.data.filter(r => r.percentage >= 0).length) * 100
        )
      : 0,
    topGrade: resultsQuery.data.length > 0
      ? Math.max(...resultsQuery.data.filter(r => r.grade > 0).map(r => r.grade))
      : 'N/A',
  } : null;

  return {
    analytics,
    classComparison: classComparisonQuery.data || [],
    subjectAnalysis: subjectAnalysisQuery.data || [],
    results: resultsQuery.data || [],
    
    isLoading: resultsQuery.isLoading || classComparisonQuery.isLoading || subjectAnalysisQuery.isLoading,
    isFetching: resultsQuery.isFetching || classComparisonQuery.isFetching || subjectAnalysisQuery.isFetching,
    isError: resultsQuery.isError || classComparisonQuery.isError || subjectAnalysisQuery.isError,
    error: resultsQuery.error || classComparisonQuery.error || subjectAnalysisQuery.error,
    
    refetch: () => {
      resultsQuery.refetch();
      classComparisonQuery.refetch();
      subjectAnalysisQuery.refetch();
    },
  };
};

// ==================== REPORT CARDS HOOK ====================

export const useReportCards = (options: {
  studentId?: string;
  classId?: string;
  term: string;
  year: number;
  includeIncomplete?: boolean; // NEW: Generate even if incomplete
  markMissing?: boolean;       // NEW: Mark missing data in reports
}) => {
  const queryClient = useQueryClient();

  const reportCardQuery = useQuery({
    queryKey: ['reportCard', options.studentId, options.term, options.year, options.includeIncomplete, options.markMissing],
    queryFn: () => {
      if (!options.studentId) throw new Error('Student ID required');
      return resultsService.generateReportCard(
        options.studentId, 
        options.term, 
        options.year,
        {
          includeIncomplete: options.includeIncomplete,
          markMissing: options.markMissing,
        }
      );
    },
    enabled: !!options.studentId,
    staleTime: 5 * 60 * 1000,
  });

  const classReportCardsQuery = useQuery({
    queryKey: ['reportCards', 'class', options.classId, options.term, options.year, options.includeIncomplete, options.markMissing],
    queryFn: async () => {
      if (!options.classId) throw new Error('Class ID required');
      return resultsService.generateClassReportCards(
        options.classId, 
        options.term, 
        options.year,
        {
          includeIncomplete: options.includeIncomplete,
          markMissing: options.markMissing,
        }
      );
    },
    enabled: !!options.classId && !options.studentId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    reportCard: reportCardQuery.data,
    reportCards: classReportCardsQuery.data?.reportCards || [],
    bulkSummary: classReportCardsQuery.data?.summary,
    
    isLoading: reportCardQuery.isLoading || classReportCardsQuery.isLoading,
    isFetching: reportCardQuery.isFetching || classReportCardsQuery.isFetching,
    isError: reportCardQuery.isError || classReportCardsQuery.isError,
    error: reportCardQuery.error || classReportCardsQuery.error,
    
    refetch: () => {
      reportCardQuery.refetch();
      classReportCardsQuery.refetch();
    },
  };
};

// ==================== CLASS RESULTS HOOK (for Teachers) ====================

export const useClassResults = (
  classId: string,
  subjectId: string,
  options?: {
    examType?: string;
    term?: string;
    year?: number;
  }
) => {
  const queryClient = useQueryClient();

  const resultsQuery = useQuery({
    queryKey: ['results', 'class', classId, subjectId, options],
    queryFn: () => resultsService.getClassSubjectResults(classId, subjectId, options),
    enabled: !!classId && !!subjectId,
    staleTime: 2 * 60 * 1000,
  });

  return {
    results: resultsQuery.data || [],
    
    isLoading: resultsQuery.isLoading,
    isFetching: resultsQuery.isFetching,
    isError: resultsQuery.isError,
    error: resultsQuery.error,
    
    refetch: resultsQuery.refetch,
  };
};

// ==================== SUBJECT ANALYSIS HOOK ====================

export const useSubjectAnalysis = (options?: {
  term?: string;
  year?: number;
  classId?: string;
}) => {
  const subjectAnalysisQuery = useQuery({
    queryKey: ['subjectAnalysis', options],
    queryFn: () => resultsService.calculateSubjectAnalysis(options),
    staleTime: 5 * 60 * 1000,
  });

  return {
    subjects: subjectAnalysisQuery.data || [],
    
    isLoading: subjectAnalysisQuery.isLoading,
    isFetching: subjectAnalysisQuery.isFetching,
    isError: subjectAnalysisQuery.isError,
    error: subjectAnalysisQuery.error,
    
    refetch: subjectAnalysisQuery.refetch,
  };
}; 