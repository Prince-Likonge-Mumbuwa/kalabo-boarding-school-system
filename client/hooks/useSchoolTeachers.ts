// @/hooks/useSchoolTeachers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teacherService } from '@/services/schoolService';
import { Teacher, TeacherStatusUpdate, TeacherAssignment } from '@/types/school';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

export const useSchoolTeachers = (classId?: string) => {
  const queryClient = useQueryClient();

  // Query: Get all teachers
  const teachersQuery = useQuery({
    queryKey: ['teachers'],
    queryFn: teacherService.getTeachers,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
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

  // Query: Get all teacher assignments for a class
  const classAssignmentsQuery = useQuery({
    // FIXED: Use consistent query key
    queryKey: ['teacher_assignments', 'class', classId],
    queryFn: () => {
      if (!classId) throw new Error('Class ID is required');
      return teacherService.getTeacherAssignmentsByClass(classId);
    },
    enabled: !!classId,
    staleTime: 30 * 1000,
  });

  // FIXED: Query to fetch all assignments for a specific teacher
  const fetchTeacherAssignments = async (teacherId: string): Promise<TeacherAssignment[]> => {
    try {
      // FIXED: Use correct collection name
      const assignmentsRef = collection(db, 'teacher_assignments');
      const q = query(assignmentsRef, where('teacherId', '==', teacherId));
      const snapshot = await getDocs(q);
      
      console.log(`📚 Found ${snapshot.size} assignments for teacher ${teacherId}`);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TeacherAssignment[];
    } catch (error) {
      console.error(`Error fetching assignments for teacher ${teacherId}:`, error);
      return [];
    }
  };

  // FIXED: Hook to get assignments for a specific teacher
  const useTeacherAssignments = (teacherId: string) => {
    return useQuery({
      // FIXED: Use consistent query key
      queryKey: ['teacher_assignments', teacherId],
      queryFn: () => fetchTeacherAssignments(teacherId),
      enabled: !!teacherId,
      staleTime: 30 * 1000,
    });
  };

  // Mutation: Assign teacher to class with single subject
  const assignTeacherMutation = useMutation({
    mutationFn: async ({ 
      teacherId, 
      classId, 
      subject,
      isFormTeacher = false 
    }: {
      teacherId: string;
      classId: string;
      subject?: string;
      isFormTeacher?: boolean;
    }) => {
      if (!subject && !isFormTeacher) {
        throw new Error('Subject is required when assigning a teacher to a class');
      }
      
      const subjectToUse = subject || 'Form Teacher';
      return teacherService.assignTeacherToClass(teacherId, classId, subjectToUse, isFormTeacher);
    },
    onSuccess: (_, variables) => {
      // FIXED: Use consistent query keys for invalidation
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['teachers', 'class', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['teacher_assignments', 'class', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['teacher_assignments', variables.teacherId] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  // Mutation: Assign teacher with multiple subjects
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
      const promises = subjects.map(subject => 
        teacherService.assignTeacherToClass(teacherId, classId, subject, isFormTeacher)
      );
      return Promise.all(promises);
    },
    onSuccess: (_, variables) => {
      // FIXED: Use consistent query keys for invalidation
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['teachers', 'class', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['teacher_assignments', 'class', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['teacher_assignments', variables.teacherId] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  // Mutation: Update teacher information
  const updateTeacherMutation = useMutation({
    mutationFn: ({ teacherId, updates }: { teacherId: string; updates: Partial<Teacher> }) => {
      return teacherService.updateTeacher(teacherId, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  // Mutation: Delete teacher
  const deleteTeacherMutation = useMutation({
    mutationFn: async (teacherId: string) => {
      return teacherService.deleteTeacher(teacherId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  // Mutation: Remove specific subject from teacher in class
  const removeTeacherSubjectMutation = useMutation({
    mutationFn: ({ teacherId, classId, subject }: { teacherId: string; classId: string; subject: string }) => {
      return teacherService.removeTeacherSubject(teacherId, classId, subject);
    },
    onSuccess: (_, variables) => {
      // FIXED: Use consistent query keys for invalidation
      queryClient.invalidateQueries({ queryKey: ['teacher_assignments', variables.teacherId] });
      queryClient.invalidateQueries({ queryKey: ['teacher_assignments', 'class', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
    },
  });

  // Mutation: Transfer teacher between classes
  const transferTeacherMutation = useMutation({
    mutationFn: ({ 
      teacherId, 
      fromClassId, 
      toClassId, 
      subjectMapping 
    }: { 
      teacherId: string; 
      fromClassId: string; 
      toClassId: string; 
      subjectMapping?: Record<string, string> 
    }) => {
      return teacherService.transferTeacher(teacherId, fromClassId, toClassId, subjectMapping);
    },
    onSuccess: (_, variables) => {
      // FIXED: Use consistent query keys for invalidation
      queryClient.invalidateQueries({ queryKey: ['teacher_assignments', variables.teacherId] });
      queryClient.invalidateQueries({ queryKey: ['teacher_assignments', 'class', variables.fromClassId] });
      queryClient.invalidateQueries({ queryKey: ['teacher_assignments', 'class', variables.toClassId] });
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
    },
  });

  // Mutation: Remove teacher from class (all subjects)
  const removeTeacherMutation = useMutation({
    mutationFn: async ({ teacherId, classId }: { teacherId: string; classId: string }) => {
      return teacherService.removeTeacherFromClass(teacherId, classId);
    },
    onSuccess: (_, variables) => {
      // FIXED: Use consistent query keys for invalidation
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['teachers', 'class', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['teacher_assignments', 'class', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['teacher_assignments', variables.teacherId] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  // Mutation: Update teacher status
  const updateTeacherStatusMutation = useMutation({
    mutationFn: async ({ teacherId, status }: TeacherStatusUpdate) => {
      return teacherService.updateTeacherStatus(teacherId, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  // Helper: Get available teachers
  const getAvailableTeachers = (): Teacher[] => {
    const allTeachers = teachersQuery.data || [];
    return allTeachers.filter(teacher => 
      teacher.status === 'active' || !teacher.status
    );
  };

  return {
    // Data
    allTeachers: teachersQuery.data || [],
    classTeachers: classTeachersQuery.data || [],
    teacherAssignments: classAssignmentsQuery.data || [],
    availableTeachers: getAvailableTeachers(),
    
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
    isRemovingSubject: removeTeacherSubjectMutation.isPending,
    isUpdatingTeacherStatus: updateTeacherStatusMutation.isPending,
    isUpdatingTeacher: updateTeacherMutation.isPending,
    isDeletingTeacher: deleteTeacherMutation.isPending,
    isTransferringTeacher: transferTeacherMutation.isPending,
    
    // Mutations
    assignTeacherToClass: assignTeacherMutation.mutateAsync,
    assignTeacherWithMultipleSubjects: assignTeacherWithMultipleSubjectsMutation.mutateAsync,
    removeTeacherFromClass: removeTeacherMutation.mutateAsync,
    removeTeacherSubject: removeTeacherSubjectMutation.mutateAsync,
    updateTeacherStatus: updateTeacherStatusMutation.mutateAsync,
    updateTeacher: updateTeacherMutation.mutateAsync,
    deleteTeacher: deleteTeacherMutation.mutateAsync,
    transferTeacher: transferTeacherMutation.mutateAsync,
    
    // Custom hook for teacher assignments
    useTeacherAssignments,
    
    // Helper functions
    getTeacherSubjectsForClass: (teacherId: string, classId: string): string[] => {
      const assignments = classAssignmentsQuery.data || [];
      return assignments
        .filter(a => a.teacherId === teacherId && a.classId === classId)
        .map(a => a.subject);
    },
    
    isTeacherAssignedToClass: (teacherId: string, classId: string): boolean => {
      const assignments = classAssignmentsQuery.data || [];
      return assignments.some(a => a.teacherId === teacherId && a.classId === classId);
    },
    
    // Refetch
    refetchTeachers: teachersQuery.refetch,
    refetchClassTeachers: classTeachersQuery.refetch,
    refetchAssignments: classAssignmentsQuery.refetch,
  };
};