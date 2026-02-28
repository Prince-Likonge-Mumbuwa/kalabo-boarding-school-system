// @/pages/teacher/AttendanceTracking.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useTeacherClasses } from '@/hooks/useTeacherClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments'; // Add this import
import { useAuth } from '@/hooks/useAuth';
import { attendanceService, AttendanceRecord } from '@/services/attendanceService';
import { Timestamp } from 'firebase/firestore';
import { 
  Filter, RefreshCw, Check, X, Clock, 
  AlertCircle, MessageSquare, ChevronDown, 
  ChevronLeft, ChevronRight, Search, 
  Users, Calendar, Save, Loader2,
  UserCheck, UserX, Users as UsersIcon,
  Sun, BookOpen, GraduationCap
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
  <div className="bg-white rounded-xl p-1 border border-gray-200 inline-flex">
    {isFormTeacher && (
      <button
        onClick={() => onChange('daily')}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
          mode === 'daily' 
            ? 'bg-blue-600 text-white shadow-sm' 
            : 'text-gray-600 hover:bg-gray-100'
        }`}
      >
        <Sun size={16} />
        Daily Roll Call
      </button>
    )}
    <button
      onClick={() => onChange('periodic')}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        mode === 'periodic' 
          ? 'bg-blue-600 text-white shadow-sm' 
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <BookOpen size={16} />
      Periodic Attendance
    </button>
  </div>
);

// ==================== SIMPLE STATS CARD ====================
const StatCard = ({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) => {
  const colors = {
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  };

  return (
    <div className={`rounded-xl border p-4 ${colors[color as keyof typeof colors] || colors.blue}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-80">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className="p-2 bg-white/50 rounded-lg">
          {icon}
        </div>
      </div>
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
export default function AttendanceTracking() {
  const { user } = useAuth();
  
  // Mode state
  const [mode, setMode] = useState<AttendanceMode>('periodic'); // Default to periodic for subject teachers
  
  // Basic states
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | 'all'>('all');
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  
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

  // Get teacher's assignments for subjects
  const { 
    assignments = [], 
    isLoading: loadingAssignments 
  } = useTeacherAssignments(user?.id);

  // Find if teacher is a form teacher and which class
  const formTeacherClass = useMemo(() => {
    return classes.find(cls => cls.formTeacherId === user?.id);
  }, [classes, user?.id]);

  const isFormTeacher = !!formTeacherClass;

  // Filter available classes based on mode
  const availableClasses = useMemo(() => {
    if (mode === 'daily') {
      // Daily mode: Only show form teacher's class
      return formTeacherClass ? [formTeacherClass] : [];
    } else {
      // Periodic mode: Show all classes the teacher teaches (based on assignments)
      const classIds = assignments.map(a => a.classId);
      return classes.filter(cls => classIds.includes(cls.id));
    }
  }, [mode, formTeacherClass, classes, assignments]);

  // Get available subjects for selected class in periodic mode
  const availableSubjects = useMemo(() => {
    if (mode !== 'periodic' || !selectedClass || !user?.id) return [];
    
    // Filter assignments by teacher ID and class ID
    return assignments
      .filter(a => a.teacherId === user.id && a.classId === selectedClass)
      .map(a => a.subject);
  }, [mode, selectedClass, assignments, user?.id]);

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
  }, [selectedClass, selectedDate]);

  const loadAttendance = async () => {
    setLoadingAttendance(true);
    try {
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

  // Calculate stats
  const stats = useMemo(() => {
    const total = filteredStudents.length;
    const present = filteredStudents.filter(s => s.attendance?.status === 'present').length;
    const absent = filteredStudents.filter(s => s.attendance?.status === 'absent').length;
    const late = filteredStudents.filter(s => s.attendance?.status === 'late').length;
    const excused = filteredStudents.filter(s => s.attendance?.status === 'excused').length;
    
    return {
      total,
      present,
      absent,
      late,
      excused,
      presentCount: present + late,
      unsavedChanges: localAttendance.size
    };
  }, [filteredStudents, localAttendance.size]);

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
        markedBy: user?.id || 'unknown',
        markedByName: user?.name || 'Teacher',
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

  // Show form teacher info
  if (isFormTeacher) {
    console.log(`👨‍🏫 Teacher is Form Teacher for ${formTeacherClass?.name}`);
  }

  return (
    <DashboardLayout activeTab="attendance">
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto space-y-4">
          
          {/* Header with Mode Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Attendance Tracking</h1>
              <p className="text-sm text-gray-500 mt-1">
                {mode === 'daily' 
                  ? 'Daily Roll Call - Morning Register' 
                  : 'Periodic Attendance - Subject/Period Based'}
              </p>
              {isFormTeacher && (
                <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                  <GraduationCap size={12} />
                  Form Teacher for {formTeacherClass?.name}
                </p>
              )}
            </div>
            <ModeToggle mode={mode} onChange={setMode} isFormTeacher={isFormTeacher} />
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* Class Select - Now based on mode */}
              <select
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                disabled={loadingClasses || availableClasses.length === 0}
              >
                <option value="">Select Class</option>
                {availableClasses.map(cls => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({cls.students} students)
                    {mode === 'daily' && cls.formTeacherId === user?.id && ' (Form Class)'}
                  </option>
                ))}
              </select>

              {/* Date Picker */}
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />

              {/* Mode-specific filters */}
              {mode === 'periodic' ? (
                <>
                  <select
                    value={selectedSubject}
                    onChange={e => setSelectedSubject(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="all">All Status</option>
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="late">Late</option>
                    <option value="excused">Excused</option>
                  </select>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      type="text"
                      placeholder="Search students..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Mode Description */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                {mode === 'daily' 
                  ? '📋 Daily roll call - mark all students present/absent/late for the day'
                  : `📚 Periodic attendance - mark attendance for ${selectedSubject || 'selected subject'} during period ${selectedPeriod}`}
              </p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="Present" value={stats.presentCount} icon={<UserCheck size={20} />} color="green" />
            <StatCard label="Absent" value={stats.absent} icon={<UserX size={20} />} color="red" />
            <StatCard label="Late" value={stats.late} icon={<Clock size={20} />} color="yellow" />
            <StatCard label="Excused" value={stats.excused} icon={<AlertCircle size={20} />} color="purple" />
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {stats.unsavedChanges > 0 && (
                <span className="text-sm text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg">
                  {stats.unsavedChanges} unsaved change{stats.unsavedChanges !== 1 ? 's' : ''}
                </span>
              )}
              {submitSuccess && (
                <span className="text-sm text-green-600 bg-green-50 px-3 py-1.5 rounded-lg flex items-center gap-1">
                  <Check size={14} /> Saved
                </span>
              )}
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={loadAttendance}
                disabled={isLoading}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
              </button>
              
              <button
                onClick={handleSave}
                disabled={isSubmitting || localAttendance.size === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save Changes
              </button>
            </div>
          </div>

          {/* Student List */}
          {isLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => {
                        if (selectedStudents.size === filteredStudents.length) {
                          setSelectedStudents(new Set());
                        } else {
                          setSelectedStudents(new Set(filteredStudents.map(s => s.id)));
                        }
                      }}
                      className="w-5 h-5 border-2 rounded flex items-center justify-center"
                    >
                      {selectedStudents.size === filteredStudents.length && filteredStudents.length > 0 && 
                        <Check size={12} className="text-blue-600" />
                      }
                    </button>
                    <span className="text-sm font-medium">{selectedStudents.size} selected</span>
                  </div>
                  <span className="text-sm text-gray-500">{filteredStudents.length} students</span>
                </div>
              </div>

              {/* Student Rows */}
              <div className="divide-y divide-gray-100">
                {filteredStudents.map(student => (
                  <div key={student.id} className={`p-4 ${selectedStudents.has(student.id) ? 'bg-blue-50/50' : ''}`}>
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => {
                          setSelectedStudents(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has(student.id)) newSet.delete(student.id);
                            else newSet.add(student.id);
                            return newSet;
                          });
                        }}
                        className={`mt-1 w-5 h-5 border-2 rounded flex items-center justify-center ${
                          selectedStudents.has(student.id) ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                        }`}
                      >
                        {selectedStudents.has(student.id) && <Check size={12} className="text-white" />}
                      </button>

                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{student.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            student.gender === 'male' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'
                          }`}>
                            {student.gender === 'male' ? 'B' : 'G'}
                          </span>
                          {localAttendance.has(student.id) && (
                            <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full">
                              Unsaved
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">{student.studentId}</p>
                      </div>

                      {/* Status Buttons */}
                      <div className="flex gap-1">
                        {(['present', 'absent', 'late', 'excused'] as AttendanceStatus[]).map(status => {
                          const isActive = student.attendance?.status === status;
                          const colors = {
                            present: isActive ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100',
                            absent: isActive ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100',
                            late: isActive ? 'bg-yellow-600 text-white' : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100',
                            excused: isActive ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100',
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
                              className={`w-9 h-9 rounded-full text-xs font-medium transition-all ${colors[status]}`}
                            >
                              {status === 'present' && 'P'}
                              {status === 'absent' && 'A'}
                              {status === 'late' && 'L'}
                              {status === 'excused' && 'E'}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Excuse Reason */}
                    {student.attendance?.status === 'excused' && student.attendance.excuseReason && (
                      <div className="mt-2 ml-12 text-xs text-purple-600 bg-purple-50 p-2 rounded-lg">
                        <MessageSquare size={12} className="inline mr-1" />
                        {student.attendance.excuseReason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bulk Action Bar */}
        {selectedStudents.size > 0 && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-2xl border border-gray-200 p-3 flex gap-2">
            <button
              onClick={() => handleBulkStatus('present')}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
            >
              Mark Present
            </button>
            <button
              onClick={() => handleBulkStatus('absent')}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
            >
              Mark Absent
            </button>
            <button
              onClick={() => handleBulkStatus('late')}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm hover:bg-yellow-700"
            >
              Mark Late
            </button>
            <button
              onClick={() => setExcuseModal({ isOpen: true, studentId: 'bulk', studentName: `${selectedStudents.size} students` })}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
            >
              Excuse
            </button>
          </div>
        )}

        {/* Excuse Modal */}
        {excuseModal.isOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6">
              <h3 className="font-semibold text-lg mb-2">Excuse Reason</h3>
              <p className="text-sm text-gray-600 mb-4">{excuseModal.studentName}</p>
              
              <textarea
                className="w-full border-2 border-gray-200 rounded-lg p-3 text-sm min-h-[100px]"
                placeholder="Enter reason..."
                id="excuseReason"
              />
              
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setExcuseModal({ isOpen: false })}
                  className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-lg text-sm"
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
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm"
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