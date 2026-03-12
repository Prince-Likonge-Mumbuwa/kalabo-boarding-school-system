// @/pages/admin/AttendanceOverview.tsx
import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useEffect, useMemo } from 'react';
import { attendanceService, AttendanceRecord } from '@/services/attendanceService';
import { useAttendanceAnalytics } from '@/hooks/useAttendanceAnalytics';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useAuth } from '@/hooks/useAuth';
import { CompactStats } from '@/components/attendance/CompactStats';
import { 
  exportAttendanceRecords, 
  exportLateArrivals, 
  exportSubjectTruancy, 
  exportTeacherActivity,
  exportRiskAnalysis 
} from '@/utils/exportUtils';
import { 
  Calendar, Filter, Download, RefreshCw, 
  Search, ChevronDown, X,
  CheckCircle2, XCircle, AlertCircle, Clock,
  Users, TrendingUp, TrendingDown, Minus,
  Loader2, UserCheck, UserX, BookOpen,
  BarChart3, AlertTriangle, FileText
} from 'lucide-react';
import { Timestamp } from 'firebase/firestore';

// ==================== TYPES ====================
interface AttendanceSummary {
  date: string;
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  rate: number;
  classBreakdown: {
    [classId: string]: {
      className: string;
      total: number;
      present: number;
      absent: number;
      late: number;
      excused: number;
      rate: number;
    };
  };
}

interface DateRange {
  start: string;
  end: string;
}

type ViewMode = 'daily' | 'weekly' | 'monthly' | 'class';
type ExportType = 'all' | 'late' | 'truancy' | 'teacher' | 'risk';

interface AdvancedFilters {
  attendanceType: 'all' | 'daily' | 'periodic';
  teacherId: string;
  subject: string;
  period?: string;
  showWeekdaysOnly: boolean;
}

