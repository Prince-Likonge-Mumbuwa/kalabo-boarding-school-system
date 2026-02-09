import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { BookOpen, Users, TrendingUp, AlertCircle, Loader2, Calendar } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';

export default function TeacherDashboard() {
  const { user } = useAuth();
  
  // Fetch all active classes
  const { 
    classes, 
    isLoading: classesLoading 
  } = useSchoolClasses({ isActive: true });

  // Find classes assigned to this teacher
  const assignedClasses = useMemo(() => {
    if (!user?.id || !classes.length) return [];
    
    // Filter classes where this teacher is in the teachers array
    return classes.filter(cls => 
      cls.teachers?.includes(user.id) || 
      cls.formTeacherId === user.id
    );
  }, [classes, user?.id]);

  // Get form teacher class (if any)
  const formTeacherClass = useMemo(() => {
    return assignedClasses.find(cls => cls.formTeacherId === user?.id);
  }, [assignedClasses, user?.id]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalStudents = assignedClasses.reduce((sum, cls) => sum + (cls.students || 0), 0);
    
    return {
      classesHandled: assignedClasses.length,
      totalStudents,
      subjects: user?.subjects || [],
      isFormTeacher: !!formTeacherClass,
      formClassName: formTeacherClass?.name,
    };
  }, [assignedClasses, user?.subjects, formTeacherClass]);

  // Loading state
  if (classesLoading) {
    return (
      <DashboardLayout activeTab="dashboard">
        <div className="p-8 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="animate-spin text-blue-600 mx-auto mb-4" size={48} />
            <p className="text-gray-600">Loading your dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="dashboard">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Teacher Dashboard</h1>
          <p className="text-gray-600 mt-2">
            Welcome back, {user?.name}! 
            {stats.isFormTeacher && (
              <span className="ml-1 font-medium text-blue-600">
                (Form Teacher of {stats.formClassName})
              </span>
            )}
          </p>
        </div>

        {/* Assignment Status Alert */}
        {assignedClasses.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <h3 className="font-semibold text-yellow-900">No Classes Assigned Yet</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  You haven't been assigned to any classes yet. Please contact your administrator to get assigned to classes.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Subject Tags */}
        {stats.subjects.length > 0 && (
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
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Classes Handled */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 font-medium text-sm">Classes Assigned</p>
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
            <p className="text-xs text-gray-500 mt-4">Across all your classes</p>
          </div>

          {/* Form Teacher Status */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 font-medium text-sm">Form Teacher</p>
                <p className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">
                  {stats.isFormTeacher ? 'Yes' : 'No'}
                </p>
              </div>
              <div className={`p-3 rounded-lg ${
                stats.isFormTeacher ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
              }`}>
                <TrendingUp size={24} />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              {stats.isFormTeacher ? stats.formClassName : 'Not assigned as form teacher'}
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link 
              to="/dashboard/teacher/results-entry"
              className={`p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all text-left group ${
                assignedClasses.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              onClick={(e) => assignedClasses.length === 0 && e.preventDefault()}
            >
              <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                Enter Results
              </p>
              <p className="text-sm text-gray-500 mt-1">Record student grades</p>
            </Link>
            
            <Link 
              to="/dashboard/teacher/attendance"
              className={`p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all text-left group ${
                assignedClasses.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              onClick={(e) => assignedClasses.length === 0 && e.preventDefault()}
            >
              <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                Track Attendance
              </p>
              <p className="text-sm text-gray-500 mt-1">Mark attendance</p>
            </Link>
            
            <Link 
              to="/dashboard/teacher/results-analysis"
              className={`p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all text-left group ${
                assignedClasses.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              onClick={(e) => assignedClasses.length === 0 && e.preventDefault()}
            >
              <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                View Analysis
              </p>
              <p className="text-sm text-gray-500 mt-1">Performance insights</p>
            </Link>
            
            <button 
              className="p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={assignedClasses.length === 0}
            >
              <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                Class Reports
              </p>
              <p className="text-sm text-gray-500 mt-1">Generate reports</p>
            </button>
          </div>
        </div>

        {/* Classes Overview */}
        {assignedClasses.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Your Classes</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assignedClasses.map((classItem) => (
                <div 
                  key={classItem.id} 
                  className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg">{classItem.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm text-gray-600">Year: {classItem.year}</span>
                        {classItem.formTeacherId === user?.id && (
                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                            Form Teacher
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Users size={16} />
                      <span className="text-sm">{classItem.students} students</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar size={16} />
                      <span className="text-sm">
                        {classItem.type === 'grade' ? 'Grade' : 'Form'} {classItem.level}{classItem.section}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State for Classes */}
        {assignedClasses.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
              <BookOpen className="text-gray-400" size={32} />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Classes Yet</h3>
            <p className="text-gray-600 max-w-md mx-auto">
              You haven't been assigned to any classes. Once an administrator assigns you to classes, they will appear here.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}