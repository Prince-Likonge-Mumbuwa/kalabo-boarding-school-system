// utils/exportUtils.ts

interface ExportOptions {
  filename?: string;
  includeHeaders?: boolean;
  separator?: string;
  filterWeekdays?: boolean;
}

export interface AttendanceExportRow {
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  date: string;
  status: string;
  attendanceType: 'daily' | 'periodic';
  subject?: string;
  period?: number;
  markedBy: string;
  markedByName: string;
  timestamp: Date | string | { toDate?: () => Date; seconds?: number };
  excuseReason?: string;
}

export interface LateArrivalExportRow {
  studentId: string;
  studentName: string;
  className: string;
  date: string;
  dailyStatus: string;
  firstPeriodStatus: string;
  timeDetected?: string;
}

export interface SubjectTruancyExportRow {
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

export interface RiskExportRow {
  studentId: string;
  studentName: string;
  className: string;
  riskLevel: 'high' | 'medium' | 'low';
  rate: number;
  consecutiveAbsences: number;
  ditchingIncidents: number;
  lateArrivals: number;
  riskFactors: string[];
}

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === 'function') return v.toDate();
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const isWeekday = (ymd: string): boolean => {
  const [y, m, d] = ymd.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day >= 1 && day <= 5;
};

const downloadCSV = (content: string, filename: string): void => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().split('T')[0];

  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${timestamp}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const buildCSV = (headers: string[], rows: string[][], separator: string, includeHeaders: boolean): string => {
  return [
    includeHeaders ? headers.join(separator) : '',
    ...rows.map(r => r.join(separator)),
  ].filter(Boolean).join('\n');
};

// ── Attendance records (daily + periodic rows) ──────────────────────

export const exportAttendanceRecords = (
  records: AttendanceExportRow[],
  filename = 'attendance_records',
  filterWeekdays = false,
): void => {
  let rowsIn = records;
  if (filterWeekdays) rowsIn = records.filter(r => isWeekday(r.date));
  if (!rowsIn.length) {
    console.warn('No data to export');
    return;
  }

  const headers = [
    'Date', 'Day', 'Student ID', 'Student Name', 'Class',
    'Status', 'Type', 'Subject', 'Period', 'Teacher', 'Time', 'Reason',
  ];

  const rows = rowsIn.map(r => {
    const dt = toDate(r.timestamp);
    return [
      r.date,
      dt ? dt.toLocaleDateString('en-US', { weekday: 'long' }) : '',
      r.studentId,
      r.studentName,
      r.className,
      r.status,
      r.attendanceType,
      r.subject ?? '',
      r.period?.toString() ?? '',
      r.markedByName,
      dt ? dt.toLocaleTimeString() : '',
      r.excuseReason ?? '',
    ];
  });

  downloadCSV(buildCSV(headers, rows, ',', true), filename);
};

// ── Late arrivals ───────────────────────────────────────────────────

export const exportLateArrivals = (
  lateArrivals: LateArrivalExportRow[],
  filename = 'late_arrivals',
): void => {
  if (!lateArrivals.length) {
    console.warn('No data to export');
    return;
  }

  const headers = [
    'Date', 'Student ID', 'Student Name', 'Class',
    'Daily Status', 'First Period Status', 'Time Detected',
  ];

  const rows = lateArrivals.map(l => [
    l.date,
    l.studentId,
    l.studentName,
    l.className,
    l.dailyStatus,
    l.firstPeriodStatus,
    l.timeDetected ?? '',
  ]);

  downloadCSV(buildCSV(headers, rows, ',', true), filename);
};

// ── Subject truancy ─────────────────────────────────────────────────

export const exportSubjectTruancy = (
  truancy: SubjectTruancyExportRow[],
  filename = 'subject_truancy',
): void => {
  if (!truancy.length) {
    console.warn('No data to export');
    return;
  }

  const headers = [
    'Student ID', 'Student Name', 'Class', 'Subject', 'Teacher',
    'Attendance Rate %', 'Attended', 'Missed', 'Total Sessions', 'Trend',
  ];

  const rows = truancy.map(t => [
    t.studentId,
    t.studentName,
    t.className,
    t.subject,
    t.teacherName,
    t.attendanceRate.toFixed(1),
    t.attended.toString(),
    t.missed.toString(),
    t.totalSessions.toString(),
    t.trend,
  ]);

  downloadCSV(buildCSV(headers, rows, ',', true), filename);
};

// ── Risk ────────────────────────────────────────────────────────────

export const exportRiskAnalysis = (
  risks: RiskExportRow[],
  filename = 'risk_analysis',
): void => {
  if (!risks.length) {
    console.warn('No data to export');
    return;
  }

  const headers = [
    'Student ID', 'Student Name', 'Class', 'Risk Level', 'Attendance %',
    'Consecutive Absences', 'Ditching Incidents', 'Late Arrivals', 'Risk Factors',
  ];

  const rows = risks.map(r => [
    r.studentId,
    r.studentName,
    r.className,
    r.riskLevel.toUpperCase(),
    r.rate.toFixed(1) + '%',
    r.consecutiveAbsences.toString(),
    r.ditchingIncidents.toString(),
    r.lateArrivals.toString(),
    r.riskFactors.join('; '),
  ]);

  downloadCSV(buildCSV(headers, rows, ',', true), filename);
};