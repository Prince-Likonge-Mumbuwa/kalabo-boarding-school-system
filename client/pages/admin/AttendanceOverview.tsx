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
    <div className={`rounded-xl border p-5 ${colors[color]} transition-all hover:shadow-md`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium opacity-80">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {subValue && <p className="text-xs mt-1 opacity-70">{subValue}</p>}
        </div>
        <div className="p-3 bg-white/50 rounded-lg">
          {icon}
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          {trend.direction === 'up' && <TrendingUp size={14} className="text-green-600" />}
          {trend.direction === 'down' && <TrendingDown size={14} className="text-red-600" />}
          {trend.direction === 'neutral' && <Minus size={14} className="text-gray-600" />}
          <span className={
            trend.direction === 'up' ? 'text-green-600' :
            trend.direction === 'down' ? 'text-red-600' : 'text-gray-600'
          }>
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

  const maxRate = Math.max(...data.map(d => d.rate));
  const minRate = Math.min(...data.map(d => d.rate));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Attendance Trend</h3>
      
      <div className="h-64 relative">
        {/* Y-axis */}
        <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col justify-between text-xs text-gray-500">
          <span>100%</span>
          <span>75%</span>
          <span>50%</span>
          <span>25%</span>
          <span>0%</span>
        </div>

        {/* Chart bars */}
        <div className="absolute left-16 right-0 top-0 bottom-0">
          <div className="flex items-end justify-around h-full">
            {data.slice(-7).map((day, i) => (
              <div key={day.date} className="flex flex-col items-center w-16">
                <div className="relative group w-full flex justify-center">
                  <div 
                    className="w-8 bg-blue-500 rounded-t transition-all duration-500 hover:bg-blue-600"
                    style={{ height: `${day.rate}%`, minHeight: '4px' }}
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

          {/* Grid lines */}
          <div className="absolute inset-0 pointer-events-none">
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

      {/* Stats */}
      <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <span className="text-gray-600">Average: <span className="font-bold text-gray-900">
            {Math.round(data.reduce((sum, d) => sum + d.rate, 0) / data.length)}%
          </span></span>
          <span className="text-gray-600">Highest: <span className="font-bold text-green-600">{maxRate}%</span></span>
          <span className="text-gray-600">Lowest: <span className="font-bold text-red-600">{minRate}%</span></span>
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
      <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Class-wise Attendance</h3>
        <p className="text-sm text-gray-500 mt-0.5">Today's breakdown by class</p>
      </div>

      <div className="overflow-x-auto">
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
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {classes.map((cls) => (
              <tr key={cls.className} className="hover:bg-gray-50/50">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{cls.className}</td>
                <td className="px-6 py-4 text-sm text-gray-700">{cls.total}</td>
                <td className="px-6 py-4">
                  <span className="text-sm font-medium text-green-600">{cls.present}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm font-medium text-red-600">{cls.absent}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm font-medium text-yellow-600">{cls.late}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm font-medium text-purple-600">{cls.excused}</span>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-sm font-semibold ${
                    cls.rate >= 90 ? 'text-green-600' :
                    cls.rate >= 75 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {cls.rate}%
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                    cls.rate >= 90 ? 'bg-green-100 text-green-700' :
                    cls.rate >= 75 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {cls.rate >= 90 ? <CheckCircle2 size={12} /> :
                     cls.rate >= 75 ? <AlertCircle size={12} /> :
                     <XCircle size={12} />}
                    {cls.rate >= 90 ? 'Good' : cls.rate >= 75 ? 'Average' : 'Low'}
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

// ==================== RECENT ACTIVITY ====================
const RecentActivity = ({ records }: { records: AttendanceRecord[] }) => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Activity</h3>
      
      <div className="space-y-3">
        {records.slice(0, 5).map((record) => (
          <div key={`${record.studentId}-${record.date}`} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
            <div className={`p-2 rounded-full ${
              record.status === 'present' ? 'bg-green-100' :
              record.status === 'absent' ? 'bg-red-100' :
              record.status === 'late' ? 'bg-yellow-100' :
              'bg-purple-100'
            }`}>
              {record.status === 'present' && <UserCheck size={14} className="text-green-600" />}
              {record.status === 'absent' && <UserX size={14} className="text-red-600" />}
              {record.status === 'late' && <Clock size={14} className="text-yellow-600" />}
              {record.status === 'excused' && <AlertCircle size={14} className="text-purple-600" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{record.studentName}</p>
              <p className="text-xs text-gray-500">
                {record.className} • {new Date(record.date).toLocaleDateString()}
              </p>
              {record.excuseReason && (
                <p className="text-xs text-purple-600 mt-1 bg-purple-50 p-1.5 rounded">
                  {record.excuseReason}
                </p>
              )}
            </div>
            <span className={`text-xs px-2 py-1 rounded-full ${
              record.status === 'present' ? 'bg-green-100 text-green-700' :
              record.status === 'absent' ? 'bg-red-100 text-red-700' :
              record.status === 'late' ? 'bg-yellow-100 text-yellow-700' :
              'bg-purple-100 text-purple-700'
            }`}>
              {record.status}
            </span>
          </div>
        ))}
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
        // Get all classes attendance for the day
        const classPromises = classes.map(cls => 
          attendanceService.getByClassAndDate(cls.id, selectedDate)
        );
        const results = await Promise.all(classPromises);
        records = results.flat();
      } else {
        // Get date range
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
    
    // Group by class
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

  // Generate trend data
  const trendData = useMemo((): AttendanceSummary[] => {
    if (viewMode !== 'daily') return [];
    
    // Last 7 days
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
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
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
                className="p-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50"
              >
                <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
              </button>
              
              <button
                onClick={() => {/* Export functionality */}}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
              >
                <Download size={18} />
                <span className="hidden sm:inline">Export Report</span>
              </button>
            </div>
          </div>
        </div>

        {/* View Mode Tabs */}
        <div className="mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-1 inline-flex">
            {(['daily', 'weekly', 'monthly', 'class'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
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
        <div className="mb-6">
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                
                {/* Date/Date Range */}
                {viewMode === 'daily' ? (
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm"
                  />
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={dateRange.start}
                      onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                      className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm"
                    />
                    <input
                      type="date"
                      value={dateRange.end}
                      onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                      className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm"
                    />
                  </div>
                )}

                {/* Class Filter */}
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white"
                >
                  <option value="all">All Classes</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>

                {/* Search */}
                <div className="relative">
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
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <StatCard
            title="Total Records"
            value={summary.total}
            subValue={`${summary.rate}% attendance rate`}
            icon={<Users size={24} />}
            color="blue"
          />
          <StatCard
            title="Present"
            value={summary.present}
            subValue={`${summary.total > 0 ? Math.round((summary.present / summary.total) * 100) : 0}% of total`}
            icon={<CheckCircle2 size={24} />}
            color="green"
          />
          <StatCard
            title="Absent"
            value={summary.absent}
            subValue={`${summary.total > 0 ? Math.round((summary.absent / summary.total) * 100) : 0}% of total`}
            icon={<XCircle size={24} />}
            color="red"
          />
          <StatCard
            title="Late"
            value={summary.late}
            subValue={`${summary.total > 0 ? Math.round((summary.late / summary.total) * 100) : 0}% of total`}
            icon={<Clock size={24} />}
            color="yellow"
          />
          <StatCard
            title="Excused"
            value={summary.excused}
            subValue={`${summary.total > 0 ? Math.round((summary.excused / summary.total) * 100) : 0}% of total`}
            icon={<AlertCircle size={24} />}
            color="purple"
          />
        </div>

        {/* Charts and Tables */}
        <div className="space-y-6">
          {/* Trend Chart */}
          {viewMode === 'daily' && trendData.length > 0 && (
            <AttendanceChart data={trendData} />
          )}

          {/* Class Breakdown */}
          {Object.keys(summary.classBreakdown).length > 0 && (
            <ClassBreakdownTable data={summary.classBreakdown} />
          )}

          {/* Recent Activity */}
          <RecentActivity records={filteredRecords} />

          {/* Detailed Records Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Detailed Records</h3>
              <p className="text-sm text-gray-500 mt-0.5">All attendance entries</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Student</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Class</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Marked By</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredRecords.slice(0, 10).map((record) => (
                    <tr key={`${record.studentId}-${record.date}`} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {new Date(record.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{record.studentName}</p>
                          <p className="text-xs text-gray-500">{record.studentId}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{record.className}</td>
                      <td className="px-6 py-4">
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
                      <td className="px-6 py-4 text-sm text-gray-700">{record.markedByName}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {record.excuseReason || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredRecords.length > 10 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <p className="text-sm text-gray-500">Showing 10 of {filteredRecords.length} records</p>
                <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                  View All
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-xs sm:text-sm text-gray-500">
            Last updated: {new Date().toLocaleString()}
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}