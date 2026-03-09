// @/pages/teacher/AttendanceTracking.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useTeacherClasses } from '@/hooks/useTeacherClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';
import { useAuth } from '@/hooks/useAuth';
import { attendanceService, AttendanceRecord } from '@/services/attendanceService';
import { Timestamp } from 'firebase/firestore';
import { 
  Filter, RefreshCw, Check, X, Clock, 
  AlertCircle, MessageSquare, ChevronDown, 
  ChevronLeft, ChevronRight, Search, 
  Users, Calendar, Save, Loader2,
  UserCheck, UserX, Users as UsersIcon,
  Sun, BookOpen, GraduationCap, Menu
} from 'lucide-react';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
type AttendanceMode = 'daily' | 'periodic';

interface StudentWithAttendance {
  id: string;
  name: string;
  studentId: string;
  gender?: 'male' | 'female';
  classId: string;
  attendance?: AttendanceRecord;
}

// ==================== MODE TOGGLE ====================
const ModeToggle = ({ 
  mode, 
  onChange, 
  isFormTeacher 
}: { 
  mode: AttendanceMode; 
  onChange: (mode: AttendanceMode) => void;
  isFormTeacher: boolean;
}) => (
  <div className="bg-white rounded-xl p-1 border border-gray-200 inline-flex w-full sm:w-auto overflow-x-auto">
    <div className="flex gap-1 min-w-max">
      {isFormTeacher && (
        <button
          onClick={() => onChange('daily')}
          className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
            mode === 'daily' 
              ? 'bg-blue-600 text-white shadow-sm' 
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Sun size={14} className="sm:w-4 sm:h-4" />
          <span>Daily Roll Call</span>
        </button>
      )}
      <button
        onClick={() => onChange('periodic')}
        className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
          mode === 'periodic' 
            ? 'bg-blue-600 text-white shadow-sm' 
            : 'text-gray-600 hover:bg-gray-100'
        }`}
      >
        <BookOpen size={14} className="sm:w-4 sm:h-4" />
        <span>Periodic Attendance</span>
      </button>
    </div>
  </div>
);

// ==================== IMPROVED STATS CARD ====================
const StatCard = ({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) => {
  const colors = {
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  };

  return (
    <div className={`rounded-lg sm:rounded-xl border p-2 sm:p-3 lg:p-4 ${colors[color as keyof typeof colors] || colors.blue}`}>
      <div className="flex flex-col gap-1 sm:gap-2">
        {/* Label and Icon Row - Always visible */}
        <div className="flex items-center justify-between">
          <p className="text-xs sm:text-sm font-medium opacity-80 truncate pr-2">{label}</p>
          <div className="p-1 sm:p-1.5 bg-white/50 rounded-lg flex-shrink-0">
            {icon}
          </div>
        </div>
        
        {/* Value - Always visible with larger text */}
        <p className="text-lg sm:text-xl lg:text-2xl xl:text-3xl font-bold truncate">
          {value}
        </p>
        
        {/* Small hint for very small screens */}
        <p className="text-[8px] sm:text-[10px] text-gray-500 opacity-70 truncate hidden xs:block">
          {value} {label.toLowerCase()}
        </p>
      </div>
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
export default function AttendanceTracking() {
  const { user } = useAuth();
  
  // Mode state
  const [mode, setMode] = useState<AttendanceMode>('periodic');
  
  // Basic states
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | 'all'>('all');
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  
  // Periodic attendance specific
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('1');
  
  // Excuse modal
  const [excuseModal, setExcuseModal] = useState<{
    isOpen: boolean;
    studentId?: string;
    studentName?: string;
  }>({ isOpen: false });

  // Get teacher's classes and identify form teacher status
  const { 
    data: classes = [], 
    isLoading: loadingClasses,
    error: classesError,
    refetch: refetchClasses
  } = useTeacherClasses();

  // Get teacher's assignments for subjects - FIXED: Using updated hook with correct collection
  const { 
    assignments = [], 
    isLoading: loadingAssignments 
  } = useTeacherAssignments(user?.uid);

  // Find if teacher is a form teacher and which class
  const formTeacherClass = useMemo(() => {
    return classes.find(cls => cls.formTeacherId === user?.uid);
  }, [classes, user?.uid]);

  const isFormTeacher = !!formTeacherClass;

  // Filter available classes based on mode
  const availableClasses = useMemo(() => {
    if (mode === 'daily') {
      return formTeacherClass ? [formTeacherClass] : [];
    } else {
      const classIds = assignments.map(a => a.classId);
      return classes.filter(cls => classIds.includes(cls.id));
    }
  }, [mode, formTeacherClass, classes, assignments]);

  // Get available subjects for selected class in periodic mode
  const availableSubjects = useMemo(() => {
    if (mode !== 'periodic' || !selectedClass || !user?.uid) return [];
    
    return assignments
      .filter(a => a.teacherId === user.uid && a.classId === selectedClass)
      .map(a => a.subject);
  }, [mode, selectedClass, assignments, user?.uid]);

  // Get learners for selected class
  const { learners, isLoading: loadingLearners } = useSchoolLearners(selectedClass);

  // Local attendance state
  const [localAttendance, setLocalAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
  const [localExcuseReasons, setLocalExcuseReasons] = useState<Map<string, string>>(new Map());
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  // Set default class when classes load
  useEffect(() => {
    if (availableClasses.length > 0 && !selectedClass) {
      setSelectedClass(availableClasses[0].id);
    }
  }, [availableClasses, selectedClass]);

  // Set default subject when class changes in periodic mode
  useEffect(() => {
    if (mode === 'periodic' && availableSubjects.length > 0) {
      setSelectedSubject(availableSubjects[0]);
    }
  }, [mode, selectedClass, availableSubjects]);

  // Reset selected class when mode changes
  useEffect(() => {
    if (availableClasses.length > 0) {
      setSelectedClass(availableClasses[0].id);
    } else {
      setSelectedClass('');
    }
  }, [mode, availableClasses]);

  // Load attendance when class/date changes
  useEffect(() => {
    if (selectedClass && selectedDate) {
      loadAttendance();
    }
  }, [selectedClass, selectedDate, selectedSubject, selectedPeriod]);

  const loadAttendance = async () => {
    setLoadingAttendance(true);
    try {
      // For periodic attendance, we might want to filter by subject/period
      const records = await attendanceService.getByClassAndDate(selectedClass, selectedDate);
      setAttendanceRecords(records);
      setLocalAttendance(new Map());
      setLocalExcuseReasons(new Map());
    } catch (error) {
      console.error('Error loading attendance:', error);
    } finally {
      setLoadingAttendance(false);
    }
  };

  // Combine learners with attendance
  const studentsWithAttendance = useMemo(() => {
    if (!learners.length) return [];
    
    return learners.map(learner => {
      const record = attendanceRecords.find(r => r.studentId === learner.id);
      const localStatus = localAttendance.get(learner.id);
      
      return {
        id: learner.id,
        name: learner.name,
        studentId: learner.studentId,
        gender: learner.gender,
        classId: learner.classId,
        attendance: localStatus 
          ? { ...record, status: localStatus } as AttendanceRecord
          : record,
      };
    });
  }, [learners, attendanceRecords, localAttendance]);

  // Filter students
  const filteredStudents = useMemo(() => {
    return studentsWithAttendance
      .filter(s => !searchTerm || s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.studentId.includes(searchTerm))
      .filter(s => statusFilter === 'all' || s.attendance?.status === statusFilter)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [studentsWithAttendance, searchTerm, statusFilter]);

  // Calculate stats - FIXED: Show numbers for all students, not just filtered
  const stats = useMemo(() => {
    // Use all students with attendance, not just filtered
    const allStudents = studentsWithAttendance;
    const total = allStudents.length;
    const present = allStudents.filter(s => s.attendance?.status === 'present').length;
    const absent = allStudents.filter(s => s.attendance?.status === 'absent').length;
    const late = allStudents.filter(s => s.attendance?.status === 'late').length;
    const excused = allStudents.filter(s => s.attendance?.status === 'excused').length;
    
    return {
      total,
      present,
      absent,
      late,
      excused,
      presentCount: present + late,
      unsavedChanges: localAttendance.size
    };
  }, [studentsWithAttendance, localAttendance.size]);

  // Handle status change
  const handleStatusChange = (studentId: string, status: AttendanceStatus, reason?: string) => {
    setLocalAttendance(prev => {
      const newMap = new Map(prev);
      newMap.set(studentId, status);
      return newMap;
    });
    
    if (reason) {
      setLocalExcuseReasons(prev => {
        const newMap = new Map(prev);
        newMap.set(studentId, reason);
        return newMap;
      });
    }
    
    setSelectedStudents(prev => {
      const newSet = new Set(prev);
      newSet.delete(studentId);
      return newSet;
    });
  };

  // Handle bulk status
  const handleBulkStatus = (status: AttendanceStatus, reason?: string) => {
    if (selectedStudents.size === 0) return;
    
    setLocalAttendance(prev => {
      const newMap = new Map(prev);
      selectedStudents.forEach(id => newMap.set(id, status));
      return newMap;
    });
    
    if (reason) {
      setLocalExcuseReasons(prev => {
        const newMap = new Map(prev);
        selectedStudents.forEach(id => newMap.set(id, reason!));
        return newMap;
      });
    }
    
    setSelectedStudents(new Set());
  };

  // Save attendance
  const handleSave = async () => {
    if (localAttendance.size === 0) {
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 2000);
      return;
    }

    setIsSubmitting(true);
    try {
      const classObj = classes.find(c => c.id === selectedClass);
      const students = learners.filter(l => localAttendance.has(l.id));
      
      await attendanceService.bulkMarkAttendance({
        records: students.map(s => ({
          studentId: s.id,
          studentName: s.name,
          studentGender: s.gender,
          status: localAttendance.get(s.id)!,
          excuseReason: localExcuseReasons.get(s.id),
        })),
        classId: selectedClass,
        className: classObj?.name || '',
        date: selectedDate,
        markedBy: user?.uid || 'unknown',
        markedByName: user?.fullName || 'Teacher',
      });

      await loadAttendance();
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 2000);
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = loadingClasses || loadingLearners || loadingAttendance || loadingAssignments;

  // Debug effect to verify assignments
  useEffect(() => {
    if (user?.uid) {
      console.log('👤 Teacher UID:', user.uid);
      console.log('📚 Teacher assignments:', assignments);
      console.log('🏫 Available classes:', availableClasses);
      console.log('📖 Available subjects:', availableSubjects);
    }
  }, [user, assignments, availableClasses, availableSubjects]);

  // Error state
  if (classesError) {
    return (
      <DashboardLayout activeTab="attendance">
        <div className="p-4 text-center">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md mx-auto">
            <AlertCircle className="text-red-500 mx-auto mb-2" size={32} />
            <h3 className="font-semibold text-red-700">Failed to load classes</h3>
            <button onClick={() => refetchClasses()} className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm">
              Try Again
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Empty state
  if (!loadingClasses && classes.length === 0) {
    return (
      <DashboardLayout activeTab="attendance">
        <div className="p-4 text-center">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 max-w-md mx-auto">
            <Users className="text-yellow-500 mx-auto mb-2" size={32} />
            <h3 className="font-semibold text-yellow-700">No Classes Assigned</h3>
            <p className="text-sm text-yellow-600 mt-1">Contact your administrator to get class assignments.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="attendance">
      <div className="min-h-screen bg-gray-50 p-3 sm:p-4 lg:p-6">
        <div className="max-w-7xl mx-auto space-y-3 sm:space-y-4">
          
          {/* Header with Mode Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">Attendance Tracking</h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-1 truncate">
                {mode === 'daily' 
                  ? 'Daily Roll Call - Morning Register' 
                  : 'Periodic Attendance - Subject/Period Based'}
              </p>
              {isFormTeacher && (
                <p className="text-[10px] sm:text-xs text-blue-600 mt-1 flex items-center gap-1">
                  <GraduationCap size={10} className="sm:w-3 sm:h-3" />
                  <span className="truncate">Form Teacher for {formTeacherClass?.name}</span>
                </p>
              )}
            </div>
            <ModeToggle mode={mode} onChange={setMode} isFormTeacher={isFormTeacher} />
          </div>

          {/* Filters - Mobile Toggle */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className="w-full flex items-center justify-between p-3 sm:hidden"
            >
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Filters</span>
              </div>
              <ChevronDown size={16} className={`transition-transform ${showMobileFilters ? 'rotate-180' : ''}`} />
            </button>

            <div className={`p-3 sm:p-4 ${showMobileFilters ? 'block' : 'hidden sm:block'}`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                {/* Class Select */}
                <select
                  value={selectedClass}
                  onChange={e => setSelectedClass(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm"
                  disabled={loadingClasses || availableClasses.length === 0}
                >
                  <option value="">Select Class</option>
                  {availableClasses.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} ({cls.students} students)
                      {mode === 'daily' && cls.formTeacherId === user?.uid && ' (Form)'}
                    </option>
                  ))}
                </select>

                {/* Date Picker */}
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm"
                />

                {/* Mode-specific filters */}
                {mode === 'periodic' ? (
                  <>
                    <select
                      value={selectedSubject}
                      onChange={e => setSelectedSubject(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm"
                      disabled={availableSubjects.length === 0}
                    >
                      <option value="">Select Subject</option>
                      {availableSubjects.map(subject => (
                        <option key={subject} value={subject}>{subject}</option>
                      ))}
                    </select>
                    
                    <select
                      value={selectedPeriod}
                      onChange={e => setSelectedPeriod(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm"
                    >
                      <option value="1">Period 1</option>
                      <option value="2">Period 2</option>
                      <option value="3">Period 3</option>
                      <option value="4">Period 4</option>
                      <option value="5">Period 5</option>
                    </select>
                  </>
                ) : (
                  <>
                    <select
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm"
                    >
                      <option value="all">All Status</option>
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                      <option value="late">Late</option>
                      <option value="excused">Excused</option>
                    </select>

                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                      <input
                        type="text"
                        placeholder="Search students..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Mode Description */}
              <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-gray-100">
                <p className="text-[10px] sm:text-xs text-gray-500">
                  {mode === 'daily' 
                    ? '📋 Daily roll call - mark all students present/absent/late for the day'
                    : `📚 Periodic attendance - mark attendance for ${selectedSubject || 'selected subject'} during period ${selectedPeriod}`}
                </p>
              </div>
            </div>
          </div>

          {/* IMPROVED Stats Cards - Numbers always visible */}
          <div className="grid grid-cols-2 xs:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
            <StatCard label="Present" value={stats.presentCount} icon={<UserCheck size={14} className="sm:w-4 sm:h-4" />} color="green" />
            <StatCard label="Absent" value={stats.absent} icon={<UserX size={14} className="sm:w-4 sm:h-4" />} color="red" />
            <StatCard label="Late" value={stats.late} icon={<Clock size={14} className="sm:w-4 sm:h-4" />} color="yellow" />
            <StatCard label="Excused" value={stats.excused} icon={<AlertCircle size={14} className="sm:w-4 sm:h-4" />} color="purple" />
          </div>

          {/* Total Students Bar */}
          <div className="flex items-center justify-between px-2 sm:px-3 py-1.5 sm:py-2 bg-blue-50 rounded-lg border border-blue-100">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Users size={12} className="sm:w-4 sm:h-4 text-blue-600" />
              <span className="text-xs sm:text-sm text-blue-700 font-medium">Total Students</span>
            </div>
            <span className="text-sm sm:text-base lg:text-lg font-bold text-blue-800">{stats.total}</span>
          </div>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {stats.unsavedChanges > 0 && (
                <span className="text-xs sm:text-sm text-orange-600 bg-orange-50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg whitespace-nowrap flex items-center gap-1">
                  <Clock size={12} />
                  {stats.unsavedChanges} unsaved
                </span>
              )}
              {submitSuccess && (
                <span className="text-xs sm:text-sm text-green-600 bg-green-50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg flex items-center gap-1 whitespace-nowrap">
                  <Check size={12} /> Saved
                </span>
              )}
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={loadAttendance}
                disabled={isLoading}
                className="p-2 sm:p-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 flex-shrink-0"
                title="Refresh"
              >
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              </button>
              
              <button
                onClick={handleSave}
                disabled={isSubmitting || localAttendance.size === 0}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm whitespace-nowrap"
              >
                {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                <span>Save Changes</span>
              </button>
            </div>
          </div>

          {/* Student List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12 bg-white rounded-xl border border-gray-200">
              <Loader2 size={24} className="animate-spin text-blue-600" />
              <span className="ml-2 text-sm text-gray-600">Loading students...</span>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="px-3 sm:px-4 py-2 sm:py-3 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-4">
                    <button
                      onClick={() => {
                        if (selectedStudents.size === filteredStudents.length) {
                          setSelectedStudents(new Set());
                        } else {
                          setSelectedStudents(new Set(filteredStudents.map(s => s.id)));
                        }
                      }}
                      className={`w-4 h-4 sm:w-5 sm:h-5 border-2 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                        selectedStudents.size === filteredStudents.length && filteredStudents.length > 0
                          ? 'border-blue-600 bg-blue-600'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {selectedStudents.size === filteredStudents.length && filteredStudents.length > 0 && 
                        <Check size={10} className="sm:w-3 sm:h-3 text-white" />
                      }
                    </button>
                    <span className="text-xs sm:text-sm font-medium">
                      {selectedStudents.size > 0 ? `${selectedStudents.size} selected` : 'Select all'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm text-gray-500">
                      {filteredStudents.length} of {studentsWithAttendance.length} students
                    </span>
                    {filteredStudents.length < studentsWithAttendance.length && (
                      <button
                        onClick={() => setStatusFilter('all')}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Show all
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Student Rows - Improved layout */}
              <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                {filteredStudents.length > 0 ? (
                  filteredStudents.map(student => (
                    <div key={student.id} className={`p-3 sm:p-4 hover:bg-gray-50/50 transition-colors ${
                      selectedStudents.has(student.id) ? 'bg-blue-50/30' : ''
                    }`}>
                      <div className="flex items-start gap-2 sm:gap-3">
                        {/* Checkbox */}
                        <button
                          onClick={() => {
                            setSelectedStudents(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(student.id)) newSet.delete(student.id);
                              else newSet.add(student.id);
                              return newSet;
                            });
                          }}
                          className={`mt-1 w-4 h-4 sm:w-5 sm:h-5 border-2 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                            selectedStudents.has(student.id) 
                              ? 'border-blue-600 bg-blue-600' 
                              : 'border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          {selectedStudents.has(student.id) && <Check size={10} className="sm:w-3 sm:h-3 text-white" />}
                        </button>

                        {/* Student Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col xs:flex-row xs:items-center gap-1 xs:gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-sm sm:text-base font-medium truncate max-w-[120px] xs:max-w-[150px] sm:max-w-[200px]">
                                {student.name}
                              </span>
                              <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${
                                student.gender === 'male' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'
                              }`}>
                                {student.gender === 'male' ? 'B' : 'G'}
                              </span>
                            </div>
                            <span className="text-[10px] sm:text-xs text-gray-500 font-mono truncate">
                              {student.studentId}
                            </span>
                            {localAttendance.has(student.id) && (
                              <span className="text-[8px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full whitespace-nowrap inline-flex items-center gap-0.5">
                                <Clock size={8} />
                                Unsaved
                              </span>
                            )}
                          </div>
                          
                          {/* Status Buttons - Compact and responsive */}
                          <div className="grid grid-cols-4 gap-1 mt-2 sm:mt-3">
                            {(['present', 'absent', 'late', 'excused'] as AttendanceStatus[]).map(status => {
                              const isActive = student.attendance?.status === status;
                              const colors = {
                                present: isActive 
                                  ? 'bg-green-600 text-white border-green-600' 
                                  : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100',
                                absent: isActive 
                                  ? 'bg-red-600 text-white border-red-600' 
                                  : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
                                late: isActive 
                                  ? 'bg-yellow-600 text-white border-yellow-600' 
                                  : 'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100',
                                excused: isActive 
                                  ? 'bg-purple-600 text-white border-purple-600' 
                                  : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
                              };
                              
                              return (
                                <button
                                  key={status}
                                  onClick={() => {
                                    if (status === 'excused') {
                                      setExcuseModal({ isOpen: true, studentId: student.id, studentName: student.name });
                                    } else {
                                      handleStatusChange(student.id, status);
                                    }
                                  }}
                                  className={`px-1 sm:px-2 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-medium border transition-all flex items-center justify-center gap-0.5 sm:gap-1 ${colors[status]}`}
                                >
                                  <span className="hidden xs:inline">{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                                  <span className="xs:hidden">
                                    {status === 'present' && 'P'}
                                    {status === 'absent' && 'A'}
                                    {status === 'late' && 'L'}
                                    {status === 'excused' && 'E'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Excuse Reason */}
                          {student.attendance?.status === 'excused' && student.attendance.excuseReason && (
                            <div className="mt-2 text-[10px] sm:text-xs text-purple-600 bg-purple-50 p-2 rounded-lg flex items-start gap-1">
                              <MessageSquare size={10} className="flex-shrink-0 mt-0.5" />
                              <span className="break-words">{student.attendance.excuseReason}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-sm text-gray-500">
                    No students match your filters
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bulk Action Bar - Mobile Optimized */}
        {selectedStudents.size > 0 && (
          <div className="fixed bottom-3 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-2xl border border-gray-200 p-2 w-[calc(100%-24px)] sm:w-auto z-50">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs sm:text-sm font-medium text-gray-700 px-2">
                {selectedStudents.size} selected
              </span>
              <div className="flex gap-1 sm:gap-2 overflow-x-auto pb-0.5">
                <button
                  onClick={() => handleBulkStatus('present')}
                  className="px-2 sm:px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs sm:text-sm hover:bg-green-700 whitespace-nowrap flex items-center gap-1"
                >
                  <UserCheck size={12} />
                  <span>Present</span>
                </button>
                <button
                  onClick={() => handleBulkStatus('absent')}
                  className="px-2 sm:px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs sm:text-sm hover:bg-red-700 whitespace-nowrap flex items-center gap-1"
                >
                  <UserX size={12} />
                  <span>Absent</span>
                </button>
                <button
                  onClick={() => handleBulkStatus('late')}
                  className="px-2 sm:px-3 py-1.5 bg-yellow-600 text-white rounded-lg text-xs sm:text-sm hover:bg-yellow-700 whitespace-nowrap flex items-center gap-1"
                >
                  <Clock size={12} />
                  <span>Late</span>
                </button>
                <button
                  onClick={() => setExcuseModal({ isOpen: true, studentId: 'bulk', studentName: `${selectedStudents.size} students` })}
                  className="px-2 sm:px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs sm:text-sm hover:bg-purple-700 whitespace-nowrap flex items-center gap-1"
                >
                  <AlertCircle size={12} />
                  <span>Excuse</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Excuse Modal - Mobile Optimized */}
        {excuseModal.isOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3">
            <div className="bg-white rounded-xl max-w-md w-full p-4 sm:p-6 animate-in fade-in zoom-in duration-200">
              <h3 className="text-base sm:text-lg font-semibold mb-2">Excuse Reason</h3>
              <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4 break-words">
                {excuseModal.studentName}
              </p>
              
              <textarea
                className="w-full border-2 border-gray-200 rounded-lg p-2 sm:p-3 text-xs sm:text-sm min-h-[80px] focus:border-purple-500 focus:outline-none"
                placeholder="Enter reason for absence..."
                id="excuseReason"
                autoFocus
              />
              
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-3 sm:mt-4">
                <button
                  onClick={() => setExcuseModal({ isOpen: false })}
                  className="w-full sm:flex-1 px-4 py-2 border-2 border-gray-200 rounded-lg text-xs sm:text-sm hover:bg-gray-50 transition-colors order-2 sm:order-1"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const reason = (document.getElementById('excuseReason') as HTMLTextAreaElement).value;
                    if (reason.trim()) {
                      if (excuseModal.studentId === 'bulk') {
                        handleBulkStatus('excused', reason);
                      } else if (excuseModal.studentId) {
                        handleStatusChange(excuseModal.studentId, 'excused', reason);
                      }
                      setExcuseModal({ isOpen: false });
                    }
                  }}
                  className="w-full sm:flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg text-xs sm:text-sm hover:bg-purple-700 transition-colors order-1 sm:order-2"
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}