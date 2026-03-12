// hooks/useAttendanceAnalytics.ts
import { useMemo } from 'react';
import { 
  AttendanceRecord, 
  DailyAttendanceRecord,
  PeriodicAttendanceRecord,
  LateArrival, 
  SubjectTruancy, 
  TeacherActivity,
  RiskAnalysis 
} from '@/types/attendance';

interface AnalyticsReturn {
  // Late arrivals detection
  lateArrivals: LateArrival[];
  
  // Subject truancy analysis
  subjectTruancy: SubjectTruancy[];
  
  // Teacher activity summary
  teacherActivity: TeacherActivity[];
  
  // Summary statistics
  summary: {
    total: number;
    daily: number;
    periodic: number;
    uniqueTeachers: number;
    uniqueClasses: number;
    uniqueSubjects: number;
  };
  
  // Filter helpers
  getByType: (type: 'daily' | 'periodic') => AttendanceRecord[];
  getByTeacher: (teacherId: string) => AttendanceRecord[];
  getBySubject: (subject: string) => PeriodicAttendanceRecord[];
  getByDateRange: (startDate: string, endDate: string) => AttendanceRecord[];
  getWeekdaysOnly: () => AttendanceRecord[];
  
  // Daily stats
  getDailyStats: (date?: string) => {
    date: string;
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    rate: number;
  };
  
  // Subject stats for a specific student
  getStudentSubjectStats: (studentId: string) => SubjectTruancy[];
  
  // Class performance
  getClassPerformance: () => {
    averageAttendance: number;
    topPerformingSubjects: Array<{ subject: string; rate: number }>;
    bottomPerformingSubjects: Array<{ subject: string; rate: number }>;
  };
}

