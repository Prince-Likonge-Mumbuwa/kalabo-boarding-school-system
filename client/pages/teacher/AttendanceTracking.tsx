// @/pages/teacher/AttendanceTracking.tsx - OPTIMIZED FOR SPEED & SCALE
import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { 
  Save, Filter, Download, RefreshCw, Check, X, Minus, 
  Users, Calendar, ChevronDown, ChevronUp, Loader2,
  CheckCircle, XCircle, AlertCircle, UserCheck, UserX
} from 'lucide-react';

interface Student {
  id: string;
  name: string;
  studentId: string;
  present: boolean | null;
}

interface ClassAttendance {
  className: string;
  date: string;
  students: Student[];
}

// ==================== STAT CARD ====================
interface StatCardProps {
  label: string;
  count: number;
  total: number;
  icon: React.ElementType;
  color: 'green' | 'red' | 'gray';
}

const StatCard = ({ label, count, total, icon: Icon, color }: StatCardProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
  
  const colors = {
    green: {
      bg: 'bg-gradient-to-br from-green-50 to-emerald-50',
      border: 'border-green-200',
      text: 'text-green-600',
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      bar: 'bg-green-500'
    },
    red: {
      bg: 'bg-gradient-to-br from-red-50 to-orange-50',
      border: 'border-red-200',
      text: 'text-red-600',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      bar: 'bg-red-500'
    },
    gray: {
      bg: 'bg-gradient-to-br from-gray-50 to-slate-50',
      border: 'border-gray-200',
      text: 'text-gray-600',
      iconBg: 'bg-gray-100',
      iconColor: 'text-gray-600',
      bar: 'bg-gray-500'
    }
  };

  const style = colors[color];

  return (
    <div className={`
      bg-white rounded-xl border ${style.border} p-4 sm:p-5
      hover:shadow-md transition-all duration-300
    `}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">
            {label}
          </p>
          <div className="flex items-baseline gap-1">
            <p className={`text-2xl sm:text-3xl font-bold ${style.text}`}>
              {count}
            </p>
            <span className="text-xs sm:text-sm text-gray-500">
              / {total}
            </span>
          </div>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
            {percentage}% of class
          </p>
        </div>
        <div className={`p-2 sm:p-2.5 rounded-lg flex-shrink-0 ${style.iconBg}`}>
          <Icon size={isMobile ? 18 : 20} className={style.iconColor} />
        </div>
      </div>
      <div className="mt-3 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-500 ${style.bar}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

// ==================== STUDENT ROW ====================
interface StudentRowProps {
  student: Student;
  index: number;
  onToggle: (studentId: string) => void;
  isMobile: boolean;
}

const StudentRow = ({ student, index, onToggle, isMobile }: StudentRowProps) => {
  const getStatusConfig = (present: boolean | null) => {
    if (present === true) return {
      label: 'Present',
      shortLabel: 'P',
      bgColor: 'bg-green-100',
      textColor: 'text-green-700',
      borderColor: 'border-green-200',
      icon: CheckCircle,
      iconColor: 'text-green-600',
      nextState: false
    };
    if (present === false) return {
      label: 'Absent',
      shortLabel: 'A',
      bgColor: 'bg-red-100',
      textColor: 'text-red-700',
      borderColor: 'border-red-200',
      icon: XCircle,
      iconColor: 'text-red-600',
      nextState: null
    };
    return {
      label: 'Not Reported',
      shortLabel: '—',
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-700',
      borderColor: 'border-gray-200',
      icon: AlertCircle,
      iconColor: 'text-gray-500',
      nextState: true
    };
  };

  const config = getStatusConfig(student.present);
  const StatusIcon = config.icon;

  if (isMobile) {
    return (
      <div className="bg-white border-b border-gray-100 p-4 last:border-b-0">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-blue-600">{index + 1}</span>
            </div>
            <div className="min-w-0">
              <p className="font-medium text-gray-900 text-sm truncate">{student.name}</p>
              <p className="text-xs text-gray-500 font-mono mt-0.5">{student.studentId.slice(-6)}</p>
            </div>
          </div>
          <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${config.bgColor} ${config.textColor}`}>
            {config.shortLabel}
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon size={14} className={config.iconColor} />
            <span className="text-xs text-gray-600">{config.label}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggle(student.id)}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-all
                active:scale-[0.98] flex items-center gap-2
                ${config.bgColor} ${config.textColor} ${config.borderColor}
              `}
            >
              {student.present === null ? (
                <>Mark</>
              ) : student.present === true ? (
                <><Check size={14} /> Present</>
              ) : (
                <><X size={14} /> Absent</>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <tr className="hover:bg-gray-50/50 transition-colors group">
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-400 w-6">{index + 1}</span>
          <div>
            <div className="font-medium text-gray-900 text-sm">{student.name}</div>
            <div className="text-xs text-gray-400 font-mono mt-0.5">{student.studentId}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${config.bgColor} ${config.textColor}`}>
          <StatusIcon size={12} />
          {config.label}
        </span>
      </td>
      <td className="px-4 py-4 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => onToggle(student.id)}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium transition-all
              hover:shadow-sm active:scale-[0.98] flex items-center gap-2
              ${config.bgColor} ${config.textColor} hover:opacity-80
            `}
          >
            {student.present === true ? (
              <>✓ Present</>
            ) : student.present === false ? (
              <>✗ Absent</>
            ) : (
              <>Mark</>
            )}
          </button>
        </div>
      </td>
    </tr>
  );
};

// ==================== SKELETON ====================
const TableSkeleton = () => (
  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
    <div className="p-4 border-b border-gray-200 bg-gray-50">
      <div className="h-5 bg-gray-200 rounded w-48"></div>
    </div>
    <div className="divide-y divide-gray-100">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="p-4 flex items-center gap-4">
          <div className="w-6 h-4 bg-gray-200 rounded"></div>
          <div className="flex-1 h-4 bg-gray-200 rounded"></div>
          <div className="w-20 h-8 bg-gray-200 rounded"></div>
        </div>
      ))}
    </div>
  </div>
);

