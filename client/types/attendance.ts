import { Timestamp } from 'firebase/firestore';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type AttendanceType = 'daily' | 'periodic';

// Base interface with common fields
export interface BaseAttendanceRecord {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  date: string;
  status: AttendanceStatus;
  excuseReason?: string;
  markedBy: string;
  markedByName: string;
  timestamp: Timestamp | Date;
  updatedAt?: Timestamp | Date;
  studentGender?: 'male' | 'female';
  attendanceType: AttendanceType;
}

// Daily roll call
export interface DailyAttendanceRecord extends BaseAttendanceRecord {
  attendanceType: 'daily';
  rollCallTime?: string;
}

// Periodic attendance
export interface PeriodicAttendanceRecord extends BaseAttendanceRecord {
  attendanceType: 'periodic';
  subject: string;
  period: number; // 1-8
  lessonStartTime?: string;
  lessonEndTime?: string;
}

// Union type for all attendance records
export type AttendanceRecord = DailyAttendanceRecord | PeriodicAttendanceRecord;

export interface DailyAttendance {
  id: string;
  classId: string;
  className: string;
  date: string;
  records: AttendanceRecord[];
  summary: {
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    boysPresent: number;
    girlsPresent: number;
    boysAbsent: number;
    girlsAbsent: number;
  };
  lastUpdated: Timestamp | Date;
  updatedBy: string;
}

export interface AttendanceFilters {
  classId?: string;
  startDate?: string;
  endDate?: string;
  status?: AttendanceStatus;
  studentId?: string;
  attendanceType?: AttendanceType;
  subject?: string;
  period?: number;
  teacherId?: string;
}

export interface AttendanceStats {
  date: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  attendanceRate: number;
}

export interface StudentAttendanceSummary {
  studentId: string;
  studentName: string;
  gender?: 'male' | 'female';
  totalDays: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  attendanceRate: number;
  last30Days: {
    present: number;
    absent: number;
    late: number;
    excused: number;
  };
}

// New types for analytics
export interface LateArrival {
  studentId: string;
  studentName: string;
  className: string;
  date: string;
  dailyStatus: AttendanceStatus;
  firstPeriodStatus: AttendanceStatus;
  timeDetected?: string;
}

export interface SubjectTruancy {
  studentId: string;
  studentName: string;
  className: string;
  subject: string;
  teacherName: string;
  totalSessions: number;
  attended: number;
  missed: number;
  attendanceRate: number;
  trend: 'improving' | 'declining' | 'stable';
}

export interface TeacherActivity {
  teacherId: string;
  teacherName: string;
  classId: string;
  className: string;
  subject?: string;
  date: string;
  timeRecorded: string;
  attendanceType: AttendanceType;
  studentsMarked: number;
}

export interface RiskAnalysis {
  studentId: string;
  studentName: string;
  className: string;
  gender?: 'male' | 'female';
  dailyStats: {
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    rate: number;
  };
  subjectStats: Array<{
    subject: string;
    teacherName: string;
    totalSessions: number;
    present: number;
    absent: number;
    rate: number;
    trend: 'improving' | 'declining' | 'stable';
  }>;
  ditchingIncidents: Array<{
    date: string;
    subject: string;
    teacher: string;
    period: number;
  }>;
  lateArrivals: Array<{
    date: string;
    firstPeriodSubject: string;
    firstPeriodTeacher: string;
    arrivalTime?: string;
  }>;
  riskLevel: 'high' | 'medium' | 'low';
  riskFactors: string[];
  consecutiveAbsences: number;
}

export interface TeacherPeriodicSummary {
  teacherId: string;
  teacherName: string;
  classId: string;
  className: string;
  subject: string;
  period: number;
  date: string;
  totalStudents: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  timeRecorded: string;
}

export interface FullPeriodicData {
  byPeriod: Record<number, PeriodicAttendanceRecord[]>;
  bySubject: Record<string, PeriodicAttendanceRecord[]>;
  teachers: Set<string>;
}