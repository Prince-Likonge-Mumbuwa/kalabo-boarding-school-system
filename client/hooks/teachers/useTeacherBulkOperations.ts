// @/hooks/teachers/useTeacherBulkOperations.ts
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Teacher, Toast } from '@/types/teachers';
import { teacherService } from '@/services/schoolService';
import type { TeacherAssignment } from '@/types/school';

export const useTeacherBulkOperations = () => {
  const queryClient = useQueryClient();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);

  // ── Toast helpers ───────────────────────────────────────────────
  const addToast = (toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { ...toast, id }]);

    if (toast.duration !== 0) {
      setTimeout(() => removeToast(id), toast.duration || 5000);
    }
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // ── Fetch assignments for a single teacher ─────────────────────
  //
  // Uses teacherService (Firestore SDK) instead of the (non-existent)
  // /api/teacher-assignments/:id endpoint. Returns the full TeacherAssignment
  // shape including roleType, status, dates — the same shape the PDF and
  // preview UIs consume.
  const fetchTeacherAssignments = async (
    teacherId: string
  ): Promise<TeacherAssignment[]> => {
    setIsLoadingAssignments(true);
    try {
      const assignments = await teacherService.getTeacherAssignments(teacherId);
      return assignments;
    } catch (error) {
      console.error('Error fetching assignments:', error);
      addToast({
        type: 'error',
        title: 'Failed to Load Assignments',
        message: 'Could not load teacher assignments.',
        duration: 4000,
      });
      return [];
    } finally {
      setIsLoadingAssignments(false);
    }
  };

  // ── Bulk remove ─────────────────────────────────────────────────
  //
  // Unchanged API. Extends invalidation to include teacher_classes
  // (used by the teacher dashboard) and the class-scoped assignment key.
  const handleBulkRemove = async (
    teacher: Teacher,
    selectedClassIds: string[],
    removeTeacherFromClass: (params: {
      teacherId: string;
      classId: string;
    }) => Promise<any>
  ) => {
    try {
      for (const classId of selectedClassIds) {
        await removeTeacherFromClass({ teacherId: teacher.id, classId });
      }

      addToast({
        type: 'success',
        title: 'Assignments Removed',
        message: `Removed ${teacher.name} from ${selectedClassIds.length} class(es).`,
        duration: 4000,
      });

      queryClient.invalidateQueries({ queryKey: ['teacher_assignments', teacher.id] });
      queryClient.invalidateQueries({ queryKey: ['teacher_assignments', 'class'] });
      queryClient.invalidateQueries({ queryKey: ['teacher_classes'] });
      queryClient.invalidateQueries({ queryKey: ['teachers'] });

      return true;
    } catch (error: any) {
      console.error('Bulk remove error:', error);
      addToast({
        type: 'error',
        title: 'Remove Failed',
        message: error.message || 'Failed to remove assignments',
        duration: 5000,
      });
      return false;
    }
  };

  // ── Preview teachers ────────────────────────────────────────────
  //
  // Now fetches ALL assignments ONCE and groups by teacherId.
  // Previously issued N serial HTTP calls (one per teacher), all of
  // which failed against the missing /api endpoint.
  //
  // Returns assignments keyed by teacherId. Each entry is an array of
  // TeacherAssignment (flat), NOT grouped by class — the preview modal
  // and PDF both expect the flat shape and handle grouping themselves.
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
          duration: 3000,
        });
        return null;
      }

      addToast({
        type: 'info',
        title: 'Loading Preview',
        message: `Preparing ${teachersToShow.length} teachers for preview...`,
        duration: 2000,
      });

      // ── Batch fetch: one Firestore read, grouped client-side ───
      let allAssignments: TeacherAssignment[] = [];
      try {
        allAssignments = await teacherService.getAllTeacherAssignments();
      } catch (error) {
        console.error('Error fetching all assignments:', error);
        // Non-fatal: continue with empty assignments. Preview still shows teachers.
      }

      // Group by teacherId. Keep only rows whose teacherId is in teachersToShow
      // to avoid bloating the preview map with unrelated teachers.
      const wantedIds = new Set(teachersToShow.map(t => t.id));
      const assignmentsMap: Record<string, TeacherAssignment[]> = {};

      // Pre-seed empty arrays so every teacher key exists even if they have none.
      for (const t of teachersToShow) assignmentsMap[t.id] = [];

      for (const a of allAssignments) {
        if (!wantedIds.has(a.teacherId)) continue;
        // Skip ended rows — the preview shows current state only.
        if (a.status === 'ended') continue;
        assignmentsMap[a.teacherId].push(a);
      }

      // ── Filter info string ──────────────────────────────────────
      let filterInfo = 'All Teachers';
      const filterParts: string[] = [];
      if (searchTerm) filterParts.push(`search: "${searchTerm}"`);
      if (statusFilter !== 'all')
        filterParts.push(`status: ${statusFilter.replace('_', ' ')}`);
      if (assignmentFilter !== 'all')
        filterParts.push(`assignment: ${assignmentFilter.replace('-', ' ')}`);
      if (filterParts.length > 0) filterInfo = filterParts.join(' • ');

      return { teachersToShow, assignmentsMap, filterInfo };
    } catch (error) {
      console.error('Error preparing teachers preview:', error);
      addToast({
        type: 'error',
        title: 'Failed to Load Teachers',
        message: 'An error occurred while loading teachers data.',
        duration: 5000,
      });
      return null;
    }
  };

  // ── Download PDF ────────────────────────────────────────────────
  //
  // Unchanged API. The assignments map now carries temporal fields,
  // so the PDF can render role + window info per subject.
  const handleDownloadPDF = async (
    previewTeachers: Teacher[],
    previewAssignments: Record<string, TeacherAssignment[]>,
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
          duration: 4000,
        });
        return false;
      }

      addToast({
        type: 'info',
        title: 'Generating PDF',
        message: 'Please wait while we prepare your download...',
        duration: 3000,
      });

      const pdfBytes = await generatePDF({
        teachers: previewTeachers,
        classes,
        teacherAssignments: previewAssignments,
        filterInfo: previewFilterInfo,
        schoolName: 'KALABO BOARDING SECONDARY SCHOOL',
      });

      if (!pdfBytes || pdfBytes.length === 0) {
        throw new Error('Generated PDF is empty');
      }

      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      const dateStr = new Date().toISOString().split('T')[0];
      const filterStr = previewFilterInfo
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .substring(0, 30);
      link.download = `teachers-master-list-${filterStr}-${dateStr}.pdf`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      addToast({
        type: 'success',
        title: 'PDF Generated',
        message: `Successfully downloaded ${previewTeachers.length} teacher(s) with their class assignments.`,
        duration: 4000,
      });

      return true;
    } catch (error) {
      console.error('Error generating PDF:', error);
      addToast({
        type: 'error',
        title: 'PDF Generation Failed',
        message:
          error instanceof Error
            ? error.message
            : 'An error occurred while generating the PDF.',
        duration: 5000,
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
    handleBulkRemove,
    handlePreviewTeachers,
    handleDownloadPDF,
  };
};