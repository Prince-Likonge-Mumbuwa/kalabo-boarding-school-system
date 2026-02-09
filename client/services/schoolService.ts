// @/services/schoolService.ts - COMPLETE VERSION WITH SUBJECT SUPPORT
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  arrayUnion,
  arrayRemove,
  Timestamp,
  limit,
  increment as firestoreIncrement,
  DocumentData,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Class, Learner, Teacher, DashboardStats, ClassCSVImportData, CSVImportData } from '@/types/school';

// ==================== HELPER FUNCTIONS ====================

/**
 * Safe date conversion for Firestore timestamps
 */
const toDate = (timestamp: any): Date | undefined => {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  if (timestamp.seconds) {
    return new Date(timestamp.seconds * 1000);
  }
  return undefined;
};

/**
 * Parse class name into type, level, and section
 * Examples: "Grade 8A" → {type: 'grade', level: 8, section: 'A'}
 *           "Form 3B" → {type: 'form', level: 3, section: 'B'}
 */
export const parseClassName = (name: string): { type: 'grade' | 'form'; level: number; section: string } => {
  const match = name.match(/(Grade|Form)\s*(\d+)([A-Za-z]*)/i);
  
  if (match) {
    const type = match[1].toLowerCase() === 'grade' ? 'grade' : 'form';
    const level = parseInt(match[2]);
    const section = (match[3] || 'A').toUpperCase();
    
    if (type === 'grade' && (level < 8 || level > 12)) {
      throw new Error(`Grade level must be between 8 and 12. Got: ${level}`);
    }
    if (type === 'form' && (level < 1 || level > 5)) {
      throw new Error(`Form level must be between 1 and 5. Got: ${level}`);
    }
    
    return { type, level, section };
  }
  
  throw new Error(`Invalid class name format: ${name}. Expected: "Grade 8A" or "Form 3B"`);
};

/**
 * Generate unique student ID
 */
export const generateStudentId = (): string => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substr(2, 3).toUpperCase();
  return `STU${timestamp}${random}`;
};

// ==================== CLASS SERVICE ====================

