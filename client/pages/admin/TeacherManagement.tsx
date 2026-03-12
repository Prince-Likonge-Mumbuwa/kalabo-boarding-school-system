import { DashboardLayout } from '@/components/DashboardLayout';
import { useSchoolTeachers } from '@/hooks/useSchoolTeachers';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useAuth } from '@/hooks/useAuth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
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
  Grid3X3,
  List,
  Star
} from 'lucide-react';
import { generateTeacherListPDF } from '@/services/pdf/teacherListPDF';

// Import types
import { Teacher, TeacherStatus, ViewMode, ModalType } from '@/types/teachers';

// Import hooks
import { useTeacherFilters } from '@/hooks/teachers/useTeacherFilters';
import { useTeacherModals } from '@/hooks/teachers/useTeacherModals';
import { useTeacherBulkOperations } from '@/hooks/teachers/useTeacherBulkOperations';

// Import components
import { TeacherCard } from '@/components/teachers/TeacherCard';
import { TeacherDataTable } from '@/components/teachers/TeacherDataTable';
import {
  TeachersPreviewModal,
  ConfirmationModal,
  AssignmentModal,
  EditTeacherModal,
  DeleteTeacherModal,
  RemoveSubjectModal,
  TransferTeacherModal,
  BulkRemoveModal
} from '@/components/teachers/TeacherModals';

