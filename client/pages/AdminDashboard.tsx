// @/pages/AdminDashboard.tsx - OPTIMIZED FOR MOBILE RESPONSIVENESS
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useResultsAnalytics } from '@/hooks/useResults';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Users, BookOpen, GraduationCap, TrendingUp, Plus, BarChart3, FileText, ChevronRight, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

// ===== Skeleton Loaders - Optimized for mobile =====
const MetricSkeleton = () => (
  <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 animate-pulse">
    <div className="flex items-start justify-between">
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-gray-200 rounded w-16 sm:w-24"></div>
        <div className="h-7 sm:h-8 bg-gray-300 rounded w-12 sm:w-16"></div>
      </div>
      <div className="p-2 sm:p-2.5 bg-gray-100 rounded-lg">
        <div className="w-5 h-5 sm:w-6 sm:h-6 bg-gray-300 rounded"></div>
      </div>
    </div>
    <div className="h-2 bg-gray-200 rounded w-20 sm:w-32 mt-3 sm:mt-4"></div>
  </div>
);

const ActionButtonSkeleton = () => (
  <div className="p-3 sm:p-4 bg-white border border-gray-200 rounded-xl animate-pulse">
    <div className="flex flex-col items-center text-center gap-2 sm:gap-3">
      <div className="p-2 sm:p-3 bg-gray-100 rounded-lg">
        <div className="w-5 h-5 sm:w-6 sm:h-6 bg-gray-300 rounded"></div>
      </div>
      <div className="w-full space-y-1.5">
        <div className="h-3 bg-gray-200 rounded w-14 sm:w-20 mx-auto"></div>
        <div className="h-2 bg-gray-100 rounded w-16 sm:w-24 mx-auto"></div>
      </div>
    </div>
  </div>
);

// ===== Metric Card Component - Fluid sizing =====
const MetricCard = ({ 
  label, 
  value, 
  icon: Icon, 
  description, 
  color,
  isLoading 
}: { 
  label: string;
  value: string | number;
  icon: React.ElementType;
  description: string;
  color: 'blue' | 'purple' | 'green' | 'amber';
  isLoading?: boolean;
}) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  const colorClasses = {
    blue: {
      bg: 'bg-gradient-to-br from-blue-50 to-indigo-50',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      valueColor: 'text-blue-600',
      border: 'border-blue-200',
      hover: 'hover:border-blue-300'
    },
    purple: {
      bg: 'bg-gradient-to-br from-purple-50 to-pink-50',
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
      valueColor: 'text-purple-600',
      border: 'border-purple-200',
      hover: 'hover:border-purple-300'
    },
    green: {
      bg: 'bg-gradient-to-br from-green-50 to-emerald-50',
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      valueColor: 'text-green-600',
      border: 'border-green-200',
      hover: 'hover:border-green-300'
    },
    amber: {
      bg: 'bg-gradient-to-br from-amber-50 to-orange-50',
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      valueColor: 'text-amber-600',
      border: 'border-amber-200',
      hover: 'hover:border-amber-300'
    }
  };

  const style = colorClasses[color];

  return (
    <div className={`
      bg-white rounded-xl border border-gray-200 p-4 sm:p-5
      hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5
      ${style.hover} h-full flex flex-col
    `}>
      <div className="flex items-start justify-between flex-1">
        <div className="flex-1 min-w-0 pr-2">
          <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1 truncate">
            {label}
          </p>
          {isLoading ? (
            <div className="h-7 sm:h-8 w-16 bg-gray-200 rounded animate-pulse mt-1"></div>
          ) : (
            <p className={`text-2xl sm:text-3xl lg:text-4xl font-bold ${style.valueColor} truncate`}>
              {value}
            </p>
          )}
        </div>
        <div className={`
          p-2 sm:p-2.5 rounded-lg flex-shrink-0
          ${style.iconBg} ${style.iconColor}
        `}>
          <Icon size={isMobile ? 18 : 20} />
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2 sm:mt-3 truncate">
        {description}
      </p>
    </div>
  );
};

