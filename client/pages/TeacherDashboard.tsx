import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { BookOpen, Users, TrendingUp, AlertCircle, Loader2, Calendar, ChevronRight, FileText, ClipboardCheck, BarChart3 } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';

// ==================== SKELETON LOADER ====================
const DashboardSkeleton = () => (
  <div className="space-y-8 animate-pulse">
    {/* Header Skeleton */}
    <div>
      <div className="h-8 sm:h-9 lg:h-10 bg-gray-200 rounded w-64 mb-2"></div>
      <div className="h-4 sm:h-5 bg-gray-100 rounded w-72"></div>
    </div>
    
    {/* Metrics Skeleton - 3 cards */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="h-3 bg-gray-200 rounded w-24 mb-2"></div>
              <div className="h-7 sm:h-8 bg-gray-300 rounded w-12"></div>
            </div>
            <div className="p-2 sm:p-3 bg-gray-100 rounded-lg">
              <div className="w-5 h-5 sm:w-6 sm:h-6 bg-gray-300 rounded"></div>
            </div>
          </div>
          <div className="h-2 bg-gray-200 rounded w-32 mt-4"></div>
        </div>
      ))}
    </div>
    
    {/* Quick Actions Skeleton - 3 buttons */}
    <div>
      <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
            <div className="flex flex-col items-center gap-1 sm:gap-2">
              <div className="p-2 sm:p-2.5 bg-gray-100 rounded-lg">
                <div className="w-4 h-4 sm:w-5 sm:h-5 bg-gray-300 rounded"></div>
              </div>
              <div className="w-full space-y-1">
                <div className="h-3 bg-gray-200 rounded w-16 mx-auto"></div>
                <div className="h-2 bg-gray-100 rounded w-20 mx-auto"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ==================== EMPTY STATE - PROFESSIONAL ====================
const EmptyState = () => (
  <div className="bg-white rounded-2xl border border-gray-200 p-8 sm:p-12 text-center max-w-3xl mx-auto shadow-sm">
    <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-full mb-5">
      <BookOpen className="text-blue-500" size={32} />
    </div>
    <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">
      Awaiting Class Assignments
    </h2>
    <p className="text-sm sm:text-base text-gray-600 max-w-md mx-auto leading-relaxed">
      Your teaching assignments are currently being configured by the administration. 
      You'll receive access to your classes and students once the process is complete.
    </p>
    <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
      <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-500 bg-gray-50 px-4 py-2.5 rounded-lg border border-gray-200">
        <AlertCircle size={16} className="text-gray-400" />
        <span>Contact admin for updates</span>
      </div>
    </div>
  </div>
);

// ==================== METRIC CARD ====================
interface MetricCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  description: string;
  color: 'blue' | 'purple' | 'green';
  trend?: string;
}

