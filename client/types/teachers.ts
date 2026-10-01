export type TeacherStatus = 'active' | 'inactive' | 'transferred' | 'on_leave';
export type AssignmentFilter = 'all' | 'assigned' | 'unassigned' | 'form-teachers';

// Union of every modal the teacher-management page can open.
// Kept narrow on purpose so switches over `activeModal` are exhaustive.
export type ModalType =
  | 'assignment'
  | 'edit'
  | 'delete'
  | 'transfer'
  | 'subject-remove'
  | 'assignment-remove'
  | 'assignment-end'
  | 'bulk-remove'
  | 'success'
  | 'error'
  | 'confirm'
  | 'teachers-preview'
  | null;

export type ViewMode = 'grid' | 'list';

export interface Teacher {
  id: string;
  name: string;
  email: string;
  phone?: string;
  department?: string;
  subjects?: string[];
  status?: TeacherStatus;
  isFormTeacher?: boolean;
  assignedClasses?: any[];
  nrc?: string;
  dateOfBirth?: string;
  tsNumber?: string;
  employeeNumber?: string;
  dateOfFirstAppointment?: string;
  dateOfCurrentAppointment?: string;
  [key: string]: any;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

// ==================== MODAL ACTIONS ====================

/**
 * The action the confirmation modal is about to perform.
 * Consumed by TeacherManagement.handleConfirmAction to route to the right handler.
 *
 * Keep this in sync with the switch in handleConfirmAction.
 */
export type ModalAction =
  | 'status-update'
  | 'remove-from-class'
  | 'remove-form-teacher'
  | 'assignment-remove'
  | 'assignment-end';

export interface ModalData {
  teacher?: Teacher;
  classId?: string;
  className?: string;
  newStatus?: TeacherStatus;
  action?: ModalAction | string; // widened for backward compatibility with ad-hoc actions
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;

  // NEW — used by the 'assignment-end' action
  assignmentId?: string;

  // Existing escape hatch (kept for flexibility)
  [key: string]: any;
}