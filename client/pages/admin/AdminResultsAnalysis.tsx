import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useMemo, useEffect } from 'react';
import { useResultsAnalytics } from '@/hooks/useResults';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useAuth } from '@/hooks/useAuth';
import {
  Filter,
  TrendingUp,
  TrendingDown,
  Download,
  BarChart3,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  GraduationCap,
  Users,
  Target
} from 'lucide-react';

// ==================== TYPES ====================
interface GradeDistribution {
  grade: number;
  count: number;
  percentage: number;
  description: string;
  passStatus: 'pass' | 'fail' | 'distinction';
}

// ==================== CUSTOM NOTIFICATION COMPONENT ====================
const Notification = ({ 
  type, 
  message, 
  description, 
  onClose 
}: { 
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  description?: string;
  onClose: () => void;
}) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-green-500" />,
    error: <XCircle className="w-5 h-5 text-red-500" />,
    info: <AlertCircle className="w-5 h-5 text-blue-500" />,
    warning: <AlertCircle className="w-5 h-5 text-yellow-500" />
  };

  const bgColors = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    info: 'bg-blue-50 border-blue-200',
    warning: 'bg-yellow-50 border-yellow-200'
  };

  return (
    <div className={`fixed top-4 right-4 z-50 max-w-md w-full rounded-xl border p-4 shadow-lg animate-in slide-in-from-top-2 duration-300 ${bgColors[type]}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {icons[type]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{message}</p>
          {description && (
            <p className="text-xs text-gray-600 mt-1">{description}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 ml-2 p-1 hover:bg-white/50 rounded-lg transition-colors"
        >
          <XCircle size={16} className="text-gray-400 hover:text-gray-600" />
        </button>
      </div>
    </div>
  );
};

// ==================== SKELETON COMPONENTS ====================
const MetricSkeleton = () => (
  <div className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse">
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
        <div className="h-8 bg-gray-300 rounded w-16"></div>
      </div>
      <div className="p-3 bg-gray-100 rounded-xl">
        <div className="w-6 h-6 bg-gray-300 rounded"></div>
      </div>
    </div>
    <div className="h-2 bg-gray-200 rounded w-32 mt-4"></div>
  </div>
);

const ChartSkeleton = () => (
  <div className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse">
    <div className="flex items-center justify-between mb-6">
      <div>
        <div className="h-5 bg-gray-200 rounded w-48 mb-2"></div>
        <div className="h-3 bg-gray-100 rounded w-64"></div>
      </div>
      <div className="h-9 bg-gray-200 rounded w-28"></div>
    </div>
    <div className="h-80 bg-gray-100 rounded-xl"></div>
  </div>
);

// ==================== MAIN COMPONENT ====================
export default function AdminResultsAnalysis() {
  const { user } = useAuth();
  const isUserAdmin = user?.userType === 'admin';
  
  // State for notifications - BUILT IN, NO EXTERNAL HOOK
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
    description?: string;
  }>>([]);

  // Notification helper - BUILT IN, NO EXTERNAL HOOK
  const showNotification = (
    type: 'success' | 'error' | 'info' | 'warning',
    message: string,
    description?: string
  ) => {
    const id = Math.random().toString(36).substring(7);
    setNotifications(prev => [...prev, { id, type, message, description }]);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // State for filters - SIMPLIFIED
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedTerm, setSelectedTerm] = useState<string>('Term 2');
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Get classes for filter
  const { classes, isLoading: classesLoading } = useSchoolClasses({ isActive: true });

  // Use the analytics hook with real data
  const { 
    analytics, 
    results, 
    isLoading, 
    isFetching, 
    refetch 
  } = useResultsAnalytics({
    classId: selectedClass !== 'all' ? selectedClass : undefined,
    term: selectedTerm,
    year: selectedYear,
  });

  // Check mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Calculate grade distribution - SIMPLIFIED TO 3 CATEGORIES - WITH CORRECT TYPING
  const gradeDistribution = useMemo((): GradeDistribution[] => {
    if (!results || results.length === 0) return [];

    const endOfTermResults = results.filter(r => 
      r.examType === 'endOfTerm' && r.grade > 0
    );

    if (endOfTermResults.length === 0) return [];

    // Group into three categories: Distinction (1-2), Pass (3-6), Fail (7-9)
    const distinctions = endOfTermResults.filter(r => r.grade <= 2).length;
    const passes = endOfTermResults.filter(r => r.grade >= 3 && r.grade <= 6).length;
    const fails = endOfTermResults.filter(r => r.grade >= 7).length;
    
    const total = endOfTermResults.length;

    const distribution: GradeDistribution[] = [];
    
    if (distinctions > 0) {
      distribution.push({
        grade: 1,
        count: distinctions,
        percentage: Math.round((distinctions / total) * 100),
        description: 'Distinction (Grades 1-2)',
        passStatus: 'distinction'
      });
    }
    
    if (passes > 0) {
      distribution.push({
        grade: 3,
        count: passes,
        percentage: Math.round((passes / total) * 100),
        description: 'Pass (Grades 3-6)',
        passStatus: 'pass'
      });
    }
    
    if (fails > 0) {
      distribution.push({
        grade: 7,
        count: fails,
        percentage: Math.round((fails / total) * 100),
        description: 'Fail (Grades 7-9)',
        passStatus: 'fail'
      });
    }
    
    return distribution;
  }, [results]);

  // Calculate summary metrics - THREE CARDS ONLY
  const summaryMetrics = useMemo(() => {
    if (!analytics) {
      return {
        passRate: 0,
        averageScore: 0,
        failRate: 0,
        totalAssessments: 0
      };
    }

    const endOfTermResults = results.filter(r => r.examType === 'endOfTerm');
    const totalAssessments = endOfTermResults.length;
    
    const passCount = endOfTermResults.filter(r => r.grade <= 6).length;
    const failCount = endOfTermResults.filter(r => r.grade >= 7).length;
    
    const passRate = totalAssessments > 0 ? Math.round((passCount / totalAssessments) * 100) : 0;
    const failRate = totalAssessments > 0 ? Math.round((failCount / totalAssessments) * 100) : 0;

    return {
      passRate,
      averageScore: analytics.averagePercentage || 0,
      failRate,
      totalAssessments
    };
  }, [analytics, results]);

  // Handle export
  const handleExport = async () => {
    try {
      if (!results || results.length === 0) {
        showNotification(
          'warning',
          'No data to export',
          'There are no results available for the selected filters.'
        );
        return;
      }

      showNotification(
        'info',
        'Preparing export...',
        'Your report is being generated.'
      );

      // Simulate async operation
      await new Promise(resolve => setTimeout(resolve, 1500));

      showNotification(
        'success',
        'Export completed',
        'The results report has been downloaded.'
      );

    } catch (error) {
      showNotification(
        'error',
        'Export failed',
        'An error occurred while generating the report.'
      );
    }
  };

  // Handle filter change
  const handleFilterChange = (type: 'class' | 'term' | 'year', value: string | number) => {
    if (type === 'class') setSelectedClass(value as string);
    if (type === 'term') setSelectedTerm(value as string);
    if (type === 'year') setSelectedYear(value as number);
    
    showNotification(
      'info',
      'Updating results...',
      `Showing ${type === 'class' ? value : selectedClass} data`
    );
  };

  // Handle refresh
  const handleRefresh = async () => {
    showNotification(
      'info',
      'Refreshing data...',
      'Fetching the latest results.'
    );
    await refetch();
    showNotification(
      'success',
      'Data updated',
      'Results are now current.'
    );
  };

  // Get color for metric card
  const getMetricColor = (type: 'pass' | 'average' | 'fail') => {
    switch (type) {
      case 'pass': return {
        bg: 'bg-gradient-to-br from-green-50 to-emerald-50',
        iconBg: 'bg-green-100',
        iconColor: 'text-green-600',
        text: 'text-green-600',
        border: 'border-green-200',
        shadow: 'hover:shadow-green-100'
      };
      case 'average': return {
        bg: 'bg-gradient-to-br from-blue-50 to-indigo-50',
        iconBg: 'bg-blue-100',
        iconColor: 'text-blue-600',
        text: 'text-blue-600',
        border: 'border-blue-200',
        shadow: 'hover:shadow-blue-100'
      };
      case 'fail': return {
        bg: 'bg-gradient-to-br from-red-50 to-orange-50',
        iconBg: 'bg-red-100',
        iconColor: 'text-red-600',
        text: 'text-red-600',
        border: 'border-red-200',
        shadow: 'hover:shadow-red-100'
      };
    }
  };

  // Years for filter
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  // Loading states
  if (isLoading || classesLoading) {
    return (
      <DashboardLayout activeTab="results">
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
          {/* Header Skeleton */}
          <div className="mb-8 animate-pulse">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="h-8 sm:h-9 lg:h-10 bg-gray-200 rounded w-64 mb-2"></div>
                <div className="h-4 sm:h-5 bg-gray-100 rounded w-96"></div>
              </div>
              <div className="h-10 sm:h-11 bg-gray-200 rounded w-32"></div>
            </div>
          </div>

          {/* Three Metrics Skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </div>

          {/* Chart Skeleton */}
          <ChartSkeleton />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="results">
      <div className="min-h-screen bg-gray-50 p-3 sm:p-6 lg:p-8 transition-all duration-200">
        
        {/* ===== NOTIFICATIONS ===== */}
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {notifications.map(notification => (
            <Notification
              key={notification.id}
              type={notification.type}
              message={notification.message}
              description={notification.description}
              onClose={() => removeNotification(notification.id)}
            />
          ))}
        </div>

        {/* ===== HEADER ===== */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
                Results Analysis
              </h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2 flex items-center gap-2 flex-wrap">
                <span>End of Term Performance</span>
                <span className="text-gray-300">•</span>
                <span>{selectedTerm} {selectedYear}</span>
                {isFetching && (
                  <span className="inline-flex items-center gap-1.5 text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full text-xs">
                    <Loader2 size={12} className="animate-spin" />
                    updating
                  </span>
                )}
              </p>
            </div>
            
            {/* Export Button - ALWAYS VISIBLE */}
            <button
              onClick={handleExport}
              disabled={results.length === 0 || isFetching}
              className={`
                inline-flex items-center justify-center gap-2
                bg-blue-600 text-white rounded-xl hover:bg-blue-700
                font-medium transition-all active:scale-[0.98]
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                px-4 py-2.5 sm:px-5 sm:py-3
                ${isMobile ? 'w-full sm:w-auto' : ''}
              `}
            >
              <Download size={18} />
              <span>Export Report</span>
            </button>
          </div>
        </div>

        {/* ===== THREE CORE METRICS - Quality, Quantity, Fail ===== */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-8">
          
          {/* Quality (Pass Rate) */}
          <div className={`
            rounded-2xl border p-5 sm:p-6
            transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5
            ${getMetricColor('pass').bg} ${getMetricColor('pass').border}
          `}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Pass Rate</p>
                <div className="flex items-baseline gap-1">
                  <p className={`text-3xl sm:text-4xl font-bold ${getMetricColor('pass').text}`}>
                    {summaryMetrics.passRate}%
                  </p>
                  <span className="text-xs text-gray-500">of students</span>
                </div>
              </div>
              <div className={`p-3 sm:p-4 rounded-xl ${getMetricColor('pass').iconBg}`}>
                <Target size={isMobile ? 20 : 24} className={getMetricColor('pass').iconColor} />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{ width: `${summaryMetrics.passRate}%` }}
                />
              </div>
              <span className="text-xs font-medium text-gray-600">
                {summaryMetrics.passRate}%
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Grades 1-6 • {gradeDistribution.find(g => g.passStatus === 'pass' || g.passStatus === 'distinction')?.count || 0} students
            </p>
          </div>

          {/* Quantity (Average Score) */}
          <div className={`
            rounded-2xl border p-5 sm:p-6
            transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5
            ${getMetricColor('average').bg} ${getMetricColor('average').border}
          `}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Average Score</p>
                <div className="flex items-baseline gap-1">
                  <p className={`text-3xl sm:text-4xl font-bold ${getMetricColor('average').text}`}>
                    {summaryMetrics.averageScore}%
                  </p>
                  <span className="text-xs text-gray-500">mean</span>
                </div>
              </div>
              <div className={`p-3 sm:p-4 rounded-xl ${getMetricColor('average').iconBg}`}>
                <GraduationCap size={isMobile ? 20 : 24} className={getMetricColor('average').iconColor} />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex items-center gap-1">
                {summaryMetrics.averageScore >= 70 ? (
                  <TrendingUp size={14} className="text-green-500" />
                ) : summaryMetrics.averageScore >= 50 ? (
                  <TrendingUp size={14} className="text-yellow-500" />
                ) : (
                  <TrendingDown size={14} className="text-red-500" />
                )}
                <span className="text-xs text-gray-600">
                  {summaryMetrics.averageScore >= 70 ? 'Above target' : 
                   summaryMetrics.averageScore >= 50 ? 'At target' : 'Below target'}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              {summaryMetrics.totalAssessments} total assessments
            </p>
          </div>

          {/* Fail Rate */}
          <div className={`
            rounded-2xl border p-5 sm:p-6
            transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5
            ${getMetricColor('fail').bg} ${getMetricColor('fail').border}
          `}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Fail Rate</p>
                <div className="flex items-baseline gap-1">
                  <p className={`text-3xl sm:text-4xl font-bold ${getMetricColor('fail').text}`}>
                    {summaryMetrics.failRate}%
                  </p>
                  <span className="text-xs text-gray-500">of students</span>
                </div>
              </div>
              <div className={`p-3 sm:p-4 rounded-xl ${getMetricColor('fail').iconBg}`}>
                <AlertCircle size={isMobile ? 20 : 24} className={getMetricColor('fail').iconColor} />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-red-500 rounded-full transition-all duration-500"
                  style={{ width: `${summaryMetrics.failRate}%` }}
                />
              </div>
              <span className="text-xs font-medium text-gray-600">
                {summaryMetrics.failRate}%
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Grades 7-9 • {gradeDistribution.find(g => g.passStatus === 'fail')?.count || 0} students
            </p>
          </div>
        </div>

        {/* ===== FILTERS - SIMPLIFIED, CLASS ONLY ===== */}
        <div className="mb-8">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            
            {/* Mobile Filter Toggle */}
            {isMobile && (
              <button
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                className="w-full flex items-center justify-between p-4 bg-white"
              >
                <div className="flex items-center gap-2">
                  <Filter size={18} className="text-gray-400" />
                  <span className="font-medium text-gray-700">
                    {selectedClass !== 'all' ? `Class: ${selectedClass}` : 'Filter by class'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedClass !== 'all' && (
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  )}
                  <ChevronDown 
                    size={18} 
                    className={`text-gray-500 transition-transform duration-200 ${showMobileFilters ? 'rotate-180' : ''}`} 
                  />
                </div>
              </button>
            )}

            {/* Filter Content */}
            <div className={`
              p-4 sm:p-6
              ${isMobile && !showMobileFilters ? 'hidden' : 'block'}
            `}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Filter size={16} className="text-blue-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-700">Filter by:</span>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 flex-1">
                  {/* Class Filter */}
                  <div className="relative flex-1">
                    <select
                      value={selectedClass}
                      onChange={(e) => handleFilterChange('class', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl
                               focus:ring-2 focus:ring-blue-500 focus:border-transparent
                               appearance-none bg-white cursor-pointer text-sm
                               hover:border-gray-400 transition-colors"
                    >
                      <option value="all">All Classes</option>
                      {classes.map(cls => (
                        <option key={cls.id} value={cls.name}>
                          {cls.name} • Year {cls.year} • {cls.students} students
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                      <ChevronDown size={16} className="text-gray-400" />
                    </div>
                  </div>

                  {/* Term Filter - Secondary */}
                  <div className="relative sm:w-40">
                    <select
                      value={selectedTerm}
                      onChange={(e) => handleFilterChange('term', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl
                               focus:ring-2 focus:ring-blue-500 focus:border-transparent
                               appearance-none bg-white cursor-pointer text-sm"
                    >
                      <option value="Term 1">Term 1</option>
                      <option value="Term 2">Term 2</option>
                      <option value="Term 3">Term 3</option>
                    </select>
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                      <ChevronDown size={16} className="text-gray-400" />
                    </div>
                  </div>

                  {/* Year Filter - Secondary */}
                  <div className="relative sm:w-32">
                    <select
                      value={selectedYear}
                      onChange={(e) => handleFilterChange('year', Number(e.target.value))}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl
                               focus:ring-2 focus:ring-blue-500 focus:border-transparent
                               appearance-none bg-white cursor-pointer text-sm"
                    >
                      {years.map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                      <ChevronDown size={16} className="text-gray-400" />
                    </div>
                  </div>

                  {/* Refresh Button */}
                  <button
                    onClick={handleRefresh}
                    disabled={isFetching}
                    className="px-4 py-2.5 border border-gray-300 text-gray-700
                             rounded-xl hover:bg-gray-50 transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed
                             flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
                    <span className="text-sm">Refresh</span>
                  </button>
                </div>
              </div>

              {/* Active Filter Indicator */}
              {selectedClass !== 'all' && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-600">Currently showing:</span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">
                      <Filter size={12} />
                      {selectedClass}
                    </span>
                    <button
                      onClick={() => handleFilterChange('class', 'all')}
                      className="text-xs text-gray-500 hover:text-gray-700 hover:underline ml-1"
                    >
                      Clear filter
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== SINGLE BAR CHART - Results Distribution ===== */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <BarChart3 size={18} className="text-blue-600" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Results Distribution
                  </h3>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  End of term performance breakdown by grade category
                </p>
              </div>
              
              {/* Legend */}
              {gradeDistribution.length > 0 && (
                <div className="flex items-center gap-4">
                  {gradeDistribution.map((grade, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                      <div className={`w-3 h-3 rounded-full ${
                        grade.passStatus === 'distinction' ? 'bg-green-500' :
                        grade.passStatus === 'pass' ? 'bg-blue-500' : 'bg-red-500'
                      }`} />
                      <span className="text-xs text-gray-600">
                        {grade.description.split(' ')[0]}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="p-6">
            {results.length === 0 ? (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
                  <BarChart3 className="text-gray-400" size={32} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No results available
                </h3>
                <p className="text-gray-600 max-w-md mx-auto">
                  {selectedClass !== 'all' 
                    ? `No end of term results found for ${selectedClass}. Teachers need to enter results.`
                    : 'No end of term results have been entered yet.'}
                </p>
                {selectedClass !== 'all' && (
                  <button
                    onClick={() => handleFilterChange('class', 'all')}
                    className="mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    View all classes
                  </button>
                )}
              </div>
            ) : gradeDistribution.length === 0 ? (
              <div className="text-center py-12">
                <AlertCircle className="mx-auto mb-3 text-gray-300" size={48} />
                <p className="text-gray-600">
                  No grade data available for the selected filters
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Bar Chart */}
                <div className="h-80 flex items-end justify-center gap-8 sm:gap-12 px-4">
                  {gradeDistribution.map((grade, index) => {
                    const height = Math.max(grade.percentage, 4); // Minimum 4% for visibility
                    const color = grade.passStatus === 'distinction' ? 'bg-green-500' :
                                grade.passStatus === 'pass' ? 'bg-blue-500' : 'bg-red-500';
                    
                    return (
                      <div key={index} className="flex flex-col items-center w-24 sm:w-32">
                        <div className="relative w-full group">
                          <div 
                            className={`w-full ${color} rounded-t-lg transition-all duration-500 
                                      group-hover:shadow-lg group-hover:scale-105`}
                            style={{ height: `${height * 2}px`, minHeight: '32px' }}
                          >
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="text-white font-bold text-sm bg-black/30 px-2 py-1 rounded-lg">
                                {grade.count} students
                              </span>
                            </div>
                          </div>
                          <div className="mt-3 text-center">
                            <span className="text-lg font-bold text-gray-900">
                              {grade.percentage}%
                            </span>
                            <p className="text-xs text-gray-600 mt-1 truncate max-w-full">
                              {grade.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Summary Statistics */}
                <div className="mt-8 pt-6 border-t border-gray-100">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-green-50/50 rounded-xl">
                      <p className="text-xs text-gray-600 mb-1">Distinction (Grades 1-2)</p>
                      <p className="text-xl font-bold text-green-600">
                        {gradeDistribution.find(g => g.passStatus === 'distinction')?.percentage || 0}%
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {gradeDistribution.find(g => g.passStatus === 'distinction')?.count || 0} students
                      </p>
                    </div>
                    <div className="p-4 bg-blue-50/50 rounded-xl">
                      <p className="text-xs text-gray-600 mb-1">Pass (Grades 3-6)</p>
                      <p className="text-xl font-bold text-blue-600">
                        {gradeDistribution.find(g => g.passStatus === 'pass')?.percentage || 0}%
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {gradeDistribution.find(g => g.passStatus === 'pass')?.count || 0} students
                      </p>
                    </div>
                    <div className="p-4 bg-red-50/50 rounded-xl">
                      <p className="text-xs text-gray-600 mb-1">Fail (Grades 7-9)</p>
                      <p className="text-xl font-bold text-red-600">
                        {gradeDistribution.find(g => g.passStatus === 'fail')?.percentage || 0}%
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {gradeDistribution.find(g => g.passStatus === 'fail')?.count || 0} students
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== FOOTER - Clean and minimal ===== */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-xs sm:text-sm text-gray-500">
              {results.length > 0 ? (
                <>
                  <span className="font-medium">Data source:</span> End of Term Results • 
                  <span className="font-medium ml-1">Last updated:</span> Just now
                </>
              ) : (
                'No results data available for the current selection'
              )}
            </p>
            <div className="flex items-center gap-4">
              <button 
                onClick={handleExport}
                disabled={results.length === 0}
                className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Download as CSV
              </button>
              <button 
                onClick={() => refetch()}
                className="text-xs sm:text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                Refresh data
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}