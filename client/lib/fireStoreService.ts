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
  startAfter,
  QueryDocumentSnapshot,
  DocumentSnapshot
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Class, Learner, Teacher, User } from '@/types/school';

// ==================== LEARNER QUERIES ====================

export const learnerService = {
  // Get all learners in a class
  getLearnersByClass: async (classId: string): Promise<Learner[]> => {
    try {
      const learnersRef = collection(db, 'learners');
      const q = query(
        learnersRef,
        where('classId', '==', classId),
        orderBy('name', 'asc')
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Learner));
    } catch (error) {
      console.error('Error fetching learners:', error);
      throw error;
    }
  },

  // Search learners in a class
  searchLearnersInClass: async (classId: string, searchTerm: string): Promise<Learner[]> => {
    try {
      const learnersRef = collection(db, 'learners');
      const q = query(
        learnersRef,
        where('classId', '==', classId),
        orderBy('name', 'asc')
      );
      
      const snapshot = await getDocs(q);
      const allLearners = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Learner));
      
      // Client-side filtering for search (Firestore doesn't support partial text search without algolia/elastic)
      return allLearners.filter(learner =>
        learner.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        learner.studentId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        learner.parentPhone.includes(searchTerm)
      );
    } catch (error) {
      console.error('Error searching learners:', error);
      throw error;
    }
  },

  // Add individual learner
  addLearner: async (data: {
    name: string;
    age: number;
    parentPhone: string;
    classId: string;
  }): Promise<string> => {
    try {
      // Generate student ID
      const studentId = `STU${Date.now().toString().slice(-6)}`;
      
      const learnerData = {
        ...data,
        studentId,
        enrollmentDate: Timestamp.now(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };
      
      const docRef = await addDoc(collection(db, 'learners'), learnerData);
      
      // Update class student count
      await updateDoc(doc(db, 'classes', data.classId), {
        students: increment(1),
        updatedAt: Timestamp.now()
      });
      
      return docRef.id;
    } catch (error) {
      console.error('Error adding learner:', error);
      throw error;
    }
  },

  // Bulk import learners
  bulkImportLearners: async (classId: string, learnersData: any[]): Promise<{success: number, failed: number}> => {
    const batch = writeBatch(db);
    let success = 0;
    let failed = 0;
    
    try {
      for (const learner of learnersData) {
        try {
          const studentId = `STU${Date.now().toString().slice(-6)}${success}`;
          const learnerRef = doc(collection(db, 'learners'));
          
          batch.set(learnerRef, {
            ...learner,
            studentId,
            classId,
            enrollmentDate: Timestamp.now(),
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
          });
          success++;
        } catch (error) {
          console.error('Error processing learner:', learner, error);
          failed++;
        }
      }
      
      // Update class student count
      const classRef = doc(db, 'classes', classId);
      const classDoc = await getDoc(classRef);
      if (classDoc.exists()) {
        const currentCount = classDoc.data().students || 0;
        batch.update(classRef, {
          students: currentCount + success,
          updatedAt: Timestamp.now()
        });
      }
      
      await batch.commit();
      return { success, failed };
    } catch (error) {
      console.error('Error in bulk import:', error);
      throw error;
    }
  },

  // Transfer learner to another class
  transferLearner: async (
    learnerId: string, 
    fromClassId: string, 
    toClassId: string
  ): Promise<void> => {
    const batch = writeBatch(db);
    
    try {
      // Update learner's class
      const learnerRef = doc(db, 'learners', learnerId);
      batch.update(learnerRef, {
        classId: toClassId,
        updatedAt: Timestamp.now()
      });
      
      // Decrement old class count
      const fromClassRef = doc(db, 'classes', fromClassId);
      const fromClassDoc = await getDoc(fromClassRef);
      if (fromClassDoc.exists()) {
        const currentCount = fromClassDoc.data().students || 0;
        batch.update(fromClassRef, {
          students: Math.max(0, currentCount - 1),
          updatedAt: Timestamp.now()
        });
      }
      
      // Increment new class count
      const toClassRef = doc(db, 'classes', toClassId);
      const toClassDoc = await getDoc(toClassRef);
      if (toClassDoc.exists()) {
        const currentCount = toClassDoc.data().students || 0;
        batch.update(toClassRef, {
          students: currentCount + 1,
          updatedAt: Timestamp.now()
        });
      }
      
      await batch.commit();
    } catch (error) {
      console.error('Error transferring learner:', error);
      throw error;
    }
  },

  // Remove learner from class
  removeLearner: async (learnerId: string, classId: string): Promise<void> => {
    const batch = writeBatch(db);
    
    try {
      // Delete learner
      const learnerRef = doc(db, 'learners', learnerId);
      batch.delete(learnerRef);
      
      // Decrement class count
      const classRef = doc(db, 'classes', classId);
      const classDoc = await getDoc(classRef);
      if (classDoc.exists()) {
        const currentCount = classDoc.data().students || 0;
        batch.update(classRef, {
          students: Math.max(0, currentCount - 1),
          updatedAt: Timestamp.now()
        });
      }
      
      await batch.commit();
    } catch (error) {
      console.error('Error removing learner:', error);
      throw error;
    }
  }
};

