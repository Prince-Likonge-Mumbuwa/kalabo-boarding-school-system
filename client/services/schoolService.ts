// @/services/schoolService.ts
//
// Class, learner, teacher and results services.
//
// Teacher ↔ class ↔ subject responsibility is owned by ./assignmentEngine:
//   - class_slots/{classId}__{subject}  : one Primary Owner + at most one delegate
//   - teacher_assignments               : append-only tenure history (never deleted)
//   - assignment_events                 : audit trail
// The teacherService mutation methods below are thin, signature-compatible
// wrappers around the engine.

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
import type { WriteBatch, DocumentSnapshot } from 'firebase/firestore';
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
  SubjectPerformance,
  AssignmentRoleType,
  AssignmentStatus,
  AssignmentEndReason,
} from '@/types/school';

// ==================== IMPORT NORMALIZATION UTILITY ====================
import { normalizeSubjectName } from './resultsService';
import * as assignmentEngine from './assignmentEngine';

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
 * Format a Date as "YYYY-MM-DD" using LOCAL calendar fields.
 * (toISOString() uses UTC and shifts dates back a day in UTC+ timezones
 * such as Zambia's CAT.)
 */
const formatLocalYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Build a "YYYY-MM-DD" string only if y/m/d is a real calendar date. */
const buildValidYMD = (y: number, m: number, d: number): string | null => {
  const date = new Date(y, m - 1, d);
  if (
    isNaN(date.getTime()) ||
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return formatLocalYMD(date);
};

/**
 * Parse the value of an <input type="date"> ("YYYY-MM-DD") as LOCAL time.
 * `new Date('2026-11-30')` is UTC midnight, which is the wrong instant
 * outside UTC. Use this in the UI before passing dates to the service.
 */
const parseLocalDateInput = (
  value: string | null | undefined,
  endOfDay = false
): Date | null => {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  const [, y, mo, d] = m;
  return endOfDay
    ? new Date(Number(y), Number(mo) - 1, Number(d), 23, 59, 59, 999)
    : new Date(Number(y), Number(mo) - 1, Number(d), 0, 0, 0, 0);
};

/** Same calendar day (local), 23:59:59.999. */
const toEndOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

// ==================== DATE OF BIRTH HELPERS ====================

/**
 * Normalize any date-of-birth-ish value into an ISO date string "YYYY-MM-DD".
 */
const normalizeDateOfBirth = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date && !isNaN(value.getTime())) {
    return formatLocalYMD(value);
  }

  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    try {
      const d = (value as any).toDate();
      if (d instanceof Date && !isNaN(d.getTime())) {
        return formatLocalYMD(d);
      }
    } catch {
      /* fall through */
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const y = Math.trunc(value);
    if (y >= 1900 && y <= 2200) return `${y}-01-01`;
    return null;
  }

  const str = String(value).trim();

  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return buildValidYMD(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const dmy = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    return buildValidYMD(Number(yyyy), Number(mm), Number(dd));
  }

  const ymd = str.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (ymd) {
    const [, yyyy, mm, dd] = ymd;
    return buildValidYMD(Number(yyyy), Number(mm), Number(dd));
  }

  if (/^\d{4}$/.test(str)) {
    return `${str}-01-01`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return formatLocalYMD(parsed);
  }

  return null;
};

/**
 * Derive { birthYear, age } from a dateOfBirth string.
 */
