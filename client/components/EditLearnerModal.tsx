// @/components/EditLearnerModal.tsx
import { useState, useEffect } from 'react';
import {
  X,
  User,
  Phone,
  Hash,
  Loader2,
  AlertCircle,
  Users,
  MapPin,
  Calendar,
  HandHeart,
  Save
} from 'lucide-react';
import { Learner } from '@/types/school';

interface EditLearnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  learner: Learner;
  className: string;
  isLoading?: boolean;
}

export const EditLearnerModal = ({
  isOpen,
  onClose,
  onSubmit,
  learner,
  className,
  isLoading = false
}: EditLearnerModalProps) => {
  const currentYear = new Date().getFullYear();
  const [formData, setFormData] = useState({
    fullName: '',
    preferredName: '',
    address: '',
    dateOfFirstEntry: '',
    gender: '' as 'male' | 'female' | '',
    guardian: '',
    guardianPhone: '',
    alternativeGuardian: '',
    alternativeGuardianPhone: '',
    sponsor: '',
    birthYear: '' as number | '',
    previousSchool: '',
    medicalNotes: '',
    allergies: ''
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Load learner data when modal opens
  useEffect(() => {
    if (isOpen && learner) {
      setFormData({
        fullName: learner.fullName || learner.name || '',
        preferredName: learner.preferredName || '',
        address: learner.address || '',
        dateOfFirstEntry: learner.dateOfFirstEntry || '',
        gender: learner.gender || '',
        guardian: learner.guardian || '',
        guardianPhone: learner.guardianPhone || learner.parentPhone || '',
        alternativeGuardian: learner.alternativeGuardian || '',
        alternativeGuardianPhone: learner.alternativeGuardianPhone || '',
        sponsor: learner.sponsor || '',
        birthYear: learner.birthYear || '',
        previousSchool: learner.previousSchool || '',
        medicalNotes: learner.medicalNotes || '',
        allergies: learner.allergies ? learner.allergies.join(', ') : ''
      });
    }
  }, [isOpen, learner]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    }

    if (!formData.address.trim()) {
      newErrors.address = 'Address is required';
    }

    if (!formData.gender) {
      newErrors.gender = 'Please select gender';
    }

    if (!formData.guardian.trim()) {
      newErrors.guardian = 'Guardian name is required';
    }

    if (!formData.sponsor.trim()) {
      newErrors.sponsor = 'Sponsor name is required';
    }

    if (!formData.guardianPhone) {
      newErrors.guardianPhone = 'Guardian phone number is required';
    } else if (!/^\d{10,15}$/.test(formData.guardianPhone.replace(/\D/g, ''))) {
      newErrors.guardianPhone = 'Enter a valid phone number (10-15 digits)';
    }

    if (!formData.birthYear) {
      newErrors.birthYear = 'Birth year is required';
    } else if (formData.birthYear < 1990 || formData.birthYear > currentYear) {
      newErrors.birthYear = `Enter a valid year (1990-${currentYear})`;
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
      const allergiesArray = formData.allergies
        ? formData.allergies.split(',').map(a => a.trim()).filter(a => a)
        : [];

      await onSubmit({
        fullName: formData.fullName.trim(),
        preferredName: formData.preferredName.trim() || undefined,
        address: formData.address.trim(),
        gender: formData.gender as 'male' | 'female',
        guardian: formData.guardian.trim(),
        guardianPhone: formData.guardianPhone,
        alternativeGuardian: formData.alternativeGuardian.trim() || undefined,
        alternativeGuardianPhone: formData.alternativeGuardianPhone || undefined,
        sponsor: formData.sponsor.trim(),
        birthYear: formData.birthYear as number,
        previousSchool: formData.previousSchool.trim() || undefined,
        medicalNotes: formData.medicalNotes.trim() || undefined,
        allergies: allergiesArray
      });
    } catch (error) {
      console.error('Error updating learner:', error);
      setErrors({ submit: 'Failed to update learner. Please try again.' });
    }
  };

  const handlePhoneChange = (value: string, field: 'guardianPhone' | 'alternativeGuardianPhone') => {
    const digits = value.replace(/\D/g, '').slice(0, 15);
    setFormData(prev => ({ ...prev, [field]: digits }));
  };

  const handleBirthYearChange = (value: string) => {
    const num = parseInt(value);
    if (value === '' || (!isNaN(num) && num >= 1000 && num <= 9999)) {
      setFormData(prev => ({ ...prev, birthYear: value === '' ? '' : num }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-2xl shadow-2xl">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Edit Learner</h2>
                <p className="text-sm text-gray-600 mt-1">Class: {className}</p>
                {learner.studentId && (
                  <p className="text-xs font-mono text-gray-500 mt-1">
                    Student ID: {learner.studentId}
                  </p>
                )}
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
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-start gap-2 mt-4">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{errors.submit}</span>
              </div>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
            {/* Required Fields */}
            <div className="space-y-5">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <span className="w-1 h-4 bg-blue-600 rounded-full"></span>
                Basic Information
              </h3>

              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <div className="flex items-center gap-2">
                    <User size={16} className="text-gray-400" />
                    Full Name *
                  </div>
                </label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    errors.fullName ? 'border-red-300' : 'border-gray-300'
                  }`}
                  disabled={isLoading}
                />
                {errors.fullName && <p className="mt-1 text-sm text-red-600">{errors.fullName}</p>}
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="text-gray-400" />
                    Address *
                  </div>
                </label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  rows={2}
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${
                    errors.address ? 'border-red-300' : 'border-gray-300'
                  }`}
                  disabled={isLoading}
                />
                {errors.address && <p className="mt-1 text-sm text-red-600">{errors.address}</p>}
              </div>

              {/* Birth Year & Gender */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <div className="flex items-center gap-2">
                      <Hash size={16} className="text-gray-400" />
                      Birth Year *
                    </div>
                  </label>
                  <input
                    type="number"
                    min="1990"
                    max={currentYear}
                    value={formData.birthYear}
                    onChange={(e) => handleBirthYearChange(e.target.value)}
                    className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.birthYear ? 'border-red-300' : 'border-gray-300'
                    }`}
                    disabled={isLoading}
                  />
                  {errors.birthYear && <p className="mt-1 text-sm text-red-600">{errors.birthYear}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <div className="flex items-center gap-2">
                      <Users size={16} className="text-gray-400" />
                      Gender *
                    </div>
                  </label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value as 'male' | 'female' }))}
                    className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.gender ? 'border-red-300' : 'border-gray-300'
                    }`}
                    disabled={isLoading}
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                  {errors.gender && <p className="mt-1 text-sm text-red-600">{errors.gender}</p>}
                </div>
              </div>

              {/* Guardian & Sponsor */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <div className="flex items-center gap-2">
                      <User size={16} className="text-gray-400" />
                      Guardian Name *
                    </div>
                  </label>
                  <input
                    type="text"
                    value={formData.guardian}
                    onChange={(e) => setFormData(prev => ({ ...prev, guardian: e.target.value }))}
                    className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.guardian ? 'border-red-300' : 'border-gray-300'
                    }`}
                    disabled={isLoading}
                  />
                  {errors.guardian && <p className="mt-1 text-sm text-red-600">{errors.guardian}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <div className="flex items-center gap-2">
                      <HandHeart size={16} className="text-gray-400" />
                      Sponsor *
                    </div>
                  </label>
                  <input
                    type="text"
                    value={formData.sponsor}
                    onChange={(e) => setFormData(prev => ({ ...prev, sponsor: e.target.value }))}
                    className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.sponsor ? 'border-red-300' : 'border-gray-300'
                    }`}
                    disabled={isLoading}
                  />
                  {errors.sponsor && <p className="mt-1 text-sm text-red-600">{errors.sponsor}</p>}
                </div>
              </div>

              {/* Guardian Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <div className="flex items-center gap-2">
                    <Phone size={16} className="text-gray-400" />
                    Guardian Phone Number *
                  </div>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                    +26
                  </span>
                  <input
                    type="tel"
                    value={formData.guardianPhone}
                    onChange={(e) => handlePhoneChange(e.target.value, 'guardianPhone')}
                    className={`w-full pl-12 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.guardianPhone ? 'border-red-300' : 'border-gray-300'
                    }`}
                    disabled={isLoading}
                  />
                </div>
                {errors.guardianPhone && (
                  <p className="mt-1 text-sm text-red-600">{errors.guardianPhone}</p>
                )}
              </div>
            </div>

            {/* Advanced Fields Toggle */}
            <div className="pt-4">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                {showAdvanced ? '− Hide' : '+ Show'} Advanced Fields
              </button>
            </div>

            {/* Advanced Fields */}
            {showAdvanced && (
              <div className="space-y-5 pt-2 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <span className="w-1 h-4 bg-gray-400 rounded-full"></span>
                  Additional Information
                </h3>

                {/* Preferred Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preferred Name
                  </label>
                  <input
                    type="text"
                    value={formData.preferredName}
                    onChange={(e) => setFormData(prev => ({ ...prev, preferredName: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isLoading}
                  />
                </div>

                {/* Alternative Guardian */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Alternative Guardian
                    </label>
                    <input
                      type="text"
                      value={formData.alternativeGuardian}
                      onChange={(e) => setFormData(prev => ({ ...prev, alternativeGuardian: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={isLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Alternative Phone
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                        +26
                      </span>
                      <input
                        type="tel"
                        value={formData.alternativeGuardianPhone}
                        onChange={(e) => handlePhoneChange(e.target.value, 'alternativeGuardianPhone')}
                        className="w-full pl-12 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                </div>

                {/* Previous School */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Previous School
                  </label>
                  <input
                    type="text"
                    value={formData.previousSchool}
                    onChange={(e) => setFormData(prev => ({ ...prev, previousSchool: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isLoading}
                  />
                </div>

                {/* Medical Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Medical Notes
                  </label>
                  <textarea
                    value={formData.medicalNotes}
                    onChange={(e) => setFormData(prev => ({ ...prev, medicalNotes: e.target.value }))}
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    disabled={isLoading}
                  />
                </div>

                {/* Allergies */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Allergies (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={formData.allergies}
                    onChange={(e) => setFormData(prev => ({ ...prev, allergies: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isLoading}
                  />
                </div>
              </div>
            )}
          </form>

          {/* Form Actions */}
          <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium disabled:opacity-50 transition-colors"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    Save Changes
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