// ==================== TEACHER QUERIES ====================

export const teacherService = {
  // Get teachers by class
  getTeachersByClass: async (classId: string): Promise<Teacher[]> => {
    try {
      const teachersRef = collection(db, 'teachers');
      const q = query(
        teachersRef,
        where('assignedClasses', 'array-contains', classId),
        orderBy('name', 'asc')
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Teacher));
    } catch (error) {
      console.error('Error fetching teachers:', error);
      throw error;
    }
  },

  // Search teachers
  searchTeachers: async (searchTerm: string): Promise<Teacher[]> => {
    try {
      const teachersRef = collection(db, 'teachers');
      const q = query(
        teachersRef,
        orderBy('name', 'asc')
      );
      
      const snapshot = await getDocs(q);
      const allTeachers = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Teacher));
      
      // Client-side filtering
      return allTeachers.filter(teacher =>
        teacher.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        teacher.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        teacher.department.toLowerCase().includes(searchTerm.toLowerCase())
      );
    } catch (error) {
      console.error('Error searching teachers:', error);
      throw error;
    }
  },

  // Assign teacher to class
  assignTeacherToClass: async (teacherId: string, classId: string): Promise<void> => {
    try {
      const teacherRef = doc(db, 'teachers', teacherId);
      await updateDoc(teacherRef, {
        assignedClasses: arrayUnion(classId),
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('Error assigning teacher:', error);
      throw error;
    }
  },

  // Remove teacher from class
  removeTeacherFromClass: async (teacherId: string, classId: string): Promise<void> => {
    try {
      const teacherRef = doc(db, 'teachers', teacherId);
      await updateDoc(teacherRef, {
        assignedClasses: arrayRemove(classId),
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('Error removing teacher:', error);
      throw error;
    }
  }
};

// ==================== CLASS QUERIES ====================

export const classService = {
  // Get all classes with filters
  getClasses: async (filters?: {
    year?: number;
    isActive?: boolean;
    type?: 'grade' | 'form';
    searchTerm?: string;
  }): Promise<Class[]> => {
    try {
      const classesRef = collection(db, 'classes');
      let q = query(classesRef, orderBy('year', 'desc'));
      
      // Apply filters
      const constraints = [];
      
      if (filters?.year !== undefined) {
        constraints.push(where('year', '==', filters.year));
      }
      
      if (filters?.isActive !== undefined) {
        constraints.push(where('isActive', '==', filters.isActive));
      }
      
      if (filters?.type) {
        constraints.push(where('type', '==', filters.type));
      }
      
      if (constraints.length > 0) {
        q = query(classesRef, ...constraints, orderBy('year', 'desc'));
      }
      
      const snapshot = await getDocs(q);
      let classes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Class));
      
      // Apply search filter client-side
      if (filters?.searchTerm) {
        classes = classes.filter(cls =>
          cls.name.toLowerCase().includes(filters.searchTerm!.toLowerCase()) ||
          cls.id.toLowerCase().includes(filters.searchTerm!.toLowerCase())
        );
      }
      
      return classes;
    } catch (error) {
      console.error('Error fetching classes:', error);
      throw error;
    }
  },

  // Create new class
  createClass: async (data: {
    name: string;
    year: number;
    type: 'grade' | 'form';
    level: number;
    section: string;
  }): Promise<string> => {
    try {
      const classData = {
        ...data,
        students: 0,
        isActive: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };
      
      const docRef = await addDoc(collection(db, 'classes'), classData);
      return docRef.id;
    } catch (error) {
      console.error('Error creating class:', error);
      throw error;
    }
  },

  // Bulk import classes
  bulkImportClasses: async (classesData: any[]): Promise<{success: number, failed: number}> => {
    const batch = writeBatch(db);
    let success = 0;
    let failed = 0;
    
    try {
      for (const classData of classesData) {
        try {
          const classRef = doc(collection(db, 'classes'));
          batch.set(classRef, {
            ...classData,
            students: 0,
            isActive: true,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
          });
          success++;
        } catch (error) {
          console.error('Error processing class:', classData, error);
          failed++;
        }
      }
      
      await batch.commit();
      return { success, failed };
    } catch (error) {
      console.error('Error in bulk import:', error);
      throw error;
    }
  },

  // Promote class to next year
  promoteClass: async (classId: string, nextYear: number): Promise<string> => {
    const batch = writeBatch(db);
    
    try {
      // Get current class
      const classRef = doc(db, 'classes', classId);
      const classDoc = await getDoc(classRef);
      
      if (!classDoc.exists()) {
        throw new Error('Class not found');
      }
      
      const currentClass = classDoc.data() as Class;
      
      // Check if class already exists for next year
      const classesRef = collection(db, 'classes');
      const q = query(
        classesRef,
        where('year', '==', nextYear),
        where('type', '==', currentClass.type),
        where('level', '==', currentClass.level),
        where('section', '==', currentClass.section)
      );
      
      const existingClasses = await getDocs(q);
      
      if (!existingClasses.empty) {
        throw new Error(`Class ${currentClass.name} already exists for year ${nextYear}`);
      }
      
      // Create new class for next year
      const newClassRef = doc(collection(db, 'classes'));
      const newClassName = `${currentClass.type === 'grade' ? 'Grade' : 'Form'} ${currentClass.level}${currentClass.section} - ${nextYear}`;
      
      batch.set(newClassRef, {
        name: newClassName,
        year: nextYear,
        type: currentClass.type,
        level: currentClass.level,
        section: currentClass.section,
        students: 0,
        isActive: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      
      // Get all learners in current class
      const learnersRef = collection(db, 'learners');
      const learnersQuery = query(
        learnersRef,
        where('classId', '==', classId)
      );
      
      const learnersSnapshot = await getDocs(learnersQuery);
      
      // Transfer all learners to new class
      learnersSnapshot.docs.forEach(learnerDoc => {
        const learnerRef = doc(db, 'learners', learnerDoc.id);
        batch.update(learnerRef, {
          classId: newClassRef.id,
          updatedAt: Timestamp.now()
        });
      });
      
      // Update new class student count
      batch.update(newClassRef, {
        students: learnersSnapshot.size,
        updatedAt: Timestamp.now()
      });
      
      // Archive old class
      batch.update(classRef, {
        isActive: false,
        updatedAt: Timestamp.now()
      });
      
      await batch.commit();
      
      return newClassRef.id;
    } catch (error) {
      console.error('Error promoting class:', error);
      throw error;
    }
  },

  // Archive class
  archiveClass: async (classId: string): Promise<void> => {
    try {
      const classRef = doc(db, 'classes', classId);
      await updateDoc(classRef, {
        isActive: false,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('Error archiving class:', error);
      throw error;
    }
  },

  // Delete class (only if empty)
  deleteClass: async (classId: string): Promise<void> => {
    try {
      // Check if class has learners
      const learnersRef = collection(db, 'learners');
      const q = query(learnersRef, where('classId', '==', classId), limit(1));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        throw new Error('Cannot delete class with learners. Remove all learners first.');
      }
      
      const classRef = doc(db, 'classes', classId);
      await deleteDoc(classRef);
    } catch (error) {
      console.error('Error deleting class:', error);
      throw error;
    }
  }
};

// ==================== UTILITY FUNCTIONS ====================

// Increment helper for Firestore
const increment = (n: number) => ({
  increment: n
});

// Helper to parse class name
export const parseClassName = (name: string): { type: 'grade' | 'form', level: number, section: string } => {
  const match = name.match(/(Grade|Form)\s*(\d+)([A-Za-z]*)/i);
  
  if (match) {
    const type = match[1].toLowerCase() === 'grade' ? 'grade' : 'form';
    const level = parseInt(match[2]);
    const section = match[3] || 'A';
    
    return { type, level, section };
  }
  
  // Default values if parsing fails
  return {
    type: 'grade',
    level: 1,
    section: 'A'
  };
};