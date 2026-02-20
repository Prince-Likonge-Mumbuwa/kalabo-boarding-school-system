// @/services/attendanceService.ts
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
  DailyAttendance, 
  AttendanceStatus,
  StudentAttendanceSummary 
} from '@/types/attendance';
import { Learner, Class } from '@/types/school';

// EXPORT ALL TYPES so they can be imported from this service
export type { 
  AttendanceRecord, 
  DailyAttendance, 
  AttendanceStatus,
  StudentAttendanceSummary 
};

const ATTENDANCE_COLLECTION = 'attendance';
const DAILY_ATTENDANCE_COLLECTION = 'dailyAttendance';

class AttendanceService {
  
  /**
   * Mark attendance for a single student
   */
  async markAttendance(data: {
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
  }): Promise<AttendanceRecord> {
    try {
      const recordId = `${data.classId}_${data.studentId}_${data.date}`;
      const recordRef = doc(db, ATTENDANCE_COLLECTION, recordId);
      
      // Create base record without optional fields
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
      };

      // Only add excuseReason if it exists and is not empty
      if (data.excuseReason && data.excuseReason.trim() !== '') {
        record.excuseReason = data.excuseReason.trim();
      }
      
      // Only add studentGender if it exists
      if (data.studentGender) {
        record.studentGender = data.studentGender;
      }

      await setDoc(recordRef, record, { merge: true });
      
      // Also update daily summary
      await this.updateDailySummary(data.classId, data.className, data.date);
      
      return record as AttendanceRecord;
    } catch (error) {
      console.error('Error marking attendance:', error);
      throw error;
    }
  }

  /**
   * Bulk mark attendance for multiple students
   */
  async bulkMarkAttendance(data: {
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
  }): Promise<AttendanceRecord[]> {
    const batch = writeBatch(db);
    const records: AttendanceRecord[] = [];

    try {
      for (const item of data.records) {
        const recordId = `${data.classId}_${item.studentId}_${data.date}`;
        const recordRef = doc(db, ATTENDANCE_COLLECTION, recordId);
        
        // Create base record without optional fields
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
        };

        // Only add studentGender if it exists
        if (item.studentGender) {
          record.studentGender = item.studentGender;
        }
        
        // Only add excuseReason if it exists and is not empty
        if (item.excuseReason && item.excuseReason.trim() !== '') {
          record.excuseReason = item.excuseReason.trim();
        }

        batch.set(recordRef, record, { merge: true });
        records.push(record as AttendanceRecord);
      }

      await batch.commit();
      
      // Update daily summary
      await this.updateDailySummary(data.classId, data.className, data.date);
      
      return records;
    } catch (error) {
      console.error('Error bulk marking attendance:', error);
      throw error;
    }
  }

  /**
   * Get attendance for a specific class and date
   */
  async getByClassAndDate(classId: string, date: string): Promise<AttendanceRecord[]> {
    try {
      const q = query(
        collection(db, ATTENDANCE_COLLECTION),
        where('classId', '==', classId),
        where('date', '==', date)
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        // Ensure we return properly typed data
        return {
          ...data,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
        } as AttendanceRecord;
      });
    } catch (error) {
      console.error('Error fetching attendance:', error);
      return [];
    }
  }

  /**
   * Get today's attendance for a class
   */
  async getTodaysAttendance(classId: string): Promise<AttendanceRecord[]> {
    const today = new Date().toISOString().split('T')[0];
    return this.getByClassAndDate(classId, today);
  }

  /**
   * Get attendance for a student over a date range
   */
  async getStudentAttendance(
    studentId: string, 
    startDate: string, 
    endDate: string
  ): Promise<AttendanceRecord[]> {
    try {
      const q = query(
        collection(db, ATTENDANCE_COLLECTION),
        where('studentId', '==', studentId),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
        } as AttendanceRecord;
      });
    } catch (error) {
      console.error('Error fetching student attendance:', error);
      return [];
    }
  }

  /**
   * Get attendance summary for a student
   */
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
      
      // Last 30 days stats (excluding future dates)
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

  /**
   * Update or create daily attendance summary
   */
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
      
      // Gender-based counts
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

  /**
   * Get daily summary for a class and date
   */
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

  /**
   * Get attendance statistics for a class over a period
   */
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
      const q = query(
        collection(db, ATTENDANCE_COLLECTION),
        where('classId', '==', classId),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'asc')
      );
      
      const querySnapshot = await getDocs(q);
      const records = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp,
        } as AttendanceRecord;
      });
      
      // Group by date
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

  /**
   * Get students with missing attendance for a date
   */
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

  /**
   * Delete an attendance record
   */
  async deleteAttendance(classId: string, studentId: string, date: string): Promise<void> {
    try {
      const recordId = `${classId}_${studentId}_${date}`;
      const recordRef = doc(db, ATTENDANCE_COLLECTION, recordId);
      await deleteDoc(recordRef);
      
      // Update daily summary
      await this.updateDailySummary(classId, '', date);
    } catch (error) {
      console.error('Error deleting attendance:', error);
      throw error;
    }
  }

  /**
   * Get monthly attendance report for a class
   */
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
}

// Export the service instance
export const attendanceService = new AttendanceService();

// Also export the class itself if needed
export { AttendanceService };