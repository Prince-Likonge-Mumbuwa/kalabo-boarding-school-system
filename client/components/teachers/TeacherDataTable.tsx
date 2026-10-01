// client/components/teachers/TeacherDataTable.tsx
import React, { useMemo } from 'react';
import {
  User,
  Mail,
  Phone,
  CheckCircle,
  PowerOff,
  XCircle,
  RefreshCw,
  Star,
  Edit,
  Trash2,
  GraduationCap,
  Layers,
  Users,
  Clock,
  UserCog,
} from 'lucide-react';
import { Teacher } from '@/types/teachers';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';
import type {
  TeacherAssignment,
  AssignmentRoleType,
} from '@/types/school';

// ==================== PROPS ====================

interface TeacherDataTableProps {
  teachers: Teacher[];
  classes: any[];
  isUserAdmin: boolean;
  onEdit: (teacher: Teacher) => void;
  onDelete: (teacher: Teacher) => void;
  onAssign: (teacher: Teacher) => void;
  onBulkRemove: (teacher: Teacher) => void;
  onViewLearners: (classId?: string) => void;

  // NEW — optional. When provided, the Role column shows an "End cover"
  // button on cover rows. When omitted, the Role column is informational only.
  onEndCover?: (assignment: TeacherAssignment) => void;
}

// ==================== HELPERS ====================

const getStatusIcon = (status: string = 'active') => {
  switch (status) {
    case 'active':
      return <CheckCircle size={16} className="text-green-600" />;
    case 'inactive':
      return <PowerOff size={16} className="text-gray-600" />;
    case 'on_leave':
      return <XCircle size={16} className="text-yellow-600" />;
    case 'transferred':
      return <RefreshCw size={16} className="text-blue-600" />;
    default:
      return <CheckCircle size={16} className="text-green-600" />;
  }
};

/**
 * Legacy + new shape tolerant class-name extractor.
 *  - `assignment.className` (new TeacherAssignment shape) — preferred
 *  - `assignment.name` / `assignment.className` (Class object) — fallback
 */
const extractClassNames = (teacher: Teacher): string => {
  if (!teacher.assignedClasses || !Array.isArray(teacher.assignedClasses)) return 'None';
  const names = teacher.assignedClasses
    .map((c: any) => c?.className || c?.name)
    .filter(Boolean);
  return names.length > 0 ? names.join(', ') : 'None';
};

/**
 * Extract the first class ID from the teacher's assigned classes,
 * for the "View learners" link.
 */
const extractFirstClassId = (teacher: Teacher): string | undefined => {
  if (!teacher.assignedClasses || !Array.isArray(teacher.assignedClasses)) return undefined;
  const first = teacher.assignedClasses[0];
  return first?.classId || first?.id || undefined;
};

const ROLE_LABELS: Record<AssignmentRoleType, string> = {
  substantive: 'Substantive',
  tp: 'TP',
  'leave-cover': 'Leave cover',
};

const ROLE_BADGE_CLASSES: Record<AssignmentRoleType, string> = {
  substantive: 'bg-slate-100 text-slate-700 border-slate-200',
  tp: 'bg-amber-50 text-amber-700 border-amber-200',
  'leave-cover': 'bg-rose-50 text-rose-700 border-rose-200',
};

// ==================== ROW (with per-teacher assignment fetch) ====================

