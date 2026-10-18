// Settings → Face recognition (admins): just the school-wide on/off switch.
// Enrolling faces, match thresholds and the class overview live in
// Attendance → Face recognition.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, Loader2, ScanFace } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { saveFaceSwitch, useFaceSettings } from '@/hooks/useFaceRecognition';

export const FACE_ADMIN_PATH = '/dashboard/admin/face-recognition';

export function FaceRecognitionToggleCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const settingsQ = useFaceSettings();
  const [saving, setSaving] = useState(false);
  const on = settingsQ.data?.enabled === true;

  const change = async (next: boolean) => {
    setSaving(true);
    try {
      await saveFaceSwitch(next, user?.uid ?? '');
      await qc.invalidateQueries({ queryKey: ['face_settings'] });
      toast.success(next ? 'Face recognition is on for all teachers' : 'Face recognition is off for teachers');
    } catch (e) {
      toast.error(`Not saved: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-sky-50 to-white border-b border-gray-200">
        <div className="flex items-center gap-2">
          <ScanFace size={18} className="text-sky-600" />
          <h2 className="text-lg font-semibold text-gray-900">Face recognition</h2>
        </div>
        <p className="text-sm text-gray-600 mt-1">Tick learners present on the register by recognising their faces</p>
      </div>
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <label htmlFor="face-switch" className="min-w-0 text-sm">
            <span className="block font-medium text-gray-900">
              {settingsQ.isLoading ? 'Checking…' : on ? 'On for all teachers' : 'Off for teachers'}
            </span>
            <span className="block text-gray-600 mt-0.5">
              On: every teacher sees <i>Scan faces</i> on Attendance Tracking, and form teachers can enrol faces.
              Off: hidden from teachers — administrators can still try it out.
            </span>
          </label>
          <div className="flex flex-shrink-0 items-center gap-2 pt-0.5">
            {saving && <Loader2 size={16} className="animate-spin text-gray-400" />}
            <Switch
              id="face-switch"
              checked={on}
              disabled={saving || settingsQ.isLoading}
              onCheckedChange={change}
              aria-label="Face recognition for all teachers"
            />
          </div>
        </div>
        <Link
          to={FACE_ADMIN_PATH}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:text-sky-900"
        >
          Enrol faces and set match levels in Attendance <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