// ===== Quick Action Button - Fluid sizing =====
const QuickActionButton = ({ 
  onClick, 
  icon: Icon, 
  title, 
  description, 
  color 
}: { 
  onClick: () => void;
  icon: React.ElementType;
  title: string;
  description: string;
  color: 'blue' | 'green' | 'indigo';
}) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  const colorClasses = {
    blue: {
      borderHover: 'hover:border-blue-400',
      bgHover: 'hover:bg-blue-50',
      iconBg: 'bg-blue-50 text-blue-600',
      ring: 'focus:ring-blue-500'
    },
    green: {
      borderHover: 'hover:border-green-400',
      bgHover: 'hover:bg-green-50',
      iconBg: 'bg-green-50 text-green-600',
      ring: 'focus:ring-green-500'
    },
    indigo: {
      borderHover: 'hover:border-indigo-400',
      bgHover: 'hover:bg-indigo-50',
      iconBg: 'bg-indigo-50 text-indigo-600',
      ring: 'focus:ring-indigo-500'
    }
  };

  const style = colorClasses[color];

  return (
    <button
      onClick={onClick}
      className={`
        p-3 sm:p-5 bg-white border border-gray-200 rounded-xl
        hover:shadow-lg transition-all duration-200 active:scale-[0.98]
        focus:outline-none focus:ring-2 focus:ring-offset-2 ${style.ring} focus:ring-offset-white
        ${style.borderHover} ${style.bgHover}
        w-full h-full flex flex-col items-center justify-center
      `}
    >
      <div className={`p-2 sm:p-3 rounded-lg ${style.iconBg} mb-2 sm:mb-3`}>
        <Icon size={isMobile ? 20 : 24} />
      </div>
      <div className="w-full text-center">
        <p className="font-semibold text-gray-900 text-sm sm:text-base mb-0.5 sm:mb-1">
          {title}
        </p>
        <p className="text-gray-500 text-xs sm:text-sm leading-tight">
          {description}
        </p>
      </div>
    </button>
  );
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isTablet = useMediaQuery('(min-width: 641px) and (max-width: 1024px)');

  // State for loading and refresh
  const [initialLoad, setInitialLoad] = useState(true);
  const [lastLoadTime, setLastLoadTime] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Use dashboard stats hook for classes, teachers, learners
  const { stats, isLoading: statsLoading, refreshStats } = useDashboardStats();

  // Use results analytics for school-wide pass rate
  const currentYear = new Date().getFullYear();
  const { 
    analytics, 
    isLoading: analyticsLoading,
    refetch: refetchAnalytics
  } = useResultsAnalytics({
    term: 'Term 1',
    year: currentYear,
  });

  // Combined loading state
  const isLoading = initialLoad && (statsLoading || analyticsLoading);

  // Quick actions configuration
  const quickActions = [
    {
      id: 'create-class',
      title: 'Create Class',
      description: 'Add new class',
      icon: Plus,
      color: 'blue' as const,
      onClick: () => navigate('/dashboard/admin/classes?action=create')
    },
    {
      id: 'view-analyses',
      title: 'View Analyses',
      description: 'School performance',
      icon: BarChart3,
      color: 'green' as const,
      onClick: () => navigate('/dashboard/admin/results-analysis')
    },
    {
      id: 'generate-reports',
      title: 'Generate Reports',
      description: 'Report cards',
      icon: FileText,
      color: 'indigo' as const,
      onClick: () => navigate('/dashboard/admin/report-cards')
    },
  ];

  // Metric cards configuration
  const metricConfigs = [
    {
      key: 'totalClasses',
      label: 'Total Classes',
      icon: BookOpen,
      color: 'blue' as const,
      description: 'Active classes',
      value: stats?.totalClasses || 0,
    },
    {
      key: 'totalTeachers',
      label: 'Total Teachers',
      icon: Users,
      color: 'purple' as const,
      description: 'Teaching staff',
      value: stats?.totalTeachers || 0,
    },
    {
      key: 'totalStudents',
      label: 'Total Learners',
      icon: GraduationCap,
      color: 'green' as const,
      description: 'Enrolled students',
      value: stats?.totalStudents || 0,
    },
    {
      key: 'passRate',
      label: 'Pass Rate',
      icon: TrendingUp,
      color: 'amber' as const,
      description: 'School-wide performance',
      value: analytics?.passRate ? `${analytics.passRate}%` : '—',
    },
  ];

  // Manual refresh handler
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setLastLoadTime(new Date());
    
    await Promise.all([
      refreshStats(),
      refetchAnalytics()
    ]);
    
    setIsRefreshing(false);
  };

  // Update initial load state when data arrives
  useEffect(() => {
    if (!isLoading && initialLoad) {
      setInitialLoad(false);
    }
  }, [isLoading, initialLoad]);

  // Determine grid columns based on screen size
  const metricGridCols = isMobile ? 'grid-cols-2' : (isTablet ? 'grid-cols-2' : 'grid-cols-4');
  const actionGridCols = 'grid-cols-3'; // Always 3 columns for actions

  return (
    <DashboardLayout activeTab="dashboard">
      <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6 lg:p-8">
        {/* ===== Header Section - Fluid spacing ===== */}
        <div className="mb-4 sm:mb-6 md:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight break-words">
                Admin Dashboard
              </h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2 break-words">
                Welcome back, {user?.name?.split(' ')[0] || 'Admin'}!
              </p>
            </div>
            
            {/* Last updated and refresh - Stack on mobile */}
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <div className="text-xs sm:text-sm text-gray-500 bg-white px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg border border-gray-200 whitespace-nowrap">
                {isMobile ? 'Updated: ' : 'Last updated: '}
                {lastLoadTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className={`
                  inline-flex items-center justify-center gap-1.5 sm:gap-2
                  text-xs sm:text-sm text-blue-600 hover:text-blue-800 font-medium 
                  bg-blue-50 hover:bg-blue-100 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg 
                  transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                <RefreshCw size={isMobile ? 14 : 16} className={isRefreshing ? 'animate-spin' : ''} />
                <span className={isMobile ? 'sr-only' : ''}>
                  {isRefreshing ? 'Refreshing...' : 'Refresh'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* ===== Key Metrics Section - Fluid grid ===== */}
        <div className="mb-6 sm:mb-8 md:mb-10">
          <h2 className="text-base sm:text-lg md:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">
            Key Metrics
          </h2>
          
          {/* Responsive grid - 2 columns on mobile, 4 on desktop */}
          <div className={`grid ${metricGridCols} gap-2 sm:gap-3 md:gap-4`}>
            {isLoading ? (
              // Show skeleton loaders
              Array(4).fill(0).map((_, i) => <MetricSkeleton key={i} />)
            ) : (
              // Render actual metric cards
              metricConfigs.map((metric) => (
                <MetricCard
                  key={metric.key}
                  label={metric.label}
                  value={metric.value}
                  icon={metric.icon}
                  description={metric.description}
                  color={metric.color}
                />
              ))
            )}
          </div>
        </div>

        {/* ===== Quick Actions Section - Fluid grid ===== */}
        <div>
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg md:text-xl font-semibold text-gray-900">
              Quick Actions
            </h2>
            <button
              className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
              onClick={() => navigate('/dashboard/admin/classes')}
            >
              <span>View all</span>
              <ChevronRight size={isMobile ? 14 : 16} />
            </button>
          </div>

          {/* Always 3 columns, but adjust gap based on screen size */}
          <div className={`grid ${actionGridCols} gap-2 sm:gap-3 md:gap-4`}>
            {isLoading ? (
              // Show skeleton loaders
              Array(3).fill(0).map((_, i) => <ActionButtonSkeleton key={i} />)
            ) : (
              // Render actual quick action buttons
              quickActions.map((action) => (
                <QuickActionButton
                  key={action.id}
                  onClick={action.onClick}
                  icon={action.icon}
                  title={action.title}
                  description={action.description}
                  color={action.color}
                />
              ))
            )}
          </div>
        </div>

        {/* ===== Footer note - Optional ===== */}
        <div className="mt-6 sm:mt-8 md:mt-10 pt-4 sm:pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center sm:text-left">
            Data updates automatically every 5 minutes. Last full sync: {lastLoadTime.toLocaleString()}
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}