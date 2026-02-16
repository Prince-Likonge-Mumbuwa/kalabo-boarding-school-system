// @/services/schoolService.ts - ENHANCED WITH GENDER SUPPORT
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
import { 
  Class, 
  Learner, 
  Teacher, 
  DashboardStats, 
  ClassCSVImportData, 
  CSVImportData,
  CSVLearnerData,
  TeacherAssignment,
  GenderStats,
  GenderUpdate,
  GradeDistribution,
  ClassPerformance,
  SubjectPerformance
} from '@/types/school';

// ==================== IMPORT NORMALIZATION UTILITY ====================
import { normalizeSubjectName } from './resultsService';

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
const parseClassName = (name: string): { type: 'grade' | 'form'; level: number; section: string } => {
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
const generateStudentId = (): string => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `STU${timestamp}${random}`;
};

/**
 * Calculate gender statistics from learners array
 */
const calculateGenderStats = (learners: Learner[]): GenderStats => {
  const boys = learners.filter(l => l.gender === 'male').length;
  const girls = learners.filter(l => l.gender === 'female').length;
  const unspecified = learners.filter(l => !l.gender).length;
  const total = learners.length;
  
  return {
    boys,
    girls,
    unspecified,
    total,
    boysPercentage: total > 0 ? Math.round((boys / total) * 100) : 0,
    girlsPercentage: total > 0 ? Math.round((girls / total) * 100) : 0,
  };
};

// ==================== CLASS SERVICE ====================

