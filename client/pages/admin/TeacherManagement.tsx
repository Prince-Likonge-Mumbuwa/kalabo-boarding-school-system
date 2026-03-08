import { DashboardLayout } from '@/components/DashboardLayout';
import { useSchoolTeachers } from '@/hooks/useSchoolTeachers';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useAuth } from '@/hooks/useAuth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useState, useMemo, useEffect } from 'react';
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
  PowerOff,
  RefreshCw,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  Edit,
  Save,
  ArrowRight,
  Star,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

// Teacher status type
type TeacherStatus = 'active' | 'inactive' | 'transferred' | 'on_leave';

// Filter types
type AssignmentFilter = 'all' | 'assigned' | 'unassigned' | 'form-teachers';

// Modal types
type ModalType = 'assignment' | 'edit' | 'delete' | 'transfer' | 'subject-remove' | 'success' | 'error' | 'confirm' | null;

// Toast notification type
interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

export default function TeacherManagement() {
  const { user } = useAuth();
  const isUserAdmin = user?.userType === 'admin';
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  // ==================== HOOKS ====================
  const { 
    allTeachers: teachers, 
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
    teacherAssignments: classSpecificAssignments, // Renamed to avoid confusion
    getTeacherSubjectsForClass,
    isTeacherAssignedToClass,
  } = useSchoolTeachers();
  
  const { 
    classes, 
    isLoading: isLoadingClasses,
    isError: classesError,
    refetch: refetchClasses
  } = useSchoolClasses({ isActive: true });

  // ==================== STATE ====================
  // Search and filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<TeacherStatus | 'all'>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('all');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showActionsFor, setShowActionsFor] = useState<string | null>(null);
  
  // Teacher assignments cache - key: teacherId, value: assignments array
  const [teacherAssignmentsCache, setTeacherAssignmentsCache] = useState<Record<string, any[]>>({});
  const [loadingAssignmentsFor, setLoadingAssignmentsFor] = useState<Set<string>>(new Set());
  
  // Modal state
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [modalData, setModalData] = useState<any>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [currentSubject, setCurrentSubject] = useState<string>('');
  
  // Toast notifications
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // Assignment form state
  const [assignAsFormTeacher, setAssignAsFormTeacher] = useState(false);
  
  // Edit teacher state
  const [editTeacherData, setEditTeacherData] = useState({
    name: '',
    email: '',
    phone: '',
    department: '',
    subjects: [] as string[],
    newSubject: ''
  });
  
  // Transfer state
  const [targetClassId, setTargetClassId] = useState('');
  
  // Subject removal state
  const [selectedSubjectToRemove, setSelectedSubjectToRemove] = useState<string>('');

  const debouncedSearch = useDebounce(searchTerm, 300);

  // ==================== TOAST FUNCTIONS ====================
  const addToast = (toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { ...toast, id }]);
    
    if (toast.duration !== 0) {
      setTimeout(() => {
        removeToast(id);
      }, toast.duration || 5000);
    }
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // ==================== LOAD TEACHER ASSIGNMENTS ====================
  // Since getTeacherAssignments isn't available from the hook, we'll use a workaround
  // This function would need to be implemented in the hook or we'd need to fetch from assignments collection
  const fetchTeacherAssignments = async (teacherId: string) => {
    // This is a placeholder - you'll need to implement this based on your actual data structure
    // For now, we'll return an empty array
    return [];
  };

  // Load assignments for a teacher when needed
  const loadTeacherAssignments = async (teacherId: string) => {
    if (teacherAssignmentsCache[teacherId] || loadingAssignmentsFor.has(teacherId)) return;
    
    setLoadingAssignmentsFor(prev => new Set(prev).add(teacherId));
    
    try {
      const assignments = await fetchTeacherAssignments(teacherId);
      setTeacherAssignmentsCache(prev => ({
        ...prev,
        [teacherId]: assignments || []
      }));
    } catch (error) {
      console.error(`Failed to load assignments for teacher ${teacherId}:`, error);
      setTeacherAssignmentsCache(prev => ({
        ...prev,
        [teacherId]: [] // Empty array on error
      }));
    } finally {
      setLoadingAssignmentsFor(prev => {
        const newSet = new Set(prev);
        newSet.delete(teacherId);
        return newSet;
      });
    }
  };

  // Load teacher data into edit form when selected
  useEffect(() => {
    if (selectedTeacher && activeModal === 'edit') {
      setEditTeacherData({
        name: selectedTeacher.name || '',
        email: selectedTeacher.email || '',
        phone: selectedTeacher.phone || '',
        department: selectedTeacher.department || '',
        subjects: selectedTeacher.subjects || [],
        newSubject: ''
      });
    }
  }, [selectedTeacher, activeModal]);

  // ==================== STATS CALCULATION ====================
  const stats = useMemo(() => {
    let assignedCount = 0;
    let formTeacherCount = 0;
    
    // Count from cache
    Object.entries(teacherAssignmentsCache).forEach(([teacherId, assignments]) => {
      if (assignments && assignments.length > 0) {
        assignedCount++;
        if (assignments.some(a => a.isFormTeacher)) {
          formTeacherCount++;
        }
      }
    });
    
    return {
      totalTeachers: teachers.length,
      activeTeachers: teachers.filter(t => t.status === 'active' || !t.status).length,
      inactiveTeachers: teachers.filter(t => t.status === 'inactive').length,
      onLeaveTeachers: teachers.filter(t => t.status === 'on_leave').length,
      assignedTeachers: assignedCount,
      formTeachers: formTeacherCount,
    };
  }, [teachers, teacherAssignmentsCache]);

  // ==================== FILTER TEACHERS ====================
  const filteredTeachers = useMemo(() => {
    return teachers.filter(teacher => {
      // Search filter
      const matchesSearch = !debouncedSearch ||
        teacher.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        teacher.email.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (teacher.phone && teacher.phone.includes(debouncedSearch)) ||
        (teacher.department && teacher.department.toLowerCase().includes(debouncedSearch.toLowerCase()));
      
      // Status filter
      const teacherStatus = teacher.status || 'active';
      const matchesStatus = statusFilter === 'all' || teacherStatus === statusFilter;
      
      // Assignment filter
      let matchesAssignment = true;
      const teacherAssignments = teacherAssignmentsCache[teacher.id] || [];
      const hasAssignments = teacherAssignments.length > 0;
      const isFormTeacher = teacherAssignments.some(a => a.isFormTeacher);
      
      switch(assignmentFilter) {
        case 'assigned':
          matchesAssignment = hasAssignments;
          break;
        case 'unassigned':
          matchesAssignment = !hasAssignments;
          break;
        case 'form-teachers':
          matchesAssignment = isFormTeacher;
          break;
        default:
          matchesAssignment = true;
      }
      
      return matchesSearch && matchesStatus && matchesAssignment;
    });
  }, [teachers, debouncedSearch, statusFilter, assignmentFilter, teacherAssignmentsCache]);

  // Load assignments for visible teachers
  useEffect(() => {
    if (!filteredTeachers.length) return;
    
    filteredTeachers.forEach(teacher => {
      if (!teacherAssignmentsCache[teacher.id] && !loadingAssignmentsFor.has(teacher.id)) {
        loadTeacherAssignments(teacher.id);
      }
    });
  }, [filteredTeachers, teacherAssignmentsCache, loadingAssignmentsFor]);

  // ==================== HELPER FUNCTIONS ====================
  
  // Get assignments for a specific teacher (from cache) - RENAMED to avoid conflict
  const getTeacherAssignmentsFromCache = (teacherId: string) => {
    return teacherAssignmentsCache[teacherId] || [];
  };

  // Get all assignments for a teacher grouped by class
  const getTeacherAssignmentsByClass = (teacherId: string) => {
    const assignments = getTeacherAssignmentsFromCache(teacherId);
    if (!assignments.length) return [];
    
    const grouped = new Map();
    
    assignments.forEach(a => {
      if (!grouped.has(a.classId)) {
        grouped.set(a.classId, {
          classId: a.classId,
          className: a.className || 'Unknown Class',
          subjects: [],
          isFormTeacher: false
        });
      }
      const classData = grouped.get(a.classId);
      
      // Add subject if it's not "Form Teacher" placeholder
      if (a.subject && a.subject !== 'Form Teacher') {
        if (!classData.subjects.includes(a.subject)) {
          classData.subjects.push(a.subject);
        }
      }
      
      // Mark as form teacher if any assignment has isFormTeacher=true
      if (a.isFormTeacher) {
        classData.isFormTeacher = true;
      }
    });
    
    return Array.from(grouped.values());
  };

  // Check if teacher is form teacher for a specific class
  const isFormTeacherForClass = (teacherId: string, classId: string): boolean => {
    const assignments = getTeacherAssignmentsFromCache(teacherId);
    return assignments.some(a => a.classId === classId && a.isFormTeacher);
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

  // ==================== ACTION HANDLERS ====================
  
  // Handle teacher status update
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

    setModalData({
      teacher,
      newStatus,
      action: 'status-update',
      title: `Change Status to ${statusLabels[newStatus]}`,
      message: `Are you sure you want to change ${teacher.name}'s status to ${statusLabels[newStatus]}?`,
      confirmText: 'Update Status',
      cancelText: 'Cancel'
    });
    setActiveModal('confirm');
  };

  // Handle edit teacher
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
      
      setActiveModal(null);
      setSelectedTeacher(null);
      setShowActionsFor(null);
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

  // Handle delete teacher
  const handleDeleteTeacher = async () => {
    if (!selectedTeacher) return;

    // Check if teacher has any assignments
    const hasAssignments = getTeacherAssignmentsFromCache(selectedTeacher.id).length > 0;
    
    if (hasAssignments) {
      addToast({
        type: 'warning',
        title: 'Cannot Delete Teacher',
        message: 'This teacher has existing class assignments. Remove all assignments first.',
        duration: 5000
      });
      return;
    }

    try {
      await deleteTeacher(selectedTeacher.id);
      
      addToast({
        type: 'success',
        title: 'Teacher Deleted',
        message: `${selectedTeacher.name} has been permanently deleted.`,
        duration: 4000
      });
      
      setActiveModal(null);
      setSelectedTeacher(null);
      setShowActionsFor(null);
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

  // Handle adding a subject to teacher's list (edit mode)
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

  // Handle removing a subject from teacher's list (edit mode)
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

  // Handle adding a subject to assignment list
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

  // Handle removing a subject from assignment list
  const handleRemoveSubject = (subjectToRemove: string) => {
    setSelectedSubjects(selectedSubjects.filter(s => s !== subjectToRemove));
  };

  // Handle teacher assignment
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
        // Use the multiple subjects mutation
        await assignTeacherWithMultipleSubjects({
          teacherId: selectedTeacher.id,
          classId: selectedClassId,
          subjects: selectedSubjects,
          isFormTeacher: assignAsFormTeacher
        });
      } else if (assignAsFormTeacher) {
        // Form teacher only - use single subject with placeholder
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
      
      // Refresh assignments for this teacher
      if (selectedTeacher) {
        await loadTeacherAssignments(selectedTeacher.id);
      }
      
      resetAssignmentModal();
      
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

  // Handle remove specific subject from class
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
      
      // Refresh assignments for this teacher
      await loadTeacherAssignments(selectedTeacher.id);
      
      setActiveModal(null);
      setSelectedTeacher(null);
      setSelectedClassId('');
      setSelectedSubjectToRemove('');
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

  // Handle remove form teacher status only
  const handleRemoveFormTeacherStatus = async (teacherId: string, classId: string) => {
    if (!isUserAdmin) {
      addToast({
        type: 'error',
        title: 'Permission Denied',
        message: 'Only administrators can update form teacher status',
        duration: 4000
      });
      return;
    }

    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return;

    const className = classes.find(c => c.id === classId)?.name || 'Unknown Class';

    setModalData({
      teacher,
      classId,
      className,
      action: 'remove-form-teacher',
      title: 'Remove Form Teacher Status',
      message: `Remove ${teacher.name} as Form Teacher of ${className}? They will remain as subject teacher.`,
      confirmText: 'Remove Status',
      cancelText: 'Cancel'
    });
    setActiveModal('confirm');
  };

  // Execute remove form teacher status after confirmation
  const executeRemoveFormTeacherStatus = async () => {
    if (!modalData) return;
    
    const { teacher, classId } = modalData;

    try {
      // Find the form teacher assignment
      const assignments = getTeacherAssignmentsFromCache(teacher.id);
      const formTeacherAssignment = assignments.find(a => 
        a.classId === classId && a.isFormTeacher === true
      );

      if (formTeacherAssignment) {
        // If it's a dedicated form teacher assignment, remove it
        if (formTeacherAssignment.subject === 'Form Teacher') {
          await removeTeacherSubject({
            teacherId: teacher.id,
            classId,
            subject: 'Form Teacher'
          });
        } else {
          // Otherwise, remove and reassign without form teacher status
          await removeTeacherSubject({
            teacherId: teacher.id,
            classId,
            subject: formTeacherAssignment.subject
          });
          
          // Reassign the subject without form teacher status
          await assignTeacherToClass({
            teacherId: teacher.id,
            classId,
            subject: formTeacherAssignment.subject,
            isFormTeacher: false
          });
        }
      }
      
      addToast({
        type: 'success',
        title: 'Status Updated',
        message: `${teacher.name} is no longer Form Teacher of this class.`,
        duration: 4000
      });
      
      // Refresh assignments
      await loadTeacherAssignments(teacher.id);
      
      setActiveModal(null);
      setModalData(null);
      setShowActionsFor(null);
      
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

  // Handle remove teacher from class (all subjects)
  const handleRemoveFromClass = async (teacherId: string, classId: string) => {
    if (!isUserAdmin) {
      addToast({
        type: 'error',
        title: 'Permission Denied',
        message: 'Only administrators can remove teachers from classes',
        duration: 4000
      });
      return;
    }

    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return;

    const className = classes.find(c => c.id === classId)?.name || 'Unknown Class';

    setModalData({
      teacher,
      classId,
      className,
      action: 'remove-from-class',
      title: 'Remove Teacher from Class',
      message: `Remove ${teacher.name} completely from ${className}? This will remove all subject assignments and form teacher status.`,
      confirmText: 'Remove Completely',
      cancelText: 'Cancel'
    });
    setActiveModal('confirm');
  };

  // Execute remove from class after confirmation
  const executeRemoveFromClass = async () => {
    if (!modalData) return;
    
    const { teacher, classId } = modalData;

    try {
      await removeTeacherFromClass({
        teacherId: teacher.id,
        classId
      });
      
      addToast({
        type: 'success',
        title: 'Teacher Removed',
        message: `${teacher.name} has been removed from the class.`,
        duration: 4000
      });
      
      // Refresh assignments
      await loadTeacherAssignments(teacher.id);
      
      setActiveModal(null);
      setModalData(null);
      setShowActionsFor(null);
      
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

  // Handle transfer teacher
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
      
      // Refresh assignments
      await loadTeacherAssignments(selectedTeacher.id);
      
      setActiveModal(null);
      setSelectedTeacher(null);
      setSelectedClassId('');
      setTargetClassId('');
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

  // Handle confirmation action
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
          
          setActiveModal(null);
          setModalData(null);
          setShowActionsFor(null);
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
      
      case 'remove-form-teacher':
        await executeRemoveFormTeacherStatus();
        break;
      
      case 'remove-from-class':
        await executeRemoveFromClass();
        break;
      
      default:
        setActiveModal(null);
        setModalData(null);
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setAssignmentFilter('all');
    setShowMobileFilters(false);
    
    addToast({
      type: 'info',
      title: 'Filters Cleared',
      message: 'All search filters have been reset',
      duration: 2000
    });
  };

  // Reset assignment modal
  const resetAssignmentModal = () => {
    setActiveModal(null);
    setSelectedTeacher(null);
    setSelectedClassId('');
    setSelectedSubjects([]);
    setCurrentSubject('');
    setAssignAsFormTeacher(false);
    setTargetClassId('');
    setSelectedSubjectToRemove('');
    setModalData(null);
  };

  // ==================== FILTER COUNTS ====================
  const filterCounts = useMemo(() => {
    const counts = {
      all: teachers.length,
      active: teachers.filter(t => t.status === 'active' || !t.status).length,
      inactive: teachers.filter(t => t.status === 'inactive').length,
      onLeave: teachers.filter(t => t.status === 'on_leave').length,
      transferred: teachers.filter(t => t.status === 'transferred').length,
      assigned: 0,
      unassigned: 0,
      formTeachers: 0
    };
    
    Object.entries(teacherAssignmentsCache).forEach(([teacherId, assignments]) => {
      if (assignments && assignments.length > 0) {
        counts.assigned++;
        if (assignments.some(a => a.isFormTeacher)) {
          counts.formTeachers++;
        }
      }
    });
    
    counts.unassigned = teachers.length - counts.assigned;
    
    return counts;
  }, [teachers, teacherAssignmentsCache]);

  // ==================== RENDER ====================
  
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
              
              {/* Admin Action */}
              {isUserAdmin && (
                <button
                  onClick={() => {
                    setSelectedTeacher(null);
                    setSelectedSubjects([]);
                    setActiveModal('assignment');
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
                </button>
              )}
            </div>
          </div>

          {/* ===== STATS CARDS - 6 CARDS ===== */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4 mb-6">
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

            {/* Form Teachers */}
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
            
            {/* Mobile Filter Toggle */}
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

            {/* Filter Content */}
            <div className={`
              ${isMobile ? 'px-4 pb-4' : 'p-4'}
              ${isMobile && !showMobileFilters ? 'hidden' : 'block'}
            `}>
              <div className="flex flex-col lg:flex-row gap-4">
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

                {/* Assignment Filter */}
                <div className="relative sm:w-56">
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <Briefcase size={18} className="text-gray-400" />
                  </div>
                  <select
                    value={assignmentFilter}
                    onChange={(e) => setAssignmentFilter(e.target.value as AssignmentFilter)}
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
              
              {/* Active Filters */}
              {(searchTerm || statusFilter !== 'all' || assignmentFilter !== 'all') && (
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
                  {assignmentFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs sm:text-sm">
                      <span className="capitalize">{assignmentFilter.replace('-', ' ')}</span>
                      <button
                        onClick={() => setAssignmentFilter('all')}
                        className="hover:bg-indigo-100 rounded p-0.5"
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
                const teacherStatus = teacher.status || 'active';
                const StatusIcon = getStatusConfig(teacherStatus).icon;
                const assignments = getTeacherAssignmentsByClass(teacher.id);
                const isLoading = loadingAssignmentsFor.has(teacher.id);
                
                return (
                  <div
                    key={teacher.id}
                    className="group bg-white rounded-xl border border-gray-200 p-5 
                             shadow-sm hover:shadow-lg transition-all duration-300 
                             hover:border-gray-300 hover:-translate-y-0.5 relative"
                  >
                    {/* Loading Overlay */}
                    {isLoading && (
                      <div className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center z-10">
                        <Loader2 size={24} className="animate-spin text-blue-600" />
                      </div>
                    )}

                    {/* Actions Dropdown - Only for Admin */}
                    {isUserAdmin && !isLoading && (
                      <div className="absolute top-4 right-4">
                        <button
                          onClick={() => setShowActionsFor(showActionsFor === teacher.id ? null : teacher.id)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <MoreVertical size={16} className="text-gray-500" />
                        </button>
                        
                        {/* Dropdown Menu */}
                        {showActionsFor === teacher.id && (
                          <div className="absolute right-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 max-h-96 overflow-y-auto">
                            <button
                              onClick={() => {
                                setSelectedTeacher(teacher);
                                setActiveModal('edit');
                                setShowActionsFor(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                            >
                              <Edit size={14} className="text-blue-600" />
                              <span>Edit Teacher</span>
                            </button>
                            
                            {assignments.length > 0 && (
                              <>
                                <div className="border-t border-gray-100 my-1"></div>
                                <div className="px-4 py-1 text-xs font-medium text-gray-500">CLASS ASSIGNMENTS</div>
                                
                                {assignments.map(assignment => (
                                  <div key={assignment.classId} className="relative group/submenu">
                                    <div className="px-4 py-2 text-left text-sm hover:bg-gray-50 cursor-default">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1">
                                          <span className="font-medium truncate">{assignment.className}</span>
                                          {assignment.isFormTeacher && (
                                            <Star size={12} className="text-purple-600 fill-purple-600" />
                                          )}
                                        </div>
                                        <ChevronDown size={14} className="rotate-270 ml-2 flex-shrink-0" />
                                      </div>
                                      
                                      {/* Submenu */}
                                      <div className="absolute left-full top-0 ml-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 hidden group-hover/submenu:block">
                                        {/* Subject removal options */}
                                        {assignment.subjects.map(subject => (
                                          <button
                                            key={subject}
                                            onClick={() => {
                                              setSelectedTeacher(teacher);
                                              setSelectedClassId(assignment.classId);
                                              setSelectedSubjectToRemove(subject);
                                              setActiveModal('subject-remove');
                                              setShowActionsFor(null);
                                            }}
                                            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                                          >
                                            <XCircle size={14} className="text-red-500" />
                                            <span>Remove {subject}</span>
                                          </button>
                                        ))}
                                        
                                        {/* Remove form teacher status option */}
                                        {assignment.isFormTeacher && (
                                          <button
                                            onClick={() => {
                                              handleRemoveFormTeacherStatus(teacher.id, assignment.classId);
                                              setShowActionsFor(null);
                                            }}
                                            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                                          >
                                            <Star size={14} className="text-purple-500" />
                                            <span>Remove Form Teacher</span>
                                          </button>
                                        )}
                                        
                                        {assignment.subjects.length > 0 && (
                                          <div className="border-t border-gray-100 my-1"></div>
                                        )}
                                        
                                        {/* Remove all from class */}
                                        <button
                                          onClick={() => {
                                            handleRemoveFromClass(teacher.id, assignment.classId);
                                            setShowActionsFor(null);
                                          }}
                                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 text-red-600 flex items-center gap-2"
                                        >
                                          <UserX size={14} />
                                          <span>Remove All from Class</span>
                                        </button>
                                        
                                        {/* Transfer to another class */}
                                        <button
                                          onClick={() => {
                                            setSelectedTeacher(teacher);
                                            setSelectedClassId(assignment.classId);
                                            setActiveModal('transfer');
                                            setShowActionsFor(null);
                                          }}
                                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                                        >
                                          <ArrowRight size={14} className="text-blue-600" />
                                          <span>Transfer Class</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </>
                            )}
                            
                            <div className="border-t border-gray-100 my-1"></div>
                            
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
                            
                            <button
                              onClick={() => {
                                setSelectedTeacher(teacher);
                                setActiveModal('delete');
                                setShowActionsFor(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 text-red-600 flex items-center gap-2"
                            >
                              <Trash2 size={14} />
                              <span>Delete Teacher</span>
                            </button>
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
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Teacher Details */}
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
                            ? teacher.subjects.slice(0, 3).join(', ') + (teacher.subjects.length > 3 ? ` +${teacher.subjects.length - 3}` : '')
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
                      {assignments.length > 0 ? (
                        <div>
                          <p className="text-xs text-gray-500 mb-1.5">Currently assigned to</p>
                          <div className="space-y-3">
                            {assignments.map(assignment => (
                              <div key={assignment.classId} className="space-y-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <GraduationCap size={14} className="text-gray-400 flex-shrink-0" />
                                  <span className="font-medium text-gray-900 text-sm truncate flex items-center gap-1">
                                    {assignment.className}
                                    {assignment.isFormTeacher && (
                                      <span className="inline-flex items-center gap-0.5 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full ml-1">
                                        <Star size={10} className="fill-purple-700" />
                                        Form
                                      </span>
                                    )}
                                  </span>
                                </div>
                                
                                {/* Show multiple subjects for this class */}
                                {assignment.subjects.length > 0 ? (
                                  <div className="pl-6">
                                    <div className="flex flex-wrap gap-1">
                                      {assignment.subjects.map((subject, idx) => (
                                        <span 
                                          key={idx}
                                          className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full"
                                        >
                                          {subject}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ) : assignment.isFormTeacher ? (
                                  <div className="pl-6">
                                    <span className="text-xs text-gray-500 italic">Form teacher only (no subjects)</span>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">Not assigned</span>
                          {isUserAdmin && teacherStatus === 'active' && (
                            <button
                              onClick={() => {
                                setSelectedTeacher(teacher);
                                setSelectedSubjects([]);
                                setActiveModal('assignment');
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
                {searchTerm || statusFilter !== 'all' || assignmentFilter !== 'all'
                  ? 'Try adjusting your filters to find what you\'re looking for.'
                  : 'Teachers can create accounts via the sign-up page. Assign them to classes once registered.'}
              </p>
              {(searchTerm || statusFilter !== 'all' || assignmentFilter !== 'all') && (
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
              {assignmentFilter !== 'all' && ` • ${assignmentFilter.replace('-', ' ')}`}
            </div>
          )}
        </div>
      </DashboardLayout>

      {/* ===== CONFIRMATION MODAL ===== */}
      {activeModal === 'confirm' && modalData && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={resetAssignmentModal} />
          
          <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
            <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center w-16 h-16 bg-yellow-100 rounded-full mb-4">
                  <AlertTriangle className="text-yellow-600" size={32} />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">{modalData.title}</h2>
                <p className="text-sm text-gray-600 mb-6">{modalData.message}</p>
                <div className="flex gap-3">
                  <button
                    onClick={resetAssignmentModal}
                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                  >
                    {modalData.cancelText || 'Cancel'}
                  </button>
                  <button
                    onClick={handleConfirmAction}
                    className="flex-1 px-4 py-2.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium"
                  >
                    {modalData.confirmText || 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== ASSIGNMENT MODAL ===== */}
      {activeModal === 'assignment' && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={resetAssignmentModal} />
          
          <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
            <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
              
              {/* Modal Header */}
              <div className="p-5 sm:p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-bold text-gray-900 truncate">
                      {selectedTeacher ? `Assign ${selectedTeacher.name.split(' ')[0]}` : 'Assign Teacher'}
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {selectedTeacher ? 'Choose class and subjects' : 'Select a teacher to assign'}
                    </p>
                  </div>
                  <button
                    onClick={resetAssignmentModal}
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
                        setSelectedSubjects([]);
                        setCurrentSubject('');
                      }}
                      value=""
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
                      <div className="mt-2">
                        <p className="text-xs text-blue-700 mb-1">Available subjects:</p>
                        <div className="flex flex-wrap gap-1">
                          {selectedTeacher.subjects.map((subject: string) => (
                            <span 
                              key={subject}
                              className="text-xs px-2 py-0.5 bg-white text-blue-700 rounded-full border border-blue-200"
                            >
                              {subject}
                            </span>
                          ))}
                        </div>
                      </div>
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
                {selectedTeacher && selectedClassId && (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Subjects to Teach
                      <span className="text-xs text-gray-500 ml-2">(optional if assigning as Form Teacher only)</span>
                    </label>
                    
                    {/* Selected Subjects List */}
                    {selectedSubjects.length > 0 && (
                      <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-medium text-gray-500">Selected subjects:</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedSubjects.map((subject) => (
                            <span
                              key={subject}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-lg text-sm"
                            >
                              {subject}
                              <button
                                onClick={() => handleRemoveSubject(subject)}
                                className="hover:bg-blue-200 rounded p-0.5"
                              >
                                <X size={14} />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Add Subject Dropdown */}
                    {selectedTeacher.subjects && selectedTeacher.subjects.length > 0 && (
                      <div className="flex gap-2">
                        <select
                          value={currentSubject}
                          onChange={(e) => setCurrentSubject(e.target.value)}
                          className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg 
                                   focus:ring-2 focus:ring-blue-500 focus:border-transparent
                                   text-sm bg-white hover:border-gray-400 transition-colors"
                        >
                          <option value="">Choose a subject...</option>
                          {selectedTeacher.subjects
                            .filter((subject: string) => !selectedSubjects.includes(subject))
                            .map((subject: string) => (
                              <option key={subject} value={subject}>
                                {subject}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleAddSubject}
                          disabled={!currentSubject}
                          className="px-4 py-2.5 bg-blue-600 text-white rounded-lg 
                                   hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                                   flex items-center gap-1 transition-colors"
                        >
                          <Plus size={16} />
                          Add
                        </button>
                      </div>
                    )}

                    {selectedTeacher.subjects && selectedTeacher.subjects.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                        <AlertCircle size={12} />
                        This teacher has no subjects listed. They can only be assigned as Form Teacher.
                      </p>
                    )}
                  </div>
                )}

                {/* Form Teacher Option */}
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <input
                    type="checkbox"
                    id="formTeacher"
                    checked={assignAsFormTeacher}
                    onChange={(e) => setAssignAsFormTeacher(e.target.checked)}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
                  />
                  <label htmlFor="formTeacher" className="text-sm text-gray-700">
                    <span className="font-medium">Assign as Form Teacher</span>
                    <span className="text-xs text-gray-500 block mt-0.5">
                      {selectedSubjects.length > 0 
                        ? 'Teacher will be both Form Teacher and teach the selected subjects'
                        : 'Teacher will be Form Teacher only (no subjects taught)'}
                    </span>
                  </label>
                </div>

                {/* Summary */}
                {selectedTeacher && selectedClassId && (
                  <div className="bg-blue-50 rounded-lg p-3 text-xs">
                    <p className="font-medium text-blue-800 mb-1">Assignment Summary:</p>
                    <ul className="space-y-1 text-blue-700">
                      <li>• Class: {classes.find(c => c.id === selectedClassId)?.name}</li>
                      {selectedSubjects.length > 0 && (
                        <li>• Teaching: {selectedSubjects.join(', ')}</li>
                      )}
                      {assignAsFormTeacher && (
                        <li>• Role: Form Teacher {selectedSubjects.length > 0 ? '(in addition to subjects)' : '(only)'}</li>
                      )}
                      {!assignAsFormTeacher && selectedSubjects.length === 0 && (
                        <li className="text-amber-700">⚠️ No role selected - either add subjects or check Form Teacher</li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={resetAssignmentModal}
                      className="px-4 py-2.5 border border-gray-300 text-gray-700 
                               rounded-lg hover:bg-gray-50 font-medium 
                               transition-colors text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAssignTeacher}
                      disabled={
                        !selectedTeacher || 
                        !selectedClassId || 
                        (!assignAsFormTeacher && selectedSubjects.length === 0) ||
                        isAssigningTeacher
                      }
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
                          Assign
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

      {/* ===== EDIT TEACHER MODAL ===== */}
      {activeModal === 'edit' && selectedTeacher && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={resetAssignmentModal} />
          
          <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
            <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
              
              {/* Modal Header */}
              <div className="p-5 sm:p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-bold text-gray-900 truncate">
                      Edit Teacher
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      Update teacher information
                    </p>
                  </div>
                  <button
                    onClick={resetAssignmentModal}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                  >
                    <X size={18} className="text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-5 sm:p-6 space-y-4">
                
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editTeacherData.name}
                    onChange={(e) => setEditTeacherData({...editTeacherData, name: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={editTeacherData.email}
                    onChange={(e) => setEditTeacherData({...editTeacherData, email: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={editTeacherData.phone}
                    onChange={(e) => setEditTeacherData({...editTeacherData, phone: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>

                {/* Department */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Department
                  </label>
                  <input
                    type="text"
                    value={editTeacherData.department}
                    onChange={(e) => setEditTeacherData({...editTeacherData, department: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>

                {/* Subjects */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Subjects Taught
                  </label>
                  
                  {/* Subject List */}
                  {editTeacherData.subjects.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {editTeacherData.subjects.map((subject) => (
                        <span
                          key={subject}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-sm"
                        >
                          {subject}
                          <button
                            onClick={() => handleRemoveSubjectFromTeacher(subject)}
                            className="hover:bg-blue-200 rounded p-0.5"
                          >
                            <X size={14} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Add Subject */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editTeacherData.newSubject}
                      onChange={(e) => setEditTeacherData({...editTeacherData, newSubject: e.target.value})}
                      placeholder="Enter subject"
                      className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleAddSubjectToTeacher}
                      disabled={!editTeacherData.newSubject}
                      className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <Plus size={16} />
                      Add
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={resetAssignmentModal}
                    className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEditTeacher}
                    disabled={isUpdatingTeacher}
                    className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isUpdatingTeacher ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== DELETE TEACHER MODAL ===== */}
      {activeModal === 'delete' && selectedTeacher && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={resetAssignmentModal} />
          
          <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
            <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                  <AlertCircle className="text-red-600" size={32} />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Delete Teacher</h2>
                <p className="text-sm text-gray-600 mb-6">
                  Are you sure you want to permanently delete <span className="font-semibold">{selectedTeacher.name}</span>? This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={resetAssignmentModal}
                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteTeacher}
                    disabled={isDeletingTeacher}
                    className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isDeletingTeacher ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 size={16} />
                        Delete
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== REMOVE SUBJECT MODAL ===== */}
      {activeModal === 'subject-remove' && selectedTeacher && selectedClassId && selectedSubjectToRemove && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={resetAssignmentModal} />
          
          <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
            <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center w-16 h-16 bg-yellow-100 rounded-full mb-4">
                  <XCircle className="text-yellow-600" size={32} />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Remove Subject</h2>
                <p className="text-sm text-gray-600 mb-6">
                  Remove <span className="font-semibold">{selectedSubjectToRemove}</span> from <span className="font-semibold">{selectedTeacher.name}</span>'s assignments in this class?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={resetAssignmentModal}
                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRemoveSubjectFromClass}
                    disabled={isRemovingSubject}
                    className="flex-1 px-4 py-2.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isRemovingSubject ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        Removing...
                      </>
                    ) : (
                      <>
                        <X size={16} />
                        Remove
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== TRANSFER TEACHER MODAL ===== */}
      {activeModal === 'transfer' && selectedTeacher && selectedClassId && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={resetAssignmentModal} />
          
          <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
            <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Transfer Teacher</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    From Class
                  </label>
                  <input
                    type="text"
                    value={classes.find(c => c.id === selectedClassId)?.name || ''}
                    disabled
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Target Class <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={targetClassId}
                    onChange={(e) => setTargetClassId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="">Select target class...</option>
                    {classes
                      .filter(c => c.id !== selectedClassId)
                      .map(cls => (
                        <option key={cls.id} value={cls.id}>
                          {cls.name} • Year {cls.year} • {cls.students} learners
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={resetAssignmentModal}
                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleTransferTeacher}
                    disabled={!targetClassId || isTransferringTeacher}
                    className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isTransferringTeacher ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        Transferring...
                      </>
                    ) : (
                      <>
                        <ArrowRight size={16} />
                        Transfer
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}