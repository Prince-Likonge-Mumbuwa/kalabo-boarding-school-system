// @/pages/admin/TeacherManagement.tsx - CLEANED UP VERSION (DEBUG REMOVED)
import { DashboardLayout } from '@/components/DashboardLayout';
import { useSchoolTeachers } from '@/hooks/useSchoolTeachers';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useTeacherAssignments, TeacherAssignment } from '@/hooks/useTeacherAssignments';
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
  Download,
  FileText,
  ChevronRight,
  Calendar,
  Hash,
  CreditCard
} from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useQueryClient } from '@tanstack/react-query';
import { generateTeacherListPDF } from '@/services/pdf/teacherListPDF';

// Teacher status type
type TeacherStatus = 'active' | 'inactive' | 'transferred' | 'on_leave';

// Filter types
type AssignmentFilter = 'all' | 'assigned' | 'unassigned' | 'form-teachers';

// Modal types
type ModalType = 'assignment' | 'edit' | 'delete' | 'transfer' | 'subject-remove' | 'success' | 'error' | 'confirm' | 'teachers-preview' | null;

// Toast notification type
interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

// Teacher type from your system
interface Teacher {
  id: string;
  name: string;
  email: string;
  phone?: string;
  department?: string;
  subjects?: string[];
  status?: TeacherStatus;
  isFormTeacher?: boolean;
  assignedClasses?: any[];
  // Signup fields
  nrc?: string;
  dateOfBirth?: string;
  tsNumber?: string;
  employeeNumber?: string;
  dateOfFirstAppointment?: string;
  dateOfCurrentAppointment?: string;
  [key: string]: any;
}

// Learner type
interface Learner {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email?: string;
  phone?: string;
  nrc?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  emergencyContact?: string;
  classId?: string;
  className?: string;
  enrollmentDate?: string;
  [key: string]: any;
}

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

