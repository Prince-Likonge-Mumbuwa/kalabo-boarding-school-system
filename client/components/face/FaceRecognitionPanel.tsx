// Attendance → Face recognition (admins).
//
//  • Whether it is on for teachers (switched in Settings).
//  • Per-class progress, with "Enrol faces" for any class.
//  • Match thresholds.
//  • Emergency: delete every saved face.
//
// This used to be a card in Settings; Settings now keeps only the on/off
// switch (FaceRecognitionToggleCard).
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, ScanFace, Search, ShieldAlert, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import {
  saveFaceThresholds, useAllFaceStatus, useFaceSettings, useInvalidateFaceStatus,
} from '@/hooks/useFaceRecognition';
import { loadClassRoster } from '@/services/resultsGridLoader';
import { faceApi } from '@/lib/face/faceApi';
import { DEFAULT_FACE_SETTINGS } from '@/types/face';
import { ClassFaceEnrolment } from './ClassFaceEnrolment';

export default function FaceRecognitionPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const settingsQ = useFaceSettings();
  const settings = settingsQ.data ?? DEFAULT_FACE_SETTINGS;
  const [form, setForm] = useState({ reviewThreshold: settings.reviewThreshold, matchThreshold: settings.matchThreshold });
  const [saving, setSaving] = useState(false);
  const [purgeStep, setPurgeStep] = useState<0 | 1>(0);
  const [purging, setPurging] = useState(false);
  const [enrolClass, setEnrolClass] = useState<{ id: string; name: string } | null>(null);
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (settingsQ.data) setForm({ reviewThreshold: settingsQ.data.reviewThreshold, matchThreshold: settingsQ.data.matchThreshold });
  }, [settingsQ.data]);

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

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...classes]
      .filter(c => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map(c => {
        const s = byClass.get(c.id) ?? { consent: 0, enrolled: 0 };
        const total = c.learnerStats?.total ?? c.students ?? 0;
        return { id: c.id, name: c.name, total, ...s, pct: total > 0 ? Math.min(100, Math.round((s.enrolled / total) * 100)) : 0 };
      });
  }, [classes, byClass, search]);

  const totals = useMemo(() => rows.reduce((t, r) => ({ total: t.total + r.total, enrolled: t.enrolled + r.enrolled }), { total: 0, enrolled: 0 }), [rows]);

  const changed = form.reviewThreshold !== settings.reviewThreshold || form.matchThreshold !== settings.matchThreshold;
  const save = async () => {
    setSaving(true);
    try {
      await saveFaceThresholds(form, user?.uid ?? '');
      await qc.invalidateQueries({ queryKey: ['face_settings'] });
      toast.success('Match levels saved');
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

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className={`flex flex-col gap-2 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${settings.enabled ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-start gap-3">
          <ScanFace size={22} className={settings.enabled ? 'text-green-600' : 'text-gray-400'} />
          <div className="text-sm">
            <p className="font-semibold text-gray-900">
              {settingsQ.isLoading ? 'Checking…' : settings.enabled ? 'On for all teachers' : 'Off for teachers (administrators can pilot it)'}
            </p>
            <p className="text-gray-600">
              {totals.enrolled} of {totals.total} learners have a face saved.
            </p>
          </div>
        </div>
        <Link to="/dashboard/admin/settings" className="text-sm font-medium text-sky-700 hover:text-sky-900">
          Switch on / off in Settings
        </Link>
      </div>

      {/* Classes */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Classes</h3>
            <p className="text-xs text-gray-500">Record guardian consent and save faces, one learner after another.</p>
          </div>
          <div className="relative sm:w-56">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Find a class"
              aria-label="Find a class"
              className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm"
            />
          </div>
        </div>
        {loadingClasses || statusQ.isLoading ? (
          <p className="flex items-center gap-2 p-4 text-sm text-gray-600"><Loader2 size={16} className="animate-spin" /> Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No classes found.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map(r => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
                <span className="min-w-[6rem] flex-1 font-medium text-gray-900">{r.name}</span>
                <span className="order-3 flex w-full items-center gap-2 sm:order-none sm:w-48">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <span className="block h-full rounded-full bg-sky-500" style={{ width: `${r.pct}%` }} />
                  </span>
                  <span className="whitespace-nowrap text-xs text-gray-600">{r.enrolled}/{r.total} · {r.consent} consent</span>
                </span>
                <button
                  type="button"
                  onClick={() => setEnrolClass({ id: r.id, name: r.name })}
                  className="min-h-[36px] rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100"
                >
                  Enrol faces
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Thresholds */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><SlidersHorizontal size={16} /> Match levels</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="font-medium">Clear match at (ticked)</span>
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
            disabled={saving || !changed}
            className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {saving && <Loader2 size={16} className="animate-spin" />} Save
          </button>
          <button
            type="button"
            onClick={() => setForm({ reviewThreshold: DEFAULT_FACE_SETTINGS.reviewThreshold, matchThreshold: DEFAULT_FACE_SETTINGS.matchThreshold })}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Default levels
          </button>
        </div>
      </div>

      {/* Purge */}
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
        <p className="flex items-center gap-2 font-medium text-red-800"><ShieldAlert size={16} /> Delete all saved faces</p>
        <p className="mt-1 text-red-700">Removes every learner's face data. Consent records stay. Registers already saved are not changed.</p>
        {purgeStep === 0 ? (
          <button type="button" onClick={() => setPurgeStep(1)} className="mt-3 flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-red-700 hover:bg-red-100">
            <Trash2 size={14} /> Delete all faces…
          </button>
        ) : (
          <span className="mt-3 flex flex-wrap items-center gap-2">
            Are you sure? This cannot be undone.
            <button type="button" disabled={purging} onClick={purge} className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-white hover:bg-red-700 disabled:opacity-50">
              {purging && <Loader2 size={14} className="animate-spin" />} Yes, delete everything
            </button>
            <button type="button" onClick={() => setPurgeStep(0)} className="rounded-lg border bg-white px-3 py-1.5">Cancel</button>
          </span>
        )}
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
