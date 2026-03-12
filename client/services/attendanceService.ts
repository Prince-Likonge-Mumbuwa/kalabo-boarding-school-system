import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  setDoc,
  Timestamp,
  orderBy,
  limit,
  writeBatch,
  DocumentData,
  QuerySnapshot
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { 
  AttendanceRecord,
  DailyAttendanceRecord,
  PeriodicAttendanceRecord,
  DailyAttendance, 
  AttendanceStatus,
  AttendanceType,
  StudentAttendanceSummary,
  LateArrival,
  SubjectTruancy,
  TeacherActivity,
  RiskAnalysis,
  TeacherPeriodicSummary,
  FullPeriodicData,
  AttendanceFilters
} from '@/types/attendance';
import { Learner, Class } from '@/types/school';
import { learnerService } from './schoolService';

// EXPORT ALL TYPES
export type { 
  AttendanceRecord,
  DailyAttendanceRecord,
  PeriodicAttendanceRecord,
  DailyAttendance, 
  AttendanceStatus,
  AttendanceType,
  StudentAttendanceSummary,
  LateArrival,
  SubjectTruancy,
  TeacherActivity,
  RiskAnalysis,
  TeacherPeriodicSummary,
  FullPeriodicData
};

const ATTENDANCE_COLLECTION = 'attendance';
const DAILY_ATTENDANCE_COLLECTION = 'dailyAttendance';

class AttendanceService {
  
  /**
   * Mark daily attendance for a single student
   */
  async markDailyAttendance(data: {
    studentId: string;
    studentName: string;
    classId: string;
    className: string;
    date: string;
    status: AttendanceStatus;
    excuseReason?: string;
    markedBy: string;
    markedByName: string;
    studentGender?: 'male' | 'female';
    rollCallTime?: string;
  }): Promise<DailyAttendanceRecord> {
    try {
      const recordId = `${data.classId}_${data.studentId}_${data.date}_daily`;
      const recordRef = doc(db, ATTENDANCE_COLLECTION, recordId);
      
      const record: any = {
        id: recordId,
        studentId: data.studentId,
        studentName: data.studentName,
        classId: data.classId,
        className: data.className,
        date: data.date,
        status: data.status,
        markedBy: data.markedBy,
        markedByName: data.markedByName,
        timestamp: Timestamp.now(),
        attendanceType: 'daily',
        rollCallTime: data.rollCallTime || new Date().toLocaleTimeString(),
      };

      if (data.excuseReason?.trim()) {
        record.excuseReason = data.excuseReason.trim();
      }
      
      if (data.studentGender) {
        record.studentGender = data.studentGender;
      }

      await setDoc(recordRef, record, { merge: true });
      await this.updateDailySummary(data.classId, data.className, data.date);
      
      return record as DailyAttendanceRecord;
    } catch (error) {
      console.error('Error marking daily attendance:', error);
      throw error;
    }
  }

  /**
   * Mark periodic attendance for a single student
   */
  async markPeriodicAttendance(data: {
    studentId: string;
    studentName: string;
    classId: string;
    className: string;
    date: string;
    status: AttendanceStatus;
    subject: string;
    period: number;
    excuseReason?: string;
    markedBy: string;
    markedByName: string;
    studentGender?: 'male' | 'female';
    lessonStartTime?: string;
    lessonEndTime?: string;
  }): Promise<PeriodicAttendanceRecord> {
    try {
      const recordId = `${data.classId}_${data.studentId}_${data.date}_${data.subject}_p${data.period}`;
      const recordRef = doc(db, ATTENDANCE_COLLECTION, recordId);
      
      const record: any = {
        id: recordId,
        studentId: data.studentId,
        studentName: data.studentName,
        classId: data.classId,
        className: data.className,
        date: data.date,
        status: data.status,
        markedBy: data.markedBy,
        markedByName: data.markedByName,
        timestamp: Timestamp.now(),
        attendanceType: 'periodic',
        subject: data.subject,
        period: data.period,
        lessonStartTime: data.lessonStartTime || new Date().toLocaleTimeString(),
      };

      if (data.lessonEndTime) {
        record.lessonEndTime = data.lessonEndTime;
      }

      if (data.excuseReason?.trim()) {
        record.excuseReason = data.excuseReason.trim();
      }
      
      if (data.studentGender) {
        record.studentGender = data.studentGender;
      }

      await setDoc(recordRef, record, { merge: true });
      return record as PeriodicAttendanceRecord;
    } catch (error) {
      console.error('Error marking periodic attendance:', error);
      throw error;
    }
  }

