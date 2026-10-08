// @/pages/teacher/TeacherDashboard.tsx
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useResultsAnalytics } from '@/hooks/useResults';
import { attendanceService } from '@/services/attendanceService';
import { useAttendanceRollupsForDate } from '@/hooks/useAttendanceRollup';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import { TeacherResultsWarning } from '@/components/results/TeacherResultsWarning';
import {
  BookOpen, Users, TrendingUp, AlertCircle, Loader2,
  Calendar, ChevronRight, ClipboardCheck,
  BarChart3, UserCheck, Clock,
  TrendingDown, Minus, AlertTriangle,
} from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

// ==================== TYPES ====================
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
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      value: 'text-blue-600',
      hover: 'hover:border-blue-300',
    },
    purple: {
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
      value: 'text-purple-600',
      hover: 'hover:border-purple-300',
    },
    green: {
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      value: 'text-green-600',
      hover: 'hover:border-green-300',
    },
    orange: {
      iconBg: 'bg-orange-100',
      iconColor: 'text-orange-600',
      value: 'text-orange-600',
      hover: 'hover:border-orange-300',
    },
    red: {
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      value: 'text-red-600',
      hover: 'hover:border-red-300',
    },
    indigo: {
      iconBg: 'bg-indigo-100',
      iconColor: 'text-indigo-600',
      value: 'text-indigo-600',
      hover: 'hover:border-indigo-300',
    },
    yellow: {
      iconBg: 'bg-yellow-100',
      iconColor: 'text-yellow-600',
      value: 'text-yellow-600',
      hover: 'hover:border-yellow-300',
    },
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
  lateArrivals: Array<{ studentName: string; className: string }>;
  subjectTruancy: Array<{ studentName: string; subject: string; rate: number }>;
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
                {subjectTruancy.slice(0, 3).map((truancy, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm p-2 bg-orange-50 rounded">
                    <AlertTriangle size={14} className="text-orange-600" />
                    <span className="text-gray-700">
                      {truancy.studentName} - {truancy.rate.toFixed(0)}% in {truancy.subject}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
    <div className="flex flex-col items-center text-center gap-1 sm:gap-1.5 p-3 sm:p-4">
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
        <p className={`font-semibold text-xs sm:text-sm truncate ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>
          {title}
        </p>
        <p className={`text-[0.65rem] sm:text-xs leading-tight truncate ${disabled ? 'text-gray-300' : 'text-gray-500'}`}>
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
            {isFormTeacher && (
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
  const navigate = useNavigate();

  const academicTerm = useAcademicTerm();
  const selectedTerm = academicTerm.term;
  const selectedYear = academicTerm.year;

  // ── Fetch all active classes ─────────────────────────────────────────
  const {
    classes = [],
    isLoading: classesLoading,
  } = useSchoolClasses({ isActive: true });

  // ── Results analytics ────────────────────────────────────────────────
  const {
    analytics,
    isLoading: resultsLoading,
    isFetching,
  } = useResultsAnalytics({
    teacherId: user?.uid || '',
    term: selectedTerm,
    year: selectedYear,
  });

  // ── Assigned classes ─────────────────────────────────────────────────
  // The class is "assigned" if the teacher appears in `teachers`, or if
  // they are the effective form teacher. The latter covers owner, TP, and
  // live-cover teachers — the hook's `isFormTeacher` flag already accounts
  // for that via the assignment engine.
  const assignedClasses = useMemo(() => {
    if (!user?.uid || !classes.length) return [];
    return classes.filter((cls: ClassFromHook) =>
      cls.teachers?.includes(user.uid) ||
      cls.formTeacherId === user.uid ||
      cls.isFormTeacher === true
    );
  }, [classes, user?.uid]);

  const formTeacherClass = useMemo(() => {
    return classes.find((cls: ClassFromHook) =>
      cls.formTeacherId === user?.uid || cls.isFormTeacher === true
    );
  }, [classes, user?.uid]);

  // ── Attendance data for today (all classes) ─────────────────────────
  const today = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  const todayRollupsQuery = useAttendanceRollupsForDate(today);

  // Last-7-days range for weekly stats
  const weekAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  // Gate on `user?.uid` only. `assignedClasses` may still be empty while
  // useSchoolClasses resolves; the filter is applied in memory below.
  const weekSessionsQuery = useQuery({
    queryKey: ['attendance_sessions', 'teacher_dashboard_week', weekAgo, today],
    queryFn: () => attendanceService.getSessionsByDateRange(weekAgo, today),
    staleTime: 5 * 60_000,
    enabled: !!user?.uid,
  });

  const learnersQuery = useQuery({
    queryKey: ['learners', 'active_indexed'],
    queryFn: () => attendanceService.getActiveLearnersIndexed(),
    staleTime: 5 * 60_000,
    enabled: !!user?.uid,
  });

  // ── Derive attendance stats ──────────────────────────────────────────
  const attendanceStats = useMemo((): AttendanceStats => {
    const empty: AttendanceStats = {
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
      trendValue: '0% vs last week',
    };

    if (!learnersQuery.data || assignedClasses.length === 0) return empty;

    const assignedClassIds = new Set(assignedClasses.map(c => c.id));

    const learnersByClass = new Map<string, number>();
    for (const l of learnersQuery.data) {
      if (!assignedClassIds.has(l.classId)) continue;
      learnersByClass.set(l.classId, (learnersByClass.get(l.classId) || 0) + 1);
    }
    const classSize = (classId: string, fallbackTotal: number) =>
      learnersByClass.get(classId) ?? fallbackTotal;

    // ── Today ──────────────────────────────────────────────────────────
    const todayRollups = (todayRollupsQuery.data ?? []).filter(
      r => assignedClassIds.has(r.classId),
    );

    let totalPresentToday = 0;
    let totalLateToday = 0;
    let totalAbsentToday = 0;
    let totalExcusedToday = 0;
    let totalStudentsToday = 0;

    const byClass: AttendanceStats['byClass'] = [];

    for (const r of todayRollups) {
      // Prefer the daily roll call; fall back to periodic totals when the
      // form teacher hasn't marked today but subject teachers have.
      let present = 0;
      let absent = 0;
      let late = 0;
      let excused = 0;
      let sourceTotal = 0;

      if (r.daily) {
        present = r.daily.present;
        absent = r.daily.absent;
        late = r.daily.late;
        excused = r.daily.excused;
        sourceTotal = r.daily.total;
      } else if (r.periodicTotals.sessionCount > 0) {
        for (const bucket of Object.values(r.periodicTotals.bySubject)) {
          present += bucket.present;
          absent += bucket.absent;
          late += bucket.late;
          excused += bucket.excused;
          sourceTotal += bucket.total;
        }
      } else {
        continue;
      }

      const students = classSize(r.classId, sourceTotal);

      totalPresentToday += present;
      totalLateToday += late;
      totalAbsentToday += absent;
      totalExcusedToday += excused;
      totalStudentsToday += students;

      const rate = students > 0
        ? Math.round(((present + late) / students) * 100)
        : 0;

      byClass.push({
        className: r.className,
        rate,
        present: present + late,
        total: students,
        late,
        absent,
      });
    }

    const todayRate = totalStudentsToday > 0
      ? Math.round(((totalPresentToday + totalLateToday) / totalStudentsToday) * 100)
      : 0;

    // ── Weekly ─────────────────────────────────────────────────────────
    const weekSessions = weekSessionsQuery.data ?? [];
    const weekByDate = new Map<string, { present: number; total: number }>();

    for (const s of weekSessions) {
      if (!assignedClassIds.has(s.classId)) continue;
      if (s.kind !== 'daily') continue;
      const acc = weekByDate.get(s.date) ?? { present: 0, total: 0 };
      acc.present += s.summary.present + s.summary.late;
      acc.total += s.summary.total;
      weekByDate.set(s.date, acc);
    }

    let weeklySum = 0;
    let weeklyCount = 0;
    for (const { present, total } of weekByDate.values()) {
      if (total > 0) {
        weeklySum += (present / total) * 100;
        weeklyCount++;
      }
    }
    const weeklyRate = weeklyCount > 0 ? Math.round(weeklySum / weeklyCount) : 0;

    // ── Trend: today vs yesterday ──────────────────────────────────────
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yY = yesterday.getFullYear();
    const yM = String(yesterday.getMonth() + 1).padStart(2, '0');
    const yD = String(yesterday.getDate()).padStart(2, '0');
    const yesterdayStr = `${yY}-${yM}-${yD}`;

    const yesterdayAcc = weekByDate.get(yesterdayStr);
    const yesterdayRate = yesterdayAcc && yesterdayAcc.total > 0
      ? (yesterdayAcc.present / yesterdayAcc.total) * 100
      : 0;

    const trendDiff = todayRate - yesterdayRate;
    const trend: AttendanceStats['trend'] =
      trendDiff > 2 ? 'up' : trendDiff < -2 ? 'down' : 'stable';
    const trendValue = `${trendDiff > 0 ? '+' : ''}${trendDiff.toFixed(1)}% vs yesterday`;

    return {
      todayRate,
      weeklyRate,
      monthlyRate: weeklyRate,
      totalPresent: totalPresentToday + totalLateToday,
      totalStudents: totalStudentsToday,
      lateToday: totalLateToday,
      absentToday: totalAbsentToday,
      excusedToday: totalExcusedToday,
      ditchingToday: 0,
      byClass,
      trend,
      trendValue,
    };
  }, [
    todayRollupsQuery.data,
    weekSessionsQuery.data,
    learnersQuery.data,
    assignedClasses,
  ]);

  // ── Late arrivals and subject alerts for the detail card ────────────
  const lateArrivals = useMemo(() => {
    const assignedClassIds = new Set(assignedClasses.map(c => c.id));
    const out: Array<{ studentName: string; className: string }> = [];
    for (const r of todayRollupsQuery.data ?? []) {
      if (!assignedClassIds.has(r.classId)) continue;
      for (const la of r.lateArrivals ?? []) {
        out.push({ studentName: la.studentName, className: r.className });
      }
    }
    return out;
  }, [todayRollupsQuery.data, assignedClasses]);

  const subjectTruancy = useMemo(() => {
    const assignedClassIds = new Set(assignedClasses.map(c => c.id));
    const out: Array<{ studentName: string; subject: string; rate: number }> = [];
    for (const r of todayRollupsQuery.data ?? []) {
      if (!assignedClassIds.has(r.classId)) continue;
      for (const sa of r.subjectAlerts ?? []) {
        out.push({ studentName: sa.studentName, subject: sa.subject, rate: sa.rate });
      }
    }
    return out;
  }, [todayRollupsQuery.data, assignedClasses]);

  // ── Navigation handler for results entry ────────────────────────────
  const handleNavigateToResults = useCallback((entry: any) => {
    navigate('/dashboard/teacher/results-entry', {
      state: {
        classId: entry.classId,
        className: entry.className,
        subjectId: entry.subjectId,
        subjectName: entry.subjectName,
        examType: entry.examType,
        examName: entry.examName,
        term: selectedTerm,
        year: selectedYear,
      },
    });
  }, [navigate, selectedTerm, selectedYear]);

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

  const loadingAttendance =
    todayRollupsQuery.isLoading ||
    weekSessionsQuery.isLoading ||
    learnersQuery.isLoading;

  const attendanceError =
    todayRollupsQuery.isError ||
    weekSessionsQuery.isError ||
    learnersQuery.isError;

  const attendanceErrorMessage =
    (todayRollupsQuery.error as Error | null)?.message ||
    (weekSessionsQuery.error as Error | null)?.message ||
    (learnersQuery.error as Error | null)?.message ||
    null;

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

              <span className="text-gray-300">•</span>
              <span className="inline-flex items-center gap-1.5 text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full text-xs font-medium border border-blue-200">
                <Calendar size={12} />
                {academicTerm.label}
                {academicTerm.daysRemaining > 0 && (
                  <span className="text-blue-500">
                    • {academicTerm.daysRemaining}d left
                  </span>
                )}
              </span>

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

        {/* ===== ATTENDANCE ERROR BANNER ===== */}
        {attendanceError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm text-red-700">
              Could not load attendance data
              {attendanceErrorMessage ? `: ${attendanceErrorMessage}` : '.'}
            </p>
            <button
              onClick={() => {
                todayRollupsQuery.refetch();
                weekSessionsQuery.refetch();
                learnersQuery.refetch();
              }}
              className="mt-2 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        )}

        {/* ===== RESULTS ENTRY WARNING ===== */}
        {assignedClasses.length > 0 && (
          <TeacherResultsWarning
            term={selectedTerm}
            year={selectedYear}
            compact={false}
            onNavigateToResults={handleNavigateToResults}
          />
        )}

        {/* ===== EMPTY STATE ===== */}
        {assignedClasses.length === 0 && <EmptyState />}

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

        {/* ===== KEY METRICS ===== */}
        {assignedClasses.length > 0 && (
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">
              Performance Overview
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <MetricCard
                label="Classes"
                value={stats.classesHandled}
                icon={BookOpen}
                description="Classes you currently teach"
                color="blue"
              />

              <MetricCard
                label="Students"
                value={stats.totalStudents}
                icon={Users}
                description="Learners across all classes"
                color="purple"
              />

              <MetricCard
                label="Pass Rate"
                value={stats.passRate > 0 ? `${stats.passRate}%` : '—'}
                icon={TrendingUp}
                description={`Average pass rate • ${academicTerm.label}`}
                color="green"
                isLoading={resultsLoading}
                subtext={stats.averagePercentage > 0 ? `${stats.averagePercentage}% avg` : undefined}
              />

              <MetricCard
                label="Today's Attendance"
                value={
                  attendanceStats.totalStudents === 0
                    ? 'Not marked'
                    : `${attendanceStats.todayRate}%`
                }
                icon={UserCheck}
                description={
                  attendanceStats.totalStudents === 0
                    ? 'No roll call taken yet'
                    : `${attendanceStats.totalPresent}/${attendanceStats.totalStudents} students`
                }
                color={
                  attendanceStats.totalStudents === 0
                    ? 'blue'
                    : attendanceStats.todayRate >= 90
                    ? 'green'
                    : attendanceStats.todayRate >= 75
                    ? 'yellow'
                    : 'orange'
                }
                isLoading={loadingAttendance}
                subtext={
                  attendanceStats.totalStudents === 0
                    ? undefined
                    : `${attendanceStats.lateToday} late`
                }
              />
            </div>
          </div>
        )}

        {/* ===== ATTENDANCE DETAIL CARD ===== */}
        {assignedClasses.length > 0 && !loadingAttendance && attendanceStats.totalStudents > 0 && (
          <AttendanceDetailCard
            stats={attendanceStats}
            lateArrivals={lateArrivals}
            subjectTruancy={subjectTruancy}
            onViewAll={() => { navigate('/dashboard/teacher/attendance'); }}
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
                const isFT =
                  classItem.formTeacherId === user?.uid ||
                  classItem.isFormTeacher === true;
                return (
                  <ClassCard
                    key={classItem.id}
                    classItem={classItem}
                    isFormTeacher={isFT}
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