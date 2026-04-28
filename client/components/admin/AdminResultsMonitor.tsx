// @/components/admin/AdminResultsMonitor.tsx
import { useState, useMemo } from 'react';
import { 
  AlertCircle, CheckCircle, AlertTriangle, 
  ChevronDown, ChevronRight, Search, 
  Filter, Download, Send, User, BookOpen,
  BarChart3, Users, FileWarning, Clock,
  XCircle, Info, RefreshCw, TrendingUp, TrendingDown, Minus
} from 'lucide-react';
import { useResultsEntryMonitor, TeacherProgress, MissingEntry } from '@/hooks/useResultsEntryMonitor';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface AdminResultsMonitorProps {
  term: string;
  year: number;
}

type SortBy = 'name' | 'missingCount' | 'completionPercentage' | 'totalRequired';
type FilterBy = 'all' | 'complete' | 'on-track' | 'behind' | 'critical';

// ==================== STAT CARD ====================
const StatCard = ({ title, value, description, icon, color, trend }: any) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  };
  
  return (
    <div className={`${colorClasses[color]} rounded-xl border p-3 sm:p-4 transition-all hover:shadow-md`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium opacity-75 truncate">{title}</p>
          <p className="text-xl sm:text-2xl font-bold mt-1 truncate">{value}</p>
          <p className="text-xs mt-1 opacity-70 truncate">{description}</p>
        </div>
        <div className="p-2 sm:p-3 bg-white/50 rounded-lg ml-2 sm:ml-3 flex-shrink-0">
          {icon}
        </div>
      </div>
      {trend && (
        <div className="mt-2 sm:mt-3 flex items-center gap-1 text-xs flex-wrap">
          {trend.direction === 'up' && <TrendingUp size={12} className="text-green-600" />}
          {trend.direction === 'down' && <TrendingDown size={12} className="text-red-600" />}
          {trend.direction === 'neutral' && <Minus size={12} className="text-gray-600" />}
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

// ==================== SUBJECT PROGRESS ROW ====================
const SubjectProgressRow = ({ subject, selectedExamType }: any) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  const examTypes = [
    { key: 'week4', label: 'W4', name: 'Week 4' },
    { key: 'week8', label: 'W8', name: 'Week 8' },
    { key: 'endOfTerm', label: 'EOT', name: 'End of Term' }
  ];
  
  const shouldShowExam = (examKey: string) => {
    if (selectedExamType === 'all') return true;
    return selectedExamType === examKey;
  };
  
  const getExamIcon = (isComplete: boolean) => {
    if (isComplete) {
      return <CheckCircle size={isMobile ? 12 : 14} className="text-green-600" />;
    }
    return <XCircle size={isMobile ? 12 : 14} className="text-red-500" />;
  };
  
  const getBarColor = (percentage: number) => {
    if (percentage === 100) return 'bg-green-500';
    if (percentage >= 75) return 'bg-blue-500';
    if (percentage >= 50) return 'bg-amber-500';
    if (percentage >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };
  
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 border-b border-gray-100 last:border-0 gap-2">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{subject.subjectName}</p>
        {subject.totalStudents > 0 && !isMobile && (
          <p className="text-xs text-gray-400">{subject.totalStudents} students</p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 sm:gap-4">
        {/* Per-exam status with student counts */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          {examTypes.map(exam => shouldShowExam(exam.key) && (
            <div key={exam.key} className="flex items-center gap-1" title={`${exam.name}: ${subject[`${exam.key}StudentCount`]}/${subject.totalStudents} students`}>
              {getExamIcon(subject[`${exam.key}Complete`])}
              <span className="text-xs text-gray-500">{exam.label}</span>
              {subject[`${exam.key}StudentCount`] > 0 && (
                <span className="text-xs text-gray-400">
                  ({subject[`${exam.key}StudentCount`]}/{subject.totalStudents})
                </span>
              )}
            </div>
          ))}
        </div>
        {/* Subject progress bar */}
        <div className="flex items-center gap-2 min-w-[100px]">
          <div className="w-16 sm:w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full ${getBarColor(subject.completionPercentage)} transition-all duration-300`}
              style={{ width: `${subject.completionPercentage}%` }}
            />
          </div>
          <span className={`text-xs font-medium min-w-[40px] text-right ${
            subject.completionPercentage === 100 ? 'text-green-600' :
            subject.completionPercentage >= 75 ? 'text-blue-600' :
            subject.completionPercentage >= 50 ? 'text-amber-600' :
            subject.completionPercentage >= 25 ? 'text-orange-600' : 'text-red-600'
          }`}>
            {subject.completionPercentage}%
          </span>
        </div>
      </div>
      {isMobile && subject.totalStudents > 0 && (
        <p className="text-xs text-gray-400 ml-7">{subject.totalStudents} students</p>
      )}
    </div>
  );
};

// ==================== CLASS PROGRESS CARD ====================
const ClassProgressCard = ({ classProgress, selectedExamType }: any) => {
  const [expanded, setExpanded] = useState(false);
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  const getClassStatusColor = (percentage: number) => {
    if (percentage === 100) return 'border-green-200 bg-green-50';
    if (percentage >= 75) return 'border-blue-200 bg-blue-50';
    if (percentage >= 50) return 'border-amber-200 bg-amber-50';
    if (percentage >= 25) return 'border-orange-200 bg-orange-50';
    return 'border-red-200 bg-red-50';
  };
  
  const getClassStatusText = (percentage: number) => {
    if (percentage === 100) return 'text-green-700';
    if (percentage >= 75) return 'text-blue-700';
    if (percentage >= 50) return 'text-amber-700';
    if (percentage >= 25) return 'text-orange-700';
    return 'text-red-800';
  };
  
  const getBarColor = (percentage: number) => {
    if (percentage === 100) return 'bg-green-500';
    if (percentage >= 75) return 'bg-blue-500';
    if (percentage >= 50) return 'bg-amber-500';
    if (percentage >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };
  
  return (
    <div className={`rounded-lg border ${getClassStatusColor(classProgress.completionPercentage)} overflow-hidden`}>
      {/* Class Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 sm:px-4 py-3 flex items-center justify-between hover:bg-black/5 transition-colors text-left"
      >
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          {expanded ? <ChevronDown size={16} className="flex-shrink-0" /> : <ChevronRight size={16} className="flex-shrink-0" />}
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-900 text-sm sm:text-base truncate">{classProgress.className}</p>
            <p className="text-xs text-gray-500">
              {classProgress.completedCount} of {classProgress.totalRequired} entries completed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-16 sm:w-24">
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${getBarColor(classProgress.completionPercentage)} transition-all duration-300`}
                style={{ width: `${classProgress.completionPercentage}%` }}
              />
            </div>
          </div>
          <span className={`text-sm font-medium ${getClassStatusText(classProgress.completionPercentage)} flex-shrink-0`}>
            {classProgress.completionPercentage}%
          </span>
        </div>
      </button>
      
      {/* Subject Details */}
      {expanded && (
        <div className="px-3 sm:px-4 pb-3 space-y-2 border-t border-inherit pt-3">
          {classProgress.subjects.map((subject: any) => (
            <SubjectProgressRow 
              key={subject.subjectId}
              subject={subject}
              selectedExamType={selectedExamType}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== TEACHER ROW ====================
const TeacherRow = ({ teacher, isExpanded, onToggle, selectedExamType, onSendReminder }: any) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  const filteredMissing = selectedExamType === 'all' 
    ? teacher.missingEntries 
    : teacher.missingEntries.filter((e: any) => e.examType === selectedExamType);
  
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'complete':
        return {
          bg: 'bg-green-100',
          text: 'text-green-700',
          border: 'border-green-200',
          barColor: 'bg-green-500',
          icon: <CheckCircle size={12} className="text-green-600" />,
          label: 'Complete'
        };
      case 'on-track':
        return {
          bg: 'bg-blue-100',
          text: 'text-blue-700',
          border: 'border-blue-200',
          barColor: 'bg-blue-500',
          icon: <TrendingUp size={12} className="text-blue-600" />,
          label: 'On Track'
        };
      case 'behind':
        return {
          bg: 'bg-amber-100',
          text: 'text-amber-700',
          border: 'border-amber-200',
          barColor: 'bg-amber-500',
          icon: <AlertTriangle size={12} className="text-amber-600" />,
          label: 'Behind'
        };
      case 'critical':
        return {
          bg: 'bg-red-100',
          text: 'text-red-700',
          border: 'border-red-200',
          barColor: 'bg-red-500',
          icon: <AlertCircle size={12} className="text-red-600" />,
          label: 'Critical'
        };
      default:
        return {
          bg: 'bg-gray-100',
          text: 'text-gray-700',
          border: 'border-gray-200',
          barColor: 'bg-gray-500',
          icon: null,
          label: 'Unknown'
        };
    }
  };
  
  const statusConfig = getStatusConfig(teacher.status);
  
  const getBarColor = (percentage: number) => {
    if (percentage === 100) return 'bg-green-500';
    if (percentage >= 75) return 'bg-blue-500';
    if (percentage >= 50) return 'bg-amber-500';
    if (percentage >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };
  
  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={onToggle}>
        <td className="px-3 sm:px-4 py-3">
          <div className="flex items-center gap-2">
            {!isMobile && (isExpanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />)}
            <div className="min-w-0">
              <p className="font-medium text-gray-900 text-sm sm:text-base truncate">{teacher.teacherName}</p>
              <p className="text-xs text-gray-500">
                {teacher.classProgress?.length || 0} classes
                {teacher.teacherEmail && !isMobile && ` • ${teacher.teacherEmail}`}
              </p>
              {isMobile && teacher.teacherEmail && (
                <p className="text-xs text-gray-400 truncate">{teacher.teacherEmail}</p>
              )}
            </div>
          </div>
         </td>
        <td className="px-3 sm:px-4 py-3">
          <div className="flex items-center justify-center">
            <div className="w-12 sm:w-16">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${getBarColor(teacher.completionPercentage)}`}
                  style={{ width: `${teacher.completionPercentage}%` }}
                />
              </div>
              <p className={`text-xs text-center mt-1 font-medium ${statusConfig.text}`}>
                {teacher.completionPercentage}%
              </p>
            </div>
          </div>
         </td>
        {!isMobile && (
          <>
            <td className="px-4 py-3 text-center">
              <span className="text-green-600 font-medium">{teacher.completedCount}</span>
            </td>
            <td className="px-4 py-3 text-center">
              <span className="text-red-600 font-medium">{teacher.missingCount}</span>
            </td>
          </>
        )}
        <td className="px-3 sm:px-4 py-3">
          <div className="flex items-center justify-center sm:justify-start">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
              {statusConfig.icon}
              {!isMobile && statusConfig.label}
              {isMobile && teacher.completionPercentage + '%'}
            </span>
          </div>
         </td>
        <td className="px-3 sm:px-4 py-3 text-right">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSendReminder(teacher.teacherName, teacher.teacherEmail);
            }}
            className="p-1.5 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            title="Send reminder to teacher"
          >
            <Send size={16} />
          </button>
         </td>
       </tr>
      
      {/* Expanded details */}
      {isExpanded && (
        <tr className="bg-gray-50">
          <td colSpan={isMobile ? 5 : 6} className="px-3 sm:px-4 py-4">
            <div className="space-y-3 sm:space-y-4">
              {/* Info banner */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3">
                <div className="flex items-center gap-2 text-blue-700">
                  <Info size={14} className="flex-shrink-0" />
                  <p className="text-xs">
                    Teachers are responsible for entering results. Use the "Send Reminder" button to notify them of missing entries.
                  </p>
                </div>
              </div>
              
              {/* Missing entries summary */}
              {filteredMissing.length > 0 && (
                <div className="bg-white rounded-lg border border-red-100 p-3">
                  <p className="text-sm font-medium text-red-700 mb-2">
                    Missing Entries ({filteredMissing.length})
                  </p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {filteredMissing.slice(0, 5).map((entry: any, idx: number) => (
                      <div key={idx} className="text-xs text-gray-600 flex justify-between">
                        <span>{entry.className} - {entry.subjectName}</span>
                        <span className="text-red-500">{entry.examName}</span>
                      </div>
                    ))}
                    {filteredMissing.length > 5 && (
                      <p className="text-xs text-gray-400">+{filteredMissing.length - 5} more</p>
                    )}
                  </div>
                </div>
              )}
              
              {/* Class Progress Cards */}
              {teacher.classProgress && teacher.classProgress.length > 0 ? (
                <div className="space-y-2 sm:space-y-3">
                  {teacher.classProgress.map((classProgress: any) => (
                    <ClassProgressCard 
                      key={classProgress.classId}
                      classProgress={classProgress}
                      selectedExamType={selectedExamType}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500 py-4 text-sm">
                  No class assignments found
                </p>
              )}
            </div>
           </td>
         </tr>
      )}
    </>
  );
};

// ==================== MAIN COMPONENT ====================
export const AdminResultsMonitor = ({ term, year }: AdminResultsMonitorProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('completionPercentage');
  const [filterBy, setFilterBy] = useState<FilterBy>('all');
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null);
  const [selectedExamType, setSelectedExamType] = useState<string>('all');
  const [showReminderToast, setShowReminderToast] = useState<{ show: boolean; teacherName: string }>({ show: false, teacherName: '' });
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const { teacherProgress, summary, missingByExamType, isLoading, refetch } = useResultsEntryMonitor({
    term,
    year,
  });
  
  // Filter and sort teachers
  const filteredTeachers = useMemo(() => {
    let filtered = [...teacherProgress];
    
    if (searchTerm) {
      filtered = filtered.filter(t => 
        t.teacherName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (filterBy !== 'all') {
      filtered = filtered.filter(t => t.status === filterBy);
    }
    
    filtered.sort((a, b) => {
      if (sortBy === 'name') return a.teacherName.localeCompare(b.teacherName);
      if (sortBy === 'missingCount') return b.missingCount - a.missingCount;
      if (sortBy === 'completionPercentage') return a.completionPercentage - b.completionPercentage;
      if (sortBy === 'totalRequired') return b.totalRequired - a.totalRequired;
      return 0;
    });
    
    return filtered;
  }, [teacherProgress, searchTerm, sortBy, filterBy]);
  
  const handleSendReminder = (teacherName: string, teacherEmail?: string) => {
    setShowReminderToast({ show: true, teacherName });
    setTimeout(() => setShowReminderToast({ show: false, teacherName: '' }), 3000);
    console.log(`Reminder sent to ${teacherName} (${teacherEmail || 'no email'})`);
  };
  
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };
  
  const handleExport = () => {
    const headers = ['Teacher Name', 'Total Required', 'Completed', 'Missing', 'Completion %', 'Status'];
    const rows = filteredTeachers.map(t => [
      t.teacherName,
      t.totalRequired.toString(),
      t.completedCount.toString(),
      t.missingCount.toString(),
      `${t.completionPercentage}%`,
      t.status === 'complete' ? 'Complete' : 
      t.status === 'on-track' ? 'On Track (75%+)' :
      t.status === 'behind' ? 'Behind (50-74%)' : 'Critical (<50%)'
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `results-monitor-${term}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-gray-100 rounded-xl animate-pulse"></div>
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse"></div>
      </div>
    );
  }
  
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Success Toast */}
      {showReminderToast.show && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-600 text-white px-3 sm:px-4 py-2 sm:py-3 rounded-lg shadow-lg animate-in slide-in-from-bottom-2 text-sm">
          Reminder sent to {showReminderToast.teacherName}
        </div>
      )}
      
      {/* Summary Stats Row - Responsive Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <StatCard
          title="Overall"
          value={`${summary.overallCompletion}%`}
          description={`${summary.completedEntries}/${summary.totalRequiredEntries}`}
          icon={<BarChart3 size={isMobile ? 16 : 20} />}
          color="blue"
        />
        <StatCard
          title="Teachers"
          value={summary.totalTeachers}
          description={`${summary.teachersComplete} complete`}
          icon={<Users size={isMobile ? 16 : 20} />}
          color="gray"
        />
        <StatCard
          title="Missing"
          value={summary.totalMissingEntries}
          description="Need attention"
          icon={<FileWarning size={isMobile ? 16 : 20} />}
          color="red"
        />
        <StatCard
          title="On Track"
          value={summary.teachersOnTrack}
          description="75%+ complete"
          icon={<TrendingUp size={isMobile ? 16 : 20} />}
          color="green"
        />
        {!isMobile && (
          <StatCard
            title="Behind/Critical"
            value={summary.teachersBehind + summary.teachersCritical}
            description="Need follow-up"
            icon={<AlertCircle size={20} />}
            color="orange"
          />
        )}
      </div>
      
      {/* Filters Bar - Mobile Toggle */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowMobileFilters(!showMobileFilters)}
          className="w-full flex items-center justify-between p-4 sm:hidden"
        >
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-400" />
            <span className="font-medium text-gray-700">Filters & Options</span>
            {filterBy !== 'all' && (
              <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                !
              </span>
            )}
          </div>
          <ChevronDown size={18} className={`transition-transform ${showMobileFilters ? 'rotate-180' : ''}`} />
        </button>

        <div className={`p-4 ${showMobileFilters ? 'block' : 'hidden sm:block'}`}>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search teachers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            {/* Filter by status */}
            <select
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value as FilterBy)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All teachers</option>
              <option value="complete">Complete (100%)</option>
              <option value="on-track">On Track (75-99%)</option>
              <option value="behind">Behind (50-74%)</option>
              <option value="critical">Critical (&lt;50%)</option>
            </select>
            
            {/* Sort by */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="completionPercentage">Sort by lowest completion</option>
              <option value="missingCount">Sort by most missing</option>
              <option value="name">Sort by name</option>
              <option value="totalRequired">Sort by workload</option>
            </select>
            
            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm flex items-center gap-2"
              >
                <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                {!isMobile && 'Refresh'}
              </button>
              <button
                onClick={handleExport}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm flex items-center gap-2"
              >
                <Download size={16} />
                {!isMobile && 'Export'}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Exam Type Quick Filters - Scrollable on mobile */}
      <div className="flex flex-nowrap sm:flex-wrap gap-2 overflow-x-auto pb-2 sm:pb-0">
        <button
          onClick={() => setSelectedExamType('all')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
            selectedExamType === 'all' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All ({summary.totalMissingEntries})
        </button>
        <button
          onClick={() => setSelectedExamType('week4')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
            selectedExamType === 'week4' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Week 4 ({missingByExamType.week4.length})
        </button>
        <button
          onClick={() => setSelectedExamType('week8')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
            selectedExamType === 'week8' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Week 8 ({missingByExamType.week8.length})
        </button>
        <button
          onClick={() => setSelectedExamType('endOfTerm')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
            selectedExamType === 'endOfTerm' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          End of Term ({missingByExamType.endOfTerm.length})
        </button>
      </div>
      
      {/* Teachers Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium text-gray-600">Teacher</th>
                <th className="text-center px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium text-gray-600">Progress</th>
                {!isMobile && (
                  <>
                    <th className="text-center px-4 py-3 text-sm font-medium text-gray-600">Complete</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-gray-600">Missing</th>
                  </>
                )}
                <th className="text-center px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium text-gray-600">Status</th>
                <th className="text-right px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTeachers.map((teacher) => (
                <TeacherRow
                  key={teacher.teacherId}
                  teacher={teacher}
                  isExpanded={expandedTeacher === teacher.teacherId}
                  onToggle={() => setExpandedTeacher(
                    expandedTeacher === teacher.teacherId ? null : teacher.teacherId
                  )}
                  selectedExamType={selectedExamType}
                  onSendReminder={handleSendReminder}
                />
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredTeachers.length === 0 && (
          <div className="text-center py-8 sm:py-12">
            <CheckCircle className="mx-auto text-green-500 mb-3" size={isMobile ? 32 : 48} />
            <p className="text-gray-500 text-sm sm:text-base">All caught up! No missing entries found.</p>
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="pt-2 sm:pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Last updated: {new Date().toLocaleString()} • {filteredTeachers.length} teachers • {summary.totalMissingEntries} missing entries
        </p>
      </div>
    </div>
  );
};