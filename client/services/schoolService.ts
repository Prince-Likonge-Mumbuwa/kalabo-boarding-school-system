// @/services/schoolService.ts - COMPREHENSIVE UPDATE WITH TEACHER MANAGEMENT METHODS
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
 * Generate class prefix based on class type and level
 * Grade 10B → G10B
 * Form 3A → F3A
 */
export const generateClassPrefix = (classType: 'grade' | 'form', level: number, section: string): string => {
  const typePrefix = classType === 'grade' ? 'G' : 'F';
  return `${typePrefix}${level}${section}`.toUpperCase();
};

/**
 * Generate sequential student ID for a class
 * Format: [PREFIX]_[3-DIGIT SEQUENTIAL]
 * Example: G10B_001, G10B_002
 */
export const generateSequentialStudentId = async (
  classId: string,
  classType: 'grade' | 'form',
  level: number,
  section: string
): Promise<{ studentId: string; nextIndex: number }> => {
  try {
    const learnersRef = collection(db, 'learners');
    const q = query(
      learnersRef,
      where('classId', '==', classId),
      orderBy('studentIndex', 'desc'),
      limit(1)
    );

    const snapshot = await getDocs(q);
    let nextIndex = 1;

    if (!snapshot.empty) {
      const lastLearner = snapshot.docs[0].data();
      nextIndex = (lastLearner.studentIndex || 0) + 1;
    }

    const prefix = generateClassPrefix(classType, level, section);
    const indexStr = nextIndex.toString().padStart(3, '0');
    const studentId = `${prefix}_${indexStr}`;

    return { studentId, nextIndex };
  } catch (error) {
    console.error('Error generating sequential student ID:', error);
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return {
      studentId: `TMP${timestamp}${random}`,
      nextIndex: 0
    };
  }
};

/**
 * Legacy generate unique student ID (kept for backward compatibility)
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

/**
 * Calculate age from birth year
 */
