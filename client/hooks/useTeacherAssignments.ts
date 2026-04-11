// @/hooks/useTeacherAssignments.ts
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { normalizeSubjectName } from '@/services/resultsService';

export interface TeacherAssignment {
  id: string;
  teacherId: string;
  classId: string;
  className: string;
  subject: string;
  subjectId: string; // ADDED: Normalized subject ID for consistent matching
  isFormTeacher: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export const useTeacherAssignments = (teacherId?: string) => {
  const fetchAssignments = async (): Promise<TeacherAssignment[]> => {
    if (!teacherId) return [];
    
    try {
      // FIXED: Use correct collection name with underscore
      const assignmentsRef = collection(db, 'teacher_assignments');
      const q = query(assignmentsRef, where('teacherId', '==', teacherId));
      const snapshot = await getDocs(q);
      
      console.log(`📚 Found ${snapshot.size} assignments for teacher ${teacherId} in teacher_assignments`);
      
      const assignments = await Promise.all(
        snapshot.docs.map(async (docSnapshot) => {
          const data = docSnapshot.data();
          
          // Get class name if not present
          let className = data.className || 'Unknown Class';
          if (!className && data.classId) {
            try {
              const classDoc = await getDoc(doc(db, 'classes', data.classId));
              if (classDoc.exists()) {
                className = classDoc.data().name || className;
              }
            } catch (error) {
              console.error('Error fetching class name:', error);
            }
          }
          
          // Normalize the subject name for consistent matching across the app
          const rawSubject = data.subject || '';
          const normalizedSubjectId = normalizeSubjectName(rawSubject);
          
          return {
            id: docSnapshot.id,
            teacherId: data.teacherId,
            classId: data.classId,
            className,
            subject: rawSubject,
            subjectId: normalizedSubjectId, // Store normalized version
            isFormTeacher: data.isFormTeacher || false,
            createdAt: data.createdAt?.toDate(),
            updatedAt: data.updatedAt?.toDate(),
          } as TeacherAssignment;
        })
      );
      
      return assignments;
    } catch (error) {
      console.error(`Error fetching assignments for teacher ${teacherId}:`, error);
      return [];
    }
  };

  const assignmentsQuery = useQuery({
    // FIXED: Use consistent query key
    queryKey: ['teacher_assignments', teacherId],
    queryFn: fetchAssignments,
    enabled: !!teacherId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: true,
  });

  // Helper: Get assignments for a specific class
  const getAssignmentsForClass = (classId: string): TeacherAssignment[] => {
    if (!assignmentsQuery.data) return [];
    return assignmentsQuery.data.filter(assignment => assignment.classId === classId);
  };

  // Helper: Get subjects for a specific class (RETURNS NORMALIZED NAMES for consistent matching)
  const getSubjectsForClass = (classId: string): string[] => {
    const assignments = getAssignmentsForClass(classId);
    // Return normalized subject IDs for consistent matching with resultsService
    return assignments.map(assignment => assignment.subjectId);
  };

  // Helper: Get raw subject names for a specific class (for display)
  const getRawSubjectsForClass = (classId: string): string[] => {
    const assignments = getAssignmentsForClass(classId);
    return assignments.map(assignment => assignment.subject);
  };

  // Helper: Get full assignment details including both raw and normalized names
  const getSubjectAssignmentsForClass = (classId: string): Array<{ raw: string; normalized: string; assignmentId: string }> => {
    const assignments = getAssignmentsForClass(classId);
    return assignments.map(assignment => ({
      raw: assignment.subject,
      normalized: assignment.subjectId,
      assignmentId: assignment.id
    }));
  };

  // Helper: Check if teacher is form teacher for a specific class
  const isFormTeacherForClass = (classId: string): boolean => {
    if (!assignmentsQuery.data) return false;
    return assignmentsQuery.data.some(
      assignment => assignment.classId === classId && assignment.isFormTeacher
    );
  };

  // Helper: Get all classes this teacher is assigned to
  const getAssignedClasses = (): string[] => {
    if (!assignmentsQuery.data) return [];
    return [...new Set(assignmentsQuery.data.map(a => a.classId))];
  };

  // Helper: Get all classes with their subjects
  const getClassesWithSubjects = (): Array<{ classId: string; className: string; subjects: string[]; subjectIds: string[]; isFormTeacher: boolean }> => {
    if (!assignmentsQuery.data) return [];
    
    const classMap = new Map<string, { classId: string; className: string; subjects: Set<string>; subjectIds: Set<string>; isFormTeacher: boolean }>();
    
    assignmentsQuery.data.forEach(assignment => {
      if (!classMap.has(assignment.classId)) {
        classMap.set(assignment.classId, {
          classId: assignment.classId,
          className: assignment.className,
          subjects: new Set(),
          subjectIds: new Set(),
          isFormTeacher: false
        });
      }
      const classData = classMap.get(assignment.classId)!;
      classData.subjects.add(assignment.subject);
      classData.subjectIds.add(assignment.subjectId);
      if (assignment.isFormTeacher) {
        classData.isFormTeacher = true;
      }
    });
    
    return Array.from(classMap.values()).map(item => ({
      ...item,
      subjects: Array.from(item.subjects),
      subjectIds: Array.from(item.subjectIds)
    }));
  };

  return {
    // Data
    assignments: assignmentsQuery.data || [],
    
    // Query states
    isLoading: assignmentsQuery.isLoading,
    isFetching: assignmentsQuery.isFetching,
    isError: assignmentsQuery.isError,
    error: assignmentsQuery.error,
    isSuccess: assignmentsQuery.isSuccess,
    
    // Metadata
    hasAssignments: (assignmentsQuery.data?.length || 0) > 0,
    totalAssignments: assignmentsQuery.data?.length || 0,
    
    // Helpers
    getAssignmentsForClass,
    getSubjectsForClass,        // Returns normalized names (for matching)
    getRawSubjectsForClass,     // Returns raw names (for display)
    getSubjectAssignmentsForClass, // Returns both raw and normalized
    isFormTeacherForClass,
    getAssignedClasses,
    getClassesWithSubjects,
    
    // Refetch
    refetch: assignmentsQuery.refetch,
  };
};