const TeacherRow: React.FC<{
  teacher: Teacher;
  isUserAdmin: boolean;
  onEdit: (teacher: Teacher) => void;
  onDelete: (teacher: Teacher) => void;
  onAssign: (teacher: Teacher) => void;
  onBulkRemove: (teacher: Teacher) => void;
  onViewLearners: (classId?: string) => void;
  onEndCover?: (assignment: TeacherAssignment) => void;
}> = ({
  teacher,
  isUserAdmin,
  onEdit,
  onDelete,
  onAssign,
  onBulkRemove,
  onViewLearners,
  onEndCover,
}) => {
  // Per-row hook — only active + suspended rows, no ended history.
  const { assignments = [], isLoading } = useTeacherAssignments(teacher.id);

  // Summary: how many of each role, plus whether any cover is active right now.
  const roleSummary = useMemo(() => {
    const counts: Record<AssignmentRoleType, number> = {
      substantive: 0,
      tp: 0,
      'leave-cover': 0,
    };
    let onCover = false;

    for (const a of assignments) {
      if (a.status === 'ended') continue;
      counts[a.roleType] = (counts[a.roleType] || 0) + 1;
      if ((a.roleType === 'tp' || a.roleType === 'leave-cover') && a.status === 'active') {
        onCover = true;
      }
    }
    return { counts, onCover };
  }, [assignments]);

  // Active cover assignments on this teacher, used to render End Cover buttons.
  const coverAssignments = useMemo(
    () =>
      assignments.filter(
        (a) =>
          (a.roleType === 'tp' || a.roleType === 'leave-cover') && a.status === 'active'
      ),
    [assignments]
  );

  const firstClassId = extractFirstClassId(teacher);

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      {/* Teacher */}
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <div className="flex-shrink-0 h-10 w-10 bg-gradient-to-br from-blue-50 to-blue-100 rounded-full flex items-center justify-center">
            <User size={18} className="text-blue-600" />
          </div>
          <div className="ml-4">
            <div className="text-sm font-medium text-gray-900">{teacher.name}</div>
            <div className="text-xs text-gray-500">NRC: {teacher.nrc || 'N/A'}</div>
          </div>
        </div>
      </td>

      {/* Contact */}
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900 flex items-center gap-1.5">
          <Mail size={12} className="text-gray-400" />
          {teacher.email}
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
          <Phone size={12} className="text-gray-400" />
          {teacher.phone || 'No phone'}
        </div>
      </td>

      {/* Status */}
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          {getStatusIcon(teacher.status)}
          <span className="text-sm capitalize text-gray-900">
            {teacher.status?.replace('_', ' ') || 'active'}
          </span>
        </div>
        {roleSummary.onCover && (
          <div className="flex items-center gap-1 mt-1 text-[11px] text-rose-600">
            <Clock size={10} />
            On cover
          </div>
        )}
      </td>

      {/* Role summary — NEW */}
      <td className="px-6 py-4 whitespace-nowrap">
        {isLoading && assignments.length === 0 ? (
          <span className="text-xs text-gray-400">Loading…</span>
        ) : (
          <div className="flex flex-wrap gap-1 max-w-[220px]">
            {(['substantive', 'tp', 'leave-cover'] as AssignmentRoleType[]).map((r) => {
              const n = roleSummary.counts[r];
              if (!n) return null;
              const cls = ROLE_BADGE_CLASSES[r];
              return (
                <span
                  key={r}
                  className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${cls}`}
                  title={`${n} ${ROLE_LABELS[r]} assignment${n === 1 ? '' : 's'}`}
                >
                  {n} {ROLE_LABELS[r]}
                </span>
              );
            })}
            {coverAssignments.length > 0 && isUserAdmin && onEndCover && (
              <button
                onClick={() => onEndCover(coverAssignments[0])}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors"
                title={
                  coverAssignments.length === 1
                    ? 'End this cover'
                    : `End first cover (${coverAssignments.length} total)`
                }
              >
                <UserCog size={10} /> End cover
              </button>
            )}
            {!roleSummary.counts.substantive &&
              !roleSummary.counts.tp &&
              !roleSummary.counts['leave-cover'] && (
                <span className="text-xs text-gray-400">No active roles</span>
              )}
          </div>
        )}
      </td>

      {/* Department */}
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {teacher.department || '-'}
      </td>

      {/* Assigned Classes */}
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900 max-w-xs truncate">
          {extractClassNames(teacher)}
        </div>
        {teacher.assignedClasses && teacher.assignedClasses.length > 0 && (
          <button
            onClick={() => onViewLearners(firstClassId)}
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1"
          >
            <Users size={12} />
            View learners
          </button>
        )}
      </td>

      {/* Form Teacher */}
      <td className="px-6 py-4 whitespace-nowrap">
        {teacher.isFormTeacher ? (
          <div className="flex items-center gap-1 text-purple-600">
            <Star size={14} className="fill-purple-600" />
            <span className="text-sm">Yes</span>
          </div>
        ) : (
          <span className="text-sm text-gray-400">No</span>
        )}
      </td>

      {/* Actions */}
      {isUserAdmin && (
        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => onEdit(teacher)}
              className="text-blue-600 hover:text-blue-900 p-1 hover:bg-blue-50 rounded"
              title="Edit teacher"
            >
              <Edit size={16} />
            </button>
            <button
              onClick={() => onAssign(teacher)}
              className="text-green-600 hover:text-green-900 p-1 hover:bg-green-50 rounded"
              title="Assign to class"
            >
              <GraduationCap size={16} />
            </button>
            <button
              onClick={() => onBulkRemove(teacher)}
              className="text-orange-600 hover:text-orange-900 p-1 hover:bg-orange-50 rounded"
              title="Bulk remove assignments"
            >
              <Layers size={16} />
            </button>
            <button
              onClick={() => onDelete(teacher)}
              className="text-red-600 hover:text-red-900 p-1 hover:bg-red-50 rounded"
              title="Delete teacher"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
};

// ==================== TABLE ====================

export const TeacherDataTable: React.FC<TeacherDataTableProps> = ({
  teachers,
  classes,
  isUserAdmin,
  onEdit,
  onDelete,
  onAssign,
  onBulkRemove,
  onViewLearners,
  onEndCover,
}) => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Teacher
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Contact
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Roles
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Department
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Assigned Classes
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Form Teacher
              </th>
              {isUserAdmin && (
                <th
                  scope="col"
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {teachers.map((teacher) => (
              <TeacherRow
                key={teacher.id}
                teacher={teacher}
                isUserAdmin={isUserAdmin}
                onEdit={onEdit}
                onDelete={onDelete}
                onAssign={onAssign}
                onBulkRemove={onBulkRemove}
                onViewLearners={onViewLearners}
                onEndCover={onEndCover}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};