export const useAttendanceAnalytics = (records: AttendanceRecord[]): AnalyticsReturn => {
  
  // 1. Detect Late Arrivals (Present in periodic but absent in daily)
  const lateArrivals = useMemo((): LateArrival[] => {
    // Group records by student and date
    const studentDateMap = new Map<string, Map<string, AttendanceRecord[]>>();
    
    records.forEach(record => {
      const key = `${record.studentId}_${record.date}`;
      if (!studentDateMap.has(key)) {
        studentDateMap.set(key, new Map());
      }
      const dateMap = studentDateMap.get(key)!;
      if (!dateMap.has(record.date)) {
        dateMap.set(record.date, []);
      }
      dateMap.get(record.date)!.push(record);
    });

    const late: LateArrival[] = [];

    studentDateMap.forEach((dateMap) => {
      dateMap.forEach((dayRecords, date) => {
        // Find daily record
        const daily = dayRecords.find(r => r.attendanceType === 'daily') as DailyAttendanceRecord | undefined;
        // Find first period record (period 1)
        const firstPeriod = dayRecords.find(
          r => r.attendanceType === 'periodic' && (r as PeriodicAttendanceRecord).period === 1
        ) as PeriodicAttendanceRecord | undefined;

        if (daily && firstPeriod) {
          if (daily.status === 'absent' && 
              (firstPeriod.status === 'present' || firstPeriod.status === 'late')) {
            late.push({
              studentId: daily.studentId,
              studentName: daily.studentName,
              className: daily.className,
              date: daily.date,
              dailyStatus: daily.status,
              firstPeriodStatus: firstPeriod.status,
              timeDetected: firstPeriod.timestamp instanceof Date 
                ? firstPeriod.timestamp.toLocaleTimeString() 
                : undefined,
            });
          }
        }
      });
    });

    return late;
  }, [records]);

  // 2. Subject Truancy Analysis
  const subjectTruancy = useMemo((): SubjectTruancy[] => {
    // Get only periodic records with subjects
    const periodicRecords = records.filter(
      r => r.attendanceType === 'periodic' && (r as PeriodicAttendanceRecord).subject
    ) as PeriodicAttendanceRecord[];
    
    // Group by student and subject
    const studentSubjectMap = new Map<string, Map<string, PeriodicAttendanceRecord[]>>();
    
    periodicRecords.forEach(record => {
      const studentKey = record.studentId;
      const subjectKey = record.subject;
      
      if (!studentSubjectMap.has(studentKey)) {
        studentSubjectMap.set(studentKey, new Map());
      }
      const subjectMap = studentSubjectMap.get(studentKey)!;
      
      if (!subjectMap.has(subjectKey)) {
        subjectMap.set(subjectKey, []);
      }
      subjectMap.get(subjectKey)!.push(record);
    });

    const truancy: SubjectTruancy[] = [];

    studentSubjectMap.forEach((subjectMap, studentId) => {
      subjectMap.forEach((records, subject) => {
        const total = records.length;
        const attended = records.filter(
          r => r.status === 'present' || r.status === 'late'
        ).length;
        const attendanceRate = total > 0 ? (attended / total) * 100 : 0;

        // Calculate trend (compare first half vs second half)
        const midPoint = Math.floor(total / 2);
        const firstHalf = records.slice(0, midPoint);
        const secondHalf = records.slice(midPoint);
        
        const firstHalfRate = firstHalf.length > 0
          ? (firstHalf.filter(r => r.status === 'present' || r.status === 'late').length / firstHalf.length) * 100
          : 0;
        const secondHalfRate = secondHalf.length > 0
          ? (secondHalf.filter(r => r.status === 'present' || r.status === 'late').length / secondHalf.length) * 100
          : 0;

        let trend: 'improving' | 'declining' | 'stable' = 'stable';
        if (secondHalfRate - firstHalfRate > 5) trend = 'improving';
        else if (firstHalfRate - secondHalfRate > 5) trend = 'declining';

        if (records[0]) {
          truancy.push({
            studentId: studentId,
            studentName: records[0].studentName,
            className: records[0].className,
            subject,
            teacherName: records[0].markedByName,
            totalSessions: total,
            attended,
            missed: total - attended,
            attendanceRate,
            trend,
          });
        }
      });
    });

    return truancy.sort((a, b) => a.attendanceRate - b.attendanceRate);
  }, [records]);

  // 3. Teacher Activity Timeline
  const teacherActivity = useMemo((): TeacherActivity[] => {
    // Group by teacher and session
    const activityMap = new Map<string, TeacherActivity>();
    
    records.forEach(record => {
      const key = `${record.markedBy}_${record.classId}_${record.date}_${record.attendanceType}`;
      
      if (!activityMap.has(key)) {
        activityMap.set(key, {
          teacherId: record.markedBy,
          teacherName: record.markedByName,
          classId: record.classId,
          className: record.className,
          subject: record.attendanceType === 'periodic' ? (record as PeriodicAttendanceRecord).subject : undefined,
          date: record.date,
          timeRecorded: record.timestamp instanceof Date 
            ? record.timestamp.toLocaleTimeString() 
            : new Date().toLocaleTimeString(),
          attendanceType: record.attendanceType,
          studentsMarked: 0
        });
      }
      
      const activity = activityMap.get(key)!;
      activity.studentsMarked++;
    });
    
    return Array.from(activityMap.values()).sort((a, b) => 
      b.date.localeCompare(a.date) || b.timeRecorded.localeCompare(a.timeRecorded)
    );
  }, [records]);

  // 4. Summary statistics
  const summary = useMemo(() => {
    const total = records.length;
    const daily = records.filter(r => r.attendanceType === 'daily').length;
    const periodic = records.filter(r => r.attendanceType === 'periodic').length;
    
    const uniqueTeachers = new Set(records.map(r => r.markedBy)).size;
    const uniqueClasses = new Set(records.map(r => r.classId)).size;
    const uniqueSubjects = new Set(
      records.filter(r => r.attendanceType === 'periodic').map(r => (r as PeriodicAttendanceRecord).subject)
    ).size;

    return {
      total,
      daily,
      periodic,
      uniqueTeachers,
      uniqueClasses,
      uniqueSubjects,
    };
  }, [records]);

  // 5. Filter helpers
  const getByType = (type: 'daily' | 'periodic') => {
    return records.filter(r => r.attendanceType === type);
  };

  const getByTeacher = (teacherId: string) => {
    return records.filter(r => r.markedBy === teacherId);
  };

  const getBySubject = (subject: string) => {
    return records.filter(r => 
      r.attendanceType === 'periodic' && (r as PeriodicAttendanceRecord).subject === subject
    ) as PeriodicAttendanceRecord[];
  };

  const getByDateRange = (startDate: string, endDate: string) => {
    return records.filter(r => r.date >= startDate && r.date <= endDate);
  };

  const getWeekdaysOnly = () => {
    return records.filter(r => {
      const date = new Date(r.date);
      const day = date.getDay();
      return day >= 1 && day <= 5; // Monday to Friday
    });
  };

  // 6. Daily stats for a specific date
  const getDailyStats = (date?: string) => {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const dayRecords = records.filter(r => r.date === targetDate);
    
    const total = dayRecords.length;
    const present = dayRecords.filter(r => r.status === 'present').length;
    const absent = dayRecords.filter(r => r.status === 'absent').length;
    const late = dayRecords.filter(r => r.status === 'late').length;
    const excused = dayRecords.filter(r => r.status === 'excused').length;
    
    return {
      date: targetDate,
      total,
      present,
      absent,
      late,
      excused,
      rate: total > 0 ? ((present + late) / total) * 100 : 0
    };
  };

  // 7. Get subject stats for a specific student
  const getStudentSubjectStats = (studentId: string) => {
    return subjectTruancy.filter(t => t.studentId === studentId);
  };

  // 8. Class performance metrics
  const getClassPerformance = () => {
    // Group by subject
    const subjectMap = new Map<string, { total: number; attended: number }>();
    
    records.filter(r => r.attendanceType === 'periodic').forEach(record => {
      const subject = (record as PeriodicAttendanceRecord).subject;
      if (!subject) return;
      
      if (!subjectMap.has(subject)) {
        subjectMap.set(subject, { total: 0, attended: 0 });
      }
      
      const stats = subjectMap.get(subject)!;
      stats.total++;
      if (record.status === 'present' || record.status === 'late') {
        stats.attended++;
      }
    });
    
    const subjectRates = Array.from(subjectMap.entries()).map(([subject, stats]) => ({
      subject,
      rate: stats.total > 0 ? (stats.attended / stats.total) * 100 : 0
    }));
    
    const sorted = [...subjectRates].sort((a, b) => b.rate - a.rate);
    
    return {
      averageAttendance: subjectRates.reduce((sum, s) => sum + s.rate, 0) / subjectRates.length || 0,
      topPerformingSubjects: sorted.slice(0, 3),
      bottomPerformingSubjects: sorted.slice(-3).reverse()
    };
  };

  return {
    lateArrivals,
    subjectTruancy,
    teacherActivity,
    summary,
    getByType,
    getByTeacher,
    getBySubject,
    getByDateRange,
    getWeekdaysOnly,
    getDailyStats,
    getStudentSubjectStats,
    getClassPerformance
  };
};