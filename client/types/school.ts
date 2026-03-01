// ==================== LEARNER TYPE WITH ENHANCED FIELDS ====================
export interface Learner {
  id: string;
  
  // Core Identification
  studentId: string;
  studentIndex: number; // Sequential number within class (1, 2, 3...)
  classPrefix: string; // e.g., "G10B", "F3A"
  
  // Personal Information
  fullName: string; // Primary name field
  preferredName?: string; // Optional preferred/nickname
  birthYear: number; // Year of birth
  age: number; // Calculated from birthYear - make it required, not optional
  gender: 'male' | 'female'; // Made required (no longer optional)
  
  // Address Information
  address: string; // Full address as single string
  
  // Guardian Information
  guardian: string; // Primary guardian name
  guardianPhone: string; // Primary guardian phone (with +26 prefix handling)
  alternativeGuardian?: string; // Secondary/backup guardian
  alternativeGuardianPhone?: string; // Secondary guardian phone
  
  // Sponsor Information
  sponsor: string; // Sponsor name (e.g., "Government Bursary", "Self", "NGO")
  sponsorshipDetails?: {
    type: 'government' | 'corporate' | 'ngo' | 'private' | 'self';
    sponsorId?: string;
    startDate?: Date;
    endDate?: Date;
    coveragePercentage?: number;
    contactPerson?: string;
    contactPhone?: string;
    contactEmail?: string;
  };
  
  // Academic Information
  classId: string;
  className: string;
  classType: 'grade' | 'form';
  classLevel: number;
  classSection: string;
  dateOfFirstEntry: string; // ISO date string (YYYY-MM-DD)
  enrollmentDate: Date;
  previousSchool?: string;
  previousGrade?: string;
  
  // Health & Special Needs
  medicalNotes?: string;
  allergies?: string[]; // Array of allergies
  
  // System Fields
  status: 'active' | 'transferred' | 'graduated' | 'archived';
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
  
  // Transfer/Graduation tracking
  graduationYear?: number;
  transferredAt?: Date;
  transferredToClass?: string;
  archivedAt?: Date;
  
  // Backward compatibility fields (kept for existing code)
  name?: string; // Maps to fullName
  parentPhone?: string; // Maps to guardianPhone
}

// ==================== LEARNER CSV IMPORT WITH ENHANCED FIELDS ====================
export interface CSVLearnerData {
  // Required fields
  fullName: string;
  gender: 'male' | 'female';
  birthYear: number;
  address: string;
  guardian: string;
  guardianPhone: string;
  sponsor: string;
  dateOfFirstEntry: string; // YYYY-MM-DD format
  
  // Optional fields
  preferredName?: string;
  alternativeGuardian?: string;
  alternativeGuardianPhone?: string;
  previousSchool?: string;
  medicalNotes?: string;
  allergies?: string; // Comma-separated list
  
  // System fields (not in CSV but used internally)
  classId?: string; // Will be added programmatically
  className?: string; // For reference
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
  
  // Form teacher info
  isFormTeacher?: boolean;
  assignedClassId?: string;
  assignedClassName?: string;
  
  // Employment details
  employmentDate?: Date;
  status?: 'active' | 'inactive' | 'on_leave' | 'transferred'; // Added 'transferred' status
  qualifications?: string[];
  specialization?: string;
  
  // System fields
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
  
  // Form teacher
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
  
  // Class progression
  isActive: boolean;
  createdDate?: Date;
  nextYearClassId?: string; // For auto-promotion
  
  // System fields
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
  normalizedSubjectId?: string; // Normalized subject for matching
  isFormTeacher: boolean;
  assignedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==================== CSV IMPORT INTERFACES ====================
export interface CSVImportData {
  // Legacy - kept for backward compatibility
  name?: string;
  age?: number;
  gender?: 'male' | 'female';
  parentPhone?: string;
  classId?: string;
  className?: string;
  
  // New fields
  fullName?: string;
  birthYear?: number;
  address?: string;
  guardian?: string;
  guardianPhone?: string;
  sponsor?: string;
  dateOfFirstEntry?: string;
}

export interface ClassCSVImportData {
  name: string; // e.g., "Grade 10B" or "Form 3A"
  year: number;
  type?: 'grade' | 'form'; // Optional, will be parsed from name
  level?: number; // Optional, will be parsed from name
  section?: string; // Optional, will be parsed from name
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
  
  // Sponsorship stats
  sponsorshipStats?: {
    totalSponsored: number;
    governmentSponsored: number;
    corporateSponsored: number;
    ngoSponsored: number;
    privateSponsored: number;
    selfSponsored: number;
  };
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
  
  // For teachers
  subjects?: string[];
  department?: string;
  assignedClasses?: string[];
  
  // For parents
  childrenIds?: string[]; // Learner IDs linked to this parent
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
  sat: { // Sat for exam (number of students who wrote)
    boys: number;
    girls: number;
    total: number;
  };
  gradeDistribution: GradeDistribution[];
  performance: {
    quality: { // Grades 1-6
      boys: number;
      girls: number;
      total: number;
      percentage: number;
    };
    quantity: { // Grades 1-8
      boys: number;
      girls: number;
      total: number;
      percentage: number;
    };
    fail: { // Grade 9
      boys: number;
      girls: number;
      total: number;
      percentage: number;
    };
  };
  subjectPerformance?: Array<{
    subject: string;
    teacher: string;
    quality: number; // Percentage
    quantity: number; // Percentage
    fail: number; // Percentage
  }>;
}

export interface SubjectPerformance {
  subject: string;
  teacher: string;
  classCount: number;
  studentCount: number;
  averageGrade: number;
  qualityRate: number; // Percentage
  quantityRate: number; // Percentage
  failRate: number; // Percentage
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

// ==================== STUDENT ID RELATED TYPES ====================
export interface StudentIdInfo {
  studentId: string;
  prefix: string;
  index: number;
  classType: 'grade' | 'form';
  level: number;
  section: string;
}

export interface BulkImportResult {
  success: number;
  failed: number;
  errors: string[];
  studentIds: string[]; // Generated student IDs for success modal
}

// ==================== SPONSORSHIP TYPES ====================
export type SponsorType = 'government' | 'corporate' | 'ngo' | 'private' | 'self';

export interface SponsorshipDetails {
  type: SponsorType;
  sponsorId?: string;
  sponsorName: string;
  startDate?: Date;
  endDate?: Date;
  coveragePercentage?: number;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
}

// ==================== FILTER TYPES ====================
export interface LearnerFilterOptions {
  classId?: string;
  searchTerm?: string;
  gender?: 'male' | 'female';
  sponsor?: string;
  sponsorType?: SponsorType;
  birthYearFrom?: number;
  birthYearTo?: number;
  status?: 'active' | 'transferred' | 'graduated' | 'archived';
  enrollmentDateFrom?: Date;
  enrollmentDateTo?: Date;
}

// ==================== TEACHER STATUS UPDATE TYPE ====================
export interface TeacherStatusUpdate {
  teacherId: string;
  status: 'active' | 'inactive' | 'on_leave' | 'transferred';
}