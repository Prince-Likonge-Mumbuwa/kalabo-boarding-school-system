import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { classService, parseClassName } from '@/services/schoolService';
import { Class, ClassCSVImportData } from '@/types/school';

interface ClassFilters {
  year?: number;
  isActive?: boolean;
  type?: 'grade' | 'form';
  searchTerm?: string;
  teacherId?: string; // ADDED: Support for filtering by teacher
}

interface CreateClassData {
  name: string;
  year: number;
}

export const useSchoolClasses = (filters?: ClassFilters) => {
  const queryClient = useQueryClient();

  // Query: Get classes with filters
  const classesQuery = useQuery({
    queryKey: ['classes', filters],
    queryFn: () => classService.getClasses(filters),
    staleTime: 30 * 1000, // 30 seconds - shorter to see updates faster
    gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
    refetchOnWindowFocus: true, // Refetch when user returns to tab
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
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['classes'] });

      // Snapshot previous value for rollback
      const previousClasses = queryClient.getQueryData(['classes', filters]);

      // Optimistically update UI with temporary class
      const parsed = parseClassName(newClass.name);
      const optimisticClass: Class = {
        id: `temp-${Date.now()}`,
        name: newClass.name.trim(),
        year: newClass.year,
        type: parsed.type ?? 'grade',
        level: parsed.level,
        section: parsed.section,
        isActive: true,
        students: 0,
        teachers: [],
        createdAt: new Date(),
      };

      queryClient.setQueryData(['classes', filters], (old: Class[] = []) => {
        return [...old, optimisticClass];
      });

      return { previousClasses };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousClasses) {
        queryClient.setQueryData(['classes', filters], context.previousClasses);
      }
      console.error('Failed to create class:', error);
    },
    onSuccess: (newClass) => {
      console.log('Class created successfully:', newClass);
    },
    onSettled: () => {
      // Always refetch after mutation (success or error)
      queryClient.invalidateQueries({ 
        queryKey: ['classes'],
        refetchType: 'active' // Only refetch active queries
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
      // Invalidate all class queries after bulk import
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

      // Optimistically update
      queryClient.setQueryData(['classes', filters], (old: Class[] = []) => {
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

  // If teacherId filter is provided, filter the results
  const filteredClasses = filters?.teacherId 
    ? (classesQuery.data || []).filter(cls => 
        cls.teachers?.includes(filters.teacherId!) || 
        cls.formTeacherId === filters.teacherId
      )
    : (classesQuery.data || []);

  return {
    // Data - return filtered classes if teacherId is provided
    classes: filteredClasses,
    
    // Query states
    isLoading: classesQuery.isLoading,
    isFetching: classesQuery.isFetching,
    isError: classesQuery.isError,
    error: classesQuery.error,
    
    // Mutation states
    isCreatingClass: createClassMutation.isPending,
    isImportingClasses: bulkImportClassesMutation.isPending,
    isUpdatingClass: updateClassMutation.isPending,
    
    // Mutations
    createClass: createClassMutation.mutateAsync,
    bulkImportClasses: bulkImportClassesMutation.mutateAsync,
    updateClass: updateClassMutation.mutateAsync,
    
    // Refetch
    refetch: classesQuery.refetch,
    
    // Helper
    parseClassName,
  };
};