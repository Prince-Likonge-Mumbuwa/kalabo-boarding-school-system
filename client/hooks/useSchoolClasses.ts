// @/hooks/useSchoolClasses.ts - ENHANCED WITH SUBJECT NORMALIZATION
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { classService, parseClassName } from '@/services/schoolService';
import { Class, ClassCSVImportData } from '@/types/school';
import { normalizeSubjectName } from '@/services/resultsService'; // IMPORT normalization utility

interface ClassFilters {
  year?: number;
  isActive?: boolean;
  type?: 'grade' | 'form';
  searchTerm?: string;
  teacherId?: string;
}

interface CreateClassData {
  name: string;
  year: number;
}

// ENHANCED: Class interface now includes teacherAssignments field
export interface EnhancedClass extends Class {
  teacherAssignments?: Array<{
    id: string;
    subject: string;
    subjectId: string; // Normalized subject ID
    teacherId: string;
    teacherName: string;
  }>;
}

export const useSchoolClasses = (filters?: ClassFilters) => {
  const queryClient = useQueryClient();

  // Query: Get classes with filters
  const classesQuery = useQuery({
    queryKey: ['classes', filters],
    queryFn: async () => {
      const classes = await classService.getClasses(filters);
      
      // ENHANCED: For each class, fetch its teacher assignments
      // This ensures we have normalized subject IDs available
      const enhancedClasses = await Promise.all(
        classes.map(async (cls: Class) => {
          try {
            // Fetch teacher assignments for this class
            const assignments = await classService.getTeacherAssignmentsByClass(cls.id);
            
            // Normalize subject names in assignments
            const normalizedAssignments = assignments.map((assignment: any) => ({
              ...assignment,
              subjectId: normalizeSubjectName(assignment.subject || '')
            }));
            
            return {
              ...cls,
              teacherAssignments: normalizedAssignments
            } as EnhancedClass;
          } catch (error) {
            // If assignments fetch fails, return class without assignments
            console.warn(`Could not fetch assignments for class ${cls.id}:`, error);
            return cls as EnhancedClass;
          }
        })
      );
      
      return enhancedClasses;
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  // Mutation: Create new class
  const createClassMutation = useMutation({
    mutationFn: async (data: CreateClassData) => {
      const parsed = parseClassName(data.name);
      
      const classData = {
        name: data.name.trim(),
        year: data.year,
        type: parsed.type ?? 'grade',
        level: parsed.level,
        section: parsed.section,
        isActive: true,
        students: 0,
        teachers: [],
        createdAt: new Date(),
      };

      return classService.createClass(classData);
    },
    onMutate: async (newClass) => {
      await queryClient.cancelQueries({ queryKey: ['classes'] });

      const previousClasses = queryClient.getQueryData(['classes', filters]);

      const parsed = parseClassName(newClass.name);
      const optimisticClass: EnhancedClass = {
        id: `temp-${Date.now()}`,
        name: newClass.name.trim(),
        year: newClass.year,
        type: parsed.type ?? 'grade',
        level: parsed.level,
        section: parsed.section,
        isActive: true,
        students: 0,
        teachers: [],
        teacherAssignments: [], // Initialize empty assignments
        createdAt: new Date(),
      };

      queryClient.setQueryData(['classes', filters], (old: EnhancedClass[] = []) => {
        return [...old, optimisticClass];
      });

      return { previousClasses };
    },
    onError: (error, variables, context) => {
      if (context?.previousClasses) {
        queryClient.setQueryData(['classes', filters], context.previousClasses);
      }
      console.error('Failed to create class:', error);
    },
    onSuccess: (newClass) => {
      console.log('Class created successfully:', newClass);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['classes'],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  // Mutation: Bulk import classes
  const bulkImportClassesMutation = useMutation({
    mutationFn: async (classesData: ClassCSVImportData[]) => {
      const processedData = classesData.map((item) => {
        const parsed = parseClassName(item.name);
        return {
          ...item,
          name: item.name.trim(),
          type: parsed.type ?? 'grade',
          level: parsed.level,
          section: parsed.section,
          isActive: true,
          students: 0,
          teachers: [],
          createdAt: new Date(),
        };
      });
      return classService.bulkImportClasses(processedData);
    },
    onSuccess: (result) => {
      console.log('Bulk import completed:', result);
    },
    onError: (error) => {
      console.error('Bulk import failed:', error);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['classes'],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  // Mutation: Update class
  const updateClassMutation = useMutation({
    mutationFn: async ({ classId, updates }: { classId: string; updates: Partial<Class> }) => {
      return classService.updateClass(classId, updates);
    },
    onMutate: async ({ classId, updates }) => {
      await queryClient.cancelQueries({ queryKey: ['classes'] });
      
      const previousClasses = queryClient.getQueryData(['classes', filters]);

      queryClient.setQueryData(['classes', filters], (old: EnhancedClass[] = []) => {
        return old.map(cls => 
          cls.id === classId ? { ...cls, ...updates } : cls
        );
      });

      return { previousClasses };
    },
    onError: (error, variables, context) => {
      if (context?.previousClasses) {
        queryClient.setQueryData(['classes', filters], context.previousClasses);
      }
      console.error('Failed to update class:', error);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  // Mutation: Refresh teacher assignments for a class
  const refreshAssignmentsMutation = useMutation({
    mutationFn: async (classId: string) => {
      const assignments = await classService.getTeacherAssignmentsByClass(classId);
      return {
        classId,
        assignments: assignments.map((a: any) => ({
          ...a,
          subjectId: normalizeSubjectName(a.subject || '')
        }))
      };
    },
    onSuccess: ({ classId, assignments }) => {
      // Update the class in the cache with fresh assignments
      queryClient.setQueryData(['classes', filters], (old: EnhancedClass[] = []) => {
        return old.map(cls => 
          cls.id === classId 
            ? { ...cls, teacherAssignments: assignments } 
            : cls
        );
      });
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['teacherAssignments', 'class', classId] });
      queryClient.invalidateQueries({ queryKey: ['reportReadiness', 'class', classId] });
    },
  });

  // If teacherId filter is provided, filter the results
  const filteredClasses = filters?.teacherId 
    ? (classesQuery.data || []).filter(cls => 
        cls.teachers?.includes(filters.teacherId!) || 
        cls.formTeacherId === filters.teacherId
      )
    : (classesQuery.data || []);

  return {
    // Data - return enhanced classes with normalized assignments
    classes: filteredClasses as EnhancedClass[],
    
    // Query states
    isLoading: classesQuery.isLoading,
    isFetching: classesQuery.isFetching,
    isError: classesQuery.isError,
    error: classesQuery.error,
    
    // Mutation states
    isCreatingClass: createClassMutation.isPending,
    isImportingClasses: bulkImportClassesMutation.isPending,
    isUpdatingClass: updateClassMutation.isPending,
    isRefreshingAssignments: refreshAssignmentsMutation.isPending,
    
    // Mutations
    createClass: createClassMutation.mutateAsync,
    bulkImportClasses: bulkImportClassesMutation.mutateAsync,
    updateClass: updateClassMutation.mutateAsync,
    refreshAssignments: refreshAssignmentsMutation.mutateAsync,
    
    // Refetch
    refetch: classesQuery.refetch,
    
    // Helper
    parseClassName,
    normalizeSubjectName, // EXPOSE normalization utility
  };
};