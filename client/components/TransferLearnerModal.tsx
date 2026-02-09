import { useState, useEffect, useMemo } from 'react';
import {
  X,
  ArrowRightLeft,
  Search,
  Users,
  Loader2,
  AlertCircle,
  ChevronRight
} from 'lucide-react';
import { Class, Learner } from '@/types/school';
import { useDebounce } from '@/hooks/useDebounce';

interface TransferLearnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  learner: Learner | null;
  classes: Class[];
  currentClassId: string;
  onTransfer: (learnerId: string, fromClassId: string, toClassId: string) => Promise<void>;
  isLoading?: boolean; // Add this prop
}

export const TransferLearnerModal = ({
  isOpen,
  onClose,
  learner,
  classes,
  currentClassId,
  onTransfer,
  isLoading = false // Default value
}: TransferLearnerModalProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [error, setError] = useState('');

  const debouncedSearch = useDebounce(searchTerm, 300);

  // Filter available classes (excluding current class and archived classes)
  const availableClasses = useMemo(() => {
    return classes.filter(cls => 
      cls.id !== currentClassId && 
      cls.isActive &&
      (cls.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
       cls.id.toLowerCase().includes(debouncedSearch.toLowerCase()))
    );
  }, [classes, currentClassId, debouncedSearch]);

  // Sort classes by type and level
  const sortedClasses = useMemo(() => {
    return [...availableClasses].sort((a, b) => {
      // First sort by type
      if (a.type !== b.type) {
        return a.type === 'grade' ? -1 : 1;
      }
      // Then by level
      if (a.level !== b.level) {
        return a.level - b.level;
      }
      // Then by section
      return a.section.localeCompare(b.section);
    });
  }, [availableClasses]);

  const handleTransfer = async () => {
    if (!learner || !selectedClassId) return;

    setError('');

    try {
      await onTransfer(learner.id, currentClassId, selectedClassId);
      setSelectedClassId('');
      setSearchTerm('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to transfer learner. Please try again.');
    }
  };

  const getClassTypeColor = (type: 'grade' | 'form') => {
    return type === 'grade' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800';
  };

  const getCurrentClass = () => {
    return classes.find(c => c.id === currentClassId);
  };

  const getSelectedClass = () => {
    return classes.find(c => c.id === selectedClassId);
  };

  // Reset when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedClassId('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen || !learner) return null;

  const currentClass = getCurrentClass();
  const selectedClass = getSelectedClass();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-2xl shadow-2xl">
          {/* Header */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Transfer Learner</h2>
                <p className="text-gray-600 mt-1">
                  Move {learner.name} to another class
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg"
                disabled={isLoading}
              >
                <X size={20} />
              </button>
            </div>
            
            {error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-start gap-2 mb-4">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Current Class Info */}
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Current Class</h3>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Users size={20} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{currentClass?.name || 'Unknown Class'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-gray-600">Year: {currentClass?.year}</span>
                      {currentClass && (
                        <span className={`text-xs px-2 py-1 rounded-full ${getClassTypeColor(currentClass.type)}`}>
                          {currentClass.type === 'grade' ? 'Grade' : 'Form'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Learner</p>
                  <p className="font-medium text-gray-900">{learner.name}</p>
                  <p className="text-xs text-gray-500">{learner.studentId}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Transfer To Section */}
          <div className="p-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Transfer To</h3>
            
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search classes by name or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
              />
            </div>

            {/* Classes Grid */}
            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
              {sortedClasses.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="mx-auto mb-3 text-gray-300" size={32} />
                  <p className="text-gray-600">No classes found</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {searchTerm ? 'Try a different search term' : 'All classes are archived or unavailable'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {sortedClasses.map((cls) => (
                    <button
                      key={cls.id}
                      onClick={() => setSelectedClassId(cls.id)}
                      disabled={isLoading}
                      className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${
                        selectedClassId === cls.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            selectedClassId === cls.id ? 'bg-blue-100' : 'bg-gray-100'
                          }`}>
                            <Users size={18} className={
                              selectedClassId === cls.id ? 'text-blue-600' : 'text-gray-600'
                            } />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900">{cls.name}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${getClassTypeColor(cls.type)}`}>
                                {cls.type === 'grade' ? 'Grade' : 'Form'}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                              <span>Year: {cls.year}</span>
                              <span>•</span>
                              <span>{cls.students} learners</span>
                            </div>
                          </div>
                        </div>
                        {selectedClassId === cls.id && (
                          <ChevronRight size={20} className="text-blue-600" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Class Preview */}
            {selectedClass && (
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="text-sm font-medium text-green-800 mb-2">Transfer Preview</h4>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-900">
                      <span className="font-medium">{learner.name}</span> will be moved from{' '}
                      <span className="font-medium">{currentClass?.name}</span> to{' '}
                      <span className="font-medium">{selectedClass.name}</span>
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      This change will be effective immediately
                    </p>
                  </div>
                  <ArrowRightLeft size={20} className="text-green-600" />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleTransfer}
                  disabled={!selectedClassId || isLoading}
                  className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center justify-center"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin mr-2" size={18} />
                      Transferring...
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="mr-2" size={18} />
                      Confirm Transfer
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};