// ==================== MAIN COMPONENT ====================
export default function AttendanceTracking() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [selectedClass, setSelectedClass] = useState('Form 4A');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [classData, setClassData] = useState<ClassAttendance>({
    className: 'Form 4A',
    date: selectedDate,
    students: [
      { id: '1', name: 'Alice Mumba', studentId: 'STU001', present: true },
      { id: '2', name: 'Benson Chanda', studentId: 'STU002', present: true },
      { id: '3', name: 'Cecilia Nkosi', studentId: 'STU003', present: false },
      { id: '4', name: 'David Mwale', studentId: 'STU004', present: true },
      { id: '5', name: 'Emeline Tembo', studentId: 'STU005', present: true },
      { id: '6', name: 'Frank Simatende', studentId: 'STU006', present: null },
      { id: '7', name: 'Grace Mbewe', studentId: 'STU007', present: true },
      { id: '8', name: 'Henry Kamwi', studentId: 'STU008', present: false },
    ],
  });

  const classes = ['Form 4A', 'Form 4B', 'Form 3A', 'Form 3B'];

  // Calculate stats
  const stats = useMemo(() => {
    const total = classData.students.length;
    const present = classData.students.filter(s => s.present === true).length;
    const absent = classData.students.filter(s => s.present === false).length;
    const unreported = classData.students.filter(s => s.present === null).length;
    
    return { total, present, absent, unreported };
  }, [classData.students]);

  // Handlers
  const handleTogglePresence = (studentId: string) => {
    setClassData({
      ...classData,
      students: classData.students.map(student =>
        student.id === studentId
          ? { 
              ...student, 
              present: student.present === true ? false : student.present === false ? null : true 
            }
          : student
      ),
    });
  };

  const handleMarkAll = (present: boolean) => {
    setClassData({
      ...classData,
      students: classData.students.map(student => ({ ...student, present })),
    });
  };

  const handleSave = () => {
    setIsLoading(true);
    // Simulate save
    setTimeout(() => {
      setIsLoading(false);
    }, 800);
  };

  const handleRefresh = () => {
    setIsLoading(true);
    // Simulate refresh
    setTimeout(() => {
      setIsLoading(false);
    }, 600);
  };

  const handleExport = () => {
    console.log('Exporting attendance...');
  };

  // Sort students: unreported first, then present, then absent
  const sortedStudents = useMemo(() => {
    return [...classData.students].sort((a, b) => {
      // Unreported (null) first
      if (a.present === null && b.present !== null) return -1;
      if (a.present !== null && b.present === null) return 1;
      // Then present
      if (a.present === true && b.present === false) return -1;
      if (a.present === false && b.present === true) return 1;
      // Then alphabetically
      return a.name.localeCompare(b.name);
    });
  }, [classData.students]);

  return (
    <DashboardLayout activeTab="attendance">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
        
        {/* ===== HEADER ===== */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              Attendance
            </h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1 flex items-center gap-2">
              <span>{selectedClass}</span>
              <span className="text-gray-300">•</span>
              <span className="flex items-center gap-1">
                <Calendar size={14} className="text-gray-400" />
                {new Date(selectedDate).toLocaleDateString('en-ZM', { 
                  day: 'numeric', 
                  month: 'short', 
                  year: 'numeric' 
                })}
              </span>
            </p>
          </div>
          
          {/* Actions - Icon only on mobile */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className={`
                inline-flex items-center justify-center
                border border-gray-300 text-gray-700 rounded-xl
                hover:bg-gray-50 transition-all
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                ${isMobile ? 'p-2.5' : 'px-4 py-2.5 gap-2'}
              `}
              title="Export report"
            >
              <Download size={isMobile ? 18 : 16} />
              {!isMobile && 'Export'}
            </button>
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className={`
                inline-flex items-center justify-center
                border border-gray-300 text-gray-700 rounded-xl
                hover:bg-gray-50 transition-all
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                ${isMobile ? 'p-2.5' : 'px-4 py-2.5 gap-2'}
              `}
              title="Refresh"
            >
              <RefreshCw size={isMobile ? 18 : 16} className={isLoading ? 'animate-spin' : ''} />
              {!isMobile && 'Refresh'}
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className={`
                inline-flex items-center justify-center
                bg-blue-600 text-white rounded-xl hover:bg-blue-700
                transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                ${isMobile ? 'p-2.5' : 'px-4 py-2.5 gap-2'}
              `}
              title="Save attendance"
            >
              {isLoading ? (
                <Loader2 size={isMobile ? 18 : 16} className="animate-spin" />
              ) : (
                <Save size={isMobile ? 18 : 16} />
              )}
              {!isMobile && 'Save'}
            </button>
          </div>
        </div>

        {/* ===== FILTERS ===== */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          
          {/* Mobile Filter Toggle */}
          {isMobile && (
            <button
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className="w-full flex items-center justify-between p-4 bg-white"
            >
              <div className="flex items-center gap-2">
                <Filter size={18} className="text-gray-400" />
                <span className="font-medium text-gray-700">
                  {selectedClass} • {selectedDate}
                </span>
              </div>
              <ChevronDown 
                size={18} 
                className={`text-gray-500 transition-transform duration-200 ${showMobileFilters ? 'rotate-180' : ''}`} 
              />
            </button>
          )}

          {/* Filter Content */}
          <div className={`
            p-4 sm:p-5
            ${isMobile && !showMobileFilters ? 'hidden' : 'block'}
          `}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Class Select */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  <Users size={14} className="inline mr-1" />
                  Class
                </label>
                <select
                  value={selectedClass}
                  onChange={e => setSelectedClass(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg 
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           text-sm bg-white hover:border-gray-400 transition-colors"
                >
                  {classes.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              </div>
              
              {/* Date Picker */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  <Calendar size={14} className="inline mr-1" />
                  Date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg 
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           text-sm bg-white hover:border-gray-400 transition-colors"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ===== STATISTICS - 3 CARDS ===== */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <StatCard
            label="Present"
            count={stats.present}
            total={stats.total}
            icon={UserCheck}
            color="green"
          />
          <StatCard
            label="Absent"
            count={stats.absent}
            total={stats.total}
            icon={UserX}
            color="red"
          />
          <StatCard
            label="Not Reported"
            count={stats.unreported}
            total={stats.total}
            icon={Minus}
            color="gray"
          />
        </div>

        {/* ===== QUICK ACTIONS - COMPACT ===== */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="text-xs font-medium text-gray-600">Quick mark:</span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleMarkAll(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-100 text-green-700 
                         rounded-lg hover:bg-green-200 transition-colors text-sm font-medium"
              >
                <Check size={16} />
                All Present
              </button>
              <button
                onClick={() => handleMarkAll(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-100 text-red-700 
                         rounded-lg hover:bg-red-200 transition-colors text-sm font-medium"
              >
                <X size={16} />
                All Absent
              </button>
            </div>
            <div className="sm:ml-auto text-xs text-gray-500">
              <span className="font-medium">Tip:</span> Tap student row to cycle: Present → Absent → Not Reported
            </div>
          </div>
        </div>

        {/* ===== ATTENDANCE TABLE/GRID ===== */}
        {isLoading ? (
          <TableSkeleton />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            
            {/* Header */}
            <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-gray-500" />
                  <span className="font-medium text-gray-900 text-sm">
                    {selectedClass} • {stats.total} Students
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <CheckCircle size={12} className="text-green-500" /> {stats.present}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <XCircle size={12} className="text-red-500" /> {stats.absent}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Minus size={12} className="text-gray-400" /> {stats.unreported}
                  </span>
                </div>
              </div>
            </div>

            {/* Mobile-Optimized Card Grid */}
            {isMobile ? (
              <div className="divide-y divide-gray-100">
                {sortedStudents.map((student, index) => (
                  <StudentRow
                    key={student.id}
                    student={student}
                    index={index}
                    onToggle={handleTogglePresence}
                    isMobile={true}
                  />
                ))}
              </div>
            ) : (
              /* Desktop Table - 3 COLUMNS */
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Student
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {sortedStudents.map((student, index) => (
                      <StudentRow
                        key={student.id}
                        student={student}
                        index={index}
                        onToggle={handleTogglePresence}
                        isMobile={false}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ===== FOOTER ===== */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <span className="font-medium">Last saved:</span>
            <span>Today, 10:23 AM</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Check size={12} className="text-green-500" /> Present
            </span>
            <span className="flex items-center gap-1">
              <X size={12} className="text-red-500" /> Absent
            </span>
            <span className="flex items-center gap-1">
              <Minus size={12} className="text-gray-400" /> Not marked
            </span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}