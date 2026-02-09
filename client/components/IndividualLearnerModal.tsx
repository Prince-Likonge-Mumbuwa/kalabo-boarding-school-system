import { useState } from 'react';
import {
  X,
  User,
  Phone,
  Hash,
  Loader2,
  AlertCircle
} from 'lucide-react';

interface IndividualLearnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    age: number;
    parentPhone: string;
  }) => Promise<void>;
  className: string;
  isLoading?: boolean; // Add this prop
}

export const IndividualLearnerModal = ({
  isOpen,
  onClose,
  onSubmit,
  className,
  isLoading = false // Default to false
}: IndividualLearnerModalProps) => {
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    parentPhone: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    const age = parseInt(formData.age);
    if (!formData.age) {
      newErrors.age = 'Age is required';
    } else if (isNaN(age) || age < 5 || age > 25) {
      newErrors.age = 'Age must be between 5 and 25';
    }

    if (!formData.parentPhone) {
      newErrors.parentPhone = 'Parent phone number is required';
    } else if (!/^\d{10,15}$/.test(formData.parentPhone.replace(/\D/g, ''))) {
      newErrors.parentPhone = 'Enter a valid phone number (10-15 digits)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      await onSubmit({
        name: formData.name.trim(),
        age: parseInt(formData.age),
        parentPhone: formData.parentPhone
      });
      
      // Reset form on success
      setFormData({ name: '', age: '', parentPhone: '' });
      setErrors({});
      onClose();
    } catch (error) {
      console.error('Error adding learner:', error);
      setErrors({ submit: 'Failed to add learner. Please try again.' });
    }
  };

  const handlePhoneChange = (value: string) => {
    // Remove non-digits and limit length
    const digits = value.replace(/\D/g, '').slice(0, 15);
    setFormData(prev => ({ ...prev, parentPhone: digits }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl">
          {/* Header */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Add New Learner</h2>
                <p className="text-sm text-gray-600 mt-1">Class: {className}</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg"
                disabled={isLoading}
              >
                <X size={20} />
              </button>
            </div>
            
            {errors.submit && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-start gap-2 mb-4">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{errors.submit}</span>
              </div>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center gap-2">
                  <User size={16} className="text-gray-400" />
                  Full Name
                </div>
              </label>
              <input
                type="text"
                placeholder="John Banda"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.name ? 'border-red-300' : 'border-gray-300'
                }`}
                disabled={isLoading}
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center gap-2">
                  <Hash size={16} className="text-gray-400" />
                  Age
                </div>
              </label>
              <input
                type="number"
                min="5"
                max="25"
                placeholder="14"
                value={formData.age}
                onChange={(e) => setFormData(prev => ({ ...prev, age: e.target.value }))}
                className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.age ? 'border-red-300' : 'border-gray-300'
                }`}
                disabled={isLoading}
              />
              {errors.age && (
                <p className="mt-1 text-sm text-red-600">{errors.age}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center gap-2">
                  <Phone size={16} className="text-gray-400" />
                  Parent Phone Number
                </div>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                  +260
                </span>
                <input
                  type="tel"
                  placeholder="123 456 789"
                  value={formData.parentPhone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  className={`w-full pl-12 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    errors.parentPhone ? 'border-red-300' : 'border-gray-300'
                  }`}
                  disabled={isLoading}
                />
              </div>
              {errors.parentPhone && (
                <p className="mt-1 text-sm text-red-600">{errors.parentPhone}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Enter 10 digits without spaces or country code
              </p>
            </div>

            <div className="pt-4">
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
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center justify-center"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin mr-2" size={18} />
                      Adding...
                    </>
                  ) : (
                    'Add Learner'
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};