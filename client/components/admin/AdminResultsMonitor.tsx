// @/components/admin/AdminResultsMonitor.tsx
import { useState, useMemo } from 'react';
import { 
  AlertCircle, CheckCircle, AlertTriangle, 
  ChevronDown, ChevronRight, Search, 
  Filter, Download, Send, User, BookOpen,
  BarChart3, Users, FileWarning, Clock,
  XCircle, Info
} from 'lucide-react';
import { useResultsEntryMonitor, TeacherProgress, MissingEntry } from '@/hooks/useResultsEntryMonitor';

interface AdminResultsMonitorProps {
  term: string;
  year: number;
}

type SortBy = 'name' | 'missingCount' | 'completionPercentage' | 'totalRequired';
type FilterBy = 'all' | 'complete' | 'on-track' | 'behind' | 'critical';

export const AdminResultsMonitor = ({ term, year }: AdminResultsMonitorProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('completionPercentage');
  const [filterBy, setFilterBy] = useState<FilterBy>('all');
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null);
  const [selectedExamType, setSelectedExamType] = useState<string>('all');
  const [showReminderToast, setShowReminderToast] = useState<{ show: boolean; teacherName: string }>({ show: false, teacherName: '' });
  
  const { teacherProgress, summary, missingByExamType, isLoading } = useResultsEntryMonitor({
    term,
    year,
  });
  
  // Filter and sort teachers
  const filteredTeachers = useMemo(() => {
    let filtered = [...teacherProgress];
    
    // Apply search
    if (searchTerm) {
      filtered = filtered.filter(t => 
        t.teacherName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Apply status filter
    if (filterBy !== 'all') {
      filtered = filtered.filter(t => t.status === filterBy);
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === 'name') return a.teacherName.localeCompare(b.teacherName);
      if (sortBy === 'missingCount') return b.missingCount - a.missingCount;
      if (sortBy === 'completionPercentage') return a.completionPercentage - b.completionPercentage;
      if (sortBy === 'totalRequired') return b.totalRequired - a.totalRequired;
      return 0;
    });
    
    return filtered;
  }, [teacherProgress, searchTerm, sortBy, filterBy]);
  
  // Handle send reminder
  const handleSendReminder = (teacherName: string, teacherEmail?: string) => {
    setShowReminderToast({ show: true, teacherName });
    setTimeout(() => setShowReminderToast({ show: false, teacherName: '' }), 3000);
    
    // TODO: Integrate with email service
    console.log(`Reminder sent to ${teacherName} (${teacherEmail || 'no email'})`);
  };
  
  // Export to CSV
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
    <div className="space-y-6">
      {/* Success Toast for Reminder */}
      {showReminderToast.show && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg animate-in slide-in-from-bottom-2">
          Reminder sent to {showReminderToast.teacherName}
        </div>
      )}
      
      {/* Summary Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Overall Completion"
          value={`${summary.overallCompletion}%`}
          description={`${summary.completedEntries} of ${summary.totalRequiredEntries} entries`}
          icon={<BarChart3 size={20} />}
          color="blue"
        />
        <StatCard
          title="Teachers"
          value={summary.totalTeachers.toString()}
          description={`${summary.teachersComplete} complete, ${summary.teachersCritical} critical`}
          icon={<Users size={20} />}
          color="gray"
        />
        <StatCard
          title="Missing Entries"
          value={summary.totalMissingEntries.toString()}
          description="Need attention"
          icon={<FileWarning size={20} />}
          color="red"
        />
        <StatCard
          title="On Track"
          value={summary.teachersOnTrack.toString()}
          description="75%+ completion"
          icon={<AlertTriangle size={20} />}
          color="amber"
        />
        <StatCard
          title="Behind/Critical"
          value={(summary.teachersBehind + summary.teachersCritical).toString()}
          description="Need urgent follow-up"
          icon={<AlertCircle size={20} />}
          color="orange"
        />
      </div>
      
      {/* Filters Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
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
          <button
            onClick={handleExport}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm flex items-center gap-2"
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>
      
      {/* Exam Type Quick Filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedExamType('all')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            selectedExamType === 'all' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All ({summary.totalMissingEntries})
        </button>
        <button
          onClick={() => setSelectedExamType('week4')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            selectedExamType === 'week4' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Week 4 ({missingByExamType.week4.length})
        </button>
        <button
          onClick={() => setSelectedExamType('week8')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            selectedExamType === 'week8' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Week 8 ({missingByExamType.week8.length})
        </button>
        <button
          onClick={() => setSelectedExamType('endOfTerm')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
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
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Teacher</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-600">Progress</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-600">Complete</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-600">Missing</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-600">Status</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Action</th>
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
          <div className="text-center py-12">
            <CheckCircle className="mx-auto text-green-500 mb-3" size={48} />
            <p className="text-gray-500">All caught up! No missing entries found.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Stat Card Component
const StatCard = ({ title, value, description, icon, color }: any) => {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
  };
  
  return (
    <div className={`${colorClasses[color]} rounded-xl border p-4`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium opacity-75">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          <p className="text-xs mt-1 opacity-70">{description}</p>
        </div>
        <div className="opacity-75">{icon}</div>
      </div>
    </div>
  );
};

// Teacher Row Component
const TeacherRow = ({ teacher, isExpanded, onToggle, selectedExamType, onSendReminder }: any) => {
  const filteredMissing = selectedExamType === 'all' 
    ? teacher.missingEntries 
    : teacher.missingEntries.filter((e: any) => e.examType === selectedExamType);
  
  // Get status color and styles
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
          bg: 'bg-amber-100',
          text: 'text-amber-700',
          border: 'border-amber-200',
          barColor: 'bg-amber-500',
          icon: <AlertTriangle size={12} className="text-amber-600" />,
          label: 'On Track (75%+)'
        };
      case 'behind':
        return {
          bg: 'bg-red-100',
          text: 'text-red-700',
          border: 'border-red-200',
          barColor: 'bg-red-500',
          icon: <AlertCircle size={12} className="text-red-600" />,
          label: 'Behind (50-74%)'
        };
      case 'critical':
        return {
          bg: 'bg-red-200',
          text: 'text-red-800',
          border: 'border-red-300',
          barColor: 'bg-red-700',
          icon: <AlertCircle size={12} className="text-red-700" />,
          label: 'Critical (<50%)'
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
  
  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <div>
              <p className="font-medium text-gray-900">{teacher.teacherName}</p>
              <p className="text-xs text-gray-500">{teacher.classProgress?.length || 0} classes</p>
              {teacher.teacherEmail && (
                <p className="text-xs text-gray-400">{teacher.teacherEmail}</p>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-center">
            <div className="w-16">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${statusConfig.barColor}`}
                  style={{ width: `${teacher.completionPercentage}%` }}
                />
              </div>
              <p className={`text-xs text-center mt-1 font-medium ${statusConfig.text}`}>
                {teacher.completionPercentage}%
              </p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-center text-green-600 font-medium">
          {teacher.completedCount}
        </td>
        <td className="px-4 py-3 text-center text-red-600 font-medium">
          {teacher.missingCount}
        </td>
        <td className="px-4 py-3 text-center">
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
            {statusConfig.icon}
            {statusConfig.label}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
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
      
      {/* Expanded details - shows class-by-class and subject-by-subject */}
      {isExpanded && (
        <tr>
          <td colSpan={6} className="px-4 py-4 bg-gray-50">
            <div className="space-y-4">
              {/* Info banner - admins don't enter results */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-blue-700">
                  <Info size={14} />
                  <p className="text-xs">
                    Teachers are responsible for entering results. Use the "Send Reminder" button to notify them of missing entries.
                  </p>
                </div>
              </div>
              
              {/* Class Progress Cards */}
              {teacher.classProgress && teacher.classProgress.length > 0 ? (
                teacher.classProgress.map((classProgress: any) => (
                  <ClassProgressCard 
                    key={classProgress.classId}
                    classProgress={classProgress}
                    selectedExamType={selectedExamType}
                  />
                ))
              ) : (
                <p className="text-center text-gray-500 py-4">
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

// Class Progress Card Component
const ClassProgressCard = ({ classProgress, selectedExamType }: any) => {
  const [expanded, setExpanded] = useState(false);
  
  const getClassStatusColor = (percentage: number) => {
    if (percentage === 100) return 'border-green-200 bg-green-50';
    if (percentage >= 75) return 'border-amber-200 bg-amber-50';
    if (percentage >= 50) return 'border-red-200 bg-red-50';
    return 'border-red-300 bg-red-100';
  };
  
  const getClassStatusText = (percentage: number) => {
    if (percentage === 100) return 'text-green-700';
    if (percentage >= 75) return 'text-amber-700';
    if (percentage >= 50) return 'text-red-700';
    return 'text-red-800';
  };
  
  const getBarColor = (percentage: number) => {
    if (percentage === 100) return 'bg-green-500';
    if (percentage >= 75) return 'bg-amber-500';
    if (percentage >= 50) return 'bg-red-500';
    return 'bg-red-700';
  };
  
  return (
    <div className={`rounded-lg border ${getClassStatusColor(classProgress.completionPercentage)} overflow-hidden`}>
      {/* Class Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-black/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <div className="text-left">
            <p className="font-medium text-gray-900">{classProgress.className}</p>
            <p className="text-xs text-gray-500">
              {classProgress.completedCount} of {classProgress.totalRequired} entries completed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-24">
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${getBarColor(classProgress.completionPercentage)}`}
                style={{ width: `${classProgress.completionPercentage}%` }}
              />
            </div>
          </div>
          <span className={`text-sm font-medium ${getClassStatusText(classProgress.completionPercentage)}`}>
            {classProgress.completionPercentage}%
          </span>
        </div>
      </button>
      
      {/* Subject Details */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2 border-t border-inherit pt-3">
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

// Subject Progress Row Component
const SubjectProgressRow = ({ subject, selectedExamType }: any) => {
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
      return <CheckCircle size={14} className="text-green-600" />;
    }
    return <XCircle size={14} className="text-red-500" />;
  };
  
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{subject.subjectName}</p>
        {subject.totalStudents > 0 && (
          <p className="text-xs text-gray-400">{subject.totalStudents} students</p>
        )}
      </div>
      <div className="flex items-center gap-4">
        {examTypes.map(exam => shouldShowExam(exam.key) && (
          <div key={exam.key} className="flex items-center gap-1" title={`${exam.name}: ${subject[`${exam.key}Complete`] ? 'Complete' : 'Missing'}`}>
            {getExamIcon(subject[`${exam.key}Complete`])}
            <span className="text-xs text-gray-500">{exam.label}</span>
            {subject[`${exam.key}StudentCount`] > 0 && (
              <span className="text-xs text-gray-400 ml-0.5">
                ({subject[`${exam.key}StudentCount`]}/{subject.totalStudents})
              </span>
            )}
          </div>
        ))}
        <div className="w-12 text-right">
          <span className={`text-xs font-medium ${
            subject.completionPercentage === 100 ? 'text-green-600' :
            subject.completionPercentage >= 75 ? 'text-amber-600' : 'text-red-600'
          }`}>
            {subject.completionPercentage}%
          </span>
        </div>
      </div>
    </div>
  );
};