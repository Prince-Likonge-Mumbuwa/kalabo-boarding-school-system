// client/hooks/teachers/useTeacherFilters.ts
import { useState, useMemo } from 'react';
import { Teacher, TeacherStatus, AssignmentFilter } from '@/types/teachers';
import { useDebounce } from '@/hooks/useDebounce';

export const useTeacherFilters = (teachers: Teacher[] = []) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<TeacherStatus | 'all'>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('all');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  
  const debouncedSearch = useDebounce(searchTerm, 300);

  const filteredTeachers = useMemo(() => {
    return teachers.filter(teacher => {
      if (!teacher) return false;
      
      const matchesSearch = !debouncedSearch ||
        (teacher.name?.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
        (teacher.email?.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
        (teacher.phone?.includes(debouncedSearch)) ||
        (teacher.department?.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
        (teacher.nrc?.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
        (teacher.tsNumber?.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
        (teacher.employeeNumber?.toLowerCase().includes(debouncedSearch.toLowerCase()));
      
      const teacherStatus = teacher.status || 'active';
      const matchesStatus = statusFilter === 'all' || teacherStatus === statusFilter;
      
      let matchesAssignment = true;
      const hasAssignments = teacher.assignedClasses && teacher.assignedClasses.length > 0;
      const isFormTeacher = teacher.isFormTeacher === true;
      
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
  }, [teachers, debouncedSearch, statusFilter, assignmentFilter]);

  const filterCounts = useMemo(() => {
    const assignedCount = teachers.filter(t => 
      t.assignedClasses && t.assignedClasses.length > 0
    ).length;
    
    const formTeacherCount = teachers.filter(t => 
      t.isFormTeacher === true
    ).length;
    
    return {
      all: teachers.length,
      active: teachers.filter(t => t.status === 'active' || !t.status).length,
      inactive: teachers.filter(t => t.status === 'inactive').length,
      onLeave: teachers.filter(t => t.status === 'on_leave').length,
      transferred: teachers.filter(t => t.status === 'transferred').length,
      assigned: assignedCount,
      unassigned: teachers.length - assignedCount,
      formTeachers: formTeacherCount
    };
  }, [teachers]);

  const stats = useMemo(() => {
    const assignedCount = teachers.filter(t => 
      t.assignedClasses && t.assignedClasses.length > 0
    ).length;
    
    const formTeacherCount = teachers.filter(t => 
      t.isFormTeacher === true
    ).length;
    
    return {
      totalTeachers: teachers.length,
      activeTeachers: teachers.filter(t => t.status === 'active' || !t.status).length,
      inactiveTeachers: teachers.filter(t => t.status === 'inactive').length,
      onLeaveTeachers: teachers.filter(t => t.status === 'on_leave').length,
      transferredTeachers: teachers.filter(t => t.status === 'transferred').length,
      assignedTeachers: assignedCount,
      formTeachers: formTeacherCount,
    };
  }, [teachers]);

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setAssignmentFilter('all');
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
    showMobileFilters,
    setShowMobileFilters,
    
    // Computed
    filteredTeachers,
    filterCounts,
    stats,
    
    // Actions
    clearFilters
  };
};