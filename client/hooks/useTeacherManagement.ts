import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy,
  updateDoc,
  doc,
  arrayUnion,
  arrayRemove,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface Teacher {
  id: string;
  name: string;
  email: string;
  phone?: string;
  department: string;
  subjects: string[];
  isFormTeacher: boolean;
  assignedClassId?: string;
  assignedClassName?: string;
  employmentDate: Date;
  status: 'active' | 'inactive' | 'on_leave';
  // Fields from user collection
  userType?: string;
  createdAt?: Date;
  createdBy?: string;
}

export interface TeacherStats {
  totalTeachers: number;
  activeTeachers: number;
  formTeachers: number;
  teachersByDepartment: Record<string, number>;
  recentHires: Teacher[];
}

export const useTeacherManagement = () => {
  const queryClient = useQueryClient();

  const fetchTeachers = async (): Promise<Teacher[]> => {
    try {
      // Try to fetch from teachers collection first
      const teachersRef = collection(db, 'teachers');
      const teachersSnapshot = await getDocs(teachersRef);
      
      let teachers: Teacher[] = [];
      
      if (teachersSnapshot.size > 0) {
        // If teachers collection exists, use it
        teachersSnapshot.forEach((doc) => {
          const data = doc.data();
          teachers.push({
            id: doc.id,
            name: data.name,
            email: data.email,
            phone: data.phone,
            department: data.department || 'General',
            subjects: data.subjects || [],
            isFormTeacher: data.isFormTeacher || false,
            assignedClassId: data.assignedClassId,
            assignedClassName: data.assignedClassName,
            employmentDate: data.employmentDate?.toDate() || new Date(),
            status: data.status || 'active',
          });
        });
      } else {
        // If no teachers collection, fetch from users with userType = 'teacher'
        const usersRef = collection(db, 'users');
        const q = query(
          usersRef, 
          where('userType', '==', 'teacher'),
          orderBy('name')
        );
        
        const usersSnapshot = await getDocs(q);
        
        usersSnapshot.forEach((doc) => {
          const data = doc.data();
          teachers.push({
            id: doc.id,
            name: data.name,
            email: data.email,
            phone: data.phone || '',
            department: data.department || 'General',
            subjects: data.subjects || [],
            isFormTeacher: data.isFormTeacher || false,
            assignedClassId: data.assignedClassId,
            assignedClassName: data.assignedClassName,
            employmentDate: data.createdAt?.toDate() || new Date(),
            status: data.status || 'active',
            userType: data.userType,
            createdAt: data.createdAt?.toDate(),
            createdBy: data.createdBy,
          });
        });
      }
      
      // Sort by name
      return teachers.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Error fetching teachers:', error);
      throw error; // Re-throw to let React Query handle the error
    }
  };

  const fetchTeacherStats = async (): Promise<TeacherStats> => {
    try {
      const teachers = await fetchTeachers();
      const activeTeachers = teachers.filter(t => t.status === 'active');
      
      const totalTeachers = teachers.length;
      const activeTeachersCount = activeTeachers.length;
      const formTeachers = activeTeachers.filter(t => t.isFormTeacher).length;
      
      // Group by department
      const teachersByDepartment: Record<string, number> = {};
      activeTeachers.forEach(t => {
        const dept = t.department || 'General';
        teachersByDepartment[dept] = (teachersByDepartment[dept] || 0) + 1;
      });
      
      // Get recent hires (last 3 hired)
      const recentHires = [...activeTeachers]
        .sort((a, b) => b.employmentDate.getTime() - a.employmentDate.getTime())
        .slice(0, 3);
      
      return {
        totalTeachers,
        activeTeachers: activeTeachersCount,
        formTeachers,
        teachersByDepartment,
        recentHires,
      };
    } catch (error) {
      console.error('Error fetching teacher stats:', error);
      throw error; // Re-throw to let React Query handle the error
    }
  };

  // Assign teacher to class
  const assignTeacherToClass = async (
    teacherId: string, 
    classId: string, 
    className: string,
    isFormTeacher: boolean = false
  ): Promise<void> => {
    const batch = writeBatch(db);
    
    // Check if teacher exists in teachers collection
    const teacherRef = doc(db, 'teachers', teacherId);
    const userRef = doc(db, 'users', teacherId);
    
    // Try to update in teachers collection first
    try {
      batch.update(teacherRef, {
        assignedClassId: classId,
        assignedClassName: className,
        isFormTeacher: isFormTeacher,
        updatedAt: Timestamp.now(),
      });
    } catch {
      // If not in teachers collection, update in users collection
      batch.update(userRef, {
        assignedClassId: classId,
        assignedClassName: className,
        isFormTeacher: isFormTeacher,
        updatedAt: Timestamp.now(),
      });
    }
    
    // Also update the class to have this teacher
    const classRef = doc(db, 'classes', classId);
    batch.update(classRef, {
      formTeacherId: isFormTeacher ? teacherId : null,
      formTeacherName: isFormTeacher ? className : null,
      teachers: arrayUnion(teacherId),
      updatedAt: Timestamp.now(),
    });
    
    await batch.commit();
  };

  // Remove teacher from class
  const removeTeacherFromClass = async (teacherId: string, classId: string): Promise<void> => {
    const batch = writeBatch(db);
    
    // Remove from teacher document
    const teacherRef = doc(db, 'teachers', teacherId);
    const userRef = doc(db, 'users', teacherId);
    
    try {
      batch.update(teacherRef, {
        assignedClassId: null,
        assignedClassName: null,
        isFormTeacher: false,
        updatedAt: Timestamp.now(),
      });
    } catch {
      batch.update(userRef, {
        assignedClassId: null,
        assignedClassName: null,
        isFormTeacher: false,
        updatedAt: Timestamp.now(),
      });
    }
    
    // Remove from class document
    const classRef = doc(db, 'classes', classId);
    batch.update(classRef, {
      formTeacherId: null,
      formTeacherName: null,
      teachers: arrayRemove(teacherId),
      updatedAt: Timestamp.now(),
    });
    
    await batch.commit();
  };

  // Update teacher information
  const updateTeacher = async (teacherId: string, updates: Partial<Teacher>): Promise<void> => {
    const teacherRef = doc(db, 'teachers', teacherId);
    const userRef = doc(db, 'users', teacherId);
    
    try {
      await updateDoc(teacherRef, {
        ...updates,
        updatedAt: Timestamp.now(),
      });
    } catch {
      // If not in teachers collection, update in users collection
      await updateDoc(userRef, {
        ...updates,
        updatedAt: Timestamp.now(),
      });
    }
  };

  const teachersQuery = useQuery({
    queryKey: ['teachers'],
    queryFn: fetchTeachers,
    staleTime: 5 * 60 * 1000,
  });

  const statsQuery = useQuery({
    queryKey: ['teachers', 'stats'],
    queryFn: fetchTeacherStats,
    staleTime: 5 * 60 * 1000,
  });

  const assignTeacherMutation = useMutation({
    mutationFn: ({ teacherId, classId, className, isFormTeacher }: 
      { teacherId: string; classId: string; className: string; isFormTeacher?: boolean }) =>
      assignTeacherToClass(teacherId, classId, className, isFormTeacher),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
    },
  });

  const removeTeacherMutation = useMutation({
    mutationFn: ({ teacherId, classId }: { teacherId: string; classId: string }) =>
      removeTeacherFromClass(teacherId, classId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
    },
  });

  const updateTeacherMutation = useMutation({
    mutationFn: ({ teacherId, updates }: { teacherId: string; updates: Partial<Teacher> }) =>
      updateTeacher(teacherId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
    },
  });

  return {
    // Data
    teachers: teachersQuery.data || [],
    stats: statsQuery.data,
    
    // Loading states
    isLoading: teachersQuery.isLoading || statsQuery.isLoading,
    isError: teachersQuery.isError || statsQuery.isError, // Added this line
    isAssigning: assignTeacherMutation.isPending,
    isRemoving: removeTeacherMutation.isPending,
    isUpdating: updateTeacherMutation.isPending,
    
    // Error states (optional, if you want separate errors)
    teachersError: teachersQuery.error,
    statsError: statsQuery.error,
    
    // Mutations
    assignTeacherToClass: assignTeacherMutation.mutateAsync,
    removeTeacherFromClass: removeTeacherMutation.mutateAsync,
    updateTeacher: updateTeacherMutation.mutateAsync,
    
    // Query states
    teachersQuery,
    statsQuery,
    
    // Refetch function
    refetch: () => {
      teachersQuery.refetch();
      statsQuery.refetch();
    },
  };
};