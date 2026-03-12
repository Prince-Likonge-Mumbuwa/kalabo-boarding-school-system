import { useState, useMemo } from 'react';
import {
  User,
  Mail,
  Phone,
  BookOpen,
  GraduationCap,
  Users,
  Loader2,
  MoreVertical,
  PowerOff,
  RefreshCw,
  CheckCircle,
  XCircle,
  Edit,
  Trash2,
  ArrowRight,
  Star,
  ChevronDown,
  ChevronRight,
  Calendar,
  Hash,
  CreditCard,
  Briefcase,
  X,
  UserX,
  Layers
} from 'lucide-react';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';
import { Teacher, TeacherStatus } from '@/types/teachers';

interface TeacherCardProps {
  teacher: Teacher;
  isUserAdmin: boolean;
  classes: any[];
  onEdit: () => void;
  onDelete: () => void;
  onAssign: () => void;
  onBulkRemove: () => void;
  onStatusUpdate: (status: TeacherStatus) => void;
  onRemoveFromClass: (classId: string, className: string) => void;
  onRemoveFormTeacher: (classId: string, className: string) => void;
  onRemoveSubject: (classId: string, className: string, subject: string) => void;
  onRemoveAssignment: (classId: string, className: string) => void;
  onTransfer: (classId: string, className: string) => void;
  onViewLearners: (classId?: string) => void;
}

const getStatusConfig = (status: string = 'active') => {
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

export const TeacherCard: React.FC<TeacherCardProps> = ({
  teacher,
  isUserAdmin,
  classes,
  onEdit,
  onDelete,
  onAssign,
  onBulkRemove,
  onStatusUpdate,
  onRemoveFromClass,
  onRemoveFormTeacher,
  onRemoveSubject,
  onRemoveAssignment,
  onTransfer,
  onViewLearners
}) => {
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
  
  const assignmentsByClass = useMemo(() => {
    return getClassesWithSubjects();
  }, [assignments, getClassesWithSubjects]);

  const getClassName = (classId: string): string => {
    return classes.find(c => c.id === classId)?.name || 'Unknown Class';
  };

  const getClass = (classId: string) => {
    return classes.find(c => c.id === classId);
  };

  return (
    <div className="group bg-white rounded-xl border border-gray-200 p-5 
                    shadow-sm hover:shadow-lg transition-all duration-300 
                    hover:border-gray-300 hover:-translate-y-0.5 relative">
      
      {isLoadingAssignments && (
        <div className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center z-10">
          <Loader2 size={24} className="animate-spin text-blue-600" />
        </div>
      )}

      {isUserAdmin && !isLoadingAssignments && (
        <div className="absolute top-4 right-4">
          <button
            onClick={() => setShowActions(!showActions)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <MoreVertical size={16} className="text-gray-500" />
          </button>
          
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
                <button
                  onClick={() => {
                    setShowActions(false);
                    onBulkRemove();
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-orange-600"
                >
                  <Layers size={14} />
                  <span>Remove Multiple Assignments</span>
                </button>
              )}
              
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
                          
                          <div className="absolute left-full top-0 ml-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 hidden group-hover/submenu:block z-30">
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
                            
                            <button
                              onClick={() => {
                                setShowActions(false);
                                onRemoveAssignment(assignment.classId, className);
                              }}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 text-orange-600 flex items-center gap-2"
                            >
                              <X size={14} />
                              <span>Remove Entire Assignment</span>
                            </button>
                            
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
        
        <button
          onClick={() => setExpandedDetails(!expandedDetails)}
          className="w-full flex items-center justify-between text-xs text-blue-600 hover:text-blue-800 mt-1"
        >
          <span className="font-medium">{expandedDetails ? 'Hide details' : 'Show all details'}</span>
          <ChevronDown size={14} className={`transition-transform duration-200 ${expandedDetails ? 'rotate-180' : ''}`} />
        </button>
      </div>

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
                    
                    {isExpanded && (
                      <div className="pl-6 space-y-2 animate-in slide-in-from-top duration-200">
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