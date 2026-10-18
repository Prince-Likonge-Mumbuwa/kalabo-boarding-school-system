// Choosing a department's subjects. Used by the Head of Department (My
// Department → Allocations) and by admins (Teacher Management → Departments).
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { Check } from 'lucide-react';
import { db } from '@/lib/firebase';
import { SUBJECT_SMS_ABBREVIATIONS, normalizeSubjectName } from '@/services/resultsService';
import { FORM_TEACHER_SLOT } from '@/services/assignmentEngine';
import { departmentOfSubject, type DepartmentConfig } from '@/services/departmentService';

/** Every subject the school uses: the standard list plus any subject already on a class. */
export async function allSchoolSubjects(): Promise<string[]> {
  const snap = await getDocs(collection(db, 'class_slots'));
  const used = snap.docs.map(d => String(d.data().normalizedSubject || '')).filter(s => s && s !== FORM_TEACHER_SLOT);
  const standard = Object.keys(SUBJECT_SMS_ABBREVIATIONS).map(normalizeSubjectName);
  return Array.from(new Set([...standard, ...used])).sort((a, b) => a.localeCompare(b));
}

export function useSchoolSubjects(enabled = true) {
  return useQuery({ queryKey: ['class_slots', 'all-subjects'], queryFn: allSchoolSubjects, enabled, staleTime: 60_000 });
}

/**
 * Subject chips. `lockOthers`: subjects of another department can't be
 * chosen (a HoD); otherwise choosing one moves it here (an admin).
 */
export function SubjectPicker({ subjects, picked, onChange, cfg, department, lockOthers, disabled }: {
  subjects: string[];
  picked: string[];
  onChange: (next: string[]) => void;
  cfg: DepartmentConfig;
  department: string;
  lockOthers?: boolean;
  disabled?: boolean;
}) {
  const all = Array.from(new Set([...subjects, ...picked])).sort((a, b) => a.localeCompare(b));
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={`Subjects of ${department}`}>
      {all.map(s => {
        const on = picked.includes(s);
        const other = departmentOfSubject(cfg, s);
        const elsewhere = !on && !!other && other.toLowerCase() !== department.toLowerCase();
        const locked = elsewhere && lockOthers;
        return (
          <button
            key={s}
            type="button"
            disabled={disabled || locked}
            onClick={() => onChange(on ? picked.filter(x => x !== s) : [...picked, s])}
            aria-pressed={on}
            title={locked ? `${s} belongs to ${other}` : elsewhere ? `Now in ${other} — choosing it here moves it` : undefined}
            className={`inline-flex min-h-[34px] items-center gap-1 rounded-full border px-3 py-1 text-sm disabled:cursor-not-allowed ${
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
  );
}