// ==================== TEACHERS PREVIEW MODAL ====================
const TeachersPreviewModal = ({ 
  teachers, 
  classes,
  assignments,
  filterInfo,
  onClose, 
  onDownload 
}: { 
  teachers: Teacher[]; 
  classes: any[];
  assignments: Record<string, any[]>;
  filterInfo?: string;
  onClose: () => void; 
  onDownload: () => void;
}) => {
  const [downloading, setDownloading] = useState(false);
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null);
  
  const handleDownload = async () => {
    setDownloading(true);
    try {
      await onDownload();
    } finally {
      setDownloading(false);
    }
  };
  
  const getClassAssignments = (teacherId: string) => {
    return assignments[teacherId] || [];
  };
  
  const getClassNames = (teacherId: string) => {
    const teacherAssignments = getClassAssignments(teacherId);
    const classMap = new Map();
    
    teacherAssignments.forEach((a: any) => {
      if (!classMap.has(a.classId)) {
        const className = classes.find(c => c.id === a.classId)?.name || 'Unknown Class';
        classMap.set(a.classId, {
          name: className,
          subjects: [],
          isFormTeacher: false
        });
      }
      const classData = classMap.get(a.classId);
      if (a.subject && a.subject !== 'Form Teacher') {
        classData.subjects.push(a.subject);
      }
      if (a.isFormTeacher) {
        classData.isFormTeacher = true;
      }
    });
    
    return Array.from(classMap.values());
  };
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      
      <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-6xl shadow-2xl max-h-[90vh] overflow-hidden">
          
          {/* Modal Header */}
          <div className="p-5 sm:p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-gray-900 truncate flex items-center gap-2">
                  <FileText size={20} className="text-blue-600" />
                  Teachers Master List
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {filterInfo ? `${filterInfo} • ` : ''}{teachers.length} teacher{teachers.length !== 1 ? 's' : ''} found
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>
          </div>

          {/* Modal Body - Teachers List */}
          <div className="p-5 sm:p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
            <div className="space-y-4">
              {teachers.map((teacher, index) => {
                const classAssignments = getClassNames(teacher.id);
                const isExpanded = expandedTeacher === teacher.id;
                
                return (
                  <div key={teacher.id} className="border border-gray-200 rounded-xl overflow-hidden">
                    {/* Teacher Summary - Click to expand */}
                    <div 
                      className="bg-gray-50 p-4 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => setExpandedTeacher(isExpanded ? null : teacher.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-semibold text-gray-500">#{index + 1}</span>
                            <h3 className="text-lg font-bold text-gray-900">{teacher.name}</h3>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs
                              ${teacher.status === 'active' ? 'bg-green-100 text-green-800' : ''}
                              ${teacher.status === 'inactive' ? 'bg-gray-100 text-gray-800' : ''}
                              ${teacher.status === 'transferred' ? 'bg-blue-100 text-blue-800' : ''}
                              ${teacher.status === 'on_leave' ? 'bg-yellow-100 text-yellow-800' : ''}
                              ${!teacher.status ? 'bg-green-100 text-green-800' : ''}
                            `}>
                              {teacher.status ? teacher.status.replace('_', ' ') : 'active'}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                            <div><span className="text-gray-500">Email:</span> {teacher.email}</div>
                            <div><span className="text-gray-500">Phone:</span> {teacher.phone || 'N/A'}</div>
                            <div><span className="text-gray-500">NRC:</span> {teacher.nrc || 'N/A'}</div>
                            <div><span className="text-gray-500">TS #:</span> {teacher.tsNumber || 'N/A'}</div>
                            <div><span className="text-gray-500">Emp #:</span> {teacher.employeeNumber || 'N/A'}</div>
                            <div><span className="text-gray-500">Dept:</span> {teacher.department || 'N/A'}</div>
                          </div>
                          
                          {classAssignments.length > 0 && (
                            <div className="mt-2 flex items-center gap-1 text-sm">
                              <Briefcase size={14} className="text-blue-500" />
                              <span className="text-gray-600">
                                {classAssignments.length} class{classAssignments.length !== 1 ? 'es' : ''} assigned
                              </span>
                              <ChevronDown 
                                size={16} 
                                className={`ml-2 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} 
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="p-4 border-t border-gray-200 bg-white space-y-3">
                        {/* Signup Details */}
                        <div className="grid grid-cols-2 gap-3 text-sm bg-blue-50 p-3 rounded-lg">
                          <div><span className="font-medium text-gray-700">Date of Birth:</span> {teacher.dateOfBirth ? new Date(teacher.dateOfBirth).toLocaleDateString() : 'N/A'}</div>
                          <div><span className="font-medium text-gray-700">First Appointment:</span> {teacher.dateOfFirstAppointment ? new Date(teacher.dateOfFirstAppointment).toLocaleDateString() : 'N/A'}</div>
                          <div><span className="font-medium text-gray-700">Current Appointment:</span> {teacher.dateOfCurrentAppointment ? new Date(teacher.dateOfCurrentAppointment).toLocaleDateString() : 'N/A'}</div>
                        </div>
                        
                        {/* Subjects Qualified */}
                        {teacher.subjects && teacher.subjects.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Subjects Qualified to Teach:</h4>
                            <div className="flex flex-wrap gap-2">
                              {teacher.subjects.map((subject, idx) => (
                                <span key={idx} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                                  {subject}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Current Assignments */}
                        {classAssignments.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Current Class Assignments:</h4>
                            <div className="space-y-3">
                              {classAssignments.map((cls: any) => (
                                <div key={cls.name} className="border border-gray-200 rounded-lg p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <GraduationCap size={16} className="text-gray-500" />
                                    <span className="font-medium text-gray-900">{cls.name}</span>
                                    {cls.isFormTeacher && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full text-xs">
                                        <Star size={10} className="fill-purple-800" />
                                        Form Teacher
                                      </span>
                                    )}
                                  </div>
                                  {cls.subjects.length > 0 && (
                                    <div className="ml-6">
                                      <p className="text-xs text-gray-500 mb-1">Teaching:</p>
                                      <div className="flex flex-wrap gap-1">
                                        {cls.subjects.map((subject: string) => (
                                          <span key={subject} className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs">
                                            {subject}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="p-5 sm:p-6 border-t border-gray-200 bg-gray-50">
            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium transition-colors text-sm"
              >
                Close
              </button>
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {downloading ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    Generating PDF...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Download Complete List
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== ENHANCED TEACHER CARD COMPONENT ====================
const TeacherCard = ({ 
  teacher, 
  isUserAdmin, 
  classes,
  onEdit,
  onDelete,
  onAssign,
  onStatusUpdate,
  onRemoveFromClass,
  onRemoveFormTeacher,
  onRemoveSubject,
  onTransfer,
  onViewLearners
}: { 
  teacher: Teacher; 
  isUserAdmin: boolean; 
  classes: any[];
  onEdit: () => void;
  onDelete: () => void;
  onAssign: () => void;
  onStatusUpdate: (status: TeacherStatus) => void;
  onRemoveFromClass: (classId: string, className: string) => void;
  onRemoveFormTeacher: (classId: string, className: string) => void;
  onRemoveSubject: (classId: string, className: string, subject: string) => void;
  onTransfer: (classId: string, className: string) => void;
  onViewLearners: (classId?: string) => void;
}) => {
  // Using updated hook that queries correct collection
  const { 
    assignments = [], 
    isLoading: isLoadingAssignments,
    getClassesWithSubjects 
  } = useTeacherAssignments(teacher.id);

  const [showActions, setShowActions] = useState(false);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [expandedDetails, setExpandedDetails] = useState(false);
  const teacherStatus = teacher.status || 'active';
  const StatusIcon = getStatusConfig(teacherStatus).icon;
  
  // Get formatted assignments
  const assignmentsByClass = useMemo(() => {
    return getClassesWithSubjects();
  }, [assignments, getClassesWithSubjects]);

  // Find class name by ID
  const getClassName = (classId: string): string => {
    return classes.find(c => c.id === classId)?.name || 'Unknown Class';
  };

  // Get class object by ID
  const getClass = (classId: string) => {
    return classes.find(c => c.id === classId);
  };

  return (
    <div className="group bg-white rounded-xl border border-gray-200 p-5 
                    shadow-sm hover:shadow-lg transition-all duration-300 
                    hover:border-gray-300 hover:-translate-y-0.5 relative">
      
      {/* Loading Overlay */}
      {isLoadingAssignments && (
        <div className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center z-10">
          <Loader2 size={24} className="animate-spin text-blue-600" />
        </div>
      )}

      {/* Actions Dropdown - Only for Admin */}
      {isUserAdmin && !isLoadingAssignments && (
        <div className="absolute top-4 right-4">
          <button
            onClick={() => setShowActions(!showActions)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <MoreVertical size={16} className="text-gray-500" />
          </button>
          
          {/* Dropdown Menu */}
          {showActions && (
            <div className="absolute right-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 max-h-96 overflow-y-auto">
              <button
                onClick={() => {
                  setShowActions(false);
                  onEdit();
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Edit size={14} className="text-blue-600" />
                <span>Edit Teacher</span>
              </button>
              
              {assignmentsByClass.length > 0 && (
                <>
                  <div className="border-t border-gray-100 my-1"></div>
                  <div className="px-4 py-1 text-xs font-medium text-gray-500">CLASS ASSIGNMENTS</div>
                  
                  {assignmentsByClass.map(assignment => {
                    const className = getClassName(assignment.classId);
                    
                    return (
                      <div key={assignment.classId} className="relative group/submenu">
                        <div className="px-4 py-2 text-left text-sm hover:bg-gray-50 cursor-default">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <span className="font-medium truncate">{className}</span>
                              {assignment.isFormTeacher && (
                                <Star size={12} className="text-purple-600 fill-purple-600" />
                              )}
                            </div>
                            <ChevronDown size={14} className="rotate-270 ml-2 flex-shrink-0" />
                          </div>
                          
                          {/* Submenu */}
                          <div className="absolute left-full top-0 ml-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 hidden group-hover/submenu:block z-30">
                            {/* View learners in this class */}
                            <button
                              onClick={() => {
                                setShowActions(false);
                                onViewLearners(assignment.classId);
                              }}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-blue-600"
                            >
                              <Users size={14} />
                              <span>View Learners</span>
                            </button>
                            
                            <div className="border-t border-gray-100 my-1"></div>

                            {/* Subject removal options */}
                            {assignment.subjects.map(subject => (
                              <button
                                key={subject}
                                onClick={() => {
                                  setShowActions(false);
                                  onRemoveSubject(assignment.classId, className, subject);
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
                                  setShowActions(false);
                                  onRemoveFormTeacher(assignment.classId, className);
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
                                setShowActions(false);
                                onRemoveFromClass(assignment.classId, className);
                              }}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 text-red-600 flex items-center gap-2"
                            >
                              <UserX size={14} />
                              <span>Remove All from Class</span>
                            </button>
                            
                            {/* Transfer to another class */}
                            <button
                              onClick={() => {
                                setShowActions(false);
                                onTransfer(assignment.classId, className);
                              }}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                            >
                              <ArrowRight size={14} className="text-blue-600" />
                              <span>Transfer Class</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
              
              <div className="border-t border-gray-100 my-1"></div>
              
              <button
                onClick={() => {
                  setShowActions(false);
                  onStatusUpdate('active');
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                disabled={teacherStatus === 'active'}
              >
                <CheckCircle size={14} className="text-green-600" />
                <span>Set Active</span>
                {teacherStatus === 'active' && <span className="ml-auto text-xs text-gray-400">✓</span>}
              </button>
              <button
                onClick={() => {
                  setShowActions(false);
                  onStatusUpdate('inactive');
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                disabled={teacherStatus === 'inactive'}
              >
                <PowerOff size={14} className="text-gray-600" />
                <span>Set Inactive</span>
                {teacherStatus === 'inactive' && <span className="ml-auto text-xs text-gray-400">✓</span>}
              </button>
              <button
                onClick={() => {
                  setShowActions(false);
                  onStatusUpdate('on_leave');
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                disabled={teacherStatus === 'on_leave'}
              >
                <XCircle size={14} className="text-yellow-600" />
                <span>Set On Leave</span>
                {teacherStatus === 'on_leave' && <span className="ml-auto text-xs text-gray-400">✓</span>}
              </button>
              <button
                onClick={() => {
                  setShowActions(false);
                  onStatusUpdate('transferred');
                }}
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
                  setShowActions(false);
                  onDelete();
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

      {/* Teacher Details - Basic Info */}
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
        
        {/* Expandable Teacher Details Button */}
        <button
          onClick={() => setExpandedDetails(!expandedDetails)}
          className="w-full flex items-center justify-between text-xs text-blue-600 hover:text-blue-800 mt-1"
        >
          <span className="font-medium">{expandedDetails ? 'Hide details' : 'Show all details'}</span>
          <ChevronDown size={14} className={`transition-transform duration-200 ${expandedDetails ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Expanded Teacher Details */}
      {expandedDetails && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg space-y-2 text-xs animate-in slide-in-from-top duration-200">
          {teacher.nrc && (
            <div className="flex items-center gap-2">
              <CreditCard size={12} className="text-gray-500" />
              <span className="text-gray-700"><span className="font-medium">NRC:</span> {teacher.nrc}</span>
            </div>
          )}
          {teacher.tsNumber && (
            <div className="flex items-center gap-2">
              <Hash size={12} className="text-gray-500" />
              <span className="text-gray-700"><span className="font-medium">TS #:</span> {teacher.tsNumber}</span>
            </div>
          )}
          {teacher.employeeNumber && (
            <div className="flex items-center gap-2">
              <Briefcase size={12} className="text-gray-500" />
              <span className="text-gray-700"><span className="font-medium">Employee #:</span> {teacher.employeeNumber}</span>
            </div>
          )}
          {teacher.department && (
            <div className="flex items-center gap-2">
              <BookOpen size={12} className="text-gray-500" />
              <span className="text-gray-700"><span className="font-medium">Department:</span> {teacher.department}</span>
            </div>
          )}
          {teacher.dateOfBirth && (
            <div className="flex items-center gap-2">
              <Calendar size={12} className="text-gray-500" />
              <span className="text-gray-700"><span className="font-medium">DOB:</span> {new Date(teacher.dateOfBirth).toLocaleDateString()}</span>
            </div>
          )}
          {teacher.dateOfFirstAppointment && (
            <div className="flex items-center gap-2">
              <Calendar size={12} className="text-gray-500" />
              <span className="text-gray-700"><span className="font-medium">First Appt:</span> {new Date(teacher.dateOfFirstAppointment).toLocaleDateString()}</span>
            </div>
          )}
          {teacher.dateOfCurrentAppointment && (
            <div className="flex items-center gap-2">
              <Calendar size={12} className="text-gray-500" />
              <span className="text-gray-700"><span className="font-medium">Current Appt:</span> {new Date(teacher.dateOfCurrentAppointment).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      )}

      {/* Subjects Qualified */}
      {teacher.subjects && teacher.subjects.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-1">Subjects Qualified:</p>
          <div className="flex flex-wrap gap-1">
            {teacher.subjects.slice(0, 3).map((subject, idx) => (
              <span key={idx} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                {subject}
              </span>
            ))}
            {teacher.subjects.length > 3 && (
              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                +{teacher.subjects.length - 3}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Enhanced Assignment Status with Expandable Details */}
      <div className="border-t border-gray-100 pt-4">
        {assignmentsByClass.length > 0 ? (
          <div>
            <p className="text-xs text-gray-500 mb-2">Currently assigned to</p>
            <div className="space-y-3">
              {assignmentsByClass.map(assignment => {
                const className = getClassName(assignment.classId);
                const classObj = getClass(assignment.classId);
                const isExpanded = expandedClass === assignment.classId;
                
                return (
                  <div key={assignment.classId} className="space-y-2">
                    {/* Class Header - Click to expand */}
                    <div 
                      className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors"
                      onClick={() => setExpandedClass(isExpanded ? null : assignment.classId)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <GraduationCap size={14} className="text-gray-400 flex-shrink-0" />
                        <span className="font-medium text-gray-900 text-sm truncate flex items-center gap-1">
                          {className}
                          {assignment.isFormTeacher && (
                            <span className="inline-flex items-center gap-0.5 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full ml-1">
                              <Star size={10} className="fill-purple-700" />
                              Form
                            </span>
                          )}
                        </span>
                      </div>
                      <ChevronRight 
                        size={14} 
                        className={`text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} 
                      />
                    </div>
                    
                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="pl-6 space-y-2 animate-in slide-in-from-top duration-200">
                        {/* Subjects Taught */}
                        {assignment.subjects.length > 0 ? (
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-1">Subjects Teaching:</p>
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
                          <p className="text-xs text-gray-500 italic">Form teacher only (no subjects)</p>
                        ) : null}
                        
                        {/* Class Stats */}
                        {classObj && (
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <div className="bg-gray-50 p-2 rounded-lg">
                              <p className="text-[0.6rem] text-gray-500">Students</p>
                              <p className="text-sm font-semibold text-gray-900">{classObj.students || 0}</p>
                            </div>
                            <div className="bg-gray-50 p-2 rounded-lg">
                              <p className="text-[0.6rem] text-gray-500">Year</p>
                              <p className="text-sm font-semibold text-gray-900">{classObj.year || 'N/A'}</p>
                            </div>
                          </div>
                        )}
                        
                        {/* Quick Actions */}
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewLearners(assignment.classId);
                            }}
                            className="flex-1 text-xs px-2 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-1"
                          >
                            <Users size={12} />
                            View Learners
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Not assigned</span>
            {isUserAdmin && teacherStatus === 'active' && (
              <button
                onClick={onAssign}
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
};

// ==================== MAIN COMPONENT ====================
export default function TeacherManagement() {
  const { user } = useAuth();
  const isUserAdmin = user?.userType === 'admin';
  const isMobile = useMediaQuery('(max-width: 640px)');
  const queryClient = useQueryClient();
  
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
    isLoading: isLoadingLearners,
    refetch: refetchLearners
  } = useSchoolLearners('');

  // ==================== STATE ====================
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<TeacherStatus | 'all'>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('all');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [modalData, setModalData] = useState<any>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedClassName, setSelectedClassName] = useState<string>('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [currentSubject, setCurrentSubject] = useState<string>('');
  
  const [previewTeachers, setPreviewTeachers] = useState<Teacher[]>([]);
  const [previewAssignments, setPreviewAssignments] = useState<Record<string, any[]>>({});
  const [previewFilterInfo, setPreviewFilterInfo] = useState<string>('');
  
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  const [assignAsFormTeacher, setAssignAsFormTeacher] = useState(false);
  
  const [editTeacherData, setEditTeacherData] = useState({
    name: '',
    email: '',
    phone: '',
    department: '',
    subjects: [] as string[],
    newSubject: ''
  });
  
  const [targetClassId, setTargetClassId] = useState('');
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

  const stats = useMemo(() => {
    const teachersArray = teachers || [];
    
    const assignedCount = teachersArray.filter(t => 
      t && t.assignedClasses && Array.isArray(t.assignedClasses) && t.assignedClasses.length > 0
    ).length;
    
    const formTeacherCount = teachersArray.filter(t => 
      t && t.isFormTeacher === true
    ).length;
    
    return {
      totalTeachers: teachersArray.length,
      activeTeachers: teachersArray.filter(t => t && (t.status === 'active' || !t.status)).length,
      inactiveTeachers: teachersArray.filter(t => t && t.status === 'inactive').length,
      onLeaveTeachers: teachersArray.filter(t => t && t.status === 'on_leave').length,
      assignedTeachers: assignedCount,
      formTeachers: formTeacherCount,
    };
  }, [teachers]);

  const filteredTeachers = useMemo(() => {
    const teachersArray = teachers || [];
    
    return teachersArray.filter(teacher => {
      if (!teacher) return false;
      
      const matchesSearch = !debouncedSearch ||
        (teacher.name && teacher.name.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
        (teacher.email && teacher.email.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
        (teacher.phone && teacher.phone.includes(debouncedSearch)) ||
        (teacher.department && teacher.department.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
        (teacher.nrc && teacher.nrc.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
        (teacher.tsNumber && teacher.tsNumber.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
        (teacher.employeeNumber && teacher.employeeNumber.toLowerCase().includes(debouncedSearch.toLowerCase()));
      
      const teacherStatus = teacher.status || 'active';
      const matchesStatus = statusFilter === 'all' || teacherStatus === statusFilter;
      
      let matchesAssignment = true;
      const hasAssignments = teacher.assignedClasses && Array.isArray(teacher.assignedClasses) && teacher.assignedClasses.length > 0;
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
    const teachersArray = teachers || [];
    
    const assignedCount = teachersArray.filter(t => 
      t && t.assignedClasses && Array.isArray(t.assignedClasses) && t.assignedClasses.length > 0
    ).length;
    
    const formTeacherCount = teachersArray.filter(t => 
      t && t.isFormTeacher === true
    ).length;
    
    return {
      all: teachersArray.length,
      active: teachersArray.filter(t => t && (t.status === 'active' || !t.status)).length,
      inactive: teachersArray.filter(t => t && t.status === 'inactive').length,
      onLeave: teachersArray.filter(t => t && t.status === 'on_leave').length,
      transferred: teachersArray.filter(t => t && t.status === 'transferred').length,
      assigned: assignedCount,
      unassigned: teachersArray.length - assignedCount,
      formTeachers: formTeacherCount
    };
  }, [teachers]);

  const handlePreviewTeachers = async () => {
    try {
      const teachersToShow = filteredTeachers.length > 0 ? filteredTeachers : teachers;
      
      const assignmentsMap: Record<string, any[]> = {};
      
      for (const teacher of teachersToShow) {
        try {
          const response = await fetch(`/api/teacher-assignments/${teacher.id}`);
          const data = await response.json();
          assignmentsMap[teacher.id] = data;
        } catch (error) {
          console.error(`Error fetching assignments for teacher ${teacher.id}:`, error);
          assignmentsMap[teacher.id] = [];
        }
      }
      
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
      
      setPreviewTeachers(teachersToShow);
      setPreviewAssignments(assignmentsMap);
      setPreviewFilterInfo(filterInfo);
      setActiveModal('teachers-preview');
    } catch (error) {
      console.error('Error preparing teachers preview:', error);
      addToast({
        type: 'error',
        title: 'Failed to Load Teachers',
        message: 'An error occurred while loading teachers data.',
        duration: 5000
      });
    }
  };

  const handleDownloadTeachersPDF = async () => {
    try {
      const pdfBytes = await generateTeacherListPDF({
        teachers: previewTeachers,
        classes,
        teacherAssignments: previewAssignments,
        filterInfo: previewFilterInfo,
        schoolName: 'KALABO BOARDING SECONDARY SCHOOL'
      });
      
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
      
      setActiveModal(null);
    } catch (error) {
      console.error('Error generating PDF:', error);
      addToast({
        type: 'error',
        title: 'PDF Generation Failed',
        message: 'An error occurred while generating the PDF.',
        duration: 5000
      });
    }
  };

  const handleViewLearners = async (classId?: string) => {
    try {
      let learnersToShow = [...learners];
      let className = 'All Learners';
      
      if (classId) {
        const classObj = classes.find(c => c.id === classId);
        className = classObj?.name || 'Unknown Class';
        learnersToShow = learners.filter(learner => learner.classId === classId);
        learnersToShow = learnersToShow.map(learner => ({
          ...learner,
          className: className
        }));
      } else {
        learnersToShow = learnersToShow.map(learner => {
          const learnerClass = classes.find(c => c.id === learner.classId);
          return {
            ...learner,
            className: learnerClass?.name || 'Unknown Class'
          };
        });
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

    const teacher = (teachers || []).find(t => t && t.id === teacherId);
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
      
      setActiveModal(null);
      setSelectedTeacher(null);
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

    const selectedClass = (classes || []).find(c => c && c.id === selectedClassId);
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
      
      setActiveModal(null);
      setSelectedTeacher(null);
      setSelectedClassId('');
      
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
      
      setActiveModal(null);
      setSelectedTeacher(null);
      setSelectedClassId('');
      
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

    const targetClass = (classes || []).find(c => c && c.id === targetClassId);
    const sourceClass = (classes || []).find(c => c && c.id === selectedClassId);

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
        setModalData(null);
        break;
      
      case 'remove-form-teacher':
        setSelectedTeacher(modalData.teacher);
        setSelectedClassId(modalData.classId);
        await handleRemoveFormTeacherStatus();
        setModalData(null);
        break;
      
      default:
        setActiveModal(null);
        setModalData(null);
    }
  };

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

  const resetAssignmentModal = () => {
    setActiveModal(null);
    setSelectedTeacher(null);
    setSelectedClassId('');
    setSelectedClassName('');
    setSelectedSubjects([]);
    setCurrentSubject('');
    setAssignAsFormTeacher(false);
    setTargetClassId('');
    setSelectedSubjectToRemove('');
    setModalData(null);
  };

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
                  <button
                    onClick={handlePreviewTeachers}
                    className={`
                      inline-flex items-center justify-center
                      bg-green-600 text-white rounded-xl hover:bg-green-700
                      font-medium transition-all active:scale-[0.98]
                      focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2
                      ${isMobile 
                        ? 'p-2.5' 
                        : 'px-4 py-2.5 gap-2'
                      }
                    `}
                    title={isMobile ? 'Download Teachers List' : undefined}
                  >
                    <Download size={isMobile ? 18 : 20} />
                    {!isMobile && 'Download Teachers List'}
                  </button>
                  
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
                        ? 'p-2.5' 
                        : 'px-4 py-2.5 gap-2'
                      }
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
                    placeholder={isMobile ? "Search teachers..." : "Search by name, email, phone, NRC, TS#, or Emp#..."}
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
                if (!teacher || !teacher.id) return null;
                
                return (
                  <TeacherCard
                    key={teacher.id}
                    teacher={teacher}
                    isUserAdmin={isUserAdmin}
                    classes={classes}
                    onEdit={() => {
                      setSelectedTeacher(teacher);
                      setActiveModal('edit');
                    }}
                    onDelete={() => {
                      setSelectedTeacher(teacher);
                      setActiveModal('delete');
                    }}
                    onAssign={() => {
                      setSelectedTeacher(teacher);
                      setSelectedSubjects([]);
                      setActiveModal('assignment');
                    }}
                    onStatusUpdate={(status) => handleUpdateStatus(teacher.id, status)}
                    onRemoveFromClass={(classId, className) => {
                      setSelectedTeacher(teacher);
                      setSelectedClassId(classId);
                      setSelectedClassName(className);
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
                    }}
                    onRemoveFormTeacher={(classId, className) => {
                      setSelectedTeacher(teacher);
                      setSelectedClassId(classId);
                      setSelectedClassName(className);
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
                    }}
                    onRemoveSubject={(classId, className, subject) => {
                      setSelectedTeacher(teacher);
                      setSelectedClassId(classId);
                      setSelectedClassName(className);
                      setSelectedSubjectToRemove(subject);
                      setActiveModal('subject-remove');
                    }}
                    onTransfer={(classId, className) => {
                      setSelectedTeacher(teacher);
                      setSelectedClassId(classId);
                      setSelectedClassName(className);
                      setTargetClassId('');
                      setActiveModal('transfer');
                    }}
                    onViewLearners={(classId) => handleViewLearners(classId)}
                  />
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
              Showing {filteredTeachers.length} of {teachers?.length || 0} teachers
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
                        const teacher = (teachers || []).find(t => t && t.id === e.target.value);
                        setSelectedTeacher(teacher || null);
                        setSelectedSubjects([]);
                        setCurrentSubject('');
                      }}
                      value=""
                    >
                      <option value="">Choose a teacher...</option>
                      {(teachers || [])
                        .filter(t => t && (t.status === 'active' || !t.status))
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
                    {selectedTeacher.subjects && Array.isArray(selectedTeacher.subjects) && selectedTeacher.subjects.length > 0 && (
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
                    {(classes || []).map(cls => (
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
                    {selectedTeacher.subjects && Array.isArray(selectedTeacher.subjects) && selectedTeacher.subjects.length > 0 && (
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

                    {selectedTeacher.subjects && Array.isArray(selectedTeacher.subjects) && selectedTeacher.subjects.length === 0 && (
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
                      <li>• Class: {(classes || []).find(c => c && c.id === selectedClassId)?.name}</li>
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
                  Remove <span className="font-semibold">{selectedSubjectToRemove}</span> from <span className="font-semibold">{selectedTeacher.name}</span>'s assignments in {selectedClassName || 'this class'}?
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
                    value={selectedClassName || (classes || []).find(c => c && c.id === selectedClassId)?.name || ''}
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
                    {(classes || [])
                      .filter(c => c && c.id !== selectedClassId)
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

      {/* ===== TEACHERS PREVIEW MODAL ===== */}
      {activeModal === 'teachers-preview' && (
        <TeachersPreviewModal
          teachers={previewTeachers}
          classes={classes}
          assignments={previewAssignments}
          filterInfo={previewFilterInfo}
          onClose={() => setActiveModal(null)}
          onDownload={handleDownloadTeachersPDF}
        />
      )}
    </>
  );
}