export default function TeacherManagement() {
  const { user } = useAuth();
  const isUserAdmin = user?.userType === 'admin';
  const isMobile = useMediaQuery('(max-width: 640px)');
  const queryClient = useQueryClient();
  
  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  
  // Edit teacher data state
  const [editTeacherData, setEditTeacherData] = useState({
    name: '',
    email: '',
    phone: '',
    department: '',
    subjects: [] as string[],
    newSubject: ''
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
    assignTeacherToClass,
    assignTeacherWithMultipleSubjects,
    removeTeacherFromClass,
    removeTeacherSubject,
    updateTeacherStatus,
    updateTeacher,
    deleteTeacher,
    transferTeacher,
    refetchTeachers,
  } = useSchoolTeachers();
  
  const { 
    classes = [],
    isLoading: isLoadingClasses,
    isError: classesError,
    refetch: refetchClasses
  } = useSchoolClasses({ isActive: true });

  const { 
    learners = [],
    refetch: refetchLearners
  } = useSchoolLearners('');

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
    clearFilters
  } = useTeacherFilters(teachers);

  // Modal hook
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
    resetModalState,
    openAssignmentModal,
    openEditModal,
    openDeleteModal,
    openTransferModal,
    openRemoveSubjectModal,
    openBulkRemoveModal,
    openConfirmationModal,
    openPreviewModal
  } = useTeacherModals();

  // Bulk operations hook
  const {
    toasts,
    addToast,
    removeToast,
    handleBulkRemove,
    handlePreviewTeachers,
    handleDownloadPDF
  } = useTeacherBulkOperations();

  // ==================== EFFECTS ====================
  useEffect(() => {
    if (selectedTeacher && activeModal === 'edit') {
      setEditTeacherData({
        name: selectedTeacher.name || '',
        email: selectedTeacher.email || '',
        phone: selectedTeacher.phone || '',
        department: selectedTeacher.department || '',
        subjects: Array.isArray(selectedTeacher.subjects) ? selectedTeacher.subjects : [],
        newSubject: ''
      });
    }
  }, [selectedTeacher, activeModal]);

  // ==================== HANDLERS ====================
  const handleViewLearners = async (classId?: string) => {
    try {
      let learnersToShow = [...learners];
      let className = 'All Learners';
      
      if (classId) {
        const classObj = classes.find(c => c.id === classId);
        className = classObj?.name || 'Unknown Class';
        learnersToShow = learners.filter(learner => learner.classId === classId);
      }
      
      addToast({
        type: 'info',
        title: 'Learners Found',
        message: `${learnersToShow.length} learners in ${className}`,
        duration: 3000
      });
      
    } catch (error) {
      console.error('Error loading learners:', error);
      addToast({
        type: 'error',
        title: 'Failed to Load Learners',
        message: 'An error occurred while loading learners data.',
        duration: 5000
      });
    }
  };

  const handleUpdateStatus = async (teacherId: string, newStatus: TeacherStatus) => {
    if (!isUserAdmin) {
      addToast({
        type: 'error',
        title: 'Permission Denied',
        message: 'Only administrators can update teacher status'
      });
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

    openConfirmationModal({
      teacher,
      newStatus,
      action: 'status-update',
      title: `Change Status to ${statusLabels[newStatus]}`,
      message: `Are you sure you want to change ${teacher.name}'s status to ${statusLabels[newStatus]}?`,
      confirmText: 'Update Status',
      cancelText: 'Cancel'
    });
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
          subjects: editTeacherData.subjects
        }
      });
      
      addToast({
        type: 'success',
        title: 'Teacher Updated',
        message: `${selectedTeacher.name}'s information has been updated successfully.`,
        duration: 4000
      });
      
      resetModalState();
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
    } catch (error: any) {
      console.error('Update error:', error);
      addToast({
        type: 'error',
        title: 'Update Failed',
        message: error.message || 'Failed to update teacher information',
        duration: 5000
      });
    }
  };

  const handleDeleteTeacher = async () => {
    if (!selectedTeacher) return;

    try {
      await deleteTeacher(selectedTeacher.id);
      
      addToast({
        type: 'success',
        title: 'Teacher Deleted',
        message: `${selectedTeacher.name} has been permanently deleted.`,
        duration: 4000
      });
      
      resetModalState();
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
    } catch (error: any) {
      console.error('Delete error:', error);
      addToast({
        type: 'error',
        title: 'Delete Failed',
        message: error.message || 'Failed to delete teacher',
        duration: 5000
      });
    }
  };

  const handleAddSubjectToTeacher = () => {
    if (!editTeacherData.newSubject) {
      addToast({
        type: 'warning',
        title: 'Subject Required',
        message: 'Please enter a subject name',
        duration: 3000
      });
      return;
    }

    if (editTeacherData.subjects.includes(editTeacherData.newSubject)) {
      addToast({
        type: 'warning',
        title: 'Duplicate Subject',
        message: 'This subject has already been added',
        duration: 3000
      });
      return;
    }

    setEditTeacherData({
      ...editTeacherData,
      subjects: [...editTeacherData.subjects, editTeacherData.newSubject],
      newSubject: ''
    });

    addToast({
      type: 'success',
      title: 'Subject Added',
      message: `${editTeacherData.newSubject} has been added to the teacher's subjects.`,
      duration: 2000
    });
  };

  const handleRemoveSubjectFromTeacher = (subjectToRemove: string) => {
    setEditTeacherData({
      ...editTeacherData,
      subjects: editTeacherData.subjects.filter(s => s !== subjectToRemove)
    });

    addToast({
      type: 'info',
      title: 'Subject Removed',
      message: `${subjectToRemove} has been removed from the teacher's subjects.`,
      duration: 2000
    });
  };

  const handleAddSubject = () => {
    if (!currentSubject) {
      addToast({
        type: 'warning',
        title: 'Subject Required',
        message: 'Please select a subject',
        duration: 3000
      });
      return;
    }

    if (selectedSubjects.includes(currentSubject)) {
      addToast({
        type: 'warning',
        title: 'Duplicate Subject',
        message: 'This subject has already been added',
        duration: 3000
      });
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
      addToast({
        type: 'warning',
        title: 'Incomplete Selection',
        message: 'Please select both a teacher and a class',
        duration: 3000
      });
      return;
    }

    if (!assignAsFormTeacher && selectedSubjects.length === 0) {
      addToast({
        type: 'warning',
        title: 'No Role Selected',
        message: 'Please either assign as Form Teacher OR select at least one subject to teach',
        duration: 4000
      });
      return;
    }

    if (!isUserAdmin) {
      addToast({
        type: 'error',
        title: 'Permission Denied',
        message: 'Only administrators can assign teachers to classes',
        duration: 4000
      });
      return;
    }

    const selectedClass = classes.find(c => c.id === selectedClassId);
    if (!selectedClass) {
      addToast({
        type: 'error',
        title: 'Class Not Found',
        message: 'The selected class could not be found',
        duration: 3000
      });
      return;
    }

    try {
      if (selectedSubjects.length > 0) {
        await assignTeacherWithMultipleSubjects({
          teacherId: selectedTeacher.id,
          classId: selectedClassId,
          subjects: selectedSubjects,
          isFormTeacher: assignAsFormTeacher
        });
      } else if (assignAsFormTeacher) {
        await assignTeacherToClass({
          teacherId: selectedTeacher.id,
          classId: selectedClassId,
          subject: 'Form Teacher',
          isFormTeacher: true
        });
      }
      
      const roleText = assignAsFormTeacher ? 'Form Teacher' : 'Subject Teacher';
      const subjectsText = selectedSubjects.length > 0 ? ` for ${selectedSubjects.length} subject(s)` : '';
      
      addToast({
        type: 'success',
        title: 'Assignment Successful',
        message: `${selectedTeacher.name} assigned to ${selectedClass.name} as ${roleText}${subjectsText}`,
        duration: 5000
      });
      
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['teacher_assignments', selectedTeacher.id] });
      
      resetModalState();
      
    } catch (error: any) {
      console.error('Assignment error:', error);
      addToast({
        type: 'error',
        title: 'Assignment Failed',
        message: error.message || 'Failed to assign teacher',
        duration: 5000
      });
    }
  };

  const handleRemoveSubjectFromClass = async () => {
    if (!selectedTeacher || !selectedClassId || !selectedSubjectToRemove) return;

    try {
      await removeTeacherSubject({
        teacherId: selectedTeacher.id,
        classId: selectedClassId,
        subject: selectedSubjectToRemove
      });
      
      addToast({
        type: 'success',
        title: 'Subject Removed',
        message: `${selectedSubjectToRemove} has been removed from ${selectedTeacher.name}'s assignments.`,
        duration: 4000
      });
      
      queryClient.invalidateQueries({ queryKey: ['teacher_assignments', selectedTeacher.id] });
      
      resetModalState();
    } catch (error: any) {
      console.error('Remove subject error:', error);
      addToast({
        type: 'error',
        title: 'Remove Failed',
        message: error.message || 'Failed to remove subject',
        duration: 5000
      });
    }
  };

  const handleRemoveFormTeacherStatus = async () => {
    if (!selectedTeacher || !selectedClassId) return;

    try {
      await removeTeacherSubject({
        teacherId: selectedTeacher.id,
        classId: selectedClassId,
        subject: 'Form Teacher'
      });
      
      addToast({
        type: 'success',
        title: 'Status Updated',
        message: `${selectedTeacher.name} is no longer Form Teacher of this class.`,
        duration: 4000
      });
      
      queryClient.invalidateQueries({ queryKey: ['teacher_assignments', selectedTeacher.id] });
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      
      resetModalState();
      
    } catch (error: any) {
      console.error('Remove form teacher error:', error);
      addToast({
        type: 'error',
        title: 'Update Failed',
        message: error.message || 'Failed to remove form teacher status',
        duration: 5000
      });
    }
  };

  const handleRemoveFromClass = async () => {
    if (!selectedTeacher || !selectedClassId) return;

    try {
      await removeTeacherFromClass({
        teacherId: selectedTeacher.id,
        classId: selectedClassId
      });
      
      addToast({
        type: 'success',
        title: 'Teacher Removed',
        message: `${selectedTeacher.name} has been removed from the class.`,
        duration: 4000
      });
      
      queryClient.invalidateQueries({ queryKey: ['teacher_assignments', selectedTeacher.id] });
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      
      resetModalState();
      
    } catch (error: any) {
      console.error('Remove error:', error);
      addToast({
        type: 'error',
        title: 'Remove Failed',
        message: error.message || 'Failed to remove teacher',
        duration: 5000
      });
    }
  };

  const handleRemoveAssignment = async (teacherId: string, classId: string) => {
    if (!isUserAdmin) {
      addToast({
        type: 'error',
        title: 'Permission Denied',
        message: 'Only administrators can remove teacher assignments'
      });
      return;
    }

    const teacher = teachers.find(t => t.id === teacherId);
    const classObj = classes.find(c => c.id === classId);

    openConfirmationModal({
      teacher,
      classId,
      className: classObj?.name,
      action: 'assignment-remove',
      title: 'Remove Teacher Assignment',
      message: `Are you sure you want to remove ${teacher?.name}'s assignment from ${classObj?.name}? This will remove all subjects they teach in this class.`,
      confirmText: 'Remove',
      cancelText: 'Cancel'
    });
  };

  const handleConfirmRemoveAssignment = async () => {
    if (!modalData || !modalData.teacher || !modalData.classId) return;

    try {
      await removeTeacherFromClass({
        teacherId: modalData.teacher.id,
        classId: modalData.classId
      });
      
      addToast({
        type: 'success',
        title: 'Assignment Removed',
        message: `${modalData.teacher.name} has been removed from ${modalData.className}.`,
        duration: 4000
      });
      
      queryClient.invalidateQueries({ queryKey: ['teacher_assignments', modalData.teacher.id] });
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      
      resetModalState();
    } catch (error: any) {
      console.error('Remove assignment error:', error);
      addToast({
        type: 'error',
        title: 'Remove Failed',
        message: error.message || 'Failed to remove assignment',
        duration: 5000
      });
    }
  };

  const handleTransferTeacher = async () => {
    if (!selectedTeacher || !selectedClassId || !targetClassId) {
      addToast({
        type: 'warning',
        title: 'Incomplete Selection',
        message: 'Please select both source and target classes',
        duration: 3000
      });
      return;
    }

    const targetClass = classes.find(c => c.id === targetClassId);
    const sourceClass = classes.find(c => c.id === selectedClassId);

    try {
      await transferTeacher({
        teacherId: selectedTeacher.id,
        fromClassId: selectedClassId,
        toClassId: targetClassId
      });
      
      addToast({
        type: 'success',
        title: 'Transfer Successful',
        message: `${selectedTeacher.name} transferred from ${sourceClass?.name} to ${targetClass?.name}`,
        duration: 5000
      });
      
      queryClient.invalidateQueries({ queryKey: ['teacher_assignments', selectedTeacher.id] });
      
      resetModalState();
    } catch (error: any) {
      console.error('Transfer error:', error);
      addToast({
        type: 'error',
        title: 'Transfer Failed',
        message: error.message || 'Failed to transfer teacher',
        duration: 5000
      });
    }
  };

  const handleBulkRemoveClick = (teacher: Teacher) => {
    fetch(`/api/teacher-assignments/${teacher.id}`)
      .then(res => res.json())
      .then(data => {
        openBulkRemoveModal(teacher, data);
      })
      .catch(error => {
        console.error('Error fetching assignments:', error);
        addToast({
          type: 'error',
          title: 'Failed to Load Assignments',
          message: 'Could not load teacher assignments.',
          duration: 4000
        });
      });
  };

  const handleConfirmBulkRemove = async (selectedClassIds: string[]) => {
    if (!selectedTeacher) return;
    
    const success = await handleBulkRemove(
      selectedTeacher,
      selectedClassIds,
      removeTeacherFromClass
    );
    
    if (success) {
      resetModalState();
    }
  };

  const handlePreviewClick = async () => {
    const result = await handlePreviewTeachers(
      teachers,
      filteredTeachers,
      searchTerm,
      statusFilter,
      assignmentFilter
    );
    
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
    
    if (success) {
      resetModalState();
    }
  };

  const handleConfirmAction = async () => {
    if (!modalData) return;

    switch (modalData.action) {
      case 'status-update':
        try {
          await updateTeacherStatus({ 
            teacherId: modalData.teacher.id, 
            status: modalData.newStatus 
          });
          
          const statusLabels = {
            active: 'Active',
            inactive: 'Inactive',
            transferred: 'Transferred',
            on_leave: 'On Leave'
          };
          
          addToast({
            type: 'success',
            title: 'Status Updated',
            message: `${modalData.teacher.name}'s status changed to ${statusLabels[modalData.newStatus]}`,
            duration: 4000
          });
          
          resetModalState();
        } catch (error: any) {
          console.error('Status update error:', error);
          addToast({
            type: 'error',
            title: 'Update Failed',
            message: error.message || 'Failed to update teacher status',
            duration: 5000
          });
        }
        break;
      
      case 'remove-from-class':
        setSelectedTeacher(modalData.teacher);
        setSelectedClassId(modalData.classId);
        await handleRemoveFromClass();
        break;
      
      case 'remove-form-teacher':
        setSelectedTeacher(modalData.teacher);
        setSelectedClassId(modalData.classId);
        await handleRemoveFormTeacherStatus();
        break;
      
      case 'assignment-remove':
        await handleConfirmRemoveAssignment();
        break;
      
      default:
        resetModalState();
    }
  };

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
              {teachersErrorMessage?.message || 'An error occurred while fetching teachers'}
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
            {toasts.map(toast => (
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
                    <p className={`font-medium text-sm
                      ${toast.type === 'success' ? 'text-green-800' : ''}
                      ${toast.type === 'error' ? 'text-red-800' : ''}
                      ${toast.type === 'warning' ? 'text-yellow-800' : ''}
                      ${toast.type === 'info' ? 'text-blue-800' : ''}
                    `}>
                      {toast.title}
                    </p>
                    <p className={`text-xs mt-0.5
                      ${toast.type === 'success' ? 'text-green-700' : ''}
                      ${toast.type === 'error' ? 'text-red-700' : ''}
                      ${toast.type === 'warning' ? 'text-yellow-700' : ''}
                      ${toast.type === 'info' ? 'text-blue-700' : ''}
                    `}>
                      {toast.message}
                    </p>
                  </div>
                  <button
                    onClick={() => removeToast(toast.id)}
                    className="flex-shrink-0 hover:opacity-70"
                  >
                    <X size={16} className="text-gray-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          {/* ===== HEADER ===== */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
                  Teacher Management
                </h1>
                <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2 flex items-center gap-2 flex-wrap">
                  <span>{filteredTeachers.length} teacher{filteredTeachers.length !== 1 ? 's' : ''} shown</span>
                  <span className="text-gray-300">•</span>
                  <span className="text-green-600">{stats.activeTeachers} active</span>
                  <span className="text-gray-300">•</span>
                  <span className="text-purple-600">{stats.formTeachers} form teachers</span>
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
                <div className="flex gap-2">
                  {/* View Mode Toggle */}
                  <div className="flex items-center bg-white border border-gray-300 rounded-xl overflow-hidden mr-2">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-2.5 transition-colors ${
                        viewMode === 'grid' 
                          ? 'bg-blue-50 text-blue-600' 
                          : 'text-gray-500 hover:bg-gray-50'
                      }`}
                      title="Grid view"
                    >
                      <Grid3X3 size={isMobile ? 16 : 18} />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-2.5 transition-colors ${
                        viewMode === 'list' 
                          ? 'bg-blue-50 text-blue-600' 
                          : 'text-gray-500 hover:bg-gray-50'
                      }`}
                      title="List view"
                    >
                      <List size={isMobile ? 16 : 18} />
                    </button>
                  </div>

                  <button
                    onClick={handlePreviewClick}
                    className={`
                      inline-flex items-center justify-center
                      bg-green-600 text-white rounded-xl hover:bg-green-700
                      font-medium transition-all active:scale-[0.98]
                      focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2
                      ${isMobile ? 'p-2.5' : 'px-4 py-2.5 gap-2'}
                    `}
                    title={isMobile ? 'Download Teachers List' : undefined}
                  >
                    <Download size={isMobile ? 18 : 20} />
                    {!isMobile && 'Download Teachers List'}
                  </button>
                  
                  <button
                    onClick={() => openAssignmentModal()}
                    disabled={isAssigningTeacher}
                    className={`
                      inline-flex items-center justify-center
                      bg-blue-600 text-white rounded-xl hover:bg-blue-700
                      font-medium transition-all active:scale-[0.98]
                      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                      disabled:opacity-50 disabled:cursor-not-allowed
                      ${isMobile ? 'p-2.5' : 'px-4 py-2.5 gap-2'}
                    `}
                    title={isMobile ? 'Assign teacher' : undefined}
                  >
                    {isAssigningTeacher ? (
                      <Loader2 size={isMobile ? 18 : 20} className="animate-spin" />
                    ) : (
                      <UserCheck size={isMobile ? 18 : 20} />
                    )}
                    {!isMobile && 'Assign to Class'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ===== STATS CARDS ===== */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4 mb-6">
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
                </div>.
              </div>
            </div>

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

            <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-indigo-50 rounded-lg">
                  <Briefcase size={isMobile ? 14 : 16} className="text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-600 truncate">Assigned</p>
                  <p className="text-lg sm:text-xl lg:text-2xl font-bold text-indigo-600">
                    {stats.assignedTeachers}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-purple-50 rounded-lg">
                  <Star size={isMobile ? 14 : 16} className="text-purple-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-600 truncate">Form Teachers</p>
                  <p className="text-lg sm:text-xl lg:text-2xl font-bold text-purple-600">
                    {stats.formTeachers}
                  </p>
                </div>
              </div>
            </div>
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
                    {searchTerm || statusFilter !== 'all' || assignmentFilter !== 'all' ? 'Filters active' : 'Search & filters'}
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

            <div className={`
              ${isMobile ? 'px-4 pb-4' : 'p-4'}
              ${isMobile && !showMobileFilters ? 'hidden' : 'block'}
            `}>
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder={isMobile ? "Search teachers..." : "Search by name, email, phone, NRC, TS#, or Emp#..."}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             text-sm sm:text-base transition-shadow"
                  />
                </div>
                
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
                    className="w-full pl-10 pr-8 py-2.5 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             appearance-none bg-white cursor-pointer text-sm sm:text-base
                             hover:border-gray-400 transition-colors"
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
                  <button onClick={clearFilters} className="text-blue-600 hover:text-blue-700 font-medium text-xs sm:text-sm hover:underline ml-1">
                    Clear all
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ===== TEACHERS DISPLAY ===== */}
          {filteredTeachers.length > 0 ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {filteredTeachers.map((teacher) => (
                  <TeacherCard
                    key={teacher.id}
                    teacher={teacher}
                    isUserAdmin={isUserAdmin}
                    classes={classes}
                    onEdit={() => openEditModal(teacher)}
                    onDelete={() => openDeleteModal(teacher)}
                    onAssign={() => openAssignmentModal(teacher)}
                    onBulkRemove={() => handleBulkRemoveClick(teacher)}
                    onStatusUpdate={(status) => handleUpdateStatus(teacher.id, status)}
                    onRemoveFromClass={(classId, className) => {
                      openConfirmationModal({
                        teacher,
                        classId,
                        className,
                        action: 'remove-from-class',
                        title: 'Remove Teacher from Class',
                        message: `Remove ${teacher.name} completely from ${className}? This will remove all subject assignments and form teacher status.`,
                        confirmText: 'Remove Completely',
                        cancelText: 'Cancel'
                      });
                    }}
                    onRemoveFormTeacher={(classId, className) => {
                      openConfirmationModal({
                        teacher,
                        classId,
                        className,
                        action: 'remove-form-teacher',
                        title: 'Remove Form Teacher Status',
                        message: `Remove ${teacher.name} as Form Teacher of ${className}? They will remain as subject teacher.`,
                        confirmText: 'Remove Status',
                        cancelText: 'Cancel'
                      });
                    }}
                    onRemoveSubject={(classId, className, subject) => {
                      openRemoveSubjectModal(teacher, classId, className, subject);
                    }}
                    onRemoveAssignment={(classId, className) => {
                      openConfirmationModal({
                        teacher,
                        classId,
                        className,
                        action: 'assignment-remove',
                        title: 'Remove Teacher Assignment',
                        message: `Are you sure you want to remove ${teacher.name}'s assignment from ${className}? This will remove all subjects they teach in this class.`,
                        confirmText: 'Remove',
                        cancelText: 'Cancel'
                      });
                    }}
                    onTransfer={(classId, className) => {
                      openTransferModal(teacher, classId, className);
                    }}
                    onViewLearners={(classId) => handleViewLearners(classId)}
                  />
                ))}
              </div>
            ) : (
              <TeacherDataTable
                teachers={filteredTeachers}
                classes={classes}
                isUserAdmin={isUserAdmin}
                onEdit={openEditModal}
                onDelete={openDeleteModal}
                onAssign={openAssignmentModal}
                onBulkRemove={handleBulkRemoveClick}
                onViewLearners={handleViewLearners}
              />
            )
          ) : (
            <div className="text-center py-16 sm:py-20 bg-white rounded-2xl border border-gray-200 shadow-sm">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
                <Users className="text-gray-400" size={36} />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No teachers found</h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                {searchTerm || statusFilter !== 'all' || assignmentFilter !== 'all'
                  ? 'Try adjusting your filters to find what you\'re looking for.'
                  : 'Teachers can create accounts via the sign-up page. Assign them to classes once registered.'}
              </p>
              {(searchTerm || statusFilter !== 'all' || assignmentFilter !== 'all') && (
                <button onClick={clearFilters} className="inline-flex items-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition-all">
                  Clear Filters
                </button>
              )}
            </div>
          )}

          {filteredTeachers.length > 0 && (
            <div className="mt-6 text-xs sm:text-sm text-gray-500 text-center sm:text-left">
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
    </>
  );
}