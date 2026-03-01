import { DashboardLayout } from '@/components/DashboardLayout';
import { useSchoolTeachers } from '@/hooks/useSchoolTeachers';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useAuth } from '@/hooks/useAuth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useState, useMemo } from 'react';
import {
  Search,
  User,
  Mail,
  Phone,
  BookOpen,
  GraduationCap,
  X,
  Users,
  Loader2,
  UserCheck,
  UserX,
  AlertCircle,
  ChevronDown,
  Filter,
  Briefcase,
  MoreVertical,
  Power,
  PowerOff,
  RefreshCw,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

// Teacher status type
type TeacherStatus = 'active' | 'inactive' | 'transferred' | 'on_leave';

export default function TeacherManagement() {
  const { user } = useAuth();
  const isUserAdmin = user?.userType === 'admin';
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');
  
  const { 
    allTeachers: teachers, 
    isLoading: isLoadingTeachers,
    isFetching: isFetchingTeachers,
    isError: teachersError,
    error: teachersErrorMessage,
    isAssigningTeacher,
    isRemovingTeacher,
    isUpdatingTeacherStatus,
    assignTeacherToClass,
    removeTeacherFromClass,
    updateTeacherStatus,
    refetchTeachers,
  } = useSchoolTeachers();
  
  const { 
    classes, 
    isLoading: isLoadingClasses,
    isError: classesError,
  } = useSchoolClasses({ isActive: true });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<TeacherStatus | 'all'>('all');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [isFormTeacher, setIsFormTeacher] = useState(false);
  const [showActionsFor, setShowActionsFor] = useState<string | null>(null);

  const debouncedSearch = useDebounce(searchTerm, 300);

  // Calculate stats - WITH STATUS BREAKDOWN
  const stats = useMemo(() => ({
    totalTeachers: teachers.length,
    activeTeachers: teachers.filter(t => t.status === 'active' || !t.status).length,
    inactiveTeachers: teachers.filter(t => t.status === 'inactive').length,
    transferredTeachers: teachers.filter(t => t.status === 'transferred').length,
    onLeaveTeachers: teachers.filter(t => t.status === 'on_leave').length,
    assignedTeachers: teachers.filter(t => t.assignedClassId || (t.assignedClasses && t.assignedClasses.length > 0)).length,
  }), [teachers]);

  // Filter teachers
  const filteredTeachers = useMemo(() => {
    return teachers.filter(teacher => {
      const matchesSearch = !debouncedSearch ||
        teacher.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        teacher.email.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (teacher.phone && teacher.phone.includes(debouncedSearch)) ||
        (teacher.department && teacher.department.toLowerCase().includes(debouncedSearch.toLowerCase()));
      
      const teacherStatus = teacher.status || 'active';
      const matchesStatus = statusFilter === 'all' || teacherStatus === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [teachers, debouncedSearch, statusFilter]);

  // Handle teacher status update
  const handleUpdateStatus = async (teacherId: string, newStatus: TeacherStatus) => {
    if (!isUserAdmin) {
      alert('Only administrators can update teacher status');
      return;
    }

    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return;

    const statusLabels = {
      active: 'Active',
      inactive: 'Inactive',
      transferred: 'Transferred',
      on_leave: 'On Leave'
    };

    if (!confirm(`Change ${teacher.name}'s status to ${statusLabels[newStatus]}?`)) {
      return;
    }

    try {
      await updateTeacherStatus({ teacherId, status: newStatus });
      alert(`Teacher status updated to ${statusLabels[newStatus]} successfully!`);
      setShowActionsFor(null);
    } catch (error: any) {
      console.error('Status update error:', error);
      alert(`Error: ${error.message || 'Failed to update teacher status'}`);
    }
  };

  // Handle teacher assignment
  const handleAssignTeacher = async () => {
    if (!selectedTeacher || !selectedClassId) {
      alert('Please select both a teacher and a class');
      return;
    }

    if (!selectedSubject) {
      alert('Please select a subject that this teacher will teach to this class');
      return;
    }

    if (!isUserAdmin) {
      alert('Only administrators can assign teachers to classes');
      return;
    }

    const selectedClass = classes.find(c => c.id === selectedClassId);
    if (!selectedClass) {
      alert('Class not found');
      return;
    }

    try {
      await assignTeacherToClass({
        teacherId: selectedTeacher.id,
        classId: selectedClassId,
        subject: selectedSubject,
        isFormTeacher
      });
      
      alert(`${selectedTeacher.name} assigned to ${selectedClass.name} for ${selectedSubject}${isFormTeacher ? ' as Form Teacher' : ''} successfully!`);
      setShowAssignmentModal(false);
      setSelectedTeacher(null);
      setSelectedClassId('');
      setSelectedSubject('');
      setIsFormTeacher(false);
      
    } catch (error: any) {
      console.error('Assignment error:', error);
      alert(`Error: ${error.message || 'Failed to assign teacher'}`);
    }
  };

  // Handle remove teacher from class
  const handleRemoveFromClass = async (teacherId: string) => {
    if (!isUserAdmin) {
      alert('Only administrators can remove teachers from classes');
      return;
    }

    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) {
      alert('Teacher not found');
      return;
    }

    const assignedClassId = teacher.assignedClassId;
    if (!assignedClassId) {
      alert('This teacher is not assigned to any class');
      return;
    }

    const assignedClass = classes.find(c => c.id === assignedClassId);
    const className = assignedClass?.name || 'Unknown Class';

    if (!confirm(`Remove ${teacher.name} from ${className}?`)) {
      return;
    }

    try {
      await removeTeacherFromClass({
        teacherId,
        classId: assignedClassId
      });
      
      alert(`${teacher.name} removed from ${className} successfully!`);
      setShowActionsFor(null);
      
    } catch (error: any) {
      console.error('Remove error:', error);
      alert(`Error: ${error.message || 'Failed to remove teacher'}`);
    }
  };

  // Get assigned class name for a teacher
  const getAssignedClassName = (teacherId: string) => {
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher?.assignedClassId) return null;
    
    const assignedClass = classes.find(c => c.id === teacher.assignedClassId);
    return assignedClass?.name || 'Unknown Class';
  };

  // Get status badge configuration
  const getStatusConfig = (status: string) => {
    switch(status) {
      case 'active':
        return { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle, label: 'Active' };
      case 'inactive':
        return { bg: 'bg-gray-100', text: 'text-gray-800', icon: PowerOff, label: 'Inactive' };
      case 'transferred':
        return { bg: 'bg-blue-100', text: 'text-blue-800', icon: RefreshCw, label: 'Transferred' };
      case 'on_leave':
        return { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: XCircle, label: 'On Leave' };
      default:
        return { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle, label: 'Active' };
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setShowMobileFilters(false);
  };

  // Error state
  if (teachersError || classesError) {
    return (
      <DashboardLayout activeTab="teachers">
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
          <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-red-200 p-8 text-center shadow-lg">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <AlertCircle className="text-red-600" size={32} />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Failed to load data</h3>
            <p className="text-gray-600 mb-6">
              {teachersErrorMessage?.message || 'An error occurred while fetching teachers'}
            </p>
            <button
              onClick={() => refetchTeachers()}
              className="px-6 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Loading state
  if (isLoadingTeachers || isLoadingClasses) {
    return (
      <DashboardLayout activeTab="teachers">
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="bg-white rounded-2xl p-8 shadow-lg text-center">
              <Loader2 className="animate-spin text-blue-600 mx-auto mb-4" size={48} />
              <p className="text-gray-600 text-lg">Loading teachers...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <DashboardLayout activeTab="teachers">
        <div className="min-h-screen bg-gray-50/80 p-3 sm:p-6 lg:p-8 transition-all duration-200">
          
          {/* ===== HEADER ===== */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
                  Teacher Management
                </h1>
                <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2 flex items-center gap-2 flex-wrap">
                  <span>{teachers.length} teacher{teachers.length !== 1 ? 's' : ''}</span>
                  <span className="text-gray-300">•</span>
                  <span className="text-green-600">{stats.activeTeachers} active</span>
                  {stats.inactiveTeachers > 0 && (
                    <>
                      <span className="text-gray-300">•</span>
                      <span className="text-gray-600">{stats.inactiveTeachers} inactive</span>
                    </>
                  )}
                  {isFetchingTeachers && (
                    <span className="inline-flex items-center gap-1.5 text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full text-xs">
                      <Loader2 size={12} className="animate-spin" />
                      updating
                    </span>
                  )}
                </p>
              </div>
              
              {/* Admin Action - Adaptive */}
              {isUserAdmin && (
                <button
                  onClick={() => {
                    setSelectedTeacher(null);
                    setSelectedSubject('');
                    setShowAssignmentModal(true);
                  }}
                  disabled={isAssigningTeacher}
                  className={`
                    inline-flex items-center justify-center
                    bg-blue-600 text-white rounded-xl hover:bg-blue-700
                    font-medium transition-all active:scale-[0.98]
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${isMobile 
                      ? 'p-2.5 w-full sm:w-auto' 
                      : 'px-4 py-2.5 gap-2'
                    }
                  `}
                  title={isMobile ? 'Assign teacher to class' : undefined}
                >
                  {isAssigningTeacher ? (
                    <Loader2 size={isMobile ? 18 : 20} className="animate-spin" />
                  ) : (
                    <UserCheck size={isMobile ? 18 : 20} />
                  )}
                  {!isMobile && 'Assign to Class'}
                  {isMobile && <span className="sr-only">Assign to Class</span>}
                </button>
              )}
            </div>
          </div>

          {/* ===== STATS CARDS - Enhanced with Status Breakdown ===== */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-4 mb-6">
            {/* Total Teachers */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-blue-50 rounded-lg">
                  <Users size={isMobile ? 14 : 16} className="text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-600 truncate">Total</p>
                  <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">
                    {stats.totalTeachers}
                  </p>
                </div>
              </div>
            </div>

            {/* Active Teachers */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-green-50 rounded-lg">
                  <UserCheck size={isMobile ? 14 : 16} className="text-green-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-600 truncate">Active</p>
                  <p className="text-lg sm:text-xl lg:text-2xl font-bold text-green-600">
                    {stats.activeTeachers}
                  </p>
                </div>
              </div>
            </div>

            {/* Inactive Teachers */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-gray-50 rounded-lg">
                  <PowerOff size={isMobile ? 14 : 16} className="text-gray-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-600 truncate">Inactive</p>
                  <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-600">
                    {stats.inactiveTeachers}
                  </p>
                </div>
              </div>
            </div>

            {/* On Leave */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-yellow-50 rounded-lg">
                  <XCircle size={isMobile ? 14 : 16} className="text-yellow-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-600 truncate">On Leave</p>
                  <p className="text-lg sm:text-xl lg:text-2xl font-bold text-yellow-600">
                    {stats.onLeaveTeachers}
                  </p>
                </div>
              </div>
            </div>

            {/* Assigned to Classes */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-purple-50 rounded-lg">
                  <Briefcase size={isMobile ? 14 : 16} className="text-purple-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-600 truncate">Assigned</p>
                  <p className="text-lg sm:text-xl lg:text-2xl font-bold text-purple-600">
                    {stats.assignedTeachers}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ===== FILTERS SECTION ===== */}
          <div className="mb-6 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            
            {/* Mobile Filter Toggle */}
            {isMobile && (
              <button
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                className="w-full flex items-center justify-between p-4 bg-white"
              >
                <div className="flex items-center gap-2">
                  <Filter size={18} className="text-gray-400" />
                  <span className="font-medium text-gray-700">
                    {searchTerm || statusFilter !== 'all' ? 'Filters active' : 'Search & filters'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {(searchTerm || statusFilter !== 'all') && (
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
              ${isMobile ? 'px-4 pb-4' : 'p-4'}
              ${isMobile && !showMobileFilters ? 'hidden' : 'block'}
            `}>
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Search Input */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder={isMobile ? "Search teachers..." : "Search by name, email, or phone..."}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             text-sm sm:text-base transition-shadow"
                  />
                </div>
                
                {/* Status Filter */}
                <div className="relative sm:w-48">
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <Filter size={18} className="text-gray-400" />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as TeacherStatus | 'all')}
                    className="w-full pl-10 pr-8 py-2.5 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             appearance-none bg-white cursor-pointer text-sm sm:text-base
                             hover:border-gray-400 transition-colors"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="on_leave">On Leave</option>
                    <option value="transferred">Transferred</option>
                  </select>
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <ChevronDown size={16} className="text-gray-400" />
                  </div>
                </div>
              </div>
              
              {/* Active Filters */}
              {(searchTerm || statusFilter !== 'all') && (
                <div className="mt-3 flex items-center gap-2 text-sm flex-wrap">
                  <span className="text-gray-600">Active filters:</span>
                  {searchTerm && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs sm:text-sm">
                      <span>"{searchTerm}"</span>
                      <button
                        onClick={() => setSearchTerm('')}
                        className="hover:bg-blue-100 rounded p-0.5"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  )}
                  {statusFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-700 rounded-lg text-xs sm:text-sm">
                      <span className="capitalize">{statusFilter.replace('_', ' ')}</span>
                      <button
                        onClick={() => setStatusFilter('all')}
                        className="hover:bg-purple-100 rounded p-0.5"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  )}
                  <button
                    onClick={clearFilters}
                    className="text-blue-600 hover:text-blue-700 font-medium text-xs sm:text-sm hover:underline ml-1"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ===== TEACHERS GRID ===== */}
          {filteredTeachers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {filteredTeachers.map((teacher) => {
                const assignedClassName = getAssignedClassName(teacher.id);
                const teacherStatus = teacher.status || 'active';
                const StatusIcon = getStatusConfig(teacherStatus).icon;
                
                return (
                  <div
                    key={teacher.id}
                    className="group bg-white rounded-xl border border-gray-200 p-5 
                             shadow-sm hover:shadow-lg transition-all duration-300 
                             hover:border-gray-300 hover:-translate-y-0.5 relative"
                  >
                    {/* Actions Dropdown - Only for Admin */}
                    {isUserAdmin && (
                      <div className="absolute top-4 right-4">
                        <button
                          onClick={() => setShowActionsFor(showActionsFor === teacher.id ? null : teacher.id)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <MoreVertical size={16} className="text-gray-500" />
                        </button>
                        
                        {/* Dropdown Menu */}
                        {showActionsFor === teacher.id && (
                          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                            <button
                              onClick={() => handleUpdateStatus(teacher.id, 'active')}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                              disabled={teacherStatus === 'active'}
                            >
                              <CheckCircle size={14} className="text-green-600" />
                              <span>Set Active</span>
                              {teacherStatus === 'active' && <span className="ml-auto text-xs text-gray-400">✓</span>}
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(teacher.id, 'inactive')}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                              disabled={teacherStatus === 'inactive'}
                            >
                              <PowerOff size={14} className="text-gray-600" />
                              <span>Set Inactive</span>
                              {teacherStatus === 'inactive' && <span className="ml-auto text-xs text-gray-400">✓</span>}
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(teacher.id, 'on_leave')}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                              disabled={teacherStatus === 'on_leave'}
                            >
                              <XCircle size={14} className="text-yellow-600" />
                              <span>Set On Leave</span>
                              {teacherStatus === 'on_leave' && <span className="ml-auto text-xs text-gray-400">✓</span>}
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(teacher.id, 'transferred')}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                              disabled={teacherStatus === 'transferred'}
                            >
                              <RefreshCw size={14} className="text-blue-600" />
                              <span>Set Transferred</span>
                              {teacherStatus === 'transferred' && <span className="ml-auto text-xs text-gray-400">✓</span>}
                            </button>
                            <div className="border-t border-gray-100 my-1"></div>
                            {assignedClassName && (
                              <button
                                onClick={() => handleRemoveFromClass(teacher.id)}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 text-red-600 flex items-center gap-2"
                              >
                                <UserX size={14} />
                                <span>Remove from Class</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Teacher Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-50 to-blue-100 
                                      rounded-full flex items-center justify-center flex-shrink-0">
                          <User size={22} className="text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-gray-900 truncate">
                            {teacher.name}
                          </h3>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${getStatusConfig(teacherStatus).bg} ${getStatusConfig(teacherStatus).text}`}>
                              <StatusIcon size={10} />
                              {getStatusConfig(teacherStatus).label}
                            </span>
                            {teacher.isFormTeacher && (
                              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                                Form Teacher
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Teacher Details - Compact */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm">
                        <Mail size={14} className="text-gray-400 flex-shrink-0" />
                        <span className="text-gray-700 truncate">{teacher.email}</span>
                      </div>
                      {teacher.phone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone size={14} className="text-gray-400 flex-shrink-0" />
                          <span className="text-gray-700 truncate">{teacher.phone}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm">
                        <BookOpen size={14} className="text-gray-400 flex-shrink-0" />
                        <span className="text-gray-700 truncate">
                          {teacher.subjects?.length 
                            ? teacher.subjects.slice(0, 2).join(', ') + (teacher.subjects.length > 2 ? ` +${teacher.subjects.length - 2}` : '')
                            : 'No subjects'}
                        </span>
                      </div>
                      {teacher.department && (
                        <div className="flex items-center gap-2 text-sm">
                          <Briefcase size={14} className="text-gray-400 flex-shrink-0" />
                          <span className="text-gray-700 truncate">{teacher.department}</span>
                        </div>
                      )}
                    </div>

                    {/* Assignment Status */}
                    <div className="border-t border-gray-100 pt-4">
                      {assignedClassName ? (
                        <div>
                          <p className="text-xs text-gray-500 mb-1.5">Currently teaching</p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <GraduationCap size={14} className="text-gray-400 flex-shrink-0" />
                              <span className="font-medium text-gray-900 text-sm truncate">
                                {assignedClassName}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">Not assigned</span>
                          {isUserAdmin && teacherStatus === 'active' && (
                            <button
                              onClick={() => {
                                setSelectedTeacher(teacher);
                                setSelectedSubject('');
                                setShowAssignmentModal(true);
                              }}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium 
                                       px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg
                                       transition-colors"
                            >
                              Assign
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ===== EMPTY STATE ===== */
            <div className="text-center py-16 sm:py-20 bg-white rounded-2xl border border-gray-200 shadow-sm">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
                <Users className="text-gray-400" size={36} />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No teachers found
              </h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                {searchTerm || statusFilter !== 'all'
                  ? 'Try adjusting your filters to find what you\'re looking for.'
                  : 'Teachers can create accounts via the sign-up page. Assign them to classes once registered.'}
              </p>
              {(searchTerm || statusFilter !== 'all') && (
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-2 px-6 py-3 border border-gray-300 
                           text-gray-700 rounded-xl hover:bg-gray-50 font-medium 
                           transition-all focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}

          {/* ===== BOTTOM METADATA ===== */}
          {filteredTeachers.length > 0 && (
            <div className="mt-6 text-xs sm:text-sm text-gray-500 text-center sm:text-left">
              Showing {filteredTeachers.length} of {teachers.length} teachers
              {searchTerm && ` matching "${searchTerm}"`}
              {statusFilter !== 'all' && ` • ${statusFilter.replace('_', ' ')} status`}
            </div>
          )}
        </div>
      </DashboardLayout>

      {/* ===== ASSIGNMENT MODAL ===== */}
      {showAssignmentModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowAssignmentModal(false)} />
          
          <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
            <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
              
              {/* Modal Header */}
              <div className="p-5 sm:p-6 border-b border-gray-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-bold text-gray-900 truncate">
                      {selectedTeacher ? `Assign ${selectedTeacher.name.split(' ')[0]}` : 'Assign Teacher'}
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {selectedTeacher ? 'Choose class and subject' : 'Select a teacher to assign'}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowAssignmentModal(false);
                      setSelectedTeacher(null);
                      setSelectedClassId('');
                      setSelectedSubject('');
                      setIsFormTeacher(false);
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                  >
                    <X size={18} className="text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-5 sm:p-6 space-y-5">
                
                {/* Teacher Selection */}
                {!selectedTeacher ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Select Teacher <span className="text-red-500">*</span>
                    </label>
                    <select
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg 
                               focus:ring-2 focus:ring-blue-500 focus:border-transparent
                               text-sm bg-white hover:border-gray-400 transition-colors"
                      onChange={(e) => {
                        const teacher = teachers.find(t => t.id === e.target.value);
                        setSelectedTeacher(teacher || null);
                        setSelectedSubject('');
                      }}
                    >
                      <option value="">Choose a teacher...</option>
                      {teachers
                        .filter(t => t.status === 'active' || !t.status)
                        .map(teacher => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.name} • {teacher.email}
                          </option>
                        ))}
                    </select>
                  </div>
                ) : (
                  /* Selected Teacher Summary */
                  <div className="p-3 bg-blue-50/80 rounded-lg border border-blue-100">
                    <p className="text-xs text-blue-700 font-medium mb-1">Selected Teacher</p>
                    <p className="text-sm font-semibold text-gray-900">{selectedTeacher.name}</p>
                    {selectedTeacher.subjects?.length > 0 && (
                      <p className="text-xs text-blue-700 mt-1.5">
                        Subjects: {selectedTeacher.subjects.join(', ')}
                      </p>
                    )}
                  </div>
                )}

                {/* Class Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Select Class <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             text-sm bg-white hover:border-gray-400 transition-colors"
                  >
                    <option value="">Choose a class...</option>
                    {classes.map(cls => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} • Year {cls.year} • {cls.students} learners
                      </option>
                    ))}
                  </select>
                </div>

                {/* Subject Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Select Subject to Teach <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                    disabled={!selectedTeacher || !selectedTeacher.subjects?.length}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             text-sm bg-white hover:border-gray-400 transition-colors
                             disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">Choose a subject...</option>
                    {selectedTeacher?.subjects?.map(subject => (
                      <option key={subject} value={subject}>
                        {subject}
                      </option>
                    ))}
                  </select>
                  {selectedTeacher && (!selectedTeacher.subjects || selectedTeacher.subjects.length === 0) && (
                    <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                      <AlertCircle size={12} />
                      This teacher has no subjects listed
                    </p>
                  )}
                </div>

                {/* Form Teacher Option */}
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    id="formTeacher"
                    checked={isFormTeacher}
                    onChange={(e) => setIsFormTeacher(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="formTeacher" className="text-sm text-gray-700">
                    Assign as <span className="font-medium">Form Teacher</span>
                    <span className="text-xs text-gray-500 block mt-0.5">
                      Responsible for overall class management
                    </span>
                  </label>
                </div>

                {/* Actions */}
                <div className="pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAssignmentModal(false);
                        setSelectedTeacher(null);
                        setSelectedClassId('');
                        setSelectedSubject('');
                        setIsFormTeacher(false);
                      }}
                      className="px-4 py-2.5 border border-gray-300 text-gray-700 
                               rounded-lg hover:bg-gray-50 font-medium 
                               transition-colors text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAssignTeacher}
                      disabled={!selectedTeacher || !selectedClassId || !selectedSubject || isAssigningTeacher}
                      className="px-4 py-2.5 bg-blue-600 text-white rounded-lg 
                               hover:bg-blue-700 font-medium disabled:opacity-50 
                               disabled:cursor-not-allowed flex items-center justify-center
                               transition-colors text-sm gap-2"
                    >
                      {isAssigningTeacher ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          Assigning...
                        </>
                      ) : (
                        <>
                          <UserCheck size={16} />
                          Assign Teacher
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}