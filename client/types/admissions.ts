// @/types/admissions.ts
//
// Admissions: a new learner goes through the school's physical process,
// then an ADMISSIONS OFFICER (a teacher given that role by the admin)
// enrols them on the system. The system places the learner in the intake
// class with the most room, generates their student id, and prints an
// admission slip. Admin and officers watch the classes fill up.

/** `staff_roles/{teacherId}__admissions-officer` */
export const ADMISSIONS_OFFICER_ROLE = 'admissions-officer';

export interface StaffRole {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherEmail?: string;
  role: typeof ADMISSIONS_OFFICER_ROLE;
  status: 'active' | 'ended';
  startDate?: Date;
  endDate?: Date | null;
  assignedBy?: string;
  assignedByName?: string;
}

export interface IntakeLevel {
  type: 'grade' | 'form';
  level: number;
}

/** `admission_settings/{year}` — one intake per academic year. */
export interface IntakeSettings {
  year: number;
  isOpen: boolean;
  /** Levels the officers may admit into (default Form 1). */
  levels: IntakeLevel[];
  /** Places per class unless overridden in `capacities`. */
  defaultCapacity: number;
  /** classId → places. */
  capacities: Record<string, number>;
  /** Classes left out of automatic placement. */
  excludedClassIds: string[];
  /** Admissions so far (also the slip number sequence). */
  seq: number;
  updatedAt?: any;
  updatedByName?: string;
}

/** One class as admissions sees it. */
export interface IntakeClass {
  id: string;
  name: string;
  type: 'grade' | 'form';
  level: number;
  section: string;
  capacity: number;
  excluded: boolean;
  /** Learners in the class for the intake year (all routes in). */
  total: number;
  male: number;
  female: number;
  /** Of which admitted through Admissions this intake. */
  admittedHere: number;
  /** Highest student index ever used in the class (any status). */
  maxIndex: number;
  formTeacherName?: string;
}

export type AdmissionType = 'new_intake' | 'transfer_in';

/** What the officer types in. */
export interface AdmissionInput {
  fullName: string;
  preferredName?: string;
  gender: 'male' | 'female';
  dateOfBirth: string;          // YYYY-MM-DD
  address: string;
  guardian: string;
  guardianPhone: string;
  alternativeGuardian?: string;
  alternativeGuardianPhone?: string;
  guardianRelationship?: string;
  sponsor: string;
  dateOfFirstEntry: string;     // YYYY-MM-DD
  previousSchool?: string;
  previousGrade?: string;
  /** ECZ examination number of the learner's last national exam. */
  examNumber?: string;
  medicalNotes?: string;
  allergies?: string[];
  admissionType: AdmissionType;
  level: IntakeLevel;
  /** Admin only: place in this class instead of the automatic choice. */
  classIdOverride?: string;
}

/** `admissions/{year}-{seq}` — the admission record behind a slip. */
export interface AdmissionRecord {
  id: string;
  admissionNumber: string;      // ADM-2027-0001
  year: number;
  seq: number;
  learnerId: string;
  studentId: string;
  fullName: string;
  gender: 'male' | 'female';
  dateOfBirth: string;
  classId: string;
  className: string;
  classType: 'grade' | 'form';
  classLevel: number;
  formTeacherName?: string | null;
  guardian: string;
  guardianPhone: string;
  sponsor: string;
  admissionType: AdmissionType;
  dateOfFirstEntry: string;
  previousSchool?: string | null;
  examNumber?: string | null;
  placement: 'auto' | 'manual';
  admittedBy: string;
  admittedByName: string;
  admittedAt?: any;
  status: 'admitted' | 'cancelled';
  cancelledAt?: any;
  cancelledByName?: string | null;
  cancelReason?: string | null;
}

export interface PlacementChoice {
  classId: string;
  reason: string;
}
