import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { Users, BookOpen, GraduationCap, TrendingUp, Plus, ChevronRight, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

// ===== Skeleton Loaders =====
const MetricSkeleton = () => (
  <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5 animate-pulse">
    <div className="flex items-start justify-between">
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-gray-200 rounded w-20 sm:w-24"></div>
        <div className="h-6 sm:h-8 bg-gray-300 rounded w-12 sm:w-16"></div>
      </div>
      <div className="p-1.5 sm:p-2 bg-gray-100 rounded-lg">
        <div className="w-4 h-4 sm:w-5 sm:h-5 bg-gray-300 rounded"></div>
      </div>
    </div>
    <div className="h-2 sm:h-3 bg-gray-200 rounded w-28 sm:w-32 mt-3 sm:mt-4"></div>
  </div>
);

const ActionButtonSkeleton = () => (
  <div className="p-2 sm:p-4 bg-white border border-gray-200 rounded-xl animate-pulse">
    <div className="flex flex-col items-center text-center gap-1 sm:gap-2">
      <div className="p-1.5 sm:p-3 bg-gray-100 rounded-lg">
        <div className="w-4 h-4 sm:w-6 sm:h-6 bg-gray-300 rounded"></div>
      </div>
      <div className="w-full space-y-1">
        <div className="h-3 bg-gray-200 rounded w-16 sm:w-20 mx-auto"></div>
        <div className="h-2 bg-gray-100 rounded w-20 sm:w-24 mx-auto"></div>
      </div>
    </div>
  </div>
);

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // State for loading and refresh
  const [initialLoad, setInitialLoad] = useState(true);
  const [lastLoadTime, setLastLoadTime] = useState<number>(Date.now());

  // Use dashboard stats hook
  const { stats, isLoading: statsLoading, refreshStats } = useDashboardStats();

  // Combined loading state
  const isLoading = initialLoad && statsLoading;

  // Quick actions configuration - exactly 3 actions, 1 row
  const quickActions = [
    {
      id: 'create-class',
      title: 'Create Class',
      description: 'Add a new class',
      icon: Plus,
      color: 'blue',
      onClick: () => navigate('/dashboard/admin/classes?action=create')
    },
    {
      id: 'student-enrollment',
      title: 'Enroll Students',
      description: 'Add new students',
      icon: GraduationCap,
      color: 'green',
      onClick: () => navigate('/dashboard/admin/classes?action=enroll')
    },
    {
      id: 'generate-report-cards',
      title: 'Generate Report Cards',
      description: 'Create and print',
      icon: FileText,
      color: 'indigo',
      onClick: () => navigate('/dashboard/admin/report-cards')
    },
  ];

  // Metric cards configuration - exactly 4 cards, 2x2 matrix
  const metricConfigs = [
    {
      key: 'totalClasses',
      label: 'Total Classes',
      icon: BookOpen,
      color: 'blue',
      description: 'Active classes',
      value: stats?.totalClasses || 0,
    },
    {
      key: 'totalTeachers',
      label: 'Total Teachers',
      icon: Users,
      color: 'purple',
      description: 'Teaching staff',
      value: stats?.totalTeachers || 0,
    },
    {
      key: 'totalStudents',
      label: 'Total Students',
      icon: GraduationCap,
      color: 'green',
      description: 'Enrolled learners',
      value: stats?.totalStudents || 0,
    },
    {
      key: 'averageClassSize',
      label: 'Avg Class Size',
      icon: TrendingUp,
      color: 'amber',
      description: 'Students per class',
      value: stats?.averageClassSize || 0,
      format: (value: number) => value.toFixed(1),
    },
  ];

  // Manual refresh handler
  const handleManualRefresh = async () => {
    setInitialLoad(true);
    setLastLoadTime(Date.now());
    await refreshStats();
    setInitialLoad(false);
  };

  // Update initial load state when data arrives
  useEffect(() => {
    if (!isLoading && initialLoad) {
      setInitialLoad(false);
      setLastLoadTime(Date.now());
    }
  }, [isLoading, initialLoad]);

  return (
    <DashboardLayout activeTab="dashboard">
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        {/* ===== Header Section ===== */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl lg:text-4xl">
                Admin Dashboard
              </h1>
              <p className="text-gray-600 mt-2 text-sm sm:text-base">
                Welcome back, {user?.name || 'Admin'}! Here's your school overview.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs sm:text-sm text-gray-500 bg-white px-3 py-2 rounded-lg border border-gray-200">
                Last updated: {new Date(lastLoadTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <button
                onClick={handleManualRefresh}
                className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 font-medium bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg transition-colors"
              >
                Refresh Data
              </button>
            </div>
          </div>
        </div>

        {/* ===== Key Metrics Section - Fixed 2x2 Matrix ===== */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 sm:text-xl">
            Key Metrics
          </h2>
          
          {/* Grid: Always 2 columns, responsive gap and padding */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {isLoading ? (
              // Show 4 skeleton loaders
              Array(4).fill(0).map((_, i) => <MetricSkeleton key={i} />)
            ) : (
              // Render actual metric cards
              metricConfigs.map((metric) => {
                const Icon = metric.icon;
                const displayValue = metric.format ? metric.format(metric.value) : metric.value;
                const color = metric.color;

                // Color classes - preserved exactly from original
                const bgColorClass = {
                  blue: 'bg-blue-50 text-blue-600',
                  purple: 'bg-purple-50 text-purple-600',
                  green: 'bg-green-50 text-green-600',
                  amber: 'bg-amber-50 text-amber-600',
                }[color];

                return (
                  <div
                    key={metric.key}
                    className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5 hover:shadow-lg transition-all duration-300 hover:border-gray-300 group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-600 font-medium text-xs sm:text-sm">
                          {metric.label}
                        </p>
                        <p className="text-2xl font-bold text-gray-900 mt-1 sm:text-3xl">
                          {displayValue}
                        </p>
                      </div>
                      <div className={`p-1.5 sm:p-2 rounded-lg group-hover:scale-110 transition-transform ${bgColorClass}`}>
                        <Icon size={16} className="sm:w-5 sm:h-5" />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2 sm:mt-3 truncate">
                      {metric.description}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ===== Quick Actions Section - Fixed 1x3 Row ===== */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 sm:text-xl">
              Quick Actions
            </h2>
            <button
              className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              onClick={() => navigate('/dashboard/admin/classes')}
            >
              View all <ChevronRight size={16} />
            </button>
          </div>

          {/* Grid: Always 3 columns, responsive gap and padding */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {isLoading ? (
              // Show 3 skeleton loaders
              Array(3).fill(0).map((_, i) => <ActionButtonSkeleton key={i} />)
            ) : (
              // Render actual quick action buttons
              quickActions.map((action) => {
                const Icon = action.icon;
                const color = action.color;

                // Border hover colors - preserved from original
                const borderHoverClass = {
                  blue: 'hover:border-blue-400',
                  green: 'hover:border-green-400',
                  indigo: 'hover:border-indigo-400',
                }[color];

                // Background hover colors - preserved from original
                const bgHoverClass = {
                  blue: 'hover:bg-blue-50',
                  green: 'hover:bg-green-50',
                  indigo: 'hover:bg-indigo-50',
                }[color];

                // Icon background colors - preserved from original
                const bgIconClass = {
                  blue: 'bg-blue-50 text-blue-600',
                  green: 'bg-green-50 text-green-600',
                  indigo: 'bg-indigo-50 text-indigo-600',
                }[color];

                return (
                  <button
                    key={action.id}
                    onClick={action.onClick}
                    className={`
                      p-2 sm:p-4 bg-white border border-gray-200 rounded-xl
                      hover:shadow-lg transition-all duration-200 active:scale-[0.98]
                      focus:outline-none focus:ring-2 focus:ring-offset-2
                      focus:ring-blue-500 focus:ring-offset-white
                      ${borderHoverClass} ${bgHoverClass}
                      w-full text-left
                    `}
                  >
                    <div className="flex flex-col items-center text-center gap-1 sm:gap-2">
                      <div className={`p-1.5 sm:p-3 rounded-lg ${bgIconClass}`}>
                        <Icon size={16} className="sm:w-6 sm:h-6" />
                      </div>
                      <div className="w-full min-w-0">
                        <p className="font-semibold text-gray-900 text-xs sm:text-sm truncate">
                          {action.title}
                        </p>
                        <p className="text-gray-500 text-[0.65rem] sm:text-xs leading-tight truncate">
                          {action.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>        
      </div>
    </DashboardLayout>
  );
}