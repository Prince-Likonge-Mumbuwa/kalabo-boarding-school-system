import { DashboardLayout } from '@/components/DashboardLayout';
import { useSchoolTeachers } from '@/hooks/useSchoolTeachers';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useAuth } from '@/hooks/useAuth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  ChevronDown,
  PowerOff,
  Info,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Briefcase,
  X,
  Users,
  Loader2,
  UserCheck,
  AlertCircle,
  Download,
  Star,
  Phone,
  Mail,
  BookOpen,
  Edit,
  Trash2,
  UserPlus,
  ArrowRightLeft,
  UserMinus,
  Layers,
  Clock,
  UserCog,
  RotateCcw,
  Database,
  Lock,
} from 'lucide-react';
import { generateTeacherListPDF } from '@/services/pdf/teacherListPDF';
import { teacherService, parseLocalDateInput } from '@/services/schoolService';
import * as assignmentEngine from '@/services/assignmentEngine';

// Import types
import { Teacher, TeacherStatus, ViewMode } from '@/types/teachers';
import type { TeacherAssignment } from '@/types/school';

// Import hooks
import { useTeacherFilters } from '@/hooks/teachers/useTeacherFilters';
import { useTeacherModals } from '@/hooks/teachers/useTeacherModals';
import { useTeacherBulkOperations } from '@/hooks/teachers/useTeacherBulkOperations';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';

// Import components
import {
  TeachersPreviewModal,
  ConfirmationModal,
  AssignmentModal,
  EditTeacherModal,
  DeleteTeacherModal,
  RemoveSubjectModal,
  TransferTeacherModal,
  BulkRemoveModal,
  OverlappingSlotsModal,
} from '@/components/teachers/TeacherModals';

// ==================== SMALL HELPERS ====================

const ROLE_LABELS: Record<string, string> = {
  substantive: 'Primary',
  tp: 'TP',
  'leave-cover': 'Leave cover',
};

const ROLE_BADGE_CLASSES: Record<string, string> = {
  substantive: 'bg-slate-100 text-slate-700 border-slate-200',
  tp: 'bg-amber-50 text-amber-700 border-amber-200',
  'leave-cover': 'bg-rose-50 text-rose-700 border-rose-200',
};

const STATUS_LABELS: Record<TeacherStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  transferred: 'Transferred',
  on_leave: 'On Leave',
};

