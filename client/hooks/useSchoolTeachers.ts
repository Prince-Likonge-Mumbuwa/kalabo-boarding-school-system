import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teacherService } from '@/services/schoolService';
import { Teacher } from '@/types/school';

export const useSchoolTeachers = (classId?: string) => {
  const queryClient = useQueryClient();

  // Query: Get all teachers
  const teachersQuery = useQuery({
    queryKey: ['teachers'],
    queryFn: teacherService.getTeachers,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });

  // Query: Get teachers by class
  const classTeachersQuery = useQuery({
    queryKey: ['teachers', 'class', classId],
    queryFn: () => {
      if (!classId) throw new Error('Class ID is required');
      return teacherService.getTeachersByClass(classId);
    },
    enabled: !!classId,
    staleTime: 30 * 1000,
  });

  // Mutation: Assign teacher to class WITH SUBJECT
  const assignTeacherMutation = useMutation({
    mutationFn: async ({ 
      teacherId, 
      classId, 
      subject,
      isFormTeacher = false 
    }: {
      teacherId: string;
      classId: string;
      subject: string;  // REQUIRED - Subject the teacher will teach
      isFormTeacher?: boolean;
    }) => {
      console.log('Assigning teacher:', { teacherId, classId, subject, isFormTeacher });
      return teacherService.assignTeacherToClass(teacherId, classId, subject, isFormTeacher);
    },
    onMutate: async ({ teacherId, classId, isFormTeacher }) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: ['teachers'] });
      await queryClient.cancelQueries({ queryKey: ['classes'] });

      // Snapshot for rollback
      const previousTeachers = queryClient.getQueryData(['teachers']);
      const previousClassTeachers = queryClient.getQueryData(['teachers', 'class', classId]);

      // Optimistically update the teachers list
      queryClient.setQueryData(['teachers'], (old: Teacher[] = []) => {
        return old.map(teacher => 
          teacher.id === teacherId 
            ? { 
                ...teacher, 
                assignedClassId: classId,
                isFormTeacher: isFormTeacher || teacher.isFormTeacher,
                assignedClasses: [...(teacher.assignedClasses || []), classId]
              } 
            : teacher
        );
      });

      return { previousTeachers, previousClassTeachers };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousTeachers) {
        queryClient.setQueryData(['teachers'], context.previousTeachers);
      }
      if (context?.previousClassTeachers) {
        queryClient.setQueryData(['teachers', 'class', variables.classId], context.previousClassTeachers);
      }
      console.error('Failed to assign teacher:', error);
    },
    onSuccess: (data, variables) => {
      console.log('Teacher assigned successfully:', data);
    },
    onSettled: (data, error, variables) => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ 
        queryKey: ['teachers'],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ 
        queryKey: ['teachers', 'class', variables.classId],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ 
        queryKey: ['classes'],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ 
        queryKey: ['dashboardStats'],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ 
        queryKey: ['teacherAssignments'],
        refetchType: 'active'
      });
    },
  });

  // Mutation: Remove teacher from class
  const removeTeacherMutation = useMutation({
    mutationFn: async ({ teacherId, classId }: { teacherId: string; classId: string }) => {
      console.log('Removing teacher from class:', { teacherId, classId });
      return teacherService.removeTeacherFromClass(teacherId, classId);
    },
    onMutate: async ({ teacherId, classId }) => {
      await queryClient.cancelQueries({ queryKey: ['teachers'] });
      await queryClient.cancelQueries({ queryKey: ['classes'] });

      const previousTeachers = queryClient.getQueryData(['teachers']);
      const previousClassTeachers = queryClient.getQueryData(['teachers', 'class', classId]);

      // Optimistically update
      queryClient.setQueryData(['teachers'], (old: Teacher[] = []) => {
        return old.map(teacher => 
          teacher.id === teacherId 
            ? { 
                ...teacher, 
                assignedClassId: undefined,
                isFormTeacher: false,
                assignedClasses: (teacher.assignedClasses || []).filter(id => id !== classId)
              } 
            : teacher
        );
      });

      return { previousTeachers, previousClassTeachers };
    },
    onError: (error, variables, context) => {
      if (context?.previousTeachers) {
        queryClient.setQueryData(['teachers'], context.previousTeachers);
      }
      if (context?.previousClassTeachers) {
        queryClient.setQueryData(['teachers', 'class', variables.classId], context.previousClassTeachers);
      }
      console.error('Failed to remove teacher:', error);
    },
    onSuccess: (data) => {
      console.log('Teacher removed successfully:', data);
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['teachers'],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ 
        queryKey: ['teachers', 'class', variables.classId],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ 
        queryKey: ['classes'],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ 
        queryKey: ['dashboardStats'],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ 
        queryKey: ['teacherAssignments'],
        refetchType: 'active'
      });
    },
  });

  // Helper: Get available teachers (not assigned to any class OR can teach multiple classes)
  const getAvailableTeachers = (): Teacher[] => {
    const allTeachers = teachersQuery.data || [];
    // For now, return all active teachers since a teacher can teach multiple classes
    return allTeachers.filter(teacher => teacher.status === 'active' || !teacher.status);
  };

  // Helper: Get form teacher for class
  const getFormTeacher = (): Teacher | undefined => {
    const classTeachers = classTeachersQuery.data || [];
    return classTeachers.find(teacher => teacher.isFormTeacher);
  };

  return {
    // Data
    allTeachers: teachersQuery.data || [],
    classTeachers: classTeachersQuery.data || [],
    availableTeachers: getAvailableTeachers(),
    formTeacher: getFormTeacher(),
    
    // Query states
    isLoading: teachersQuery.isLoading,
    isFetching: teachersQuery.isFetching,
    isLoadingClassTeachers: classTeachersQuery.isLoading,
    isError: teachersQuery.isError || classTeachersQuery.isError,
    error: teachersQuery.error || classTeachersQuery.error,
    
    // Mutation states
    isAssigningTeacher: assignTeacherMutation.isPending,
    isRemovingTeacher: removeTeacherMutation.isPending,
    
    // Mutations
    assignTeacherToClass: assignTeacherMutation.mutateAsync,
    removeTeacherFromClass: removeTeacherMutation.mutateAsync,
    
    // Refetch
    refetchTeachers: teachersQuery.refetch,
    refetchClassTeachers: classTeachersQuery.refetch,
  };
};