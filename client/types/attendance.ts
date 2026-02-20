// @/types/attendance.ts
import { Timestamp } from 'firebase/firestore';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  date: string; // YYYY-MM-DD format
  status: AttendanceStatus;
  excuseReason?: string;
  markedBy: string; // teacher ID
  markedByName: string;
  timestamp: Timestamp | Date;
  updatedAt?: Timestamp | Date;
  
  // For gender-based reporting
  studentGender?: 'male' | 'female';
}

export interface DailyAttendance {
  id: string; // Format: classId_YYYY-MM-DD
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