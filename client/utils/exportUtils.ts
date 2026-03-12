// utils/exportUtils.ts
import { AttendanceRecord, LateArrival, SubjectTruancy, TeacherActivity, RiskAnalysis } from '@/types/attendance';

type ExportData = AttendanceRecord | LateArrival | SubjectTruancy | TeacherActivity | RiskAnalysis;

interface ExportOptions {
  filename?: string;
  includeHeaders?: boolean;
  separator?: string;
  filterWeekdays?: boolean;
}

/**
 * Generic CSV export function
 */
export const exportToCSV = <T extends ExportData>(
  data: T[],
  options: ExportOptions = {}
): void => {
  const {
    filename = 'export',
    includeHeaders = true,
    separator = ',',
    filterWeekdays = false
  } = options;

  if (!data.length) {
    console.warn('No data to export');
    return;
  }

  // Filter weekdays if requested
  let dataToExport = data;
  if (filterWeekdays) {
    dataToExport = data.filter(item => {
      const date = (item as any).date;
      if (!date) return true;
      const day = new Date(date).getDay();
      return day >= 1 && day <= 5; // Monday = 1, Friday = 5
    });
  }

  // Get headers and rows based on data type
  const firstItem = dataToExport[0];
  let headers: string[] = [];
  let rows: string[][] = [];

  // Detect data type and format accordingly
  if ('studentName' in firstItem && 'attendanceType' in firstItem) {
    // Attendance Records
    headers = [
      'Date', 'Day', 'Student ID', 'Student Name', 'Class',
      'Status', 'Type', 'Subject', 'Period', 'Teacher', 'Time', 'Reason'
    ];
    rows = dataToExport.map(item => {
      const record = item as AttendanceRecord;
      const date = new Date(record.date);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      
      return [
        record.date,
        dayName,
        record.studentId,
        record.studentName,
        record.className,
        record.status,
        record.attendanceType,
        (record as any).subject || '',
        (record as any).period?.toString() || '',
        record.markedByName,
        record.timestamp instanceof Date 
          ? record.timestamp.toLocaleTimeString() 
          : new Date().toLocaleTimeString(),
        record.excuseReason || ''
      ];
    });
  }
  else if ('dailyStatus' in firstItem && 'firstPeriodStatus' in firstItem) {
    // Late Arrivals
    headers = [
      'Date', 'Student Name', 'Class', 'Daily Status', 
      'First Period Status', 'Time Detected'
    ];
    rows = dataToExport.map(item => {
      const late = item as LateArrival;
      return [
        late.date,
        late.studentName,
        late.className,
        late.dailyStatus,
        late.firstPeriodStatus,
        late.timeDetected || ''
      ];
    });
  }
  else if ('subject' in firstItem && 'attendanceRate' in firstItem && 'trend' in firstItem) {
    // Subject Truancy
    headers = [
      'Student Name', 'Class', 'Subject', 'Teacher',
      'Attendance Rate %', 'Attended', 'Missed', 'Total Sessions', 'Trend'
    ];
    rows = dataToExport.map(item => {
      const truancy = item as SubjectTruancy;
      return [
        truancy.studentName,
        truancy.className,
        truancy.subject,
        truancy.teacherName,
        truancy.attendanceRate.toFixed(1),
        truancy.attended.toString(),
        truancy.missed.toString(),
        truancy.totalSessions.toString(),
        truancy.trend
      ];
    });
  }
  else if ('teacherName' in firstItem && 'studentsMarked' in firstItem) {
    // Teacher Activity
    headers = [
      'Teacher', 'Class', 'Subject', 'Date', 'Time', 'Type', 'Students Marked'
    ];
    rows = dataToExport.map(item => {
      const activity = item as TeacherActivity;
      return [
        activity.teacherName,
        activity.className,
        activity.subject || '',
        activity.date,
        activity.timeRecorded,
        activity.attendanceType,
        activity.studentsMarked.toString()
      ];
    });
  }
  else if ('riskLevel' in firstItem && 'riskFactors' in firstItem) {
    // Risk Analysis
    headers = [
      'Student Name', 'Class', 'Risk Level', 'Attendance %',
      'Consecutive Absences', 'Ditching Incidents', 'Late Arrivals',
      'Risk Factors'
    ];
    rows = dataToExport.map(item => {
      const risk = item as RiskAnalysis;
      return [
        risk.studentName,
        risk.className,
        risk.riskLevel.toUpperCase(),
        risk.dailyStats.rate.toFixed(1) + '%',
        risk.consecutiveAbsences.toString(),
        risk.ditchingIncidents.length.toString(),
        risk.lateArrivals.length.toString(),
        risk.riskFactors.join('; ')
      ];
    });
  }

  // Create CSV content
  const csvContent = [
    includeHeaders ? headers.join(separator) : '',
    ...rows.map(row => row.join(separator))
  ].filter(Boolean).join('\n');

  // Download file
  downloadCSV(csvContent, filename);
};

/**
 * Download CSV file
 */
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

/**
 * Export attendance records
 */
export const exportAttendanceRecords = (
  records: AttendanceRecord[],
  filename: string = 'attendance_records',
  filterWeekdays: boolean = false
): void => {
  exportToCSV(records, { filename, filterWeekdays });
};

/**
 * Export late arrivals
 */
export const exportLateArrivals = (
  lateArrivals: LateArrival[],
  filename: string = 'late_arrivals'
): void => {
  exportToCSV(lateArrivals, { filename });
};

/**
 * Export subject truancy
 */
export const exportSubjectTruancy = (
  truancy: SubjectTruancy[],
  filename: string = 'subject_truancy'
): void => {
  exportToCSV(truancy, { filename });
};

/**
 * Export teacher activity
 */
export const exportTeacherActivity = (
  activities: TeacherActivity[],
  filename: string = 'teacher_activity'
): void => {
  exportToCSV(activities, { filename });
};

/**
 * Export risk analysis
 */
export const exportRiskAnalysis = (
  risks: RiskAnalysis[],
  filename: string = 'risk_analysis'
): void => {
  exportToCSV(risks, { filename });
};

/**
 * Export multiple data types in one file (for comprehensive reports)
 */
export const exportComprehensiveReport = (
  data: {
    records?: AttendanceRecord[];
    lateArrivals?: LateArrival[];
    truancy?: SubjectTruancy[];
    risks?: RiskAnalysis[];
  },
  filename: string = 'comprehensive_report'
): void => {
  const sections: string[] = [];
  const separator = ',';

  if (data.records?.length) {
    sections.push('ATTENDANCE RECORDS');
    sections.push(exportToCSV(data.records, { includeHeaders: true }) as unknown as string);
  }

  if (data.lateArrivals?.length) {
    sections.push('LATE ARRIVALS');
    sections.push(exportToCSV(data.lateArrivals, { includeHeaders: true }) as unknown as string);
  }

  if (data.truancy?.length) {
    sections.push('SUBJECT TRUANCY');
    sections.push(exportToCSV(data.truancy, { includeHeaders: true }) as unknown as string);
  }

  if (data.risks?.length) {
    sections.push('RISK ANALYSIS');
    sections.push(exportToCSV(data.risks, { includeHeaders: true }) as unknown as string);
  }

  const content = sections.join('\n\n');
  downloadCSV(content, filename);
};