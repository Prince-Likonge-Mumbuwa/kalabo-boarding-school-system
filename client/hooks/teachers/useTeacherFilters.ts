// client/hooks/teachers/useTeacherFilters.ts
import { useState, useMemo } from 'react';
import { Teacher, TeacherStatus, AssignmentFilter } from '@/types/teachers';
import { useDebounce } from '@/hooks/useDebounce';
import type { TeacherAssignment, AssignmentRoleType } from '@/types/school';

// ==================== ROLE FILTER TYPE ====================

export type RoleFilter = 'all' | AssignmentRoleType;

// ==================== HOOK ====================

export const useTeacherFilters = (
  teachers: Teacher[] = [],
  assignments: TeacherAssignment[] = []
) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<TeacherStatus | 'all'>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('all');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const debouncedSearch = useDebounce(searchTerm, 300);

  // ── Derived: assignments grouped by teacherId ───────────────────
  // Only non-ended rows count. A teacher "has cover" if any active
  // row is tp / leave-cover. A teacher "has role X" if any non-ended
  // row has roleType === X.
  const assignmentsByTeacher = useMemo(() => {
    const map = new Map<string, TeacherAssignment[]>();
    for (const a of assignments) {
      if (a.status === 'ended') continue;
      const list = map.get(a.teacherId);
      if (list) list.push(a);
      else map.set(a.teacherId, [a]);
    }
    return map;
  }, [assignments]);

  const teacherHasRole = (teacherId: string, role: AssignmentRoleType): boolean => {
    const list = assignmentsByTeacher.get(teacherId);
    if (!list) return false;
    return list.some(a => a.roleType === role);
  };

  const teacherIsOnCover = (teacherId: string): boolean => {
    const list = assignmentsByTeacher.get(teacherId);
    if (!list) return false;
    return list.some(
      a => (a.roleType === 'tp' || a.roleType === 'leave-cover') && a.status === 'active'
    );
  };

  // ── Filtered teachers ───────────────────────────────────────────
  const filteredTeachers = useMemo(() => {
    return teachers.filter(teacher => {
      if (!teacher) return false;

      const matchesSearch =
        !debouncedSearch ||
        teacher.name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        teacher.email?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        teacher.phone?.includes(debouncedSearch) ||
        teacher.department?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        teacher.nrc?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        teacher.tsNumber?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        teacher.employeeNumber?.toLowerCase().includes(debouncedSearch.toLowerCase());

      const teacherStatus = teacher.status || 'active';
      const matchesStatus = statusFilter === 'all' || teacherStatus === statusFilter;

      let matchesAssignment = true;
      const hasAssignments = teacher.assignedClasses && teacher.assignedClasses.length > 0;
      const isFormTeacher = teacher.isFormTeacher === true;

      switch (assignmentFilter) {
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

      // Role filter — only meaningful when assignments are provided
      let matchesRole = true;
      if (roleFilter !== 'all' && assignments.length > 0) {
        matchesRole = teacherHasRole(teacher.id, roleFilter);
      }

      return matchesSearch && matchesStatus && matchesAssignment && matchesRole;
    });
  }, [
    teachers,
    assignments,
    assignmentsByTeacher,
    debouncedSearch,
    statusFilter,
    assignmentFilter,
    roleFilter,
  ]);

  // ── Filter counts (for the <select> labels) ─────────────────────
  const filterCounts = useMemo(() => {
    const assignedCount = teachers.filter(
      t => t.assignedClasses && t.assignedClasses.length > 0
    ).length;

    const formTeacherCount = teachers.filter(t => t.isFormTeacher === true).length;

    // Role-based counts only work when assignments are provided
    const substantiveCount =
      assignments.length > 0
        ? teachers.filter(t => teacherHasRole(t.id, 'substantive')).length
        : 0;
    const tpCount =
      assignments.length > 0 ? teachers.filter(t => teacherHasRole(t.id, 'tp')).length : 0;
    const leaveCoverCount =
      assignments.length > 0
        ? teachers.filter(t => teacherHasRole(t.id, 'leave-cover')).length
        : 0;
    const onCoverCount =
      assignments.length > 0
        ? teachers.filter(t => teacherIsOnCover(t.id)).length
        : teachers.filter(t => t.status === 'on_leave').length; // fallback proxy

    return {
      all: teachers.length,
      active: teachers.filter(t => t.status === 'active' || !t.status).length,
      inactive: teachers.filter(t => t.status === 'inactive').length,
      onLeave: teachers.filter(t => t.status === 'on_leave').length,
      transferred: teachers.filter(t => t.status === 'transferred').length,
      assigned: assignedCount,
      unassigned: teachers.length - assignedCount,
      formTeachers: formTeacherCount,

      // New
      substantive: substantiveCount,
      tp: tpCount,
      leaveCover: leaveCoverCount,
      onCover: onCoverCount,
    };
  }, [teachers, assignments, assignmentsByTeacher]);

  // ── Stats cards ─────────────────────────────────────────────────
  const stats = useMemo(() => {
    const assignedCount = teachers.filter(
      t => t.assignedClasses && t.assignedClasses.length > 0
    ).length;

    const formTeacherCount = teachers.filter(t => t.isFormTeacher === true).length;

    const tpCount =
      assignments.length > 0 ? teachers.filter(t => teacherHasRole(t.id, 'tp')).length : 0;
    const leaveCoverCount =
      assignments.length > 0
        ? teachers.filter(t => teacherHasRole(t.id, 'leave-cover')).length
        : 0;
    const onCoverCount =
      assignments.length > 0
        ? teachers.filter(t => teacherIsOnCover(t.id)).length
        : teachers.filter(t => t.status === 'on_leave').length;

    return {
      totalTeachers: teachers.length,
      activeTeachers: teachers.filter(t => t.status === 'active' || !t.status).length,
      inactiveTeachers: teachers.filter(t => t.status === 'inactive').length,
      onLeaveTeachers: teachers.filter(t => t.status === 'on_leave').length,
      transferredTeachers: teachers.filter(t => t.status === 'transferred').length,
      assignedTeachers: assignedCount,
      formTeachers: formTeacherCount,

      // New — needed by the "On Cover" stat card and header summary
      onCoverTeachers: onCoverCount,
      tpTeachers: tpCount,
      leaveCoverTeachers: leaveCoverCount,
    };
  }, [teachers, assignments, assignmentsByTeacher]);

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setAssignmentFilter('all');
    setRoleFilter('all');
    setShowMobileFilters(false);
  };

  return {
    // State
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    assignmentFilter,
    setAssignmentFilter,
    roleFilter,
    setRoleFilter,
    showMobileFilters,
    setShowMobileFilters,

    // Computed
    filteredTeachers,
    filterCounts,
    stats,

    // Actions
    clearFilters,
  };
};