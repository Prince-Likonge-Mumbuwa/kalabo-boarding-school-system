// client/components/teachers/TeacherDataTable.tsx
import React from 'react';
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
  Users
} from 'lucide-react';
import { Teacher } from '@/types/teachers';

interface TeacherDataTableProps {
  teachers: Teacher[];
  classes: any[];
  isUserAdmin: boolean;
  onEdit: (teacher: Teacher) => void;
  onDelete: (teacher: Teacher) => void;
  onAssign: (teacher: Teacher) => void;
  onBulkRemove: (teacher: Teacher) => void;
  onViewLearners: (classId?: string) => void;
}

const getStatusIcon = (status: string = 'active') => {
  switch(status) {
    case 'active': return <CheckCircle size={16} className="text-green-600" />;
    case 'inactive': return <PowerOff size={16} className="text-gray-600" />;
    case 'on_leave': return <XCircle size={16} className="text-yellow-600" />;
    case 'transferred': return <RefreshCw size={16} className="text-blue-600" />;
    default: return <CheckCircle size={16} className="text-green-600" />;
  }
};

export const TeacherDataTable: React.FC<TeacherDataTableProps> = ({
  teachers,
  classes,
  isUserAdmin,
  onEdit,
  onDelete,
  onAssign,
  onBulkRemove,
  onViewLearners
}) => {
  const getClassNames = (teacher: Teacher) => {
    if (!teacher.assignedClasses || !Array.isArray(teacher.assignedClasses)) return 'None';
    return teacher.assignedClasses.map(c => c.name || c.className).join(', ') || 'None';
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Teacher
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Department
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Assigned Classes
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Form Teacher
              </th>
              {isUserAdmin && (
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {teachers.map((teacher) => (
              <tr key={teacher.id} className="hover:bg-gray-50 transition-colors">
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
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{teacher.email}</div>
                  <div className="text-xs text-gray-500">{teacher.phone || 'No phone'}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    {getStatusIcon(teacher.status)}
                    <span className="text-sm capitalize text-gray-900">
                      {teacher.status?.replace('_', ' ') || 'active'}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {teacher.department || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900 max-w-xs truncate">
                    {getClassNames(teacher)}
                  </div>
                  {teacher.assignedClasses && teacher.assignedClasses.length > 0 && (
                    <button
                      onClick={() => onViewLearners()}
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1"
                    >
                      <Users size={12} />
                      View learners
                    </button>
                  )}
                </td>
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};