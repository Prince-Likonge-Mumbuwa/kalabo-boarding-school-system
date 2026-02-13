// @/pages/teacher/TeacherResultsAnalysis.tsx - CLEAN, FOCUSED, MOBILE-OPTIMIZED
import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useMemo } from 'react';
import { useResultsAnalytics } from '@/hooks/useResults';
import { useAuth } from '@/hooks/useAuth';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { 
  Filter, Loader2, RefreshCw, TrendingUp, TrendingDown, 
  Download, Target, Users, Award, AlertCircle, ChevronDown 
} from 'lucide-react';

// ==================== TYPES ====================
interface GradeDistribution {
  grade: number;
  count: number;
  description: string;
}

// ==================== STAT CARD ====================
interface StatCardProps {
  label: string;
  value: string;
  sublabel: string;
  icon: React.ElementType;
  color: 'green' | 'blue' | 'red';
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
}

const StatCard = ({ label, value, sublabel, icon: Icon, color, trend, trendValue }: StatCardProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  const colors = {
    green: {
      bg: 'bg-gradient-to-br from-green-50 to-emerald-50',
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      value: 'text-green-600',
      border: 'border-green-200'
    },
    blue: {
      bg: 'bg-gradient-to-br from-blue-50 to-indigo-50',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      value: 'text-blue-600',
      border: 'border-blue-200'
    },
    red: {
      bg: 'bg-gradient-to-br from-red-50 to-orange-50',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      value: 'text-red-600',
      border: 'border-red-200'
    }
  };

  const style = colors[color];

  return (
    <div className={`
      bg-white rounded-xl border ${style.border} p-4 sm:p-5
      hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5
    `}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">
            {label}
          </p>
          <div className="flex items-baseline gap-1">
            <p className={`text-2xl sm:text-3xl lg:text-4xl font-bold ${style.value}`}>
              {value}
            </p>
            {trend && trendValue && (
              <div className="flex items-center gap-0.5 ml-1">
                {trend === 'up' && <TrendingUp size={12} className="text-green-500" />}
                {trend === 'down' && <TrendingDown size={12} className="text-red-500" />}
                <span className="text-[10px] sm:text-xs text-gray-500">{trendValue}</span>
              </div>
            )}
          </div>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-1 truncate">
            {sublabel}
          </p>
        </div>
        <div className={`p-2 sm:p-2.5 rounded-lg flex-shrink-0 ${style.iconBg}`}>
          <Icon size={isMobile ? 18 : 20} className={style.iconColor} />
        </div>
      </div>
    </div>
  );
};

// ==================== GRADE BADGE ====================
const GradeBadge = ({ grade }: { grade: number }) => {
  const colors = {
    1: 'bg-green-600',
    2: 'bg-green-500',
    3: 'bg-blue-500',
    4: 'bg-blue-400',
    5: 'bg-cyan-500',
    6: 'bg-cyan-400',
    7: 'bg-yellow-500',
    8: 'bg-orange-500',
    9: 'bg-red-500'
  };
  
  return (
    <span className={`px-2.5 py-1 rounded-md text-xs font-bold text-white ${colors[grade as keyof typeof colors] || 'bg-gray-500'}`}>
      {grade}
    </span>
  );
};

// ==================== EMPTY STATE ====================
const EmptyState = ({ hasAssignments }: { hasAssignments: boolean }) => {
  if (!hasAssignments) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 sm:p-12 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-full mb-5">
          <Users className="text-yellow-600" size={32} />
        </div>
        <h3 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">
          No Teaching Assignments
        </h3>
        <p className="text-sm sm:text-base text-gray-600 max-w-md mx-auto">
          You haven't been assigned to any classes yet. Contact your administrator to get teaching assignments.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 sm:p-12 text-center">
      <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-full mb-5">
        <Target className="text-blue-500" size={32} />
      </div>
      <h3 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">
        No Results Available
      </h3>
      <p className="text-sm sm:text-base text-gray-600 max-w-md mx-auto">
        No results have been entered for the selected filters. Enter results in the Results Entry page.
      </p>
    </div>
  );
};

