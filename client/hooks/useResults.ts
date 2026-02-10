// @/hooks/useResults.ts - UPDATED EXAM TYPES
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { resultsService, StudentResult, ReportCardData } from '@/services/resultsService';

// ==================== MAIN HOOK ====================

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

  // Determine which query to use based on options
  const shouldFetchTeacherResults = !!options?.teacherId;
  const shouldFetchStudentResults = !!options?.studentId;
  const shouldFetchAllResults = !shouldFetchTeacherResults && !shouldFetchStudentResults;

  // Query: Get teacher's results
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
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Query: Get student's results
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

  // Query: Get all results (for admin)
  const allResultsQuery = useQuery({
    queryKey: ['results', 'all', options],
    queryFn: () => resultsService.getAllResults({
      classId: options?.classId,
      subjectId: options?.subjectId,
      term: options?.term,
      year: options?.year,
      examType: options?.examType as 'week4' | 'week8' | 'endOfTerm' | undefined,
    }),
    enabled: shouldFetchAllResults,
    staleTime: 2 * 60 * 1000,
  });

  // Get the active query data
  const results = shouldFetchTeacherResults
    ? teacherResultsQuery.data
    : shouldFetchStudentResults
    ? studentResultsQuery.data
    : allResultsQuery.data;

  // Mutation: Save class results - UPDATED EXAM TYPES
  const saveResultsMutation = useMutation({
    mutationFn: (data: {
      classId: string;
      className: string;
      subjectId: string;
      subjectName: string;
      teacherId: string;
      teacherName: string;
      examType: 'week4' | 'week8' | 'endOfTerm'; // CHANGED HERE
      examName: string;
      term: string;
      year: number;
      totalMarks: number;
      results: Array<{
        studentId: string;
        studentName: string;
        marks: number;
      }>;
    }) => resultsService.saveClassResults(data),
    onSuccess: (data, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['results'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['reportCards'] });
    },
  });

  // Mutation: Update single student result
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
    // Data
    results: results || [],
    
    // Loading states
    isLoading: teacherResultsQuery.isLoading || studentResultsQuery.isLoading || allResultsQuery.isLoading,
    isFetching: teacherResultsQuery.isFetching || studentResultsQuery.isFetching || allResultsQuery.isFetching,
    isError: teacherResultsQuery.isError || studentResultsQuery.isError || allResultsQuery.isError,
    error: teacherResultsQuery.error || studentResultsQuery.error || allResultsQuery.error,
    
    // Mutations
    saveResults: saveResultsMutation.mutateAsync,
    updateResult: updateResultMutation.mutateAsync,
    isSaving: saveResultsMutation.isPending,
    isUpdating: updateResultMutation.isPending,
    
    // Refetch
    refetch: () => {
      teacherResultsQuery.refetch();
      studentResultsQuery.refetch();
      allResultsQuery.refetch();
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

  // Get results for analysis
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
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Calculate analytics from results
  const analytics = resultsQuery.data ? {
    gradeDistribution: resultsService.calculateGradeDistribution(resultsQuery.data),
    performanceTrend: resultsService.calculatePerformanceTrend(resultsQuery.data),
    totalStudents: resultsQuery.data.length,
    averagePercentage: resultsQuery.data.length > 0
      ? Math.round(resultsQuery.data.reduce((sum, r) => sum + r.percentage, 0) / resultsQuery.data.length * 10) / 10
      : 0,
    passRate: resultsQuery.data.length > 0
      ? Math.round((resultsQuery.data.filter(r => r.percentage >= 50).length / resultsQuery.data.length) * 100 * 10) / 10
      : 0,
    topGrade: resultsQuery.data.length > 0
      ? resultsQuery.data.reduce((max, r) => r.percentage > max.percentage ? r : max).grade
      : 'N/A',
  } : null;

  // Query: Class comparison
  const classComparisonQuery = useQuery({
    queryKey: ['analytics', 'classComparison', options?.term, options?.year],
    queryFn: () => resultsService.calculateClassComparison({
      term: options?.term,
      year: options?.year,
    }),
    staleTime: 5 * 60 * 1000,
  });

  return {
    // Data
    analytics,
    classComparison: classComparisonQuery.data || [],
    results: resultsQuery.data || [],
    
    // Loading states
    isLoading: resultsQuery.isLoading || classComparisonQuery.isLoading,
    isFetching: resultsQuery.isFetching || classComparisonQuery.isFetching,
    isError: resultsQuery.isError || classComparisonQuery.isError,
    error: resultsQuery.error || classComparisonQuery.error,
    
    // Refetch
    refetch: () => {
      resultsQuery.refetch();
      classComparisonQuery.refetch();
    },
  };
};

// ==================== REPORT CARDS HOOK ====================

export const useReportCards = (options: {
  studentId?: string;
  classId?: string;
  term: string;
  year: number;
}) => {
  const queryClient = useQueryClient();

  // Query: Single student report card
  const reportCardQuery = useQuery({
    queryKey: ['reportCard', options.studentId, options.term, options.year],
    queryFn: () => {
      if (!options.studentId) throw new Error('Student ID required');
      return resultsService.generateReportCard(options.studentId, options.term, options.year);
    },
    enabled: !!options.studentId,
    staleTime: 5 * 60 * 1000,
  });

  // Query: Multiple report cards for a class
  const classReportCardsQuery = useQuery({
    queryKey: ['reportCards', 'class', options.classId, options.term, options.year],
    queryFn: async () => {
      if (!options.classId) throw new Error('Class ID required');
      
      // Get all results for this class
      const results = await resultsService.getAllResults({
        classId: options.classId,
        term: options.term,
        year: options.year,
      });

      // Get unique student IDs
      const studentIds = Array.from(new Set(results.map(r => r.studentId)));

      // Generate report card for each student
      const reportCards = await Promise.all(
        studentIds.map(studentId => 
          resultsService.generateReportCard(studentId, options.term, options.year)
        )
      );

      // Filter out nulls
      return reportCards.filter((card): card is ReportCardData => card !== null);
    },
    enabled: !!options.classId && !options.studentId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    // Data
    reportCard: reportCardQuery.data,
    reportCards: classReportCardsQuery.data || [],
    
    // Loading states
    isLoading: reportCardQuery.isLoading || classReportCardsQuery.isLoading,
    isFetching: reportCardQuery.isFetching || classReportCardsQuery.isFetching,
    isError: reportCardQuery.isError || classReportCardsQuery.isError,
    error: reportCardQuery.error || classReportCardsQuery.error,
    
    // Refetch
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
    staleTime: 2 * 60 * 1000,
  });

  return {
    // Data
    results: resultsQuery.data || [],
    
    // Loading states
    isLoading: resultsQuery.isLoading,
    isFetching: resultsQuery.isFetching,
    isError: resultsQuery.isError,
    error: resultsQuery.error,
    
    // Refetch
    refetch: resultsQuery.refetch,
  };
};