const formatShortDate = (d: Date | null | undefined): string => {
  if (!d) return '';
  try {
    return d.toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
};

const isDelegateRole = (r?: string | null) => r === 'tp' || r === 'leave-cover';

// ==================== COMPONENT ====================

export default function TeacherManagement() {
  const { user } = useAuth();
  const isUserAdmin = user?.userType === 'admin';
  const isMobile = useMediaQuery('(max-width: 640px)');
  const queryClient = useQueryClient();

  // View mode state - default to list for the new layout
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Selected teacher state for the right panel
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);

  // Overlapping slots viewer state
  const [showOverlappingSlots, setShowOverlappingSlots] = useState(false);
  const [overlappingSlots, setOverlappingSlots] = useState<assignmentEngine.SlotOverlap[]>([]);
  const [isLoadingOverlapping, setIsLoadingOverlapping] = useState(false);

  // One-time migration state
  const [isMigrating, setIsMigrating] = useState(false);

  // Edit teacher data state
  const [editTeacherData, setEditTeacherData] = useState({
    name: '',
    email: '',
    phone: '',
    department: '',
    subjects: [] as string[],
    newSubject: '',
  });

  // ==================== HOOKS ====================
  const {
    allTeachers: teachers = [],
    isLoading: isLoadingTeachers,
    isFetching: isFetchingTeachers,
    isError: teachersError,
    error: teachersErrorMessage,
    isAssigningTeacher,
    isRemovingTeacher,
    isUpdatingTeacherStatus,
    isUpdatingTeacher,
    isDeletingTeacher,
    isRemovingSubject,
    isTransferringTeacher,
    isEndingAssignment,
    assignTeacherToClass,
    assignTeacherWithMultipleSubjects,
    removeTeacherFromClass,
    removeTeacherSubject,
    updateTeacherStatus,
    updateTeacher,
    deleteTeacher,
    transferTeacher,
    endAssignment,
    reactivateExpiredCovers,
    resolveSlotConflict,
    isResolvingSlotConflict,
    refetchTeachers,
    // engine actions
    returnTeacherToDuty,
    endDelegation,
    handBackTp,
    findSlotOverlaps,
    getUncoveredSlots,
  } = useSchoolTeachers();

  const {
    classes = [],
    isLoading: isLoadingClasses,
    isError: classesError,
    refetch: refetchClasses,
  } = useSchoolClasses({ isActive: true });

  const { learners = [] } = useSchoolLearners('');

  // Filter hook
  const {
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    assignmentFilter,
    setAssignmentFilter,
    showMobileFilters,
    setShowMobileFilters,
    filteredTeachers,
    filterCounts,
    stats,
    clearFilters,
  } = useTeacherFilters(teachers);

  // Modal hook — includes role/date state for the assignment modal
  const {
    activeModal,
    modalData,
    selectedTeacher,
    selectedClassId,
    selectedClassName,
    selectedSubjects,
    currentSubject,
    assignAsFormTeacher,
    targetClassId,
    selectedSubjectToRemove,
    bulkRemoveAssignments,
    previewTeachers,
    previewAssignments,
    previewFilterInfo,

    coverRoleType,
    coverStartDate,
    coverEndDate,
    setCoverRoleType,
    setCoverStartDate,
    setCoverEndDate,

    setSelectedTeacher,
    setSelectedClassId,
    setSelectedSubjects,
    setCurrentSubject,
    setAssignAsFormTeacher,
    setTargetClassId,
    resetModalState,
    openAssignmentModal,
    openEditModal,
    openDeleteModal,
    openTransferModal,
    openBulkRemoveModal,
    openConfirmationModal,
    openPreviewModal,
  } = useTeacherModals();

  // Bulk operations hook
  const {
    toasts,
    addToast,
    removeToast,
    handleBulkRemove,
    handlePreviewTeachers,
    handleDownloadPDF,
  } = useTeacherBulkOperations();

  // ==================== ENGINE STATUS ====================

  // Has migrateToSlots() run? Until it has, assignment changes are blocked.
  const engineReadyQuery = useQuery({
    queryKey: ['system', 'engineReady'],
    queryFn: () => assignmentEngine.isEngineReady(),
    enabled: isUserAdmin,
    staleTime: 5 * 60 * 1000,
  });
  const engineReady = engineReadyQuery.data === true;

  // Subjects whose Primary Owner is on leave with no live/scheduled cover.
  const uncoveredQuery = useQuery({
    queryKey: ['class_slots', 'uncovered'],
    queryFn: () => getUncoveredSlots(),
    enabled: isUserAdmin && engineReady,
    staleTime: 60 * 1000,
  });
  const uncoveredSlots = uncoveredQuery.data ?? [];

  // ==================== ASSIGNMENTS (SELECTED TEACHER) ====================
  const {
    assignments: activeTeacherAssignments = [],
    isFetching: isFetchingActiveAssignments,
    getClassesWithSubjectDetails,
  } = useTeacherAssignments(selectedTeacherId || '');

  // Grouped by class, with role, dates and live authority per subject.
  const assignmentsByClass = getClassesWithSubjectDetails();

  // ==================== EFFECTS ====================

  // Close expired covers / TP once when an admin opens this page.
  // Authority already reverted at the end date; this tidies the records.
  useEffect(() => {
    if (!isUserAdmin || !engineReady) return;
    let cancelled = false;
    (async () => {
      try {
        const count = await reactivateExpiredCovers();
        if (!cancelled && count && count > 0) {
          addToast({
            type: 'info',
            title: 'Expired Covers Closed',
            message: `${count} cover/TP assignment${count === 1 ? '' : 's'} reached the end date. The primary teacher${count === 1 ? ' has' : 's have'} control again.`,
            duration: 5000,
          });
        }
      } catch (err) {
        console.warn('closing expired covers failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserAdmin, engineReady]);

  useEffect(() => {
    if (selectedTeacher && activeModal === 'edit') {
      setEditTeacherData({
        name: selectedTeacher.name || '',
        email: selectedTeacher.email || '',
        phone: selectedTeacher.phone || '',
        department: selectedTeacher.department || '',
        subjects: Array.isArray(selectedTeacher.subjects) ? selectedTeacher.subjects : [],
        newSubject: '',
      });
    }
  }, [selectedTeacher, activeModal]);

  // Auto-select first teacher if none is selected and data is loaded
  useEffect(() => {
    if (filteredTeachers.length > 0 && !selectedTeacherId) {
      setSelectedTeacherId(filteredTeachers[0].id);
    }
  }, [filteredTeachers, selectedTeacherId]);

  const activeTeacher = filteredTeachers.find(t => t.id === selectedTeacherId) || null;

  // ==================== SHARED ERROR TOAST ====================
  const toastError = useCallback((title: string, error: any, fallback: string) => {
    console.error(title, error);
    addToast({
      type: 'error',
      title,
      message: error?.message || fallback,
      duration: 6000,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addToast]);

  const requireAdmin = useCallback((what: string): boolean => {
    if (isUserAdmin) return true;
    addToast({
      type: 'error',
      title: 'Permission Denied',
      message: `Only administrators can ${what}`,
    });
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserAdmin, addToast]);

  // ==================== ONE-TIME MIGRATION ====================
  const handleMigrate = async () => {
    if (!requireAdmin('run the migration')) return;
    setIsMigrating(true);
    try {
      const dry = await teacherService.repairAssignments({ dryRun: true });
      console.log('Migration dry run:', dry);

      const ok = window.confirm(
        `Prepare the assignment system?\n\n` +
          `• ${dry.slotsWritten} class/subject slots will be created\n` +
          `• ${dry.duplicateOwnersArchived} duplicate primary teacher(s) will be archived (newest kept)\n` +
          `• ${dry.duplicateDelegatesArchived} duplicate cover(s) will be archived\n` +
          `• ${dry.delegatesWithoutEndDateClosed} cover(s) with no end date will be closed — re-assign them with dates\n` +
          `• ${dry.formTeacherFlagsCleared} wrong Form Teacher flag(s) will be cleared\n` +
          (dry.orphanDelegates.length
            ? `• ${dry.orphanDelegates.length} cover(s) have no primary teacher — assign one afterwards\n`
            : '') +
          `\nNothing is deleted. Continue?`
      );
      if (!ok) return;

      const result = await teacherService.repairAssignments();
      console.log('Migration result:', result);

      await queryClient.invalidateQueries();
      addToast({
        type: 'success',
        title: 'Assignment System Ready',
        message: `${result.slotsWritten} slots created. Assigning, covers, TP and transfers are now enabled.`,
        duration: 7000,
      });
    } catch (error: any) {
      toastError('Migration Failed', error, 'Could not prepare the assignment system.');
    } finally {
      setIsMigrating(false);
    }
  };

  // ==================== HANDLERS ====================
  const handleUpdateStatus = async (teacherId: string, newStatus: TeacherStatus) => {
    if (!requireAdmin('update teacher status')) return;

    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher || teacher.status === newStatus) return;

    const returning = teacher.status === 'on_leave' && newStatus === 'active';

    openConfirmationModal({
      teacher,
      newStatus,
      action: 'status-update',
      title: returning ? 'Return to Duty' : `Change Status to ${STATUS_LABELS[newStatus]}`,
      message:
        newStatus === 'on_leave'
          ? `Put ${teacher.name} on leave? They stay the primary teacher of all their classes. ` +
            `Assign covering teachers (with start and end dates) for the subjects that need them.`
          : returning
          ? `Return ${teacher.name} to duty? Their leave covers end now and they get full control of their classes back. Teaching Practice placements continue.`
          : `Change ${teacher.name}'s status to ${STATUS_LABELS[newStatus]}?`,
      confirmText: returning ? 'Return to Duty' : 'Update Status',
      cancelText: 'Cancel',
    } as any);
  };

  const handleReturnToDutyClick = (teacher: Teacher) => {
    if (!requireAdmin('return teachers to duty')) return;
    openConfirmationModal({
      teacher,
      action: 'return-to-duty',
      title: 'Return to Duty',
      message: `Return ${teacher.name} to duty? Their leave covers end now and they get full control of their classes back. Teaching Practice placements continue.`,
      confirmText: 'Return to Duty',
      cancelText: 'Cancel',
    } as any);
  };

  const handleEditTeacher = async () => {
    if (!selectedTeacher) return;

    try {
      await updateTeacher({
        teacherId: selectedTeacher.id,
        updates: {
          name: editTeacherData.name,
          email: editTeacherData.email,
          phone: editTeacherData.phone,
          department: editTeacherData.department,
          subjects: editTeacherData.subjects,
        },
      });

      addToast({
        type: 'success',
        title: 'Teacher Updated',
        message: `${editTeacherData.name || selectedTeacher.name}'s information has been updated.`,
        duration: 4000,
      });
      resetModalState();
    } catch (error: any) {
      toastError('Update Failed', error, 'Failed to update teacher information');
    }
  };

  const handleDeleteTeacher = async () => {
    if (!selectedTeacher) return;

    try {
      await deleteTeacher(selectedTeacher.id);
      addToast({
        type: 'success',
        title: 'Teacher Deleted',
        message: `${selectedTeacher.name} has been deleted. Their past assignments, grades and attendance are kept.`,
        duration: 5000,
      });
      resetModalState();
      setSelectedTeacherId(null);
    } catch (error: any) {
      toastError('Delete Failed', error, 'Failed to delete teacher');
    }
  };

  const handleAddSubjectToTeacher = () => {
    if (!editTeacherData.newSubject) {
      addToast({ type: 'warning', title: 'Subject Required', message: 'Please enter a subject name', duration: 3000 });
      return;
    }
    if (editTeacherData.subjects.includes(editTeacherData.newSubject)) {
      addToast({ type: 'warning', title: 'Duplicate Subject', message: 'This subject has already been added', duration: 3000 });
      return;
    }
    setEditTeacherData({
      ...editTeacherData,
      subjects: [...editTeacherData.subjects, editTeacherData.newSubject],
      newSubject: '',
    });
  };

  const handleRemoveSubjectFromTeacher = (subjectToRemove: string) => {
    setEditTeacherData({
      ...editTeacherData,
      subjects: editTeacherData.subjects.filter(s => s !== subjectToRemove),
    });
  };

  const handleAddSubject = () => {
    if (!currentSubject) {
      addToast({ type: 'warning', title: 'Subject Required', message: 'Please select a subject', duration: 3000 });
      return;
    }
    if (selectedSubjects.includes(currentSubject)) {
      addToast({ type: 'warning', title: 'Duplicate Subject', message: 'This subject has already been added', duration: 3000 });
      return;
    }
    setSelectedSubjects([...selectedSubjects, currentSubject]);
    setCurrentSubject('');
  };

  const handleRemoveSubject = (subjectToRemove: string) => {
    setSelectedSubjects(selectedSubjects.filter(s => s !== subjectToRemove));
  };

  const handleAssignTeacher = async () => {
    if (!selectedTeacher || !selectedClassId) {
      addToast({ type: 'warning', title: 'Incomplete Selection', message: 'Please select both a teacher and a class', duration: 3000 });
      return;
    }

    if (!assignAsFormTeacher && selectedSubjects.length === 0) {
      addToast({
        type: 'warning',
        title: 'No Role Selected',
        message: 'Choose Form Teacher, at least one subject, or both.',
        duration: 4000,
      });
      return;
    }

    if (!requireAdmin('assign teachers to classes')) return;

    const selectedClass = classes.find(c => c.id === selectedClassId);
    if (!selectedClass) {
      addToast({ type: 'error', title: 'Class Not Found', message: 'The selected class could not be found', duration: 3000 });
      return;
    }

    // Date inputs are "YYYY-MM-DD" → parse as LOCAL dates; end runs to 23:59.
    const isDelegate = isDelegateRole(coverRoleType);
    const startDate = parseLocalDateInput(coverStartDate) ?? undefined;
    const endDate = parseLocalDateInput(coverEndDate, true);

    if (isDelegate && (!startDate || !endDate)) {
      addToast({
        type: 'warning',
        title: 'Dates Required',
        message: 'Covering and Teaching Practice assignments need a start date and an end date.',
        duration: 4000,
      });
      return;
    }

    // Defensive: prove what we're about to send. If this ever logs
    // role: 'substantive' when the admin picked a cover, the modal
    // isn't wiring role state — inspect AssignmentModal's props.
    console.log('[assign] sending', {
      roleType: coverRoleType,
      isDelegate,
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
      subjects: selectedSubjects,
      isFormTeacher: assignAsFormTeacher,
    });

    try {
      if (selectedSubjects.length > 0) {
        // The hook assigns subjects and (if ticked) the Form Teacher role as separate slots.
        await assignTeacherWithMultipleSubjects({
          teacherId: selectedTeacher.id,
          classId: selectedClassId,
          subjects: selectedSubjects,
          isFormTeacher: assignAsFormTeacher,
          roleType: coverRoleType,
          startDate,
          endDate: isDelegate ? endDate : null,
        });
      } else {
        await assignTeacherToClass({
          teacherId: selectedTeacher.id,
          classId: selectedClassId,
          subject: 'Form Teacher',
          isFormTeacher: true,
          roleType: coverRoleType,
          startDate,
          endDate: isDelegate ? endDate : null,
        });
      }

      const roleText =
        coverRoleType === 'tp'
          ? 'Teaching Practice delegate'
          : coverRoleType === 'leave-cover'
          ? 'Covering Teacher'
          : 'Primary Teacher';
      const parts = [
        ...(selectedSubjects.length ? [`${selectedSubjects.length} subject(s)`] : []),
        ...(assignAsFormTeacher ? ['Form Teacher'] : []),
      ];
      const window_ = isDelegate ? ` (${formatShortDate(startDate)} – ${formatShortDate(endDate)})` : '';

      addToast({
        type: 'success',
        title: 'Assignment Successful',
        message:
          `${selectedTeacher.name} is now ${roleText} for ${parts.join(' + ')} in ${selectedClass.name}${window_}.` +
          (!isDelegate ? ' Any previous teacher on those slots has been archived.' : ''),
        duration: 6000,
      });

      resetModalState();
    } catch (error: any) {
      toastError('Assignment Failed', error, 'Failed to assign teacher');
    }
  };

  const handleRemoveSubjectFromClass = async () => {
    if (!selectedTeacher || !selectedClassId || !selectedSubjectToRemove) return;

    try {
      await removeTeacherSubject({
        teacherId: selectedTeacher.id,
        classId: selectedClassId,
        subject: selectedSubjectToRemove,
      });
      addToast({
        type: 'success',
        title: 'Subject Removed',
        message: `${selectedSubjectToRemove} has been removed from ${selectedTeacher.name}.`,
        duration: 4000,
      });
      resetModalState();
    } catch (error: any) {
      toastError('Remove Failed', error, 'Failed to remove subject');
    }
  };

  // Explicit args — avoids reading stale modal state right after setState.
  const removeFormTeacherRole = useCallback(
    async (teacher: Teacher, classId: string) => {
      try {
        await removeTeacherSubject({ teacherId: teacher.id, classId, subject: 'Form Teacher' });
        addToast({
          type: 'success',
          title: 'Form Teacher Removed',
          message: `${teacher.name} is no longer Form Teacher of this class.`,
          duration: 4000,
        });
        resetModalState();
      } catch (error: any) {
        toastError('Update Failed', error, 'Failed to remove form teacher status');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [removeTeacherSubject, addToast, resetModalState, toastError]
  );

  const removeFromClass = useCallback(
    async (teacher: Teacher, classId: string, className?: string) => {
      try {
        await removeTeacherFromClass({ teacherId: teacher.id, classId });
        addToast({
          type: 'success',
          title: 'Teacher Removed',
          message: `${teacher.name} has been removed from ${className || 'the class'}. Any running cover continues until its end date.`,
          duration: 5000,
        });
        resetModalState();
      } catch (error: any) {
        toastError('Remove Failed', error, 'Failed to remove teacher');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [removeTeacherFromClass, addToast, resetModalState, toastError]
  );

  const handleRemoveAssignment = (teacherId: string, classId: string) => {
    if (!requireAdmin('remove teacher assignments')) return;

    const teacher = teachers.find(t => t.id === teacherId);
    const classObj = classes.find(c => c.id === classId);

    openConfirmationModal({
      teacher,
      classId,
      className: classObj?.name,
      action: 'assignment-remove',
      title: 'Remove Teacher Assignment',
      message: `Remove ${teacher?.name} from ${classObj?.name}? All their roles in this class end. Their past grades and attendance are kept.`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
    } as any);
  };

  const handleTransferTeacher = async () => {
    if (!selectedTeacher || !selectedClassId || !targetClassId) {
      addToast({ type: 'warning', title: 'Incomplete Selection', message: 'Please select both source and target classes', duration: 3000 });
      return;
    }

    const targetClass = classes.find(c => c.id === targetClassId);
    const sourceClass = classes.find(c => c.id === selectedClassId);

    try {
      const report: any = await transferTeacher({
        teacherId: selectedTeacher.id,
        fromClassId: selectedClassId,
        toClassId: targetClassId,
      });

      const extra: string[] = [];
      if (report?.replacedOwnersInTarget?.length) {
        extra.push(`${report.replacedOwnersInTarget.length} previous teacher(s) in ${targetClass?.name} archived`);
      }
      if (report?.sourceSlotsStillCovered?.length) {
        extra.push(`still covered in ${sourceClass?.name}: ${report.sourceSlotsStillCovered.join(', ')}`);
      }

      addToast({
        type: 'success',
        title: 'Transfer Successful',
        message:
          `${selectedTeacher.name} moved from ${sourceClass?.name} to ${targetClass?.name}` +
          (report?.carried?.length ? ` (${report.carried.join(', ')})` : '') +
          (extra.length ? `. ${extra.join('; ')}.` : '.'),
        duration: 7000,
      });
      resetModalState();
    } catch (error: any) {
      toastError('Transfer Failed', error, 'Failed to transfer teacher');
    }
  };

  // ── Bulk remove: only current (non-ended) assignments are offered ──
  const handleBulkRemoveClick = async (teacher: Teacher) => {
    try {
      const all = await teacherService.getTeacherAssignments(teacher.id);
      const now = new Date();
      const current = all.filter(
        a =>
          a.status !== 'ended' &&
          !(isDelegateRole(a.roleType) && a.endDate && a.endDate < now)
      );
      openBulkRemoveModal(teacher, current);
    } catch (error: any) {
      toastError('Failed to Load Assignments', error, 'Could not load teacher assignments.');
    }
  };

  const handleConfirmBulkRemove = async (selectedClassIds: string[]) => {
    if (!selectedTeacher) return;
    const success = await handleBulkRemove(selectedTeacher, selectedClassIds, removeTeacherFromClass);
    if (success) resetModalState();
  };

  // ── Delegate row: end THIS teacher's cover / TP placement ──
  const handleEndCoverClick = (assignment: TeacherAssignment) => {
    if (!requireAdmin('end cover assignments')) return;
    if (!activeTeacher) return;

    const isTp = assignment.roleType === 'tp';
    openConfirmationModal({
      action: 'assignment-end',
      teacher: activeTeacher,
      assignmentId: assignment.id,
      title: isTp ? 'End Teaching Practice' : 'End Cover',
      message:
        `End ${assignment.teacherName}'s ${ROLE_LABELS[assignment.roleType] || assignment.roleType} for ` +
        `${assignment.subject} in ${assignment.className}? The primary teacher gets control back immediately.`,
      confirmText: isTp ? 'Hand Back' : 'End Cover',
      cancelText: 'Cancel',
    } as any);
  };

  // ── Owner row: end the cover / TP that is covering THIS teacher ──
  const handleEndDelegationOnOwnedSlot = (
    s: {
      slotId: string | null;
      subject: string;
      coveredByTeacherName: string | null;
      coveredByRole: string | null;
    },
    className: string
  ) => {
    if (!requireAdmin('end cover assignments')) return;
    if (!activeTeacher || !s.slotId) return;

    const isTp = s.coveredByRole === 'tp';
    openConfirmationModal({
      action: 'delegation-end',
      teacher: activeTeacher,
      slotId: s.slotId,
      delegateRole: s.coveredByRole,
      title: isTp ? 'Hand Back from TP' : 'End Cover',
      message:
        `End ${s.coveredByTeacherName || 'the covering teacher'}'s ${isTp ? 'Teaching Practice' : 'cover'} for ` +
        `${s.subject} in ${className}? ${activeTeacher.name} gets control back immediately.`,
      confirmText: isTp ? 'Hand Back' : 'End Cover',
      cancelText: 'Cancel',
    } as any);
  };

  // ── Overlaps: genuine duplicates only (2+ primaries or 2+ covers) ──
  const handleShowOverlappingSlots = async () => {
    if (!requireAdmin('view this report')) return;

    setShowOverlappingSlots(true);
    setIsLoadingOverlapping(true);
    setOverlappingSlots([]);

    try {
      const classNames = Object.fromEntries(classes.map(c => [c.id, c.name]));
      setOverlappingSlots(await findSlotOverlaps(classNames));
    } catch (error: any) {
      toastError('Failed to Load Overlaps', error, 'Could not load assignment overlaps.');
    } finally {
      setIsLoadingOverlapping(false);
    }
  };

  const handleResolveOverlap = async ({
    slot,
    keepAssignmentId,
  }: {
    slot: assignmentEngine.SlotOverlap;
    keepAssignmentId: string;
  }) => {
    try {
      const result: any = await resolveSlotConflict({
        classId: slot.classId,
        normalizedSubject: slot.normalizedSubjectId,
        keepAssignmentId,
      });

      const warnings: string[] = result?.warnings ?? [];
      addToast({
        type: warnings.length ? 'warning' : 'success',
        title: 'Overlap Resolved',
        message:
          `${result?.kept?.teacherName || 'Teacher'} kept ${slot.subject} — ${slot.className}. ` +
          `${result?.ended ?? 0} other assignment(s) archived.` +
          (warnings.length ? ` ${warnings.join(' ')}` : ''),
        duration: 7000,
      });

      await handleShowOverlappingSlots();
    } catch (error: any) {
      toastError('Resolve Failed', error, 'Could not resolve the overlap.');
    }
  };

  const handlePreviewClick = async () => {
    const result = await handlePreviewTeachers(teachers, filteredTeachers, searchTerm, statusFilter, assignmentFilter);
    if (result) {
      openPreviewModal(result.teachersToShow, result.assignmentsMap, result.filterInfo);
    }
  };

  const handleDownloadClick = async () => {
    const success = await handleDownloadPDF(
      previewTeachers,
      previewAssignments,
      previewFilterInfo,
      classes,
      generateTeacherListPDF
    );
    if (success) resetModalState();
  };

  const handleConfirmAction = useCallback(async () => {
    const data: any = modalData;
    if (!data) return;

    switch (data.action) {
      case 'status-update': {
        const teacher = data.teacher as Teacher;
        const newStatus = data.newStatus as TeacherStatus;
        const wasOnLeave = teacher.status === 'on_leave';
        try {
          await updateTeacherStatus({ teacherId: teacher.id, status: newStatus });

          let message = `${teacher.name}'s status changed to ${STATUS_LABELS[newStatus]}.`;
          if (newStatus === 'on_leave') {
            const uncovered = (await getUncoveredSlots()).filter(s => s.ownerTeacherId === teacher.id);
            message += uncovered.length
              ? ` ${uncovered.length} subject(s) need a covering teacher: ${uncovered
                  .map(s => `${s.subject} (${s.className})`)
                  .join(', ')}.`
              : ' All their subjects are already covered.';
          } else if (wasOnLeave && newStatus === 'active') {
            message += ' Leave covers have ended; they have full control again.';
          }

          addToast({
            type: newStatus === 'on_leave' ? 'warning' : 'success',
            title: 'Status Updated',
            message,
            duration: 7000,
          });
          resetModalState();
        } catch (error: any) {
          toastError('Update Failed', error, 'Failed to update teacher status');
        }
        break;
      }

      case 'return-to-duty': {
        const teacher = data.teacher as Teacher;
        try {
          const r = await returnTeacherToDuty(teacher.id);
          addToast({
            type: 'success',
            title: 'Returned to Duty',
            message:
              `${teacher.name} is back on duty. ${r.coversEnded} cover(s) ended.` +
              (r.tpPlacementsContinuing ? ` ${r.tpPlacementsContinuing} TP placement(s) continue.` : ''),
            duration: 6000,
          });
          resetModalState();
        } catch (error: any) {
          toastError('Return to Duty Failed', error, 'Could not return teacher to duty');
        }
        break;
      }

      case 'remove-from-class':
      case 'assignment-remove':
        if (data.teacher && data.classId) {
          await removeFromClass(data.teacher, data.classId, data.className);
        } else {
          resetModalState();
        }
        break;

      case 'remove-form-teacher':
        if (data.teacher && data.classId) {
          await removeFormTeacherRole(data.teacher, data.classId);
        } else {
          resetModalState();
        }
        break;

      case 'assignment-end':
        if (data.assignmentId) {
          try {
            await endAssignment({ assignmentId: data.assignmentId, reason: 'handover' });
            addToast({
              type: 'success',
              title: 'Cover Ended',
              message: 'The primary teacher has control again.',
              duration: 4000,
            });
            resetModalState();
          } catch (error: any) {
            toastError('End Cover Failed', error, 'Failed to end cover assignment');
          }
        } else {
          resetModalState();
        }
        break;

      case 'delegation-end':
        if (data.slotId) {
          try {
            if (data.delegateRole === 'tp') {
              await handBackTp(data.slotId);
            } else {
              await endDelegation({ slotId: data.slotId, reason: 'returned-to-duty' });
            }
            addToast({
              type: 'success',
              title: data.delegateRole === 'tp' ? 'Handed Back' : 'Cover Ended',
              message: `${data.teacher?.name || 'The primary teacher'} has control again.`,
              duration: 4000,
            });
            resetModalState();
          } catch (error: any) {
            toastError('End Cover Failed', error, 'Failed to end the cover');
          }
        } else {
          resetModalState();
        }
        break;

      default:
        resetModalState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    modalData,
    updateTeacherStatus,
    getUncoveredSlots,
    returnTeacherToDuty,
    removeFromClass,
    removeFormTeacherRole,
    endAssignment,
    endDelegation,
    handBackTp,
    addToast,
    toastError,
    resetModalState,
  ]);

  // ==================== RENDER ====================
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
              {(teachersErrorMessage as any)?.message || 'An error occurred while fetching teachers'}
            </p>
            <button
              onClick={() => {
                refetchTeachers();
                refetchClasses();
              }}
              className="px-6 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

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
          {/* Toast Notifications */}
          <div className="fixed top-4 right-4 z-50 space-y-2 w-80 max-w-full">
            {toasts.map((toast: any) => (
              <div
                key={toast.id}
                className={`
                  rounded-lg shadow-lg border p-4 animate-in slide-in-from-right fade-in duration-300
                  ${toast.type === 'success' ? 'bg-green-50 border-green-200' : ''}
                  ${toast.type === 'error' ? 'bg-red-50 border-red-200' : ''}
                  ${toast.type === 'warning' ? 'bg-yellow-50 border-yellow-200' : ''}
                  ${toast.type === 'info' ? 'bg-blue-50 border-blue-200' : ''}
                `}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    {toast.type === 'success' && <CheckCircle className="text-green-600" size={20} />}
                    {toast.type === 'error' && <XCircle className="text-red-600" size={20} />}
                    {toast.type === 'warning' && <AlertTriangle className="text-yellow-600" size={20} />}
                    {toast.type === 'info' && <Info className="text-blue-600" size={20} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-medium text-sm
                      ${toast.type === 'success' ? 'text-green-800' : ''}
                      ${toast.type === 'error' ? 'text-red-800' : ''}
                      ${toast.type === 'warning' ? 'text-yellow-800' : ''}
                      ${toast.type === 'info' ? 'text-blue-800' : ''}
                    `}
                    >
                      {toast.title}
                    </p>
                    <p
                      className={`text-xs mt-0.5
                      ${toast.type === 'success' ? 'text-green-700' : ''}
                      ${toast.type === 'error' ? 'text-red-700' : ''}
                      ${toast.type === 'warning' ? 'text-yellow-700' : ''}
                      ${toast.type === 'info' ? 'text-blue-700' : ''}
                    `}
                    >
                      {toast.message}
                    </p>
                  </div>
                  <button onClick={() => removeToast(toast.id)} className="flex-shrink-0 hover:opacity-70">
                    <X size={16} className="text-gray-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* ===== ONE-TIME SETUP BANNER ===== */}
          {isUserAdmin && engineReadyQuery.isSuccess && !engineReady && (
            <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-start gap-3 flex-1">
                <Database className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                <div>
                  <p className="font-semibold text-amber-900 text-sm">One-time setup needed</p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Prepare the assignment system to enable assigning teachers, covers, Teaching
                    Practice and transfers. You'll see a summary before anything changes. Nothing is deleted.
                  </p>
                </div>
              </div>
              <button
                onClick={handleMigrate}
                disabled={isMigrating}
                className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2 justify-center"
              >
                {isMigrating ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
                {isMigrating ? 'Preparing…' : 'Prepare now'}
              </button>
            </div>
          )}

          {/* ===== SUBJECTS NEEDING COVER ===== */}
          {isUserAdmin && engineReady && uncoveredSlots.length > 0 && (
            <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-rose-600 flex-shrink-0 mt-0.5" size={20} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-rose-900 text-sm">
                    {uncoveredSlots.length} subject{uncoveredSlots.length === 1 ? '' : 's'} need a covering teacher
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {uncoveredSlots.slice(0, 12).map(s => (
                      <span
                        key={s.id}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-rose-200 text-rose-700"
                      >
                        {s.subject} · {s.className} · {s.ownerTeacherName} on leave
                      </span>
                    ))}
                    {uncoveredSlots.length > 12 && (
                      <span className="text-[11px] text-rose-700">+{uncoveredSlots.length - 12} more</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setCoverRoleType('leave-cover' as any);
                    openAssignmentModal();
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg flex-shrink-0"
                >
                  Assign cover
                </button>
              </div>
            </div>
          )}

          {/* ===== HEADER ===== */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
                  Teacher Management
                </h1>
                <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2 flex items-center gap-2 flex-wrap">
                  <span>
                    {filteredTeachers.length} teacher{filteredTeachers.length !== 1 ? 's' : ''} shown
                  </span>
                  <span className="text-gray-300">•</span>
                  <span className="text-green-600">{stats.activeTeachers} active</span>
                  <span className="text-gray-300">•</span>
                  <span className="text-purple-600">{stats.formTeachers} form teachers</span>
                  {stats.onCoverTeachers > 0 && (
                    <>
                      <span className="text-gray-300">•</span>
                      <span className="text-rose-600">{stats.onCoverTeachers} on cover</span>
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

              {/* Admin Actions */}
              {isUserAdmin && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handlePreviewClick}
                    className="inline-flex items-center justify-center bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 px-4 py-2.5 gap-2 text-sm sm:text-base"
                  >
                    <Download size={18} />
                    Download List
                  </button>

                  <button
                    onClick={handleShowOverlappingSlots}
                    className="inline-flex items-center justify-center bg-rose-600 text-white rounded-xl hover:bg-rose-700 font-medium transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 px-4 py-2.5 gap-2 text-sm sm:text-base"
                    title="Subjects with more than one primary teacher, or more than one cover"
                  >
                    <UserCog size={18} />
                    Overlaps
                  </button>

                  <button
                    onClick={() => openAssignmentModal()}
                    disabled={isAssigningTeacher || !engineReady}
                    title={!engineReady ? 'Complete the one-time setup first' : undefined}
                    className="inline-flex items-center justify-center bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 gap-2 text-sm sm:text-base"
                  >
                    {isAssigningTeacher ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
                    Assign to Class
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ===== STATS CARDS ===== */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4 mb-6">
            {[
              { label: 'Total', value: stats.totalTeachers, icon: Users, bg: 'bg-blue-50', fg: 'text-blue-600', num: 'text-gray-900' },
              { label: 'Active', value: stats.activeTeachers, icon: UserCheck, bg: 'bg-green-50', fg: 'text-green-600', num: 'text-green-600' },
              { label: 'Inactive', value: stats.inactiveTeachers, icon: PowerOff, bg: 'bg-gray-50', fg: 'text-gray-600', num: 'text-gray-600' },
              { label: 'On Leave', value: stats.onLeaveTeachers, icon: XCircle, bg: 'bg-yellow-50', fg: 'text-yellow-600', num: 'text-yellow-600' },
              { label: 'On Cover', value: stats.onCoverTeachers, icon: Clock, bg: 'bg-rose-50', fg: 'text-rose-600', num: 'text-rose-600' },
              { label: 'Form Teachers', value: stats.formTeachers, icon: Star, bg: 'bg-purple-50', fg: 'text-purple-600', num: 'text-purple-600' },
            ].map(card => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className={`p-1.5 sm:p-2 ${card.bg} rounded-lg`}>
                      <Icon size={isMobile ? 14 : 16} className={card.fg} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm text-gray-600 truncate">{card.label}</p>
                      <p className={`text-lg sm:text-xl lg:text-2xl font-bold ${card.num}`}>{card.value}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ===== FILTERS SECTION ===== */}
          <div className="mb-6 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {isMobile && (
              <button
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                className="w-full flex items-center justify-between p-4 bg-white"
              >
                <div className="flex items-center gap-2">
                  <Filter size={18} className="text-gray-400" />
                  <span className="font-medium text-gray-700">
                    {searchTerm || statusFilter !== 'all' || assignmentFilter !== 'all'
                      ? 'Filters active'
                      : 'Search & filters'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {(searchTerm || statusFilter !== 'all' || assignmentFilter !== 'all') && (
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  )}
                  <ChevronDown
                    size={18}
                    className={`text-gray-500 transition-transform duration-200 ${showMobileFilters ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>
            )}

            <div className={`${isMobile ? 'px-4 pb-4' : 'p-4'} ${isMobile && !showMobileFilters ? 'hidden' : 'block'}`}>
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder={isMobile ? 'Search teachers...' : 'Search by name, email, phone, NRC, TS#, or Emp#...'}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base transition-shadow"
                  />
                </div>

                <div className="relative sm:w-48">
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <Filter size={18} className="text-gray-400" />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as TeacherStatus | 'all')}
                    className="w-full pl-10 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white cursor-pointer text-sm sm:text-base hover:border-gray-400 transition-colors"
                  >
                    <option value="all">All Status ({filterCounts.all})</option>
                    <option value="active">Active ({filterCounts.active})</option>
                    <option value="inactive">Inactive ({filterCounts.inactive})</option>
                    <option value="on_leave">On Leave ({filterCounts.onLeave})</option>
                    <option value="transferred">Transferred ({filterCounts.transferred})</option>
                  </select>
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <ChevronDown size={16} className="text-gray-400" />
                  </div>
                </div>

                <div className="relative sm:w-56">
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <Briefcase size={18} className="text-gray-400" />
                  </div>
                  <select
                    value={assignmentFilter}
                    onChange={(e) => setAssignmentFilter(e.target.value as any)}
                    className="w-full pl-10 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white cursor-pointer text-sm sm:text-base hover:border-gray-400 transition-colors"
                  >
                    <option value="all">All Teachers ({filterCounts.all})</option>
                    <option value="assigned">Assigned ({filterCounts.assigned})</option>
                    <option value="unassigned">Unassigned ({filterCounts.unassigned})</option>
                    <option value="form-teachers">Form Teachers ({filterCounts.formTeachers})</option>
                  </select>
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <ChevronDown size={16} className="text-gray-400" />
                  </div>
                </div>
              </div>

              {(searchTerm || statusFilter !== 'all' || assignmentFilter !== 'all') && (
                <div className="mt-3 flex items-center gap-2 text-sm flex-wrap">
                  <span className="text-gray-600">Active filters:</span>
                  {searchTerm && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs sm:text-sm">
                      <span>"{searchTerm}"</span>
                      <button onClick={() => setSearchTerm('')} className="hover:bg-blue-100 rounded p-0.5">
                        <X size={14} />
                      </button>
                    </span>
                  )}
                  {statusFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-700 rounded-lg text-xs sm:text-sm">
                      <span className="capitalize">{statusFilter.replace('_', ' ')}</span>
                      <button onClick={() => setStatusFilter('all')} className="hover:bg-purple-100 rounded p-0.5">
                        <X size={14} />
                      </button>
                    </span>
                  )}
                  {assignmentFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs sm:text-sm">
                      <span className="capitalize">{assignmentFilter.replace('-', ' ')}</span>
                      <button onClick={() => setAssignmentFilter('all')} className="hover:bg-indigo-100 rounded p-0.5">
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

          {/* ===== MAIN SPLIT LAYOUT (40% List / 60% Details) ===== */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* LEFT PANEL: Teacher List */}
            <div className="w-full lg:w-[40%] flex flex-col gap-4">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[600px] lg:h-[calc(100vh-280px)]">
                <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                    <Users size={18} className="text-blue-600" />
                    Teachers List
                  </h3>
                  <span className="text-xs font-medium text-gray-500 bg-gray-200 px-2 py-1 rounded-full">
                    {filteredTeachers.length} found
                  </span>
                </div>

                <div className="overflow-y-auto flex-1 p-2 space-y-1">
                  {filteredTeachers.length > 0 ? (
                    filteredTeachers.map((teacher) => (
                      <div
                        key={teacher.id}
                        onClick={() => setSelectedTeacherId(teacher.id)}
                        className={`p-3 rounded-lg cursor-pointer transition-all border ${
                          selectedTeacherId === teacher.id
                            ? 'bg-blue-50 border-blue-200 shadow-sm'
                            : 'bg-white border-transparent hover:bg-gray-50 hover:border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-medium text-gray-900 text-sm truncate pr-2">{teacher.name}</h4>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider
                            ${teacher.status === 'active' || !teacher.status ? 'bg-green-100 text-green-700' : ''}
                            ${teacher.status === 'inactive' ? 'bg-gray-100 text-gray-600' : ''}
                            ${teacher.status === 'on_leave' ? 'bg-yellow-100 text-yellow-700' : ''}
                            ${teacher.status === 'transferred' ? 'bg-purple-100 text-purple-700' : ''}`}
                          >
                            {teacher.status?.replace('_', ' ') || 'Active'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 text-xs text-gray-500">
                          {teacher.email && (
                            <span className="flex items-center gap-1.5 truncate">
                              <Mail size={12} className="flex-shrink-0" />
                              {teacher.email}
                            </span>
                          )}
                          {teacher.phone && (
                            <span className="flex items-center gap-1.5">
                              <Phone size={12} className="flex-shrink-0" />
                              {teacher.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center p-6">
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                        <Users size={24} className="text-gray-400" />
                      </div>
                      <p className="text-gray-500 text-sm">No teachers found matching your criteria.</p>
                      <button onClick={clearFilters} className="text-blue-600 text-sm mt-2 hover:underline">
                        Clear filters
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT PANEL: Teacher Details & Actions */}
            <div className="w-full lg:w-[60%]">
              {activeTeacher ? (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-[600px] lg:h-[calc(100vh-280px)] flex flex-col overflow-hidden relative">
                  {isFetchingActiveAssignments && activeTeacherAssignments.length === 0 && (
                    <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center">
                      <Loader2 className="animate-spin text-blue-600" size={32} />
                    </div>
                  )}

                  {/* Details Header */}
                  <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-2xl font-bold flex-shrink-0">
                          {activeTeacher.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .substring(0, 2)
                            .toUpperCase()}
                        </div>
                        <div>
                          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{activeTeacher.name}</h2>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span
                              className={`text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider
                              ${activeTeacher.status === 'active' || !activeTeacher.status ? 'bg-green-100 text-green-700' : ''}
                              ${activeTeacher.status === 'inactive' ? 'bg-gray-100 text-gray-600' : ''}
                              ${activeTeacher.status === 'on_leave' ? 'bg-yellow-100 text-yellow-700' : ''}
                              ${activeTeacher.status === 'transferred' ? 'bg-purple-100 text-purple-700' : ''}`}
                            >
                              {activeTeacher.status?.replace('_', ' ') || 'Active'}
                            </span>
                            {activeTeacher.department && (
                              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                                {activeTeacher.department}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Top Actions */}
                      {isUserAdmin && (
                        <div className="flex gap-2 self-start sm:self-center items-center flex-wrap">
                          {activeTeacher.status === 'on_leave' && (
                            <button
                              onClick={() => handleReturnToDutyClick(activeTeacher)}
                              disabled={isUpdatingTeacherStatus || !engineReady}
                              className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                              title="End leave covers and give the teacher full control back"
                            >
                              <RotateCcw size={14} /> Return to Duty
                            </button>
                          )}
                          <select
                            value={(activeTeacher.status as TeacherStatus) || 'active'}
                            onChange={(e) => handleUpdateStatus(activeTeacher.id, e.target.value as TeacherStatus)}
                            disabled={isUpdatingTeacherStatus || !engineReady}
                            className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white disabled:opacity-50"
                            title="Change status"
                          >
                            {(Object.keys(STATUS_LABELS) as TeacherStatus[]).map(s => (
                              <option key={s} value={s}>
                                {STATUS_LABELS[s]}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => openEditModal(activeTeacher)}
                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit Teacher"
                          >
                            <Edit size={18} />
                          </button>
                          <button
                            onClick={() => openDeleteModal(activeTeacher)}
                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Teacher"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Details Body */}
                  <div className="p-6 flex-1 overflow-y-auto space-y-8">
                    {/* Contact Information */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Info size={16} className="text-gray-400" />
                        Contact Information
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                          <Mail size={18} className="text-gray-400 mt-0.5" />
                          <div>
                            <p className="text-xs text-gray-500 font-medium">Email Address</p>
                            <p className="text-sm text-gray-900 font-medium break-all">{activeTeacher.email || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                          <Phone size={18} className="text-gray-400 mt-0.5" />
                          <div>
                            <p className="text-xs text-gray-500 font-medium">Phone Number</p>
                            <p className="text-sm text-gray-900 font-medium">{activeTeacher.phone || 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Subjects */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <BookOpen size={16} className="text-gray-400" />
                        Subjects Taught
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {activeTeacher.subjects && activeTeacher.subjects.length > 0 ? (
                          activeTeacher.subjects.map((subject: string, idx: number) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-100"
                            >
                              {subject}
                            </span>
                          ))
                        ) : (
                          <p className="text-sm text-gray-500 italic">No subjects assigned yet.</p>
                        )}
                      </div>
                    </div>

                    {/* Class Assignments */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Briefcase size={16} className="text-gray-400" />
                        Class Assignments
                      </h3>
                      {assignmentsByClass.length > 0 ? (
                        <div className="space-y-3">
                          {assignmentsByClass.map((clsEntry) => {
                            const classObj = classes.find((c) => c.id === clsEntry.classId);
                            const className = classObj?.name || clsEntry.className || 'Unknown Class';
                            return (
                              <div
                                key={clsEntry.classId}
                                className="flex flex-col p-4 border border-gray-200 rounded-xl bg-white hover:border-blue-300 transition-colors gap-3"
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                                      <BookOpen size={20} />
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-gray-900 text-sm">{className}</h4>
                                      {clsEntry.isFormTeacher && (
                                        <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">
                                          <Star size={10} /> Form Teacher
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {isUserAdmin && (
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        onClick={() => openTransferModal(activeTeacher, clsEntry.classId, className)}
                                        disabled={!engineReady}
                                        className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                        title="Transfer to another class"
                                      >
                                        <ArrowRightLeft size={14} /> Transfer
                                      </button>
                                      <button
                                        onClick={() => handleRemoveAssignment(activeTeacher.id, clsEntry.classId)}
                                        disabled={!engineReady}
                                        className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                        title="Remove from this class"
                                      >
                                        <UserMinus size={14} /> Remove
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Per-subject rows */}
                                <div className="flex flex-col gap-1.5 pl-1">
                                  {clsEntry.subjectDetails.map((s) => {
                                    const isDelegate = s.relation === 'delegate';
                                    const roleLabel = ROLE_LABELS[s.roleType] || s.roleType;
                                    const roleCls =
                                      ROLE_BADGE_CLASSES[s.roleType] || 'bg-gray-100 text-gray-700 border-gray-200';
                                    const pending = isDelegate && s.delegationState === 'pending';

                                    return (
                                      <div key={s.assignmentId} className="flex flex-wrap items-center gap-2 text-xs text-gray-700">
                                        <span className="font-medium text-gray-800">{s.subject}</span>

                                        <span
                                          className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${roleCls}`}
                                        >
                                          {roleLabel}
                                        </span>

                                        {/* Delegate: whom they cover + window */}
                                        {isDelegate && s.ownerTeacherName && (
                                          <span className="text-[11px] text-gray-500">covering {s.ownerTeacherName}</span>
                                        )}
                                        {isDelegate && pending && s.startDate && (
                                          <span className="inline-flex items-center gap-1 text-[11px] text-blue-600">
                                            <Clock size={11} />
                                            Starts {formatShortDate(s.startDate)}
                                          </span>
                                        )}
                                        {isDelegate && s.endDate && (
                                          <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                                            <Clock size={11} />
                                            Until {formatShortDate(s.endDate)}
                                          </span>
                                        )}

                                        {/* Owner: covered by someone (live or scheduled) */}
                                        {s.isCovered && (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 text-[10px] font-semibold">
                                            {s.delegationState === 'pending' ? 'Cover scheduled' : 'Covered'} by{' '}
                                            {s.coveredByTeacherName}
                                            {s.coveredUntil ? ` until ${formatShortDate(s.coveredUntil)}` : ''}
                                          </span>
                                        )}

                                        {/* Who can enter grades/attendance right now */}
                                        {!s.canOperate && (
                                          <span
                                            className="inline-flex items-center gap-1 text-[10px] text-gray-500"
                                            title="Can't enter grades or attendance right now"
                                          >
                                            <Lock size={10} /> read-only
                                          </span>
                                        )}

                                        {/* Actions */}
                                        {isUserAdmin && isDelegate && (
                                          <button
                                            onClick={() =>
                                              handleEndCoverClick({
                                                id: s.assignmentId,
                                                teacherId: activeTeacher.id,
                                                teacherName: activeTeacher.name,
                                                classId: clsEntry.classId,
                                                className,
                                                subject: s.subject,
                                                normalizedSubjectId: s.normalizedSubjectId,
                                                isFormTeacher: s.isFormTeacher,
                                                roleType: s.roleType,
                                                status: s.status,
                                                startDate: s.startDate ?? undefined,
                                                endDate: s.endDate ?? null,
                                              } as TeacherAssignment)
                                            }
                                            disabled={isEndingAssignment || !engineReady}
                                            className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors disabled:opacity-50"
                                            title={s.roleType === 'tp' ? 'End TP and hand back' : 'End this cover'}
                                          >
                                            <UserCog size={12} /> {s.roleType === 'tp' ? 'Hand back' : 'End cover'}
                                          </button>
                                        )}

                                        {isUserAdmin && !isDelegate && s.isCovered && (
                                          <button
                                            onClick={() => handleEndDelegationOnOwnedSlot(s, className)}
                                            disabled={isEndingAssignment || !engineReady}
                                            className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-md transition-colors disabled:opacity-50"
                                            title="End the cover and give control back to this teacher"
                                          >
                                            <RotateCcw size={12} /> {s.coveredByRole === 'tp' ? 'Hand back' : 'End cover'}
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center p-6 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                          <p className="text-sm text-gray-500">No class assignments yet.</p>
                          {isUserAdmin && (
                            <button
                              onClick={() => openAssignmentModal(activeTeacher)}
                              disabled={!engineReady}
                              className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1.5 mx-auto disabled:opacity-50"
                            >
                              <UserPlus size={16} /> Assign to a Class
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Details Footer */}
                  {isUserAdmin && (
                    <div className="p-4 border-t border-gray-200 bg-gray-50 flex flex-wrap gap-2 justify-end">
                      <button
                        onClick={() => openAssignmentModal(activeTeacher)}
                        disabled={!engineReady}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                      >
                        <UserPlus size={16} /> Assign to Class
                      </button>
                      <button
                        onClick={() => handleBulkRemoveClick(activeTeacher)}
                        disabled={!engineReady}
                        className="px-4 py-2 bg-white text-gray-700 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50"
                      >
                        <Layers size={16} /> Bulk Remove
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-[600px] lg:h-[calc(100vh-280px)] flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <Users size={40} className="text-gray-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No Teacher Selected</h3>
                  <p className="text-gray-500 max-w-sm">
                    Select a teacher from the list on the left to view their profile, assignments and actions.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Footer info */}
          {filteredTeachers.length > 0 && (
            <div className="mt-6 text-xs sm:text-sm text-gray-500 text-center lg:text-left">
              Showing {filteredTeachers.length} of {teachers?.length || 0} teachers
              {searchTerm && ` matching "${searchTerm}"`}
              {statusFilter !== 'all' && ` • ${statusFilter.replace('_', ' ')} status`}
              {assignmentFilter !== 'all' && ` • ${assignmentFilter.replace('-', ' ')}`}
            </div>
          )}
        </div>
      </DashboardLayout>

      {/* ===== MODALS ===== */}
      <ConfirmationModal
        isOpen={activeModal === 'confirm'}
        data={modalData}
        onClose={resetModalState}
        onConfirm={handleConfirmAction}
      />

      <AssignmentModal
        isOpen={activeModal === 'assignment'}
        teacher={selectedTeacher}
        teachers={teachers}
        classes={classes}
        selectedClassId={selectedClassId}
        selectedSubjects={selectedSubjects}
        currentSubject={currentSubject}
        assignAsFormTeacher={assignAsFormTeacher}
        isAssigning={isAssigningTeacher}
        roleType={coverRoleType}
        startDate={coverStartDate}
        endDate={coverEndDate}
        onRoleTypeChange={setCoverRoleType}
        onStartDateChange={setCoverStartDate}
        onEndDateChange={setCoverEndDate}
        onTeacherChange={setSelectedTeacher}
        onClassChange={setSelectedClassId}
        onSubjectChange={setCurrentSubject}
        onAddSubject={handleAddSubject}
        onRemoveSubject={handleRemoveSubject}
        onFormTeacherChange={setAssignAsFormTeacher}
        onAssign={handleAssignTeacher}
        onClose={resetModalState}
      />

      <EditTeacherModal
        isOpen={activeModal === 'edit'}
        teacher={selectedTeacher}
        editData={editTeacherData}
        isUpdating={isUpdatingTeacher}
        onDataChange={setEditTeacherData}
        onAddSubject={handleAddSubjectToTeacher}
        onRemoveSubject={handleRemoveSubjectFromTeacher}
        onSave={handleEditTeacher}
        onClose={resetModalState}
      />

      <DeleteTeacherModal
        isOpen={activeModal === 'delete'}
        teacher={selectedTeacher}
        isDeleting={isDeletingTeacher}
        onConfirm={handleDeleteTeacher}
        onClose={resetModalState}
      />

      <RemoveSubjectModal
        isOpen={activeModal === 'subject-remove'}
        teacher={selectedTeacher}
        className={selectedClassName}
        subject={selectedSubjectToRemove}
        isRemoving={isRemovingSubject}
        onConfirm={handleRemoveSubjectFromClass}
        onClose={resetModalState}
      />

      <TransferTeacherModal
        isOpen={activeModal === 'transfer'}
        teacher={selectedTeacher}
        sourceClassId={selectedClassId}
        sourceClassName={selectedClassName}
        classes={classes}
        targetClassId={targetClassId}
        isTransferring={isTransferringTeacher}
        onTargetClassChange={setTargetClassId}
        onConfirm={handleTransferTeacher}
        onClose={resetModalState}
      />

      <BulkRemoveModal
        isOpen={activeModal === 'bulk-remove'}
        teacher={selectedTeacher}
        assignments={bulkRemoveAssignments}
        classes={classes}
        isLoading={isRemovingTeacher}
        onConfirm={handleConfirmBulkRemove}
        onClose={resetModalState}
      />

      <TeachersPreviewModal
        isOpen={activeModal === 'teachers-preview'}
        teachers={previewTeachers}
        classes={classes}
        assignments={previewAssignments}
        filterInfo={previewFilterInfo}
        onClose={resetModalState}
        onDownload={handleDownloadClick}
        isDownloading={false}
      />

      <OverlappingSlotsModal
        isOpen={showOverlappingSlots}
        slots={overlappingSlots}
        isLoading={isLoadingOverlapping}
        isResolving={isResolvingSlotConflict}
        onClose={() => setShowOverlappingSlots(false)}
        onResolve={handleResolveOverlap}
      />
    </>
  );
}