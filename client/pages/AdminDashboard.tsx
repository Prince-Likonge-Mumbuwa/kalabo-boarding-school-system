import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useActivity } from '@/hooks/useActivity';
import { Users, BookOpen, GraduationCap, TrendingUp, AlertCircle, Plus, ChevronRight, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

// Skeleton Loading Components
const MetricSkeleton = () => (
  <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
    <div className="flex items-start justify-between">
      <div className="flex-1 space-y-3">
        <div className="h-4 bg-gray-200 rounded w-24"></div>
        <div className="h-10 bg-gray-300 rounded w-16"></div>
      </div>
      <div className="p-3 bg-gray-100 rounded-lg">
        <div className="w-6 h-6 bg-gray-300 rounded"></div>
      </div>
    </div>
    <div className="h-3 bg-gray-200 rounded w-32 mt-4"></div>
  </div>
);

const ActivitySkeleton = () => (
  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm divide-y divide-gray-200">
    {[1, 2, 3].map((id) => (
      <div key={id} className="p-4 hover:bg-gray-50 transition-colors flex items-start gap-4 animate-pulse">
        <div className="p-2 bg-gray-100 rounded-lg flex-shrink-0 mt-1">
          <div className="w-4 h-4 bg-gray-300 rounded"></div>
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-3 bg-gray-100 rounded w-20"></div>
        </div>
      </div>
    ))}
  </div>
);

const ActionButtonSkeleton = () => (
  <div className="p-4 bg-white border border-gray-200 rounded-lg animate-pulse">
    <div className="flex flex-col items-center text-center gap-2">
      <div className="p-3 bg-gray-100 rounded-lg">
        <div className="w-6 h-6 bg-gray-300 rounded"></div>
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-20 mx-auto"></div>
        <div className="h-3 bg-gray-100 rounded w-16 mx-auto"></div>
      </div>
    </div>
  </div>
);

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // State to track initial load
  const [initialLoad, setInitialLoad] = useState(true);
  const [lastLoadTime, setLastLoadTime] = useState<number>(Date.now());
  
  // Use the new unified hooks
  const { stats, isLoading: statsLoading, isError: statsError, refreshStats } = useDashboardStats();
  const { 
    activities: recentActivities, 
    isLoading: activitiesLoading,
    isError: activitiesError,
    refetch: refetchActivities 
  } = useActivity({
    limit: 5,
    showRead: false,
  });
  
  // Calculate loading state
  const isLoading = initialLoad && (statsLoading || activitiesLoading);
  
  // Only three quick actions as requested
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

  const metricConfigs = [
    {
      key: 'totalClasses',
      label: 'Total Classes',
      icon: BookOpen,
      color: 'blue',
      description: 'Active classes in school',
      value: stats?.totalClasses || 0,
    },
    {
      key: 'totalTeachers',
      label: 'Total Teachers',
      icon: Users,
      color: 'purple',
      description: 'Teaching staff members',
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

  // Format activity time
  const formatActivityTime = (timestamp: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    
    return timestamp.toLocaleDateString();
  };

  // Get appropriate icon for activity type
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'class_created':
        return BookOpen;
      case 'teacher_added':
        return Users;
      case 'results_entered':
        return TrendingUp;
      case 'student_enrolled':
        return GraduationCap;
      case 'exam_scheduled':
        return FileText;
      case 'attendance_taken':
        return Users;
      case 'user_logged_in':
        return AlertCircle;
      default:
        return AlertCircle;
    }
  };

  // Get appropriate color for activity type
  const getActivityColor = (type: string) => {
    switch (type) {
      case 'class_created':
        return 'bg-blue-50 text-blue-600';
      case 'teacher_added':
        return 'bg-purple-50 text-purple-600';
      case 'results_entered':
        return 'bg-green-50 text-green-600';
      case 'student_enrolled':
        return 'bg-amber-50 text-amber-600';
      case 'exam_scheduled':
        return 'bg-indigo-50 text-indigo-600';
      case 'attendance_taken':
        return 'bg-pink-50 text-pink-600';
      default:
        return 'bg-gray-50 text-gray-600';
    }
  };

  // Handle manual refresh
  const handleManualRefresh = async () => {
    setInitialLoad(true);
    setLastLoadTime(Date.now());
    await Promise.all([
      refreshStats(),
      refetchActivities()
    ]);
    setInitialLoad(false);
  };

  // Update last load time when data loads successfully
  useEffect(() => {
    if (!isLoading && initialLoad) {
      setInitialLoad(false);
      setLastLoadTime(Date.now());
    }
  }, [isLoading, initialLoad]);

  // Also check if all data has loaded (even if there are errors)
  useEffect(() => {
    const allLoaded = !statsLoading && !activitiesLoading;
    const hasData = stats || (recentActivities && recentActivities.length > 0);
    
    if (allLoaded && initialLoad) {
      setInitialLoad(false);
      setLastLoadTime(Date.now());
    }
  }, [statsLoading, activitiesLoading, initialLoad]);

  // Debug log to see what's happening
  useEffect(() => {
    console.log('Dashboard loading states:', {
      initialLoad,
      statsLoading,
      activitiesLoading,
      hasStats: !!stats,
      hasActivities: recentActivities?.length > 0
    });
  }, [initialLoad, statsLoading, activitiesLoading, stats, recentActivities]);

  return (
    <DashboardLayout activeTab="dashboard">
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8">
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

        {/* Key Metrics */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 sm:text-xl">Key Metrics</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {isLoading ? (
              Array(4).fill(0).map((_, i) => <MetricSkeleton key={i} />)
            ) : (
              metricConfigs.map((metric) => {
                const Icon = metric.icon;
                const displayValue = metric.format ? metric.format(metric.value) : metric.value;
                const color = metric.color;
                
                return (
                  <div
                    key={metric.key}
                    className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 hover:shadow-lg transition-all duration-300 hover:border-gray-300 group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-gray-600 font-medium text-xs sm:text-sm">
                          {metric.label}
                        </p>
                        <p className="text-2xl font-bold text-gray-900 mt-2 sm:text-3xl lg:text-4xl">
                          {displayValue}
                        </p>
                      </div>
                      <div className={`p-2 sm:p-3 ${color === 'blue' ? 'bg-blue-50 text-blue-600' : 
                                               color === 'purple' ? 'bg-purple-50 text-purple-600' :
                                               color === 'green' ? 'bg-green-50 text-green-600' :
                                               'bg-amber-50 text-amber-600'} rounded-lg group-hover:scale-110 transition-transform`}>
                        <Icon size={20} className="sm:w-6 sm:h-6" />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-3 sm:mt-4 truncate">
                      {metric.description}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Quick Actions - Only 3 buttons */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 sm:text-xl">Quick Actions</h2>
            <button 
              className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              onClick={() => navigate('/dashboard/admin/classes')}
            >
              View all <ChevronRight size={16} />
            </button>
          </div>
          
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:gap-4">
            {isLoading ? (
              Array(3).fill(0).map((_, i) => <ActionButtonSkeleton key={i} />)
            ) : (
              quickActions.map((action) => {
                const Icon = action.icon;
                const color = action.color;
                
                const colorClasses = {
                  blue: 'border-blue-200 hover:border-blue-400 hover:bg-blue-50 focus:ring-blue-500',
                  green: 'border-green-200 hover:border-green-400 hover:bg-green-50 focus:ring-green-500',
                  indigo: 'border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 focus:ring-indigo-500',
                };

                const bgColorClasses = {
                  blue: 'bg-blue-50 text-blue-600',
                  green: 'bg-green-50 text-green-600',
                  indigo: 'bg-indigo-50 text-indigo-600',
                };

                return (
                  <button
                    key={action.id}
                    onClick={action.onClick}
                    className={`
                      p-4 bg-white border rounded-xl hover:shadow-lg transition-all duration-200
                      active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2
                      ${colorClasses[color]}
                      text-left w-full
                    `}
                  >
                    <div className="flex flex-col items-center text-center gap-2">
                      <div className={`p-3 rounded-lg ${bgColorClasses[color]}`}>
                        <Icon size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                          {action.title}
                        </p>
                        <p className="text-gray-500 text-xs sm:text-sm mt-1 truncate">
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

        {/* Recent Activity */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 sm:text-xl">Recent Activity</h2>
            <button 
              onClick={handleManualRefresh}
              className="text-sm text-gray-600 hover:text-gray-900 font-medium"
            >
              Refresh
            </button>
          </div>

          {isLoading ? (
            <ActivitySkeleton />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="divide-y divide-gray-100">
                {!recentActivities || recentActivities.length === 0 ? (
                  <div className="p-8 text-center">
                    <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No recent activities</p>
                    <p className="text-sm text-gray-400 mt-1">Activities will appear here as they happen</p>
                  </div>
                ) : (
                  recentActivities.slice(0, 5).map((activity) => {
                    const Icon = getActivityIcon(activity.type);
                    return (
                      <div
                        key={activity.id}
                        className="p-4 hover:bg-gray-50 transition-colors flex items-start gap-3 sm:gap-4"
                      >
                        <div className={`p-2 rounded-lg flex-shrink-0 mt-1 ${getActivityColor(activity.type)}`}>
                          <Icon size={16} className="sm:w-5 sm:h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm sm:text-base">
                            {activity.message}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-gray-500">
                              {formatActivityTime(activity.timestamp)}
                            </p>
                            <span className="text-xs text-gray-400">•</span>
                            <p className="text-xs text-gray-500">
                              by {activity.userName}
                            </p>
                          </div>
                        </div>
                        {!activity.read && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2 animate-pulse"></div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              
              {recentActivities && recentActivities.length > 5 && (
                <div className="border-t border-gray-100 p-4">
                  <button 
                    className="w-full text-center text-blue-600 hover:text-blue-800 font-medium text-sm"
                    onClick={() => navigate('/dashboard/admin/activities')}
                  >
                    View all activities
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Additional Stats Section - Show even if some data is missing */}
        {!isLoading && stats && (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Department Distribution */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Teachers by Department</h3>
              <div className="space-y-3">
                {stats.teachersByDepartment ? (
                  Object.entries(stats.teachersByDepartment).map(([dept, count]) => (
                    <div key={dept} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{dept}</span>
                      <span className="font-medium text-gray-900">{count} teachers</span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-sm">No department data available</p>
                )}
              </div>
            </div>

            {/* Class Distribution */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Class Overview</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Total Classes</span>
                  <span className="font-medium text-gray-900">{stats.totalClasses}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Total Students</span>
                  <span className="font-medium text-gray-900">{stats.totalStudents}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Average Class Size</span>
                  <span className="font-medium text-gray-900">{stats.averageClassSize.toFixed(1)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Show error messages if any */}
        {(statsError || activitiesError) && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">
              Some data failed to load. Try refreshing the page.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}