// @/components/efile/SchoolStatementsCard.tsx — Settings (admins): the Vision
// and Mission statements of the Ministry, the school and each department.
// Every teacher's eFile shows them in sections 1 (Vision) and 2 (Mission
// Statement), and they print in the Teacher's File PDF, so the admin writes
// them once instead of every teacher typing them.
// Stored in Firestore system/school_statements (services/schoolStatementsService.ts).
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Save, Target } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useDepartmentList } from '@/hooks/useDepartments';
import { emptyStatements, getSchoolStatements, saveSchoolStatements, type SchoolStatements, type Statement } from '@/services/schoolStatementsService';

export const STATEMENTS_QUERY = ['school-statements'] as const;

export function useSchoolStatements() {
  return useQuery({ queryKey: STATEMENTS_QUERY, queryFn: getSchoolStatements, staleTime: 5 * 60_000 });
}

const box = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500';

function StatementFields({ id, label, value, onChange }: { id: string; label: string; value: Statement; onChange: (s: Statement) => void }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-gray-200 p-4">
      <legend className="px-1 text-sm font-semibold text-gray-900">{label}</legend>
      <label htmlFor={`${id}-vision`} className="block text-sm">
        <span className="font-medium text-gray-700">Vision</span>
        <textarea id={`${id}-vision`} rows={2} maxLength={1200} className={`${box} mt-1`} value={value.vision}
          onChange={(e) => onChange({ ...value, vision: e.target.value })} />
      </label>
      <label htmlFor={`${id}-mission`} className="block text-sm">
        <span className="font-medium text-gray-700">Mission statement</span>
        <textarea id={`${id}-mission`} rows={3} maxLength={1800} className={`${box} mt-1`} value={value.mission}
          onChange={(e) => onChange({ ...value, mission: e.target.value })} />
      </label>
    </fieldset>
  );
}

export function SchoolStatementsCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const saved = useSchoolStatements();
  const departments = useDepartmentList();
  const [draft, setDraft] = useState<SchoolStatements>(emptyStatements());
  const [department, setDepartment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (saved.data) setDraft(saved.data); }, [saved.data]);
  const names = departments.data ?? [];
  const current = department || names[0] || '';
  const deptValue = draft.departments[current] ?? { vision: '', mission: '' };

  const save = async () => {
    setSaving(true);
    try {
      await saveSchoolStatements(draft, { uid: user?.uid ?? '', name: user?.fullName ?? '' });
      await qc.invalidateQueries({ queryKey: STATEMENTS_QUERY });
      toast.success('Vision and mission saved. They now appear in every teacher’s eFile.');
    } catch (e) {
      toast.error(`Not saved: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-indigo-50 to-white border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Target size={18} className="text-indigo-600" />
          <h2 className="text-lg font-semibold text-gray-900">Vision &amp; mission (Teacher&rsquo;s File)</h2>
        </div>
        <p className="text-sm text-gray-600 mt-1">Written once here, shown in sections 1 and 2 of every teacher&rsquo;s eFile and printed in their Teacher&rsquo;s File.</p>
      </div>
      <div className="p-4 sm:p-6 space-y-4">
        {saved.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Loading…</p>
        ) : (
          <>
            <StatementFields id="st-ministry" label="Ministry of Education" value={draft.ministry} onChange={(s) => setDraft((d) => ({ ...d, ministry: s }))} />
            <StatementFields id="st-school" label="The school" value={draft.school} onChange={(s) => setDraft((d) => ({ ...d, school: s }))} />
            {names.length > 0 && (
              <div className="space-y-2">
                <label htmlFor="st-dept" className="block text-sm">
                  <span className="font-medium text-gray-700">Department</span>
                  <select id="st-dept" className={`${box} mt-1 max-w-xs`} value={current} onChange={(e) => setDepartment(e.target.value)}>
                    {names.map((n) => <option key={n} value={n}>{n}{draft.departments[n] ? ' ✓' : ''}</option>)}
                  </select>
                </label>
                <StatementFields id="st-dept-fields" label={`${current} Department (optional)`} value={deptValue}
                  onChange={(s) => setDraft((d) => ({ ...d, departments: { ...d.departments, [current]: s } }))} />
                <p className="text-xs text-gray-500">Teachers see their own departments&rsquo; statements. Leave a department empty if it has none.</p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={save} disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save vision &amp; mission
              </button>
              {saved.data?.updatedByName && <span className="text-xs text-gray-500">Last saved by {saved.data.updatedByName}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