  /**
   * Bulk mark daily attendance
   */
  async bulkMarkDailyAttendance(data: {
    records: Array<{
      studentId: string;
      studentName: string;
      studentGender?: 'male' | 'female';
      status: AttendanceStatus;
      excuseReason?: string;
    }>;
    classId: string;
    className: string;
    date: string;
    markedBy: string;
    markedByName: string;
    rollCallTime?: string;
  }): Promise<DailyAttendanceRecord[]> {
    const batch = writeBatch(db);
    const records: DailyAttendanceRecord[] = [];

    try {
      for (const item of data.records) {
        const recordId = `${data.classId}_${item.studentId}_${data.date}_daily`;
        const recordRef = doc(db, ATTENDANCE_COLLECTION, recordId);
        
        const record: any = {
          id: recordId,
          studentId: item.studentId,
          studentName: item.studentName,
          classId: data.classId,
          className: data.className,
          date: data.date,
          status: item.status,
          markedBy: data.markedBy,
          markedByName: data.markedByName,
          timestamp: Timestamp.now(),
          attendanceType: 'daily',
          rollCallTime: data.rollCallTime || new Date().toLocaleTimeString(),
        };

        if (item.studentGender) {
          record.studentGender = item.studentGender;
        }
        
        if (item.excuseReason?.trim()) {
          record.excuseReason = item.excuseReason.trim();
        }

        batch.set(recordRef, record, { merge: true });
        records.push(record as DailyAttendanceRecord);
      }

      await batch.commit();
      await this.updateDailySummary(data.classId, data.className, data.date);
      
      return records;
    } catch (error) {
      console.error('Error bulk marking daily attendance:', error);
      throw error;
    }
  }

  /**
   * Bulk mark periodic attendance
   */
  async bulkMarkPeriodicAttendance(data: {
    records: Array<{
      studentId: string;
      studentName: string;
      studentGender?: 'male' | 'female';
      status: AttendanceStatus;
      excuseReason?: string;
    }>;
    classId: string;
    className: string;
    subject: string;
    period: number;
    date: string;
    markedBy: string;
    markedByName: string;
    lessonStartTime?: string;
  }): Promise<PeriodicAttendanceRecord[]> {
    const batch = writeBatch(db);
    const records: PeriodicAttendanceRecord[] = [];

    try {
      for (const item of data.records) {
        const recordId = `${data.classId}_${item.studentId}_${data.date}_${data.subject}_p${data.period}`;
        const recordRef = doc(db, ATTENDANCE_COLLECTION, recordId);
        
        const record: any = {
          id: recordId,
          studentId: item.studentId,
          studentName: item.studentName,
          classId: data.classId,
          className: data.className,
          date: data.date,
          status: item.status,
          markedBy: data.markedBy,
          markedByName: data.markedByName,
          timestamp: Timestamp.now(),
          attendanceType: 'periodic',
          subject: data.subject,
          period: data.period,
          lessonStartTime: data.lessonStartTime || new Date().toLocaleTimeString(),
        };

        if (item.studentGender) {
          record.studentGender = item.studentGender;
        }
        
        if (item.excuseReason?.trim()) {
          record.excuseReason = item.excuseReason.trim();
        }

        batch.set(recordRef, record, { merge: true });
        records.push(record as PeriodicAttendanceRecord);
      }

      await batch.commit();
      return records;
    } catch (error) {
      console.error('Error bulk marking periodic attendance:', error);
      throw error;
    }
  }

