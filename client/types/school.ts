export interface Learner {
  id: string;
  name: string;
  age: number;
  parentPhone: string;
  studentId: string;
  classId: string; // CHANGED: from className to classId (to match service layer)
  enrollmentDate: Date;
  status: 'active' | 'transferred' | 'graduated' | 'archived';
  // Optional fields for backward compatibility
  className?: string; // KEEP: for backward compatibility
  graduationYear?: number;
  transferredAt?: Date;
  transferredBy?: string;
  archivedAt?: Date;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Teacher {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  subjects: string[];
  assignedClasses: string[];
  // Added from your service layer
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

export interface Class {
  id: string;
  name: string;
  year: number;
  type: 'grade' | 'form';
  level: number;
  section: string;
  students: number;
  teachers: string[]; // FIXED: Added this required field
  // For backward compatibility
  formTeacherId?: string;
  formTeacherName?: string;
  // Existing
  isActive: boolean;
  createdDate?: Date;
  nextYearClassId?: string;
  archived?: boolean;
  archivedAt?: Date;
  createdBy?: string;
  createdAt?: Date; // FIXED: Changed from Date to optional Date (allows both Date and undefined)
  updatedAt?: Date;
}

// For CSV imports (must match service layer field names)
export interface CSVImportData {
  name: string;
  age: number;
  parentPhone: string;
  classId?: string; // Added for consistency
  className?: string; // Keep for backward compatibility
}

export interface ClassCSVImportData {
  name: string;
  year: number;
  // Optional - can be derived from name
  type?: 'grade' | 'form';
  level?: number;
  section?: string;
}

// Dashboard stats interfaces
export interface DashboardStats {
  totalClasses: number;
  totalStudents: number;
  averageClassSize: number;
  totalTeachers: number;
  activeTeachers: number;
  teachersByDepartment: Record<string, number>;
  averagePassRate?: number;
  examsGraded?: number;
  totalExams?: number;
}

// User remains the same
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