export const classService = {
  /**
   * Get all classes with optional filters
   */
  getClasses: async (filters?: {
    year?: number;
    isActive?: boolean;
    type?: 'grade' | 'form';
    searchTerm?: string;
    teacherId?: string;
  }): Promise<Class[]> => {
    try {
      const classesRef = collection(db, 'classes');
      let constraints: any[] = [];

      if (filters?.year !== undefined) {
        constraints.push(where('year', '==', filters.year));
      }
      if (filters?.type) {
        constraints.push(where('type', '==', filters.type));
      }
      if (filters?.isActive === false) {
        constraints.push(where('isActive', '==', false));
      }
      
      // Filter by teacherId if provided
      if (filters?.teacherId) {
        constraints.push(where('teachers', 'array-contains', filters.teacherId));
      }

      let q;
      if (constraints.length > 0) {
        q = query(classesRef, ...constraints, orderBy('year', 'desc'), orderBy('name', 'asc'));
      } else {
        q = query(classesRef, orderBy('year', 'desc'), orderBy('name', 'asc'));
      }

      const snapshot = await getDocs(q);
      const classes = snapshot.docs.map(doc => {
        const data = doc.data() as DocumentData;
        return {
          id: doc.id,
          name: data.name || '',
          year: data.year || new Date().getFullYear(),
          type: data.type || 'grade',
          level: data.level || 1,
          section: data.section || 'A',
          students: data.students || 0,
          teachers: data.teachers || [],
          isActive: data.isActive !== false,
          formTeacherId: data.formTeacherId,
          formTeacherName: data.formTeacherName,
          createdDate: toDate(data.createdDate) || new Date(),
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
        } as Class;
      });

      // Apply search filter if provided
      if (filters?.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase();
        return classes.filter(cls =>
          cls.name.toLowerCase().includes(searchLower) ||
          cls.id.toLowerCase().includes(searchLower)
        );
      }

      return classes;
    } catch (error) {
      console.error('Error fetching classes:', error);
      throw error;
    }
  },

  /**
   * Get a single class by ID
   */
  getClassById: async (classId: string): Promise<Class | null> => {
    try {
      const classRef = doc(db, 'classes', classId);
      const classDoc = await getDoc(classRef);
      
      if (!classDoc.exists()) {
        return null;
      }
      
      const data = classDoc.data() as DocumentData;
      return {
        id: classDoc.id,
        name: data.name || '',
        year: data.year || new Date().getFullYear(),
        type: data.type || 'grade',
        level: data.level || 1,
        section: data.section || 'A',
        students: data.students || 0,
        teachers: data.teachers || [],
        isActive: data.isActive !== false,
        formTeacherId: data.formTeacherId,
        formTeacherName: data.formTeacherName,
        createdDate: toDate(data.createdDate) || new Date(),
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
      } as Class;
    } catch (error) {
      console.error('Error fetching class:', error);
      throw error;
    }
  },

  /**
   * Create a new class
   */
  createClass: async (data: {
    name: string;
    year: number;
    type: 'grade' | 'form';
    level: number;
    section: string;
  }): Promise<string> => {
    try {
      const { name, year, type, level, section } = data;
      
      // Check if class already exists
      const classesRef = collection(db, 'classes');
      const q = query(
        classesRef,
        where('year', '==', year),
        where('type', '==', type),
        where('level', '==', level),
        where('section', '==', section)
      );
      
      const existingClasses = await getDocs(q);
      if (!existingClasses.empty) {
        throw new Error(`Class ${name} already exists for year ${year}`);
      }
      
      const classData = {
        name,
        year,
        type,
        level,
        section,
        students: 0,
        teachers: [],
        isActive: true,
        createdDate: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      const docRef = await addDoc(classesRef, classData);
      return docRef.id;
    } catch (error) {
      console.error('Error creating class:', error);
      throw error;
    }
  },

  /**
   * Bulk import classes from CSV data
   */
  bulkImportClasses: async (classesData: ClassCSVImportData[]): Promise<{ success: number; failed: number }> => {
    const classesRef = collection(db, 'classes');
    const toImport: any[] = [];
    let success = 0;
    let failed = 0;
    
    try {
      for (const classData of classesData) {
        try {
          const parsed = parseClassName(classData.name);
          const year = classData.year || new Date().getFullYear();

          // Check for duplicates
          const q = query(
            classesRef,
            where('year', '==', year),
            where('type', '==', parsed.type),
            where('level', '==', parsed.level),
            where('section', '==', parsed.section)
          );

          const existing = await getDocs(q);
          if (!existing.empty) {
            console.warn(`Duplicate: ${classData.name} already exists for year ${year}`);
            failed++;
            continue;
          }

          toImport.push({
            name: classData.name,
            year,
            type: parsed.type,
            level: parsed.level,
            section: parsed.section,
            students: 0,
            teachers: [],
            isActive: true,
            createdDate: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          success++;
        } catch (error) {
          console.error('Error validating class for import:', classData, error);
          failed++;
        }
      }

      // Batch import
      if (toImport.length > 0) {
        const batch = writeBatch(db);
        for (const data of toImport) {
          const classRef = doc(classesRef);
          batch.set(classRef, data);
        }
        await batch.commit();
      }
      
      return { success, failed };
    } catch (error) {
      console.error('Error in bulk import:', error);
      throw error;
    }
  },

  /**
   * Update class information
   */
  updateClass: async (classId: string, updates: Partial<Class>): Promise<void> => {
    try {
      const classRef = doc(db, 'classes', classId);
      await updateDoc(classRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating class:', error);
      throw error;
    }
  },

  /**
   * Archive a class (soft delete)
   */
  archiveClass: async (classId: string): Promise<void> => {
    try {
      const classRef = doc(db, 'classes', classId);
      await updateDoc(classRef, {
        isActive: false,
        archived: true,
        archivedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error archiving class:', error);
      throw error;
    }
  },

  /**
   * Get dashboard statistics
   */
  getDashboardStats: async (): Promise<DashboardStats> => {
    try {
      const classes = await classService.getClasses({ isActive: true });
      
      // Query users collection for teachers
      const usersRef = collection(db, 'users');
      const teachersQuery = query(
        usersRef,
        where('userType', '==', 'teacher')
      );
      const teachersSnapshot = await getDocs(teachersQuery);
      
      const teachers = teachersSnapshot.docs.map(doc => {
        const data = doc.data() as DocumentData;
        return {
          id: doc.id,
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          department: data.department || 'General',
          subjects: data.subjects || [],
          assignedClasses: data.assignedClasses || [],
          status: data.status || 'active',
        } as Teacher;
      });
      
      const totalClasses = classes.length;
      const totalStudents = classes.reduce((sum, c) => sum + (c.students || 0), 0);
      const averageClassSize = totalClasses > 0 ? totalStudents / totalClasses : 0;
      const totalTeachers = teachers.length;
      const activeTeachers = teachers.filter(t => t.status === 'active' || !t.status).length;
      
      const teachersByDepartment: Record<string, number> = {};
      teachers.forEach(teacher => {
        const dept = teacher.department || 'General';
        teachersByDepartment[dept] = (teachersByDepartment[dept] || 0) + 1;
      });
      
      return {
        totalClasses,
        totalStudents,
        averageClassSize,
        totalTeachers,
        activeTeachers,
        teachersByDepartment,
      };
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      throw error;
    }
  },
};

// ==================== LEARNER SERVICE ====================

export const learnerService = {
  /**
   * Get all learners for a specific class
   */
  getLearnersByClass: async (classId: string): Promise<Learner[]> => {
    try {
      const learnersRef = collection(db, 'learners');
      const q = query(
        learnersRef,
        where('classId', '==', classId),
        where('status', '==', 'active')
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data() as DocumentData;
        return {
          id: doc.id,
          name: data.name || '',
          age: data.age || 0,
          parentPhone: data.parentPhone || '',
          studentId: data.studentId || '',
          classId: data.classId || '',
          className: data.className || '',
          status: data.status || 'active',
          enrollmentDate: toDate(data.enrollmentDate) || new Date(),
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
        } as Learner;
      });
    } catch (error) {
      console.error('Error fetching learners:', error);
      throw error;
    }
  },

  /**
   * Search learners in a class
   */
  searchLearnersInClass: async (classId: string, searchTerm: string): Promise<Learner[]> => {
    try {
      const learners = await learnerService.getLearnersByClass(classId);
      
      const searchLower = searchTerm.toLowerCase();
      return learners.filter(learner =>
        learner.name.toLowerCase().includes(searchLower) ||
        learner.studentId.toLowerCase().includes(searchLower) ||
        learner.parentPhone.includes(searchTerm)
      );
    } catch (error) {
      console.error('Error searching learners:', error);
      throw error;
    }
  },

  /**
   * Add a single learner to a class
   */
  addLearner: async (data: {
    name: string;
    age: number;
    parentPhone: string;
    classId: string;
  }): Promise<string> => {
    const batch = writeBatch(db);
    
    try {
      // Generate unique student ID
      const studentId = generateStudentId();
      
      // Create learner document
      const learnerRef = doc(collection(db, 'learners'));
      batch.set(learnerRef, {
        name: data.name,
        age: data.age,
        parentPhone: data.parentPhone,
        studentId,
        classId: data.classId,
        status: 'active',
        enrollmentDate: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      // Update class student count
      const classRef = doc(db, 'classes', data.classId);
      batch.update(classRef, {
        students: firestoreIncrement(1),
        updatedAt: serverTimestamp()
      });
      
      await batch.commit();
      return learnerRef.id;
    } catch (error) {
      console.error('Error adding learner:', error);
      throw error;
    }
  },

  /**
   * Bulk import learners from CSV data
   */
  bulkImportLearners: async (classId: string, learnersData: CSVImportData[]): Promise<{ success: number; failed: number }> => {
    const batch = writeBatch(db);
    let success = 0;
    let failed = 0;
    
    try {
      for (const learner of learnersData) {
        try {
          const studentId = `STU${Date.now().toString().slice(-6)}${success.toString().padStart(3, '0')}`;
          const learnerRef = doc(collection(db, 'learners'));
          
          batch.set(learnerRef, {
            name: learner.name,
            age: parseInt(learner.age.toString()) || 0,
            parentPhone: learner.parentPhone,
            studentId,
            classId,
            status: 'active',
            enrollmentDate: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          success++;
        } catch (error) {
          console.error('Error processing learner:', learner, error);
          failed++;
        }
      }
      
      // Update class student count
      if (success > 0) {
        const classRef = doc(db, 'classes', classId);
        batch.update(classRef, {
          students: firestoreIncrement(success),
          updatedAt: serverTimestamp()
        });
      }
      
      await batch.commit();
      return { success, failed };
    } catch (error) {
      console.error('Error in bulk import:', error);
      throw error;
    }
  },

  /**
   * Transfer a learner from one class to another
   */
  transferLearner: async (learnerId: string, fromClassId: string, toClassId: string): Promise<void> => {
    const batch = writeBatch(db);
    
    try {
      // Update learner document
      const learnerRef = doc(db, 'learners', learnerId);
      batch.update(learnerRef, {
        classId: toClassId,
        status: 'transferred',
        transferredAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      // Decrement from old class
      const fromClassRef = doc(db, 'classes', fromClassId);
      batch.update(fromClassRef, {
        students: firestoreIncrement(-1),
        updatedAt: serverTimestamp()
      });
      
      // Increment to new class
      const toClassRef = doc(db, 'classes', toClassId);
      batch.update(toClassRef, {
        students: firestoreIncrement(1),
        updatedAt: serverTimestamp()
      });
      
      await batch.commit();
    } catch (error) {
      console.error('Error transferring learner:', error);
      throw error;
    }
  },

  /**
   * Remove a learner (archive)
   */
  removeLearner: async (learnerId: string, classId: string): Promise<void> => {
    const batch = writeBatch(db);
    
    try {
      // Archive learner
      const learnerRef = doc(db, 'learners', learnerId);
      batch.update(learnerRef, {
        status: 'archived',
        archivedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      // Decrement class student count
      const classRef = doc(db, 'classes', classId);
      batch.update(classRef, {
        students: firestoreIncrement(-1),
        updatedAt: serverTimestamp()
      });
      
      await batch.commit();
    } catch (error) {
      console.error('Error removing learner:', error);
      throw error;
    }
  },
};

// ==================== TEACHER SERVICE (WITH SUBJECT SUPPORT) ====================

export const teacherService = {
  /**
   * Get all teachers from users collection
   */
  getTeachers: async (): Promise<Teacher[]> => {
    try {
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef,
        where('userType', '==', 'teacher'),
        orderBy('name', 'asc')
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data() as DocumentData;
        return {
          id: doc.id,
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          department: data.department || 'General',
          subjects: data.subjects || [],
          assignedClasses: data.assignedClasses || [],
          isFormTeacher: data.isFormTeacher || false,
          assignedClassId: data.assignedClassId,
          assignedClassName: data.assignedClassName,
          status: data.status || 'active',
          employmentDate: toDate(data.employmentDate) || toDate(data.createdAt) || new Date(),
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
        } as Teacher;
      });
    } catch (error) {
      console.error('Error fetching teachers:', error);
      throw error;
    }
  },

  /**
   * Get teachers assigned to a specific class
   */
  getTeachersByClass: async (classId: string): Promise<Teacher[]> => {
    try {
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef,
        where('userType', '==', 'teacher'),
        where('assignedClasses', 'array-contains', classId),
        orderBy('name', 'asc')
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data() as DocumentData;
        return {
          id: doc.id,
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          department: data.department || 'General',
          subjects: data.subjects || [],
          assignedClasses: data.assignedClasses || [],
          isFormTeacher: data.isFormTeacher || false,
          assignedClassId: data.assignedClassId,
          assignedClassName: data.assignedClassName,
        } as Teacher;
      });
    } catch (error) {
      console.error('Error fetching class teachers:', error);
      throw error;
    }
  },

  /**
   * Get teacher assignments with subject information
   */
  getTeacherAssignments: async (teacherId: string): Promise<Array<{
    id: string;
    teacherId: string;
    classId: string;
    className: string;
    subject: string;
    isFormTeacher: boolean;
  }>> => {
    try {
      const assignmentsRef = collection(db, 'teacher_assignments');
      const q = query(
        assignmentsRef,
        where('teacherId', '==', teacherId)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data() as DocumentData;
        return {
          id: doc.id,
          teacherId: data.teacherId,
          classId: data.classId,
          className: data.className,
          subject: data.subject || '',
          isFormTeacher: data.isFormTeacher || false,
        };
      });
    } catch (error) {
      console.error('Error fetching teacher assignments:', error);
      throw error;
    }
  },

  /**
   * Assign a teacher to a class with a specific subject
   */
  assignTeacherToClass: async (
    teacherId: string, 
    classId: string, 
    subject: string,
    isFormTeacher: boolean = false
  ): Promise<void> => {
    try {
      console.log('Starting teacher assignment:', { teacherId, classId, subject, isFormTeacher });
      
      // Validate subject is provided
      if (!subject || subject.trim() === '') {
        throw new Error('Subject is required when assigning a teacher to a class');
      }
      
      // Get teacher and class data
      const teacherRef = doc(db, 'users', teacherId);
      const teacherDoc = await getDoc(teacherRef);
      
      if (!teacherDoc.exists()) {
        throw new Error('Teacher not found');
      }
      
      const teacherData = teacherDoc.data() as DocumentData;
      
      // Validate that the teacher actually teaches this subject
      const teacherSubjects = teacherData.subjects || [];
      if (!teacherSubjects.includes(subject)) {
        throw new Error(`Teacher does not teach ${subject}. Their subjects are: ${teacherSubjects.join(', ')}`);
      }
      
      const classRef = doc(db, 'classes', classId);
      const classDoc = await getDoc(classRef);
      
      if (!classDoc.exists()) {
        throw new Error('Class not found');
      }
      
      const classData = classDoc.data() as DocumentData;
      
      console.log('Teacher and class data retrieved successfully');
      
      // Check if this teacher is already assigned to this class for a different subject
      const existingAssignmentsRef = collection(db, 'teacher_assignments');
      const existingQuery = query(
        existingAssignmentsRef,
        where('teacherId', '==', teacherId),
        where('classId', '==', classId)
      );
      const existingSnapshot = await getDocs(existingQuery);
      
      if (!existingSnapshot.empty) {
        // Teacher already assigned to this class
        const existingAssignment = existingSnapshot.docs[0];
        const existingData = existingAssignment.data();
        
        if (existingData.subject === subject) {
          // Same subject, just update isFormTeacher if needed
          if (isFormTeacher !== existingData.isFormTeacher) {
            const batch = writeBatch(db);
            batch.update(existingAssignment.ref, {
              isFormTeacher,
              updatedAt: serverTimestamp(),
            });
            
            if (isFormTeacher) {
              batch.update(classRef, {
                formTeacherId: teacherId,
                formTeacherName: teacherData.name,
                updatedAt: serverTimestamp(),
              });
              batch.update(teacherRef, {
                isFormTeacher: true,
                updatedAt: serverTimestamp(),
              });
            }
            
            await batch.commit();
            console.log('Updated existing assignment form teacher status');
          } else {
            console.log('Assignment already exists with same subject');
          }
          return;
        } else {
          throw new Error(`Teacher is already assigned to this class for ${existingData.subject}. Remove the existing assignment first.`);
        }
      }
      
      // Use writeBatch for atomic updates
      const batch = writeBatch(db);
      
      // 1. Create assignment in teacher_assignments collection with SUBJECT
      const assignmentRef = doc(collection(db, 'teacher_assignments'));
      batch.set(assignmentRef, {
        teacherId,
        teacherName: teacherData.name,
        teacherEmail: teacherData.email,
        classId,
        className: classData.name,
        subject,
        isFormTeacher,
        assignedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      console.log('Teacher assignment document queued with subject:', subject);
      
      // 2. Update the class document to track teachers
      batch.update(classRef, {
        teachers: arrayUnion(teacherId),
        ...(isFormTeacher && {
          formTeacherId: teacherId,
          formTeacherName: teacherData.name,
        }),
        updatedAt: serverTimestamp(),
      });
      
      console.log('Class document update queued');
      
      // 3. Update teacher's user document
      batch.update(teacherRef, {
        assignedClasses: arrayUnion(classId),
        assignedClassId: classId,
        assignedClassName: classData.name,
        isFormTeacher: isFormTeacher || teacherData.isFormTeacher || false,
        updatedAt: serverTimestamp(),
      });
      
      console.log('Teacher user document update queued');
      
      // Commit all changes atomically
      await batch.commit();
      console.log('Batch commit successful - teacher assigned with subject!');
      
    } catch (error) {
      console.error('Error in assignTeacherToClass:', error);
      throw error;
    }
  },

  /**
   * Remove a teacher from a class
   */
  removeTeacherFromClass: async (teacherId: string, classId: string): Promise<void> => {
    try {
      console.log('Starting teacher removal:', { teacherId, classId });
      
      // Get teacher data
      const teacherRef = doc(db, 'users', teacherId);
      const teacherDoc = await getDoc(teacherRef);
      
      if (!teacherDoc.exists()) {
        throw new Error('Teacher not found');
      }
      
      const teacherData = teacherDoc.data() as DocumentData;
      
      // Use batch for atomic operations
      const batch = writeBatch(db);
      
      // 1. Remove from teacher_assignments collection
      const assignmentsRef = collection(db, 'teacher_assignments');
      const q = query(
        assignmentsRef,
        where('teacherId', '==', teacherId),
        where('classId', '==', classId)
      );
      
      const assignmentSnapshot = await getDocs(q);
      assignmentSnapshot.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      console.log('Teacher assignment documents queued for deletion');
      
      // 2. Update class document
      const classRef = doc(db, 'classes', classId);
      const classDoc = await getDoc(classRef);
      
      if (classDoc.exists()) {
        const classData = classDoc.data() as DocumentData;
        
        batch.update(classRef, {
          teachers: arrayRemove(teacherId),
          ...(classData.formTeacherId === teacherId && {
            formTeacherId: null,
            formTeacherName: null,
          }),
          updatedAt: serverTimestamp(),
        });
        
        console.log('Class document update queued');
      }
      
      // 3. Update teacher's user document
      batch.update(teacherRef, {
        assignedClasses: arrayRemove(classId),
        ...(teacherData.assignedClassId === classId && {
          assignedClassId: null,
          assignedClassName: null,
          isFormTeacher: false,
        }),
        updatedAt: serverTimestamp(),
      });
      
      console.log('Teacher user document update queued');
      
      // Commit all changes atomically
      await batch.commit();
      console.log('Batch commit successful - teacher removed!');
      
    } catch (error) {
      console.error('Error in removeTeacherFromClass:', error);
      throw error;
    }
  },
};