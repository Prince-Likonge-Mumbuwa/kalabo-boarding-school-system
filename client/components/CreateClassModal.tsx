import { useState } from 'react';
import {
  X,
  AlertCircle,
  Loader2
} from 'lucide-react';

interface CreateClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; year: number }) => Promise<void>;
  isLoading?: boolean;
}

export const CreateClassModal = ({ 
  isOpen, 
  onClose, 
  onCreate, 
  isLoading = false 
}: CreateClassModalProps) => {
  const [formData, setFormData] = useState({
    name: '',
    year: new Date().getFullYear(),
  });
  const [error, setError] = useState('');

  const validateClassName = (name: string): boolean => {
    const pattern = /^(Grade|Form)\s+\d+[A-Z]$/i;
    return pattern.test(name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateClassName(formData.name)) {
      setError('Invalid class name format. Use "Grade 8A" or "Form 3B"');
      return;
    }

    if (formData.year < 2000 || formData.year > 2100) {
      setError('Year must be between 2000 and 2100');
      return;
    }

    try {
      await onCreate(formData);
      setFormData({ name: '', year: new Date().getFullYear() });
      onClose();
    } catch (error: any) {
      setError(error.message || 'Failed to create class');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Create New Class</h2>
              <button 
                onClick={onClose}
                disabled={isLoading}
                className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                <AlertCircle className="inline mr-2" size={16} />
                {error}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Class Name
              </label>
              <input
                type="text"
                placeholder="Grade 8A or Form 3B"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                disabled={isLoading}
              />
              <p className="mt-1 text-xs text-gray-500">
                Format: "Grade 8A" or "Form 3B". Grade: 8-12, Form: 1-5
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Academic Year
              </label>
              <input
                type="number"
                min="2000"
                max="2100"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                disabled={isLoading}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center justify-center"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={20} />
                    Creating...
                  </>
                ) : (
                  'Create Class'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};