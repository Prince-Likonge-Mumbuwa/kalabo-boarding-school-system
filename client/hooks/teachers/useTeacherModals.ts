// client/hooks/teachers/useTeacherModals.ts
import { useState } from 'react';
import { Teacher, ModalType, ModalData } from '@/types/teachers';
import type { AssignmentRoleType, TeacherAssignment } from '@/types/school';

export const useTeacherModals = () => {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [modalData, setModalData] = useState<ModalData>({});
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedClassName, setSelectedClassName] = useState<string>('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [currentSubject, setCurrentSubject] = useState<string>('');
  const [assignAsFormTeacher, setAssignAsFormTeacher] = useState(false);
  const [targetClassId, setTargetClassId] = useState('');
  const [selectedSubjectToRemove, setSelectedSubjectToRemove] = useState<string>('');
  const [bulkRemoveAssignments, setBulkRemoveAssignments] = useState<any[]>([]);

  // ── NEW: assignment-role fields for the assignment modal ────────
  const [coverRoleType, setCoverRoleType] = useState<AssignmentRoleType>('substantive');
  const [coverStartDate, setCoverStartDate] = useState<string>('');   // ISO date "YYYY-MM-DD"
  const [coverEndDate, setCoverEndDate] = useState<string>('');       // ISO date, required for tp/leave-cover

  // ── NEW: target assignment for the end-assignment modal ─────────
  const [assignmentToEnd, setAssignmentToEnd] = useState<TeacherAssignment | null>(null);

  const [previewTeachers, setPreviewTeachers] = useState<Teacher[]>([]);
  const [previewAssignments, setPreviewAssignments] = useState<Record<string, any[]>>({});
  const [previewFilterInfo, setPreviewFilterInfo] = useState<string>('');

  const resetModalState = () => {
    setActiveModal(null);
    setModalData({});
    setSelectedTeacher(null);
    setSelectedClassId('');
    setSelectedClassName('');
    setSelectedSubjects([]);
    setCurrentSubject('');
    setAssignAsFormTeacher(false);
    setTargetClassId('');
    setSelectedSubjectToRemove('');
    setBulkRemoveAssignments([]);

    // NEW
    setCoverRoleType('substantive');
    setCoverStartDate('');
    setCoverEndDate('');
    setAssignmentToEnd(null);
  };

  const openAssignmentModal = (
    teacher?: Teacher,
    initialRoleType: AssignmentRoleType = 'substantive'
  ) => {
    setSelectedTeacher(teacher || null);
    setSelectedSubjects([]);
    setAssignAsFormTeacher(false);
    setSelectedClassId('');
    setCurrentSubject('');

    // NEW defaults
    setCoverRoleType(initialRoleType);
    setCoverStartDate(new Date().toISOString().split('T')[0]); // today
    setCoverEndDate('');

    setActiveModal('assignment');
  };

  const openEditModal = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setActiveModal('edit');
  };

  const openDeleteModal = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setActiveModal('delete');
  };

  const openTransferModal = (teacher: Teacher, classId: string, className: string) => {
    setSelectedTeacher(teacher);
    setSelectedClassId(classId);
    setSelectedClassName(className);
    setTargetClassId('');
    setActiveModal('transfer');
  };

  const openRemoveSubjectModal = (
    teacher: Teacher,
    classId: string,
    className: string,
    subject: string
  ) => {
    setSelectedTeacher(teacher);
    setSelectedClassId(classId);
    setSelectedClassName(className);
    setSelectedSubjectToRemove(subject);
    setActiveModal('subject-remove');
  };

  const openBulkRemoveModal = (teacher: Teacher, assignments: any[]) => {
    setSelectedTeacher(teacher);
    setBulkRemoveAssignments(assignments);
    setActiveModal('bulk-remove');
  };

  const openConfirmationModal = (data: ModalData) => {
    setModalData(data);
    setActiveModal('confirm');
  };

  const openPreviewModal = (
    teachers: Teacher[],
    assignments: Record<string, any[]>,
    filterInfo: string
  ) => {
    setPreviewTeachers(teachers);
    setPreviewAssignments(assignments);
    setPreviewFilterInfo(filterInfo);
    setActiveModal('teachers-preview');
  };

  // ── End-assignment modal ────────────────────────────────────────
  // NOTE: not currently wired up — TeacherManagement.tsx opens the
  // end-cover confirmation via openConfirmationModal directly. Kept for
  // completeness and corrected so its wording matches the slot engine
  // (the primary teacher keeps ownership; only authority reverts).
  const openEndAssignmentModal = (assignment: TeacherAssignment) => {
    const isTp = assignment.roleType === 'tp';
    setAssignmentToEnd(assignment);
    setModalData({
      teacher: selectedTeacher || undefined,
      assignmentId: assignment.id,
      action: 'assignment-end',
      title: isTp ? 'End Teaching Practice' : 'End Cover',
      message:
        `End ${assignment.teacherName}'s ${assignment.roleType} assignment for ` +
        `${assignment.subject} in ${assignment.className}? The primary teacher gets ` +
        `control back immediately.`,
      confirmText: isTp ? 'Hand Back' : 'End Cover',
      cancelText: 'Cancel',
    });
    setActiveModal('confirm');
  };

  return {
    // State
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

    // NEW state
    coverRoleType,
    coverStartDate,
    coverEndDate,
    assignmentToEnd,

    // Setters
    setSelectedTeacher,
    setSelectedClassId,
    setSelectedClassName,
    setSelectedSubjects,
    setCurrentSubject,
    setAssignAsFormTeacher,
    setTargetClassId,
    setSelectedSubjectToRemove,
    setBulkRemoveAssignments,
    setModalData,
    setActiveModal,

    // NEW setters
    setCoverRoleType,
    setCoverStartDate,
    setCoverEndDate,
    setAssignmentToEnd,

    // Actions
    resetModalState,
    openAssignmentModal,
    openEditModal,
    openDeleteModal,
    openTransferModal,
    openRemoveSubjectModal,
    openBulkRemoveModal,
    openConfirmationModal,
    openPreviewModal,

    // NEW action
    openEndAssignmentModal,
  };
};