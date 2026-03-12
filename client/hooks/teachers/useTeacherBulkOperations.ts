import { useState } from 'react';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';
import { Teacher, Toast } from '@/types/teachers';
import { useQueryClient } from '@tanstack/react-query';

export const useTeacherBulkOperations = () => {
  const queryClient = useQueryClient();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);

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

  // Fetch assignments for a teacher using the existing hook
  const fetchTeacherAssignments = async (teacherId: string) => {
    setIsLoadingAssignments(true);
    try {
      // Use the existing hook by directly fetching
      const response = await fetch(`/api/teacher-assignments/${teacherId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch assignments');
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching assignments:', error);
      addToast({
        type: 'error',
        title: 'Failed to Load Assignments',
        message: 'Could not load teacher assignments.',
        duration: 4000
      });
      return [];
    } finally {
      setIsLoadingAssignments(false);
    }
  };

  // Alternative: Use the hook directly in the component
  // This function will be used when we already have the teacherId
  const getAssignmentsFromHook = (teacherId: string) => {
    // This will be called from within a component that uses the hook
    const { assignments, isLoading, refetch } = useTeacherAssignments(teacherId);
    return { assignments, isLoading, refetch };
  };

  const handleBulkRemove = async (
    teacher: Teacher,
    selectedClassIds: string[],
    removeTeacherFromClass: (params: { teacherId: string; classId: string }) => Promise<any>
  ) => {
    try {
      for (const classId of selectedClassIds) {
        await removeTeacherFromClass({
          teacherId: teacher.id,
          classId
        });
      }
      
      addToast({
        type: 'success',
        title: 'Assignments Removed',
        message: `Removed ${teacher.name} from ${selectedClassIds.length} class(es).`,
        duration: 4000
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['teacher_assignments', teacher.id] });
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      
      return true;
    } catch (error: any) {
      console.error('Bulk remove error:', error);
      addToast({
        type: 'error',
        title: 'Remove Failed',
        message: error.message || 'Failed to remove assignments',
        duration: 5000
      });
      return false;
    }
  };

  // NEW: Handle preview teachers - FIXED
  const handlePreviewTeachers = async (
    allTeachers: Teacher[],
    filteredTeachers: Teacher[],
    searchTerm: string,
    statusFilter: string,
    assignmentFilter: string
  ) => {
    try {
      const teachersToShow = filteredTeachers.length > 0 ? filteredTeachers : allTeachers;
      
      if (teachersToShow.length === 0) {
        addToast({
          type: 'warning',
          title: 'No Teachers',
          message: 'There are no teachers to preview.',
          duration: 3000
        });
        return null;
      }

      addToast({
        type: 'info',
        title: 'Loading Preview',
        message: `Preparing ${teachersToShow.length} teachers for preview...`,
        duration: 2000
      });

      const assignmentsMap: Record<string, any[]> = {};
      
      // Fetch assignments for each teacher
      for (const teacher of teachersToShow) {
        try {
          // Try API first
          const response = await fetch(`/api/teacher-assignments/${teacher.id}`);
          if (response.ok) {
            const data = await response.json();
            
            // Format assignments to group by class
            const classMap = new Map();
            data.forEach((assignment: any) => {
              if (!classMap.has(assignment.classId)) {
                classMap.set(assignment.classId, {
                  classId: assignment.classId,
                  className: assignment.className || 'Unknown Class',
                  subjects: [],
                  isFormTeacher: false
                });
              }
              const classData = classMap.get(assignment.classId);
              if (assignment.subject && assignment.subject !== 'Form Teacher') {
                classData.subjects.push(assignment.subject);
              }
              if (assignment.isFormTeacher) {
                classData.isFormTeacher = true;
              }
            });
            
            assignmentsMap[teacher.id] = Array.from(classMap.values());
          } else {
            assignmentsMap[teacher.id] = [];
          }
        } catch (error) {
          console.error(`Error fetching assignments for teacher ${teacher.id}:`, error);
          assignmentsMap[teacher.id] = [];
        }
      }
      
      // Build filter info string
      let filterInfo = 'All Teachers';
      const filterParts = [];
      
      if (searchTerm) {
        filterParts.push(`search: "${searchTerm}"`);
      }
      if (statusFilter !== 'all') {
        filterParts.push(`status: ${statusFilter.replace('_', ' ')}`);
      }
      if (assignmentFilter !== 'all') {
        filterParts.push(`assignment: ${assignmentFilter.replace('-', ' ')}`);
      }
      
      if (filterParts.length > 0) {
        filterInfo = filterParts.join(' • ');
      }
      
      return {
        teachersToShow,
        assignmentsMap,
        filterInfo
      };
      
    } catch (error) {
      console.error('Error preparing teachers preview:', error);
      addToast({
        type: 'error',
        title: 'Failed to Load Teachers',
        message: 'An error occurred while loading teachers data.',
        duration: 5000
      });
      return null;
    }
  };

  // NEW: Handle download PDF - FIXED
  const handleDownloadPDF = async (
    previewTeachers: Teacher[],
    previewAssignments: Record<string, any[]>,
    previewFilterInfo: string,
    classes: any[],
    generatePDF: (params: any) => Promise<Uint8Array>
  ) => {
    try {
      if (!previewTeachers || previewTeachers.length === 0) {
        addToast({
          type: 'error',
          title: 'No Data',
          message: 'No teacher data available to download.',
          duration: 4000
        });
        return false;
      }

      addToast({
        type: 'info',
        title: 'Generating PDF',
        message: 'Please wait while we prepare your download...',
        duration: 3000
      });

      const pdfBytes = await generatePDF({
        teachers: previewTeachers,
        classes,
        teacherAssignments: previewAssignments,
        filterInfo: previewFilterInfo,
        schoolName: 'KALABO BOARDING SECONDARY SCHOOL'
      });
      
      if (!pdfBytes || pdfBytes.length === 0) {
        throw new Error('Generated PDF is empty');
      }
      
      // Create and trigger download
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const dateStr = new Date().toISOString().split('T')[0];
      const filterStr = previewFilterInfo.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 30);
      link.download = `teachers-master-list-${filterStr}-${dateStr}.pdf`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      addToast({
        type: 'success',
        title: 'PDF Generated',
        message: `Successfully downloaded ${previewTeachers.length} teacher(s) with their class assignments.`,
        duration: 4000
      });
      
      return true;
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      addToast({
        type: 'error',
        title: 'PDF Generation Failed',
        message: error instanceof Error ? error.message : 'An error occurred while generating the PDF.',
        duration: 5000
      });
      return false;
    }
  };

  return {
    toasts,
    isLoadingAssignments,
    addToast,
    removeToast,
    fetchTeacherAssignments,
    getAssignmentsFromHook,
    handleBulkRemove,
    handlePreviewTeachers,  // Now implemented
    handleDownloadPDF       // Now implemented
  };
};