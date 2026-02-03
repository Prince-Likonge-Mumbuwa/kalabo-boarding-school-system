import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { BookOpen, Users, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import { useState } from 'react';

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [stats] = useState({
    classesHandled: 4,
    totalStudents: 128,
    averagePassRate: 82.3,
    subjects: user?.subjects || ['Mathematics', 'Physics'],
    classMetrics: [
      { name: 'Form 4A', students: 35, passRate: 85 },
      { name: 'Form 4B', students: 32, passRate: 80 },
      { name: 'Form 3A', students: 30, passRate: 81 },
      { name: 'Form 3B', students: 31, passRate: 82 },
    ],
  });

  return (
    <DashboardLayout activeTab="dashboard">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Teacher Dashboard</h1>
          <p className="text-gray-600 mt-2">Welcome back, {user?.name}! Here's your class overview.</p>
        </div>

        {/* Subject Tags */}
        <div>
          <p className="text-sm font-medium text-gray-600 mb-3">Teaching Subjects</p>
          <div className="flex flex-wrap gap-2">
            {stats.subjects.map((subject, idx) => (
              <span
                key={idx}
                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-full font-medium text-sm"
              >
                {subject}
              </span>
            ))}
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Classes Handled */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 font-medium text-sm">Classes Handled</p>
                <p className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">{stats.classesHandled}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg text-blue-600">
                <BookOpen size={24} />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-4">Classes you teach</p>
          </div>

          {/* Total Students */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 font-medium text-sm">Total Students</p>
                <p className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">{stats.totalStudents}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg text-purple-600">
                <Users size={24} />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-4">Across all classes</p>
          </div>

          {/* Average Pass Rate */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 font-medium text-sm">Average Pass Rate</p>
                <p className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">{stats.averagePassRate}%</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg text-green-600">
                <TrendingUp size={24} />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-4">Class average</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button className="p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all text-left group">
              <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">Enter Results</p>
              <p className="text-sm text-gray-500 mt-1">Record student grades</p>
            </button>
            <button className="p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all text-left group">
              <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">Track Attendance</p>
              <p className="text-sm text-gray-500 mt-1">Mark attendance</p>
            </button>
            <button className="p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all text-left group">
              <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">View Analysis</p>
              <p className="text-sm text-gray-500 mt-1">Performance insights</p>
            </button>
            <button className="p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all text-left group">
              <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">Class Reports</p>
              <p className="text-sm text-gray-500 mt-1">Generate reports</p>
            </button>
          </div>
        </div>

        {/* Classes Overview */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Your Classes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats.classMetrics.map((classItem, idx) => (
              <div key={idx} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="font-bold text-gray-900">{classItem.name}</h3>
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                    {classItem.passRate}%
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Users size={16} />
                    <span className="text-sm">{classItem.students} students</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${classItem.passRate}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