const deriveBirthYearAndAge = (
  dateOfBirth: string | null | undefined
): { birthYear: number; age: number } => {
  if (!dateOfBirth) return { birthYear: 0, age: 0 };

  const dob = new Date(dateOfBirth + (dateOfBirth.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(dob.getTime())) return { birthYear: 0, age: 0 };

  const birthYear = dob.getFullYear();
  const today = new Date();
  let age = today.getFullYear() - birthYear;
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  if (age < 0) age = 0;
  return { birthYear, age };
};

/**
 * Calculate age from birthYear OR dateOfBirth.
 */
const calculateAge = (birthYear: number, dateOfBirth?: string): number => {
  if (dateOfBirth) {
    const derived = deriveBirthYearAndAge(dateOfBirth);
    if (derived.age > 0) return derived.age;
  }
  if (!birthYear) return 0;
  return Math.max(0, new Date().getFullYear() - birthYear);
};

/**
 * Parse class name into type, level, and section
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
 */
const generateClassPrefix = (classType: 'grade' | 'form', level: number, section: string): string => {
  const typePrefix = classType === 'grade' ? 'G' : 'F';
  return `${typePrefix}${level}${section}`.toUpperCase();
};

/**
 * Generate sequential student ID for a class
 */
const generateSequentialStudentId = async (
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
 * Legacy generate unique student ID
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
 * Shared mapper: Firestore learner doc → typed Learner.
 */
const mapLearnerDoc = (id: string, data: DocumentData): Learner => {
  let resolvedDob = normalizeDateOfBirth(data.dateOfBirth);
  if (!resolvedDob && data.birthYear) {
    resolvedDob = normalizeDateOfBirth(data.birthYear);
  }

  const derived = deriveBirthYearAndAge(resolvedDob);
  const birthYear = data.birthYear || derived.birthYear || 0;
  const age =
    typeof data.age === 'number' && data.age > 0
      ? data.age
      : derived.age || calculateAge(birthYear, resolvedDob || undefined);

  return {
    id,
    studentId: data.studentId || '',
    studentIndex: data.studentIndex || 0,
    classPrefix: data.classPrefix || '',
    fullName: data.fullName || data.name || '',
    preferredName: data.preferredName ?? undefined,

    dateOfBirth: resolvedDob || '',
    birthYear,
    age,

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
    previousGrade: data.previousGrade,
    medicalNotes: data.medicalNotes,
    allergies: data.allergies || [],
    status: data.status || 'active',
    createdBy: data.createdBy,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    graduationYear: data.graduationYear,
    transferredAt: toDate(data.transferredAt),
    transferredToClass: data.transferredToClass,
    archivedAt: toDate(data.archivedAt),

    name: data.fullName || data.name || '',
    parentPhone: data.guardianPhone || data.parentPhone || '',
  } as Learner;
};

// ==================== ASSIGNMENT CONSTANTS & SMALL HELPERS ====================

const FORM_TEACHER_SUBJECT = 'Form Teacher';
const FORM_TEACHER_SLOT = 'form-teacher';
const OPEN_STATUSES: AssignmentStatus[] = ['active', 'suspended'] as AssignmentStatus[];

const ROLE_LABEL: Record<string, string> = {
  substantive: 'Substantive',
  tp: 'Teaching Practice',
  'leave-cover': 'Leave Cover',
};

const isCoverRole = (role: unknown): boolean => role === 'tp' || role === 'leave-cover';

const roleOf = (data: DocumentData): AssignmentRoleType =>
  ((data.roleType as AssignmentRoleType) || 'substantive');

const toNormalizedSubject = (subject: string): string =>
  subject === FORM_TEACHER_SUBJECT ? FORM_TEACHER_SLOT : normalizeSubjectName(subject);

/** Normalized slot id of a raw row — tolerates legacy rows without `normalizedSubject`. */
const rowNormalizedSubject = (data: DocumentData): string =>
  data.normalizedSubject || toNormalizedSubject(data.subject || '');

const isFormTeacherRowData = (data: DocumentData): boolean =>
  data.subject === FORM_TEACHER_SUBJECT || data.normalizedSubject === FORM_TEACHER_SLOT;

/**
 * Shared mapper: Firestore teacher_assignments doc → typed TeacherAssignment.
 * Exported so hooks can import it instead of keeping a duplicate copy.
 */
const mapAssignmentDoc = (id: string, data: DocumentData): TeacherAssignment => {
  const subject = data.subject || '';
  const normalizedSubjectId = rowNormalizedSubject(data);

  const startDate =
    toDate(data.startDate) ||
    toDate(data.assignedAt) ||
    toDate(data.createdAt);

  return {
    id,
    teacherId: data.teacherId,
    teacherName: data.teacherName || '',
    teacherEmail: data.teacherEmail,

    classId: data.classId,
    className: data.className || '',
    subject,
    normalizedSubjectId,

    // Only "Form Teacher" rows can carry the flag (ignores legacy bad data).
    isFormTeacher: data.isFormTeacher === true && isFormTeacherRowData(data),

    roleType: roleOf(data),
    status: (data.status as AssignmentStatus) || 'active',
    startDate,
    endDate: toDate(data.endDate) ?? null,
    coversTeacherId: data.coversTeacherId ?? null,
    coversAssignmentId: data.coversAssignmentId ?? null,
    endReason: (data.endReason as AssignmentEndReason) ?? null,

    assignedAt: toDate(data.assignedAt),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
};

// ==================== CLASS SERVICE ====================

const classService = {
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
        } catch (error: any) {
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

  /**
   * Permanently delete an EMPTY class that has never had teachers.
   * Classes with any assignment history must be archived instead, so that
   * historical tenure records stay intact.
   */
  deleteClass: async (classId: string): Promise<void> => {
    try {
      const learners = await learnerService.getLearnersByClass(classId);
      if (learners.length > 0) {
        throw new Error(`Cannot delete class with ${learners.length} learners. Please delete or transfer all learners first.`);
      }

      const history = await getDocs(
        query(collection(db, 'teacher_assignments'), where('classId', '==', classId), limit(1))
      );
      if (!history.empty) {
        throw new Error(
          'This class has teacher assignment history. Archive it instead of deleting, ' +
          'so historical records are preserved.'
        );
      }

      const slots = await getDocs(query(collection(db, 'class_slots'), where('classId', '==', classId)));
      const batch = writeBatch(db);
      slots.docs.forEach(d => batch.delete(d.ref));
      batch.delete(doc(db, 'classes', classId));
      await batch.commit();

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
      const assignments = snapshot.docs.map(docSnap =>
        mapAssignmentDoc(docSnap.id, docSnap.data() as DocumentData)
      );

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

// ==================== LEARNER SERVICE ====================

const learnerService = {
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
      return snapshot.docs.map(docSnapshot =>
        mapLearnerDoc(docSnapshot.id, docSnapshot.data() as DocumentData)
      );
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
      return snapshot.docs.map(docSnapshot =>
        mapLearnerDoc(docSnapshot.id, docSnapshot.data() as DocumentData)
      );
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
    dateOfBirthFrom?: string;
    dateOfBirthTo?: string;
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
        if (filters.status && learner.status !== filters.status) return false;

        if (filters.dateOfBirthFrom && learner.dateOfBirth < filters.dateOfBirthFrom) return false;
        if (filters.dateOfBirthTo && learner.dateOfBirth > filters.dateOfBirthTo) return false;

        if (filters.birthYearFrom && learner.birthYear < filters.birthYearFrom) return false;
        if (filters.birthYearTo && learner.birthYear > filters.birthYearTo) return false;

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
    dateOfBirth?: string;
    birthYear?: number;
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

      const normalizedDob =
        normalizeDateOfBirth(data.dateOfBirth) ||
        (data.birthYear ? normalizeDateOfBirth(data.birthYear) : null);

      if (!normalizedDob) {
        throw new Error('A valid date of birth (or birth year) is required');
      }

      const { birthYear, age } = deriveBirthYearAndAge(normalizedDob);

      const currentYear = new Date().getFullYear();
      if (birthYear < 1990 || birthYear > currentYear) {
        throw new Error(`Date of birth year must be between 1990 and ${currentYear}`);
      }

      const { studentId, nextIndex } = await generateSequentialStudentId(
        data.classId,
        classData.type,
        classData.level,
        classData.section
      );

      const learnerRef = doc(collection(db, 'learners'));
      batch.set(learnerRef, {
        studentId,
        studentIndex: nextIndex,
        classPrefix: generateClassPrefix(classData.type, classData.level, classData.section),
        fullName: data.fullName.trim(),

        dateOfBirth: normalizedDob,
        birthYear,
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

      console.log(`✅ Added learner ${data.fullName} (DOB ${normalizedDob}) with ID ${studentId}`);

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
            'fullName', 'gender', 'address',
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

          let normalizedDob = normalizeDateOfBirth(learner.dateOfBirth);
          if (!normalizedDob && learner.birthYear) {
            normalizedDob = normalizeDateOfBirth(learner.birthYear);
          }
          if (!normalizedDob) {
            throw new Error('Missing or invalid date of birth');
          }

          const { birthYear, age } = deriveBirthYearAndAge(normalizedDob);
          const currentYear = new Date().getFullYear();
          if (birthYear < 1990 || birthYear > currentYear) {
            throw new Error(`Invalid date of birth. Year must be between 1990 and ${currentYear}`);
          }

          const studentId = `${classPrefix}_${nextIndex.toString().padStart(3, '0')}`;
          generatedStudentIds.push(studentId);

          const allergies = learner.allergies
            ? learner.allergies.split(',').map(a => a.trim()).filter(a => a)
            : [];

          const learnerRef = doc(collection(db, 'learners'));
          batch.set(learnerRef, {
            studentId,
            studentIndex: nextIndex,
            classPrefix,
            fullName: learner.fullName.trim(),

            dateOfBirth: normalizedDob,
            birthYear,
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
        } catch (error: any) {
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
      return snapshot.docs.map(docSnapshot =>
        mapLearnerDoc(docSnapshot.id, docSnapshot.data() as DocumentData)
      );
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

      if (updates.dateOfBirth) {
        const normalizedDob = normalizeDateOfBirth(updates.dateOfBirth);
        if (!normalizedDob) {
          throw new Error('Invalid date of birth');
        }
        const { birthYear, age } = deriveBirthYearAndAge(normalizedDob);
        cleanUpdates.dateOfBirth = normalizedDob;
        cleanUpdates.birthYear = birthYear;
        cleanUpdates.age = age;
      } else if (updates.birthYear) {
        const derivedDob = normalizeDateOfBirth(updates.birthYear);
        if (derivedDob) {
          const { birthYear, age } = deriveBirthYearAndAge(derivedDob);
          cleanUpdates.dateOfBirth = derivedDob;
          cleanUpdates.birthYear = birthYear;
          cleanUpdates.age = age;
        } else {
          cleanUpdates.birthYear = updates.birthYear;
          cleanUpdates.age = calculateAge(updates.birthYear);
        }
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
      return snapshot.docs.map(docSnapshot =>
        mapLearnerDoc(docSnapshot.id, docSnapshot.data() as DocumentData)
      );
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
      return mapLearnerDoc(docSnapshot.id, docSnapshot.data() as DocumentData);
    } catch (error) {
      console.error('Error fetching learner by student ID:', error);
      throw error;
    }
  },

  getLearnersByGuardianPhone: async (phoneNumber: string): Promise<Learner[]> => {
    try {
      const raw = (phoneNumber || '').trim();
      const normalized = raw.replace(/\D/g, '');

      if (!raw || !normalized) return [];

      const learnersRef = collection(db, 'learners');

      let snapshot = await getDocs(
        query(
          learnersRef,
          where('guardianPhone', '==', raw),
          where('status', '==', 'active')
        )
      );

      if (snapshot.empty) {
        snapshot = await getDocs(
          query(
            learnersRef,
            where('parentPhone', '==', raw),
            where('status', '==', 'active')
          )
        );
      }

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

        return matched.map(docSnap =>
          mapLearnerDoc(docSnap.id, docSnap.data() as DocumentData)
        );
      }

      return snapshot.docs.map(docSnap =>
        mapLearnerDoc(docSnap.id, docSnap.data() as DocumentData)
      );
    } catch (error) {
      console.error('Error fetching learners by guardian phone:', error);
      return [];
    }
  },

  backfillDateOfBirth: async (): Promise<{ updated: number; skipped: number; total: number }> => {
    try {
      const learnersRef = collection(db, 'learners');
      const snapshot = await getDocs(learnersRef);

      let updated = 0;
      let skipped = 0;

      const CHUNK = 400;
      let batch = writeBatch(db);
      let opsInBatch = 0;
      const flushBatch = async () => {
        if (opsInBatch > 0) {
          await batch.commit();
          batch = writeBatch(db);
          opsInBatch = 0;
        }
      };

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() as DocumentData;

        if (data.dateOfBirth) {
          skipped++;
          continue;
        }

        const derivedDob =
          data.birthYear ? normalizeDateOfBirth(data.birthYear) : null;

        if (!derivedDob) {
          skipped++;
          continue;
        }

        const { birthYear, age } = deriveBirthYearAndAge(derivedDob);

        batch.update(docSnap.ref, {
          dateOfBirth: derivedDob,
          birthYear,
          age,
          updatedAt: serverTimestamp(),
        });
        updated++;
        opsInBatch++;

        if (opsInBatch >= CHUNK) {
          await flushBatch();
        }
      }

      await flushBatch();

      console.log(`✅ Backfill complete: ${updated} updated, ${skipped} skipped, ${snapshot.size} total`);
      return { updated, skipped, total: snapshot.size };
    } catch (error) {
      console.error('Error backfilling date of birth:', error);
      throw error;
    }
  },
};

// ==================== TEACHER SERVICE ====================
//
// Reads are served from teacher_assignments (the history log) and users.
// EVERY mutation of who-teaches-what goes through assignmentEngine, which
// enforces the rules transactionally on class_slots. The method names and
// signatures below are kept so existing hooks and pages keep working.

/** Map legacy end reasons used by the UI onto engine reasons. */
const toEngineReason = (
  reason: AssignmentEndReason | string | null | undefined,
  role: AssignmentRoleType
): assignmentEngine.EngineEndReason => {
  if (reason === 'handover') return role === 'tp' ? 'tp-completed' : 'returned-to-duty';
  if (reason === 'expired') return 'expired';
  if (reason === 'replaced') return 'replaced';
  return (reason as assignmentEngine.EngineEndReason) || 'removed';
};

const teacherService = {
  getTeachers: async (): Promise<Teacher[]> => {
    try {
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef,
        where('userType', '==', 'teacher'),
        orderBy('fullName', 'asc')
      );

      const snapshot = await getDocs(q);

      return snapshot.docs.map((docSnapshot) => {
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
          assignedClassId: data.formClassId ?? data.assignedClassId,
          assignedClassName: data.formClassName ?? data.assignedClassName,
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
    } catch (error) {
      console.error('❌ Error fetching teachers:', error);
      throw error;
    }
  },

  getTeachersByClass: async (classId: string): Promise<Teacher[]> => {
    try {
      const q = query(
        collection(db, 'users'),
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
          assignedClassId: data.formClassId ?? data.assignedClassId,
          assignedClassName: data.formClassName ?? data.assignedClassName,
          status: data.status || 'active',
        } as Teacher;
      });
    } catch (error) {
      console.error('Error fetching class teachers:', error);
      throw error;
    }
  },

  /** Full history (owner + delegate tenures, including ended rows). */
  getTeacherAssignments: async (teacherId: string): Promise<TeacherAssignment[]> => {
    try {
      const q = query(collection(db, 'teacher_assignments'), where('teacherId', '==', teacherId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(docSnap => mapAssignmentDoc(docSnap.id, docSnap.data() as DocumentData));
    } catch (error) {
      console.error('Error fetching teacher assignments:', error);
      return [];
    }
  },

  getAllTeacherAssignments: async (): Promise<TeacherAssignment[]> => {
    try {
      const snapshot = await getDocs(collection(db, 'teacher_assignments'));
      return snapshot.docs.map(docSnap => mapAssignmentDoc(docSnap.id, docSnap.data() as DocumentData));
    } catch (error) {
      console.error('Error fetching all teacher assignments:', error);
      return [];
    }
  },

  getTeacherAssignmentsByClass: async (classId: string): Promise<TeacherAssignment[]> => {
    return classService.getTeacherAssignmentsByClass(classId);
  },

  // ── Mutations (delegated to the engine) ──────────────────────────

  /**
   * substantive → Primary Owner (auto-replaces the previous owner; RULE 2).
   * tp / leave-cover → delegate with mandatory start + end dates (RULES 3 & 4).
   * Form Teacher is the subject "Form Teacher"; `isFormTeacher` on any
   * other subject is ignored.
   */
  assignTeacherToClass: async (
    teacherId: string,
    classId: string,
    subject: string,
    isFormTeacher: boolean = false,
    options: {
      roleType?: AssignmentRoleType;
      startDate?: Date;
      endDate?: Date | null;
      coversTeacherId?: string | null;
    } = {}
  ): Promise<void> => {
    const roleType: AssignmentRoleType = options.roleType || 'substantive';
    let subjectName = (subject || '').trim();
    if (!subjectName && isFormTeacher) subjectName = FORM_TEACHER_SUBJECT;
    if (isFormTeacher && subjectName !== FORM_TEACHER_SUBJECT) {
      console.warn(
        `isFormTeacher=true ignored for "${subjectName}". Assign "${FORM_TEACHER_SUBJECT}" separately.`
      );
    }

    if (roleType === 'substantive') {
      await assignmentEngine.assignOwner({
        teacherId,
        classId,
        subject: subjectName,
        startDate: options.startDate,
      });
      return;
    }

    if (!options.endDate) {
      throw new assignmentEngine.AssignmentRuleError(
        'DATES_REQUIRED',
        'Covering and TP assignments require an end date.'
      );
    }
    await assignmentEngine.assignDelegate({
      teacherId,
      classId,
      subject: subjectName,
      role: roleType as assignmentEngine.DelegateRole,
      startDate: options.startDate ?? new Date(),
      endDate: options.endDate,
    });
  },

  assignFormTeacherOnly: async (teacherId: string, classId: string): Promise<void> => {
    await assignmentEngine.assignOwner({ teacherId, classId, subject: FORM_TEACHER_SUBJECT });
  },

  /**
   * End one assignment row.
   *   delegate row → delegation ends, owner operates again (handback).
   *   owner row    → owner vacates the slot (a running cover continues).
   *   stale legacy row not referenced by a slot → just archived.
   */
  endAssignment: async (
    assignmentId: string,
    reason: AssignmentEndReason = 'removed'
  ): Promise<void> => {
    const ref = doc(db, 'teacher_assignments', assignmentId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Assignment not found');
    const data = snap.data() as DocumentData;
    if (data.status === 'ended') return;

    const role = roleOf(data);
    const slotId =
      data.slotId || assignmentEngine.slotIdForNormalized(data.classId, rowNormalizedSubject(data));
    const engineReason = toEngineReason(reason, role);

    const handled = isCoverRole(role)
      ? await assignmentEngine.endDelegation(slotId, engineReason, { expectedAssignmentId: assignmentId })
      : await assignmentEngine.removeOwner(slotId, engineReason, { expectedAssignmentId: assignmentId });

    if (!handled) {
      // Row isn't the slot's current owner/delegate (legacy leftover) — archive it.
      await updateDoc(ref, {
        status: 'ended',
        endReason: engineReason,
        endDate: Timestamp.fromDate(new Date()),
        updatedAt: serverTimestamp(),
      });
    }
  },

  /**
   * Same-kind duplicates on a slot (2+ owners or 2+ covers). Owner + one
   * cover is NOT an overlap. Use this to populate the Overlaps modal so
   * detection and resolution agree.
   */
  findSlotOverlaps: (classNames?: Record<string, string>) =>
    assignmentEngine.findSlotOverlaps(classNames),

  /** Keep one assignment, archive the other same-kind rows on that slot. */
  resolveSlotConflict: async (
    classId: string,
    normalizedSubject: string,
    keepAssignmentId: string
  ): Promise<assignmentEngine.ResolveResult> => {
    return assignmentEngine.resolveSlotOverlap(classId, normalizedSubject, keepAssignmentId);
  },

  /** Tidies expired covers/TP in the log. Authority already reverted at expiry. */
  reactivateExpiredCovers: async (): Promise<number> => {
    try {
      return await assignmentEngine.closeExpiredDelegations();
    } catch (error) {
      console.error('Error closing expired delegations:', error);
      return 0;
    }
  },

  getTeacherSubjectsForClass: async (teacherId: string, classId: string): Promise<string[]> => {
    try {
      const slots = await assignmentEngine.getSlotsForClass(classId);
      const now = new Date();
      return slots
        .filter(
          s =>
            s.ownerTeacherId === teacherId ||
            (s.delegateTeacherId === teacherId &&
              assignmentEngine.delegationState(s, now) !== 'expired')
        )
        .map(s => s.subject);
    } catch (error) {
      console.error('Error getting teacher subjects for class:', error);
      return [];
    }
  },

  isFormTeacherForClass: async (teacherId: string, classId: string): Promise<boolean> => {
    try {
      const slot = await assignmentEngine.getSlot(classId, FORM_TEACHER_SUBJECT);
      return slot?.ownerTeacherId === teacherId;
    } catch (error) {
      console.error('Error checking form teacher status:', error);
      return false;
    }
  },

  /**
   * on_leave            → status only; ownership untouched. Assign covers next.
   * on_leave → active   → "Return to Duty": leave covers end, TP continues.
   * other               → status only.
   */
  updateTeacherStatus: async (
    teacherId: string,
    status: 'active' | 'inactive' | 'on_leave' | 'transferred'
  ): Promise<void> => {
    const teacherDoc = await getDoc(doc(db, 'users', teacherId));
    if (!teacherDoc.exists()) throw new Error('Teacher not found');
    const previous = teacherDoc.data().status || 'active';

    if (status === 'on_leave' && previous !== 'on_leave') {
      await assignmentEngine.setTeacherOnLeave(teacherId);
      return;
    }
    if (status === 'active' && previous === 'on_leave') {
      await assignmentEngine.returnTeacherToDuty(teacherId);
      return;
    }
    await updateDoc(doc(db, 'users', teacherId), { status, updatedAt: serverTimestamp() });
  },

  updateTeacher: async (teacherId: string, updates: Partial<Teacher>): Promise<void> => {
    try {
      const teacherRef = doc(db, 'users', teacherId);
      const teacherDoc = await getDoc(teacherRef);
      if (!teacherDoc.exists()) throw new Error('Teacher not found');
      const current = teacherDoc.data() as DocumentData;

      const firestoreUpdates: Record<string, any> = { updatedAt: serverTimestamp() };
      const nameChanged =
        updates.name !== undefined &&
        updates.name.trim() !== '' &&
        updates.name !== (current.fullName || current.name);

      if (updates.name !== undefined) {
        firestoreUpdates.fullName = updates.name;
        firestoreUpdates.name = updates.name;
      }
      if (updates.email !== undefined) firestoreUpdates.email = updates.email;
      if (updates.phone !== undefined) firestoreUpdates.phone = updates.phone;
      if (updates.department !== undefined) firestoreUpdates.department = updates.department;
      if (updates.subjects !== undefined) firestoreUpdates.subjects = updates.subjects;
      if (updates.dateOfBirth !== undefined) {
        firestoreUpdates.dateOfBirth = normalizeDateOfBirth(updates.dateOfBirth);
      }

      await updateDoc(teacherRef, firestoreUpdates);

      // Keep denormalized names in sync on slots, open rows and class pointers.
      // (Ended history rows keep the name as it was at the time.)
      if (nameChanged) {
        const newName = updates.name!;
        const [openRows, slotRows, classRows] = await Promise.all([
          getDocs(query(collection(db, 'teacher_assignments'), where('teacherId', '==', teacherId), where('status', '==', 'active'))),
          assignmentEngine.getSlotsForTeacher(teacherId),
          getDocs(query(collection(db, 'classes'), where('formTeacherId', '==', teacherId))),
        ]);
        const batch = writeBatch(db);
        openRows.docs.forEach(d => batch.update(d.ref, { teacherName: newName, updatedAt: serverTimestamp() }));
        slotRows.forEach(({ slot, relation }) =>
          batch.update(doc(db, 'class_slots', slot.id), {
            [relation === 'owner' ? 'ownerTeacherName' : 'delegateTeacherName']: newName,
            updatedAt: serverTimestamp(),
          })
        );
        classRows.docs.forEach(d => batch.update(d.ref, { formTeacherName: newName, updatedAt: serverTimestamp() }));
        await batch.commit();
      }

      if (updates.status !== undefined && updates.status !== (current.status || 'active')) {
        await teacherService.updateTeacherStatus(teacherId, updates.status as any);
      }
    } catch (error) {
      console.error('Error updating teacher:', error);
      throw error;
    }
  },

  /**
   * Blocks while the teacher holds any role. History rows, results and
   * attendance are never deleted (names are denormalized on them).
   * Prefer setting status 'inactive' over deleting.
   */
  deleteTeacher: async (teacherId: string): Promise<void> => {
    const roles = await assignmentEngine.getSlotsForTeacher(teacherId);
    const now = new Date();
    const live = roles.filter(
      r => r.relation === 'owner' || assignmentEngine.delegationState(r.slot, now) !== 'expired'
    );
    if (live.length > 0) {
      throw new Error(
        `Cannot delete: teacher still holds ${live.length} role(s) ` +
        `(${live.map(r => `${r.slot.subject} ${r.slot.className}`).join(', ')}). Remove or transfer them first.`
      );
    }
    await deleteDoc(doc(db, 'users', teacherId));
  },

  /** Remove one subject (or the Form Teacher role) from a teacher in a class. */
  removeTeacherSubject: async (teacherId: string, classId: string, subject: string): Promise<void> => {
    const slot = await assignmentEngine.getSlot(classId, subject);
    if (slot?.ownerTeacherId === teacherId) {
      await assignmentEngine.removeOwner(slot.id, 'removed', {
        expectedAssignmentId: slot.ownerAssignmentId ?? undefined,
      });
      return;
    }
    if (slot?.delegateTeacherId === teacherId) {
      await assignmentEngine.endDelegation(slot.id, 'cancelled', {
        expectedAssignmentId: slot.delegateAssignmentId ?? undefined,
      });
      return;
    }
    throw new Error(`${subject} is not currently assigned to this teacher in this class.`);
  },

  removeTeacherFromClass: async (teacherId: string, classId: string): Promise<void> => {
    await assignmentEngine.removeTeacherFromClass(teacherId, classId, 'removed');
  },

  getTeacherFullAssignments: async (teacherId: string): Promise<{
    classId: string;
    className: string;
    subjects: string[];
    isFormTeacher: boolean;
  }[]> => {
    try {
      const rows = await assignmentEngine.getSlotsForTeacher(teacherId);
      const now = new Date();
      const byClass = new Map<string, { className: string; subjects: Set<string>; isFormTeacher: boolean }>();

      for (const { slot, relation } of rows) {
        if (relation === 'delegate' && assignmentEngine.delegationState(slot, now) === 'expired') continue;
        if (!byClass.has(slot.classId)) {
          byClass.set(slot.classId, { className: slot.className, subjects: new Set(), isFormTeacher: false });
        }
        const entry = byClass.get(slot.classId)!;
        if (slot.isFormTeacherSlot) {
          if (relation === 'owner') entry.isFormTeacher = true;
        } else {
          entry.subjects.add(slot.subject);
        }
      }

      return Array.from(byClass.entries()).map(([classId, d]) => ({
        classId,
        className: d.className,
        subjects: Array.from(d.subjects),
        isFormTeacher: d.isFormTeacher,
      }));
    } catch (error) {
      console.error('Error getting teacher full assignments:', error);
      return [];
    }
  },

  /** Atomic, conflict-free migration between classes (see engine). */
  transferTeacher: async (
    teacherId: string,
    fromClassId: string,
    toClassId: string,
    subjectMapping?: Record<string, string>
  ): Promise<assignmentEngine.TransferReport> => {
    return assignmentEngine.transferTeacher({ teacherId, fromClassId, toClassId, subjectMapping });
  },

  // ── New capabilities ─────────────────────────────────────────────
  setTeacherOnLeave: assignmentEngine.setTeacherOnLeave,
  returnTeacherToDuty: assignmentEngine.returnTeacherToDuty,
  handBackTp: assignmentEngine.handBackTp,
  getUncoveredSlots: assignmentEngine.getUncoveredSlots,

  /** One-off: build class_slots from existing rows. Run once after deploy. */
  repairAssignments: (opts?: { dryRun?: boolean }) => assignmentEngine.migrateToSlots(opts),
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

// ==================== EXPORT ALL SERVICES & HELPERS ====================
export {
  classService,
  learnerService,
  teacherService,
  resultsAnalysisService,

  normalizeSubjectName,

  parseClassName,
  generateStudentId,
  generateClassPrefix,
  generateSequentialStudentId,
  calculateGenderStats,
  calculateAge,
  toDate,

  normalizeDateOfBirth,
  deriveBirthYearAndAge,

  // New in this revision
  mapAssignmentDoc,
  parseLocalDateInput,
  toEndOfDay,
  formatLocalYMD,
  FORM_TEACHER_SUBJECT,
  assignmentEngine,
};