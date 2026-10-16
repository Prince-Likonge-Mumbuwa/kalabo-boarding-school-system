// Settings → Face recognition (admins only).
//
//  • Switch the feature on for all teachers (while off, only admins can
//    enrol and scan — use that for a pilot class).
//  • Match thresholds.
//  • Per-class progress, with "Enrol faces" for any class.
//  • Emergency: delete every saved face.
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, ScanFace, ShieldAlert, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import {
  saveFaceSettings, useAllFaceStatus, useFaceSettings, useInvalidateFaceStatus,
} from '@/hooks/useFaceRecognition';
import { loadClassRoster } from '@/services/resultsGridLoader';
import { faceApi } from '@/lib/face/faceApi';
import { DEFAULT_FACE_SETTINGS, type FaceSettings } from '@/types/face';
import { ClassFaceEnrolment } from './ClassFaceEnrolment';

export function FaceRecognitionSettingsCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const settingsQ = useFaceSettings();
  const [form, setForm] = useState<FaceSettings>(DEFAULT_FACE_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [purgeStep, setPurgeStep] = useState<0 | 1>(0);
  const [purging, setPurging] = useState(false);
  const [enrolClass, setEnrolClass] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => { if (settingsQ.data) setForm(settingsQ.data); }, [settingsQ.data]);

  const { classes = [], isLoading: loadingClasses } = useSchoolClasses();
  const statusQ = useAllFaceStatus(true);
  const invalidate = useInvalidateFaceStatus();

  const rosterQ = useQuery({
    queryKey: ['class_roster', enrolClass?.id],
    queryFn: () => loadClassRoster(enrolClass!.id),
    enabled: !!enrolClass,
  });

  const byClass = useMemo(() => {
    const m = new Map<string, { consent: number; enrolled: number }>();
    for (const s of statusQ.data ?? []) {
      const c = m.get(s.classId) ?? { consent: 0, enrolled: 0 };
      if (s.consent) c.consent++;
      if (s.consent && s.templateCount > 0) c.enrolled++;
      m.set(s.classId, c);
    }
    return m;
  }, [statusQ.data]);

  const save = async () => {
    setSaving(true);
    try {
      await saveFaceSettings(form, user?.uid ?? '');
      await qc.invalidateQueries({ queryKey: ['face_settings'] });
      toast.success(form.enabled ? 'Face recognition is on for all teachers' : 'Face recognition settings saved');
    } catch (e) {
      toast.error(`Not saved: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const purge = async () => {
    setPurging(true);
    try {
      const r = await faceApi.purgeAll();
      invalidate();
      toast.success(`Deleted saved faces of ${r.learners} learners`);
      setPurgeStep(0);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPurging(false);
    }
  };

  const sorted = [...classes].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 bg-gradient-to-r from-sky-50 to-white border-b border-gray-200">
        <div className="flex items-center gap-2">
          <ScanFace size={18} className="text-sky-600" />
          <h2 className="text-lg font-semibold text-gray-900">Face recognition</h2>
        </div>
        <p className="text-sm text-gray-600 mt-1">Tick learners present on the register by recognising their faces</p>
      </div>

      <div className="p-6 space-y-6">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-gray-300"
            checked={form.enabled}
            onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))}
          />
          <span className="text-sm">
            <b>On for all teachers</b>
            <span className="block text-gray-600">
              Off: only administrators can enrol faces and scan (use this for a pilot). On: every teacher sees
              <i> Enrol faces</i> in My Class and <i>Scan faces</i> on the register.
            </span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="font-medium">Clear match at (pre-ticked)</span>
            <input
              type="number" step="0.01" min={0.2} max={0.95}
              value={form.matchThreshold}
              onChange={e => setForm(f => ({ ...f, matchThreshold: Number(e.target.value) }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            />
            <span className="text-xs text-gray-500">Default 0.45. Higher = fewer wrong ticks, more faces to confirm.</span>
          </label>
          <label className="text-sm">
            <span className="font-medium">Possible match at ("check")</span>
            <input
              type="number" step="0.01" min={0.2} max={0.9}
              value={form.reviewThreshold}
              onChange={e => setForm(f => ({ ...f, reviewThreshold: Number(e.target.value) }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            />
            <span className="text-xs text-gray-500">Default 0.363 (the model's published cut-off). Below it: not recognised.</span>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50 flex items-center gap-2 text-sm"
          >
            {saving && <Loader2 size={16} className="animate-spin" />} Save
          </button>
          <button
            type="button"
            onClick={() => setForm({ ...DEFAULT_FACE_SETTINGS, enabled: form.enabled })}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
          >
            Default thresholds
          </button>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Classes</h3>
          {loadingClasses || statusQ.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-gray-600"><Loader2 size={16} className="animate-spin" /> Loading…</p>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
              {sorted.map(c => {
                const s = byClass.get(c.id) ?? { consent: 0, enrolled: 0 };
                const total = c.learnerStats?.total ?? c.students ?? 0;
                return (
                  <div key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="flex-1 font-medium text-gray-900">{c.name}</span>
                    <span className="text-gray-600 text-xs sm:text-sm">
                      {s.enrolled}/{total} faces · {s.consent} consent
                    </span>
                    <button
                      type="button"
                      onClick={() => setEnrolClass({ id: c.id, name: c.name })}
                      className="rounded-lg border border-sky-300 bg-sky-50 px-2 py-1 text-xs text-sky-800 hover:bg-sky-100"
                    >
                      Enrol faces
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-red-800"><ShieldAlert size={16} /> Delete all saved faces</p>
          <p className="mt-1 text-red-700">Removes every learner's face data. Consent records stay. Registers already saved are not changed.</p>
          {purgeStep === 0 ? (
            <button type="button" onClick={() => setPurgeStep(1)} className="mt-3 flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-red-700 border border-red-300 hover:bg-red-100">
              <Trash2 size={14} /> Delete all faces…
            </button>
          ) : (
            <span className="mt-3 flex flex-wrap items-center gap-2">
              Are you sure? This cannot be undone.
              <button type="button" disabled={purging} onClick={purge} className="rounded-lg bg-red-600 px-3 py-1.5 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1">
                {purging && <Loader2 size={14} className="animate-spin" />} Yes, delete everything
              </button>
              <button type="button" onClick={() => setPurgeStep(0)} className="rounded-lg border px-3 py-1.5">Cancel</button>
            </span>
          )}
        </div>
      </div>

      {enrolClass && (
        <ClassFaceEnrolment
          open={!!enrolClass && !rosterQ.isLoading}
          onOpenChange={o => { if (!o) { setEnrolClass(null); invalidate(); } }}
          classId={enrolClass.id}
          className={enrolClass.name}
          learners={(rosterQ.data ?? []).map(l => ({ id: l.id, studentId: l.studentId, fullName: l.name }))}
        />
      )}
    </div>
  );
}
