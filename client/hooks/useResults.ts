// @/hooks/useResults.ts - Updated with student progress tracking
// Version 2.0.0 - Added useStudentProgress hook for report cards

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  resultsService, 
  StudentResult, 
  ReportCardData, 
  SubjectCompletionStatus,
  ReportReadinessCheck,
  ClassReportReadiness,
  BulkReportOperation,
  StudentProgress,
} from '@/services/resultsService';

// ==================== TYPES FOR STUDENT PROGRESS ====================

export interface StudentProgressSummary {
  total: number;
  complete: number;
  incomplete: number;
  averageCompletion: number;
  passCount: number;
  failCount: number;
  pendingCount: number;
}

export interface StudentProgressData {
  students: StudentProgress[];
  summary: StudentProgressSummary;
}

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
      overwrite?: boolean;
    }) => resultsService.saveClassResults(data, { overwrite: data.overwrite }),
    onSuccess: (data, variables) => {
      console.log(`✅ Saved ${data.count} results successfully${data.overwritten ? ' (overwritten)' : ''}`);
      
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['results'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['reportCards'] });
      queryClient.invalidateQueries({ queryKey: ['studentProgress'] });
      queryClient.invalidateQueries({ queryKey: ['subjectAnalysis'] });
      queryClient.invalidateQueries({ queryKey: ['subjectCompletion'] });
      queryClient.invalidateQueries({ queryKey: ['reportReadiness'] });
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
      queryClient.invalidateQueries({ queryKey: ['studentProgress'] });
    },
  });

  // ==================== GENERATE REPORT CARD MUTATION ====================
  
  const generateReportCardMutation = useMutation({
    mutationFn: ({
      studentId,
      term,
      year,
      options
    }: {
      studentId: string;
      term: string;
      year: number;
      options?: {
        includeIncomplete?: boolean;
        markMissing?: boolean;
      };
    }) => resultsService.generateReportCard(studentId, term, year, options),
    onSuccess: (data, variables) => {
      if (data) {
        console.log(`✅ Generated report card for ${data.studentName}`);
        // Update the cache with the new report card
        queryClient.setQueryData(
          ['reportCard', variables.studentId, variables.term, variables.year, variables.options?.includeIncomplete, variables.options?.markMissing],
          data
        );
      }
    },
  });

  // ==================== GENERATE CLASS REPORT CARDS MUTATION ====================
  
  const generateClassReportCardsMutation = useMutation({
    mutationFn: ({
      classId,
      term,
      year,
      options
    }: {
      classId: string;
      term: string;
      year: number;
      options?: {
        includeIncomplete?: boolean;
        markMissing?: boolean;
      };
    }) => resultsService.generateClassReportCards(classId, term, year, options),
    onSuccess: (data, variables) => {
      console.log(`✅ Generated ${data.reportCards.length} class report cards`);
      // Invalidate class report cards query
      queryClient.invalidateQueries({ 
        queryKey: ['reportCards', 'class', variables.classId, variables.term, variables.year] 
      });
    },
  });

  return {
    results: results || [],
    
    isLoading: teacherResultsQuery.isLoading || studentResultsQuery.isLoading || allResultsQuery.isLoading,
    isFetching: teacherResultsQuery.isFetching || studentResultsQuery.isFetching || allResultsQuery.isFetching,
    isError: teacherResultsQuery.isError || studentResultsQuery.isError || allResultsQuery.isError,
    error: teacherResultsQuery.error || studentResultsQuery.error || allResultsQuery.error,
    
    checkExisting: checkExistingMutation.mutateAsync,
    isCheckingExisting: checkExistingMutation.isPending,
    
    saveResults: saveResultsMutation.mutateAsync,
    updateResult: updateResultMutation.mutateAsync,
    isSaving: saveResultsMutation.isPending,
    isUpdating: updateResultMutation.isPending,
    
    // Generate report card methods
    generateReportCard: generateReportCardMutation.mutateAsync,
    generateClassReportCards: generateClassReportCardsMutation.mutateAsync,
    isGeneratingReport: generateReportCardMutation.isPending || generateClassReportCardsMutation.isPending,
    
    refetch: () => {
      teacherResultsQuery.refetch();
      studentResultsQuery.refetch();
      allResultsQuery.refetch();
    },
  };
};