  /**
   * Get attendance with advanced filters
   */
  async getAttendanceWithFilters(filters: AttendanceFilters): Promise<AttendanceRecord[]> {
    try {
      let q = query(collection(db, ATTENDANCE_COLLECTION));
      const constraints = [];
      
      if (filters.startDate) {
        constraints.push(where('date', '>=', filters.startDate));
      }
      
      if (filters.endDate) {
        constraints.push(where('date', '<=', filters.endDate));
      }
      
      if (filters.classId) {
        constraints.push(where('classId', '==', filters.classId));
      }
      
      if (filters.teacherId) {
        constraints.push(where('markedBy', '==', filters.teacherId));
      }
      
      if (filters.attendanceType) {
        constraints.push(where('attendanceType', '==', filters.attendanceType));
      }
      
      if (filters.subject) {
        constraints.push(where('subject', '==', filters.subject));
      }
      
      if (filters.period !== undefined) {
        constraints.push(where('period', '==', filters.period));
      }
      
      if (filters.status) {
        constraints.push(where('status', '==', filters.status));
      }
      
      if (filters.studentId) {
        constraints.push(where('studentId', '==', filters.studentId));
      }
      
      q = query(q, ...constraints, orderBy('date', 'desc'), orderBy('timestamp', 'desc'));
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          timestamp: data.timestamp?.toDate(),
          updatedAt: data.updatedAt?.toDate(),
        } as AttendanceRecord;
      });
    } catch (error) {
      console.error('Error fetching filtered attendance:', error);
      return [];
    }
  }

  /**
   * Get periodic attendance for a class with subject/period filtering
   */
  async getPeriodicAttendance(
    classId: string, 
    date: string,
    subject?: string,
    period?: number
  ): Promise<PeriodicAttendanceRecord[]> {
    try {
      const filters: AttendanceFilters = {
        classId,
        startDate: date,  // FIXED: Use startDate instead of date
        endDate: date,     // FIXED: Use endDate instead of date
        attendanceType: 'periodic'
      };
      
      if (subject) filters.subject = subject;
      if (period) filters.period = period;
      
      const records = await this.getAttendanceWithFilters(filters);
      return records as PeriodicAttendanceRecord[];
    } catch (error) {
      console.error('Error fetching periodic attendance:', error);
      return [];
    }
  }

  /**
   * Get daily attendance for a class
   */
  async getDailyAttendance(classId: string, date: string): Promise<DailyAttendanceRecord[]> {
    try {
      const filters: AttendanceFilters = {
        classId,
        startDate: date,  // FIXED: Use startDate instead of date
        endDate: date,     // FIXED: Use endDate instead of date
        attendanceType: 'daily'
      };
      
      const records = await this.getAttendanceWithFilters(filters);
      return records as DailyAttendanceRecord[];
    } catch (error) {
      console.error('Error fetching daily attendance:', error);
      return [];
    }
  }

  /**
   * Get full periodic data for a class (all periods/subjects)
   */
  async getFullDailyPeriodicAttendance(
    classId: string,
    date: string
  ): Promise<FullPeriodicData> {
    try {
      const records = await this.getPeriodicAttendance(classId, date);
      
      const byPeriod: Record<number, PeriodicAttendanceRecord[]> = {};
      const bySubject: Record<string, PeriodicAttendanceRecord[]> = {};
      const teachers = new Set<string>();
      
      // Initialize all periods 1-8
      for (let i = 1; i <= 8; i++) {
        byPeriod[i] = [];
      }
      
      records.forEach(record => {
        // Group by period
        if (!byPeriod[record.period]) {
          byPeriod[record.period] = [];
        }
        byPeriod[record.period].push(record);
        
        // Group by subject
        if (!bySubject[record.subject]) {
          bySubject[record.subject] = [];
        }
        bySubject[record.subject].push(record);
        
        // Track teachers
        teachers.add(record.markedByName);
      });
      
      return { byPeriod, bySubject, teachers };
    } catch (error) {
      console.error('Error fetching full periodic attendance:', error);
      
      // Initialize empty periods
      const byPeriod: Record<number, PeriodicAttendanceRecord[]> = {};
      for (let i = 1; i <= 8; i++) {
        byPeriod[i] = [];
      }
      
      return { byPeriod, bySubject: {}, teachers: new Set() };
    }
  }

  /**
   * Get student risk analysis
   */
  async getStudentRiskAnalysis(
    studentId: string,
    studentName: string,
    className: string,
    days: number = 30
  ): Promise<RiskAnalysis> {
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split('T')[0];
      
      const filters: AttendanceFilters = {
        studentId,
        startDate: startDateStr,
        endDate
      };
      
      const records = await this.getAttendanceWithFilters(filters);
      
      // Separate daily and periodic
      const dailyRecords = records.filter(r => r.attendanceType === 'daily') as DailyAttendanceRecord[];
      const periodicRecords = records.filter(r => r.attendanceType === 'periodic') as PeriodicAttendanceRecord[];
      
      // Daily stats
      const dailyStats = {
        total: dailyRecords.length,
        present: dailyRecords.filter(r => r.status === 'present').length,
        absent: dailyRecords.filter(r => r.status === 'absent').length,
        late: dailyRecords.filter(r => r.status === 'late').length,
        excused: dailyRecords.filter(r => r.status === 'excused').length,
        rate: 0
      };
      dailyStats.rate = dailyStats.total > 0 
        ? ((dailyStats.present + dailyStats.late) / dailyStats.total) * 100 
        : 0;
      
      // Subject stats
      const subjectMap = new Map<string, {
        subject: string;
        teacherName: string;
        total: number;
        present: number;
        records: PeriodicAttendanceRecord[];
      }>();
      
      periodicRecords.forEach(record => {
        if (!subjectMap.has(record.subject)) {
          subjectMap.set(record.subject, {
            subject: record.subject,
            teacherName: record.markedByName,
            total: 0,
            present: 0,
            records: []
          });
        }
        const subjectData = subjectMap.get(record.subject)!;
        subjectData.total++;
        subjectData.records.push(record);
        if (record.status === 'present' || record.status === 'late') {
          subjectData.present++;
        }
      });
      
      const subjectStats = Array.from(subjectMap.values()).map(data => {
        const rate = data.total > 0 ? (data.present / data.total) * 100 : 0;
        
        // Calculate trend
        const midPoint = Math.floor(data.records.length / 2);
        const firstHalf = data.records.slice(0, midPoint);
        const secondHalf = data.records.slice(midPoint);
        
        const firstHalfRate = firstHalf.length > 0
          ? (firstHalf.filter(r => r.status === 'present' || r.status === 'late').length / firstHalf.length) * 100
          : 0;
        const secondHalfRate = secondHalf.length > 0
          ? (secondHalf.filter(r => r.status === 'present' || r.status === 'late').length / secondHalf.length) * 100
          : 0;
        
        let trend: 'improving' | 'declining' | 'stable' = 'stable';
        if (secondHalfRate - firstHalfRate > 5) trend = 'improving';
        else if (firstHalfRate - secondHalfRate > 5) trend = 'declining';
        
        return {
          subject: data.subject,
          teacherName: data.teacherName,
          totalSessions: data.total,
          present: data.present,
          absent: data.total - data.present,
          rate,
          trend
        };
      });
      
      // Detect ditching (present in daily, absent in subjects)
      const ditchingIncidents: RiskAnalysis['ditchingIncidents'] = [];
      const dailyByDate = new Map(dailyRecords.map(r => [r.date, r]));
      
      const periodicByDate = new Map<string, PeriodicAttendanceRecord[]>();
      periodicRecords.forEach(record => {
        if (!periodicByDate.has(record.date)) {
          periodicByDate.set(record.date, []);
        }
        periodicByDate.get(record.date)!.push(record);
      });
      
      periodicByDate.forEach((records, date) => {
        const daily = dailyByDate.get(date);
        if (daily && (daily.status === 'present' || daily.status === 'late')) {
          records.forEach(record => {
            if (record.status === 'absent' && !record.excuseReason) {
              ditchingIncidents.push({
                date,
                subject: record.subject,
                teacher: record.markedByName,
                period: record.period
              });
            }
          });
        }
      });
      
      // Detect late arrivals
      const lateArrivals: RiskAnalysis['lateArrivals'] = [];
      periodicByDate.forEach((records, date) => {
        const daily = dailyByDate.get(date);
        if (daily?.status === 'absent') {
          const firstPeriod = records.find(r => r.period === 1);
          if (firstPeriod && (firstPeriod.status === 'present' || firstPeriod.status === 'late')) {
            lateArrivals.push({
              date,
              firstPeriodSubject: firstPeriod.subject,
              firstPeriodTeacher: firstPeriod.markedByName,
              arrivalTime: firstPeriod.timestamp instanceof Date 
                ? firstPeriod.timestamp.toLocaleTimeString() 
                : undefined
            });
          }
        }
      });
      
      // Calculate risk level
      const riskFactors: string[] = [];
      let riskLevel: 'high' | 'medium' | 'low' = 'low';
      
      if (dailyStats.rate < 75) {
        riskFactors.push(`Overall attendance below 75% (${dailyStats.rate.toFixed(1)}%)`);
      }
      
      let consecutiveAbsences = 0;
      let maxStreak = 0;
      dailyRecords.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      dailyRecords.forEach(record => {
        if (record.status === 'absent') {
          consecutiveAbsences++;
          maxStreak = Math.max(maxStreak, consecutiveAbsences);
        } else {
          consecutiveAbsences = 0;
        }
      });
      
      if (maxStreak >= 3) {
        riskFactors.push(`${maxStreak} consecutive days absent`);
      }
      
      if (ditchingIncidents.length > 3) {
        riskFactors.push(`${ditchingIncidents.length} ditching incidents`);
      }
      
      const criticalSubjects = subjectStats.filter(s => s.rate < 60);
      if (criticalSubjects.length > 0) {
        const worstSubjects = criticalSubjects.map(s => s.subject).join(', ');
        riskFactors.push(`Critical absence in: ${worstSubjects}`);
      }
      
      if (riskFactors.length >= 3) riskLevel = 'high';
      else if (riskFactors.length >= 1) riskLevel = 'medium';
      
      return {
        studentId,
        studentName,
        className,
        gender: records[0]?.studentGender,
        dailyStats,
        subjectStats,
        ditchingIncidents,
        lateArrivals,
        riskLevel,
        riskFactors,
        consecutiveAbsences: maxStreak
      };
    } catch (error) {
      console.error('Error analyzing student risk:', error);
      throw error;
    }
  }

  /**
   * Get class risk analysis (for form teacher)
   */
  async getClassRiskAnalysis(
    classId: string,
    className: string,
    days: number = 30
  ): Promise<RiskAnalysis[]> {
    try {
      const learners = await learnerService.getLearnersByClass(classId);
      
      const riskAnalyses = await Promise.all(
        learners.map(learner => 
          this.getStudentRiskAnalysis(learner.id, learner.name, className, days)
        )
      );
      
      return riskAnalyses.sort((a, b) => {
        if (a.riskLevel === 'high' && b.riskLevel !== 'high') return -1;
        if (a.riskLevel !== 'high' && b.riskLevel === 'high') return 1;
        if (a.riskLevel === 'medium' && b.riskLevel === 'low') return -1;
        if (a.riskLevel === 'low' && b.riskLevel === 'medium') return 1;
        return a.dailyStats.rate - b.dailyStats.rate;
      });
    } catch (error) {
      console.error('Error getting class risk analysis:', error);
      return [];
    }
  }

  /**
   * Get teacher activity summary
   */
  async getTeacherActivity(
    teacherId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<TeacherActivity[]> {
    try {
      const filters: AttendanceFilters = {};
      if (teacherId) filters.teacherId = teacherId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      
      const records = await this.getAttendanceWithFilters(filters);
      
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
      
      return Array.from(activityMap.values());
    } catch (error) {
      console.error('Error getting teacher activity:', error);
      return [];
    }
  }

  /**
   * Get subject truancy analysis
   */
  async getSubjectTruancy(
    classId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<SubjectTruancy[]> {
    try {
      const filters: AttendanceFilters = {
        attendanceType: 'periodic'
      };
      if (classId) filters.classId = classId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      
      const records = await this.getAttendanceWithFilters(filters);
      const periodicRecords = records as PeriodicAttendanceRecord[];
      
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
    } catch (error) {
      console.error('Error getting subject truancy:', error);
      return [];
    }
  }

  /**
   * Get late arrivals
   */
  async getLateArrivals(
    classId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<LateArrival[]> {
    try {
      // Get daily records
      const dailyFilters: AttendanceFilters = {
        attendanceType: 'daily'
      };
      if (classId) dailyFilters.classId = classId;
      if (startDate) dailyFilters.startDate = startDate;
      if (endDate) dailyFilters.endDate = endDate;
      
      const dailyRecords = await this.getAttendanceWithFilters(dailyFilters);
      const dailyByStudentDate = new Map<string, DailyAttendanceRecord>();
      
      (dailyRecords as DailyAttendanceRecord[]).forEach(record => {
        const key = `${record.studentId}_${record.date}`;
        dailyByStudentDate.set(key, record);
      });
      
      // Get first period records
      const firstPeriodFilters: AttendanceFilters = {
        attendanceType: 'periodic',
        period: 1
      };
      if (classId) firstPeriodFilters.classId = classId;
      if (startDate) firstPeriodFilters.startDate = startDate;
      if (endDate) firstPeriodFilters.endDate = endDate;
      
      const firstPeriodRecords = await this.getAttendanceWithFilters(firstPeriodFilters);
      
      const lateArrivals: LateArrival[] = [];
      
      (firstPeriodRecords as PeriodicAttendanceRecord[]).forEach(record => {
        const key = `${record.studentId}_${record.date}`;
        const daily = dailyByStudentDate.get(key);
        
        if (daily?.status === 'absent' && 
            (record.status === 'present' || record.status === 'late')) {
          lateArrivals.push({
            studentId: record.studentId,
            studentName: record.studentName,
            className: record.className,
            date: record.date,
            dailyStatus: daily.status,
            firstPeriodStatus: record.status,
            timeDetected: record.timestamp instanceof Date 
              ? record.timestamp.toLocaleTimeString() 
              : undefined
          });
        }
      });
      
      return lateArrivals;
    } catch (error) {
      console.error('Error getting late arrivals:', error);
      return [];
    }
  }

  // Legacy methods for backward compatibility
  async markAttendance(data: any): Promise<AttendanceRecord> {
    if (data.attendanceType === 'daily') {
      return this.markDailyAttendance(data);
    } else {
      return this.markPeriodicAttendance(data);
    }
  }

  async bulkMarkAttendance(data: any): Promise<AttendanceRecord[]> {
    if (data.attendanceType === 'daily') {
      return this.bulkMarkDailyAttendance(data);
    } else {
      return this.bulkMarkPeriodicAttendance(data);
    }
  }

  async getByClassAndDate(classId: string, date: string): Promise<AttendanceRecord[]> {
    return this.getAttendanceWithFilters({ 
      classId, 
      startDate: date,  // FIXED: Use startDate instead of date
      endDate: date      // FIXED: Use endDate instead of date
    });
  }

  async getByDateRange(startDate: string, endDate: string): Promise<AttendanceRecord[]> {
    return this.getAttendanceWithFilters({ startDate, endDate });
  }

  async getStudentAttendance(studentId: string, startDate: string, endDate: string): Promise<AttendanceRecord[]> {
    return this.getAttendanceWithFilters({ studentId, startDate, endDate });
  }

  async getStudentSummary(studentId: string, studentName: string, gender?: 'male' | 'female'): Promise<StudentAttendanceSummary> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo.toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];
      
      const records = await this.getStudentAttendance(studentId, startDate, today);
      
      const summary: StudentAttendanceSummary = {
        studentId,
        studentName,
        gender,
        totalDays: records.length,
        present: records.filter(r => r.status === 'present').length,
        absent: records.filter(r => r.status === 'absent').length,
        late: records.filter(r => r.status === 'late').length,
        excused: records.filter(r => r.status === 'excused').length,
        attendanceRate: 0,
        last30Days: {
          present: 0,
          absent: 0,
          late: 0,
          excused: 0
        }
      };
      
      summary.attendanceRate = summary.totalDays > 0 
        ? ((summary.present + summary.late) / summary.totalDays) * 100 
        : 0;
      
      const last30DaysRecords = records.filter(r => r.date <= today);
      summary.last30Days = {
        present: last30DaysRecords.filter(r => r.status === 'present').length,
        absent: last30DaysRecords.filter(r => r.status === 'absent').length,
        late: last30DaysRecords.filter(r => r.status === 'late').length,
        excused: last30DaysRecords.filter(r => r.status === 'excused').length,
      };
      
      return summary;
    } catch (error) {
      console.error('Error fetching student summary:', error);
      return {
        studentId,
        studentName,
        gender,
        totalDays: 0,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
        attendanceRate: 0,
        last30Days: { present: 0, absent: 0, late: 0, excused: 0 }
      };
    }
  }

  async updateDailySummary(classId: string, className: string, date: string): Promise<void> {
    try {
      const records = await this.getByClassAndDate(classId, date);
      const summaryId = `${classId}_${date}`;
      const summaryRef = doc(db, DAILY_ATTENDANCE_COLLECTION, summaryId);
      
      const total = records.length;
      const present = records.filter(r => r.status === 'present').length;
      const absent = records.filter(r => r.status === 'absent').length;
      const late = records.filter(r => r.status === 'late').length;
      const excused = records.filter(r => r.status === 'excused').length;
      
      const boysPresent = records.filter(r => r.status === 'present' && r.studentGender === 'male').length;
      const girlsPresent = records.filter(r => r.status === 'present' && r.studentGender === 'female').length;
      const boysAbsent = records.filter(r => (r.status === 'absent' || r.status === 'excused') && r.studentGender === 'male').length;
      const girlsAbsent = records.filter(r => (r.status === 'absent' || r.status === 'excused') && r.studentGender === 'female').length;
      
      const summary: DailyAttendance = {
        id: summaryId,
        classId,
        className,
        date,
        records,
        summary: {
          total,
          present,
          absent,
          late,
          excused,
          boysPresent,
          girlsPresent,
          boysAbsent,
          girlsAbsent,
        },
        lastUpdated: Timestamp.now(),
        updatedBy: 'system',
      };

      await setDoc(summaryRef, summary, { merge: true });
    } catch (error) {
      console.error('Error updating daily summary:', error);
    }
  }

  async getDailySummary(classId: string, date: string): Promise<DailyAttendance | null> {
    try {
      const summaryId = `${classId}_${date}`;
      const summaryRef = doc(db, DAILY_ATTENDANCE_COLLECTION, summaryId);
      const summarySnap = await getDoc(summaryRef);
      
      if (summarySnap.exists()) {
        const data = summarySnap.data();
        return {
          ...data,
          lastUpdated: data.lastUpdated?.toDate ? data.lastUpdated.toDate() : data.lastUpdated,
        } as DailyAttendance;
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching daily summary:', error);
      return null;
    }
  }

  async getClassStats(classId: string, startDate: string, endDate: string): Promise<{
    totalDays: number;
    averageAttendance: number;
    totalPresent: number;
    totalAbsent: number;
    totalLate: number;
    totalExcused: number;
    dailyStats: Array<{ date: string; rate: number }>;
  }> {
    try {
      const records = await this.getAttendanceWithFilters({
        classId,
        startDate,
        endDate
      });
      
      const dailyGroups = records.reduce((acc, record) => {
        if (!acc[record.date]) {
          acc[record.date] = [];
        }
        acc[record.date].push(record);
        return acc;
      }, {} as Record<string, AttendanceRecord[]>);
      
      const totalDays = Object.keys(dailyGroups).length;
      let totalPresent = 0;
      let totalAbsent = 0;
      let totalLate = 0;
      let totalExcused = 0;
      
      records.forEach(record => {
        switch (record.status) {
          case 'present': totalPresent++; break;
          case 'absent': totalAbsent++; break;
          case 'late': totalLate++; break;
          case 'excused': totalExcused++; break;
        }
      });
      
      const dailyStats = Object.entries(dailyGroups).map(([date, dayRecords]) => {
        const present = dayRecords.filter(r => r.status === 'present' || r.status === 'late').length;
        const rate = dayRecords.length > 0 ? (present / dayRecords.length) * 100 : 0;
        return { date, rate };
      });
      
      const averageAttendance = totalDays > 0 
        ? dailyStats.reduce((sum, day) => sum + day.rate, 0) / totalDays 
        : 0;
      
      return {
        totalDays,
        averageAttendance,
        totalPresent,
        totalAbsent,
        totalLate,
        totalExcused,
        dailyStats,
      };
    } catch (error) {
      console.error('Error fetching class stats:', error);
      return {
        totalDays: 0,
        averageAttendance: 0,
        totalPresent: 0,
        totalAbsent: 0,
        totalLate: 0,
        totalExcused: 0,
        dailyStats: [],
      };
    }
  }

  async getMissingAttendance(classId: string, date: string, learners: Learner[]): Promise<Learner[]> {
    try {
      const existingAttendance = await this.getByClassAndDate(classId, date);
      const markedStudentIds = new Set(existingAttendance.map(r => r.studentId));
      
      return learners.filter(learner => !markedStudentIds.has(learner.id));
    } catch (error) {
      console.error('Error fetching missing attendance:', error);
      return [];
    }
  }

  async deleteAttendance(classId: string, studentId: string, date: string): Promise<void> {
    try {
      // Find all records for this student on this date
      const records = await this.getAttendanceWithFilters({
        classId,
        studentId,
        startDate: date,  // FIXED: Use startDate instead of date
        endDate: date      // FIXED: Use endDate instead of date
      });
      
      const batch = writeBatch(db);
      records.forEach(record => {
        const recordRef = doc(db, ATTENDANCE_COLLECTION, record.id);
        batch.delete(recordRef);
      });
      
      await batch.commit();
      await this.updateDailySummary(classId, '', date);
    } catch (error) {
      console.error('Error deleting attendance:', error);
      throw error;
    }
  }

  async getMonthlyReport(classId: string, month: string): Promise<{
    month: string;
    dailyRecords: Array<{
      date: string;
      present: number;
      absent: number;
      late: number;
      excused: number;
      attendanceRate: number;
    }>;
    summary: {
      totalDays: number;
      averageAttendance: number;
      bestDay: string;
      worstDay: string;
    };
  }> {
    try {
      const [year, monthNum] = month.split('-');
      const startDate = `${year}-${monthNum}-01`;
      const lastDay = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
      const endDate = `${year}-${monthNum}-${lastDay}`;
      
      const q = query(
        collection(db, DAILY_ATTENDANCE_COLLECTION),
        where('classId', '==', classId),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'asc')
      );
      
      const querySnapshot = await getDocs(q);
      const dailySummaries = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          lastUpdated: data.lastUpdated?.toDate ? data.lastUpdated.toDate() : data.lastUpdated,
        } as DailyAttendance;
      });
      
      const dailyRecords = dailySummaries.map(summary => ({
        date: summary.date,
        present: summary.summary.present,
        absent: summary.summary.absent,
        late: summary.summary.late,
        excused: summary.summary.excused,
        attendanceRate: summary.summary.total > 0 
          ? ((summary.summary.present + summary.summary.late) / summary.summary.total) * 100 
          : 0,
      }));
      
      const totalDays = dailyRecords.length;
      const averageAttendance = totalDays > 0 
        ? dailyRecords.reduce((sum, day) => sum + day.attendanceRate, 0) / totalDays 
        : 0;
      
      const sortedByRate = [...dailyRecords].sort((a, b) => b.attendanceRate - a.attendanceRate);
      
      return {
        month,
        dailyRecords,
        summary: {
          totalDays,
          averageAttendance,
          bestDay: sortedByRate[0]?.date || '',
          worstDay: sortedByRate[sortedByRate.length - 1]?.date || '',
        },
      };
    } catch (error) {
      console.error('Error generating monthly report:', error);
      return {
        month,
        dailyRecords: [],
        summary: {
          totalDays: 0,
          averageAttendance: 0,
          bestDay: '',
          worstDay: '',
        },
      };
    }
  }

  async getSchoolAttendanceSummary(date: string): Promise<{
    totalStudents: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    rate: number;
    byClass: Array<{
      classId: string;
      className: string;
      total: number;
      present: number;
      absent: number;
      late: number;
      excused: number;
      rate: number;
    }>;
  }> {
    try {
      const records = await this.getAttendanceWithFilters({ 
        startDate: date,  // FIXED: Use startDate instead of date
        endDate: date      // FIXED: Use endDate instead of date
      });

      const classMap = new Map<string, {
        classId: string;
        className: string;
        records: AttendanceRecord[];
      }>();

      records.forEach(record => {
        if (!classMap.has(record.classId)) {
          classMap.set(record.classId, {
            classId: record.classId,
            className: record.className,
            records: []
          });
        }
        classMap.get(record.classId)!.records.push(record);
      });

      const byClass = Array.from(classMap.values()).map(cls => {
        const present = cls.records.filter(r => r.status === 'present').length;
        const late = cls.records.filter(r => r.status === 'late').length;
        const total = cls.records.length;

        return {
          classId: cls.classId,
          className: cls.className,
          total,
          present,
          absent: cls.records.filter(r => r.status === 'absent').length,
          late,
          excused: cls.records.filter(r => r.status === 'excused').length,
          rate: total > 0 ? Math.round(((present + late) / total) * 100) : 0
        };
      });

      const totalStudents = records.length;
      const present = records.filter(r => r.status === 'present').length;
      const late = records.filter(r => r.status === 'late').length;

      return {
        totalStudents,
        present,
        absent: records.filter(r => r.status === 'absent').length,
        late,
        excused: records.filter(r => r.status === 'excused').length,
        rate: totalStudents > 0 ? Math.round(((present + late) / totalStudents) * 100) : 0,
        byClass
      };
    } catch (error) {
      console.error('Error fetching school attendance summary:', error);
      return {
        totalStudents: 0,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
        rate: 0,
        byClass: []
      };
    }
  }
}

export const attendanceService = new AttendanceService();
export { AttendanceService };