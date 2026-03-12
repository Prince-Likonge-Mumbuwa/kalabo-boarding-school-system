// @/pages/teacher/TeacherDashboard.tsx - FIXED VERSION
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useResultsAnalytics } from '@/hooks/useResults';
import { attendanceService, AttendanceRecord } from '@/services/attendanceService';
import { useAttendanceAnalytics } from '@/hooks/useAttendanceAnalytics';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { 
  BookOpen, Users, TrendingUp, AlertCircle, Loader2, 
  Calendar, ChevronRight, FileText, ClipboardCheck, 
  BarChart3, GraduationCap, UserCheck, UserX, Clock,
  TrendingDown, Minus, AlertTriangle
} from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';

// ==================== TYPES ====================
// Use the type that comes from useSchoolClasses
interface ClassFromHook {
  id: string;
  name: string;
  year: number;
  level: number;
  section: string;
  type?: string;
  students?: number;
  formTeacherId?: string;
  teachers?: string[];
  [key: string]: any;
}

interface AttendanceStats {
  todayRate: number;
  weeklyRate: number;
  monthlyRate: number;
  totalPresent: number;
  totalStudents: number;
  lateToday: number;
  absentToday: number;
  excusedToday: number;
  ditchingToday: number;
  byClass: Array<{ 
    className: string; 
    rate: number; 
    present: number; 
    total: number;
    late: number;
    absent: number;
  }>;
  trend: 'up' | 'down' | 'stable';
  trendValue: string;
}

// ==================== SKELETON LOADER ====================
const DashboardSkeleton = () => (
  <div className="space-y-8 animate-pulse">
    <div>
      <div className="h-8 sm:h-9 lg:h-10 bg-gray-200 rounded w-64 mb-2"></div>
      <div className="h-4 sm:h-5 bg-gray-100 rounded w-72"></div>
    </div>
    
    <div>
      <div className="h-6 bg-gray-200 rounded w-40 mb-4"></div>
      <div className="grid grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="h-3 bg-gray-200 rounded w-20 mb-2"></div>
                <div className="h-7 sm:h-8 bg-gray-300 rounded w-12"></div>
              </div>
              <div className="p-2 sm:p-3 bg-gray-100 rounded-lg">
                <div className="w-5 h-5 sm:w-6 sm:h-6 bg-gray-300 rounded"></div>
              </div>
            </div>
            <div className="h-2 bg-gray-200 rounded w-24 mt-4"></div>
          </div>
        ))}
      </div>
    </div>
    
    <div>
      <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
            <div className="flex flex-col items-center gap-1 sm:gap-2">
              <div className="p-2 sm:p-2.5 bg-gray-100 rounded-lg">
                <div className="w-4 h-4 sm:w-5 sm:h-5 bg-gray-300 rounded"></div>
              </div>
              <div className="w-full space-y-1">
                <div className="h-3 bg-gray-200 rounded w-16 mx-auto"></div>
                <div className="h-2 bg-gray-100 rounded w-20 mx-auto"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ==================== EMPTY STATE ====================
const EmptyState = () => (
  <div className="bg-white rounded-2xl border border-gray-200 p-8 sm:p-12 text-center max-w-3xl mx-auto shadow-sm">
    <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-full mb-5">
      <BookOpen className="text-blue-500" size={32} />
    </div>
    <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">
      Awaiting Class Assignments
    </h2>
    <p className="text-sm sm:text-base text-gray-600 max-w-md mx-auto leading-relaxed">
      Your teaching assignments are currently being configured by the administration. 
      You'll receive access to your classes and students once the process is complete.
    </p>
    <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
      <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-500 bg-gray-50 px-4 py-2.5 rounded-lg border border-gray-200">
        <AlertCircle size={16} className="text-gray-400" />
        <span>Contact admin for updates</span>
      </div>
    </div>
  </div>
);

// ==================== METRIC CARD ====================
interface MetricCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  description: string;
  color: 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'indigo' | 'yellow';
  trend?: string;
  isLoading?: boolean;
  subtext?: string;
  onClick?: () => void;
}

