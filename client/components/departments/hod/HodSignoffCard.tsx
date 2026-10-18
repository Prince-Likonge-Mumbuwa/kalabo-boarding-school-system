// My Department → Allocations: the HoD marks the department's allocations
// complete for a term. The timetable can be generated once every
// department has done so.
import { useState } from 'react';
import { CalendarRange, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSignoffs, useInvalidateBuilder } from '@/hooks/useTimetableBuilder';
import { reopenAllocations, signOffAllocations } from '@/services/timetableGenerator/service';
import { formatTermLabel, getCurrentAcademicTerm, getNextAcademicTerm } from '@/utils/academicTerm';

export function HodSignoffCard({ department, vacant }: { department: string; vacant: number }) {
  const { user } = useAuth();
  const now = getCurrentAcademicTerm();
  const terms = [now, getNextAcademicTerm(now)];
  const [idx, setIdx] = useState(0);
  const { term, year } = terms[idx];
  const signoffsQ = useSignoffs(term, year);
  const invalidate = useInvalidateBuilder();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mine = (signoffsQ.data ?? []).find(s => s.department === department) ?? null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      invalidate();
    } catch (e: any) {
      setErr(e?.code === 'permission-denied' ? 'Not allowed: only the HoD of this department.' : e?.message || 'Not saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${mine ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-blue-50'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            {mine ? <CheckCircle2 size={16} className="text-green-600" /> : <CalendarRange size={16} className="text-blue-600" />}
            Timetable ·{' '}
            <select aria-label="Term" value={idx} onChange={e => setIdx(Number(e.target.value))} className="rounded border border-gray-300 bg-white px-1 py-0.5 text-sm font-normal">
              {terms.map((t, i) => <option key={i} value={i}>{formatTermLabel(t.term, t.year)}</option>)}
            </select>
          </p>
          <p className="mt-0.5 text-xs text-gray-700">
            {signoffsQ.isLoading
              ? 'Checking…'
              : mine
                ? `Allocations marked complete by ${mine.byName}${mine.byRole === 'admin' ? ' (admin)' : ''}. The school timetable can be generated once every department has done this.`
                : `When every class has the right teacher, mark the allocations complete so the school timetable can be generated.${vacant ? ` ${vacant} still vacant: they will be timetabled without a teacher.` : ''}`}
          </p>
          {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
        </div>
        {!signoffsQ.isLoading && (
          mine ? (
            <button type="button" disabled={busy} onClick={() => run(() => reopenAllocations(department, term, year))} className="inline-flex min-h-[38px] items-center gap-1.5 self-start rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 disabled:opacity-50 sm:self-auto">
              {busy && <Loader2 size={14} className="animate-spin" />} Reopen
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !user}
              onClick={() => run(() => signOffAllocations({ department, term, year, by: { uid: user!.uid, name: user!.fullName }, byRole: 'hod', vacantCount: vacant }))}
              className="inline-flex min-h-[38px] items-center gap-1.5 self-start rounded-lg bg-blue-600 px-3 text-sm font-medium text-white disabled:opacity-50 sm:self-auto"
            >
              {busy && <Loader2 size={14} className="animate-spin" />} Mark allocations complete
            </button>
          )
        )}
      </div>
    </div>
  );
}
