// @/pages/teacher/AttendanceTracking.tsx
//
// ============================================================================
//  TEACHER — ATTENDANCE TRACKING
// ============================================================================
//
//  CHANGES FOR THE TIMETABLE FEATURE
//  ─────────────────────────────────
//  The period picker is now driven by the teacher's timetable instead of a
//  hardcoded 1..8 list:
//
//    • Periodic mode: periods come from `useTodayTimetable(uid)` — only the
//      periods THIS teacher actually operates today, one row per period with
//      its subject already attached. The subject field is read-only.
//    • A "current period" chip pre-selects the period the teacher is in right
//      now, so the common case is one click.
//    • A holiday banner appears on public/school holidays and disables
//      periodic marking.
//    • A "no timetable yet" state explains what to do when nothing is
//      scheduled for today.
//
//  Daily Roll Call is untouched except for the same holiday block.
//  Marking, bulk actions, excuse modal, delete flow, and export are all
//  unchanged. The service contract (markSession / deleteSession) is the same.
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useTeacherClasses } from '@/hooks/useTeacherClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';
import { useAuth } from '@/hooks/useAuth';
import { attendanceService } from '@/services/attendanceService';
import * as assignmentEngine from '@/services/assignmentEngine';
import type { AttendanceStatus } from '@/types/attendance';
import {
  useAttendanceSession,
  useRecentSessions,
  useSessionsForDate,
  useSessionDraft,
  useInvalidateSessionCaches,
  useDeleteSession,
  buildLastStatusMap,
} from '@/hooks/useAttendanceSession';

// ── Timetable integration ──────────────────────────────────────────
import {
  useTodayTimetable,
  useCurrentPeriod,
  useHolidayCovering,
} from '@/hooks/useTimetable';
import type { ResolvedTimetableEntry } from '@/types/timetable';

import { CompactStats } from '@/components/attendance/CompactStats';
import { PeriodicOverview } from '@/components/attendance/PeriodicOverview';
import { RiskAnalyticsTab } from '@/components/attendance/RiskAnalyticsTab';
import { HolidayBanner } from '@/components/timetable/TimetableShared';
import { exportAttendanceRecords, type AttendanceExportRow } from '@/utils/exportUtils';
import { formatLocalYMD } from '@/services/schoolService';
import {
  Filter, RefreshCw, Check, Clock,
  AlertCircle, MessageSquare, ChevronDown,
  Search, Users, Save, Loader2,
  UserCheck, UserX, Sun, BookOpen, GraduationCap,
  Download, BarChart3, Calendar, Trash2,
  Info,
} from 'lucide-react';

type AttendanceMode = 'daily' | 'periodic';
type TabType = 'mark' | 'analytics' | 'overview';
type StatusFilter = AttendanceStatus | 'all' | 'unmarked';

