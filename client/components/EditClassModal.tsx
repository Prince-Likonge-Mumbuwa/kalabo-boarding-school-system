// @/components/EditClassModal.tsx
import { X, Loader2, AlertCircle, Save } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Class } from '@/types/school';

interface EditClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updates: Partial<Class>) => Promise<void>;
  classData: Class;
  isLoading?: boolean;
}

const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

export const EditClassModal = ({
  isOpen,
  onClose,
  onUpdate,
  classData,
  isLoading = false,
}: EditClassModalProps) => {
  const [name, setName] = useState(classData.name);
  const [year, setYear] = useState<number>(classData.year);
  const [type, setType] = useState<'grade' | 'form'>(classData.type);
  const [level, setLevel] = useState<number>(classData.level);
  const [section, setSection] = useState<string>(classData.section);
  const [isActive, setIsActive] = useState<boolean>(classData.isActive);

  // Year is a string in the input so users can clear the field without it snapping to NaN
  const [yearInput, setYearInput] = useState<string>(String(classData.year));

  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Reset form whenever the modal opens with new data
  useEffect(() => {
    if (isOpen) {
      setName(classData.name);
      setYear(classData.year);
      setYearInput(String(classData.year));
      setType(classData.type);
      setLevel(classData.level);
      setSection(classData.section || 'A');
      setIsActive(classData.isActive);
      setError('');
      setFieldErrors({});
    }
  }, [isOpen, classData]);

  // Keep level valid when the type changes (Grade: 8–12, Form: 1–5)
  useEffect(() => {
    if (type === 'grade' && (level < 8 || level > 12)) {
      setLevel(8);
    } else if (type === 'form' && (level < 1 || level > 5)) {
      setLevel(1);
    }
  }, [type, level]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!name.trim()) {
      errs.name = 'Class name is required';
    } else if (name.trim().length < 3) {
      errs.name = 'Class name must be at least 3 characters';
    }

    const parsedYear = parseInt(yearInput, 10);
    if (!yearInput.trim() || isNaN(parsedYear)) {
      errs.year = 'Academic year is required';
    } else if (parsedYear < MIN_YEAR || parsedYear > MAX_YEAR) {
      errs.year = `Year must be between ${MIN_YEAR} and ${MAX_YEAR}`;
    }

    if (type === 'grade' && (level < 8 || level > 12)) {
      errs.level = 'Grade level must be between 8 and 12';
    }
    if (type === 'form' && (level < 1 || level > 5)) {
      errs.level = 'Form level must be between 1 and 5';
    }

    if (!section || !SECTIONS.includes(section as any)) {
      errs.section = 'Please select a valid section';
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    if (!validate()) return;

    try {
      setError('');
      setFieldErrors({});

      const parsedYear = parseInt(yearInput, 10);
      setYear(parsedYear);

      await onUpdate({
        name: name.trim(),
        year: parsedYear,
        type,
        level,
        section,
        isActive,
      });

      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update class');
    }
  };

  const generateNamePreview = () => {
    const typeStr = type === 'grade' ? 'Grade' : 'Form';
    return `${typeStr} ${level}${section}`;
  };

  const levelOptions =
    type === 'grade'
      ? Array.from({ length: 5 }, (_, i) => i + 8)
      : Array.from({ length: 5 }, (_, i) => i + 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-class-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => !isLoading && onClose()}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[95vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex justify-between items-center p-5 sm:p-6 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h3 id="edit-class-title" className="text-lg font-semibold text-gray-900">
              Edit Class
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Update the class details below
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6">
          {/* Top-level error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 flex-1">{error}</p>
            </div>
          )}

          {/* Class Name Preview */}
          <div className="mb-5 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-xs text-blue-600 mb-1 font-medium">Class Name Preview</p>
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
                disabled={isLoading}
                className={`flex-1 py-2.5 rounded-lg border transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 ${
                  type === 'grade'
                    ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Grade
              </button>
              <button
                type="button"
                onClick={() => setType('form')}
                disabled={isLoading}
                className={`flex-1 py-2.5 rounded-lg border transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1 disabled:opacity-50 ${
                  type === 'form'
                    ? 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700'
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
              <label
                htmlFor="edit-class-level"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Level
              </label>
              <select
                id="edit-class-level"
                value={level}
                onChange={(e) => setLevel(parseInt(e.target.value, 10))}
                disabled={isLoading}
                className={`w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 ${
                  fieldErrors.level ? 'border-red-300' : 'border-gray-300'
                }`}
              >
                {levelOptions.map((l) => (
                  <option key={l} value={l}>
                    {type === 'grade' ? `Grade ${l}` : `Form ${l}`}
                  </option>
                ))}
              </select>
              {fieldErrors.level && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.level}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="edit-class-section"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Section
              </label>
              <select
                id="edit-class-section"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                disabled={isLoading}
                className={`w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 ${
                  fieldErrors.section ? 'border-red-300' : 'border-gray-300'
                }`}
              >
                {SECTIONS.map((s) => (
                  <option key={s} value={s}>
                    Section {s}
                  </option>
                ))}
              </select>
              {fieldErrors.section && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.section}</p>
              )}
            </div>
          </div>

          {/* Class Name (optional override) */}
          <div className="mb-4">
            <label
              htmlFor="edit-class-name"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Class Name
            </label>
            <input
              id="edit-class-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
              placeholder={generateNamePreview()}
              className={`w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 ${
                fieldErrors.name ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            <p className="mt-1 text-xs text-gray-500">
              Leave as-is to keep the preview name, or type a custom name.
            </p>
            {fieldErrors.name && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>
            )}
          </div>

          {/* Year */}
          <div className="mb-4">
            <label
              htmlFor="edit-class-year"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Academic Year
            </label>
            <input
              id="edit-class-year"
              type="number"
              inputMode="numeric"
              value={yearInput}
              onChange={(e) => setYearInput(e.target.value)}
              onBlur={() => {
                // On blur, clamp to valid range if user typed something
                const n = parseInt(yearInput, 10);
                if (!isNaN(n)) {
                  const clamped = Math.min(MAX_YEAR, Math.max(MIN_YEAR, n));
                  setYearInput(String(clamped));
                }
              }}
              min={MIN_YEAR}
              max={MAX_YEAR}
              disabled={isLoading}
              className={`w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 ${
                fieldErrors.year ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {fieldErrors.year && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.year}</p>
            )}
          </div>

          {/* Status Toggle */}
          <div className="mb-6">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={isLoading}
                className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Active Class</span>
                <p className="text-xs text-gray-500">
                  Inactive classes are hidden from most views
                </p>
              </div>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Update Class
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};