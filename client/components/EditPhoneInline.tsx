// @/components/EditPhoneInline.tsx
// Small inline editor for a guardian phone number.
// Rendered directly on failed SMS rows (SMS History + Bulk Send results).
//
// Responsibilities:
//   • Ask the user for a phone number.
//   • Normalize it (strip country code, non-digits) and validate length.
//   • Hand the normalized value to the caller via onSave().
//
// NOT responsible for persistence — the caller writes to Firestore via
// useSchoolLearners().updateLearner. This keeps the editor presentational.

import { useState } from 'react';
import { Check, X, Loader2, Phone, AlertCircle } from 'lucide-react';

export interface EditPhoneInlineProps {
  /** Prefill. Pass null when the number is unknown (e.g. bulk-send rows). */
  initialValue?: string | null;

  /** Disable inputs and show a spinner on the ✓ button while saving. */
  isSaving?: boolean;

  /** Error from the caller (e.g. Firestore write rejected). Shown below input. */
  externalError?: string | null;

  /** Called with the normalized phone (digits only, no country code). */
  onSave: (normalizedPhone: string) => void | Promise<void>;

  /** Called when the user presses Escape or clicks ✗. */
  onCancel: () => void;
}

/**
 * Normalize a Zambian phone number to its national digits.
 *
 * Rules:
 *   - Strip every non-digit character.
 *   - If the result starts with "260" (Zambia country code), drop those digits.
 *   - Accept 9–15 digits after normalization.
 *   - Anything else → null.
 *
 * Mirrors the intent of the backend `validateZambianNumber` without pulling
 * in a Firestore/Admin dependency.
 */
export const normalizeZambianPhone = (raw: string): string | null => {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;

  let national = digits;
  if (national.startsWith('260')) national = national.slice(3);

  if (national.length < 9 || national.length > 15) return null;
  return national;
};

export const EditPhoneInline = ({
  initialValue,
  isSaving = false,
  externalError,
  onSave,
  onCancel,
}: EditPhoneInlineProps) => {
  const [value, setValue] = useState(initialValue || '');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSave = async () => {
    setLocalError(null);

    const normalized = normalizeZambianPhone(value);
    if (!normalized) {
      setLocalError('Enter 9–15 digits (e.g. 971234567)');
      return;
    }

    try {
      await onSave(normalized);
    } catch (err: any) {
      setLocalError(err?.message || 'Failed to update number');
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const error = localError || externalError;

  return (
    <div className="flex flex-col gap-1 mt-2">
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <Phone
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="tel"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d+ ]/g, ''))}
            onKeyDown={handleKey}
            placeholder="971234567"
            autoFocus
            disabled={isSaving}
            className={`w-full pl-7 pr-2 py-1.5 border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 ${
              error ? 'border-red-300' : 'border-gray-300'
            }`}
          />
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || !value.trim()}
          className="p-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          title="Save"
        >
          {isSaving ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Check size={12} />
          )}
        </button>
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="p-1.5 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 disabled:opacity-50"
          title="Cancel"
        >
          <X size={12} />
        </button>
      </div>

      {error && (
        <p className="text-[10px] text-red-600 pl-1 flex items-center gap-1">
          <AlertCircle size={10} />
          {error}
        </p>
      )}
    </div>
  );
};

export default EditPhoneInline;