// ==================== ADVANCED FILTERS COMPONENT ====================
const AdvancedFilters = ({ 
  filters, 
  onChange,
  teachers,
  subjects,
  onClose 
}: { 
  filters: AdvancedFilters;
  onChange: (filters: AdvancedFilters) => void;
  teachers: Array<{ id: string; name: string }>;
  subjects: string[];
  onClose: () => void;
}) => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Advanced Filters</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Attendance Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Attendance Type
          </label>
          <select
            value={filters.attendanceType}
            onChange={(e) => onChange({ 
              ...filters, 
              attendanceType: e.target.value as 'all' | 'daily' | 'periodic'
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="all">All Types</option>
            <option value="daily">Daily Roll Call</option>
            <option value="periodic">Periodic Attendance</option>
          </select>
        </div>

        {/* Teacher Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Teacher
          </label>
          <select
            value={filters.teacherId}
            onChange={(e) => onChange({ ...filters, teacherId: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Teachers</option>
            {teachers.map(teacher => (
              <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
            ))}
          </select>
        </div>

        {/* Subject Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Subject
          </label>
          <select
            value={filters.subject}
            onChange={(e) => onChange({ ...filters, subject: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Subjects</option>
            {subjects.map(subject => (
              <option key={subject} value={subject}>{subject}</option>
            ))}
          </select>
        </div>

        {/* Period Filter (for periodic) */}
        {filters.attendanceType === 'periodic' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Period
            </label>
            <select
              value={filters.period || ''}
              onChange={(e) => onChange({ ...filters, period: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">All Periods</option>
              {[1,2,3,4,5,6,7,8].map(p => (
                <option key={p} value={p.toString()}>Period {p}</option>
              ))}
            </select>
          </div>
        )}

        {/* Weekdays Only Toggle */}
        <div className="col-span-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filters.showWeekdaysOnly}
              onChange={(e) => onChange({ 
                ...filters, 
                showWeekdaysOnly: e.target.checked 
              })}
              className="rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-700">Show Monday-Friday only</span>
          </label>
        </div>
      </div>
    </div>
  );
};

// ==================== RISK OVERVIEW COMPONENT ====================
const RiskOverview = ({ records }: { records: AttendanceRecord[] }) => {
  const [riskData, setRiskData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadRisks = async () => {
      setLoading(true);
      try {
        // Get unique classes from records
        const classIds = [...new Set(records.map(r => r.classId))];
        const allRisks = await Promise.all(
          classIds.map(async classId => {
            const className = records.find(r => r.classId === classId)?.className || '';
            return attendanceService.getClassRiskAnalysis(classId, className, 30);
          })
        );
        setRiskData(allRisks.flat());
      } catch (error) {
        console.error('Error loading risks:', error);
      } finally {
        setLoading(false);
      }
    };

    if (records.length > 0) {
      loadRisks();
    }
  }, [records]);

  const highRiskCount = riskData.filter((r: any) => r.riskLevel === 'high').length;
  const mediumRiskCount = riskData.filter((r: any) => r.riskLevel === 'medium').length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">At-Risk Students</h3>
        <div className="flex gap-2">
          <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">
            High: {highRiskCount}
          </span>
          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">
            Medium: {mediumRiskCount}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-blue-600" />
        </div>
      ) : riskData.length > 0 ? (
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {riskData
            .filter((r: any) => r.riskLevel !== 'low')
            .slice(0, 10)
            .map((risk: any) => (
              <div key={risk.studentId} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{risk.studentName}</p>
                    <p className="text-xs text-gray-600">{risk.className}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    risk.riskLevel === 'high' 
                      ? 'bg-red-100 text-red-700' 
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {risk.riskLevel}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {risk.riskFactors.slice(0, 2).map((factor: string, i: number) => (
                    <span key={i} className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-gray-200">
                      {factor}
                    </span>
                  ))}
                  {risk.riskFactors.length > 2 && (
                    <span className="text-[10px] text-gray-500">
                      +{risk.riskFactors.length - 2} more
                    </span>
                  )}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center py-4">No at-risk students found</p>
      )}
    </div>
  );
};

// ==================== STAT CARD ====================
const StatCard = ({ 
  title, 
  value, 
  subValue, 
  icon, 
  color,
  trend 
}: { 
  title: string;
  value: string | number;
  subValue?: string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'red' | 'yellow' | 'purple';
  trend?: { value: string; direction: 'up' | 'down' | 'neutral' };
}) => {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200'
  };

  return (
    <div className={`rounded-xl border p-4 ${colors[color]} transition-all hover:shadow-md h-full`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium opacity-80 truncate">{title}</p>
          <p className="text-2xl font-bold mt-1 truncate">{value}</p>
          {subValue && <p className="text-xs mt-1 opacity-70 truncate">{subValue}</p>}
        </div>
        <div className="p-3 bg-white/50 rounded-lg ml-3 flex-shrink-0">
          {icon}
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1 text-xs flex-wrap">
          {trend.direction === 'up' && <TrendingUp size={14} className="text-green-600 flex-shrink-0" />}
          {trend.direction === 'down' && <TrendingDown size={14} className="text-red-600 flex-shrink-0" />}
          {trend.direction === 'neutral' && <Minus size={14} className="text-gray-600 flex-shrink-0" />}
          <span className={`truncate ${
            trend.direction === 'up' ? 'text-green-600' :
            trend.direction === 'down' ? 'text-red-600' : 'text-gray-600'
          }`}>
            {trend.value}
          </span>
        </div>
      )}
    </div>
  );
};

