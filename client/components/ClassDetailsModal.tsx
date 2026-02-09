import {
  X,
  UserPlus,
  Upload,
  Users,
  GraduationCap,
  ArrowRightLeft,
  ChevronRight
} from 'lucide-react';

interface ClassDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
  className: string;
  onAddLearners: () => void;
  onBulkImportLearners: () => void;
  onViewTeachers: () => void;
  onViewLearners: () => void;
  onTransferLearners: () => void;
}

export const ClassDetailsModal = ({ 
  isOpen, 
  onClose, 
  classId,
  className,
  onAddLearners,
  onBulkImportLearners,
  onViewTeachers,
  onViewLearners,
  onTransferLearners
}: ClassDetailsModalProps) => {
  if (!isOpen) return null;

  const actions = [
    {
      icon: UserPlus,
      label: 'Add Learners',
      description: 'Add individual learners to this class',
      onClick: onAddLearners,
      color: 'blue'
    },
    {
      icon: Upload,
      label: 'Bulk Import Learners',
      description: 'Import multiple learners via CSV',
      onClick: onBulkImportLearners,
      color: 'green'
    },
    {
      icon: Users,
      label: 'View Learners',
      description: 'See all learners in this class',
      onClick: onViewLearners,
      color: 'purple'
    },
    {
      icon: GraduationCap,
      label: 'View Teachers',
      description: 'See teachers assigned to this class',
      onClick: onViewTeachers,
      color: 'amber'
    },
    {
      icon: ArrowRightLeft,
      label: 'Transfer Learners',
      description: 'Move learners to another class',
      onClick: onTransferLearners,
      color: 'indigo'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Class Actions</h2>
                <p className="text-sm text-gray-600 mt-1">{className}</p>
                <p className="text-xs text-gray-400 mt-1">Class ID: {classId.slice(0, 8)}...</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 gap-3">
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={action.onClick}
                    className={`flex items-center gap-4 p-4 rounded-xl border hover:shadow-md transition-all duration-200 text-left ${
                      action.color === 'blue' ? 'border-blue-200 hover:border-blue-400' :
                      action.color === 'green' ? 'border-green-200 hover:border-green-400' :
                      action.color === 'purple' ? 'border-purple-200 hover:border-purple-400' :
                      action.color === 'amber' ? 'border-amber-200 hover:border-amber-400' :
                      'border-indigo-200 hover:border-indigo-400'
                    }`}
                  >
                    <div className={`p-3 rounded-lg ${
                      action.color === 'blue' ? 'bg-blue-50 text-blue-600' :
                      action.color === 'green' ? 'bg-green-50 text-green-600' :
                      action.color === 'purple' ? 'bg-purple-50 text-purple-600' :
                      action.color === 'amber' ? 'bg-amber-50 text-amber-600' :
                      'bg-indigo-50 text-indigo-600'
                    }`}>
                      <Icon size={20} />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{action.label}</p>
                      <p className="text-sm text-gray-500 mt-1">{action.description}</p>
                    </div>
                    <ChevronRight size={20} className="text-gray-400" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};