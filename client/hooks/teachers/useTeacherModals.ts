// client/hooks/teachers/useTeacherModals.ts
import { useState } from 'react';
import { Teacher, ModalType, ModalData } from '@/types/teachers';

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
  };

  const openAssignmentModal = (teacher?: Teacher) => {
    setSelectedTeacher(teacher || null);
    setSelectedSubjects([]);
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

  const openRemoveSubjectModal = (teacher: Teacher, classId: string, className: string, subject: string) => {
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

  const openPreviewModal = (teachers: Teacher[], assignments: Record<string, any[]>, filterInfo: string) => {
    setPreviewTeachers(teachers);
    setPreviewAssignments(assignments);
    setPreviewFilterInfo(filterInfo);
    setActiveModal('teachers-preview');
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
  };
};