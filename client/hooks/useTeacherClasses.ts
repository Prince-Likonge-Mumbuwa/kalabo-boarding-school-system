// @/hooks/useTeacherClasses.ts
import { useQuery } from '@tanstack/react-query';
import { classService } from '@/services/schoolService';
import { useAuth } from './useAuth';

export const useTeacherClasses = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['teacherClasses', user?.uid], // Changed from 'id' to 'uid'
    queryFn: async () => {
      if (!user?.uid) return []; // Changed from 'id' to 'uid'
      
      // Get all active classes
      const allClasses = await classService.getClasses({ isActive: true });
      
      // Simple filter: teacher is in teachers array OR is form teacher
      const teacherClasses = allClasses.filter(cls => 
        cls.teachers?.includes(user.uid) || cls.formTeacherId === user.uid // Changed from 'id' to 'uid'
      );
      
      console.log(`📚 Found ${teacherClasses.length} classes for teacher ${user.fullName || user.email}`); // Changed from 'name' to 'fullName'
      return teacherClasses;
    },
    enabled: !!user?.uid, // Changed from 'id' to 'uid'
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};