const calculateAge = (birthYear: number): number => {
  const currentYear = new Date().getFullYear();
  return currentYear - birthYear;
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
      const classes = await Promise.all(snapshot.docs.map(async docSnapshot => {
        const data = docSnapshot.data() as DocumentData;
        const learners = await learnerService.getLearnersByClass(docSnapshot.id);
        const genderStats = calculateGenderStats(learners);

        return {
          id: docSnapshot.id,
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

  getClassById: async (classId: string): Promise<Class | null> => {
    try {
      const classRef = doc(db, 'classes', classId);
      const classDoc = await getDoc(classRef);

      if (!classDoc.exists()) return null;

      const data = classDoc.data() as DocumentData;
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

  createClass: async (data: {
    name: string;
    year: number;
    type: 'grade' | 'form';
    level: number;
    section: string;
  }): Promise<string> => {
    try {
      const { name, year, type, level, section } = data;

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

  deleteClass: async (classId: string): Promise<void> => {
    try {
      const learners = await learnerService.getLearnersByClass(classId);

      if (learners.length > 0) {
        throw new Error(`Cannot delete class with ${learners.length} learners. Please delete or transfer all learners first.`);
      }

      const assignments = await classService.getTeacherAssignmentsByClass(classId);

      if (assignments.length > 0) {
        const batch = writeBatch(db);

        for (const assignment of assignments) {
          const assignmentRef = doc(db, 'teacher_assignments', assignment.id);
          batch.delete(assignmentRef);
        }

        for (const assignment of assignments) {
          const teacherRef = doc(db, 'users', assignment.teacherId);
          batch.update(teacherRef, {
            assignedClasses: arrayRemove(classId),
            updatedAt: serverTimestamp()
          });
        }

        await batch.commit();
      }

      const classRef = doc(db, 'classes', classId);
      await deleteDoc(classRef);

      console.log(`✅ Class ${classId} permanently deleted`);
    } catch (error) {
      console.error('Error deleting class:', error);
      throw error;
    }
  },

  getDashboardStats: async (): Promise<DashboardStats> => {
    try {
      const classes = await classService.getClasses({ isActive: true });
      const allLearners = await learnerService.getAllLearners();
      const genderStats = calculateGenderStats(allLearners);

      const usersRef = collection(db, 'users');
      const teachersQuery = query(usersRef, where('userType', '==', 'teacher'));
      const teachersSnapshot = await getDocs(teachersQuery);

      const teachers = teachersSnapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data() as DocumentData;
        return {
          id: docSnapshot.id,
          name: data.fullName || data.name || '',
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

  getTeacherAssignmentsByClass: async (classId: string): Promise<TeacherAssignment[]> => {
    try {
      const assignmentsRef = collection(db, 'teacher_assignments');
      const q = query(assignmentsRef, where('classId', '==', classId));

      const snapshot = await getDocs(q);
      const assignments = snapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data() as DocumentData;
        const subject = data.subject || '';
        const normalizedSubject = normalizeSubjectName(subject);

        return {
          id: docSnapshot.id,
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

// ==================== LEARNER SERVICE WITH ENHANCED FIELDS ====================

const learnerService = {
  /**
   * Get all learners for a specific class with enhanced fields
   */
  getLearnersByClass: async (classId: string): Promise<Learner[]> => {
    try {
      const learnersRef = collection(db, 'learners');
      const q = query(
        learnersRef,
        where('classId', '==', classId),
        where('status', '==', 'active'),
        orderBy('studentIndex', 'asc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data() as DocumentData;
        return {
          id: docSnapshot.id,
          studentId: data.studentId || '',
          studentIndex: data.studentIndex || 0,
          classPrefix: data.classPrefix || '',
          fullName: data.fullName || data.name || '',
          birthYear: data.birthYear || 0,
          age: data.age || calculateAge(data.birthYear || 0),
          gender: data.gender,
          address: data.address || '',
          guardian: data.guardian || '',
          guardianPhone: data.guardianPhone || data.parentPhone || '',
          alternativeGuardian: data.alternativeGuardian,
          alternativeGuardianPhone: data.alternativeGuardianPhone,
          sponsor: data.sponsor || '',
          classId: data.classId || '',
          className: data.className || '',
          classType: data.classType,
          classLevel: data.classLevel,
          classSection: data.classSection,
          dateOfFirstEntry: data.dateOfFirstEntry || '',
          enrollmentDate: toDate(data.enrollmentDate) || new Date(),
          previousSchool: data.previousSchool,
          medicalNotes: data.medicalNotes,
          allergies: data.allergies || [],
          status: data.status || 'active',
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
          name: data.fullName || data.name || '',
          parentPhone: data.guardianPhone || data.parentPhone || '',
        } as Learner;
      });
    } catch (error) {
      console.error('Error fetching learners:', error);
      throw error;
    }
  },

  getAllLearners: async (): Promise<Learner[]> => {
    try {
      const learnersRef = collection(db, 'learners');
      const q = query(
        learnersRef,
        where('status', '==', 'active'),
        orderBy('fullName', 'asc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data() as DocumentData;
        return {
          id: docSnapshot.id,
          studentId: data.studentId || '',
          studentIndex: data.studentIndex || 0,
          classPrefix: data.classPrefix || '',
          fullName: data.fullName || data.name || '',
          birthYear: data.birthYear || 0,
          age: data.age || calculateAge(data.birthYear || 0),
          gender: data.gender,
          address: data.address || '',
          guardian: data.guardian || '',
          guardianPhone: data.guardianPhone || data.parentPhone || '',
          alternativeGuardian: data.alternativeGuardian,
          alternativeGuardianPhone: data.alternativeGuardianPhone,
          sponsor: data.sponsor || '',
          classId: data.classId || '',
          className: data.className || '',
          classType: data.classType,
          classLevel: data.classLevel,
          classSection: data.classSection,
          dateOfFirstEntry: data.dateOfFirstEntry || '',
          enrollmentDate: toDate(data.enrollmentDate) || new Date(),
          previousSchool: data.previousSchool,
          medicalNotes: data.medicalNotes,
          allergies: data.allergies || [],
          status: data.status || 'active',
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
          name: data.fullName || data.name || '',
          parentPhone: data.guardianPhone || data.parentPhone || '',
        } as Learner;
      });
    } catch (error) {
      console.error('Error fetching all learners:', error);
      throw error;
    }
  },

  searchLearnersInClass: async (classId: string, searchTerm: string): Promise<Learner[]> => {
    try {
      const learners = await learnerService.getLearnersByClass(classId);
      const searchLower = searchTerm.toLowerCase();
      return learners.filter(learner =>
        learner.fullName.toLowerCase().includes(searchLower) ||
        learner.studentId.toLowerCase().includes(searchLower) ||
        learner.guardianPhone.includes(searchTerm) ||
        learner.guardian.toLowerCase().includes(searchLower) ||
        learner.sponsor.toLowerCase().includes(searchLower)
      );
    } catch (error) {
      console.error('Error searching learners:', error);
      throw error;
    }
  },

  getFilteredLearners: async (filters: {
    classId?: string;
    searchTerm?: string;
    gender?: 'male' | 'female';
    sponsor?: string;
    birthYearFrom?: number;
    birthYearTo?: number;
    status?: string;
  }): Promise<Learner[]> => {
    try {
      let learners: Learner[] = [];

      if (filters.classId) {
        learners = await learnerService.getLearnersByClass(filters.classId);
      } else {
        learners = await learnerService.getAllLearners();
      }

      return learners.filter(learner => {
        if (filters.gender && learner.gender !== filters.gender) return false;
        if (filters.sponsor && !learner.sponsor.toLowerCase().includes(filters.sponsor.toLowerCase())) return false;
        if (filters.birthYearFrom && learner.birthYear < filters.birthYearFrom) return false;
        if (filters.birthYearTo && learner.birthYear > filters.birthYearTo) return false;
        if (filters.status && learner.status !== filters.status) return false;

        if (filters.searchTerm) {
          const searchLower = filters.searchTerm.toLowerCase();
          return (
            learner.fullName.toLowerCase().includes(searchLower) ||
            learner.studentId.toLowerCase().includes(searchLower) ||
            learner.guardian.toLowerCase().includes(searchLower) ||
            learner.guardianPhone.includes(filters.searchTerm!) ||
            learner.sponsor.toLowerCase().includes(searchLower)
          );
        }

        return true;
      });
    } catch (error) {
      console.error('Error filtering learners:', error);
      throw error;
    }
  },

  addLearner: async (data: {
    fullName: string;
    address: string;
    dateOfFirstEntry: string;
    gender: 'male' | 'female';
    guardian: string;
    sponsor: string;
    guardianPhone: string;
    birthYear: number;
    classId: string;
    preferredName?: string;
    alternativeGuardian?: string;
    alternativeGuardianPhone?: string;
    previousSchool?: string;
    medicalNotes?: string;
    allergies?: string[];
  }): Promise<{ learnerId: string; studentId: string }> => {
    const batch = writeBatch(db);

    try {
      const classDoc = await getDoc(doc(db, 'classes', data.classId));
      if (!classDoc.exists()) {
        throw new Error('Class not found');
      }

      const classData = classDoc.data() as DocumentData;

      const { studentId, nextIndex } = await generateSequentialStudentId(
        data.classId,
        classData.type,
        classData.level,
        classData.section
      );

      const age = calculateAge(data.birthYear);

      const learnerRef = doc(collection(db, 'learners'));
      batch.set(learnerRef, {
        studentId,
        studentIndex: nextIndex,
        classPrefix: generateClassPrefix(classData.type, classData.level, classData.section),
        fullName: data.fullName.trim(),
        birthYear: data.birthYear,
        age,
        gender: data.gender,
        preferredName: data.preferredName || null,
        address: data.address.trim(),
        guardian: data.guardian.trim(),
        guardianPhone: data.guardianPhone,
        alternativeGuardian: data.alternativeGuardian || null,
        alternativeGuardianPhone: data.alternativeGuardianPhone || null,
        sponsor: data.sponsor.trim(),
        classId: data.classId,
        className: classData.name,
        classType: classData.type,
        classLevel: classData.level,
        classSection: classData.section,
        dateOfFirstEntry: data.dateOfFirstEntry,
        enrollmentDate: serverTimestamp(),
        previousSchool: data.previousSchool || null,
        medicalNotes: data.medicalNotes || null,
        allergies: data.allergies || [],
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        name: data.fullName.trim(),
        parentPhone: data.guardianPhone,
      });

      const classRef = doc(db, 'classes', data.classId);
      batch.update(classRef, {
        students: firestoreIncrement(1),
        updatedAt: serverTimestamp()
      });

      await batch.commit();

      console.log(`✅ Added learner ${data.fullName} with ID ${studentId} to class ${classData.name}`);

      return {
        learnerId: learnerRef.id,
        studentId
      };
    } catch (error) {
      console.error('Error adding learner:', error);
      throw error;
    }
  },

  bulkImportLearners: async (
    classId: string,
    learnersData: CSVLearnerData[]
  ): Promise<{ success: number; failed: number; errors: string[]; studentIds: string[] }> => {
    const batch = writeBatch(db);
    let success = 0;
    let failed = 0;
    const errors: string[] = [];
    const generatedStudentIds: string[] = [];

    try {
      const classDoc = await getDoc(doc(db, 'classes', classId));
      if (!classDoc.exists()) {
        throw new Error('Class not found');
      }

      const classData = classDoc.data() as DocumentData;

      const learnersRef = collection(db, 'learners');
      const q = query(
        learnersRef,
        where('classId', '==', classId),
        orderBy('studentIndex', 'desc'),
        limit(1)
      );
      const snapshot = await getDocs(q);
      let nextIndex = snapshot.empty ? 1 : (snapshot.docs[0].data().studentIndex || 0) + 1;

      const classPrefix = generateClassPrefix(classData.type, classData.level, classData.section);

      for (const [index, learner] of learnersData.entries()) {
        try {
          const requiredFields = [
            'fullName', 'gender', 'birthYear', 'address',
            'guardian', 'guardianPhone', 'sponsor', 'dateOfFirstEntry'
          ];

          for (const field of requiredFields) {
            if (!learner[field as keyof CSVLearnerData]) {
              throw new Error(`Missing required field: ${field}`);
            }
          }

          if (learner.gender !== 'male' && learner.gender !== 'female') {
            throw new Error(`Invalid gender "${learner.gender}". Must be "male" or "female"`);
          }

          const currentYear = new Date().getFullYear();
          if (learner.birthYear < 1990 || learner.birthYear > currentYear) {
            throw new Error(`Invalid birth year ${learner.birthYear}. Must be between 1990 and ${currentYear}`);
          }

          const studentId = `${classPrefix}_${nextIndex.toString().padStart(3, '0')}`;
          generatedStudentIds.push(studentId);

          const age = calculateAge(learner.birthYear);

          const allergies = learner.allergies
            ? learner.allergies.split(',').map(a => a.trim()).filter(a => a)
            : [];

          const learnerRef = doc(collection(db, 'learners'));
          batch.set(learnerRef, {
            studentId,
            studentIndex: nextIndex,
            classPrefix,
            fullName: learner.fullName.trim(),
            birthYear: learner.birthYear,
            age,
            gender: learner.gender,
            preferredName: learner.preferredName || null,
            address: learner.address.trim(),
            guardian: learner.guardian.trim(),
            guardianPhone: learner.guardianPhone,
            alternativeGuardian: learner.alternativeGuardian || null,
            alternativeGuardianPhone: learner.alternativeGuardianPhone || null,
            sponsor: learner.sponsor.trim(),
            classId,
            className: classData.name,
            classType: classData.type,
            classLevel: classData.level,
            classSection: classData.section,
            dateOfFirstEntry: learner.dateOfFirstEntry,
            enrollmentDate: serverTimestamp(),
            previousSchool: learner.previousSchool || null,
            medicalNotes: learner.medicalNotes || null,
            allergies,
            status: 'active',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            name: learner.fullName.trim(),
            parentPhone: learner.guardianPhone,
          });

          nextIndex++;
          success++;
        } catch (error) {
          console.error(`Error processing learner at row ${index + 2}:`, learner, error);
          failed++;
          errors.push(`Row ${index + 2}: ${error.message}`);
        }
      }

      if (success > 0) {
        const classRef = doc(db, 'classes', classId);
        batch.update(classRef, {
          students: firestoreIncrement(success),
          updatedAt: serverTimestamp()
        });
      }

      await batch.commit();
      console.log(`✅ Bulk import completed: ${success} succeeded, ${failed} failed`);
      console.log('Generated student IDs:', generatedStudentIds);

      return { success, failed, errors, studentIds: generatedStudentIds };
    } catch (error) {
      console.error('Error in bulk import:', error);
      throw error;
    }
  },

  transferLearner: async (learnerId: string, fromClassId: string, toClassId: string): Promise<string> => {
    const batch = writeBatch(db);

    try {
      const learnerRef = doc(db, 'learners', learnerId);
      const learnerDoc = await getDoc(learnerRef);

      if (!learnerDoc.exists()) {
        throw new Error('Learner not found');
      }

      const toClassDoc = await getDoc(doc(db, 'classes', toClassId));
      if (!toClassDoc.exists()) {
        throw new Error('Target class not found');
      }

      const toClassData = toClassDoc.data() as DocumentData;

      const { studentId: newStudentId, nextIndex } = await generateSequentialStudentId(
        toClassId,
        toClassData.type,
        toClassData.level,
        toClassData.section
      );

      batch.update(learnerRef, {
        classId: toClassId,
        className: toClassData.name,
        classType: toClassData.type,
        classLevel: toClassData.level,
        classSection: toClassData.section,
        studentId: newStudentId,
        studentIndex: nextIndex,
        classPrefix: generateClassPrefix(toClassData.type, toClassData.level, toClassData.section),
        status: 'active',
        transferredAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const fromClassRef = doc(db, 'classes', fromClassId);
      batch.update(fromClassRef, {
        students: firestoreIncrement(-1),
        updatedAt: serverTimestamp()
      });

      const toClassRef = doc(db, 'classes', toClassId);
      batch.update(toClassRef, {
        students: firestoreIncrement(1),
        updatedAt: serverTimestamp()
      });

      await batch.commit();
      console.log(`✅ Transferred learner ${learnerId} to class ${toClassData.name} with new ID ${newStudentId}`);

      return newStudentId;
    } catch (error) {
      console.error('Error transferring learner:', error);
      throw error;
    }
  },

  removeLearner: async (learnerId: string, classId: string): Promise<void> => {
    const batch = writeBatch(db);

    try {
      const learnerRef = doc(db, 'learners', learnerId);
      batch.update(learnerRef, {
        status: 'archived',
        archivedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const classRef = doc(db, 'classes', classId);
      batch.update(classRef, {
        students: firestoreIncrement(-1),
        updatedAt: serverTimestamp()
      });

      await batch.commit();
      console.log(`✅ Removed (archived) learner ${learnerId} from class ${classId}`);
    } catch (error) {
      console.error('Error removing learner:', error);
      throw error;
    }
  },

  hardDeleteLearner: async (learnerId: string, classId: string): Promise<void> => {
    const batch = writeBatch(db);

    try {
      const classRef = doc(db, 'classes', classId);
      batch.update(classRef, {
        students: firestoreIncrement(-1),
        updatedAt: serverTimestamp()
      });

      const learnerRef = doc(db, 'learners', learnerId);
      batch.delete(learnerRef);

      await batch.commit();
      console.log(`✅ Learner ${learnerId} permanently deleted from class ${classId}`);
    } catch (error) {
      console.error('Error hard deleting learner:', error);
      throw error;
    }
  },

  getLearnersBySponsor: async (sponsorName: string): Promise<Learner[]> => {
    try {
      const learnersRef = collection(db, 'learners');
      const q = query(
        learnersRef,
        where('sponsor', '>=', sponsorName),
        where('sponsor', '<=', sponsorName + '\uf8ff'),
        where('status', '==', 'active'),
        orderBy('sponsor'),
        orderBy('fullName')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data() as DocumentData;
        return {
          id: docSnapshot.id,
          ...data,
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
          enrollmentDate: toDate(data.enrollmentDate),
        } as Learner;
      });
    } catch (error) {
      console.error('Error fetching learners by sponsor:', error);
      throw error;
    }
  },

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

  updateLearner: async (learnerId: string, updates: Partial<Learner>): Promise<void> => {
    try {
      const learnerRef = doc(db, 'learners', learnerId);

      const cleanUpdates = Object.entries(updates).reduce((acc, [key, value]) => {
        if (value !== undefined) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, any>);

      cleanUpdates.updatedAt = serverTimestamp();

      if (updates.birthYear) {
        cleanUpdates.age = calculateAge(updates.birthYear);
      }

      if (updates.fullName) {
        cleanUpdates.name = updates.fullName;
      }

      if (updates.guardianPhone) {
        cleanUpdates.parentPhone = updates.guardianPhone;
      }

      if (updates.allergies) {
        cleanUpdates.allergies = updates.allergies;
      }

      await updateDoc(learnerRef, cleanUpdates);

      console.log(`✅ Updated learner ${learnerId}`);
    } catch (error) {
      console.error('Error updating learner:', error);
      throw error;
    }
  },

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

  getGenderStats: async (classId: string): Promise<GenderStats> => {
    try {
      const learners = await learnerService.getLearnersByClass(classId);
      return calculateGenderStats(learners);
    } catch (error) {
      console.error('Error getting gender stats:', error);
      return { boys: 0, girls: 0, unspecified: 0, total: 0, boysPercentage: 0, girlsPercentage: 0 };
    }
  },

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
      return snapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data() as DocumentData;
        return {
          id: docSnapshot.id,
          ...data,
        } as Learner;
      });
    } catch (error) {
      console.error('Error fetching learners missing gender:', error);
      return [];
    }
  },

  getLearnerByStudentId: async (studentId: string): Promise<Learner | null> => {
    try {
      const learnersRef = collection(db, 'learners');
      const q = query(
        learnersRef,
        where('studentId', '==', studentId),
        limit(1)
      );

      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        return null;
      }

      const docSnapshot = snapshot.docs[0];
      const data = docSnapshot.data() as DocumentData;

      return {
        id: docSnapshot.id,
        ...data,
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
        enrollmentDate: toDate(data.enrollmentDate),
      } as Learner;
    } catch (error) {
      console.error('Error fetching learner by student ID:', error);
      throw error;
    }
  },

  /**
   * ==================== PARENT PORTAL ====================
   * Find all learners linked to a guardian phone number.
   * Matches on guardianPhone, legacy parentPhone, and alternativeGuardianPhone.
   * Falls back to normalized-digit comparison (handles +260..., 097..., spaces, dashes).
   */
  getLearnersByGuardianPhone: async (phoneNumber: string): Promise<Learner[]> => {
    try {
      const raw = (phoneNumber || '').trim();
      const normalized = raw.replace(/\D/g, '');

      if (!raw || !normalized) return [];

      const learnersRef = collection(db, 'learners');

      // 1) Exact match on guardianPhone
      let snapshot = await getDocs(
        query(
          learnersRef,
          where('guardianPhone', '==', raw),
          where('status', '==', 'active')
        )
      );

      // 2) Exact match on legacy parentPhone
      if (snapshot.empty) {
        snapshot = await getDocs(
          query(
            learnersRef,
            where('parentPhone', '==', raw),
            where('status', '==', 'active')
          )
        );
      }

      // 3) Fallback: scan active learners and match on normalized digits
      if (snapshot.empty) {
        const allSnapshot = await getDocs(
          query(learnersRef, where('status', '==', 'active'))
        );

        const matched = allSnapshot.docs.filter(docSnap => {
          const data = docSnap.data() as DocumentData;
          const candidates = [
            data.guardianPhone,
            data.parentPhone,
            data.alternativeGuardianPhone,
          ]
            .filter(Boolean)
            .map((p: string) => String(p).replace(/\D/g, ''));

          return candidates.some(p => {
            if (!p) return false;
            if (p === normalized) return true;
            if (p.length >= 9 && normalized.length >= 9) {
              return p.slice(-9) === normalized.slice(-9);
            }
            return p.includes(normalized) || normalized.includes(p);
          });
        });

        return matched.map(docSnap => {
          const data = docSnap.data() as DocumentData;
          return {
            id: docSnap.id,
            studentId: data.studentId || '',
            studentIndex: data.studentIndex || 0,
            classPrefix: data.classPrefix || '',
            fullName: data.fullName || data.name || '',
            name: data.fullName || data.name || '',
            birthYear: data.birthYear || 0,
            age: data.age || calculateAge(data.birthYear || 0),
            gender: data.gender,
            address: data.address || '',
            guardian: data.guardian || '',
            guardianPhone: data.guardianPhone || data.parentPhone || '',
            parentPhone: data.guardianPhone || data.parentPhone || '',
            sponsor: data.sponsor || '',
            classId: data.classId || '',
            className: data.className || '',
            status: data.status || 'active',
          } as Learner;
        });
      }

      return snapshot.docs.map(docSnap => {
        const data = docSnap.data() as DocumentData;
        return {
          id: docSnap.id,
          studentId: data.studentId || '',
          studentIndex: data.studentIndex || 0,
          classPrefix: data.classPrefix || '',
          fullName: data.fullName || data.name || '',
          name: data.fullName || data.name || '',
          birthYear: data.birthYear || 0,
          age: data.age || calculateAge(data.birthYear || 0),
          gender: data.gender,
          address: data.address || '',
          guardian: data.guardian || '',
          guardianPhone: data.guardianPhone || data.parentPhone || '',
          parentPhone: data.guardianPhone || data.parentPhone || '',
          sponsor: data.sponsor || '',
          classId: data.classId || '',
          className: data.className || '',
          status: data.status || 'active',
        } as Learner;
      });
    } catch (error) {
      console.error('Error fetching learners by guardian phone:', error);
      return [];
    }
  },
};

// ==================== TEACHER SERVICE (UPDATED TO HANDLE BOTH OLD AND NEW FIELDS) ====================

const teacherService = {
  getTeachers: async (): Promise<Teacher[]> => {
    try {
      console.log('🔍 Fetching all teachers from users collection...');
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef,
        where('userType', '==', 'teacher'),
        orderBy('fullName', 'asc')
      );

      const snapshot = await getDocs(q);
      console.log(`📊 Found ${snapshot.docs.length} teacher documents`);

      const teachers = snapshot.docs.map((docSnapshot) => {
        const data = docSnapshot.data() as DocumentData;
        return {
          id: docSnapshot.id,
          name: data.fullName || data.name || 'Unknown',
          email: data.email || '',
          phone: data.phone || data.contactNumber || '',
          department: data.department || 'General',
          subjects: data.subjects || [],
          assignedClasses: data.assignedClasses || [],
          isFormTeacher: data.isFormTeacher || false,
          assignedClassId: data.assignedClassId,
          assignedClassName: data.assignedClassName,
          status: data.status || 'active',
          employmentDate: toDate(data.employmentDate) || toDate(data.createdAt) || new Date(),
          fullName: data.fullName,
          nrc: data.nrc,
          dateOfBirth: data.dateOfBirth,
          tsNumber: data.tsNumber,
          employeeNumber: data.employeeNumber,
          dateOfFirstAppointment: data.dateOfFirstAppointment,
          dateOfCurrentAppointment: data.dateOfCurrentAppointment,
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
        } as Teacher;
      });

      console.log('✅ Teacher data processed:', teachers);
      return teachers;
    } catch (error) {
      console.error('❌ Error fetching teachers:', error);
      throw error;
    }
  },

  getTeachersByClass: async (classId: string): Promise<Teacher[]> => {
    try {
      console.log(`🔍 Fetching teachers for class ${classId}...`);
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef,
        where('userType', '==', 'teacher'),
        where('assignedClasses', 'array-contains', classId),
        orderBy('fullName', 'asc')
      );

      const snapshot = await getDocs(q);

      return snapshot.docs.map((docSnapshot) => {
        const data = docSnapshot.data() as DocumentData;
        return {
          id: docSnapshot.id,
          name: data.fullName || data.name || 'Unknown',
          email: data.email || '',
          phone: data.phone || '',
          department: data.department || 'General',
          subjects: data.subjects || [],
          assignedClasses: data.assignedClasses || [],
          isFormTeacher: data.isFormTeacher || false,
          assignedClassId: data.assignedClassId,
          assignedClassName: data.assignedClassName,
          status: data.status || 'active',
        } as Teacher;
      });
    } catch (error) {
      console.error('Error fetching class teachers:', error);
      throw error;
    }
  },

  getTeacherAssignments: async (teacherId: string): Promise<TeacherAssignment[]> => {
    try {
      console.log(`🔍 Fetching assignments for teacher ${teacherId}...`);
      const assignmentsRef = collection(db, 'teacher_assignments');
      const q = query(assignmentsRef, where('teacherId', '==', teacherId));

      const snapshot = await getDocs(q);

      const assignments = await Promise.all(snapshot.docs.map(async (docSnapshot) => {
        const data = docSnapshot.data() as DocumentData;
        const subject = data.subject || '';
        const normalizedSubject = normalizeSubjectName(subject);

        let className = data.className || '';
        if (!className && data.classId) {
          try {
            const classDoc = await getDoc(doc(db, 'classes', data.classId));
            if (classDoc.exists()) {
              const classData = classDoc.data();
              className = classData.name || '';
            }
          } catch (error) {
            console.error('Error fetching class name:', error);
          }
        }

        return {
          id: docSnapshot.id,
          teacherId: data.teacherId,
          teacherName: data.teacherName || '',
          teacherEmail: data.teacherEmail,
          classId: data.classId,
          className,
          subject: subject,
          normalizedSubjectId: normalizedSubject,
          isFormTeacher: data.isFormTeacher || false,
          assignedAt: toDate(data.assignedAt),
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
        } as TeacherAssignment;
      }));

      console.log(`📚 Found ${assignments.length} assignments for teacher ${teacherId}`);
      return assignments;
    } catch (error) {
      console.error('Error fetching teacher assignments:', error);
      return [];
    }
  },

  getAllTeacherAssignments: async (): Promise<TeacherAssignment[]> => {
    try {
      const assignmentsRef = collection(db, 'teacher_assignments');
      const snapshot = await getDocs(assignmentsRef);

      return snapshot.docs.map((docSnapshot) => {
        const data = docSnapshot.data() as DocumentData;
        const subject = data.subject || '';
        const normalizedSubject = normalizeSubjectName(subject);

        return {
          id: docSnapshot.id,
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

  getTeacherAssignmentsByClass: async (classId: string): Promise<TeacherAssignment[]> => {
    return classService.getTeacherAssignmentsByClass(classId);
  },

  assignTeacherToClass: async (
    teacherId: string,
    classId: string,
    subject: string,
    isFormTeacher: boolean = false
  ): Promise<void> => {
    try {
      console.log('Starting teacher assignment:', { teacherId, classId, subject, isFormTeacher });

      const isFormTeacherAssignment = isFormTeacher && subject === 'Form Teacher';

      if (!subject || subject.trim() === '') {
        if (isFormTeacher) {
          subject = 'Form Teacher';
        } else {
          throw new Error('Subject is required when assigning a teacher to a class');
        }
      }

      const normalizedSubject = !isFormTeacherAssignment ? normalizeSubjectName(subject) : 'form-teacher';
      console.log(`Normalized subject: ${subject} → ${normalizedSubject}`);

      const teacherRef = doc(db, 'users', teacherId);
      const teacherDoc = await getDoc(teacherRef);

      if (!teacherDoc.exists()) {
        throw new Error('Teacher not found');
      }

      const teacherData = teacherDoc.data() as DocumentData;

      if (!isFormTeacherAssignment) {
        const teacherSubjects = (teacherData.subjects || []).map((s: string) => s.toString());
        const normalizedTeacherSubjects = teacherSubjects.map((s: string) => normalizeSubjectName(s));

        if (!normalizedTeacherSubjects.includes(normalizedSubject)) {
          console.warn(`Teacher does not have ${subject} in their subjects list:`, teacherSubjects);
          console.warn('Proceeding with assignment anyway...');
        }
      }

      const classRef = doc(db, 'classes', classId);
      const classDoc = await getDoc(classRef);

      if (!classDoc.exists()) {
        throw new Error('Class not found');
      }

      const classData = classDoc.data() as DocumentData;

      console.log('Teacher and class data retrieved successfully');

      const existingAssignmentsRef = collection(db, 'teacher_assignments');

      const sameSubjectQuery = query(
        existingAssignmentsRef,
        where('teacherId', '==', teacherId),
        where('classId', '==', classId),
        where('subject', '==', subject)
      );
      const sameSubjectSnapshot = await getDocs(sameSubjectQuery);

      if (!sameSubjectSnapshot.empty) {
        const existingAssignment = sameSubjectSnapshot.docs[0];
        const existingData = existingAssignment.data();

        if (isFormTeacher !== existingData.isFormTeacher) {
          const batch = writeBatch(db);

          batch.update(existingAssignment.ref, {
            isFormTeacher,
            updatedAt: serverTimestamp(),
          });

          if (isFormTeacher) {
            if (classData.formTeacherId && classData.formTeacherId !== teacherId) {
              throw new Error(`Class already has a form teacher (${classData.formTeacherName || classData.formTeacherId}). A class can only have one form teacher.`);
            }

            batch.update(classRef, {
              formTeacherId: teacherId,
              formTeacherName: teacherData.fullName || teacherData.name,
              updatedAt: serverTimestamp(),
            });
          } else if (existingData.isFormTeacher && !isFormTeacher) {
            batch.update(classRef, {
              formTeacherId: null,
              formTeacherName: null,
              updatedAt: serverTimestamp(),
            });
          }

          if (isFormTeacher !== teacherData.isFormTeacher) {
            batch.update(teacherRef, {
              isFormTeacher,
              updatedAt: serverTimestamp(),
            });
          }

          await batch.commit();
          console.log('Updated existing assignment form teacher status');
        } else {
          console.log('Assignment already exists with same subject');
        }
        return;
      }

      if (isFormTeacher) {
        if (classData.formTeacherId && classData.formTeacherId !== teacherId) {
          throw new Error(`Class already has a form teacher (${classData.formTeacherName || classData.formTeacherId}). A class can only have one form teacher.`);
        }
      }

      const batch = writeBatch(db);

      const assignmentRef = doc(collection(db, 'teacher_assignments'));
      batch.set(assignmentRef, {
        teacherId,
        teacherName: teacherData.fullName || teacherData.name,
        teacherEmail: teacherData.email,
        classId,
        className: classData.name,
        subject,
        normalizedSubject: isFormTeacherAssignment ? 'form-teacher' : normalizedSubject,
        isFormTeacher,
        assignedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      console.log('Teacher assignment document queued with subject:', subject);

      const teachersArray = classData.teachers || [];
      if (!teachersArray.includes(teacherId)) {
        batch.update(classRef, {
          teachers: arrayUnion(teacherId),
          updatedAt: serverTimestamp(),
        });
      }

      if (isFormTeacher) {
        batch.update(classRef, {
          formTeacherId: teacherId,
          formTeacherName: teacherData.fullName || teacherData.name,
          updatedAt: serverTimestamp(),
        });
      }

      console.log('Class document update queued');

      const teacherUpdates: any = {
        updatedAt: serverTimestamp(),
      };

      const assignedClasses = teacherData.assignedClasses || [];
      if (!assignedClasses.includes(classId)) {
        teacherUpdates.assignedClasses = arrayUnion(classId);
      }

      if (isFormTeacher && !teacherData.isFormTeacher) {
        teacherUpdates.isFormTeacher = true;
      }

      teacherUpdates.assignedClassId = classId;
      teacherUpdates.assignedClassName = classData.name;

      batch.update(teacherRef, teacherUpdates);

      console.log('Teacher user document update queued');

      await batch.commit();
      console.log('Batch commit successful - teacher assigned with subject!');

    } catch (error) {
      console.error('Error in assignTeacherToClass:', error);
      throw error;
    }
  },

  assignFormTeacherOnly: async (teacherId: string, classId: string): Promise<void> => {
    return teacherService.assignTeacherToClass(teacherId, classId, 'Form Teacher', true);
  },

  getTeacherSubjectsForClass: async (teacherId: string, classId: string): Promise<string[]> => {
    try {
      const assignmentsRef = collection(db, 'teacher_assignments');
      const q = query(
        assignmentsRef,
        where('teacherId', '==', teacherId),
        where('classId', '==', classId)
      );

      const snapshot = await getDocs(q);
      const subjects = snapshot.docs
        .map(docSnapshot => {
          const data = docSnapshot.data();
          if (data.subject === 'Form Teacher' && !data.isFormTeacher) {
            return null;
          }
          return data.subject;
        })
        .filter(subject => subject !== null);

      console.log(`📚 Teacher ${teacherId} teaches subjects in class ${classId}:`, subjects);
      return subjects;
    } catch (error) {
      console.error('Error getting teacher subjects for class:', error);
      return [];
    }
  },

  isFormTeacherForClass: async (teacherId: string, classId: string): Promise<boolean> => {
    try {
      const classDoc = await getDoc(doc(db, 'classes', classId));
      if (!classDoc.exists()) return false;

      const classData = classDoc.data();
      return classData.formTeacherId === teacherId;
    } catch (error) {
      console.error('Error checking form teacher status:', error);
      return false;
    }
  },

  updateTeacherStatus: async (teacherId: string, status: 'active' | 'inactive' | 'on_leave' | 'transferred'): Promise<void> => {
    try {
      const teacherRef = doc(db, 'users', teacherId);
      await updateDoc(teacherRef, {
        status,
        updatedAt: serverTimestamp()
      });
      console.log(`✅ Updated teacher ${teacherId} status to ${status}`);
    } catch (error) {
      console.error('Error updating teacher status:', error);
      throw error;
    }
  },

  updateTeacher: async (teacherId: string, updates: Partial<Teacher>): Promise<void> => {
    try {
      const teacherRef = doc(db, 'users', teacherId);
      const teacherDoc = await getDoc(teacherRef);
      if (!teacherDoc.exists()) {
        throw new Error('Teacher not found');
      }

      const firestoreUpdates: any = {
        updatedAt: serverTimestamp()
      };

      if (updates.name !== undefined) {
        firestoreUpdates.fullName = updates.name;
        firestoreUpdates.name = updates.name;
      }

      if (updates.email !== undefined) firestoreUpdates.email = updates.email;
      if (updates.phone !== undefined) firestoreUpdates.phone = updates.phone;
      if (updates.department !== undefined) firestoreUpdates.department = updates.department;
      if (updates.subjects !== undefined) firestoreUpdates.subjects = updates.subjects;
      if (updates.status !== undefined) firestoreUpdates.status = updates.status;

      await updateDoc(teacherRef, firestoreUpdates);
      console.log(`✅ Updated teacher ${teacherId}`);
    } catch (error) {
      console.error('Error updating teacher:', error);
      throw error;
    }
  },

  deleteTeacher: async (teacherId: string): Promise<void> => {
    try {
      const assignments = await teacherService.getTeacherAssignments(teacherId);

      if (assignments.length > 0) {
        throw new Error(`Cannot delete teacher with ${assignments.length} class assignments. Remove assignments first.`);
      }

      const teacherRef = doc(db, 'users', teacherId);
      await deleteDoc(teacherRef);
      console.log(`✅ Teacher ${teacherId} permanently deleted`);
    } catch (error) {
      console.error('Error deleting teacher:', error);
      throw error;
    }
  },

  removeTeacherSubject: async (teacherId: string, classId: string, subject: string): Promise<void> => {
    try {
      console.log('Removing teacher subject:', { teacherId, classId, subject });

      const assignmentsRef = collection(db, 'teacher_assignments');
      const q = query(
        assignmentsRef,
        where('teacherId', '==', teacherId),
        where('classId', '==', classId),
        where('subject', '==', subject)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        throw new Error(`Assignment not found for subject: ${subject}`);
      }

      const batch = writeBatch(db);
      let wasFormTeacher = false;

      snapshot.forEach(docSnapshot => {
        const data = docSnapshot.data();
        wasFormTeacher = data.isFormTeacher || false;
        batch.delete(docSnapshot.ref);
      });

      const remainingQuery = query(
        assignmentsRef,
        where('teacherId', '==', teacherId),
        where('classId', '==', classId)
      );
      const remainingSnapshot = await getDocs(remainingQuery);

      const teacherRef = doc(db, 'users', teacherId);
      const classRef = doc(db, 'classes', classId);

      if (remainingSnapshot.empty) {
        batch.update(teacherRef, {
          assignedClasses: arrayRemove(classId),
          updatedAt: serverTimestamp()
        });

        batch.update(classRef, {
          teachers: arrayRemove(teacherId),
          updatedAt: serverTimestamp()
        });

        if (wasFormTeacher) {
          batch.update(classRef, {
            formTeacherId: null,
            formTeacherName: null,
          });

          const otherClassesQuery = query(
            collection(db, 'classes'),
            where('formTeacherId', '==', teacherId)
          );
          const otherClassesSnapshot = await getDocs(otherClassesQuery);

          if (otherClassesSnapshot.empty) {
            batch.update(teacherRef, { isFormTeacher: false });
          }
        }
      } else {
        if (wasFormTeacher) {
          const hasFormTeacherRemaining = remainingSnapshot.docs.some(
            docSnapshot => docSnapshot.data().isFormTeacher === true
          );

          if (!hasFormTeacherRemaining) {
            batch.update(classRef, {
              formTeacherId: null,
              formTeacherName: null,
              updatedAt: serverTimestamp()
            });

            const otherClassesQuery = query(
              collection(db, 'classes'),
              where('formTeacherId', '==', teacherId)
            );
            const otherClassesSnapshot = await getDocs(otherClassesQuery);

            if (otherClassesSnapshot.empty) {
              batch.update(teacherRef, { isFormTeacher: false });
            }
          }
        }
      }

      await batch.commit();
      console.log(`✅ Removed subject ${subject} from teacher ${teacherId} in class ${classId}`);
    } catch (error) {
      console.error('Error removing teacher subject:', error);
      throw error;
    }
  },

  removeTeacherFromClass: async (teacherId: string, classId: string): Promise<void> => {
    try {
      console.log('Starting teacher removal:', { teacherId, classId });

      const teacherRef = doc(db, 'users', teacherId);
      const teacherDoc = await getDoc(teacherRef);

      if (!teacherDoc.exists()) {
        throw new Error('Teacher not found');
      }

      const teacherData = teacherDoc.data() as DocumentData;

      const batch = writeBatch(db);

      const assignmentsRef = collection(db, 'teacher_assignments');
      const q = query(
        assignmentsRef,
        where('teacherId', '==', teacherId),
        where('classId', '==', classId)
      );

      const assignmentSnapshot = await getDocs(q);
      assignmentSnapshot.forEach(docSnapshot => {
        batch.delete(docSnapshot.ref);
      });

      console.log('Teacher assignment documents queued for deletion');

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

      await batch.commit();
      console.log('Batch commit successful - teacher removed!');

    } catch (error) {
      console.error('Error in removeTeacherFromClass:', error);
      throw error;
    }
  },

  getTeacherFullAssignments: async (teacherId: string): Promise<{
    classId: string;
    className: string;
    subjects: string[];
    isFormTeacher: boolean;
  }[]> => {
    try {
      const assignments = await teacherService.getTeacherAssignments(teacherId);

      const classMap = new Map<string, {
        className: string;
        subjects: Set<string>;
        isFormTeacher: boolean;
      }>();

      assignments.forEach(assignment => {
        if (!classMap.has(assignment.classId)) {
          classMap.set(assignment.classId, {
            className: assignment.className,
            subjects: new Set(),
            isFormTeacher: assignment.isFormTeacher,
          });
        }

        const classData = classMap.get(assignment.classId)!;
        classData.subjects.add(assignment.subject);

        if (assignment.isFormTeacher) {
          classData.isFormTeacher = true;
        }
      });

      return Array.from(classMap.entries()).map(([classId, data]) => ({
        classId,
        className: data.className,
        subjects: Array.from(data.subjects).filter(s => s !== 'Form Teacher'),
        isFormTeacher: data.isFormTeacher,
      }));
    } catch (error) {
      console.error('Error getting teacher full assignments:', error);
      return [];
    }
  },

  transferTeacher: async (
    teacherId: string,
    fromClassId: string,
    toClassId: string,
    subjectMapping?: Record<string, string>
  ): Promise<void> => {
    try {
      const assignments = await teacherService.getTeacherAssignments(teacherId);
      const fromClassAssignments = assignments.filter(a => a.classId === fromClassId);

      if (fromClassAssignments.length === 0) {
        throw new Error('No assignments found for teacher in source class');
      }

      const batch = writeBatch(db);

      const toClassDoc = await getDoc(doc(db, 'classes', toClassId));
      if (!toClassDoc.exists()) {
        throw new Error('Target class not found');
      }
      const toClassData = toClassDoc.data() as DocumentData;

      const teacherDoc = await getDoc(doc(db, 'users', teacherId));
      const teacherData = teacherDoc.exists() ? teacherDoc.data() : {};

      for (const assignment of fromClassAssignments) {
        const newSubject = subjectMapping?.[assignment.subject] || assignment.subject;

        const newAssignmentRef = doc(collection(db, 'teacher_assignments'));
        batch.set(newAssignmentRef, {
          teacherId: assignment.teacherId,
          teacherName: teacherData.fullName || teacherData.name,
          teacherEmail: teacherData.email,
          classId: toClassId,
          className: toClassData.name,
          subject: newSubject,
          normalizedSubject: normalizeSubjectName(newSubject),
          isFormTeacher: assignment.isFormTeacher,
          assignedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const oldAssignmentRef = doc(db, 'teacher_assignments', assignment.id);
        batch.delete(oldAssignmentRef);
      }

      const teacherRef = doc(db, 'users', teacherId);

      batch.update(teacherRef, {
        assignedClasses: arrayRemove(fromClassId),
        updatedAt: serverTimestamp()
      });

      batch.update(teacherRef, {
        assignedClasses: arrayUnion(toClassId),
        assignedClassId: toClassId,
        assignedClassName: toClassData.name,
        updatedAt: serverTimestamp()
      });

      const fromClassRef = doc(db, 'classes', fromClassId);
      batch.update(fromClassRef, {
        teachers: arrayRemove(teacherId),
        updatedAt: serverTimestamp()
      });

      const toClassRef = doc(db, 'classes', toClassId);
      const updateData: any = {
        teachers: arrayUnion(teacherId),
        updatedAt: serverTimestamp()
      };

      if (fromClassAssignments.some(a => a.isFormTeacher)) {
        updateData.formTeacherId = teacherId;
        updateData.formTeacherName = teacherData.fullName || teacherData.name;
      }

      batch.update(toClassRef, updateData);

      await batch.commit();
      console.log(`✅ Transferred teacher ${teacherId} from ${fromClassId} to ${toClassId}`);
    } catch (error) {
      console.error('Error transferring teacher:', error);
      throw error;
    }
  },
};

// ==================== RESULTS ANALYSIS SERVICE ====================

const resultsAnalysisService = {
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

      for (let i = 1; i <= 9; i++) {
        gradeMap.set(i, { boys: 0, girls: 0 });
      }

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

      const learners = await learnerService.getLearnersByClass(classId);
      const candidates = {
        boys: learners.filter(l => l.gender === 'male').length,
        girls: learners.filter(l => l.gender === 'female').length,
        total: learners.length
      };

      const sat = {
        boys: results.filter(r => r.studentGender === 'male').length,
        girls: results.filter(r => r.studentGender === 'female').length,
        total: results.length
      };

      const gradeDistribution = await resultsAnalysisService.getGradeDistribution(classId, 'endOfTerm');

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
  calculateAge,
  toDate,
};