// ==================== SKELETON ====================
const Skeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="h-3 bg-gray-200 rounded w-16 mb-2"></div>
              <div className="h-6 sm:h-7 bg-gray-300 rounded w-12"></div>
            </div>
            <div className="p-2 bg-gray-100 rounded-lg">
              <div className="w-4 h-4 sm:w-5 sm:h-5 bg-gray-300 rounded"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="h-5 bg-gray-200 rounded w-40 mb-4"></div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex items-center gap-4">
            <div className="w-10 h-8 bg-gray-200 rounded"></div>
            <div className="flex-1 h-4 bg-gray-200 rounded"></div>
            <div className="w-16 h-6 bg-gray-200 rounded"></div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ==================== MAIN COMPONENT ====================
export default function TeacherResultsAnalysis() {
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedTerm, setSelectedTerm] = useState('Term 1');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Get teacher's assigned classes and subjects
  const { assignments, isLoading: assignmentsLoading } = useTeacherAssignments(user?.id || '');

  // Get analytics data
  const { 
    analytics, 
    results,
    isLoading, 
    isFetching, 
    refetch 
  } = useResultsAnalytics({
    teacherId: user?.id || '',
    classId: selectedClass !== 'all' ? selectedClass : undefined,
    subjectId: selectedSubject !== 'all' ? selectedSubject : undefined,
    term: selectedTerm,
    year: selectedYear,
  });

  // Extract unique classes and subjects from assignments
  const assignedClasses = useMemo(() => {
    if (!assignments) return [];
    const classMap = new Map();
    assignments.forEach(a => {
      if (!classMap.has(a.classId)) {
        classMap.set(a.classId, {
          id: a.classId,
          name: a.className
        });
      }
    });
    return Array.from(classMap.values());
  }, [assignments]);

  const assignedSubjects = useMemo(() => {
    if (!assignments) return [];
    
    if (selectedClass !== 'all') {
      const subjectMap = new Map();
      assignments
        .filter(a => a.classId === selectedClass)
        .forEach(a => {
          if (!subjectMap.has(a.subject)) {
            subjectMap.set(a.subject, {
              id: a.subject,
              name: a.subject
            });
          }
        });
      return Array.from(subjectMap.values());
    }
    
    const subjectMap = new Map();
    assignments.forEach(a => {
      if (!subjectMap.has(a.subject)) {
        subjectMap.set(a.subject, {
          id: a.subject,
          name: a.subject
        });
      }
    });
    return Array.from(subjectMap.values());
  }, [assignments, selectedClass]);

  // Calculate grade distribution - ONLY GRADES WITH COUNTS
  const gradeDistribution = useMemo((): GradeDistribution[] => {
    if (!results || results.length === 0) return [];

    const gradeCounts = new Map<number, number>();
    
    results
      .filter(r => r.examType === 'endOfTerm' && r.grade > 0)
      .forEach(result => {
        gradeCounts.set(result.grade, (gradeCounts.get(result.grade) || 0) + 1);
      });

    const getShortDescription = (grade: number): string => {
      if (grade <= 2) return 'Dist';
      if (grade <= 4) return 'Merit';
      if (grade <= 6) return 'Credit';
      if (grade <= 8) return 'Satis';
      return 'Fail';
    };

    return Array.from(gradeCounts.entries())
      .map(([grade, count]) => ({
        grade,
        count,
        description: getShortDescription(grade)
      }))
      .sort((a, b) => a.grade - b.grade);
  }, [results]);

  // Calculate THREE CORE METRICS
  const coreMetrics = useMemo(() => {
    if (!results || results.length === 0) {
      return {
        qualityPass: { percentage: 0, count: 0, total: 0 },
        quantityPass: { percentage: 0, count: 0, total: 0 },
        fail: { percentage: 0, count: 0, total: 0 }
      };
    }

    const endOfTermResults = results.filter(r => r.examType === 'endOfTerm' && r.grade > 0);
    const total = endOfTermResults.length;

    const qualityPass = endOfTermResults.filter(r => r.grade >= 1 && r.grade <= 6).length;
    const quantityPass = endOfTermResults.filter(r => r.grade >= 1 && r.grade <= 8).length;
    const fail = endOfTermResults.filter(r => r.grade === 9).length;

    return {
      qualityPass: {
        percentage: total > 0 ? Math.round((qualityPass / total) * 100) : 0,
        count: qualityPass,
        total
      },
      quantityPass: {
        percentage: total > 0 ? Math.round((quantityPass / total) * 100) : 0,
        count: quantityPass,
        total
      },
      fail: {
        percentage: total > 0 ? Math.round((fail / total) * 100) : 0,
        count: fail,
        total
      }
    };
  }, [results]);

  // Calculate trends (compare to previous term)
  const trends = useMemo(() => {
    // This would come from real data in production
    // For now, returning mock trends
    return {
      qualityPass: 'up' as const,
      quantityPass: 'up' as const,
      fail: 'down' as const
    };
  }, []);

  const hasAssignments = assignedClasses.length > 0;
  const hasData = results && results.length > 0;

  // Generate years from 2026 upwards
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1, currentYear + 2];

  const clearFilters = () => {
    setSelectedClass('all');
    setSelectedSubject('all');
    setSelectedTerm('Term 1');
    setSelectedYear(new Date().getFullYear());
  };

  const handleExport = () => {
    // Export functionality would go here
    console.log('Exporting data...');
  };

  if (assignmentsLoading || isLoading) {
    return (
      <DashboardLayout activeTab="analysis">
        <div className="p-4 sm:p-6 lg:p-8">
          <Skeleton />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="analysis">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
        
        {/* ===== HEADER ===== */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              Results Analysis
            </h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">
              {selectedClass === 'all' ? 'All classes' : assignedClasses.find(c => c.id === selectedClass)?.name}
              {selectedSubject !== 'all' && ` • ${selectedSubject}`}
              {isFetching && (
                <span className="inline-flex items-center gap-1.5 text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full text-xs ml-2">
                  <Loader2 size={12} className="animate-spin" />
                  updating
                </span>
              )}
            </p>
          </div>
          
          {/* Export & Refresh - Icon only on mobile */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={!hasData}
              className={`
                inline-flex items-center justify-center
                border border-gray-300 text-gray-700 rounded-xl
                hover:bg-gray-50 transition-all
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                ${isMobile ? 'p-2.5' : 'px-4 py-2.5 gap-2'}
              `}
              title="Export data"
            >
              <Download size={isMobile ? 18 : 16} />
              {!isMobile && 'Export'}
            </button>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className={`
                inline-flex items-center justify-center
                bg-blue-600 text-white rounded-xl hover:bg-blue-700
                transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                ${isMobile ? 'p-2.5' : 'px-4 py-2.5 gap-2'}
              `}
              title="Refresh data"
            >
              <RefreshCw size={isMobile ? 18 : 16} className={isFetching ? 'animate-spin' : ''} />
              {!isMobile && 'Refresh'}
            </button>
          </div>
        </div>

        {/* ===== NO ASSIGNMENTS STATE ===== */}
        {!hasAssignments && <EmptyState hasAssignments={false} />}

        {/* ===== FILTERS ===== */}
        {hasAssignments && (
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
                    {selectedClass !== 'all' || selectedSubject !== 'all' ? 'Filters active' : 'Filter results'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {(selectedClass !== 'all' || selectedSubject !== 'all') && (
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  )}
                  <ChevronDown 
                    size={18} 
                    className={`text-gray-500 transition-transform ${showMobileFilters ? 'rotate-180' : ''}`} 
                  />
                </div>
              </button>
            )}

            {/* Filter Content */}
            <div className={`
              p-4 sm:p-5
              ${isMobile && !showMobileFilters ? 'hidden' : 'block'}
            `}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* Class Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Class
                  </label>
                  <select
                    value={selectedClass}
                    onChange={e => {
                      setSelectedClass(e.target.value);
                      setSelectedSubject('all');
                    }}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             text-sm bg-white hover:border-gray-400 transition-colors"
                  >
                    <option value="all">All Classes</option>
                    {assignedClasses.map(cls => (
                      <option key={cls.id} value={cls.id}>{cls.name}</option>
                    ))}
                  </select>
                </div>
                
                {/* Subject Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Subject
                  </label>
                  <select
                    value={selectedSubject}
                    onChange={e => setSelectedSubject(e.target.value)}
                    disabled={assignedSubjects.length === 0}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             text-sm bg-white hover:border-gray-400 transition-colors
                             disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="all">All Subjects</option>
                    {assignedSubjects.map(subject => (
                      <option key={subject.id} value={subject.id}>{subject.name}</option>
                    ))}
                  </select>
                </div>
                
                {/* Term & Year */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Term
                  </label>
                  <select
                    value={selectedTerm}
                    onChange={e => setSelectedTerm(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             text-sm bg-white hover:border-gray-400 transition-colors"
                  >
                    <option value="Term 1">Term 1</option>
                    <option value="Term 2">Term 2</option>
                    <option value="Term 3">Term 3</option>
                  </select>
                </div>
                
                {/* Year - ONLY 2026 AND ABOVE */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Year
                  </label>
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             text-sm bg-white hover:border-gray-400 transition-colors"
                  >
                    {years.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {/* Clear Filters */}
              {(selectedClass !== 'all' || selectedSubject !== 'all' || selectedTerm !== 'Term 1' || selectedYear !== currentYear) && (
                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
                  <button
                    onClick={clearFilters}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== THREE CORE METRICS ===== */}
        {hasAssignments && hasData && (
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <StatCard
              label="Quality Pass"
              value={`${coreMetrics.qualityPass.percentage}%`}
              sublabel={`Grades 1-6 • ${coreMetrics.qualityPass.count}/${coreMetrics.qualityPass.total}`}
              icon={Target}
              color="green"
              trend={trends.qualityPass}
              trendValue="+3%"
            />
            <StatCard
              label="Quantity Pass"
              value={`${coreMetrics.quantityPass.percentage}%`}
              sublabel={`Grades 1-8 • ${coreMetrics.quantityPass.count}/${coreMetrics.quantityPass.total}`}
              icon={Award}
              color="blue"
              trend={trends.quantityPass}
              trendValue="+2%"
            />
            <StatCard
              label="Fail"
              value={`${coreMetrics.fail.percentage}%`}
              sublabel={`Grade 9 • ${coreMetrics.fail.count}/${coreMetrics.fail.total}`}
              icon={AlertCircle}
              color="red"
              trend={trends.fail}
              trendValue="-5%"
            />
          </div>
        )}

        {/* ===== GRADE DISTRIBUTION TABLE - 3 COLUMNS ONLY ===== */}
        {hasAssignments && hasData && gradeDistribution.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            
            {/* Header */}
            <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm sm:text-base">
                    Grade Distribution
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                    End of Term • {gradeDistribution.reduce((sum, g) => sum + g.count, 0)} assessments
                  </p>
                </div>
              </div>
            </div>

            {/* Mobile-Optimized Card View */}
            {isMobile ? (
              <div className="divide-y divide-gray-100">
                {gradeDistribution.map((row) => (
                  <div key={row.grade} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <GradeBadge grade={row.grade} />
                      <span className="text-sm font-medium text-gray-700">
                        {row.description}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-gray-900">{row.count}</span>
                      <span className="text-xs text-gray-500 ml-1">students</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Desktop Table - 3 COLUMNS, HORIZONTAL ONLY */
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-24">
                        Grade
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Count
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {gradeDistribution.map((row) => (
                      <tr key={row.grade} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <GradeBadge grade={row.grade} />
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {row.description}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-semibold text-gray-900">{row.count}</span>
                          <span className="text-xs text-gray-500 ml-1">
                            student{row.count !== 1 ? 's' : ''}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900" colSpan={2}>
                        Total
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-gray-900">
                          {gradeDistribution.reduce((sum, row) => sum + row.count, 0)}
                        </span>
                        <span className="text-xs text-gray-500 ml-1">students</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ===== EMPTY STATE ===== */}
        {hasAssignments && !hasData && <EmptyState hasAssignments={true} />}

        {/* ===== FOOTER ===== */}
        {hasAssignments && hasData && (
          <div className="text-xs text-gray-500 text-center sm:text-left pt-4 border-t border-gray-200">
            <span className="font-medium">End of Term Results</span>
            <span className="mx-2">•</span>
            {selectedTerm} {selectedYear}
            <span className="mx-2">•</span>
            {gradeDistribution.reduce((sum, g) => sum + g.count, 0)} assessments
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}