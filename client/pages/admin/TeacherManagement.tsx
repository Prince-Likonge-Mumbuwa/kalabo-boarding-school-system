import { DashboardLayout } from '@/components/DashboardLayout';
import { useSchoolTeachers } from '@/hooks/useSchoolTeachers';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useAuth } from '@/hooks/useAuth';
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
  AlertCircle
} from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

export default function TeacherManagement() {
  const { user } = useAuth();
  const isUserAdmin = user?.userType === 'admin';
  
  const { 
    allTeachers: teachers, 
    isLoading: isLoadingTeachers,
    isFetching: isFetchingTeachers,
    isError: teachersError,
    error: teachersErrorMessage,
    isAssigningTeacher,
    isRemovingTeacher,
    assignTeacherToClass,
    removeTeacherFromClass,
    refetchTeachers,
  } = useSchoolTeachers();
  
  const { 
    classes, 
    isLoading: isLoadingClasses,
    isError: classesError,
  } = useSchoolClasses({ isActive: true });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>(''); // NEW
  const [isFormTeacher, setIsFormTeacher] = useState(false);

  const debouncedSearch = useDebounce(searchTerm, 300);

  // Calculate stats
  const stats = useMemo(() => ({
    totalTeachers: teachers.length,
    activeTeachers: teachers.filter(t => t.status === 'active' || !t.status).length,
    formTeachers: teachers.filter(t => t.isFormTeacher).length,
    assignedTeachers: teachers.filter(t => t.assignedClassId || (t.assignedClasses && t.assignedClasses.length > 0)).length,
  }), [teachers]);

  // Filter teachers
  const filteredTeachers = useMemo(() => {
    return teachers.filter(teacher => {
      const matchesSearch = !debouncedSearch ||
        teacher.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        teacher.email.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (teacher.phone && teacher.phone.includes(debouncedSearch));
      
      const teacherStatus = teacher.status || 'active';
      const matchesStatus = statusFilter === 'all' || teacherStatus === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [teachers, debouncedSearch, statusFilter]);

  // Handle teacher assignment
  const handleAssignTeacher = async () => {
    if (!selectedTeacher || !selectedClassId) {
      alert('Please select both a teacher and a class');
      return;
    }

    // NEW: Validate subject selection
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
        subject: selectedSubject, // NEW: Pass the selected subject
        isFormTeacher
      });
      
      alert(`${selectedTeacher.name} assigned to ${selectedClass.name} for ${selectedSubject}${isFormTeacher ? ' as Form Teacher' : ''} successfully!`);
      setShowAssignmentModal(false);
      setSelectedTeacher(null);
      setSelectedClassId('');
      setSelectedSubject(''); // NEW: Reset subject
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

  // Error state
  if (teachersError || classesError) {
    return (
      <DashboardLayout activeTab="teachers">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <AlertCircle className="mx-auto mb-4 text-red-500" size={48} />
            <h3 className="text-lg font-semibold text-red-900 mb-2">Failed to load data</h3>
            <p className="text-red-700 mb-4">
              {teachersErrorMessage?.message || 'An error occurred while fetching teachers'}
            </p>
            <button
              onClick={() => refetchTeachers()}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
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
        <div className="p-8 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="animate-spin text-blue-600 mx-auto mb-4" size={48} />
            <p className="text-gray-600">Loading teachers...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <DashboardLayout activeTab="teachers">
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl lg:text-4xl">
                  Teacher Management
                </h1>
                <p className="text-gray-600 mt-2 text-sm sm:text-base">
                  {teachers.length} teachers registered
                  {isFetchingTeachers && <span className="ml-2 text-blue-600">(updating...)</span>}
                </p>
              </div>
              {isUserAdmin && (
                <button
                  onClick={() => {
                    setSelectedTeacher(null);
                    setSelectedSubject(''); // NEW: Reset subject
                    setShowAssignmentModal(true);
                  }}
                  disabled={isAssigningTeacher}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAssigningTeacher ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <UserCheck size={20} />
                  )}
                  Assign to Class
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <p className="text-sm text-gray-600">Total Teachers</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalTeachers}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <p className="text-sm text-gray-600">Active</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{stats.activeTeachers}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <p className="text-sm text-gray-600">Form Teachers</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{stats.formTeachers}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <p className="text-sm text-gray-600">Assigned to Classes</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">{stats.assignedTeachers}</p>
            </div>
          </div>

          {/* Search and Filter */}
          <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Search teachers by name, email, or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex gap-3">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="on_leave">On Leave</option>
                </select>
              </div>
            </div>

            {/* Active filters */}
            {(searchTerm || statusFilter !== 'all') && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="text-gray-600">Active filters:</span>
                {searchTerm && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md">
                    Search: "{searchTerm}"
                  </span>
                )}
                {statusFilter !== 'all' && (
                  <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-md">
                    Status: {statusFilter}
                  </span>
                )}
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                  }}
                  className="ml-2 text-blue-600 hover:text-blue-700 font-medium"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          {/* Teachers Grid */}
          {filteredTeachers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTeachers.map((teacher) => {
                const assignedClassName = getAssignedClassName(teacher.id);
                const teacherStatus = teacher.status || 'active';
                
                return (
                  <div
                    key={teacher.id}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all duration-300"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                          <User size={24} className="text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900">{teacher.name}</h3>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              teacherStatus === 'active' 
                                ? 'bg-green-100 text-green-800' 
                                : teacherStatus === 'on_leave'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {teacherStatus.replace('_', ' ')}
                            </span>
                            {teacher.isFormTeacher && (
                              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                                Form Teacher
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2">
                        <Mail size={14} className="text-gray-400" />
                        <span className="text-sm text-gray-700 truncate">{teacher.email}</span>
                      </div>
                      {teacher.phone && (
                        <div className="flex items-center gap-2">
                          <Phone size={14} className="text-gray-400" />
                          <span className="text-sm text-gray-700">{teacher.phone}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <BookOpen size={14} className="text-gray-400" />
                        <span className="text-sm text-gray-700 truncate">
                          {teacher.subjects?.join(', ') || 'No subjects'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <GraduationCap size={14} className="text-gray-400" />
                        <span className="text-sm text-gray-700">{teacher.department || 'General'}</span>
                      </div>
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                      {assignedClassName ? (
                        <div>
                          <p className="text-sm text-gray-600 mb-2">Assigned to:</p>
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-900">{assignedClassName}</span>
                            {isUserAdmin && (
                              <button
                                onClick={() => handleRemoveFromClass(teacher.id)}
                                disabled={isRemovingTeacher}
                                className="text-red-600 hover:text-red-800 text-sm flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isRemovingTeacher ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <UserX size={14} />
                                )}
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center">
                          <p className="text-sm text-gray-600 mb-3">Not assigned to any class</p>
                          {isUserAdmin && (
                            <button
                              onClick={() => {
                                setSelectedTeacher(teacher);
                                setSelectedSubject(''); // NEW: Reset subject
                                setShowAssignmentModal(true);
                              }}
                              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                            >
                              Assign to Class
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
            /* Empty State */
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <Users className="mx-auto text-gray-300 mb-4" size={48} />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No teachers found</h3>
              <p className="text-gray-600">
                {searchTerm || statusFilter !== 'all' 
                  ? 'Try adjusting your search or filter'
                  : 'No teachers registered yet. Teachers can create accounts via the sign-up page.'}
              </p>
            </div>
          )}
        </div>
      </DashboardLayout>

      {/* Assignment Modal */}
      {showAssignmentModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowAssignmentModal(false)} />
          
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">
                    {selectedTeacher ? `Assign ${selectedTeacher.name}` : 'Assign Teacher to Class'}
                  </h2>
                  <button
                    onClick={() => setShowAssignmentModal(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Teacher Selection (if not already selected) */}
                {!selectedTeacher && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Teacher *
                    </label>
                    <select
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      onChange={(e) => {
                        const teacher = teachers.find(t => t.id === e.target.value);
                        setSelectedTeacher(teacher || null);
                        setSelectedSubject(''); // Reset subject when teacher changes
                      }}
                    >
                      <option value="">Choose a teacher...</option>
                      {teachers
                        .filter(t => t.status === 'active' || !t.status)
                        .map(teacher => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.name} ({teacher.email})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {/* Show teacher's subjects */}
                {selectedTeacher && selectedTeacher.subjects && selectedTeacher.subjects.length > 0 && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-900 font-medium">Teacher's Subjects:</p>
                    <p className="text-sm text-blue-700 mt-1">
                      {selectedTeacher.subjects.join(', ')}
                    </p>
                  </div>
                )}

                {/* Class Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Class *
                  </label>
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Choose a class...</option>
                    {classes.map(cls => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} (Year: {cls.year})
                      </option>
                    ))}
                  </select>
                </div>

                {/* NEW: Subject Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Subject to Teach *
                  </label>
                  <select
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                    disabled={!selectedTeacher || !selectedTeacher.subjects || selectedTeacher.subjects.length === 0}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">Choose a subject...</option>
                    {selectedTeacher?.subjects?.map(subject => (
                      <option key={subject} value={subject}>
                        {subject}
                      </option>
                    ))}
                  </select>
                  {selectedTeacher && (!selectedTeacher.subjects || selectedTeacher.subjects.length === 0) && (
                    <p className="text-xs text-red-600 mt-1">
                      This teacher has no subjects listed. They need to update their profile.
                    </p>
                  )}
                </div>

                {/* Form Teacher Checkbox */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="formTeacher"
                    checked={isFormTeacher}
                    onChange={(e) => setIsFormTeacher(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="formTeacher" className="text-sm text-gray-700">
                    Assign as Form Teacher (Class Teacher)
                  </label>
                </div>

                {/* Actions */}
                <div className="pt-4">
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
                      className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAssignTeacher}
                      disabled={!selectedTeacher || !selectedClassId || !selectedSubject || isAssigningTeacher}
                      className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                    >
                      {isAssigningTeacher ? (
                        <>
                          <Loader2 className="animate-spin mr-2" size={18} />
                          Assigning...
                        </>
                      ) : (
                        'Assign Teacher'
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