// ==================== STUDENT PROGRESS HOOK ====================
// This is the key hook for the Report Cards page - shows ALL students with progress

export const useStudentProgress = (options: {
  classId?: string;
  term: string;
  year: number;
}) => {
  const queryClient = useQueryClient();

  const progressQuery = useQuery<StudentProgressData>({
    queryKey: ['studentProgress', options.classId, options.term, options.year],
    queryFn: async () => {
      if (!options.classId) {
        return { 
          students: [], 
          summary: { 
            total: 0, 
            complete: 0, 
            incomplete: 0, 
            averageCompletion: 0,
            passCount: 0,
            failCount: 0,
            pendingCount: 0,
          } 
        };
      }
      
      console.log('📊 Fetching student progress:', {
        classId: options.classId,
        term: options.term,
        year: options.year,
      });
      
      const progress = await resultsService.getStudentProgress(
        options.classId,
        options.term,
        options.year
      );
      
      console.log(`✅ Found ${progress.length} students with progress data`);
      
      // Calculate summary statistics
      const summary: StudentProgressSummary = {
        total: progress.length,
        complete: progress.filter(s => s.isComplete).length,
        incomplete: progress.filter(s => !s.isComplete).length,
        averageCompletion: progress.length > 0
          ? Math.round(progress.reduce((sum, s) => sum + s.completionPercentage, 0) / progress.length)
          : 0,
        passCount: progress.filter(s => s.status === 'pass').length,
        failCount: progress.filter(s => s.status === 'fail').length,
        pendingCount: progress.filter(s => s.status === 'pending').length,
      };
      
      return {
        students: progress,
        summary,
      };
    },
    enabled: !!options.classId, // Only fetch when class is selected
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true, // Refetch when window gains focus
  });

  return {
    // Main data with fallbacks
    students: progressQuery.data?.students ?? [],
    summary: progressQuery.data?.summary ?? { 
      total: 0, 
      complete: 0, 
      incomplete: 0, 
      averageCompletion: 0,
      passCount: 0,
      failCount: 0,
      pendingCount: 0,
    },
    
    // Loading states
    isLoading: progressQuery.isLoading,
    isFetching: progressQuery.isFetching,
    isError: progressQuery.isError,
    error: progressQuery.error,
    
    // Refresh
    refetch: progressQuery.refetch,
    
    // Helper functions
    getStudentById: (studentId: string): StudentProgress | undefined => {
      return progressQuery.data?.students.find(s => s.studentId === studentId);
    },
    
    getStudentsByStatus: (status: 'pass' | 'fail' | 'pending'): StudentProgress[] => {
      return progressQuery.data?.students.filter(s => s.status === status) ?? [];
    },
    
    getCompleteStudents: (): StudentProgress[] => {
      return progressQuery.data?.students.filter(s => s.isComplete) ?? [];
    },
    
    getIncompleteStudents: (): StudentProgress[] => {
      return progressQuery.data?.students.filter(s => !s.isComplete) ?? [];
    },
  };
};

// ==================== SUBJECT COMPLETION HOOK ====================