// ==================== ATTENDANCE CHART ====================
const AttendanceChart = ({ data }: { data: AttendanceSummary[] }) => {
  if (!data.length) return null;

  // Filter to Monday-Friday
  const weekdays = data.filter(d => {
    const day = new Date(d.date).getDay();
    return day >= 1 && day <= 5;
  }).slice(-7);

  const maxRate = Math.max(...weekdays.map(d => d.rate));
  const minRate = Math.min(...weekdays.map(d => d.rate));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <h3 className="text-lg font-bold text-gray-900">Attendance Trend (Mon-Fri)</h3>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span>Avg: <span className="font-bold text-gray-900">
            {Math.round(weekdays.reduce((sum, d) => sum + d.rate, 0) / weekdays.length)}%
          </span></span>
          <span>High: <span className="font-bold text-green-600">{maxRate}%</span></span>
          <span>Low: <span className="font-bold text-red-600">{minRate}%</span></span>
        </div>
      </div>
      
      <div className="h-48 sm:h-64 relative">
        <div className="absolute inset-0 overflow-x-auto overflow-y-visible pb-4">
          <div className="flex items-end justify-start sm:justify-around gap-2 sm:gap-4 min-w-[300px] sm:min-w-0 h-full">
            {weekdays.map((day) => (
              <div key={day.date} className="flex flex-col items-center flex-shrink-0 w-12 sm:w-16">
                <div className="relative group w-full flex justify-center">
                  <div 
                    className="w-6 sm:w-8 bg-blue-500 rounded-t transition-all duration-500 hover:bg-blue-600"
                    style={{ height: `${Math.max(day.rate * 0.4, 4)}px`, minHeight: '20px' }}
                  />
                  <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 
                                bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                    {day.rate}% ({day.present}/{day.total})
                  </div>
                </div>
                <span className="text-xs text-gray-500 mt-2">
                  {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <span className="text-[10px] text-gray-400">
                  {new Date(day.date).getDate()}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="hidden sm:block absolute inset-0 pointer-events-none">
          {[0, 25, 50, 75, 100].map((val) => (
            <div 
              key={val}
              className="absolute left-0 right-0 border-t border-gray-100"
              style={{ bottom: `${val}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// ==================== CLASS BREAKDOWN TABLE ====================
const ClassBreakdownTable = ({ data }: { data: AttendanceSummary['classBreakdown'] }) => {
  const classes = Object.values(data);
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Class-wise Attendance</h3>
        <p className="text-sm text-gray-500 mt-0.5">Breakdown by class</p>
      </div>

      <div className="block sm:hidden divide-y divide-gray-200">
        {classes.map((cls) => (
          <div key={cls.className} className="p-4 hover:bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-900">{cls.className}</h4>
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                cls.rate >= 90 ? 'bg-green-100 text-green-700' :
                cls.rate >= 75 ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }`}>
                {cls.rate >= 90 ? <CheckCircle2 size={12} /> :
                 cls.rate >= 75 ? <AlertCircle size={12} /> :
                 <XCircle size={12} />}
                {cls.rate}%
              </span>
            </div>
            
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-lg font-semibold text-gray-900">{cls.total}</div>
                <div className="text-xs text-gray-500">Total</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-green-600">{cls.present}</div>
                <div className="text-xs text-gray-500">Present</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-red-600">{cls.absent}</div>
                <div className="text-xs text-gray-500">Absent</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-yellow-600">{cls.late}</div>
                <div className="text-xs text-gray-500">Late</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Class</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Total</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Present</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Absent</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Late</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Excused</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {classes.map((cls) => (
              <tr key={cls.className} className="hover:bg-gray-50/50">
                <td className="px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">{cls.className}</td>
                <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">{cls.total}</td>
                <td className="px-6 py-4 text-sm font-medium text-green-600 whitespace-nowrap">{cls.present}</td>
                <td className="px-6 py-4 text-sm font-medium text-red-600 whitespace-nowrap">{cls.absent}</td>
                <td className="px-6 py-4 text-sm font-medium text-yellow-600 whitespace-nowrap">{cls.late}</td>
                <td className="px-6 py-4 text-sm font-medium text-purple-600 whitespace-nowrap">{cls.excused}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`text-sm font-semibold ${
                    cls.rate >= 90 ? 'text-green-600' :
                    cls.rate >= 75 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {cls.rate}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==================== LATE ARRIVALS VIEW ====================
const LateArrivalsView = ({ lateArrivals }: { lateArrivals: any[] }) => {
  return (
    <div className="bg-white rounded-xl border border-yellow-200 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 bg-yellow-50 border-b border-yellow-200">
        <div className="flex items-center gap-2">
          <Clock size={20} className="text-yellow-600" />
          <h3 className="font-semibold text-yellow-800">Late Arrivals Detected</h3>
        </div>
        <p className="text-sm text-yellow-700 mt-1">
          Students marked absent in daily roll call but present in first period
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Class</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Daily Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">1st Period</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {lateArrivals.slice(0, 10).map((late, index) => (
              <tr key={index} className="hover:bg-yellow-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{late.studentName}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{late.className}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{late.date}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded-full">
                    {late.dailyStatus}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full">
                    {late.firstPeriodStatus}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{late.timeDetected || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==================== SUBJECT TRUANCY VIEW ====================
const SubjectTruancyView = ({ truancy }: { truancy: any[] }) => {
  return (
    <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 bg-orange-50 border-b border-orange-200">
        <div className="flex items-center gap-2">
          <BookOpen size={20} className="text-orange-600" />
          <h3 className="font-semibold text-orange-800">Subject Truancy Analysis</h3>
        </div>
        <p className="text-sm text-orange-700 mt-1">
          Students with low attendance by subject
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Class</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attendance %</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Missed</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {truancy.slice(0, 10).map((item, index) => (
              <tr key={index} className="hover:bg-orange-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.studentName}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{item.className}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{item.subject}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    item.attendanceRate < 60 ? 'bg-red-100 text-red-700' :
                    item.attendanceRate < 75 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {item.attendanceRate.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-red-600 font-medium">{item.missed}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{item.totalSessions}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs flex items-center gap-1 ${
                    item.trend === 'improving' ? 'text-green-600' :
                    item.trend === 'declining' ? 'text-red-600' :
                    'text-gray-600'
                  }`}>
                    {item.trend === 'improving' && <TrendingUp size={12} />}
                    {item.trend === 'declining' && <TrendingDown size={12} />}
                    {item.trend === 'stable' && <Minus size={12} />}
                    {item.trend}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==================== TEACHER ACTIVITY VIEW ====================
const TeacherActivityView = ({ activities }: { activities: any[] }) => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Teacher Activity Log</h3>
        <p className="text-sm text-gray-500 mt-0.5">All attendance marking activities</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Teacher</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Class</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Students</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {activities.slice(0, 10).map((activity, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-900">{activity.teacherName}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{activity.className}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{activity.subject || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{activity.date}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{activity.timeRecorded}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    activity.attendanceType === 'daily' 
                      ? 'bg-blue-100 text-blue-700' 
                      : 'bg-purple-100 text-purple-700'
                  }`}>
                    {activity.attendanceType}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{activity.studentsMarked}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
export default function AttendanceOverview() {
  const { user } = useAuth();
  
  // State
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [dateRange, setDateRange] = useState<DateRange>({
    start: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [teachers, setTeachers] = useState<Array<{ id: string; name: string }>>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({
    attendanceType: 'all',
    teacherId: '',
    subject: '',
    showWeekdaysOnly: true,
  });

  // Hooks
  const { classes, isLoading: loadingClasses } = useSchoolClasses({ isActive: true });
  const analytics = useAttendanceAnalytics(attendanceRecords);

  // Load attendance data
  useEffect(() => {
    loadAttendance();
  }, [viewMode, selectedDate, dateRange]);

  // Extract teachers and subjects from records
  useEffect(() => {
    // Extract unique teachers
    const teacherMap = new Map();
    attendanceRecords.forEach(record => {
      if (!teacherMap.has(record.markedBy)) {
        teacherMap.set(record.markedBy, {
          id: record.markedBy,
          name: record.markedByName
        });
      }
    });
    setTeachers(Array.from(teacherMap.values()));

    // Extract unique subjects
    const subjectSet = new Set(
      attendanceRecords
        .filter(r => (r as any).subject)
        .map(r => (r as any).subject)
    );
    setSubjects(Array.from(subjectSet) as string[]);
  }, [attendanceRecords]);

  const loadAttendance = async () => {
    setIsLoading(true);
    try {
      let records: AttendanceRecord[] = [];
      
      if (viewMode === 'daily') {
        const classPromises = classes.map(cls => 
          attendanceService.getByClassAndDate(cls.id, selectedDate)
        );
        const results = await Promise.all(classPromises);
        records = results.flat();
      } else {
        records = await attendanceService.getByDateRange(dateRange.start, dateRange.end);
      }
      
      setAttendanceRecords(records);
    } catch (error) {
      console.error('Error loading attendance:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Apply advanced filters
  const filteredRecords = useMemo(() => {
    let filtered = attendanceRecords;
    
    // Class filter
    if (selectedClass !== 'all') {
      filtered = filtered.filter(r => r.classId === selectedClass);
    }
    
    // Search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r => 
        r.studentName.toLowerCase().includes(term) ||
        r.className.toLowerCase().includes(term)
      );
    }
    
    // Advanced filters
    if (advancedFilters.attendanceType !== 'all') {
      filtered = filtered.filter(r => r.attendanceType === advancedFilters.attendanceType);
    }

    if (advancedFilters.teacherId) {
      filtered = filtered.filter(r => r.markedBy === advancedFilters.teacherId);
    }

    if (advancedFilters.subject) {
      filtered = filtered.filter(r => (r as any).subject === advancedFilters.subject);
    }

    if (advancedFilters.period) {
      filtered = filtered.filter(r => (r as any).period?.toString() === advancedFilters.period);
    }

    if (advancedFilters.showWeekdaysOnly) {
      filtered = filtered.filter(r => {
        const day = new Date(r.date).getDay();
        return day >= 1 && day <= 5;
      });
    }
    
    return filtered;
  }, [attendanceRecords, selectedClass, searchTerm, advancedFilters]);

  // Calculate summary
  const summary = useMemo((): AttendanceSummary => {
    const total = filteredRecords.length;
    const present = filteredRecords.filter(r => r.status === 'present').length;
    const absent = filteredRecords.filter(r => r.status === 'absent').length;
    const late = filteredRecords.filter(r => r.status === 'late').length;
    const excused = filteredRecords.filter(r => r.status === 'excused').length;
    
    const classBreakdown: AttendanceSummary['classBreakdown'] = {};
    
    filteredRecords.forEach(record => {
      if (!classBreakdown[record.classId]) {
        classBreakdown[record.classId] = {
          className: record.className,
          total: 0,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          rate: 0
        };
      }
      
      const cls = classBreakdown[record.classId];
      cls.total++;
      if (record.status === 'present') cls.present++;
      else if (record.status === 'absent') cls.absent++;
      else if (record.status === 'late') cls.late++;
      else if (record.status === 'excused') cls.excused++;
      cls.rate = cls.total > 0 ? Math.round(((cls.present + cls.late) / cls.total) * 100) : 0;
    });

    return {
      date: selectedDate,
      total,
      present,
      absent,
      late,
      excused,
      rate: total > 0 ? Math.round(((present + late) / total) * 100) : 0,
      classBreakdown
    };
  }, [filteredRecords, selectedDate]);

  // Generate trend data
  const trendData = useMemo((): AttendanceSummary[] => {
    if (viewMode !== 'daily') return [];
    
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayRecords = filteredRecords.filter(r => r.date === dateStr);
      const total = dayRecords.length;
      const present = dayRecords.filter(r => r.status === 'present').length;
      const late = dayRecords.filter(r => r.status === 'late').length;
      
      last7Days.push({
        date: dateStr,
        total,
        present,
        absent: dayRecords.filter(r => r.status === 'absent').length,
        late,
        excused: dayRecords.filter(r => r.status === 'excused').length,
        rate: total > 0 ? Math.round(((present + late) / total) * 100) : 0,
        classBreakdown: {}
      });
    }
    
    return last7Days;
  }, [filteredRecords, viewMode]);

  // Export handlers
  const handleExport = (type: ExportType) => {
    const filename = `attendance_${selectedDate}`;
    
    switch (type) {
      case 'all':
        exportAttendanceRecords(filteredRecords, filename, advancedFilters.showWeekdaysOnly);
        break;
      case 'late':
        exportLateArrivals(analytics.lateArrivals, `late_arrivals_${selectedDate}`);
        break;
      case 'truancy':
        exportSubjectTruancy(analytics.subjectTruancy, `subject_truancy_${selectedDate}`);
        break;
      case 'teacher':
        exportTeacherActivity(analytics.teacherActivity, `teacher_activity_${selectedDate}`);
        break;
    }
  };

  return (
    <DashboardLayout activeTab="attendance">
      <div className="min-h-screen bg-gray-50">
        
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                Attendance Overview
              </h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1">
                Monitor attendance across all classes
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={loadAttendance}
                disabled={isLoading}
                className="p-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 flex-shrink-0"
              >
                <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
              </button>
              
              <div className="relative group">
                <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700">
                  <Download size={18} />
                  <span className="hidden sm:inline">Export</span>
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 hidden group-hover:block z-10">
                  <button
                    onClick={() => handleExport('all')}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm"
                  >
                    All Records
                  </button>
                  <button
                    onClick={() => handleExport('late')}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm"
                  >
                    Late Arrivals
                  </button>
                  <button
                    onClick={() => handleExport('truancy')}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm"
                  >
                    Subject Truancy
                  </button>
                  <button
                    onClick={() => handleExport('teacher')}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm"
                  >
                    Teacher Activity
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
          
          {/* View Mode Tabs */}
          <div className="bg-white rounded-xl border border-gray-200 p-1 inline-flex w-full sm:w-auto overflow-x-auto">
            <div className="flex gap-1 min-w-max">
              {(['daily', 'weekly', 'monthly', 'class'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all whitespace-nowrap ${
                    viewMode === mode 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className="w-full flex items-center justify-between p-4 sm:hidden"
            >
              <div className="flex items-center gap-2">
                <Filter size={18} className="text-gray-400" />
                <span className="font-medium text-gray-700">Filters</span>
              </div>
              <ChevronDown size={18} className={`transition-transform ${showMobileFilters ? 'rotate-180' : ''}`} />
            </button>

            <div className={`p-4 ${showMobileFilters ? 'block' : 'hidden sm:block'}`}>
              <div className="flex flex-col sm:flex-row gap-3">
                
                {/* Date/Date Range */}
                {viewMode === 'daily' ? (
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full sm:w-auto px-4 py-2.5 border border-gray-300 rounded-xl text-sm"
                  />
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <input
                      type="date"
                      value={dateRange.start}
                      onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                      className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm"
                    />
                    <input
                      type="date"
                      value={dateRange.end}
                      onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                      className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm"
                    />
                  </div>
                )}

                {/* Class Filter */}
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="w-full sm:w-auto px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white"
                >
                  <option value="all">All Classes</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>

                {/* Search */}
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search students/classes..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm"
                  />
                </div>

                {/* Advanced Filters Toggle */}
                <button
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm flex items-center gap-2 hover:bg-gray-50"
                >
                  <Filter size={16} />
                  <span className="hidden sm:inline">Advanced</span>
                  {Object.values(advancedFilters).some(v => v && v !== 'all' && v !== '') && (
                    <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      !
                    </span>
                  )}
                </button>
              </div>

              {/* Advanced Filters Panel */}
              {showAdvancedFilters && (
                <div className="mt-4">
                  <AdvancedFilters
                    filters={advancedFilters}
                    onChange={setAdvancedFilters}
                    teachers={teachers}
                    subjects={subjects}
                    onClose={() => setShowAdvancedFilters(false)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Compact Stats */}
          <CompactStats
            present={summary.present}
            absent={summary.absent}
            late={summary.late}
            excused={summary.excused}
            total={summary.total}
          />

          {/* Analytics Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left column - Risk Overview */}
            <div className="lg:col-span-1">
              <RiskOverview records={filteredRecords} />
            </div>

            {/* Right column - Analytics Summary */}
            <div className="lg:col-span-2 space-y-4">
              {/* Late Arrivals Summary */}
              {analytics.lateArrivals.length > 0 && (
                <div className="bg-white rounded-xl border border-yellow-200 p-4">
                  <h3 className="font-semibold text-yellow-800 mb-3 flex items-center gap-2">
                    <Clock size={18} />
                    Late Arrivals (Last 7 Days)
                  </h3>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {analytics.lateArrivals.slice(0, 10).map((late, i) => (
                      <div key={i} className="flex items-center justify-between text-sm p-2 bg-yellow-50 rounded">
                        <div>
                          <span className="font-medium">{late.studentName}</span>
                          <span className="text-xs text-gray-500 ml-2">{late.className}</span>
                        </div>
                        <span className="text-xs text-gray-500">{late.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Subject Truancy Summary */}
              {analytics.subjectTruancy.length > 0 && (
                <div className="bg-white rounded-xl border border-orange-200 p-4">
                  <h3 className="font-semibold text-orange-800 mb-3 flex items-center gap-2">
                    <BookOpen size={18} />
                    Subject Truancy Alerts
                  </h3>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {analytics.subjectTruancy
                      .filter(t => t.attendanceRate < 75)
                      .slice(0, 10)
                      .map((truancy, i) => (
                        <div key={i} className="flex items-center justify-between text-sm p-2 bg-orange-50 rounded">
                          <div>
                            <span className="font-medium">{truancy.studentName}</span>
                            <span className="text-xs text-gray-500 ml-2">{truancy.subject}</span>
                          </div>
                          <span className={`text-xs font-medium ${
                            truancy.attendanceRate < 60 ? 'text-red-600' : 'text-orange-600'
                          }`}>
                            {truancy.attendanceRate.toFixed(0)}% attendance
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Charts and Tables */}
          <div className="space-y-4 sm:space-y-6">
            
            {/* Trend Chart */}
            {viewMode === 'daily' && trendData.length > 0 && (
              <AttendanceChart data={trendData} />
            )}

            {/* Class Breakdown */}
            {Object.keys(summary.classBreakdown).length > 0 && (
              <ClassBreakdownTable data={summary.classBreakdown} />
            )}

            {/* Late Arrivals View */}
            {analytics.lateArrivals.length > 0 && (
              <LateArrivalsView lateArrivals={analytics.lateArrivals} />
            )}

            {/* Subject Truancy View */}
            {analytics.subjectTruancy.length > 0 && (
              <SubjectTruancyView truancy={analytics.subjectTruancy} />
            )}

            {/* Teacher Activity View */}
            {analytics.teacherActivity.length > 0 && (
              <TeacherActivityView activities={analytics.teacherActivity} />
            )}
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-gray-200">
            <p className="text-xs sm:text-sm text-gray-500">
              Last updated: {new Date().toLocaleString()} • {filteredRecords.length} records
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}