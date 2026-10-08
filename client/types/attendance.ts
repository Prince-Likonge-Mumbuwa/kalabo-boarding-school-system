// @/types/attendance.ts
import { Timestamp } from 'firebase/firestore';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type SessionKind = 'daily' | 'periodic';

export interface AttendanceSession {
  id: string;
  classId: string;
  className: string;
  date: string;
  kind: SessionKind;
  subject?: string;
  period?: number;
  markedBy: string;
  markedByName: string;
  markedAt: Timestamp | Date;
  roster: Record<string, AttendanceStatus>;
  excuseReasons?: Record<string, string>;
  summary: {
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
  };
  schemaVersion: 1;
}

export function makeSessionId(
  classId: string,
  date: string,
  kind: SessionKind,
  period?: number,
  normalizedSubject?: string,
): string {
  if (kind === 'daily') return `${classId}_${date}_daily`;
  if (period === undefined || period === null) {
    throw new Error(`makeSessionId: periodic session requires a period (${classId} ${date})`);
  }
  if (!normalizedSubject) {
    throw new Error(`makeSessionId: periodic session requires a subject (${classId} ${date} p${period})`);
  }
  return `${classId}_${date}_p${period}_${normalizedSubject}`;
}

export function computeSessionSummary(
  roster: Record<string, AttendanceStatus>,
): AttendanceSession['summary'] {
  let present = 0, absent = 0, late = 0, excused = 0;
  for (const s of Object.values(roster)) {
    if (s === 'present') present++;
    else if (s === 'absent') absent++;
    else if (s === 'late') late++;
    else if (s === 'excused') excused++;
  }
  return { total: present + absent + late + excused, present, absent, late, excused };
}

export interface AttendanceDailyRollup {
  id: string;
  classId: string;
  className: string;
  date: string;
  daily?: {
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    rate: number;
    boysPresent: number;
    girlsPresent: number;
    boysAbsent: number;
    girlsAbsent: number;
  };
  periodicTotals: {
    sessionCount: number;
    byPeriod: Record<number, { present: number; absent: number; late: number; excused: number; total: number }>;
    bySubject: Record<string, { present: number; absent: number; late: number; excused: number; total: number }>;
    distinctTeachers: string[];
  };
  lateArrivals: Array<{
    studentId: string;
    studentName: string;
    date: string;
    firstPeriodSubject: string;
    timeDetected?: string;
  }>;
  subjectAlerts: Array<{
    studentId: string;
    studentName: string;
    subject: string;
    rate: number;
    missed: number;
    total: number;
  }>;
  updatedAt: Timestamp | Date;
  schemaVersion: 1;
}

export function makeDailyRollupId(classId: string, date: string): string {
  return `${classId}_${date}`;
}

export interface WindowStats {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  rate: number;
}

export interface StudentAttendanceIndex {
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  last7Days: WindowStats;
  last30Days: WindowStats;
  term: WindowStats;
  riskLevel: 'high' | 'medium' | 'low';
  riskFactors: string[];
  consecutiveAbsences: number;
  lastAbsentDate: string | null;
  recentDitching: Array<{ date: string; subject: string; period: number }>;
  recentLate: Array<{ date: string; firstPeriodSubject: string }>;
  updatedAt: Timestamp | Date;
  schemaVersion: 1;
}

export function makeEmptyWindowStats(): WindowStats {
  return { total: 0, present: 0, absent: 0, late: 0, excused: 0, rate: 0 };
}