export const useSubjectCompletion = (options: {
  classId?: string;
  term: string;
  year: number;
}) => {
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

// ==================== REPORT READINESS HOOK ====================

export const useReportReadiness = (options: {
  studentId?: string;
  classId?: string;
  term: string;
  year: number;
}) => {
  const teacherAssignmentsQuery = useQuery({
    queryKey: ['teacherAssignments', 'class', options.classId],
    queryFn: async () => {
      if (!options.classId) return [];
      return resultsService.getTeacherAssignmentsForClass(options.classId);
    },
    enabled: !!options.classId,
    staleTime: 5 * 60 * 1000,
  });

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

  const classReadinessQuery = useQuery({
    queryKey: ['reportReadiness', 'class', options.classId, options.term, options.year],
    queryFn: async () => {
      if (!options.classId) throw new Error('Class ID required');
      return resultsService.validateClassReportReadiness(
        options.classId,
        options.term,
        options.year
      );
    },
    enabled: !!options.classId && !options.studentId,
    staleTime: 2 * 60 * 1000,
  });

  return {
    studentReadiness: studentReadinessQuery.data,
    classReadiness: classReadinessQuery.data,
    teacherAssignments: teacherAssignmentsQuery.data || [],
    assignmentsLoading: teacherAssignmentsQuery.isLoading,
    
    isLoading: studentReadinessQuery.isLoading || classReadinessQuery.isLoading || teacherAssignmentsQuery.isLoading,
    isFetching: studentReadinessQuery.isFetching || classReadinessQuery.isFetching || teacherAssignmentsQuery.isFetching,
    isError: studentReadinessQuery.isError || classReadinessQuery.isError || teacherAssignmentsQuery.isError,
    error: studentReadinessQuery.error || classReadinessQuery.error || teacherAssignmentsQuery.error,
    
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
      ? Math.min(...resultsQuery.data.filter(r => r.grade > 0).map(r => r.grade)).toString()
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

// ==================== REPORT CARDS HOOK (DEPRECATED - Use useStudentProgress instead) ====================

export const useReportCards = (options: {
  studentId?: string;
  classId?: string;
  term: string;
  year: number;
  includeIncomplete?: boolean;
  markMissing?: boolean;
}) => {
  const queryClient = useQueryClient();

  console.warn('⚠️ useReportCards is deprecated. Please use useStudentProgress for list views or useResults().generateReportCard for single cards.');

  const reportCardQuery = useQuery({
    queryKey: ['reportCard', options.studentId, options.term, options.year, options.includeIncomplete, options.markMissing],
    queryFn: async () => {
      if (!options.studentId) throw new Error('Student ID required');
      
      console.log('🎓 Generating single report card:', {
        studentId: options.studentId,
        term: options.term,
        year: options.year,
        includeIncomplete: options.includeIncomplete,
        markMissing: options.markMissing,
      });
      
      const result = await resultsService.generateReportCard(
        options.studentId, 
        options.term, 
        options.year,
        {
          includeIncomplete: options.includeIncomplete,
          markMissing: options.markMissing,
        }
      );
      
      console.log('✅ Report card generated:', result ? 'Success' : 'No data');
      return result;
    },
    enabled: !!options.studentId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const classReportCardsQuery = useQuery({
    queryKey: ['reportCards', 'class', options.classId, options.term, options.year, options.includeIncomplete, options.markMissing],
    queryFn: async () => {
      if (!options.classId) throw new Error('Class ID required');
      
      console.log('🎓 Generating class report cards:', {
        classId: options.classId,
        term: options.term,
        year: options.year,
        includeIncomplete: options.includeIncomplete,
        markMissing: options.markMissing,
      });
      
      const result = await resultsService.generateClassReportCards(
        options.classId, 
        options.term, 
        options.year,
        {
          includeIncomplete: options.includeIncomplete,
          markMissing: options.markMissing,
        }
      );
      
      console.log('✅ Class report cards generated:', {
        total: result.reportCards.length,
        complete: result.summary.complete,
        incomplete: result.summary.incomplete,
      });
      
      return result;
    },
    enabled: !!options.classId && !options.studentId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    reportCard: reportCardQuery.data,
    reportCards: classReportCardsQuery.data?.reportCards ?? [],
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

// ==================== CLASS RESULTS HOOK ====================

export const useClassResults = (
  classId: string,
  subjectId: string,
  options?: {
    examType?: string;
    term?: string;
    year?: number;
  }
) => {
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

// ==================== TEACHER ASSIGNMENTS HOOK ====================

export const useTeacherAssignmentsForClass = (classId?: string) => {
  const query = useQuery({
    queryKey: ['teacherAssignments', 'class', classId],
    queryFn: async () => {
      if (!classId) return [];
      return resultsService.getTeacherAssignmentsForClass(classId);
    },
    enabled: !!classId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    assignments: query.data || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
};