const MetricCard = ({ label, value, icon: Icon, description, color, trend, isLoading, subtext, onClick }: MetricCardProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  const colorStyles = {
    blue: {
      bg: 'bg-gradient-to-br from-blue-50 to-indigo-50',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      value: 'text-blue-600',
      border: 'border-blue-200',
      hover: 'hover:border-blue-300'
    },
    purple: {
      bg: 'bg-gradient-to-br from-purple-50 to-pink-50',
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
      value: 'text-purple-600',
      border: 'border-purple-200',
      hover: 'hover:border-purple-300'
    },
    green: {
      bg: 'bg-gradient-to-br from-green-50 to-emerald-50',
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      value: 'text-green-600',
      border: 'border-green-200',
      hover: 'hover:border-green-300'
    },
    orange: {
      bg: 'bg-gradient-to-br from-orange-50 to-amber-50',
      iconBg: 'bg-orange-100',
      iconColor: 'text-orange-600',
      value: 'text-orange-600',
      border: 'border-orange-200',
      hover: 'hover:border-orange-300'
    },
    red: {
      bg: 'bg-gradient-to-br from-red-50 to-rose-50',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      value: 'text-red-600',
      border: 'border-red-200',
      hover: 'hover:border-red-300'
    },
    indigo: {
      bg: 'bg-gradient-to-br from-indigo-50 to-blue-50',
      iconBg: 'bg-indigo-100',
      iconColor: 'text-indigo-600',
      value: 'text-indigo-600',
      border: 'border-indigo-200',
      hover: 'hover:border-indigo-300'
    },
    yellow: {
      bg: 'bg-gradient-to-br from-yellow-50 to-amber-50',
      iconBg: 'bg-yellow-100',
      iconColor: 'text-yellow-600',
      value: 'text-yellow-600',
      border: 'border-yellow-200',
      hover: 'hover:border-yellow-300'
    }
  };

  const style = colorStyles[color];

  return (
    <div 
      className={`
        bg-white rounded-xl border border-gray-200 p-5
        hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5
        ${style.hover} ${onClick ? 'cursor-pointer' : ''}
      `}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">
            {label}
          </p>
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="h-7 w-16 bg-gray-200 rounded animate-pulse"></div>
            </div>
          ) : (
            <div className="flex items-baseline gap-1">
              <p className={`text-2xl sm:text-3xl font-bold ${style.value}`}>
                {value}
              </p>
              {trend && (
                <span className="text-xs text-gray-500 ml-1">{trend}</span>
              )}
            </div>
          )}
          {subtext && (
            <p className="text-xs text-gray-500 mt-1">{subtext}</p>
          )}
        </div>
        <div className={`
          p-2 sm:p-3 rounded-xl flex-shrink-0
          ${style.iconBg} ${style.iconColor}
        `}>
          <Icon size={isMobile ? 18 : 20} />
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-3 truncate">
        {description}
      </p>
    </div>
  );
};

// ==================== ATTENDANCE DETAIL CARD ====================
interface AttendanceDetailCardProps {
  stats: AttendanceStats;
  lateArrivals: any[];
  subjectTruancy: any[];
  onViewAll: () => void;
}

