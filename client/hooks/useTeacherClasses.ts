// @/hooks/useTeacherClasses.ts
import { useQuery } from '@tanstack/react-query';
import { classService } from '@/services/schoolService';
import { useAuth } from './useAuth';

export const useTeacherClasses = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['teacherClasses', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      // Get all active classes
      const allClasses = await classService.getClasses({ isActive: true });
      
      // Simple filter: teacher is in teachers array OR is form teacher
      const teacherClasses = allClasses.filter(cls => 
        cls.teachers?.includes(user.id) || cls.formTeacherId === user.id
      );
      
      console.log(`📚 Found ${teacherClasses.length} classes for teacher ${user.name}`);
      return teacherClasses;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};