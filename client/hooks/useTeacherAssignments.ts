// @/hooks/useTeacherAssignments.ts
import { useQuery } from '@tanstack/react-query';
import { teacherService } from '@/services/schoolService';

export interface TeacherAssignment {
  id: string;
  teacherId: string;
  classId: string;
  className: string;
  subject: string;
  isFormTeacher: boolean;
}

export const useTeacherAssignments = (teacherId?: string) => {
  const assignmentsQuery = useQuery({
    queryKey: ['teacherAssignments', teacherId],
    queryFn: async () => {
      if (!teacherId) throw new Error('Teacher ID is required');
      return teacherService.getTeacherAssignments(teacherId);
    },
    enabled: !!teacherId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Helper: Get assignments for a specific class
  const getAssignmentsForClass = (classId: string): TeacherAssignment[] => {
    if (!assignmentsQuery.data) return [];
    return assignmentsQuery.data.filter(assignment => assignment.classId === classId);
  };

  // Helper: Get subjects for a specific class
  const getSubjectsForClass = (classId: string): string[] => {
    const assignments = getAssignmentsForClass(classId);
    return assignments.map(assignment => assignment.subject);
  };

  return {
    // Data
    assignments: assignmentsQuery.data || [],
    
    // Query states
    isLoading: assignmentsQuery.isLoading,
    isFetching: assignmentsQuery.isFetching,
    isError: assignmentsQuery.isError,
    error: assignmentsQuery.error,
    
    // Helpers
    getAssignmentsForClass,
    getSubjectsForClass,
    
    // Refetch
    refetch: assignmentsQuery.refetch,
  };
};