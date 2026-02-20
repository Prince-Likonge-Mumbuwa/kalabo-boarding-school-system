// @/pages/teacher/AttendanceTracking.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { attendanceService, AttendanceRecord } from '@/services/attendanceService';
import { Timestamp } from 'firebase/firestore';
import { 
  Filter, RefreshCw, Check, X, Clock, 
  AlertCircle, MessageSquare, ChevronDown, 
  ChevronLeft, ChevronRight, Search, 
  Users, Calendar, Save, Loader2
} from 'lucide-react';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

interface StudentWithAttendance {
  id: string;
  name: string;
  studentId: string;
  gender?: 'male' | 'female';
  classId: string;
  attendance?: AttendanceRecord;
}

// ==================== CUSTOM EXCUSE MODAL ====================
interface ExcuseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  studentName?: string;
}

const ExcuseModal = ({ isOpen, onClose, onSubmit, studentName }: ExcuseModalProps) => {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const commonReasons = [
    'Medical appointment',
    'Sick - Medical certificate',
    'Family emergency',
    'Transport issues',
    'Religious observance',
    'School event',
    'Bereavement'
  ];

  if (!isOpen) return null;

  const handleSubmit = () => {
    const finalReason = showCustom ? customReason : reason;
    if (finalReason.trim()) {
      onSubmit(finalReason.trim());
      setReason('');
      setCustomReason('');
      setShowCustom(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Excuse Reason</h3>
          {studentName && (
            <p className="text-sm text-gray-500 mt-1">for {studentName}</p>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {!showCustom ? (
            <div className="space-y-2">
              {commonReasons.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all
                    ${reason === r 
                      ? 'bg-purple-50 text-purple-700 border-2 border-purple-200' 
                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                    }`}
                >
                  {r}
                </button>
              ))}
              <button
                onClick={() => setShowCustom(true)}
                className="w-full text-left px-4 py-3 rounded-xl text-sm text-blue-600 
                         bg-blue-50 border border-blue-200 hover:bg-blue-100
                         transition-colors"
              >
                + Write custom reason
              </button>
            </div>
          ) : (
            <div>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Enter the reason for excused absence..."
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm
                         focus:ring-2 focus:ring-purple-500 focus:border-transparent
                         min-h-[120px] resize-none"
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm
                     font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason && !customReason}
            className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm
                     font-medium hover:bg-purple-700 transition-colors 
                     disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== STATUS BUTTON ====================
interface StatusButtonProps {
  status: AttendanceStatus;
  currentStatus?: AttendanceStatus;
  onSelect: () => void;
  disabled?: boolean;
}

const StatusButton = ({ status, currentStatus, onSelect, disabled }: StatusButtonProps) => {
  const isActive = currentStatus === status;
  
  const config = {
    present: {
      active: 'bg-green-100 border-green-300 text-green-700',
      inactive: 'bg-white border-gray-200 text-gray-500 hover:border-green-300 hover:bg-green-50',
      icon: Check,
      label: 'P'
    },
    absent: {
      active: 'bg-red-100 border-red-300 text-red-700',
      inactive: 'bg-white border-gray-200 text-gray-500 hover:border-red-300 hover:bg-red-50',
      icon: X,
      label: 'A'
    },
    late: {
      active: 'bg-yellow-100 border-yellow-300 text-yellow-700',
      inactive: 'bg-white border-gray-200 text-gray-500 hover:border-yellow-300 hover:bg-yellow-50',
      icon: Clock,
      label: 'L'
    },
    excused: {
      active: 'bg-purple-100 border-purple-300 text-purple-700',
      inactive: 'bg-white border-gray-200 text-gray-500 hover:border-purple-300 hover:bg-purple-50',
      icon: AlertCircle,
      label: 'E'
    }
  };

  const { active, inactive, icon: Icon, label } = config[status];

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`
        w-10 h-10 rounded-full border-2 flex items-center justify-center
        transition-all duration-200 flex-shrink-0
        ${isActive ? active : inactive}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110 active:scale-95'}
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
      `}
      title={status.charAt(0).toUpperCase() + status.slice(1)}
    >
      <Icon size={16} />
      <span className="sr-only">{label}</span>
    </button>
  );
};

// ==================== SKELETON LOADERS ====================
const StatsSkeleton = () => (
  <>
    {[1, 2, 3].map(i => (
      <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm animate-pulse">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
            <div className="h-8 bg-gray-300 rounded w-16 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-32"></div>
          </div>
          <div className="w-12 h-12 bg-gray-200 rounded-xl"></div>
        </div>
      </div>
    ))}
  </>
);

const StudentRowSkeleton = () => (
  <div className="p-4 border-b border-gray-100 animate-pulse">
    <div className="flex items-start gap-3">
      <div className="mt-1 w-5 h-5 bg-gray-200 rounded border-2 border-gray-200"></div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <div className="w-5 h-4 bg-gray-200 rounded"></div>
          <div className="h-5 bg-gray-200 rounded w-32"></div>
          <div className="w-12 h-5 bg-gray-200 rounded-full"></div>
        </div>
        <div className="h-3 bg-gray-200 rounded w-24 mt-2 ml-7"></div>
      </div>
    </div>
    <div className="mt-4 ml-7 flex gap-2">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="w-10 h-10 bg-gray-200 rounded-full"></div>
      ))}
    </div>
  </div>
);

const TableSkeleton = () => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-5 h-5 bg-gray-200 rounded border-2 border-gray-200"></div>
          <div className="h-4 bg-gray-200 rounded w-24"></div>
        </div>
        <div className="h-4 bg-gray-200 rounded w-40"></div>
      </div>
    </div>
    <div className="divide-y divide-gray-100">
      {[1, 2, 3, 4, 5].map(i => (
        <StudentRowSkeleton key={i} />
      ))}
    </div>
  </div>
);

// ==================== MAIN COMPONENT ====================
export default function AttendanceTracking() {
  // State
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | 'all'>('all');
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  
  // Excuse modal state
  const [excuseModal, setExcuseModal] = useState<{
    isOpen: boolean;
    studentId?: string;
    studentName?: string;
    gender?: 'male' | 'female';
  }>({ isOpen: false });

  // Hooks
  const { classes, isLoading: loadingClasses } = useSchoolClasses();
  const { learners, isLoading: loadingLearners } = useSchoolLearners(selectedClass);

  // Local attendance state (unsaved changes)
  const [localAttendance, setLocalAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
  const [localExcuseReasons, setLocalExcuseReasons] = useState<Map<string, string>>(new Map());
  
  // Fetched attendance records
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  // Set default class when classes load
  useEffect(() => {
    if (classes.length > 0 && !selectedClass) {
      setSelectedClass(classes[0].id);
    }
  }, [classes, selectedClass]);

  // Fetch attendance records
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
      
      // Clear local changes when loading new data
      setLocalAttendance(new Map());
      setLocalExcuseReasons(new Map());
    } catch (error) {
      console.error('Error loading attendance:', error);
    } finally {
      setLoadingAttendance(false);
    }
  };

  // Combine learners with attendance data and local changes
  const studentsWithAttendance: StudentWithAttendance[] = useMemo(() => {
    if (!learners.length) return [];
    
    return learners.map(learner => {
      const serverRecord = attendanceRecords.find(r => r.studentId === learner.id);
      const localStatus = localAttendance.get(learner.id);
      const localExcuse = localExcuseReasons.get(learner.id);
      
      // If there's a local change, use it; otherwise use server record
      let attendance: AttendanceRecord | undefined;
      if (localStatus) {
        attendance = {
          ...serverRecord,
          studentId: learner.id,
          studentName: learner.name,
          classId: learner.classId,
          date: selectedDate,
          status: localStatus,
          excuseReason: localExcuse,
          markedBy: 'current-teacher-id',
          markedByName: 'Current Teacher',
          timestamp: Timestamp.now(),
        } as AttendanceRecord;
      } else {
        attendance = serverRecord;
      }
      
      return {
        id: learner.id,
        name: learner.name,
        studentId: learner.studentId,
        gender: learner.gender,
        classId: learner.classId,
        attendance,
      };
    });
  }, [learners, attendanceRecords, localAttendance, localExcuseReasons, selectedDate]);

  // Filter students
  const filteredStudents = useMemo(() => {
    return studentsWithAttendance
      .filter(student => {
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          return student.name.toLowerCase().includes(term) || 
                 student.studentId.toLowerCase().includes(term);
        }
        return true;
      })
      .filter(student => {
        if (statusFilter === 'all') return true;
        return student.attendance?.status === statusFilter;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [studentsWithAttendance, searchTerm, statusFilter]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = filteredStudents.length;
    const present = filteredStudents.filter(s => s.attendance?.status === 'present').length;
    const absent = filteredStudents.filter(s => s.attendance?.status === 'absent').length;
    const late = filteredStudents.filter(s => s.attendance?.status === 'late').length;
    const excused = filteredStudents.filter(s => s.attendance?.status === 'excused').length;
    
    const totalPresent = present + late;
    
    const boysPresent = filteredStudents.filter(
      s => s.gender === 'male' && (s.attendance?.status === 'present' || s.attendance?.status === 'late')
    ).length;
    
    const girlsPresent = filteredStudents.filter(
      s => s.gender === 'female' && (s.attendance?.status === 'present' || s.attendance?.status === 'late')
    ).length;
    
    const totalAbsent = absent + excused;
    
    const boys = filteredStudents.filter(s => s.gender === 'male').length;
    const girls = filteredStudents.filter(s => s.gender === 'female').length;
    
    // Count unsaved changes
    const unsavedChanges = localAttendance.size;
    
    return {
      total,
      totalPresent,
      boysPresent,
      girlsPresent,
      totalAbsent,
      present,
      absent,
      late,
      excused,
      boys,
      girls,
      unsavedChanges
    };
  }, [filteredStudents, localAttendance.size]);

  // Pagination
  const totalPages = Math.ceil(filteredStudents.length / pageSize);
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStudents.slice(start, start + pageSize);
  }, [filteredStudents, currentPage, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, selectedClass, selectedDate]);

  // Handle status selection (local only)
  const handleStatusSelect = useCallback((
    studentId: string,
    status: AttendanceStatus,
    reason?: string
  ) => {
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

    // Remove from selection if present
    setSelectedStudents(prev => {
      const newSet = new Set(prev);
      newSet.delete(studentId);
      return newSet;
    });
  }, []);

  // Handle bulk status selection (local only)
  const handleBulkSelect = useCallback((status: AttendanceStatus, reason?: string) => {
    if (selectedStudents.size === 0) return;

    setLocalAttendance(prev => {
      const newMap = new Map(prev);
      selectedStudents.forEach(studentId => {
        newMap.set(studentId, status);
      });
      return newMap;
    });

    if (reason) {
      setLocalExcuseReasons(prev => {
        const newMap = new Map(prev);
        selectedStudents.forEach(studentId => {
          newMap.set(studentId, reason);
        });
        return newMap;
      });
    }

    setSelectedStudents(new Set());
  }, [selectedStudents]);

  // Handle submit to Firestore
  const handleSubmit = useCallback(async () => {
    if (localAttendance.size === 0) {
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 2000);
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedClassObj = classes.find(c => c.id === selectedClass);
      const students = learners.filter(l => localAttendance.has(l.id));
      
      // Prepare records for bulk submission
      const records = students.map(student => ({
        studentId: student.id,
        studentName: student.name,
        studentGender: student.gender,
        status: localAttendance.get(student.id)!,
        excuseReason: localExcuseReasons.get(student.id),
      }));

      await attendanceService.bulkMarkAttendance({
        records,
        classId: selectedClass,
        className: selectedClassObj?.name || '',
        date: selectedDate,
        markedBy: 'current-teacher-id',
        markedByName: 'Current Teacher',
      });

      // Reload attendance to get fresh data
      await loadAttendance();
      
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 2000);
    } catch (error) {
      console.error('Error submitting attendance:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [localAttendance, localExcuseReasons, selectedClass, selectedDate, classes, learners]);

  // Handle select all
  const handleSelectAll = useCallback(() => {
    if (selectedStudents.size === paginatedStudents.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(paginatedStudents.map(s => s.id)));
    }
  }, [paginatedStudents, selectedStudents.size]);

  // Toggle student selection
  const toggleSelectStudent = useCallback((studentId: string) => {
    setSelectedStudents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(studentId)) {
        newSet.delete(studentId);
      } else {
        newSet.add(studentId);
      }
      return newSet;
    });
  }, []);

  // Loading state
  const isLoading = loadingClasses || loadingLearners || loadingAttendance;

  return (
    <DashboardLayout activeTab="attendance">
      <div className="min-h-screen bg-gray-50 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                Attendance
              </h1>
              <p className="text-sm text-gray-500 mt-1 flex items-center gap-2">
                <Calendar size={14} className="text-gray-400" />
                {new Date(selectedDate).toLocaleDateString('en-US', { 
                  weekday: 'short', 
                  month: 'short', 
                  day: 'numeric',
                  year: 'numeric'
                })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {stats.unsavedChanges > 0 && (
                <span className="text-sm text-orange-600 bg-orange-50 px-3 py-2 rounded-xl 
                               flex items-center gap-1 border border-orange-200">
                  <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
                  {stats.unsavedChanges} unsaved
                </span>
              )}
              {submitSuccess && (
                <span className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded-xl 
                               flex items-center gap-1 border border-green-200">
                  <Check size={16} /> Saved
                </span>
              )}
              <button
                onClick={loadAttendance}
                disabled={isLoading}
                className="p-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl 
                         hover:bg-gray-50 transition-colors disabled:opacity-50
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                title="Refresh"
              >
                <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || localAttendance.size === 0}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-xl 
                         hover:bg-blue-700 transition-colors disabled:opacity-50 
                         disabled:cursor-not-allowed flex items-center gap-2
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {isSubmitting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Save size={18} />
                )}
                <span className="hidden sm:inline">Save Changes</span>
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
            <button
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className="w-full flex items-center justify-between p-4 sm:hidden"
            >
              <div className="flex items-center gap-3">
                <Filter size={18} className="text-gray-400" />
                <span className="font-medium text-gray-700">Filters</span>
              </div>
              <ChevronDown size={18} className={`transition-transform ${showMobileFilters ? 'rotate-180' : ''}`} />
            </button>

            <div className={`p-4 ${showMobileFilters ? 'block' : 'hidden sm:block'}`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <select
                  value={selectedClass}
                  onChange={e => setSelectedClass(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           bg-white appearance-none cursor-pointer"
                  disabled={loadingClasses}
                >
                  <option value="">Select Class</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} · {cls.students} students
                    </option>
                  ))}
                </select>
                
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           bg-white appearance-none cursor-pointer"
                >
                  <option value="all">All statuses</option>
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="late">Late</option>
                  <option value="excused">Excused</option>
                </select>

                <div className="relative">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search students..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 3 Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {isLoading ? (
              <StatsSkeleton />
            ) : (
              <>
                {/* Card 1: Total Present */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Present</p>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-3xl font-bold text-gray-900">{stats.totalPresent}</span>
                        <span className="text-sm text-gray-400">/ {stats.total}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 flex items-center gap-2">
                        <span className="flex items-center gap-1">👦 {stats.boysPresent}</span>
                        <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                        <span className="flex items-center gap-1">👧 {stats.girlsPresent}</span>
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center">
                      <Check size={24} className="text-green-600" />
                    </div>
                  </div>
                </div>
                
                {/* Card 2: Total Absent */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Absent</p>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-3xl font-bold text-gray-900">{stats.totalAbsent}</span>
                        <span className="text-sm text-gray-400">/ {stats.total}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 flex items-center gap-2">
                        <span className="flex items-center gap-1">❌ {stats.absent}</span>
                        <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                        <span className="flex items-center gap-1">⚠️ {stats.excused}</span>
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center">
                      <X size={24} className="text-red-600" />
                    </div>
                  </div>
                </div>
                
                {/* Card 3: Class Distribution */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Class</p>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-3xl font-bold text-gray-900">{stats.total}</span>
                        <span className="text-sm text-gray-400">total</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 flex items-center gap-2">
                        <span className="flex items-center gap-1">👦 {stats.boys}</span>
                        <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                        <span className="flex items-center gap-1">👧 {stats.girls}</span>
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center">
                      <Users size={24} className="text-blue-600" />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Attendance Table */}
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Table Header */}
              <div className="px-4 py-3 bg-gray-50/80 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleSelectAll}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                        ${selectedStudents.size === paginatedStudents.length && paginatedStudents.length > 0
                          ? 'bg-blue-600 border-blue-600' 
                          : 'border-gray-300 hover:border-blue-400 bg-white'
                        }`}
                    >
                      {selectedStudents.size === paginatedStudents.length && paginatedStudents.length > 0 && 
                        <Check size={12} className="text-white" />
                      }
                    </button>
                    <span className="text-sm font-medium text-gray-700">
                      {selectedStudents.size} selected
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">
                      {filteredStudents.length} students
                    </span>
                    <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                      {stats.present} P · {stats.late} L · {stats.absent} A · {stats.excused} E
                    </span>
                  </div>
                </div>
              </div>

              {/* Student List */}
              {paginatedStudents.length === 0 ? (
                <div className="p-12 text-center">
                  <Users size={40} className="text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">No students found</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {paginatedStudents.map((student, index) => {
                    const currentStatus = student.attendance?.status;
                    const hasUnsaved = localAttendance.has(student.id);
                    
                    return (
                      <div 
                        key={student.id}
                        className={`p-4 transition-colors ${
                          selectedStudents.has(student.id) ? 'bg-blue-50/50' : ''
                        } ${hasUnsaved ? 'bg-orange-50/30' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Selection Checkbox */}
                          <button
                            onClick={() => toggleSelectStudent(student.id)}
                            className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors
                              ${selectedStudents.has(student.id) 
                                ? 'bg-blue-600 border-blue-600' 
                                : 'border-gray-300 hover:border-blue-400 bg-white'
                              }`}
                          >
                            {selectedStudents.has(student.id) && <Check size={12} className="text-white" />}
                          </button>

                          {/* Student Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium text-gray-400 w-5">
                                {(currentPage - 1) * pageSize + index + 1}
                              </span>
                              <p className="font-medium text-gray-900">{student.name}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                student.gender === 'male' 
                                  ? 'bg-blue-100 text-blue-700' 
                                  : 'bg-pink-100 text-pink-700'
                              }`}>
                                {student.gender === 'male' ? 'B' : 'G'}
                              </span>
                              {hasUnsaved && (
                                <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full">
                                  Unsaved
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 font-mono mt-1 ml-7">{student.studentId}</p>
                            
                            {/* Excuse Reason */}
                            {student.attendance?.status === 'excused' && student.attendance.excuseReason && (
                              <div className="mt-2 ml-7 flex items-start gap-1.5 text-xs text-purple-600 
                                            bg-purple-50 px-3 py-2 rounded-xl border border-purple-100">
                                <MessageSquare size={12} className="mt-0.5 flex-shrink-0" />
                                <span className="line-clamp-2">{student.attendance.excuseReason}</span>
                              </div>
                            )}
                          </div>

                          {/* Status Badge for Mobile */}
                          <div className="sm:hidden">
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              currentStatus === 'present' ? 'bg-green-100 text-green-700' :
                              currentStatus === 'absent' ? 'bg-red-100 text-red-700' :
                              currentStatus === 'late' ? 'bg-yellow-100 text-yellow-700' :
                              currentStatus === 'excused' ? 'bg-purple-100 text-purple-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>
                              {currentStatus ? currentStatus.charAt(0).toUpperCase() : '?'}
                            </span>
                          </div>
                        </div>

                        {/* Status Buttons */}
                        <div className="mt-4 ml-7 flex gap-2">
                          <StatusButton
                            status="present"
                            currentStatus={currentStatus}
                            onSelect={() => handleStatusSelect(student.id, 'present')}
                            disabled={isSubmitting}
                          />
                          <StatusButton
                            status="absent"
                            currentStatus={currentStatus}
                            onSelect={() => handleStatusSelect(student.id, 'absent')}
                            disabled={isSubmitting}
                          />
                          <StatusButton
                            status="late"
                            currentStatus={currentStatus}
                            onSelect={() => handleStatusSelect(student.id, 'late')}
                            disabled={isSubmitting}
                          />
                          <StatusButton
                            status="excused"
                            currentStatus={currentStatus}
                            onSelect={() => setExcuseModal({
                              isOpen: true,
                              studentId: student.id,
                              studentName: student.name,
                              gender: student.gender
                            })}
                            disabled={isSubmitting}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {filteredStudents.length > pageSize && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-gray-50/80 border-t border-gray-200">
                  <div className="flex items-center gap-3">
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white
                               focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <span className="text-sm text-gray-600">
                      {Math.min((currentPage - 1) * pageSize + 1, filteredStudents.length)}-
                      {Math.min(currentPage * pageSize, filteredStudents.length)} of {filteredStudents.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 
                               disabled:cursor-not-allowed hover:bg-gray-50 bg-white
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm font-medium px-2">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 
                               disabled:cursor-not-allowed hover:bg-gray-50 bg-white
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-green-600 rounded-full"></span>
              Present
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-red-600 rounded-full"></span>
              Absent
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-yellow-500 rounded-full"></span>
              Late
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-purple-600 rounded-full"></span>
              Excused
            </span>
          </div>
        </div>

        {/* Batch Update Bar */}
        {selectedStudents.size > 0 && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md 
                        bg-white rounded-2xl shadow-2xl p-4 animate-slide-up z-30 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-900">
                {selectedStudents.size} student{selectedStudents.size > 1 ? 's' : ''} selected
              </span>
              <button 
                onClick={() => setSelectedStudents(new Set())} 
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              <button
                onClick={() => handleBulkSelect('present')}
                disabled={isSubmitting}
                className="px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium 
                         flex items-center gap-2 hover:bg-green-700 transition-colors flex-shrink-0
                         focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              >
                <Check size={16} /> Present
              </button>
              <button
                onClick={() => handleBulkSelect('absent')}
                disabled={isSubmitting}
                className="px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium 
                         flex items-center gap-2 hover:bg-red-700 transition-colors flex-shrink-0
                         focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                <X size={16} /> Absent
              </button>
              <button
                onClick={() => handleBulkSelect('late')}
                disabled={isSubmitting}
                className="px-4 py-2.5 bg-yellow-500 text-white rounded-xl text-sm font-medium 
                         flex items-center gap-2 hover:bg-yellow-600 transition-colors flex-shrink-0
                         focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2"
              >
                <Clock size={16} /> Late
              </button>
              <button
                onClick={() => {
                  setExcuseModal({
                    isOpen: true,
                    studentId: 'bulk',
                    studentName: `${selectedStudents.size} students`
                  });
                }}
                disabled={isSubmitting}
                className="px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium 
                         flex items-center gap-2 hover:bg-purple-700 transition-colors flex-shrink-0
                         focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
              >
                <AlertCircle size={16} /> Excused
              </button>
            </div>
          </div>
        )}

        {/* Excuse Modal */}
        <ExcuseModal
          isOpen={excuseModal.isOpen}
          onClose={() => setExcuseModal({ isOpen: false })}
          onSubmit={(reason) => {
            if (excuseModal.studentId === 'bulk') {
              handleBulkSelect('excused', reason);
            } else if (excuseModal.studentId) {
              handleStatusSelect(excuseModal.studentId, 'excused', reason);
            }
          }}
          studentName={excuseModal.studentName}
        />
      </div>

      <style>{`
        @keyframes slide-up {
          from {
            transform: translate(-50%, 100%);
            opacity: 0;
          }
          to {
            transform: translate(-50%, 0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.2s ease-out;
        }
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </DashboardLayout>
  );
}