// ==================== MODE TOGGLE ====================
const ModeToggle = ({
  mode,
  onChange,
  isFormTeacher,
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

// ==================== TAB NAVIGATION ====================
const TabNavigation = ({
  activeTab,
  onChange,
  isFormTeacher,
}: {
  activeTab: TabType;
  onChange: (tab: TabType) => void;
  isFormTeacher: boolean;
}) => (
  <div className="flex items-center gap-1 border-b border-gray-200 mb-4">
    <button
      onClick={() => onChange('mark')}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        activeTab === 'mark'
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      Mark Attendance
    </button>

    {isFormTeacher && (
      <>
        <button
          onClick={() => onChange('overview')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${
            activeTab === 'overview'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Calendar size={16} />
          Periodic Overview
        </button>

        <button
          onClick={() => onChange('analytics')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${
            activeTab === 'analytics'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <BarChart3 size={16} />
          Analytics & Risk
        </button>
      </>
    )}
  </div>
);

// ==================== MAIN COMPONENT ====================
export default function AttendanceTracking() {
  const { user } = useAuth();
  const invalidateSessionCaches = useInvalidateSessionCaches();
  const deleteSession = useDeleteSession();

  // ── Mode and tab state ─────────────────────────────────────────────
  const [mode, setMode] = useState<AttendanceMode>('periodic');
  const [activeTab, setActiveTab] = useState<TabType>('mark');

  // ── Selection state ────────────────────────────────────────────────
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => formatLocalYMD(new Date()));
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('1');

  // ── UI state ───────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [excuseModal, setExcuseModal] = useState<{
    isOpen: boolean;
    studentId?: string;
    studentName?: string;
  }>({ isOpen: false });
  const [excuseReasonText, setExcuseReasonText] = useState('');

  // ── Data sources ───────────────────────────────────────────────────
  const {
    data: teacherClasses = [],
    isLoading: loadingClasses,
    error: classesError,
    refetch: refetchClasses,
  } = useTeacherClasses();

  const { assignments = [], isLoading: loadingAssignments } = useTeacherAssignments(user?.uid);

  // ── Timetable: today's schedule + current period + holiday check ──
  const todayTimetableQ = useTodayTimetable();
  const currentPeriodQ = useCurrentPeriod();
  const holidayQ = useHolidayCovering(selectedDate);

  const isHoliday = !!holidayQ.data;

  // Entries the teacher is scheduled to teach today — grouped by class.
  const todayByClass = useMemo(() => {
    const rows = todayTimetableQ.data ?? [];
    const map = new Map<string, ResolvedTimetableEntry[]>();
    for (const r of rows) {
      const arr = map.get(r.entry.classId) ?? [];
      arr.push(r);
      map.set(r.entry.classId, arr);
    }
    // Sort each class's periods ascending.
    for (const arr of map.values()) {
      arr.sort((a, b) => a.entry.periodIndex - b.entry.periodIndex);
    }
    return map;
  }, [todayTimetableQ.data]);

  // ── Effective Form Teacher classes (via the assignment engine) ─────
  const operationalViewQuery = useQuery({
    queryKey: ['operational_view', user?.uid],
    queryFn: () => assignmentEngine.getOperationalViewForTeacher(user!.uid),
    enabled: !!user?.uid,
    staleTime: 60_000,
  });

  const effectiveFTClassIds = useMemo(() => {
    const rows = operationalViewQuery.data ?? [];
    const s = new Set<string>();
    for (const { slot, canOperate } of rows) {
      if (slot.isFormTeacherSlot && canOperate) s.add(slot.classId);
    }
    return s;
  }, [operationalViewQuery.data]);

  // Normalize TeacherClass → Class-like shape (id / name).
  const classes = useMemo(
    () =>
      teacherClasses.map(tc => ({
        id: tc.classId,
        name: tc.className,
        isFormTeacher:
          effectiveFTClassIds.has(tc.classId) || tc.isFormTeacher === true,
        subjects: tc.subjects.map(s => s.subject),
      })),
    [teacherClasses, effectiveFTClassIds],
  );

  const formTeacherClass = useMemo(
    () => classes.find(c => c.isFormTeacher),
    [classes],
  );
  const isFormTeacher = !!formTeacherClass;

  // ── Available classes ─────────────────────────────────────────────
  //
  // Periodic mode now derives its class list from today's timetable —
  // only classes where the teacher has at least one scheduled period.
  // This keeps the UI honest: no class appears that has nothing to mark.
  const availableClasses = useMemo(() => {
    if (mode === 'daily') {
      return formTeacherClass ? [formTeacherClass] : [];
    }
    const classIds = new Set<string>();
    for (const clsId of todayByClass.keys()) classIds.add(clsId);
    return classes.filter(cls => classIds.has(cls.id));
  }, [mode, formTeacherClass, classes, todayByClass]);

  // ── Available timetable entries for the selected class in periodic mode ──
  //
  // A teacher should only be able to pick periods they actually operate.
  // The list is already scoped that way by useTodayTimetable.
  const availableEntries = useMemo(() => {
    if (mode !== 'periodic' || !selectedClass) return [];
    return todayByClass.get(selectedClass) ?? [];
  }, [mode, selectedClass, todayByClass]);

  const { learners, isLoading: loadingLearners } = useSchoolLearners(selectedClass);

  // ── Defaults ───────────────────────────────────────────────────────
  useEffect(() => {
    if (availableClasses.length === 0) {
      if (selectedClass) setSelectedClass('');
      return;
    }
    if (!availableClasses.some(c => c.id === selectedClass)) {
      setSelectedClass(availableClasses[0].id);
    }
  }, [availableClasses, selectedClass]);

  // When the class changes (or the timetable loads), pick a default period.
  //
  // Priority:
  //   1. If the teacher is currently teaching something in THIS class,
  //      preselect that period.
  //   2. Otherwise pick the first scheduled period for the class.
  useEffect(() => {
    if (mode !== 'periodic') return;
    if (availableEntries.length === 0) {
      if (selectedPeriod !== '') setSelectedPeriod('');
      if (selectedSubject !== '') setSelectedSubject('');
      return;
    }

    const currentInThisClass =
      currentPeriodQ.data &&
      currentPeriodQ.data.entry.classId === selectedClass
        ? currentPeriodQ.data
        : null;

    const preferred = currentInThisClass ?? availableEntries[0];
    const periodStr = String(preferred.entry.periodIndex);

    // Only overwrite if the current selection is invalid.
    const stillValid = availableEntries.some(
      e => String(e.entry.periodIndex) === selectedPeriod,
    );
    if (!stillValid || currentInThisClass) {
      setSelectedPeriod(periodStr);
      setSelectedSubject(preferred.entry.subject);
    }
  }, [mode, availableEntries, selectedPeriod, selectedSubject, selectedClass, currentPeriodQ.data]);

  // Sync the subject from the chosen period.
  useEffect(() => {
    if (mode !== 'periodic') return;
    const chosen = availableEntries.find(
      e => String(e.entry.periodIndex) === selectedPeriod,
    );
    if (chosen && chosen.entry.subject !== selectedSubject) {
      setSelectedSubject(chosen.entry.subject);
    }
  }, [mode, availableEntries, selectedPeriod, selectedSubject]);

  // ── Session hooks ──────────────────────────────────────────────────
  const sessionPeriod = mode === 'periodic' ? parseInt(selectedPeriod) : undefined;
  const sessionSubject = mode === 'periodic' ? selectedSubject : undefined;

  const sessionQuery = useAttendanceSession(
    selectedClass || undefined,
    selectedDate,
    mode,
    sessionPeriod,
    sessionSubject,
  );

  const recentQuery = useRecentSessions(
    selectedClass || undefined,
    mode,
    selectedDate,
    5,
  );

  const sessionsForDateQuery = useSessionsForDate(
    selectedClass || undefined,
    selectedDate,
    { enabled: activeTab === 'overview' && isFormTeacher && !!selectedClass },
  );

  const draft = useSessionDraft(sessionQuery.data);

  // ── Last-status lookup for context chips ──────────────────────────
  const lastStatusMap = useMemo(
    () => buildLastStatusMap(recentQuery.data ?? []),
    [recentQuery.data],
  );

  // ── Compose roster rows ────────────────────────────────────────────
  const studentsWithAttendance = useMemo(() => {
    if (!learners.length) return [];
    const loadedRoster = sessionQuery.data?.roster ?? {};
    return learners.map(learner => ({
      id: learner.id,
      name: learner.name,
      studentId: learner.studentId,
      gender: learner.gender,
      classId: learner.classId,
      status: (draft.draft[learner.id] ?? loadedRoster[learner.id]) as
        | AttendanceStatus
        | undefined,
      excuseReason: draft.reasons[learner.id],
      last: lastStatusMap.get(learner.id) ?? null,
    }));
  }, [learners, draft.draft, draft.reasons, sessionQuery.data, lastStatusMap]);

  // ── Filter + sort ──────────────────────────────────────────────────
  const filteredStudents = useMemo(() => {
    return studentsWithAttendance
      .filter(
        s =>
          !searchTerm ||
          s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.studentId.includes(searchTerm),
      )
      .filter(s => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'unmarked') return !s.status;
        return s.status === statusFilter;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [studentsWithAttendance, searchTerm, statusFilter]);

  // ── Per-student dirty set ──────────────────────────────────────────
  const dirtyStudentIds = useMemo(() => {
    const saved = sessionQuery.data?.roster ?? {};
    const s = new Set<string>();
    for (const [id, status] of Object.entries(draft.draft)) {
      if (saved[id] !== status) s.add(id);
    }
    return s;
  }, [draft.draft, sessionQuery.data]);

  // ── Stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = studentsWithAttendance.length;
    let present = 0, absent = 0, late = 0, excused = 0;
    for (const s of studentsWithAttendance) {
      if (s.status === 'present') present++;
      else if (s.status === 'absent') absent++;
      else if (s.status === 'late') late++;
      else if (s.status === 'excused') excused++;
    }
    return {
      total,
      present,
      absent,
      late,
      excused,
      unsavedChanges: draft.dirty ? dirtyStudentIds.size : 0,
    };
  }, [studentsWithAttendance, draft.dirty, dirtyStudentIds]);

  // ── Handler: single student status ─────────────────────────────────
  const handleStatusChange = useCallback(
    (studentId: string, status: AttendanceStatus, reason?: string) => {
      draft.setStatus(studentId, status, reason);
      setSelectedStudents(prev => {
        if (!prev.has(studentId)) return prev;
        const next = new Set(prev);
        next.delete(studentId);
        return next;
      });
    },
    [draft],
  );

  // ── Handler: bulk status ───────────────────────────────────────────
  const handleBulkStatus = useCallback(
    (status: AttendanceStatus, reason?: string) => {
      if (selectedStudents.size === 0) return;
      draft.bulkSet(Array.from(selectedStudents), status, reason);
      setSelectedStudents(new Set());
    },
    [draft, selectedStudents],
  );

  // ── Handler: mark all visible present ──────────────────────────────
  const handleMarkAllPresent = useCallback(() => {
    draft.bulkSet(filteredStudents.map(s => s.id), 'present');
  }, [draft, filteredStudents]);

  // ── Handler: open excuse modal ─────────────────────────────────────
  const openExcuseModal = useCallback((studentId: string, studentName: string) => {
    setExcuseReasonText('');
    setExcuseModal({ isOpen: true, studentId, studentName });
  }, []);

  // ── Handler: save ──────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedClass || !user?.uid) return;
    if (mode === 'periodic' && (!selectedPeriod || !selectedSubject)) return;

    setIsSubmitting(true);
    try {
      const classObj = classes.find(c => c.id === selectedClass);
      const className = classObj?.name ?? '';

      await attendanceService.markSession({
        classId: selectedClass,
        className,
        date: selectedDate,
        kind: mode,
        subject: mode === 'periodic' ? selectedSubject : undefined,
        period: mode === 'periodic' ? parseInt(selectedPeriod) : undefined,
        roster: draft.draft,
        excuseReasons: draft.reasons,
        markedBy: user.uid,
        markedByName: user.fullName || 'Teacher',
      });

      await invalidateSessionCaches({
        classId: selectedClass,
        date: selectedDate,
        kind: mode,
        period: sessionPeriod,
        subject: sessionSubject,
      });

      draft.markClean();
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 2000);
    } catch (error) {
      console.error('Error saving attendance:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    selectedClass,
    selectedDate,
    selectedSubject,
    selectedPeriod,
    mode,
    classes,
    draft,
    user,
    sessionPeriod,
    sessionSubject,
    invalidateSessionCaches,
  ]);

  // ── Handler: delete ────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!selectedClass) return;

    try {
      await deleteSession.mutateAsync({
        classId: selectedClass,
        date: selectedDate,
        kind: mode,
        subject: sessionSubject,
        period: sessionPeriod,
      });

      setConfirmDelete(false);
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  }, [
    deleteSession,
    selectedClass,
    selectedDate,
    mode,
    sessionSubject,
    sessionPeriod,
  ]);

  // ── Handler: refresh ───────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    sessionQuery.refetch();
    recentQuery.refetch();
    todayTimetableQ.refetch();
    currentPeriodQ.refetch();
  }, [sessionQuery, recentQuery, todayTimetableQ, currentPeriodQ]);

  // ── Handler: export ────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (activeTab !== 'mark') return;
    const session = sessionQuery.data;
    if (!session) return;

    const rows: AttendanceExportRow[] = Object.entries(session.roster).map(
      ([studentId, status]) => {
        const learner = learners.find(l => l.id === studentId);
        return {
          studentId,
          studentName: learner?.name ?? '',
          classId: session.classId,
          className: session.className,
          date: session.date,
          status,
          excuseReason: session.excuseReasons?.[studentId],
          markedBy: session.markedBy,
          markedByName: session.markedByName,
          timestamp: session.markedAt,
          attendanceType: session.kind,
          subject: session.subject,
          period: session.period,
        };
      },
    );

    exportAttendanceRecords(rows, `attendance_${session.classId}_${session.date}`);
  }, [activeTab, sessionQuery.data, learners]);

  const isLoading =
    loadingClasses || loadingLearners || loadingAssignments || sessionQuery.isLoading;

  // ── Chosen timetable entry (for the "current period" chip + subject) ──
  const chosenEntry = useMemo(() => {
    if (mode !== 'periodic') return null;
    return (
      availableEntries.find(
        e => String(e.entry.periodIndex) === selectedPeriod,
      ) ?? null
    );
  }, [mode, availableEntries, selectedPeriod]);

  const currentPeriodEntry =
    currentPeriodQ.data &&
    currentPeriodQ.data.entry.classId === selectedClass
      ? currentPeriodQ.data
      : null;

  // ── Error state ────────────────────────────────────────────────────
  if (classesError) {
    return (
      <DashboardLayout activeTab="attendance">
        <div className="p-4 text-center">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md mx-auto">
            <AlertCircle className="text-red-500 mx-auto mb-2" size={32} />
            <h3 className="font-semibold text-red-700">Failed to load classes</h3>
            <button
              onClick={() => refetchClasses()}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm"
            >
              Try Again
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Empty state: no classes at all ────────────────────────────────
  if (!loadingClasses && classes.length === 0) {
    return (
      <DashboardLayout activeTab="attendance">
        <div className="p-4 text-center">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 max-w-md mx-auto">
            <Users className="text-yellow-500 mx-auto mb-2" size={32} />
            <h3 className="font-semibold text-yellow-700">No Classes Assigned</h3>
            <p className="text-sm text-yellow-600 mt-1">
              Contact your administrator to get class assignments.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <DashboardLayout activeTab="attendance">
      <div className="min-h-screen bg-gray-50 p-3 sm:p-4 lg:p-6">
        <div className="max-w-7xl mx-auto space-y-3 sm:space-y-4">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                Attendance Tracking
              </h1>
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
            <div className="flex items-center gap-2">
              <ModeToggle mode={mode} onChange={setMode} isFormTeacher={isFormTeacher} />
              <button
                onClick={handleExport}
                disabled={!sessionQuery.data}
                className="p-2 sm:p-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                title="Export to CSV"
              >
                <Download size={16} />
              </button>
            </div>
          </div>

          {/* Tab navigation */}
          <TabNavigation
            activeTab={activeTab}
            onChange={setActiveTab}
            isFormTeacher={isFormTeacher}
          />

          {/* Holiday banner — blocks marking for the whole page */}
          {isHoliday && holidayQ.data && (
            <HolidayBanner holiday={holidayQ.data} />
          )}

          {/* Filters */}
          {activeTab === 'mark' && !isHoliday && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                className="w-full flex items-center justify-between p-3 sm:hidden"
              >
                <div className="flex items-center gap-2">
                  <Filter size={16} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">Filters</span>
                </div>
                <ChevronDown
                  size={16}
                  className={`transition-transform ${showMobileFilters ? 'rotate-180' : ''}`}
                />
              </button>

              <div className={`p-3 sm:p-4 ${showMobileFilters ? 'block' : 'hidden sm:block'}`}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                  <select
                    value={selectedClass}
                    onChange={e => setSelectedClass(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm"
                    disabled={loadingClasses || availableClasses.length === 0}
                  >
                    <option value="">Select Class</option>
                    {availableClasses.map(cls => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name}
                        {mode === 'daily' && cls.isFormTeacher && ' (Form)'}
                      </option>
                    ))}
                  </select>

                  <input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm"
                  />

                  {mode === 'periodic' ? (
                    <>
                      <select
                        value={selectedPeriod}
                        onChange={e => {
                          const p = e.target.value;
                          setSelectedPeriod(p);
                          const entry = availableEntries.find(
                            x => String(x.entry.periodIndex) === p,
                          );
                          if (entry) setSelectedSubject(entry.entry.subject);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm"
                        disabled={availableEntries.length === 0}
                      >
                        {availableEntries.length === 0 ? (
                          <option value="">No periods scheduled today</option>
                        ) : (
                          availableEntries.map(entry => (
                            <option
                              key={`${entry.entry.dayOfWeek}-${entry.entry.periodIndex}`}
                              value={String(entry.entry.periodIndex)}
                            >
                              {entry.period?.name ?? `P${entry.entry.periodIndex}`}
                              {' · '}
                              {entry.entry.subject}
                              {entry.period ? ` (${entry.period.startTime}–${entry.period.endTime})` : ''}
                              {entry.isCoveredNow ? ' [cover]' : ''}
                            </option>
                          ))
                        )}
                      </select>

                      <input
                        type="text"
                        value={selectedSubject || ''}
                        placeholder="Subject (from timetable)"
                        readOnly
                        className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-xs sm:text-sm text-gray-700"
                        title="Determined by the timetable"
                      />
                    </>
                  ) : (
                    <>
                      <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm"
                      >
                        <option value="all">All Status</option>
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="late">Late</option>
                        <option value="excused">Excused</option>
                        <option value="unmarked">Unmarked</option>
                      </select>

                      <div className="relative">
                        <Search
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                          size={14}
                        />
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

                <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-gray-100">
                  <p className="text-[10px] sm:text-xs text-gray-500">
                    {mode === 'daily'
                      ? 'Daily roll call — mark each student present/absent/late for the day'
                      : chosenEntry
                      ? `Periodic attendance — ${chosenEntry.entry.subject} · ${chosenEntry.entry.className} · period ${chosenEntry.entry.periodIndex}`
                      : 'Select a period to mark'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Current period chip in periodic mode */}
          {activeTab === 'mark' &&
            !isHoliday &&
            mode === 'periodic' &&
            currentPeriodEntry && (
              <div className="flex items-center gap-2 text-xs sm:text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <Clock size={14} />
                <span>
                  You are scheduled to teach{' '}
                  <span className="font-semibold">
                    {currentPeriodEntry.entry.subject}
                  </span>{' '}
                  in {currentPeriodEntry.entry.className} right now (
                  {currentPeriodEntry.period?.name ?? `P${currentPeriodEntry.entry.periodIndex}`}).
                </span>
              </div>
            )}

          {/* No timetable for this class today — periodic mode */}
          {activeTab === 'mark' &&
            !isHoliday &&
            mode === 'periodic' &&
            selectedClass &&
            availableEntries.length === 0 &&
            todayTimetableQ.isSuccess && (
              <div className="flex items-start gap-3 text-xs sm:text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-3">
                <Info size={16} className="text-gray-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">
                    No scheduled periods for you in this class today.
                  </p>
                  <p className="text-gray-600 mt-0.5">
                    Submit your timetable from <span className="font-medium">My Timetable</span>{' '}
                    if this looks wrong. Marking is disabled for this class.
                  </p>
                </div>
              </div>
            )}

          <CompactStats
            present={stats.present}
            absent={stats.absent}
            late={stats.late}
            excused={stats.excused}
            total={stats.total}
          />

          <div className="hidden sm:flex items-center justify-between px-3 py-2 bg-blue-50 rounded-lg border border-blue-100">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-blue-600" />
              <span className="text-sm text-blue-700 font-medium">Total Students</span>
            </div>
            <span className="text-base font-bold text-blue-800">{stats.total}</span>
          </div>

          {activeTab === 'mark' && !isHoliday && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {draft.dirty && (
                  <span className="text-xs sm:text-sm text-orange-600 bg-orange-50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg whitespace-nowrap flex items-center gap-1">
                    <Clock size={12} />
                    {stats.unsavedChanges} unsaved
                  </span>
                )}
                {!draft.dirty && sessionQuery.data && (
                  <span className="text-xs sm:text-sm text-green-600 bg-green-50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg whitespace-nowrap flex items-center gap-1">
                    <Check size={12} />
                    Saved by {sessionQuery.data.markedByName}
                  </span>
                )}
                {submitSuccess && (
                  <span className="text-xs sm:text-sm text-green-600 bg-green-50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg flex items-center gap-1 whitespace-nowrap">
                    <Check size={12} /> Saved
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                {filteredStudents.length > 0 && (
                  <button
                    onClick={handleMarkAllPresent}
                    className="px-3 py-2 border border-green-300 text-green-700 bg-green-50 rounded-lg hover:bg-green-100 text-xs sm:text-sm whitespace-nowrap flex items-center gap-1"
                  >
                    <UserCheck size={14} />
                    <span>Mark all present</span>
                  </button>
                )}
                <button
                  onClick={handleRefresh}
                  disabled={isLoading}
                  className="p-2 sm:p-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 flex-shrink-0"
                  title="Refresh"
                >
                  <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                </button>
                {sessionQuery.data && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    disabled={deleteSession.isPending}
                    className="p-2 sm:p-2.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 flex-shrink-0"
                    title="Delete this roll call"
                  >
                    {deleteSession.isPending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={isSubmitting}
                  className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm whitespace-nowrap"
                >
                  {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  <span>Save</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'mark' && !isHoliday && (
            isLoading ? (
              <div className="flex items-center justify-center py-12 bg-white rounded-xl border border-gray-200">
                <Loader2 size={24} className="animate-spin text-blue-600" />
                <span className="ml-2 text-sm text-gray-600">Loading students...</span>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                          selectedStudents.size === filteredStudents.length &&
                          filteredStudents.length > 0
                            ? 'border-blue-600 bg-blue-600'
                            : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {selectedStudents.size === filteredStudents.length &&
                          filteredStudents.length > 0 && (
                            <Check size={10} className="sm:w-3 sm:h-3 text-white" />
                          )}
                      </button>
                      <span className="text-xs sm:text-sm font-medium">
                        {selectedStudents.size > 0
                          ? `${selectedStudents.size} selected`
                          : 'Select all'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm text-gray-500">
                        {filteredStudents.length} of {studentsWithAttendance.length} students
                      </span>
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                  {filteredStudents.length > 0 ? (
                    filteredStudents.map(student => {
                      const isDirty = dirtyStudentIds.has(student.id);
                      return (
                        <div
                          key={student.id}
                          className={`p-3 sm:p-4 hover:bg-gray-50/50 transition-colors ${
                            selectedStudents.has(student.id) ? 'bg-blue-50/30' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2 sm:gap-3">
                            <button
                              onClick={() => {
                                setSelectedStudents(prev => {
                                  const next = new Set(prev);
                                  if (next.has(student.id)) next.delete(student.id);
                                  else next.add(student.id);
                                  return next;
                                });
                              }}
                              className={`mt-1 w-4 h-4 sm:w-5 sm:h-5 border-2 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                                selectedStudents.has(student.id)
                                  ? 'border-blue-600 bg-blue-600'
                                  : 'border-gray-300 hover:border-gray-400'
                              }`}
                            >
                              {selectedStudents.has(student.id) && (
                                <Check size={10} className="sm:w-3 sm:h-3 text-white" />
                              )}
                            </button>

                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1 xs:gap-2">
                                <span className="text-sm sm:text-base font-medium truncate max-w-[120px] xs:max-w-[150px] sm:max-w-[200px]">
                                  {student.name}
                                </span>
                                <span
                                  className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${
                                    student.gender === 'male'
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-pink-100 text-pink-700'
                                  }`}
                                >
                                  {student.gender === 'male' ? 'B' : 'G'}
                                </span>
                                <span className="text-[10px] sm:text-xs text-gray-500 font-mono truncate">
                                  {student.studentId}
                                </span>
                                {student.last && (
                                  <span
                                    className={`text-[8px] sm:text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                                      student.last.status === 'present'
                                        ? 'bg-green-50 text-green-700'
                                        : student.last.status === 'absent'
                                        ? 'bg-red-50 text-red-700'
                                        : student.last.status === 'late'
                                        ? 'bg-yellow-50 text-yellow-700'
                                        : 'bg-purple-50 text-purple-700'
                                    }`}
                                    title={`Last session: ${student.last.date}`}
                                  >
                                    last: {student.last.status[0].toUpperCase()}{' '}
                                    {student.last.date.slice(5)}
                                  </span>
                                )}
                                {isDirty && (
                                  <span className="text-[8px] sm:text-xs px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded-full whitespace-nowrap inline-flex items-center gap-0.5">
                                    <Clock size={8} />
                                    Unsaved
                                  </span>
                                )}
                              </div>

                              <div className="grid grid-cols-4 gap-1 mt-2 sm:mt-3">
                                {(['present', 'absent', 'late', 'excused'] as AttendanceStatus[]).map(
                                  status => {
                                    const isActive = student.status === status;
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
                                            openExcuseModal(student.id, student.name);
                                          } else {
                                            handleStatusChange(student.id, status);
                                          }
                                        }}
                                        className={`px-1 sm:px-2 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-medium border transition-all flex items-center justify-center gap-0.5 sm:gap-1 ${colors[status]}`}
                                      >
                                        <span className="hidden xs:inline">
                                          {status.charAt(0).toUpperCase() + status.slice(1)}
                                        </span>
                                        <span className="xs:hidden">
                                          {status === 'present' && 'P'}
                                          {status === 'absent' && 'A'}
                                          {status === 'late' && 'L'}
                                          {status === 'excused' && 'E'}
                                        </span>
                                      </button>
                                    );
                                  },
                                )}
                              </div>

                              {student.status === 'excused' && student.excuseReason && (
                                <div className="mt-2 text-[10px] sm:text-xs text-purple-600 bg-purple-50 p-2 rounded-lg flex items-start gap-1">
                                  <MessageSquare size={10} className="flex-shrink-0 mt-0.5" />
                                  <span className="break-words">{student.excuseReason}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-sm text-gray-500">
                      No students match your filters
                    </div>
                  )}
                </div>
              </div>
            )
          )}

          {activeTab === 'overview' && isFormTeacher && (
            <PeriodicOverview
              sessions={sessionsForDateQuery.data ?? []}
              date={selectedDate}
              onViewSubjectDetails={(subject, period) => {
                setSelectedSubject(subject);
                setSelectedPeriod(period.toString());
                setActiveTab('mark');
              }}
            />
          )}

          {activeTab === 'analytics' && isFormTeacher && (
            <RiskAnalyticsTab
              classId={selectedClass}
              className={classes.find(c => c.id === selectedClass)?.name || ''}
              isFormTeacher={isFormTeacher}
              teacherName={user?.fullName}
            />
          )}
        </div>

        {selectedStudents.size > 0 && activeTab === 'mark' && !isHoliday && (
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
                  onClick={() =>
                    openExcuseModal('bulk', `${selectedStudents.size} students`)
                  }
                  className="px-2 sm:px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs sm:text-sm hover:bg-purple-700 whitespace-nowrap flex items-center gap-1"
                >
                  <AlertCircle size={12} />
                  <span>Excuse</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {excuseModal.isOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3">
            <div className="bg-white rounded-xl max-w-md w-full p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold mb-2">Excuse Reason</h3>
              <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4 break-words">
                {excuseModal.studentName}
              </p>

              <textarea
                value={excuseReasonText}
                onChange={e => setExcuseReasonText(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-lg p-2 sm:p-3 text-xs sm:text-sm min-h-[80px] focus:border-purple-500 focus:outline-none"
                placeholder="Enter reason for absence..."
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
                    const reason = excuseReasonText.trim();
                    if (!reason) return;
                    if (excuseModal.studentId === 'bulk') {
                      handleBulkStatus('excused', reason);
                    } else if (excuseModal.studentId) {
                      handleStatusChange(excuseModal.studentId, 'excused', reason);
                    }
                    setExcuseModal({ isOpen: false });
                    setExcuseReasonText('');
                  }}
                  className="w-full sm:flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg text-xs sm:text-sm hover:bg-purple-700 transition-colors order-1 sm:order-2"
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3">
            <div className="bg-white rounded-xl max-w-md w-full p-4 sm:p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="bg-red-100 rounded-full p-2 flex-shrink-0">
                  <Trash2 size={20} className="text-red-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                    Delete this roll call?
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">
                    This will permanently remove the attendance record for{' '}
                    <span className="font-medium">
                      {classes.find(c => c.id === selectedClass)?.name || 'this class'}
                    </span>{' '}
                    on {selectedDate}
                    {mode === 'periodic' && sessionSubject && (
                      <> ({sessionSubject}, period {selectedPeriod})</>
                    )}
                    . This cannot be undone.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleteSession.isPending}
                  className="w-full sm:flex-1 px-4 py-2 border-2 border-gray-200 rounded-lg text-xs sm:text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteSession.isPending}
                  className="w-full sm:flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-xs sm:text-sm hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleteSession.isPending ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}