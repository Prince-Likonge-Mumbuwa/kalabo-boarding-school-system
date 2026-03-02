// @/pages/admin/AttendanceOverview.tsx
import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useEffect, useMemo } from 'react';
import { attendanceService, AttendanceRecord } from '@/services/attendanceService';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useAuth } from '@/hooks/useAuth';
import { 
  Calendar, Filter, Download, RefreshCw, 
  Search, ChevronDown, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, AlertCircle, Clock,
  Users, TrendingUp, TrendingDown, Minus,
  Eye, FileText, BarChart3, PieChart,
  Loader2, UserCheck, UserX, BookOpen
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

// ==================== RESPONSIVE STAT CARD ====================
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

// ==================== RESPONSIVE ATTENDANCE CHART ====================
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
        {/* Chart container with horizontal scroll on mobile if needed */}
        <div className="absolute inset-0 overflow-x-auto overflow-y-visible pb-4">
          <div className="flex items-end justify-start sm:justify-around gap-2 sm:gap-4 min-w-[300px] sm:min-w-0 h-full">
            {weekdays.map((day, i) => (
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

        {/* Grid lines - hidden on mobile for cleaner look */}
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

// ==================== RESPONSIVE CLASS BREAKDOWN ====================
const ClassBreakdownTable = ({ data }: { data: AttendanceSummary['classBreakdown'] }) => {
  const classes = Object.values(data);
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Class-wise Attendance</h3>
        <p className="text-sm text-gray-500 mt-0.5">Today's breakdown by class</p>
      </div>

      {/* Mobile: Card view */}
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

      {/* Desktop: Table view */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Class</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Total</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Present</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Absent</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Late</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Excused</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Rate</th>
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

// ==================== RESPONSIVE RECENT ACTIVITY ====================
const RecentActivity = ({ records }: { records: AttendanceRecord[] }) => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Activity</h3>
      
      <div className="space-y-3">
        {records.slice(0, 5).map((record) => (
          <div key={`${record.studentId}-${record.date}`} className="flex flex-col sm:flex-row sm:items-start gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className={`p-2 rounded-full flex-shrink-0 ${
                record.status === 'present' ? 'bg-green-100' :
                record.status === 'absent' ? 'bg-red-100' :
                record.status === 'late' ? 'bg-yellow-100' :
                'bg-purple-100'
              }`}>
                {record.status === 'present' && <UserCheck size={16} className="text-green-600" />}
                {record.status === 'absent' && <UserX size={16} className="text-red-600" />}
                {record.status === 'late' && <Clock size={16} className="text-yellow-600" />}
                {record.status === 'excused' && <AlertCircle size={16} className="text-purple-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{record.studentName}</p>
                  <span className={`text-xs px-2 py-1 rounded-full self-start sm:self-center whitespace-nowrap ${
                    record.status === 'present' ? 'bg-green-100 text-green-700' :
                    record.status === 'absent' ? 'bg-red-100 text-red-700' :
                    record.status === 'late' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    {record.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {record.className} • {new Date(record.date).toLocaleDateString()}
                </p>
                {record.excuseReason && (
                  <p className="text-xs text-purple-600 mt-2 bg-purple-50 p-2 rounded">
                    {record.excuseReason}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== RESPONSIVE DETAILED RECORDS ====================
const DetailedRecords = ({ records }: { records: AttendanceRecord[] }) => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Detailed Records</h3>
        <p className="text-sm text-gray-500 mt-0.5">All attendance entries</p>
      </div>

      {/* Mobile: Card view */}
      <div className="block sm:hidden divide-y divide-gray-200">
        {records.slice(0, 10).map((record) => (
          <div key={`${record.studentId}-${record.date}`} className="p-4 hover:bg-gray-50">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{record.studentName}</p>
                <p className="text-xs text-gray-500 mt-0.5">{record.studentId}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                record.status === 'present' ? 'bg-green-100 text-green-700' :
                record.status === 'absent' ? 'bg-red-100 text-red-700' :
                record.status === 'late' ? 'bg-yellow-100 text-yellow-700' :
                'bg-purple-100 text-purple-700'
              }`}>
                {record.status}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
              <div>
                <span className="text-gray-500">Class:</span> {record.className}
              </div>
              <div>
                <span className="text-gray-500">Date:</span> {new Date(record.date).toLocaleDateString()}
              </div>
              <div className="col-span-2">
                <span className="text-gray-500">Marked by:</span> {record.markedByName}
              </div>
              {record.excuseReason && (
                <div className="col-span-2 mt-1">
                  <span className="text-gray-500">Reason:</span>
                  <p className="text-purple-600 bg-purple-50 p-2 rounded mt-1">{record.excuseReason}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: Table view */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Date</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Student</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Class</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Status</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Marked By</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {records.slice(0, 10).map((record) => (
              <tr key={`${record.studentId}-${record.date}`} className="hover:bg-gray-50/50">
                <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">
                  {new Date(record.date).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{record.studentName}</p>
                    <p className="text-xs text-gray-500">{record.studentId}</p>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">{record.className}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                    record.status === 'present' ? 'bg-green-100 text-green-700' :
                    record.status === 'absent' ? 'bg-red-100 text-red-700' :
                    record.status === 'late' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    {record.status === 'present' && <CheckCircle2 size={12} />}
                    {record.status === 'absent' && <XCircle size={12} />}
                    {record.status === 'late' && <Clock size={12} />}
                    {record.status === 'excused' && <AlertCircle size={12} />}
                    {record.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">{record.markedByName}</td>
                <td className="px-6 py-4 text-sm text-gray-500 max-w-[200px]">
                  <span className="truncate block">{record.excuseReason || '-'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {records.length > 10 && (
        <div className="px-4 sm:px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <p className="text-sm text-gray-500">Showing 10 of {records.length} records</p>
          <button className="text-sm text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap">
            View All
          </button>
        </div>
      )}
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

  // Hooks
  const { classes, isLoading: loadingClasses } = useSchoolClasses({ isActive: true });

  // Load attendance data
  useEffect(() => {
    loadAttendance();
  }, [viewMode, selectedDate, dateRange]);

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

  // Calculate summary
  const summary = useMemo((): AttendanceSummary => {
    const total = attendanceRecords.length;
    const present = attendanceRecords.filter(r => r.status === 'present').length;
    const absent = attendanceRecords.filter(r => r.status === 'absent').length;
    const late = attendanceRecords.filter(r => r.status === 'late').length;
    const excused = attendanceRecords.filter(r => r.status === 'excused').length;
    
    const classBreakdown: AttendanceSummary['classBreakdown'] = {};
    
    attendanceRecords.forEach(record => {
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
  }, [attendanceRecords, selectedDate]);

  // Generate trend data (Monday-Friday only)
  const trendData = useMemo((): AttendanceSummary[] => {
    if (viewMode !== 'daily') return [];
    
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayRecords = attendanceRecords.filter(r => r.date === dateStr);
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
  }, [attendanceRecords, viewMode]);

  // Filter records
  const filteredRecords = useMemo(() => {
    let records = attendanceRecords;
    
    if (selectedClass !== 'all') {
      records = records.filter(r => r.classId === selectedClass);
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      records = records.filter(r => 
        r.studentName.toLowerCase().includes(term) ||
        r.className.toLowerCase().includes(term)
      );
    }
    
    return records;
  }, [attendanceRecords, selectedClass, searchTerm]);

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
              
              <button
                onClick={() => {/* Export functionality */}}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 whitespace-nowrap"
              >
                <Download size={18} />
                <span className="hidden sm:inline">Export Report</span>
              </button>
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
              </div>
            </div>
          </div>

          {/* Stats Cards - Responsive grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              title="Total Records"
              value={summary.total}
              subValue={`${summary.rate}% rate`}
              icon={<Users size={24} />}
              color="blue"
            />
            <StatCard
              title="Present"
              value={summary.present}
              subValue={`${summary.total > 0 ? Math.round((summary.present / summary.total) * 100) : 0}%`}
              icon={<CheckCircle2 size={24} />}
              color="green"
            />
            <StatCard
              title="Absent"
              value={summary.absent}
              subValue={`${summary.total > 0 ? Math.round((summary.absent / summary.total) * 100) : 0}%`}
              icon={<XCircle size={24} />}
              color="red"
            />
            <StatCard
              title="Late"
              value={summary.late}
              subValue={`${summary.total > 0 ? Math.round((summary.late / summary.total) * 100) : 0}%`}
              icon={<Clock size={24} />}
              color="yellow"
            />
            <StatCard
              title="Excused"
              value={summary.excused}
              subValue={`${summary.total > 0 ? Math.round((summary.excused / summary.total) * 100) : 0}%`}
              icon={<AlertCircle size={24} />}
              color="purple"
            />
          </div>

          {/* Charts and Tables */}
          <div className="space-y-4 sm:space-y-6">
            
            {/* Trend Chart - Mon-Fri only */}
            {viewMode === 'daily' && trendData.length > 0 && (
              <AttendanceChart data={trendData} />
            )}

            {/* Class Breakdown */}
            {Object.keys(summary.classBreakdown).length > 0 && (
              <ClassBreakdownTable data={summary.classBreakdown} />
            )}

            {/* Recent Activity */}
            <RecentActivity records={filteredRecords} />

            {/* Detailed Records */}
            <DetailedRecords records={filteredRecords} />
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-gray-200">
            <p className="text-xs sm:text-sm text-gray-500">
              Last updated: {new Date().toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}