const MetricCard = ({ label, value, icon: Icon, description, color, trend }: MetricCardProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  const colorStyles = {
    blue: {
      bg: 'bg-gradient-to-br from-blue-50 to-indigo-50',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      value: 'text-blue-600',
      border: 'border-blue-200',
      hover: 'hover:border-blue-300'
    },
    purple: {
      bg: 'bg-gradient-to-br from-purple-50 to-pink-50',
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
      value: 'text-purple-600',
      border: 'border-purple-200',
      hover: 'hover:border-purple-300'
    },
    green: {
      bg: 'bg-gradient-to-br from-green-50 to-emerald-50',
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      value: 'text-green-600',
      border: 'border-green-200',
      hover: 'hover:border-green-300'
    }
  };

  const style = colorStyles[color];

  return (
    <div className={`
      bg-white rounded-xl border border-gray-200 p-5 sm:p-6
      hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5
      ${style.hover}
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
            {trend && (
              <span className="text-xs text-gray-500 ml-1">{trend}</span>
            )}
          </div>
        </div>
        <div className={`
          p-2 sm:p-3 rounded-xl flex-shrink-0
          ${style.iconBg} ${style.iconColor}
        `}>
          <Icon size={isMobile ? 18 : 20} />
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-3 sm:mt-4 truncate">
        {description}
      </p>
    </div>
  );
};

// ==================== QUICK ACTION BUTTON ====================
interface QuickActionProps {
  to: string;
  icon: React.ElementType;
  title: string;
  description: string;
  disabled?: boolean;
}

const QuickAction = ({ to, icon: Icon, title, description, disabled }: QuickActionProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  const content = (
    <div className={`
      flex flex-col items-center text-center gap-1 sm:gap-1.5
      p-3 sm:p-4
    `}>
      <div className={`
        p-2 sm:p-2.5 rounded-xl
        ${disabled 
          ? 'bg-gray-100 text-gray-400' 
          : 'bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 group-hover:from-blue-100 group-hover:to-indigo-100'
        }
        transition-all duration-200
      `}>
        <Icon size={isMobile ? 18 : 20} />
      </div>
      <div className="w-full min-w-0 space-y-0.5">
        <p className={`
          font-semibold text-xs sm:text-sm truncate
          ${disabled ? 'text-gray-400' : 'text-gray-900'}
        `}>
          {title}
        </p>
        <p className={`
          text-[0.65rem] sm:text-xs leading-tight truncate
          ${disabled ? 'text-gray-300' : 'text-gray-500'}
        `}>
          {description}
        </p>
      </div>
    </div>
  );

  if (disabled) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl opacity-60 cursor-not-allowed">
        {content}
      </div>
    );
  }

  return (
    <Link
      to={to}
      className="bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-md transition-all duration-200 group active:scale-[0.98]"
    >
      {content}
    </Link>
  );
};

// ==================== CLASS CARD ====================
interface ClassCardProps {
  classItem: any;
  isFormTeacher: boolean;
  userId?: string;
}

const ClassCard = ({ classItem, isFormTeacher, userId }: ClassCardProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 hover:shadow-md transition-all duration-300 hover:border-gray-300">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-gray-900 text-base sm:text-lg">
            {classItem.name}
          </h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs sm:text-sm text-gray-600">
              Year {classItem.year}
            </span>
            {classItem.formTeacherId === userId && (
              <span className="text-[0.65rem] sm:text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
                Form Teacher
              </span>
            )}
          </div>
        </div>
      </div>
      
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2 text-gray-600">
          <Users size={isMobile ? 14 : 16} className="flex-shrink-0" />
          <span className="text-xs sm:text-sm">
            {classItem.students} student{classItem.students !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <Calendar size={isMobile ? 14 : 16} className="flex-shrink-0" />
          <span className="text-xs sm:text-sm">
            {classItem.type === 'grade' ? 'Grade' : 'Form'} {classItem.level}{classItem.section}
          </span>
        </div>
      </div>
      
      <Link
        to={`/dashboard/teacher/class/${classItem.id}`}
        className="mt-2 inline-flex items-center justify-between w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group"
      >
        <span className="text-xs font-medium text-gray-700">View class</span>
        <ChevronRight size={14} className="text-gray-400 group-hover:text-gray-600 transition-colors" />
      </Link>
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
export default function TeacherDashboard() {
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  // Fetch all active classes
  const { 
    classes, 
    isLoading: classesLoading 
  } = useSchoolClasses({ isActive: true });

  // Find classes assigned to this teacher
  const assignedClasses = useMemo(() => {
    if (!user?.id || !classes.length) return [];
    
    return classes.filter(cls => 
      cls.teachers?.includes(user.id) || 
      cls.formTeacherId === user.id
    );
  }, [classes, user?.id]);

  // Get form teacher class (if any)
  const formTeacherClass = useMemo(() => {
    return assignedClasses.find(cls => cls.formTeacherId === user?.id);
  }, [assignedClasses, user?.id]);

  // Calculate stats - Form Teacher card replaced with Pass Rate
  const stats = useMemo(() => {
    const totalStudents = assignedClasses.reduce((sum, cls) => sum + (cls.students || 0), 0);
    
    // Calculate mock pass rate (in real implementation, this would come from results)
    // For demo purposes, we're using 78%
    const passRate = assignedClasses.length > 0 ? 78 : 0;
    
    return {
      classesHandled: assignedClasses.length,
      totalStudents,
      subjects: user?.subjects || [],
      passRate,
      isFormTeacher: !!formTeacherClass,
      formClassName: formTeacherClass?.name,
    };
  }, [assignedClasses, user?.subjects, formTeacherClass]);

  // Loading state
  if (classesLoading) {
    return (
      <DashboardLayout activeTab="dashboard">
        <div className="p-4 sm:p-6 lg:p-8">
          <DashboardSkeleton />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="dashboard">
      <div className="p-4 sm:p-6 lg:p-8 space-y-8 sm:space-y-10">
        
        {/* ===== HEADER ===== */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
              Teacher Dashboard
            </h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1 flex items-center gap-2 flex-wrap">
              <span>Welcome back, {user?.name?.split(' ')[0] || 'Teacher'}</span>
              {stats.isFormTeacher && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="text-blue-600 font-medium">
                    Form Teacher, {stats.formClassName}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* ===== EMPTY STATE - PROFESSIONAL ===== */}
        {assignedClasses.length === 0 && (
          <EmptyState />
        )}

        {/* ===== SUBJECT TAGS ===== */}
        {stats.subjects.length > 0 && assignedClasses.length > 0 && (
          <div>
            <p className="text-xs sm:text-sm font-medium text-gray-600 mb-2 sm:mb-3">
              Teaching subjects
            </p>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {stats.subjects.map((subject, idx) => (
                <span
                  key={idx}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-blue-50 to-indigo-50 
                           text-blue-700 rounded-full text-xs sm:text-sm font-medium border border-blue-200"
                >
                  {subject}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ===== KEY METRICS - 3 CARDS (Form Teacher → Pass Rate) ===== */}
        {assignedClasses.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <MetricCard
              label="Classes assigned"
              value={stats.classesHandled}
              icon={BookOpen}
              description={`${stats.classesHandled} class${stats.classesHandled !== 1 ? 'es' : ''} you currently teach`}
              color="blue"
            />
            <MetricCard
              label="Total students"
              value={stats.totalStudents}
              icon={Users}
              description="Learners across all your classes"
              color="purple"
            />
            <MetricCard
              label="Pass rate"
              value={`${stats.passRate}%`}
              icon={TrendingUp}
              description="Average student pass rate across subjects"
              color="green"
              trend="78%"
            />
          </div>
        )}

        {/* ===== QUICK ACTIONS - 1×3 MATRIX, SMALLER BUTTONS ===== */}
        {assignedClasses.length > 0 && (
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">
              Quick actions
            </h2>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <QuickAction
                to="/dashboard/teacher/results-entry"
                icon={ClipboardCheck}
                title="Enter results"
                description="Record grades"
              />
              <QuickAction
                to="/dashboard/teacher/attendance"
                icon={Calendar}
                title="Attendance"
                description="Mark register"
              />
              <QuickAction
                to="/dashboard/teacher/results-analysis"
                icon={BarChart3}
                title="Analysis"
                description="View insights"
              />
            </div>
          </div>
        )}

        {/* ===== CLASSES OVERVIEW ===== */}
        {assignedClasses.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                Your classes
              </h2>
              <span className="text-xs sm:text-sm text-gray-500">
                {assignedClasses.length} total
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              {assignedClasses.map((classItem) => (
                <ClassCard
                  key={classItem.id}
                  classItem={classItem}
                  isFormTeacher={classItem.formTeacherId === user?.id}
                  userId={user?.id}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}