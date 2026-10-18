// Teacher Management → "Departments" (admins): which subjects belong to
// which department. A Head of Department allocates teachers only to their
// department's subjects (the Firestore rules read this same list).
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { Building2, Check, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { db } from '@/lib/firebase';
import { SUBJECT_SMS_ABBREVIATIONS, normalizeSubjectName } from '@/services/resultsService';
import { FORM_TEACHER_SLOT } from '@/services/assignmentEngine';
import { useDepartmentConfig, useHods, useInvalidateDepartments } from '@/hooks/useDepartments';
import { departmentOfSubject, setDepartmentSubjects, subjectsOfDepartment, type Actor } from '@/services/departmentService';

/** Every subject the school uses: the standard list plus any subject already on a class. */
async function allSubjects(): Promise<string[]> {
  const snap = await getDocs(collection(db, 'class_slots'));
  const used = snap.docs.map(d => String(d.data().normalizedSubject || '')).filter(s => s && s !== FORM_TEACHER_SLOT);
  // Standard names, as stored on class slots (normalised).
  const standard = Object.keys(SUBJECT_SMS_ABBREVIATIONS).map(normalizeSubjectName);
  return Array.from(new Set([...standard, ...used])).sort((a, b) => a.localeCompare(b));
}

export function DepartmentSubjectsDialog({ open, onOpenChange, actor }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  actor: Actor;
}) {
  const cfgQ = useDepartmentConfig();
  const hodsQ = useHods(open);
  const subjectsQ = useQuery({ queryKey: ['class_slots', 'all-subjects'], queryFn: allSubjects, enabled: open, staleTime: 60_000 });
  const invalidate = useInvalidateDepartments();
  const [dept, setDept] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const cfg = cfgQ.data;
  useEffect(() => { if (cfg && !dept) setDept(cfg.names[0] ?? ''); }, [cfg, dept]);
  useEffect(() => { if (cfg && dept) setPicked(subjectsOfDepartment(cfg, dept)); setNote(''); setError(''); }, [cfg, dept]);

  const saved = cfg && dept ? subjectsOfDepartment(cfg, dept) : [];
  const dirty = picked.length !== saved.length || picked.some(s => !saved.includes(s));
  const hod = (hodsQ.data ?? []).find(h => h.status === 'active' && h.department.toLowerCase() === dept.toLowerCase());

  const subjects = useMemo(() => subjectsQ.data ?? [], [subjectsQ.data]);
  const toggle = (s: string) => setPicked(p => (p.includes(s) ? p.filter(x => x !== s) : [...p, s]));

  const save = async () => {
    setBusy(true); setError(''); setNote('');
    try {
      await setDepartmentSubjects(dept, picked, actor);
      await invalidate();
      setNote(`Saved: ${picked.length} subject${picked.length === 1 ? '' : 's'} in ${dept}.`);
    } catch (e: any) {
      setError(e?.message || 'Not saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[95dvh] w-full max-w-2xl flex-col gap-3 overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="flex items-center gap-2"><Building2 size={20} /> Department subjects</DialogTitle>
          <DialogDescription>
            Choose the subjects each department is responsible for. The Head of Department allocates the department's teachers to these subjects; a subject belongs to one department.
          </DialogDescription>
        </DialogHeader>

        {cfgQ.isLoading || subjectsQ.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Loading…</p>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={dept}
                onChange={e => setDept(e.target.value)}
                aria-label="Department"
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm sm:w-64"
              >
                {(cfg?.names ?? []).map(n => (
                  <option key={n} value={n}>{n} ({subjectsOfDepartment(cfg!, n).length})</option>
                ))}
              </select>
              <span className="text-xs text-gray-500">{hod ? `Head of Department: ${hod.teacherName}` : 'No Head of Department yet'}</span>
            </div>

            <div className="flex flex-wrap gap-2" role="group" aria-label={`Subjects of ${dept}`}>
              {subjects.map(s => {
                const on = picked.includes(s);
                const other = cfg ? departmentOfSubject(cfg, s) : null;
                const elsewhere = !on && other && other.toLowerCase() !== dept.toLowerCase();
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggle(s)}
                    aria-pressed={on}
                    title={elsewhere ? `Now in ${other} — choosing it here moves it` : undefined}
                    className={`inline-flex min-h-[34px] items-center gap-1 rounded-full border px-3 py-1 text-sm ${
                      on ? 'border-blue-600 bg-blue-600 text-white' : elsewhere ? 'border-gray-200 bg-gray-50 text-gray-400' : 'border-gray-300 bg-white text-gray-700 hover:bg-blue-50'
                    }`}
                  >
                    {on && <Check size={13} />}
                    {s}
                    {elsewhere && <span className="text-[10px]">· {other}</span>}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
              <button
                type="button"
                onClick={save}
                disabled={busy || !dirty || !dept}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy && <Loader2 size={14} className="animate-spin" />} Save {dept} subjects
              </button>
              {dirty && <button type="button" onClick={() => setPicked(saved)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">Undo</button>}
              {note && <span className="text-xs text-green-700" role="status">{note}</span>}
              {error && <span className="text-xs text-red-600" role="alert">{error}</span>}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