const AttendanceDetailCard = ({ stats, lateArrivals, subjectTruancy, onViewAll }: AttendanceDetailCardProps) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-5 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Today's Attendance Details</h3>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-xs text-green-600">Present</p>
            <p className="text-xl font-bold text-green-700">{stats.totalPresent}</p>
            <p className="text-xs text-green-500">{stats.todayRate}% of class</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <p className="text-xs text-red-600">Absent</p>
            <p className="text-xl font-bold text-red-700">{stats.absentToday}</p>
          </div>
          <div className="bg-yellow-50 rounded-lg p-3">
            <p className="text-xs text-yellow-600">Late</p>
            <p className="text-xl font-bold text-yellow-700">{stats.lateToday}</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-3">
            <p className="text-xs text-purple-600">Excused</p>
            <p className="text-xl font-bold text-purple-700">{stats.excusedToday}</p>
          </div>
        </div>

        {/* Trend Indicator */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-gray-500">Weekly trend:</span>
          {stats.trend === 'up' && <TrendingUp size={14} className="text-green-600" />}
          {stats.trend === 'down' && <TrendingDown size={14} className="text-red-600" />}
          {stats.trend === 'stable' && <Minus size={14} className="text-gray-600" />}
          <span className="text-xs font-medium">{stats.trendValue}</span>
        </div>
      </div>

      {expanded && (
        <div className="p-5 space-y-4">
          {/* Class Breakdown */}
          {stats.byClass.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">By Class</h4>
              <div className="space-y-2">
                {stats.byClass.map(cls => (
                  <div key={cls.className} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{cls.className}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500">{cls.present}/{cls.total}</span>
                      <span className={`w-16 text-right font-medium ${
                        cls.rate >= 90 ? 'text-green-600' :
                        cls.rate >= 75 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {cls.rate}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alerts */}
          {(lateArrivals.length > 0 || subjectTruancy.length > 0) && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Alerts</h4>
              <div className="space-y-2">
                {lateArrivals.slice(0, 3).map((late, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm p-2 bg-yellow-50 rounded">
                    <Clock size={14} className="text-yellow-600" />
                    <span className="text-gray-700">{late.studentName} - Late arrival</span>
                  </div>
                ))}
                {subjectTruancy.filter((t: any) => t.attendanceRate < 75).slice(0, 3).map((truancy: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm p-2 bg-orange-50 rounded">
                    <AlertTriangle size={14} className="text-orange-600" />
                    <span className="text-gray-700">
                      {truancy.studentName} - {truancy.attendanceRate.toFixed(0)}% in {truancy.subject}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* View All Button */}
          <button
            onClick={onViewAll}
            className="w-full mt-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm font-medium text-gray-700 transition-colors"
          >
            View Full Attendance Report
          </button>
        </div>
      )}
    </div>
  );
};

// ==================== QUICK ACTION BUTTON ====================
interface QuickActionProps {
  to: string;
  icon: React.ElementType;
  title: string;
  description: string;
  disabled?: boolean;
}

const QuickAction = ({ to, icon: Icon, title, description, disabled }: QuickActionProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  const content = (
    <div className={`
      flex flex-col items-center text-center gap-1 sm:gap-1.5
      p-3 sm:p-4
    `}>
      <div className={`
        p-2 sm:p-2.5 rounded-xl
        ${disabled 
          ? 'bg-gray-100 text-gray-400' 
          : 'bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 group-hover:from-blue-100 group-hover:to-indigo-100'
        }
        transition-all duration-200
      `}>
        <Icon size={isMobile ? 18 : 20} />
      </div>
      <div className="w-full min-w-0 space-y-0.5">
        <p className={`
          font-semibold text-xs sm:text-sm truncate
          ${disabled ? 'text-gray-400' : 'text-gray-900'}
        `}>
          {title}
        </p>
        <p className={`
          text-[0.65rem] sm:text-xs leading-tight truncate
          ${disabled ? 'text-gray-300' : 'text-gray-500'}
        `}>
          {description}
        </p>
      </div>
    </div>
  );

  if (disabled) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl opacity-60 cursor-not-allowed">
        {content}
      </div>
    );
  }

  return (
    <Link
      to={to}
      className="bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-md transition-all duration-200 group active:scale-[0.98]"
    >
      {content}
    </Link>
  );
};

// ==================== CLASS CARD ====================
interface ClassCardProps {
  classItem: ClassFromHook;
  isFormTeacher: boolean;
  userId?: string;
  attendanceRate?: number;
}

const ClassCard = ({ classItem, isFormTeacher, userId, attendanceRate }: ClassCardProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 hover:shadow-md transition-all duration-300 hover:border-gray-300">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-gray-900 text-base sm:text-lg">
            {classItem.name}
          </h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs sm:text-sm text-gray-600">
              Year {classItem.year}
            </span>
            {classItem.formTeacherId === userId && (
              <span className="text-[0.65rem] sm:text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
                Form Teacher
              </span>
            )}
          </div>
        </div>
        {attendanceRate !== undefined && (
          <div className={`px-2 py-1 rounded-full text-xs font-medium ${
            attendanceRate >= 90 ? 'bg-green-100 text-green-700' :
            attendanceRate >= 75 ? 'bg-yellow-100 text-yellow-700' :
            'bg-red-100 text-red-700'
          }`}>
            {attendanceRate}%
          </div>
        )}
      </div>
      
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2 text-gray-600">
          <Users size={isMobile ? 14 : 16} className="flex-shrink-0" />
          <span className="text-xs sm:text-sm">
            {classItem.students} student{classItem.students !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <Calendar size={isMobile ? 14 : 16} className="flex-shrink-0" />
          <span className="text-xs sm:text-sm">
            {classItem.type === 'grade' ? 'Grade' : 'Form'} {classItem.level}{classItem.section}
          </span>
        </div>
      </div>
      
      <Link
        to={`/dashboard/teacher/class/${classItem.id}`}
        className="mt-2 inline-flex items-center justify-between w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group"
      >
        <span className="text-xs font-medium text-gray-700">View class</span>
        <ChevronRight size={14} className="text-gray-400 group-hover:text-gray-600 transition-colors" />
      </Link>
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
export default function TeacherDashboard() {
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const [selectedTerm] = useState<string>('Term 1');
  const [selectedYear] = useState<number>(new Date().getFullYear());
  
  // Attendance state
  const [attendanceStats, setAttendanceStats] = useState<AttendanceStats>({
    todayRate: 0,
    weeklyRate: 0,
    monthlyRate: 0,
    totalPresent: 0,
    totalStudents: 0,
    lateToday: 0,
    absentToday: 0,
    excusedToday: 0,
    ditchingToday: 0,
    byClass: [],
    trend: 'stable',
    trendValue: '0% vs last week'
  });
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  
  // Fetch all active classes - FIXED: useSchoolClasses returns { classes, isLoading, etc }
  const { 
    classes = [], 
    isLoading: classesLoading 
  } = useSchoolClasses({ isActive: true });

  // Fetch results analytics for pass rate calculation
  const { 
    analytics, 
    isLoading: resultsLoading,
    isFetching 
  } = useResultsAnalytics({
    teacherId: user?.uid || '',
    term: selectedTerm,
    year: selectedYear,
  });

  // Initialize analytics for attendance records
  const analyticsAttendance = useAttendanceAnalytics(attendanceRecords);

  // Find classes assigned to this teacher - Now classes is already an array
  const assignedClasses = useMemo(() => {
    if (!user?.uid || !classes.length) return [];
    
    return classes.filter((cls: ClassFromHook) => 
      cls.teachers?.includes(user.uid) || 
      cls.formTeacherId === user.uid
    );
  }, [classes, user?.uid]);

  // Get form teacher class (if any)
  const formTeacherClass = useMemo(() => {
    return classes.find((cls: ClassFromHook) => cls.formTeacherId === user?.uid);
  }, [classes, user?.uid]);

  // Fetch comprehensive attendance data
  const fetchAttendanceData = useCallback(async () => {
    if (assignedClasses.length === 0) return;
    
    setLoadingAttendance(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoStr = weekAgo.toISOString().split('T')[0];
      
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      const monthAgoStr = monthAgo.toISOString().split('T')[0];
      
      let totalTodayPresent = 0;
      let totalTodayStudents = 0;
      let totalLateToday = 0;
      let totalAbsentToday = 0;
      let totalExcusedToday = 0;
      let totalDitchingToday = 0;
      
      const classStats = [];
      let allTodayRecords: AttendanceRecord[] = [];
      let allWeekRecords: AttendanceRecord[] = [];
      
      // For each class, fetch attendance data
      for (const cls of assignedClasses) {
        // Get today's attendance
        const todayRecords = await attendanceService.getByClassAndDate(cls.id, today);
        allTodayRecords = [...allTodayRecords, ...todayRecords];
        
        // Get weekly records for trend
        const weekRecords = await attendanceService.getByDateRange(weekAgoStr, today);
        allWeekRecords = [...allWeekRecords, ...weekRecords];
        
        const studentsInClass = cls.students || 0;
        
        if (studentsInClass > 0) {
          const present = todayRecords.filter(r => 
            r.status === 'present' || r.status === 'late'
          ).length;
          
          const late = todayRecords.filter(r => r.status === 'late').length;
          const absent = todayRecords.filter(r => r.status === 'absent').length;
          const excused = todayRecords.filter(r => r.status === 'excused').length;
          
          // Detect ditching (present in daily, absent in periodic)
          const dailyRecords = todayRecords.filter(r => r.attendanceType === 'daily');
          const periodicRecords = todayRecords.filter(r => r.attendanceType === 'periodic');
          
          const ditching = dailyRecords.filter(daily => {
            if (daily.status === 'present' || daily.status === 'late') {
              const studentPeriodic = periodicRecords.filter(p => p.studentId === daily.studentId);
              return studentPeriodic.some(p => p.status === 'absent' && !p.excuseReason);
            }
            return false;
          }).length;
          
          totalTodayPresent += present;
          totalTodayStudents += studentsInClass;
          totalLateToday += late;
          totalAbsentToday += absent;
          totalExcusedToday += excused;
          totalDitchingToday += ditching;
          
          classStats.push({
            className: cls.name,
            rate: studentsInClass > 0 ? Math.round((present / studentsInClass) * 100) : 0,
            present,
            total: studentsInClass,
            late,
            absent
          });
        }
      }
      
      setAttendanceRecords(allTodayRecords);
      
      // Calculate today's rate
      const todayRate = totalTodayStudents > 0 
        ? Math.round((totalTodayPresent / totalTodayStudents) * 100) 
        : 0;
      
      // Calculate weekly average
      const dailyGroups: Record<string, AttendanceRecord[]> = {};
      allWeekRecords.forEach(record => {
        if (!dailyGroups[record.date]) {
          dailyGroups[record.date] = [];
        }
        dailyGroups[record.date].push(record);
      });
      
      let weeklyTotal = 0;
      let weeklyDays = 0;
      
      Object.entries(dailyGroups).forEach(([date, records]) => {
        const dayStudents = new Set(records.map(r => r.studentId)).size;
        const dayPresent = records.filter(r => r.status === 'present' || r.status === 'late').length;
        if (dayStudents > 0) {
          weeklyTotal += (dayPresent / dayStudents) * 100;
          weeklyDays++;
        }
      });
      
      const weeklyRate = weeklyDays > 0 ? Math.round(weeklyTotal / weeklyDays) : 0;
      
      // Calculate trend
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      const yesterdayGroups = allWeekRecords.filter(r => r.date === yesterdayStr);
      const yesterdayStudents = new Set(yesterdayGroups.map(r => r.studentId)).size;
      const yesterdayPresent = yesterdayGroups.filter(r => r.status === 'present' || r.status === 'late').length;
      const yesterdayRate = yesterdayStudents > 0 ? (yesterdayPresent / yesterdayStudents) * 100 : 0;
      
      const trendDiff = todayRate - yesterdayRate;
      const trend = trendDiff > 2 ? 'up' : trendDiff < -2 ? 'down' : 'stable';
      const trendValue = `${trendDiff > 0 ? '+' : ''}${trendDiff.toFixed(1)}% vs yesterday`;
      
      setAttendanceStats({
        todayRate,
        weeklyRate,
        monthlyRate: weeklyRate, // Simplified for now
        totalPresent: totalTodayPresent,
        totalStudents: totalTodayStudents,
        lateToday: totalLateToday,
        absentToday: totalAbsentToday,
        excusedToday: totalExcusedToday,
        ditchingToday: totalDitchingToday,
        byClass: classStats,
        trend,
        trendValue
      });
    } catch (error) {
      console.error('Error fetching attendance:', error);
    } finally {
      setLoadingAttendance(false);
    }
  }, [assignedClasses]);

  // Fetch attendance data on mount and when assignedClasses changes
  useEffect(() => {
    fetchAttendanceData();
    
    // Set up periodic refresh every 5 minutes
    const interval = setInterval(fetchAttendanceData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAttendanceData]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalStudents = assignedClasses.reduce((sum, cls) => sum + (cls.students || 0), 0);
    
    const passRate = analytics?.passRate || 0;
    const averagePercentage = analytics?.averagePercentage || 0;
    
    return {
      classesHandled: assignedClasses.length,
      totalStudents,
      subjects: user?.subjects || [],
      passRate,
      averagePercentage,
      isFormTeacher: !!formTeacherClass,
      formClassName: formTeacherClass?.name,
    };
  }, [assignedClasses, user?.subjects, formTeacherClass, analytics]);

  // Loading state
  if (classesLoading) {
    return (
      <DashboardLayout activeTab="dashboard">
        <div className="p-4 sm:p-6 lg:p-8">
          <DashboardSkeleton />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="dashboard">
      <div className="p-4 sm:p-6 lg:p-8 space-y-8 sm:space-y-10">
        
        {/* ===== HEADER ===== */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
              Teacher Dashboard
            </h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1 flex items-center gap-2 flex-wrap">
              <span>Welcome back, {user?.fullName?.split(' ')[0] || 'Teacher'}</span>
              {stats.isFormTeacher && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="text-blue-600 font-medium">
                    Form Teacher, {stats.formClassName}
                  </span>
                </>
              )}
              {(resultsLoading || isFetching || loadingAttendance) && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="inline-flex items-center gap-1.5 text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full text-xs">
                    <Loader2 size={12} className="animate-spin" />
                    updating stats
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* ===== EMPTY STATE ===== */}
        {assignedClasses.length === 0 && (
          <EmptyState />
        )}

        {/* ===== SUBJECT TAGS ===== */}
        {stats.subjects.length > 0 && assignedClasses.length > 0 && (
          <div>
            <p className="text-xs sm:text-sm font-medium text-gray-600 mb-2 sm:mb-3">
              Teaching subjects
            </p>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {stats.subjects.map((subject, idx) => (
                <span
                  key={idx}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-blue-50 to-indigo-50 
                           text-blue-700 rounded-full text-xs sm:text-sm font-medium border border-blue-200"
                >
                  {subject}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ===== KEY METRICS - 2x2 MATRIX ===== */}
        {assignedClasses.length > 0 && (
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">
              Performance Overview
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {/* Card 1: Classes Assigned */}
              <MetricCard
                label="Classes"
                value={stats.classesHandled}
                icon={BookOpen}
                description="Classes you currently teach"
                color="blue"
              />
              
              {/* Card 2: Total Students */}
              <MetricCard
                label="Students"
                value={stats.totalStudents}
                icon={Users}
                description="Learners across all classes"
                color="purple"
              />
              
              {/* Card 3: Pass Rate */}
              <MetricCard
                label="Pass Rate"
                value={stats.passRate > 0 ? `${stats.passRate}%` : '—'}
                icon={TrendingUp}
                description={`Average pass rate • ${selectedTerm} ${selectedYear}`}
                color="green"
                isLoading={resultsLoading}
                subtext={stats.averagePercentage > 0 ? `${stats.averagePercentage}% avg` : undefined}
              />
              
              {/* Card 4: Today's Attendance */}
              <MetricCard
                label="Today's Attendance"
                value={attendanceStats.todayRate > 0 ? `${attendanceStats.todayRate}%` : '—'}
                icon={UserCheck}
                description={`${attendanceStats.totalPresent}/${attendanceStats.totalStudents} students`}
                color={attendanceStats.todayRate >= 90 ? 'green' : attendanceStats.todayRate >= 75 ? 'yellow' : 'orange'}
                isLoading={loadingAttendance}
                subtext={`${attendanceStats.lateToday} late, ${attendanceStats.ditchingToday} ditching`}
              />
            </div>
          </div>
        )}

        {/* ===== ATTENDANCE DETAIL CARD ===== */}
        {assignedClasses.length > 0 && !loadingAttendance && attendanceStats.totalStudents > 0 && (
          <AttendanceDetailCard
            stats={attendanceStats}
            lateArrivals={analyticsAttendance.lateArrivals}
            subjectTruancy={analyticsAttendance.subjectTruancy}
            onViewAll={() => window.location.href = '/dashboard/teacher/attendance'}
          />
        )}

        {/* ===== QUICK ACTIONS ===== */}
        {assignedClasses.length > 0 && (
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">
              Quick actions
            </h2>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <QuickAction
                to="/dashboard/teacher/results-entry"
                icon={ClipboardCheck}
                title="Enter results"
                description="Record grades"
              />
              <QuickAction
                to="/dashboard/teacher/attendance"
                icon={Calendar}
                title="Attendance"
                description="Mark register"
              />
              <QuickAction
                to="/dashboard/teacher/results-analysis"
                icon={BarChart3}
                title="Analysis"
                description="View insights"
              />
            </div>
          </div>
        )}

        {/* ===== CLASSES OVERVIEW ===== */}
        {assignedClasses.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                Your classes
              </h2>
              <span className="text-xs sm:text-sm text-gray-500">
                {assignedClasses.length} total
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assignedClasses.map((classItem: ClassFromHook) => {
                const classAttendance = attendanceStats.byClass.find(c => c.className === classItem.name);
                return (
                  <ClassCard
                    key={classItem.id}
                    classItem={classItem}
                    isFormTeacher={classItem.formTeacherId === user?.uid}
                    userId={user?.uid}
                    attendanceRate={classAttendance?.rate}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}