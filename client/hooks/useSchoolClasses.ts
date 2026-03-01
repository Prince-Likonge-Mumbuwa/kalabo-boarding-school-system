// @/hooks/useSchoolClasses.ts - UPDATED FOR ENHANCED LEARNER SYSTEM
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  classService, 
  learnerService, // Import learnerService directly
  parseClassName, 
  generateClassPrefix, 
  generateSequentialStudentId 
} from '@/services/schoolService';
import { Class, ClassCSVImportData, Learner } from '@/types/school';
import { normalizeSubjectName } from '@/services/resultsService';

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

// ENHANCED: Class interface now includes learner statistics
export interface EnhancedClass extends Class {
  teacherAssignments?: Array<{
    id: string;
    subject: string;
    subjectId: string; // Normalized subject ID
    teacherId: string;
    teacherName: string;
  }>;
  // New fields for enhanced learner system
  learnerStats?: {
    total: number;
    byGender: {
      boys: number;
      girls: number;
    };
    bySponsor?: Record<string, number>;
    nextStudentIndex?: number; // Next available student index for ID generation
    classPrefix?: string; // Class prefix for student IDs (e.g., "G10B")
  };
}

export const useSchoolClasses = (filters?: ClassFilters) => {
  const queryClient = useQueryClient();

  // Helper function to get next student index for a class
  const getNextStudentIndex = async (classId: string): Promise<number> => {
    try {
      const learners = await learnerService.getLearnersByClass(classId);
      
      if (learners.length === 0) return 1;
      
      const maxIndex = Math.max(...learners.map(l => l.studentIndex || 0));
      return maxIndex + 1;
    } catch (error) {
      console.error('Error getting next student index:', error);
      return 1;
    }
  };

  // Query: Get classes with filters
  const classesQuery = useQuery({
    queryKey: ['classes', filters],
    queryFn: async () => {
      const classes = await classService.getClasses(filters);
      
      // ENHANCED: For each class, fetch teacher assignments and calculate learner stats
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
            
            // Calculate class prefix for student IDs
            const classPrefix = generateClassPrefix(cls.type, cls.level, cls.section);
            
            // Get the next available student index (for UI preview)
            const nextIndex = await getNextStudentIndex(cls.id);
            
            return {
              ...cls,
              teacherAssignments: normalizedAssignments,
              learnerStats: {
                total: cls.students || 0,
                byGender: {
                  boys: cls.genderStats?.boys || 0,
                  girls: cls.genderStats?.girls || 0,
                },
                nextStudentIndex: nextIndex,
                classPrefix: classPrefix,
              }
            } as EnhancedClass;
          } catch (error) {
            // If assignments fetch fails, return class without enhancements
            console.warn(`Could not fetch enhanced data for class ${cls.id}:`, error);
            
            // Still calculate basic stats
            const classPrefix = generateClassPrefix(cls.type, cls.level, cls.section);
            
            return {
              ...cls,
              learnerStats: {
                total: cls.students || 0,
                byGender: {
                  boys: cls.genderStats?.boys || 0,
                  girls: cls.genderStats?.girls || 0,
                },
                classPrefix: classPrefix,
              }
            } as EnhancedClass;
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
      const classPrefix = generateClassPrefix(
        parsed.type ?? 'grade', 
        parsed.level, 
        parsed.section
      );
      
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
        teacherAssignments: [],
        learnerStats: {
          total: 0,
          byGender: { boys: 0, girls: 0 },
          nextStudentIndex: 1,
          classPrefix: classPrefix,
        },
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
    onSuccess: (newClassId, variables) => {
      console.log('Class created successfully with ID:', newClassId);
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
        return old.map(cls => {
          if (cls.id === classId) {
            // Recalculate class prefix if type, level, or section changed
            let classPrefix = cls.learnerStats?.classPrefix;
            if (updates.type || updates.level || updates.section) {
              classPrefix = generateClassPrefix(
                updates.type || cls.type,
                updates.level || cls.level,
                updates.section || cls.section
              );
            }
            
            return { 
              ...cls, 
              ...updates,
              learnerStats: {
                ...cls.learnerStats,
                classPrefix: classPrefix || cls.learnerStats?.classPrefix,
              }
            };
          }
          return cls;
        });
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

  // Mutation: Refresh learner stats for a class
  const refreshLearnerStatsMutation = useMutation({
    mutationFn: async (classId: string) => {
      // Get class details
      const classData = await classService.getClassById(classId);
      if (!classData) throw new Error('Class not found');
      
      // Get learners for this class using imported learnerService
      const learners = await learnerService.getLearnersByClass(classId);
      
      // Calculate stats
      const boys = learners.filter(l => l.gender === 'male').length;
      const girls = learners.filter(l => l.gender === 'female').length;
      const maxIndex = learners.length > 0 
        ? Math.max(...learners.map(l => l.studentIndex || 0)) 
        : 0;
      
      const classPrefix = generateClassPrefix(
        classData.type, 
        classData.level, 
        classData.section
      );
      
      return {
        classId,
        learnerStats: {
          total: learners.length,
          byGender: { boys, girls },
          nextStudentIndex: maxIndex + 1,
          classPrefix: classPrefix,
        }
      };
    },
    onSuccess: ({ classId, learnerStats }) => {
      queryClient.setQueryData(['classes', filters], (old: EnhancedClass[] = []) => {
        return old.map(cls => 
          cls.id === classId 
            ? { ...cls, learnerStats, students: learnerStats.total } 
            : cls
        );
      });
    },
  });

  // New utility function: Generate a preview of next student ID
  const previewNextStudentId = (classId: string): string | null => {
    const classData = classesQuery.data?.find(c => c.id === classId);
    if (!classData?.learnerStats?.classPrefix) return null;
    
    const nextIndex = classData.learnerStats.nextStudentIndex || 1;
    const indexStr = nextIndex.toString().padStart(3, '0');
    return `${classData.learnerStats.classPrefix}_${indexStr}`;
  };

  // New utility function: Get class by student ID prefix
  const getClassByPrefix = (prefix: string): EnhancedClass | undefined => {
    return classesQuery.data?.find(cls => 
      cls.learnerStats?.classPrefix === prefix
    );
  };

  // If teacherId filter is provided, filter the results
  const filteredClasses = filters?.teacherId 
    ? (classesQuery.data || []).filter(cls => 
        cls.teachers?.includes(filters.teacherId!) || 
        cls.formTeacherId === filters.teacherId
      )
    : (classesQuery.data || []);

  return {
    // Data - return enhanced classes with normalized assignments and learner stats
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
    isRefreshingLearnerStats: refreshLearnerStatsMutation.isPending,
    
    // Mutations
    createClass: createClassMutation.mutateAsync,
    bulkImportClasses: bulkImportClassesMutation.mutateAsync,
    updateClass: updateClassMutation.mutateAsync,
    refreshAssignments: refreshAssignmentsMutation.mutateAsync,
    refreshLearnerStats: refreshLearnerStatsMutation.mutateAsync,
    
    // Refetch
    refetch: classesQuery.refetch,
    
    // New utility functions
    previewNextStudentId,
    getClassByPrefix,
    
    // Helpers
    parseClassName,
    normalizeSubjectName,
    generateClassPrefix,
    generateSequentialStudentId, // Expose ID generator for use in components
  };
};