import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teacherService } from '@/services/schoolService';
import { Teacher, TeacherStatusUpdate, TeacherAssignment } from '@/types/school';

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

  // Query: Get all teacher assignments for a class (detailed)
  const classAssignmentsQuery = useQuery({
    queryKey: ['teacherAssignments', 'class', classId],
    queryFn: () => {
      if (!classId) throw new Error('Class ID is required');
      return teacherService.getTeacherAssignmentsByClass(classId);
    },
    enabled: !!classId,
    staleTime: 30 * 1000,
  });

  // Query: Get assignments for a specific teacher
  const teacherAssignmentsQuery = useQuery({
    queryKey: ['teacherAssignments', 'teacher', classId], // Note: classId param is actually teacherId here
    queryFn: () => {
      if (!classId) throw new Error('Teacher ID is required');
      return teacherService.getTeacherAssignments(classId);
    },
    enabled: false, // Don't auto-run, we'll call this manually when needed
    staleTime: 30 * 1000,
  });

  // Mutation: Assign teacher to class with subject (single subject per call - matches your system)
  const assignTeacherMutation = useMutation({
    mutationFn: async ({ 
      teacherId, 
      classId, 
      subject,
      isFormTeacher = false 
    }: {
      teacherId: string;
      classId: string;
      subject?: string; // Made optional for form-teacher-only assignments
      isFormTeacher?: boolean;
    }) => {
      console.log('Assigning teacher:', { teacherId, classId, subject, isFormTeacher });
      
      // For form-teacher-only assignments, we still need a subject? 
      // Your current system requires a subject. Let's check with the existing service.
      
      if (!subject && !isFormTeacher) {
        throw new Error('Subject is required when assigning a teacher to a class');
      }
      
      // If this is a form-teacher-only assignment, we need to decide:
      // Option 1: Use a placeholder subject like "Form Teacher"
      // Option 2: Create a separate method in your service
      
      // Since your current assignTeacherToClass requires a subject,
      // we'll use a placeholder for form-teacher-only assignments
      const subjectToUse = subject || 'Form Teacher';
      
      return teacherService.assignTeacherToClass(teacherId, classId, subjectToUse, isFormTeacher);
    },
    onMutate: async ({ teacherId, classId, subject, isFormTeacher }) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: ['teachers'] });
      await queryClient.cancelQueries({ queryKey: ['teachers', 'class', classId] });
      await queryClient.cancelQueries({ queryKey: ['teacherAssignments', 'class', classId] });

      // Snapshot for rollback
      const previousTeachers = queryClient.getQueryData(['teachers']);
      const previousClassTeachers = queryClient.getQueryData(['teachers', 'class', classId]);
      const previousAssignments = queryClient.getQueryData(['teacherAssignments', 'class', classId]);

      // Find teacher name for optimistic update
      const teachers = queryClient.getQueryData<Teacher[]>(['teachers']) || [];
      const teacher = teachers.find(t => t.id === teacherId);
      const teacherName = teacher?.name || '';

      // Optimistically update the teachers list
      queryClient.setQueryData(['teachers'], (old: Teacher[] = []) => {
        return old.map(t => 
          t.id === teacherId 
            ? { 
                ...t, 
                assignedClasses: [...(t.assignedClasses || []), classId],
                assignedClassId: classId, // Keep for backward compatibility
                isFormTeacher: isFormTeacher || t.isFormTeacher,
              } 
            : t
        );
      });

      // Optimistically update class teachers list
      queryClient.setQueryData(['teachers', 'class', classId], (old: Teacher[] = []) => {
        // Check if teacher is already in the list
        if (old.some(t => t.id === teacherId)) {
          return old.map(t => 
            t.id === teacherId 
              ? { ...t, isFormTeacher: isFormTeacher || t.isFormTeacher }
              : t
          );
        } else {
          // Add teacher to the list with partial data
          return [...old, { id: teacherId, name: teacherName, isFormTeacher } as Teacher];
        }
      });

      // Optimistically update assignments list
      queryClient.setQueryData(['teacherAssignments', 'class', classId], (old: TeacherAssignment[] = []) => {
        const newAssignment: TeacherAssignment = {
          id: `temp-${Date.now()}`,
          teacherId,
          teacherName,
          classId,
          subject: subject || 'Form Teacher',
          isFormTeacher,
          assignedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as TeacherAssignment;
        
        return [...old, newAssignment];
      });

      return { previousTeachers, previousClassTeachers, previousAssignments };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousTeachers) {
        queryClient.setQueryData(['teachers'], context.previousTeachers);
      }
      if (context?.previousClassTeachers) {
        queryClient.setQueryData(['teachers', 'class', variables.classId], context.previousClassTeachers);
      }
      if (context?.previousAssignments) {
        queryClient.setQueryData(['teacherAssignments', 'class', variables.classId], context.previousAssignments);
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
        queryKey: ['teacherAssignments', 'class', variables.classId],
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
    },
  });

  // NEW: Mutation: Assign teacher to class with multiple subjects (makes multiple calls)
  const assignTeacherWithMultipleSubjectsMutation = useMutation({
    mutationFn: async ({ 
      teacherId, 
      classId, 
      subjects,
      isFormTeacher = false 
    }: {
      teacherId: string;
      classId: string;
      subjects: string[];
      isFormTeacher?: boolean;
    }) => {
      console.log('Assigning teacher with multiple subjects:', { teacherId, classId, subjects, isFormTeacher });
      
      // Make multiple API calls - one per subject
      const promises = subjects.map(subject => 
        teacherService.assignTeacherToClass(teacherId, classId, subject, isFormTeacher)
      );
      
      return Promise.all(promises);
    },
    onMutate: async ({ teacherId, classId, subjects, isFormTeacher }) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: ['teachers'] });
      await queryClient.cancelQueries({ queryKey: ['teachers', 'class', classId] });
      await queryClient.cancelQueries({ queryKey: ['teacherAssignments', 'class', classId] });

      // Snapshot for rollback
      const previousTeachers = queryClient.getQueryData(['teachers']);
      const previousClassTeachers = queryClient.getQueryData(['teachers', 'class', classId]);
      const previousAssignments = queryClient.getQueryData(['teacherAssignments', 'class', classId]);

      // Find teacher name for optimistic update
      const teachers = queryClient.getQueryData<Teacher[]>(['teachers']) || [];
      const teacher = teachers.find(t => t.id === teacherId);
      const teacherName = teacher?.name || '';

      // Optimistically update the teachers list
      queryClient.setQueryData(['teachers'], (old: Teacher[] = []) => {
        return old.map(t => 
          t.id === teacherId 
            ? { 
                ...t, 
                assignedClasses: [...(t.assignedClasses || []), classId],
                assignedClassId: classId, // Keep for backward compatibility
                isFormTeacher: isFormTeacher || t.isFormTeacher,
              } 
            : t
        );
      });

      // Optimistically update class teachers list
      queryClient.setQueryData(['teachers', 'class', classId], (old: Teacher[] = []) => {
        if (old.some(t => t.id === teacherId)) {
          return old; // Already in list
        } else {
          return [...old, { id: teacherId, name: teacherName, isFormTeacher } as Teacher];
        }
      });

      // Optimistically update assignments list (add multiple assignments)
      queryClient.setQueryData(['teacherAssignments', 'class', classId], (old: TeacherAssignment[] = []) => {
        const newAssignments = subjects.map((subject, index) => ({
          id: `temp-${Date.now()}-${index}`,
          teacherId,
          teacherName,
          classId,
          subject,
          isFormTeacher,
          assignedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as TeacherAssignment));
        
        return [...old, ...newAssignments];
      });

      return { previousTeachers, previousClassTeachers, previousAssignments };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousTeachers) {
        queryClient.setQueryData(['teachers'], context.previousTeachers);
      }
      if (context?.previousClassTeachers) {
        queryClient.setQueryData(['teachers', 'class', variables.classId], context.previousClassTeachers);
      }
      if (context?.previousAssignments) {
        queryClient.setQueryData(['teacherAssignments', 'class', variables.classId], context.previousAssignments);
      }
      console.error('Failed to assign teacher with multiple subjects:', error);
    },
    onSuccess: (data, variables) => {
      console.log(`Teacher assigned with ${variables.subjects.length} subjects successfully:`, data);
    },
    onSettled: (data, error, variables) => {
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ['teachers'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['teachers', 'class', variables.classId], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['teacherAssignments', 'class', variables.classId], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['classes'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'], refetchType: 'active' });
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
      await queryClient.cancelQueries({ queryKey: ['teachers', 'class', classId] });
      await queryClient.cancelQueries({ queryKey: ['teacherAssignments', 'class', classId] });

      const previousTeachers = queryClient.getQueryData(['teachers']);
      const previousClassTeachers = queryClient.getQueryData(['teachers', 'class', classId]);
      const previousAssignments = queryClient.getQueryData(['teacherAssignments', 'class', classId]);

      // Optimistically update teachers list
      queryClient.setQueryData(['teachers'], (old: Teacher[] = []) => {
        return old.map(teacher => 
          teacher.id === teacherId 
            ? { 
                ...teacher, 
                assignedClasses: (teacher.assignedClasses || []).filter(id => id !== classId),
                assignedClassId: teacher.assignedClassId === classId ? undefined : teacher.assignedClassId,
                isFormTeacher: teacher.assignedClassId === classId ? false : teacher.isFormTeacher,
              } 
            : teacher
        );
      });

      // Optimistically remove from class teachers list
      queryClient.setQueryData(['teachers', 'class', classId], (old: Teacher[] = []) => {
        return old.filter(t => t.id !== teacherId);
      });

      // Optimistically remove all assignments for this teacher in this class
      queryClient.setQueryData(['teacherAssignments', 'class', classId], (old: TeacherAssignment[] = []) => {
        return old.filter(a => a.teacherId !== teacherId);
      });

      return { previousTeachers, previousClassTeachers, previousAssignments };
    },
    onError: (error, variables, context) => {
      if (context?.previousTeachers) {
        queryClient.setQueryData(['teachers'], context.previousTeachers);
      }
      if (context?.previousClassTeachers) {
        queryClient.setQueryData(['teachers', 'class', variables.classId], context.previousClassTeachers);
      }
      if (context?.previousAssignments) {
        queryClient.setQueryData(['teacherAssignments', 'class', variables.classId], context.previousAssignments);
      }
      console.error('Failed to remove teacher:', error);
    },
    onSuccess: (data) => {
      console.log('Teacher removed successfully:', data);
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['teachers'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['teachers', 'class', variables.classId], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['teacherAssignments', 'class', variables.classId], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['classes'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'], refetchType: 'active' });
    },
  });

  // Mutation: Update teacher status
  const updateTeacherStatusMutation = useMutation({
    mutationFn: async ({ teacherId, status }: TeacherStatusUpdate) => {
      console.log('Updating teacher status:', { teacherId, status });
      return teacherService.updateTeacherStatus(teacherId, status);
    },
    onMutate: async ({ teacherId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['teachers'] });

      const previousTeachers = queryClient.getQueryData(['teachers']);

      // Optimistically update
      queryClient.setQueryData(['teachers'], (old: Teacher[] = []) => {
        return old.map(teacher => 
          teacher.id === teacherId 
            ? { ...teacher, status } 
            : teacher
        );
      });

      return { previousTeachers };
    },
    onError: (error, variables, context) => {
      if (context?.previousTeachers) {
        queryClient.setQueryData(['teachers'], context.previousTeachers);
      }
      console.error('Failed to update teacher status:', error);
    },
    onSuccess: (data, variables) => {
      console.log(`Teacher status updated to ${variables.status} successfully:`, data);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'], refetchType: 'active' });
    },
  });

  // Helper: Get available teachers (not assigned to any class OR can teach multiple classes)
  const getAvailableTeachers = (): Teacher[] => {
    const allTeachers = teachersQuery.data || [];
    // Return all active teachers (including those with status 'active' or undefined)
    return allTeachers.filter(teacher => 
      teacher.status === 'active' || !teacher.status
    );
  };

  // Helper: Get form teacher for class
  const getFormTeacher = (): Teacher | undefined => {
    const classTeachers = classTeachersQuery.data || [];
    return classTeachers.find(teacher => teacher.isFormTeacher);
  };

  // Helper: Get subjects taught by a teacher in a specific class
  const getTeacherSubjectsForClass = (teacherId: string, classId: string): string[] => {
    const assignments = classAssignmentsQuery.data || [];
    return assignments
      .filter(a => a.teacherId === teacherId)
      .map(a => a.subject);
  };

  // Helper: Check if teacher is assigned to a class
  const isTeacherAssignedToClass = (teacherId: string, classId: string): boolean => {
    const assignments = classAssignmentsQuery.data || [];
    return assignments.some(a => a.teacherId === teacherId);
  };

  // Helper: Get all teachers with their subjects for a class (for display)
  const getTeachersWithSubjects = (): Array<Teacher & { subjects: string[] }> => {
    const teachers = classTeachersQuery.data || [];
    const assignments = classAssignmentsQuery.data || [];
    
    return teachers.map(teacher => ({
      ...teacher,
      subjects: assignments
        .filter(a => a.teacherId === teacher.id)
        .map(a => a.subject)
    }));
  };

  return {
    // Data
    allTeachers: teachersQuery.data || [],
    classTeachers: classTeachersQuery.data || [],
    teacherAssignments: classAssignmentsQuery.data || [], // For current class
    availableTeachers: getAvailableTeachers(),
    formTeacher: getFormTeacher(),
    teachersWithSubjects: getTeachersWithSubjects(),
    
    // Query states
    isLoading: teachersQuery.isLoading,
    isFetching: teachersQuery.isFetching,
    isLoadingClassTeachers: classTeachersQuery.isLoading,
    isLoadingAssignments: classAssignmentsQuery.isLoading,
    isError: teachersQuery.isError || classTeachersQuery.isError || classAssignmentsQuery.isError,
    error: teachersQuery.error || classTeachersQuery.error || classAssignmentsQuery.error,
    
    // Mutation states
    isAssigningTeacher: assignTeacherMutation.isPending || assignTeacherWithMultipleSubjectsMutation.isPending,
    isRemovingTeacher: removeTeacherMutation.isPending,
    isUpdatingTeacherStatus: updateTeacherStatusMutation.isPending,
    
    // Mutations
    assignTeacherToClass: assignTeacherMutation.mutateAsync,
    assignTeacherWithMultipleSubjects: assignTeacherWithMultipleSubjectsMutation.mutateAsync,
    removeTeacherFromClass: removeTeacherMutation.mutateAsync,
    updateTeacherStatus: updateTeacherStatusMutation.mutateAsync,
    
    // Helper functions
    getTeacherSubjectsForClass,
    isTeacherAssignedToClass,
    
    // Refetch
    refetchTeachers: teachersQuery.refetch,
    refetchClassTeachers: classTeachersQuery.refetch,
    refetchAssignments: classAssignmentsQuery.refetch,
  };
};