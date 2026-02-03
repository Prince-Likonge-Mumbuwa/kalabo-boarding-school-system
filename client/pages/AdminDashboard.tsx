import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { Users, BookOpen, GraduationCap, TrendingUp, AlertCircle } from 'lucide-react';
import { useState } from 'react';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats] = useState({
    totalClasses: 24,
    totalTeachers: 32,
    totalStudents: 856,
    averagePassRate: 78.5,
    recentActivities: [
      { id: 1, type: 'class_created', message: 'Form 4A class created', time: '2 hours ago' },
      { id: 2, type: 'teacher_added', message: 'Mr. Banda added to Mathematics dept', time: '5 hours ago' },
      { id: 3, type: 'results_entered', message: 'Results entered for Form 3B', time: '1 day ago' },
    ],
  });

  return (
    <DashboardLayout activeTab="dashboard">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600 mt-2">Welcome back, {user?.name}! Here's your school overview.</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Total Classes */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 font-medium text-sm">Total Classes</p>
                <p className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">{stats.totalClasses}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg text-blue-600">
                <BookOpen size={24} />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-4">Active classes in school</p>
          </div>

          {/* Total Teachers */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 font-medium text-sm">Total Teachers</p>
                <p className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">{stats.totalTeachers}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg text-purple-600">
                <Users size={24} />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-4">Teaching staff members</p>
          </div>

          {/* Total Students */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 font-medium text-sm">Total Students</p>
                <p className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">{stats.totalStudents}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg text-green-600">
                <GraduationCap size={24} />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-4">Enrolled learners</p>
          </div>

          {/* Average Pass Rate */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 font-medium text-sm">Average Pass Rate</p>
                <p className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">{stats.averagePassRate}%</p>
              </div>
              <div className="p-3 bg-amber-100 rounded-lg text-amber-600">
                <TrendingUp size={24} />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-4">Across all classes</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <button className="p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all text-left group">
              <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">Create Class</p>
              <p className="text-sm text-gray-500 mt-1">Add a new class</p>
            </button>
            <button className="p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all text-left group">
              <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">Add Teacher</p>
              <p className="text-sm text-gray-500 mt-1">Register new teacher</p>
            </button>
            <button className="p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all text-left group">
              <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">Upload Results</p>
              <p className="text-sm text-gray-500 mt-1">Bulk results entry</p>
            </button>
            <button className="p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all text-left group">
              <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">View Reports</p>
              <p className="text-sm text-gray-500 mt-1">Analyze performance</p>
            </button>
            <button className="p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all text-left group">
              <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">Settings</p>
              <p className="text-sm text-gray-500 mt-1">School configuration</p>
            </button>
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Activity</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="divide-y divide-gray-200">
              {stats.recentActivities.map((activity) => (
                <div key={activity.id} className="p-4 hover:bg-gray-50 transition-colors flex items-start gap-4">
                  <div className="p-2 bg-blue-100 rounded-lg text-blue-600 flex-shrink-0 mt-1">
                    <AlertCircle size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{activity.message}</p>
                    <p className="text-xs text-gray-500 mt-1">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
