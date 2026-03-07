// @/components/EditClassModal.tsx
import { X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Class } from '@/types/school';

interface EditClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updates: Partial<Class>) => Promise<void>;
  classData: Class;
  isLoading?: boolean;
}

export const EditClassModal = ({
  isOpen,
  onClose,
  onUpdate,
  classData,
  isLoading = false
}: EditClassModalProps) => {
  const [name, setName] = useState(classData.name);
  const [year, setYear] = useState(classData.year);
  const [type, setType] = useState<'grade' | 'form'>(classData.type);
  const [level, setLevel] = useState(classData.level);
  const [section, setSection] = useState(classData.section);
  const [isActive, setIsActive] = useState(classData.isActive);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(classData.name);
      setYear(classData.year);
      setType(classData.type);
      setLevel(classData.level);
      setSection(classData.section);
      setIsActive(classData.isActive);
      setError('');
    }
  }, [isOpen, classData]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Class name is required');
      return;
    }

    try {
      setError('');
      await onUpdate({ 
        name: name.trim(), 
        year, 
        type, 
        level, 
        section, 
        isActive 
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update class');
    }
  };

  const generateNamePreview = () => {
    const typeStr = type === 'grade' ? 'Grade' : 'Form';
    return `${typeStr} ${level}${section}`;
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
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold">Edit Class</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Class Name Preview */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-600 mb-1">Class Name Preview</p>
            <p className="text-lg font-semibold text-blue-900">{generateNamePreview()}</p>
          </div>

          {/* Type Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Class Type
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setType('grade')}
                className={`flex-1 py-2.5 rounded-lg border transition-colors ${
                  type === 'grade'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Grade
              </button>
              <button
                type="button"
                onClick={() => setType('form')}
                className={`flex-1 py-2.5 rounded-lg border transition-colors ${
                  type === 'form'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Form
              </button>
            </div>
          </div>

          {/* Level and Section */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Level
              </label>
              <select
                value={level}
                onChange={(e) => setLevel(parseInt(e.target.value))}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {type === 'grade' ? (
                  Array.from({ length: 5 }, (_, i) => i + 8).map(l => (
                    <option key={l} value={l}>Grade {l}</option>
                  ))
                ) : (
                  Array.from({ length: 5 }, (_, i) => i + 1).map(l => (
                    <option key={l} value={l}>Form {l}</option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Section
              </label>
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {['A', 'B', 'C', 'D', 'E', 'F'].map(s => (
                  <option key={s} value={s}>Section {s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Year */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Academic Year
            </label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              min={2000}
              max={2100}
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Status Toggle */}
          <div className="mb-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Active Class</span>
                <p className="text-xs text-gray-500">Inactive classes are hidden from most views</p>
              </div>
            </label>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Updating...' : 'Update Class'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};