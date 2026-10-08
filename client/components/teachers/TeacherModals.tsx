import React from 'react';
import {
  X,
  AlertTriangle,
  Loader2,
  GraduationCap,
  CheckCircle,
  XCircle,
  AlertCircle,
  Plus,
  Save,
  Trash2,
  ArrowRight,
  ChevronDown,
  UserCheck,
  Star,
  Layers,
  Download,
  Info,
  Clock,
  UserCog,
  User,
} from 'lucide-react';
import { Teacher, ModalData } from '@/types/teachers';
import type { AssignmentRoleType } from '@/types/school';

// ==================== TEACHERS PREVIEW MODAL ====================
export const TeachersPreviewModal: React.FC<{
  isOpen: boolean;
  teachers: Teacher[];
  classes: any[];
  assignments: Record<string, any[]>;
  filterInfo?: string;
  onClose: () => void;
  onDownload: () => void;
  isDownloading?: boolean;
}> = ({ isOpen, teachers, classes, assignments, filterInfo, onClose, onDownload, isDownloading = false }) => {
  const [expandedTeacher, setExpandedTeacher] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const getClassAssignments = (teacherId: string) => assignments[teacherId] || [];

  const getClassNames = (teacherId: string) => {
    const teacherAssignments = getClassAssignments(teacherId);
    const classMap = new Map();

    teacherAssignments.forEach((a: any) => {
      if (!classMap.has(a.classId)) {
        const className = classes.find(c => c.id === a.classId)?.name || 'Unknown Class';
        classMap.set(a.classId, { name: className, subjects: [], isFormTeacher: false });
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
          <div className="p-5 sm:p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-gray-900 truncate flex items-center gap-2">
                  <Download size={20} className="text-blue-600" />
                  Teachers Master List
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {filterInfo ? `${filterInfo} • ` : ''}
                  {teachers.length} teacher{teachers.length !== 1 ? 's' : ''} found
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

          <div className="p-5 sm:p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
            <div className="space-y-4">
              {teachers.map((teacher, index) => {
                const classAssignments = getClassNames(teacher.id);
                const isExpanded = expandedTeacher === teacher.id;

                return (
                  <div key={teacher.id} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div
                      className="bg-gray-50 p-4 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => setExpandedTeacher(isExpanded ? null : teacher.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-semibold text-gray-500">#{index + 1}</span>
                            <h3 className="text-lg font-bold text-gray-900">{teacher.name}</h3>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs
                              ${teacher.status === 'active' ? 'bg-green-100 text-green-800' : ''}
                              ${teacher.status === 'inactive' ? 'bg-gray-100 text-gray-800' : ''}
                              ${teacher.status === 'transferred' ? 'bg-blue-100 text-blue-800' : ''}
                              ${teacher.status === 'on_leave' ? 'bg-yellow-100 text-yellow-800' : ''}
                              ${!teacher.status ? 'bg-green-100 text-green-800' : ''}
                            `}
                            >
                              {teacher.status ? teacher.status.replace('_', ' ') : 'active'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                            <div>
                              <span className="text-gray-500">Email:</span> {teacher.email}
                            </div>
                            <div>
                              <span className="text-gray-500">Phone:</span> {teacher.phone || 'N/A'}
                            </div>
                            <div>
                              <span className="text-gray-500">NRC:</span> {teacher.nrc || 'N/A'}
                            </div>
                            <div>
                              <span className="text-gray-500">TS #:</span> {teacher.tsNumber || 'N/A'}
                            </div>
                            <div>
                              <span className="text-gray-500">Emp #:</span>{' '}
                              {teacher.employeeNumber || 'N/A'}
                            </div>
                            <div>
                              <span className="text-gray-500">Dept:</span>{' '}
                              {teacher.department || 'N/A'}
                            </div>
                          </div>

                          {classAssignments.length > 0 && (
                            <div className="mt-2 flex items-center gap-1 text-sm">
                              <GraduationCap size={14} className="text-blue-500" />
                              <span className="text-gray-600">
                                {classAssignments.length} class
                                {classAssignments.length !== 1 ? 'es' : ''} assigned
                              </span>
                              <ChevronDown
                                size={16}
                                className={`ml-2 text-gray-400 transition-transform duration-200 ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-4 border-t border-gray-200 bg-white space-y-3">
                        <div className="grid grid-cols-2 gap-3 text-sm bg-blue-50 p-3 rounded-lg">
                          <div>
                            <span className="font-medium text-gray-700">Date of Birth:</span>{' '}
                            {teacher.dateOfBirth
                              ? new Date(teacher.dateOfBirth).toLocaleDateString()
                              : 'N/A'}
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">First Appointment:</span>{' '}
                            {teacher.dateOfFirstAppointment
                              ? new Date(teacher.dateOfFirstAppointment).toLocaleDateString()
                              : 'N/A'}
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Current Appointment:</span>{' '}
                            {teacher.dateOfCurrentAppointment
                              ? new Date(teacher.dateOfCurrentAppointment).toLocaleDateString()
                              : 'N/A'}
                          </div>
                        </div>

                        {teacher.subjects && teacher.subjects.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">
                              Subjects Qualified to Teach:
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {teacher.subjects.map((subject, idx) => (
                                <span
                                  key={idx}
                                  className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs"
                                >
                                  {subject}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {classAssignments.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">
                              Current Class Assignments:
                            </h4>
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
                                          <span
                                            key={subject}
                                            className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs"
                                          >
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

          <div className="p-5 sm:p-6 border-t border-gray-200 bg-gray-50">
            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium transition-colors text-sm"
              >
                Close
              </button>
              <button
                onClick={onDownload}
                disabled={isDownloading}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isDownloading ? (
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

// ==================== CONFIRMATION MODAL ====================
export const ConfirmationModal: React.FC<{
  isOpen: boolean;
  data: ModalData;
  onClose: () => void;
  onConfirm: () => void;
}> = ({ isOpen, data, onClose, onConfirm }) => {
  if (!isOpen || !data) return null;

  const isEndCover = (data as any).action === 'assignment-end';

  const iconWrap = isEndCover ? 'bg-rose-100' : 'bg-yellow-100';
  const iconEl = isEndCover ? (
    <UserCog className="text-rose-600" size={32} />
  ) : (
    <AlertTriangle className="text-yellow-600" size={32} />
  );
  const confirmBtn = isEndCover
    ? 'bg-rose-600 hover:bg-rose-700'
    : 'bg-yellow-600 hover:bg-yellow-700';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
          <div className="text-center">
            <div
              className={`mx-auto flex items-center justify-center w-16 h-16 rounded-full mb-4 ${iconWrap}`}
            >
              {iconEl}
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{data.title}</h2>
            <p className="text-sm text-gray-600 mb-6">{data.message}</p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                {data.cancelText || 'Cancel'}
              </button>
              <button
                onClick={onConfirm}
                className={`flex-1 px-4 py-2.5 text-white rounded-lg font-medium ${confirmBtn}`}
              >
                {data.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== ASSIGNMENT MODAL ====================
export const AssignmentModal: React.FC<{
  isOpen: boolean;
  teacher: Teacher | null;
  teachers: Teacher[];
  classes: any[];
  selectedClassId: string;
  selectedSubjects: string[];
  currentSubject: string;
  assignAsFormTeacher: boolean;
  isAssigning: boolean;

  roleType?: AssignmentRoleType;
  startDate?: string;
  endDate?: string;
  onRoleTypeChange?: (roleType: AssignmentRoleType) => void;
  onStartDateChange?: (date: string) => void;
  onEndDateChange?: (date: string) => void;

  onTeacherChange: (teacher: Teacher | null) => void;
  onClassChange: (classId: string) => void;
  onSubjectChange: (subject: string) => void;
  onAddSubject: () => void;
  onRemoveSubject: (subject: string) => void;
  onFormTeacherChange: (checked: boolean) => void;
  onAssign: () => void;
  onClose: () => void;
}> = ({
  isOpen,
  teacher,
  teachers,
  classes,
  selectedClassId,
  selectedSubjects,
  currentSubject,
  assignAsFormTeacher,
  isAssigning,
  roleType = 'substantive',
  startDate = '',
  endDate = '',
  onRoleTypeChange,
  onStartDateChange,
  onEndDateChange,
  onTeacherChange,
  onClassChange,
  onSubjectChange,
  onAddSubject,
  onRemoveSubject,
  onFormTeacherChange,
  onAssign,
  onClose,
}) => {
  if (!isOpen) return null;

  const isCoverRole = roleType === 'tp' || roleType === 'leave-cover';
  const endDateRequired = isCoverRole;
  const endDateMissing = endDateRequired && !endDate;

  const canAssign =
    !!teacher &&
    !!selectedClassId &&
    (assignAsFormTeacher || selectedSubjects.length > 0) &&
    !isAssigning &&
    !endDateMissing;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
          <div className="p-5 sm:p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-gray-900 truncate">
                  {teacher ? `Assign ${teacher.name.split(' ')[0]}` : 'Assign Teacher'}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {teacher ? 'Choose class, role, and subjects' : 'Select a teacher to assign'}
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

          <div className="p-5 sm:p-6 space-y-5">
            {!teacher ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Select Teacher <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg 
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           text-sm bg-white hover:border-gray-400 transition-colors"
                  onChange={(e) => {
                    const t = teachers.find(t => t.id === e.target.value);
                    onTeacherChange(t || null);
                  }}
                  value=""
                >
                  <option value="">Choose a teacher...</option>
                  {teachers
                    .filter(t => t.status === 'active' || !t.status)
                    .map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} • {t.email}
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <div className="p-3 bg-blue-50/80 rounded-lg border border-blue-100">
                <p className="text-xs text-blue-700 font-medium mb-1">Selected Teacher</p>
                <p className="text-sm font-semibold text-gray-900">{teacher.name}</p>
                {teacher.subjects && teacher.subjects.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-blue-700 mb-1">Available subjects:</p>
                    <div className="flex flex-wrap gap-1">
                      {teacher.subjects.map(subject => (
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Select Class <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedClassId}
                onChange={(e) => onClassChange(e.target.value)}
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

            {/* Role selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Assignment Role <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { value: 'substantive', label: 'Substantive' },
                    { value: 'tp', label: 'Teaching Practice' },
                    { value: 'leave-cover', label: 'Leave Cover' },
                  ] as Array<{ value: AssignmentRoleType; label: string }>
                ).map(opt => {
                  const active = roleType === opt.value;
                  const activeCls =
                    opt.value === 'substantive'
                      ? 'bg-slate-600 text-white border-slate-600'
                      : opt.value === 'tp'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-rose-600 text-white border-rose-600';
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onRoleTypeChange?.(opt.value)}
                      className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                        active
                          ? activeCls
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {isCoverRole && (
                <p className="mt-2 text-xs text-rose-700 flex items-start gap-1.5">
                  <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>
                    {assignAsFormTeacher ? (
                      <>
                        While this cover is active, this teacher holds{' '}
                        <span className="font-medium">operational authority</span> for the
                        form-teacher slot. The primary form teacher keeps the role and takes
                        over automatically at the end date.
                      </>
                    ) : roleType === 'tp' ? (
                      <>
                        This is a teaching practice placement. While active, the TP teacher
                        has operational authority. Authority returns to the primary teacher
                        automatically at the end date.
                      </>
                    ) : (
                      <>
                        While this cover is active, the primary teacher keeps ownership.
                        They will be shown as <span className="font-medium">covered</span> on
                        their dashboard and cannot act on the class. Authority returns to
                        them automatically at the end date.
                      </>
                    )}
                  </span>
                </p>
              )}
            </div>

            {/* Start / End date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => onStartDateChange?.(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  End Date {endDateRequired && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => onEndDateChange?.(e.target.value)}
                  min={startDate || undefined}
                  className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    endDateMissing ? 'border-rose-300 bg-rose-50' : 'border-gray-300'
                  }`}
                />
                {endDateMissing && (
                  <p className="mt-1 text-[11px] text-rose-700">
                    End date is required for cover assignments.
                  </p>
                )}
              </div>
            </div>

            {teacher && selectedClassId && (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  Subjects to Teach
                  <span className="text-xs text-gray-500 ml-2">
                    (optional if assigning as Form Teacher only)
                  </span>
                </label>

                {selectedSubjects.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-medium text-gray-500">Selected subjects:</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedSubjects.map(subject => (
                        <span
                          key={subject}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-lg text-sm"
                        >
                          {subject}
                          <button
                            onClick={() => onRemoveSubject(subject)}
                            className="hover:bg-blue-200 rounded p-0.5"
                          >
                            <X size={14} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {teacher.subjects && teacher.subjects.length > 0 && (
                  <div className="flex gap-2">
                    <select
                      value={currentSubject}
                      onChange={(e) => onSubjectChange(e.target.value)}
                      className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg 
                               focus:ring-2 focus:ring-blue-500 focus:border-transparent
                               text-sm bg-white hover:border-gray-400 transition-colors"
                    >
                      <option value="">Choose a subject...</option>
                      {teacher.subjects
                        .filter(subject => !selectedSubjects.includes(subject))
                        .map(subject => (
                          <option key={subject} value={subject}>
                            {subject}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={onAddSubject}
                      disabled={!currentSubject}
                      className="px-4 py-2.5 bg-blue-600 text-white rounded-lg 
                               hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                               flex items-center gap-1 transition-colors"
                    >
                      <Plus size={16} /> Add
                    </button>
                  </div>
                )}

                {(!teacher.subjects || teacher.subjects.length === 0) && (
                  <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                    <AlertCircle size={12} />
                    This teacher has no subjects listed. They can only be assigned as Form
                    Teacher.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <input
                type="checkbox"
                id="formTeacher"
                checked={assignAsFormTeacher}
                onChange={(e) => onFormTeacherChange(e.target.checked)}
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

            {teacher && selectedClassId && (
              <div className="bg-blue-50 rounded-lg p-3 text-xs">
                <p className="font-medium text-blue-800 mb-1">Assignment Summary:</p>
                <ul className="space-y-1 text-blue-700">
                  <li>• Class: {classes.find(c => c.id === selectedClassId)?.name}</li>
                  {selectedSubjects.length > 0 && (
                    <li>• Teaching: {selectedSubjects.join(', ')}</li>
                  )}
                  <li>
                    • Role: <span className="font-medium">{roleType}</span>
                  </li>
                  {startDate && <li>• From: {startDate}</li>}
                  {endDate && <li>• Until: {endDate}</li>}
                  {assignAsFormTeacher && (
                    <li>
                      • Form Teacher{' '}
                      {selectedSubjects.length > 0 ? '(in addition to subjects)' : '(only)'}
                    </li>
                  )}
                  {!assignAsFormTeacher && selectedSubjects.length === 0 && (
                    <li className="text-amber-700">⚠️ No role selected</li>
                  )}
                </ul>
              </div>
            )}

            <div className="pt-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={onAssign}
                  disabled={!canAssign}
                  className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isAssigning ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <UserCheck size={16} />
                  )}
                  {isAssigning ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== EDIT TEACHER MODAL ====================
export const EditTeacherModal: React.FC<{
  isOpen: boolean;
  teacher: Teacher | null;
  editData: {
    name: string;
    email: string;
    phone: string;
    department: string;
    subjects: string[];
    newSubject: string;
  };
  isUpdating: boolean;
  onDataChange: (data: any) => void;
  onAddSubject: () => void;
  onRemoveSubject: (subject: string) => void;
  onSave: () => void;
  onClose: () => void;
}> = ({ isOpen, teacher, editData, isUpdating, onDataChange, onAddSubject, onRemoveSubject, onSave, onClose }) => {
  if (!isOpen || !teacher) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
          <div className="p-5 sm:p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-gray-900 truncate">Edit Teacher</h2>
                <p className="text-sm text-gray-600 mt-1">Update teacher information</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editData.name}
                onChange={(e) => onDataChange({ ...editData, name: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={editData.email}
                onChange={(e) => onDataChange({ ...editData, email: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
              <input
                type="tel"
                value={editData.phone}
                onChange={(e) => onDataChange({ ...editData, phone: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Department</label>
              <input
                type="text"
                value={editData.department}
                onChange={(e) => onDataChange({ ...editData, department: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Subjects Taught
              </label>

              {editData.subjects.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {editData.subjects.map(subject => (
                    <span
                      key={subject}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-sm"
                    >
                      {subject}
                      <button
                        onClick={() => onRemoveSubject(subject)}
                        className="hover:bg-blue-200 rounded p-0.5"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={editData.newSubject}
                  onChange={(e) => onDataChange({ ...editData, newSubject: e.target.value })}
                  placeholder="Enter subject"
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                <button
                  onClick={onAddSubject}
                  disabled={!editData.newSubject}
                  className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <Plus size={16} /> Add
                </button>
              </div>
            </div>

            <div className="pt-4 grid grid-cols-2 gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={onSave}
                disabled={isUpdating}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isUpdating ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Save size={16} />
                )}
                {isUpdating ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== DELETE TEACHER MODAL ====================
export const DeleteTeacherModal: React.FC<{
  isOpen: boolean;
  teacher: Teacher | null;
  isDeleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ isOpen, teacher, isDeleting, onConfirm, onClose }) => {
  if (!isOpen || !teacher) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <AlertCircle className="text-red-600" size={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Delete Teacher</h2>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to permanently delete{' '}
              <span className="font-semibold">{teacher.name}</span>? This action cannot be
              undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Trash2 size={16} />
                )}
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== REMOVE SUBJECT MODAL ====================
export const RemoveSubjectModal: React.FC<{
  isOpen: boolean;
  teacher: Teacher | null;
  className: string;
  subject: string;
  isRemoving: boolean;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ isOpen, teacher, className, subject, isRemoving, onConfirm, onClose }) => {
  if (!isOpen || !teacher) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center w-16 h-16 bg-yellow-100 rounded-full mb-4">
              <XCircle className="text-yellow-600" size={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Remove Subject</h2>
            <p className="text-sm text-gray-600 mb-6">
              Remove <span className="font-semibold">{subject}</span> from{' '}
              <span className="font-semibold">{teacher.name}</span>'s assignments in{' '}
              {className}?
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={isRemoving}
                className="flex-1 px-4 py-2.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isRemoving ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <X size={16} />
                )}
                {isRemoving ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== TRANSFER TEACHER MODAL ====================
export const TransferTeacherModal: React.FC<{
  isOpen: boolean;
  teacher: Teacher | null;
  sourceClassId: string;
  sourceClassName: string;
  classes: any[];
  targetClassId: string;
  isTransferring: boolean;
  onTargetClassChange: (classId: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}> = ({
  isOpen,
  teacher,
  sourceClassId,
  sourceClassName,
  classes,
  targetClassId,
  isTransferring,
  onTargetClassChange,
  onConfirm,
  onClose,
}) => {
  if (!isOpen || !teacher) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
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
                value={sourceClassName}
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
                onChange={(e) => onTargetClassChange(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="">Select target class...</option>
                {classes
                  .filter(c => c.id !== sourceClassId)
                  .map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} • Year {cls.year} • {cls.students} learners
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={!targetClassId || isTransferring}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isTransferring ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <ArrowRight size={16} />
                )}
                {isTransferring ? 'Transferring...' : 'Transfer'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== BULK REMOVE MODAL ====================
export const BulkRemoveModal: React.FC<{
  isOpen: boolean;
  teacher: Teacher | null;
  assignments: any[];
  classes: any[];
  isLoading: boolean;
  onConfirm: (selectedClassIds: string[]) => void;
  onClose: () => void;
}> = ({ isOpen, teacher, assignments, classes, isLoading, onConfirm, onClose }) => {
  const [selectedClasses, setSelectedClasses] = React.useState<string[]>([]);
  const [selectAll, setSelectAll] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) {
      setSelectedClasses([]);
      setSelectAll(false);
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (assignments.length > 0 && selectedClasses.length === assignments.length) {
      setSelectAll(true);
    } else {
      setSelectAll(false);
    }
  }, [selectedClasses, assignments]);

  if (!isOpen || !teacher) return null;

  const getClassName = (classId: string) =>
    classes.find(c => c.id === classId)?.name || 'Unknown Class';

  const handleSelectAll = () => {
    if (selectAll) setSelectedClasses([]);
    else setSelectedClasses(assignments.map(a => a.classId));
  };

  const toggleClass = (classId: string) => {
    if (selectedClasses.includes(classId)) {
      setSelectedClasses(selectedClasses.filter(id => id !== classId));
    } else {
      setSelectedClasses([...selectedClasses, classId]);
    }
  };

  if (assignments.length === 0) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
        <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                <Info size={32} className="text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">No Assignments Found</h2>
              <p className="text-sm text-gray-600 mb-6">
                {teacher.name} is not assigned to any classes.
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
          <div className="p-5 sm:p-6 border-b border-gray-200">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-gray-900 truncate">Remove Assignments</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Select classes to remove {teacher.name} from
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

          <div className="p-5 sm:p-6 max-h-96 overflow-y-auto">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
              <div className="flex gap-2">
                <AlertTriangle size={18} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-700">
                  This will remove the teacher from selected classes, including all subjects
                  they teach and form teacher status.
                </p>
              </div>
            </div>

            {assignments.length > 1 && (
              <div className="mb-3 flex items-center">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-medium text-gray-700">
                    Select All ({assignments.length})
                  </span>
                </label>
              </div>
            )}

            <div className="space-y-2">
              {assignments.map(assignment => {
                const className = getClassName(assignment.classId);
                return (
                  <label
                    key={assignment.classId}
                    className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedClasses.includes(assignment.classId)}
                      onChange={() => toggleClass(assignment.classId)}
                      className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <GraduationCap size={14} className="text-gray-400" />
                        <span className="font-medium text-gray-900">{className}</span>
                        {assignment.isFormTeacher && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                            Form Teacher
                          </span>
                        )}
                      </div>
                      {assignment.subjects && assignment.subjects.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1 ml-6">
                          Subjects: {assignment.subjects.join(', ')}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            {selectedClasses.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-700">
                  Selected {selectedClasses.length} class
                  {selectedClasses.length !== 1 ? 'es' : ''}
                </p>
              </div>
            )}
          </div>

          <div className="p-5 sm:p-6 border-t border-gray-200 bg-gray-50">
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirm(selectedClasses)}
                disabled={selectedClasses.length === 0 || isLoading}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    Removing...
                  </>
                ) : (
                  <>
                    <Layers size={16} />
                    Remove {selectedClasses.length > 0 ? `(${selectedClasses.length})` : ''}
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

// ==================== OVERLAPPING SLOTS MODAL ====================
//
// Shows every (class, subject) slot that has MORE THAN ONE non-ended
// assignment attached — i.e. every slot with more than one teacher on it.
//
// Includes a Resolve flow: pick one teacher to keep, end the rest.

interface OverlappingSlotEntry {
  classId: string;
  className: string;
  subject: string;
  normalizedSubjectId: string;
  assignments: any[]; // TeacherAssignment[]
}

const OVERLAP_ROLE_LABELS: Record<string, string> = {
  substantive: 'Substantive',
  tp: 'TP',
  'leave-cover': 'Leave cover',
};

const OVERLAP_ROLE_CLASSES: Record<string, string> = {
  substantive: 'bg-slate-100 text-slate-700 border-slate-200',
  tp: 'bg-amber-50 text-amber-700 border-amber-200',
  'leave-cover': 'bg-rose-50 text-rose-700 border-rose-200',
};

const OVERLAP_STATUS_CLASSES: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  suspended: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  ended: 'bg-gray-100 text-gray-500 border-gray-200',
};

export const OverlappingSlotsModal: React.FC<{
  isOpen: boolean;
  slots: OverlappingSlotEntry[];
  isLoading: boolean;
  isResolving?: boolean;
  onClose: () => void;
  onResolve?: (params: {
    slot: OverlappingSlotEntry;
    keepAssignmentId: string;
  }) => void | Promise<void>;
}> = ({ isOpen, slots, isLoading, isResolving = false, onClose, onResolve }) => {
  const [resolvingSlotKey, setResolvingSlotKey] = React.useState<string | null>(null);
  const [pickedAssignmentId, setPickedAssignmentId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) {
      setResolvingSlotKey(null);
      setPickedAssignmentId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const totalTeachers = slots.reduce((sum, s) => sum + s.assignments.length, 0);

  const brokenSlots = slots.filter(
    s => s.assignments.filter((a: any) => a.status === 'active').length > 1
  );

  const startResolve = (slot: OverlappingSlotEntry) => {
    const key = `${slot.classId}::${slot.normalizedSubjectId}`;
    setResolvingSlotKey(key);
    const substantive = slot.assignments.find((a: any) => a.roleType === 'substantive');
    setPickedAssignmentId(substantive?.id ?? slot.assignments[0]?.id ?? null);
  };

  const cancelResolve = () => {
    setResolvingSlotKey(null);
    setPickedAssignmentId(null);
  };

  const confirmResolve = async (slot: OverlappingSlotEntry) => {
    if (!pickedAssignmentId || !onResolve) return;
    await onResolve({ slot, keepAssignmentId: pickedAssignmentId });
    cancelResolve();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-gray-200">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <UserCog size={20} className="text-rose-600" />
                  Shared Class/Subject Slots
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {isLoading
                    ? 'Loading…'
                    : slots.length === 0
                    ? 'No slots have multiple teachers assigned.'
                    : `${slots.length} slot${slots.length === 1 ? '' : 's'} with ${totalTeachers} total assignment${totalTeachers === 1 ? '' : 's'} across them.`}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>

            {!isLoading && brokenSlots.length > 0 && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
                <AlertTriangle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">
                  <span className="font-semibold">Attention:</span> {brokenSlots.length}{' '}
                  slot{brokenSlots.length === 1 ? '' : 's'} have more than one{' '}
                  <span className="font-semibold">active</span> teacher. Use{' '}
                  <span className="font-semibold">Resolve</span> to pick who keeps the slot.
                </p>
              </div>
            )}
          </div>

          {/* Body */}
          <div className="p-5 sm:p-6 overflow-y-auto flex-1">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <Loader2 size={28} className="animate-spin mb-3 text-blue-600" />
                Loading assignments…
              </div>
            ) : slots.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={32} className="text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  All slots are clean
                </h3>
                <p className="text-sm text-gray-500">
                  Every class/subject slot has exactly one substantive teacher
                  (possibly suspended while a cover is active).
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {slots.map((slot) => {
                  const slotKey = `${slot.classId}::${slot.normalizedSubjectId}`;
                  const activeCount = slot.assignments.filter(
                    (a: any) => a.status === 'active'
                  ).length;
                  const isBroken = activeCount > 1;
                  const isPicking = resolvingSlotKey === slotKey;

                  return (
                    <div
                      key={slotKey}
                      className={`border rounded-xl p-4 ${
                        isBroken
                          ? 'border-red-300 bg-red-50/40'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      {/* Slot header */}
                      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                        <div>
                          <h3 className="font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                            <GraduationCap size={16} className="text-indigo-600" />
                            <span>{slot.className}</span>
                            <span className="text-gray-400">•</span>
                            <span className="text-gray-700">{slot.subject}</span>
                          </h3>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {slot.assignments.length} teacher
                            {slot.assignments.length === 1 ? '' : 's'} attached
                            {isBroken && (
                              <span className="text-red-600 font-semibold">
                                {' '}
                                — {activeCount} are simultaneously ACTIVE
                              </span>
                            )}
                          </p>
                        </div>

                        {onResolve && !isPicking && (
                          <button
                            onClick={() => startResolve(slot)}
                            disabled={isResolving}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Pick one teacher to keep; end the rest"
                          >
                            <UserCog size={14} /> Resolve
                          </button>
                        )}
                      </div>

                      {/* Teacher rows OR picker */}
                      {!isPicking ? (
                        <div className="space-y-2">
                          {slot.assignments.map((a: any) => {
                            const roleCls =
                              OVERLAP_ROLE_CLASSES[a.roleType] ||
                              'bg-gray-100 text-gray-700 border-gray-200';
                            const statusCls =
                              OVERLAP_STATUS_CLASSES[a.status] ||
                              'bg-gray-100 text-gray-700 border-gray-200';

                            return (
                              <div
                                key={a.id}
                                className="flex flex-wrap items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm"
                              >
                                <User size={14} className="text-gray-400 flex-shrink-0" />
                                <span className="font-medium text-gray-900">
                                  {a.teacherName || a.teacherId}
                                </span>

                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${roleCls}`}
                                >
                                  {OVERLAP_ROLE_LABELS[a.roleType] || a.roleType}
                                </span>

                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${statusCls}`}
                                >
                                  {a.status || 'active'}
                                </span>

                                {(a.roleType === 'leave-cover' || a.roleType === 'tp') &&
                                  (a.endDate ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                                      <Clock size={11} />
                                      Until {new Date(a.endDate).toLocaleDateString()}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                                      <Clock size={11} />
                                      Open-ended
                                    </span>
                                  ))}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-2 border-t border-rose-200 pt-3">
                          <p className="text-xs font-medium text-gray-700">
                            Pick the teacher who keeps{' '}
                            <span className="font-semibold">
                              {slot.subject} — {slot.className}
                            </span>
                            . The others will be ended.
                          </p>

                          <div className="space-y-1.5">
                            {slot.assignments.map((a: any) => {
                              const checked = pickedAssignmentId === a.id;
                              const roleCls =
                                OVERLAP_ROLE_CLASSES[a.roleType] ||
                                'bg-gray-100 text-gray-700 border-gray-200';
                              const statusCls =
                                OVERLAP_STATUS_CLASSES[a.status] ||
                                'bg-gray-100 text-gray-700 border-gray-200';

                              return (
                                <label
                                  key={a.id}
                                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                                    checked
                                      ? 'border-blue-300 bg-blue-50'
                                      : 'border-gray-200 bg-white hover:bg-gray-50'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`resolve-${slotKey}`}
                                    checked={checked}
                                    onChange={() => setPickedAssignmentId(a.id)}
                                    className="text-blue-600 focus:ring-blue-500"
                                  />
                                  <User size={14} className="text-gray-400 flex-shrink-0" />
                                  <span className="font-medium text-gray-900">
                                    {a.teacherName || a.teacherId}
                                  </span>
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${roleCls}`}
                                  >
                                    {OVERLAP_ROLE_LABELS[a.roleType] || a.roleType}
                                  </span>
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${statusCls}`}
                                  >
                                    {a.status || 'active'}
                                  </span>
                                </label>
                              );
                            })}
                          </div>

                          <div className="flex justify-end gap-2 pt-2">
                            <button
                              onClick={cancelResolve}
                              disabled={isResolving}
                              className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => confirmResolve(slot)}
                              disabled={!pickedAssignmentId || isResolving}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isResolving ? (
                                <>
                                  <Loader2 size={12} className="animate-spin" />
                                  Resolving…
                                </>
                              ) : (
                                <>
                                  <CheckCircle size={12} /> Keep this teacher
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-5 sm:p-6 border-t border-gray-200 bg-gray-50 flex justify-end">
            <button
              onClick={onClose}
              disabled={isResolving}
              className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium transition-colors text-sm disabled:opacity-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};