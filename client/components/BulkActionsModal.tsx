// @/components/BulkActionsModal.tsx
import { X, Users, ArrowRight, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { Class } from '@/types/school';

interface BulkActionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTransfer: (targetClassId: string) => Promise<void>;
  classes: Class[];
  currentClass: Class;
  learnerCount: number;
  isLoading?: boolean;
}

export const BulkActionsModal = ({
  isOpen,
  onClose,
  onTransfer,
  classes,
  currentClass,
  learnerCount,
  isLoading = false
}: BulkActionsModalProps) => {
  const [targetClassId, setTargetClassId] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const otherClasses = classes.filter(c => c.id !== currentClass.id);

  const handleTransfer = async () => {
    if (!targetClassId) {
      setError('Please select a target class');
      return;
    }
    setError('');
    await onTransfer(targetClassId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">
            Transfer Learners
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg mb-4">
            <Users className="text-blue-600 flex-shrink-0" size={20} />
            <div>
              <p className="text-sm font-medium text-blue-900">
                Transfer {learnerCount} learner{learnerCount !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-blue-700">
                From: {currentClass.name}
              </p>
            </div>
          </div>

          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Target Class
          </label>
          
          <select
            value={targetClassId}
            onChange={(e) => {
              setTargetClassId(e.target.value);
              setError('');
            }}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Choose a class...</option>
            {otherClasses.map(cls => (
              <option key={cls.id} value={cls.id}>
                {cls.name} (Year {cls.year}) - {cls.students} learners
              </option>
            ))}
          </select>

          {error && (
            <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
              <AlertCircle size={14} />
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleTransfer}
            disabled={!targetClassId || isLoading}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              'Transferring...'
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
  );
};