const classService = {
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
      const constraints: any[] = [];

      if (filters?.year !== undefined) {
        constraints.push(where('year', '==', filters.year));
      }
      if (filters?.type) {
        constraints.push(where('type', '==', filters.type));
      }
      if (filters?.isActive !== undefined) {
        constraints.push(where('isActive', '==', filters.isActive));
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
      const classes = await Promise.all(snapshot.docs.map(async doc => {
        const data = doc.data() as DocumentData;
        
        // Get gender stats for this class
        const learners = await learnerService.getLearnersByClass(doc.id);
        const genderStats = calculateGenderStats(learners);
        
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
          genderStats,
          createdDate: toDate(data.createdDate) || new Date(),
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
        } as Class;
      }));

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
      
      // Get gender stats for this class
      const learners = await learnerService.getLearnersByClass(classId);
      const genderStats = calculateGenderStats(learners);
      
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
        genderStats,
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
  bulkImportClasses: async (classesData: ClassCSVImportData[]): Promise<{ success: number; failed: number; errors: string[] }> => {
    const classesRef = collection(db, 'classes');
    const toImport: any[] = [];
    let success = 0;
    let failed = 0;
    const errors: string[] = [];
    
    try {
      for (const [index, classData] of classesData.entries()) {
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
            errors.push(`Row ${index + 2}: Class ${classData.name} already exists for year ${year}`);
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
          errors.push(`Row ${index + 2}: ${error.message}`);
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
      
      return { success, failed, errors };
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
   * Get dashboard statistics with gender stats
   */
  getDashboardStats: async (): Promise<DashboardStats> => {
    try {
      const classes = await classService.getClasses({ isActive: true });
      
      // Get all learners for gender stats
      const allLearners = await learnerService.getAllLearners();
      const genderStats = calculateGenderStats(allLearners);
      
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
        genderStats: {
          totalBoys: genderStats.boys,
          totalGirls: genderStats.girls,
          unspecified: genderStats.unspecified,
          boysPercentage: genderStats.boysPercentage,
          girlsPercentage: genderStats.girlsPercentage,
        },
      };
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      throw error;
    }
  },

  /**
   * Get teacher assignments by class with normalized subjects
   */
  getTeacherAssignmentsByClass: async (classId: string): Promise<TeacherAssignment[]> => {
    try {
      const assignmentsRef = collection(db, 'teacher_assignments');
      const q = query(
        assignmentsRef,
        where('classId', '==', classId)
      );
      
      const snapshot = await getDocs(q);
      const assignments = snapshot.docs.map(doc => {
        const data = doc.data() as DocumentData;
        const subject = data.subject || '';
        const normalizedSubject = normalizeSubjectName(subject);
        
        return {
          id: doc.id,
          teacherId: data.teacherId,
          teacherName: data.teacherName || '',
          teacherEmail: data.teacherEmail,
          classId: data.classId,
          className: data.className || '',
          subject: subject,
          normalizedSubjectId: normalizedSubject,
          isFormTeacher: data.isFormTeacher || false,
          assignedAt: toDate(data.assignedAt),
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
        } as TeacherAssignment;
      });
      
      console.log(`📚 Found ${assignments.length} teacher assignments for class ${classId}`);
      return assignments;
    } catch (error) {
      console.error('Error fetching teacher assignments by class:', error);
      return [];
    }
  },

  /**
   * Get gender statistics for a class
   */
  getClassGenderStats: async (classId: string): Promise<GenderStats> => {
    try {
      const learners = await learnerService.getLearnersByClass(classId);
      return calculateGenderStats(learners);
    } catch (error) {
      console.error('Error getting class gender stats:', error);
      return { boys: 0, girls: 0, unspecified: 0, total: 0, boysPercentage: 0, girlsPercentage: 0 };
    }
  },
};

// ==================== LEARNER SERVICE WITH GENDER SUPPORT ====================

const learnerService = {
  /**
   * Get all learners for a specific class
   */
  getLearnersByClass: async (classId: string): Promise<Learner[]> => {
    try {
      const learnersRef = collection(db, 'learners');
      const q = query(
        learnersRef,
        where('classId', '==', classId),
        where('status', '==', 'active'),
        orderBy('name', 'asc')
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data() as DocumentData;
        return {
          id: doc.id,
          name: data.name || '',
          age: data.age || 0,
          gender: data.gender,
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
   * Get all learners across all classes (for admin)
   */
  getAllLearners: async (): Promise<Learner[]> => {
    try {
      const learnersRef = collection(db, 'learners');
      const q = query(
        learnersRef,
        where('status', '==', 'active'),
        orderBy('name', 'asc')
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data() as DocumentData;
        return {
          id: doc.id,
          name: data.name || '',
          age: data.age || 0,
          gender: data.gender,
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
      console.error('Error fetching all learners:', error);
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
   * Add a single learner to a class with gender
   */
  addLearner: async (data: {
    name: string;
    age: number;
    gender: 'male' | 'female';
    parentPhone: string;
    classId: string;
  }): Promise<string> => {
    const batch = writeBatch(db);
    
    try {
      // Validate gender
      if (!data.gender) {
        throw new Error('Gender is required');
      }
      
      // Generate unique student ID
      const studentId = generateStudentId();
      
      // Get class name
      const classDoc = await getDoc(doc(db, 'classes', data.classId));
      const className = classDoc.exists() ? classDoc.data().name : '';
      
      // Create learner document
      const learnerRef = doc(collection(db, 'learners'));
      batch.set(learnerRef, {
        name: data.name,
        age: data.age,
        gender: data.gender,
        parentPhone: data.parentPhone,
        studentId,
        classId: data.classId,
        className,
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
      
      console.log(`✅ Added learner ${data.name} (${data.gender}) to class ${className}`);
      return learnerRef.id;
    } catch (error) {
      console.error('Error adding learner:', error);
      throw error;
    }
  },

  /**
   * Bulk import learners from CSV data with gender
   */
  bulkImportLearners: async (classId: string, learnersData: CSVLearnerData[]): Promise<{ success: number; failed: number; errors: string[] }> => {
    const batch = writeBatch(db);
    let success = 0;
    let failed = 0;
    const errors: string[] = [];
    
    try {
      // Get class name
      const classDoc = await getDoc(doc(db, 'classes', classId));
      const className = classDoc.exists() ? classDoc.data().name : '';
      
      for (const [index, learner] of learnersData.entries()) {
        try {
          // Validate required fields including gender
          if (!learner.name) {
            throw new Error('Name is required');
          }
          if (!learner.age) {
            throw new Error('Age is required');
          }
          if (!learner.gender) {
            throw new Error('Gender is required (must be "male" or "female")');
          }
          if (!learner.parentPhone) {
            throw new Error('Parent phone is required');
          }
          
          // Validate gender value
          if (learner.gender !== 'male' && learner.gender !== 'female') {
            throw new Error(`Invalid gender "${learner.gender}". Must be "male" or "female"`);
          }
          
          const studentId = generateStudentId();
          const learnerRef = doc(collection(db, 'learners'));
          
          batch.set(learnerRef, {
            name: learner.name,
            age: Number(learner.age),
            gender: learner.gender,
            parentPhone: learner.parentPhone,
            studentId,
            classId,
            className,
            status: 'active',
            enrollmentDate: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          success++;
        } catch (error) {
          console.error(`Error processing learner at row ${index + 2}:`, learner, error);
          failed++;
          errors.push(`Row ${index + 2}: ${error.message}`);
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
      console.log(`✅ Bulk import completed: ${success} succeeded, ${failed} failed`);
      return { success, failed, errors };
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
      // Get target class name
      const toClassDoc = await getDoc(doc(db, 'classes', toClassId));
      const toClassName = toClassDoc.exists() ? toClassDoc.data().name : '';
      
      // Update learner document
      const learnerRef = doc(db, 'learners', learnerId);
      batch.update(learnerRef, {
        classId: toClassId,
        className: toClassName,
        status: 'active',
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
      console.log(`✅ Transferred learner ${learnerId} to class ${toClassName}`);
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
      console.log(`✅ Removed learner ${learnerId} from class ${classId}`);
    } catch (error) {
      console.error('Error removing learner:', error);
      throw error;
    }
  },

  /**
   * Update learner gender (for fixing existing records)
   */
  updateLearnerGender: async (learnerId: string, gender: 'male' | 'female'): Promise<void> => {
    try {
      const learnerRef = doc(db, 'learners', learnerId);
      await updateDoc(learnerRef, {
        gender,
        updatedAt: serverTimestamp()
      });
      console.log(`✅ Updated gender for learner ${learnerId} to ${gender}`);
    } catch (error) {
      console.error('Error updating learner gender:', error);
      throw error;
    }
  },

  /**
   * Bulk update genders (for migration)
   */
  bulkUpdateGenders: async (updates: GenderUpdate[]): Promise<void> => {
    const batch = writeBatch(db);
    
    updates.forEach(({ learnerId, newGender }) => {
      const learnerRef = doc(db, 'learners', learnerId);
      batch.update(learnerRef, { 
        gender: newGender, 
        updatedAt: serverTimestamp() 
      });
    });
    
    await batch.commit();
    console.log(`✅ Bulk updated ${updates.length} learner genders`);
  },

  /**
   * Get gender statistics for a class
   */
  getGenderStats: async (classId: string): Promise<GenderStats> => {
    try {
      const learners = await learnerService.getLearnersByClass(classId);
      return calculateGenderStats(learners);
    } catch (error) {
      console.error('Error getting gender stats:', error);
      return { boys: 0, girls: 0, unspecified: 0, total: 0, boysPercentage: 0, girlsPercentage: 0 };
    }
  },

  /**
   * Get learners missing gender information
   */
  getLearnersMissingGender: async (classId?: string): Promise<Learner[]> => {
    try {
      let q;
      const learnersRef = collection(db, 'learners');
      
      if (classId) {
        q = query(
          learnersRef,
          where('classId', '==', classId),
          where('gender', '==', null),
          where('status', '==', 'active')
        );
      } else {
        q = query(
          learnersRef,
          where('gender', '==', null),
          where('status', '==', 'active')
        );
      }
      
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
        } as Learner;
      });
    } catch (error) {
      console.error('Error fetching learners missing gender:', error);
      return [];
    }
  },
};

// ==================== TEACHER SERVICE (WITH SUBJECT NORMALIZATION) ====================

const teacherService = {
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
   * Get teacher assignments for a specific teacher
   */
  getTeacherAssignments: async (teacherId: string): Promise<TeacherAssignment[]> => {
    try {
      const assignmentsRef = collection(db, 'teacher_assignments');
      const q = query(
        assignmentsRef,
        where('teacherId', '==', teacherId)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data() as DocumentData;
        const subject = data.subject || '';
        const normalizedSubject = normalizeSubjectName(subject);
        
        return {
          id: doc.id,
          teacherId: data.teacherId,
          teacherName: data.teacherName || '',
          teacherEmail: data.teacherEmail,
          classId: data.classId,
          className: data.className || '',
          subject: subject,
          normalizedSubjectId: normalizedSubject,
          isFormTeacher: data.isFormTeacher || false,
          assignedAt: toDate(data.assignedAt),
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
        } as TeacherAssignment;
      });
    } catch (error) {
      console.error('Error fetching teacher assignments:', error);
      throw error;
    }
  },

  /**
   * Get all teacher assignments across all classes
   */
  getAllTeacherAssignments: async (): Promise<TeacherAssignment[]> => {
    try {
      const assignmentsRef = collection(db, 'teacher_assignments');
      const snapshot = await getDocs(assignmentsRef);
      
      return snapshot.docs.map(doc => {
        const data = doc.data() as DocumentData;
        const subject = data.subject || '';
        const normalizedSubject = normalizeSubjectName(subject);
        
        return {
          id: doc.id,
          teacherId: data.teacherId,
          teacherName: data.teacherName || '',
          teacherEmail: data.teacherEmail,
          classId: data.classId,
          className: data.className || '',
          subject: subject,
          normalizedSubjectId: normalizedSubject,
          isFormTeacher: data.isFormTeacher || false,
          assignedAt: toDate(data.assignedAt),
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
        } as TeacherAssignment;
      });
    } catch (error) {
      console.error('Error fetching all teacher assignments:', error);
      return [];
    }
  },

  /**
   * Get teacher assignments filtered by class
   */
  getTeacherAssignmentsByClass: async (classId: string): Promise<TeacherAssignment[]> => {
    return classService.getTeacherAssignmentsByClass(classId);
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
      
      // Normalize subject name for validation
      const normalizedSubject = normalizeSubjectName(subject);
      console.log(`Normalized subject: ${subject} → ${normalizedSubject}`);
      
      // Get teacher and class data
      const teacherRef = doc(db, 'users', teacherId);
      const teacherDoc = await getDoc(teacherRef);
      
      if (!teacherDoc.exists()) {
        throw new Error('Teacher not found');
      }
      
      const teacherData = teacherDoc.data() as DocumentData;
      
      // Validate that the teacher actually teaches this subject (using normalized comparison)
      const teacherSubjects = (teacherData.subjects || []).map((s: string) => normalizeSubjectName(s));
      if (!teacherSubjects.includes(normalizedSubject)) {
        throw new Error(`Teacher does not teach ${subject} (normalized: ${normalizedSubject}). Their subjects are: ${teacherData.subjects.join(', ')}`);
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
        const existingNormalizedSubject = normalizeSubjectName(existingData.subject || '');
        
        if (existingNormalizedSubject === normalizedSubject) {
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
      
      // 1. Create assignment in teacher_assignments collection with normalized subject
      const assignmentRef = doc(collection(db, 'teacher_assignments'));
      batch.set(assignmentRef, {
        teacherId,
        teacherName: teacherData.name,
        teacherEmail: teacherData.email,
        classId,
        className: classData.name,
        subject, // Store original subject name
        normalizedSubject, // Store normalized subject ID for matching
        isFormTeacher,
        assignedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      console.log('Teacher assignment document queued with subject:', subject, '(normalized:', normalizedSubject, ')');
      
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

// ==================== RESULTS ANALYSIS SERVICE (NEW) ====================

const resultsAnalysisService = {
  /**
   * Get grade distribution for a class with gender breakdown
   */
  getGradeDistribution: async (classId: string, examType: string = 'endOfTerm'): Promise<GradeDistribution[]> => {
    try {
      const resultsRef = collection(db, 'results');
      const q = query(
        resultsRef,
        where('classId', '==', classId),
        where('examType', '==', examType),
        where('grade', '>', 0)
      );
      
      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(doc => doc.data());
      
      const gradeMap = new Map<number, { boys: number; girls: number }>();
      
      // Initialize grades 1-9
      for (let i = 1; i <= 9; i++) {
        gradeMap.set(i, { boys: 0, girls: 0 });
      }
      
      // Count by gender
      results.forEach(result => {
        const current = gradeMap.get(result.grade) || { boys: 0, girls: 0 };
        if (result.studentGender === 'male') {
          gradeMap.set(result.grade, { ...current, boys: current.boys + 1 });
        } else {
          gradeMap.set(result.grade, { ...current, girls: current.girls + 1 });
        }
      });
      
      const total = results.length;
      
      const distribution: GradeDistribution[] = Array.from(gradeMap.entries())
        .map(([grade, counts]) => {
          let passStatus: 'distinction' | 'merit' | 'credit' | 'satisfactory' | 'fail';
          
          if (grade <= 2) passStatus = 'distinction';
          else if (grade <= 4) passStatus = 'merit';
          else if (grade <= 6) passStatus = 'credit';
          else if (grade <= 8) passStatus = 'satisfactory';
          else passStatus = 'fail';
          
          return {
            grade,
            boys: counts.boys,
            girls: counts.girls,
            total: counts.boys + counts.girls,
            percentage: total > 0 ? Math.round(((counts.boys + counts.girls) / total) * 100) : 0,
            passStatus
          };
        })
        .filter(g => g.total > 0);
      
      return distribution;
    } catch (error) {
      console.error('Error getting grade distribution:', error);
      return [];
    }
  },

  /**
   * Get class performance with gender breakdown
   */
  getClassPerformance: async (classId: string, term: string, year: number): Promise<ClassPerformance | null> => {
    try {
      const resultsRef = collection(db, 'results');
      const q = query(
        resultsRef,
        where('classId', '==', classId),
        where('term', '==', term),
        where('year', '==', year),
        where('examType', '==', 'endOfTerm')
      );
      
      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(doc => doc.data());
      
      if (results.length === 0) return null;
      
      // Get learners for this class to know total candidates
      const learners = await learnerService.getLearnersByClass(classId);
      const candidates = {
        boys: learners.filter(l => l.gender === 'male').length,
        girls: learners.filter(l => l.gender === 'female').length,
        total: learners.length
      };
      
      // SAT counts
      const sat = {
        boys: results.filter(r => r.studentGender === 'male').length,
        girls: results.filter(r => r.studentGender === 'female').length,
        total: results.length
      };
      
      // Get grade distribution
      const gradeDistribution = await resultsAnalysisService.getGradeDistribution(classId, 'endOfTerm');
      
      // Calculate performance metrics
      const qualityResults = results.filter(r => r.grade <= 6);
      const quantityResults = results.filter(r => r.grade <= 8);
      const failResults = results.filter(r => r.grade === 9);
      
      const performance = {
        quality: {
          boys: qualityResults.filter(r => r.studentGender === 'male').length,
          girls: qualityResults.filter(r => r.studentGender === 'female').length,
          total: qualityResults.length,
          percentage: results.length > 0 ? Math.round((qualityResults.length / results.length) * 100) : 0
        },
        quantity: {
          boys: quantityResults.filter(r => r.studentGender === 'male').length,
          girls: quantityResults.filter(r => r.studentGender === 'female').length,
          total: quantityResults.length,
          percentage: results.length > 0 ? Math.round((quantityResults.length / results.length) * 100) : 0
        },
        fail: {
          boys: failResults.filter(r => r.studentGender === 'male').length,
          girls: failResults.filter(r => r.studentGender === 'female').length,
          total: failResults.length,
          percentage: results.length > 0 ? Math.round((failResults.length / results.length) * 100) : 0
        }
      };
      
      // Get subject performance
      const subjectMap = new Map<string, { teacher: string; grades: number[] }>();
      results.forEach(r => {
        if (!subjectMap.has(r.subject)) {
          subjectMap.set(r.subject, { teacher: r.teacherName || 'Unknown', grades: [] });
        }
        subjectMap.get(r.subject)!.grades.push(r.grade);
      });
      
      const subjectPerformance = Array.from(subjectMap.entries()).map(([subject, data]) => {
        const total = data.grades.length;
        const quality = data.grades.filter(g => g <= 6).length;
        const quantity = data.grades.filter(g => g <= 8).length;
        const fail = data.grades.filter(g => g === 9).length;
        
        return {
          subject,
          teacher: data.teacher,
          quality: Math.round((quality / total) * 100),
          quantity: Math.round((quantity / total) * 100),
          fail: Math.round((fail / total) * 100)
        };
      });
      
      const classDoc = await getDoc(doc(db, 'classes', classId));
      const className = classDoc.exists() ? classDoc.data().name : classId;
      
      return {
        classId,
        className,
        candidates,
        sat,
        gradeDistribution,
        performance,
        subjectPerformance
      };
    } catch (error) {
      console.error('Error getting class performance:', error);
      return null;
    }
  },

  /**
   * Get subject performance across school
   */
  getSubjectPerformance: async (term: string, year: number): Promise<SubjectPerformance[]> => {
    try {
      const resultsRef = collection(db, 'results');
      const q = query(
        resultsRef,
        where('term', '==', term),
        where('year', '==', year),
        where('examType', '==', 'endOfTerm')
      );
      
      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(doc => doc.data());
      
      const subjectMap = new Map<string, {
        teacher: string;
        classes: Set<string>;
        students: Set<string>;
        grades: number[];
      }>();
      
      results.forEach(result => {
        if (!subjectMap.has(result.subject)) {
          subjectMap.set(result.subject, {
            teacher: result.teacherName || 'Unknown',
            classes: new Set(),
            students: new Set(),
            grades: []
          });
        }
        const data = subjectMap.get(result.subject)!;
        data.classes.add(result.classId);
        data.students.add(result.studentId);
        data.grades.push(result.grade);
      });
      
      return Array.from(subjectMap.entries()).map(([subject, data]) => {
        const total = data.grades.length;
        const quality = data.grades.filter(g => g <= 6).length;
        const quantity = data.grades.filter(g => g <= 8).length;
        const fail = data.grades.filter(g => g === 9).length;
        const averageGrade = data.grades.reduce((sum, g) => sum + g, 0) / total;
        
        return {
          subject,
          teacher: data.teacher,
          classCount: data.classes.size,
          studentCount: data.students.size,
          averageGrade: Math.round(averageGrade * 10) / 10,
          qualityRate: Math.round((quality / total) * 100),
          quantityRate: Math.round((quantity / total) * 100),
          failRate: Math.round((fail / total) * 100)
        };
      }).sort((a, b) => a.failRate - b.failRate);
    } catch (error) {
      console.error('Error getting subject performance:', error);
      return [];
    }
  }
};

// ==================== EXPORT ALL SERVICES ====================
export {
  classService,
  learnerService,
  teacherService,
  resultsAnalysisService,
  normalizeSubjectName,
  parseClassName,
  generateStudentId,
  calculateGenderStats,
  toDate,
};