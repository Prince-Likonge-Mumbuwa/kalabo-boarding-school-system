// ==================== LEARNER TYPE WITH GENDER ====================
export interface Learner {
  id: string;
  name: string;
  age: number;
  gender?: 'male' | 'female';
  parentPhone: string;
  studentId: string;
  classId: string;
  enrollmentDate: Date;
  status: 'active' | 'transferred' | 'graduated' | 'archived';
  
  // Optional fields for backward compatibility
  className?: string;
  graduationYear?: number;
  transferredAt?: Date;
  transferredBy?: string;
  archivedAt?: Date;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==================== LEARNER CSV IMPORT WITH GENDER ====================
export interface CSVLearnerData {
  name: string;
  age: number;
  gender: 'male' | 'female';
  parentPhone: string;
  classId?: string;
}

// ==================== TEACHER TYPE ====================
export interface Teacher {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  subjects: string[];
  assignedClasses: string[];
  
  // Added from service layer
  isFormTeacher?: boolean;
  assignedClassId?: string;
  assignedClassName?: string;
  employmentDate?: Date;
  status?: 'active' | 'inactive' | 'on_leave';
  
  // Existing
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==================== CLASS TYPE ====================
export interface Class {
  id: string;
  name: string;
  year: number;
  type: 'grade' | 'form';
  level: number;
  section: string;
  students: number;
  teachers: string[];
  
  // For backward compatibility
  formTeacherId?: string;
  formTeacherName?: string;
  
  // Gender statistics
  genderStats?: {
    boys: number;
    girls: number;
    unspecified: number;
    boysPercentage: number;
    girlsPercentage: number;
  };
  
  // Existing
  isActive: boolean;
  createdDate?: Date;
  nextYearClassId?: string;
  archived?: boolean;
  archivedAt?: Date;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==================== TEACHER ASSIGNMENT INTERFACE ====================
export interface TeacherAssignment {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherEmail?: string;
  classId: string;
  className: string;
  subject: string;
  normalizedSubjectId?: string;
  isFormTeacher: boolean;
  assignedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==================== CSV IMPORT INTERFACES ====================
export interface CSVImportData {
  name: string;
  age: number;
  gender?: 'male' | 'female';
  parentPhone: string;
  classId?: string;
  className?: string;
}

export interface ClassCSVImportData {
  name: string;
  year: number;
  type?: 'grade' | 'form';
  level?: number;
  section?: string;
}

// ==================== DASHBOARD STATS ====================
export interface DashboardStats {
  totalClasses: number;
  totalStudents: number;
  averageClassSize: number;
  totalTeachers: number;
  activeTeachers: number;
  teachersByDepartment: Record<string, number>;
  
  // Gender statistics
  genderStats?: {
    totalBoys: number;
    totalGirls: number;
    unspecified: number;
    boysPercentage: number;
    girlsPercentage: number;
  };
  
  // Academic stats
  averagePassRate?: number;
  examsGraded?: number;
  totalExams?: number;
}

// ==================== USER TYPE ====================
export interface User {
  id: string;
  email: string;
  name: string;
  userType: 'admin' | 'teacher' | 'parent' | 'learner';
  createdAt: Date;
  updatedAt: Date;
  phone?: string;
  profileImage?: string;
  schoolId?: string;
  isActive: boolean;
}

// ==================== RESULTS ANALYSIS TYPES ====================
export interface GradeDistribution {
  grade: number;
  boys: number;
  girls: number;
  total: number;
  percentage: number;
  passStatus: 'distinction' | 'merit' | 'credit' | 'satisfactory' | 'fail';
}

export interface ClassPerformance {
  classId: string;
  className: string;
  candidates: {
    boys: number;
    girls: number;
    total: number;
  };
  sat: {
    boys: number;
    girls: number;
    total: number;
  };
  gradeDistribution: GradeDistribution[];
  performance: {
    quality: {
      boys: number;
      girls: number;
      total: number;
      percentage: number;
    };
    quantity: {
      boys: number;
      girls: number;
      total: number;
      percentage: number;
    };
    fail: {
      boys: number;
      girls: number;
      total: number;
      percentage: number;
    };
  };
  subjectPerformance?: Array<{
    subject: string;
    teacher: string;
    quality: number;
    quantity: number;
    fail: number;
  }>;
}

export interface SubjectPerformance {
  subject: string;
  teacher: string;
  classCount: number;
  studentCount: number;
  averageGrade: number;
  qualityRate: number;
  quantityRate: number;
  failRate: number;
}

// ==================== GENDER MIGRATION TYPES ====================
export interface GenderUpdate {
  learnerId: string;
  learnerName: string;
  className: string;
  currentGender?: 'male' | 'female';
  newGender: 'male' | 'female';
}

export interface GenderStats {
  boys: number;
  girls: number;
  unspecified: number;
  total: number;
  boysPercentage: number;
  girlsPercentage: number;
}
