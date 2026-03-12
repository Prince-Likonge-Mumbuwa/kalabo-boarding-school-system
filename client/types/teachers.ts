export type TeacherStatus = 'active' | 'inactive' | 'transferred' | 'on_leave';
export type AssignmentFilter = 'all' | 'assigned' | 'unassigned' | 'form-teachers';
export type ModalType = 'assignment' | 'edit' | 'delete' | 'transfer' | 'subject-remove' | 'assignment-remove' | 'bulk-remove' | 'success' | 'error' | 'confirm' | 'teachers-preview' | null;
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

export interface ModalData {
  teacher?: Teacher;
  classId?: string;
  className?: string;
  newStatus?: TeacherStatus;
  action?: string;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  [key: string]: any;
}