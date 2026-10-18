// HoD → Allocations → the department's subjects. The HoD chooses which
// subjects the department teaches; allocations are made for these subjects.
// A subject that belongs to another department can't be taken here.
import { useEffect, useState } from 'react';
import { Check, Loader2, Pencil } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useInvalidateDepartments } from '@/hooks/useDepartments';
import { setOwnDepartmentSubjects, type DepartmentConfig } from '@/services/departmentService';
import { SubjectPicker, useSchoolSubjects } from '../SubjectPicker';

export function HodSubjectsEditor({ department, cfg, subjects }: {
  department: string;
  cfg: DepartmentConfig;
  /** The department's subjects now. */
  subjects: string[];
}) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(subjects.length === 0);
  const [picked, setPicked] = useState<string[]>(subjects);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const schoolQ = useSchoolSubjects(editing);
  const invalidate = useInvalidateDepartments();
  const key = subjects.join('|');
  useEffect(() => { setPicked(subjects); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = picked.length !== subjects.length || picked.some(s => !subjects.includes(s));

  const save = async () => {
    setBusy(true); setError(''); setNote('');
    try {
      const saved = await setOwnDepartmentSubjects(department, picked, { uid: user?.uid ?? '', name: user?.fullName || '' });
      await invalidate();
      setNote(`Saved: ${saved.length} subject${saved.length === 1 ? '' : 's'}.`);
      if (saved.length) setEditing(false);
    } catch (e: any) {
      setError(e?.code === 'permission-denied' ? 'Not allowed. Only the Head of Department can change these subjects.' : (e?.message || 'Not saved.'));
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-600">{subjects.length} subject{subjects.length === 1 ? '' : 's'} in {department}.</span>
        <button type="button" onClick={() => { setEditing(true); setNote(''); }} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50">
          <Pencil size={12} /> Change subjects
        </button>
        {note && <span className="text-xs text-green-700" role="status">{note}</span>}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3 sm:p-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">Subjects taught in {department}</p>
        <p className="text-xs text-gray-600">Choose your department's subjects. You then allocate your teachers to these subjects in each class. A subject belongs to one department.</p>
      </div>
      {schoolQ.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={14} className="animate-spin" /> Loading subjects…</p>
      ) : (
        <SubjectPicker subjects={schoolQ.data ?? []} picked={picked} onChange={setPicked} cfg={cfg} department={department} lockOthers disabled={busy} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save subjects ({picked.length})
        </button>
        {subjects.length > 0 && (
          <button type="button" onClick={() => { setPicked(subjects); setEditing(false); setError(''); }} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50">Cancel</button>
        )}
        {note && <span className="text-xs text-green-700" role="status">{note}</span>}
        {error && <span className="text-xs text-red-600" role="alert">{error}</span>}
      </div>
    </div>
  );
}
