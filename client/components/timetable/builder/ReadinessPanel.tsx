// Timetable builder → Readiness: has every department finished its
// allocations for the term, does every level have its subjects, which
// subjects still have no teacher. Admins also choose the HoDs who may
// generate timetables (Timetablers).
import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Users } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useHods } from '@/hooks/useDepartments';
import { useSignoffs, useTimetablers, useInvalidateBuilder } from '@/hooks/useTimetableBuilder';
import { readiness } from '@/services/timetableGenerator/problem';
import { reopenAllocations, setTimetabler, signOffAllocations } from '@/services/timetableGenerator/service';
import { formatTermLabel } from '@/utils/academicTerm';
import { Btn, Card, Notice, errText, fmtDate, useBuilder } from './shared';

export function useReadiness() {
  const { inputs, term, year } = useBuilder();
  const signoffsQ = useSignoffs(term, year);
  const value = useMemo(
    () =>
      readiness({
        config: inputs.config,
        classes: inputs.classes,
        ownedSlotIds: new Set(inputs.slots.filter(s => s.ownerTeacherId).map(s => s.id)),
        departmentOf: inputs.departmentOf,
        signoffs: signoffsQ.data ?? [],
      }),
    [inputs, signoffsQ.data],
  );
  return { readiness: value, loading: signoffsQ.isLoading };
}

export function ReadinessPanel({ onOpenCurriculum }: { onOpenCurriculum: () => void }) {
  const { term, year, isAdmin, actor } = useBuilder();
  const { readiness: r, loading } = useReadiness();
  const invalidate = useInvalidateBuilder();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showVacant, setShowVacant] = useState<string | null>(null);

  const act = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      invalidate();
      setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {loading ? null : r.ready ? (
        <Notice tone="ok">
          Ready to generate the {formatTermLabel(term, year)} timetable: every department has marked its allocations complete.
          {r.vacantTotal > 0 && ` ${r.vacantTotal} class subject${r.vacantTotal === 1 ? ' still has' : 's still have'} no teacher and will be timetabled without one.`}
        </Notice>
      ) : (
        <Notice tone="warn">
          <p className="font-medium">Not ready to generate yet.</p>
          <ul className="mt-1 list-disc pl-5 space-y-0.5">
            {r.blockers.map(b => <li key={b}>{b}</li>)}
          </ul>
        </Notice>
      )}
      {msg && <Notice tone={msg.ok ? 'ok' : 'error'}>{msg.text}</Notice>}

      <Card title={`Allocations by department · ${formatTermLabel(term, year)}`}>
        <p className="mb-3 text-xs text-gray-600">
          Each HoD marks their department's teacher allocations complete in My Department → Allocations.
          {isAdmin && ' An admin can do it for a department (for example one without a HoD).'}
        </p>
        {r.departments.length === 0 ? (
          <p className="text-sm text-gray-500">No department subjects are in the curriculum yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {r.departments.map(d => (
              <li key={d.department} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                    {d.signoff ? <CheckCircle2 size={15} className="text-green-600" /> : <Clock size={15} className="text-amber-600" />}
                    {d.department}
                  </p>
                  <p className="text-xs text-gray-600">
                    {d.allocations} class subject{d.allocations === 1 ? '' : 's'}
                    {d.vacant > 0 && (
                      <>
                        {' · '}
                        <button type="button" className="text-amber-700 underline" onClick={() => setShowVacant(showVacant === d.department ? null : d.department)}>
                          {d.vacant} without a teacher
                        </button>
                      </>
                    )}
                    {' · '}
                    {d.signoff ? `Complete — ${d.signoff.byName}${d.signoff.byRole === 'admin' ? ' (admin)' : ''}${d.signoff.at ? `, ${fmtDate(d.signoff.at)}` : ''}` : 'Waiting for the HoD'}
                  </p>
                  {showVacant === d.department && (
                    <p className="mt-1 text-xs text-amber-800">{d.vacantList.join(', ')}{d.vacant > d.vacantList.length ? ' …' : ''}</p>
                  )}
                </div>
                {isAdmin && (
                  d.signoff ? (
                    <Btn busy={busy === d.department} onClick={() => act(d.department, () => reopenAllocations(d.department, term, year), `${d.department} reopened.`)}>Reopen</Btn>
                  ) : (
                    <Btn busy={busy === d.department} onClick={() => act(d.department, () => signOffAllocations({ department: d.department, term, year, by: actor, byRole: 'admin', vacantCount: d.vacant }), `${d.department} marked complete.`)}>
                      Mark complete
                    </Btn>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Subjects per level" actions={<Btn onClick={onOpenCurriculum}>Open curriculum</Btn>}>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {r.levels.map(l => (
            <li key={l.key} className={`rounded-lg border px-3 py-2 text-sm ${l.subjectCount ? 'border-gray-200' : 'border-amber-300 bg-amber-50'}`}>
              <span className="font-semibold text-gray-900">{l.label}</span>
              <span className="block text-xs text-gray-600">{l.classCount} class{l.classCount === 1 ? '' : 'es'} · {l.subjectCount ? `${l.subjectCount} subjects` : 'subjects not set'}</span>
            </li>
          ))}
        </ul>
        {r.noDepartment.length > 0 && (
          <p className="mt-3 text-xs text-amber-800">Not in any department: {r.noDepartment.join(', ')}. The HoD adds them in My Department, or the admin in Teacher Management → Departments.</p>
        )}
      </Card>

      {isAdmin && <TimetablersCard />}
    </div>
  );
}

function TimetablersCard() {
  const { actor } = useBuilder();
  const hodsQ = useHods();
  const ttQ = useTimetablers();
  const invalidate = useInvalidateBuilder();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const active = new Set((ttQ.data ?? []).filter(t => t.status === 'active').map(t => t.teacherId));
  const hods = (hodsQ.data ?? []).filter(h => h.status === 'active').sort((a, b) => a.teacherName.localeCompare(b.teacherName));

  return (
    <Card title={<span className="inline-flex items-center gap-1.5"><Users size={15} /> HoDs who may generate timetables</span>}>
      <p className="mb-3 text-xs text-gray-600">They can set up the curriculum and make drafts. Only an admin publishes, changes or withdraws the school timetable.</p>
      {err && <div className="mb-2"><Notice tone="error">{err}</Notice></div>}
      {hods.length === 0 ? (
        <p className="text-sm text-gray-500">No Heads of Department yet (Teacher Management).</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {hods.map(h => (
            <li key={h.teacherId} className="flex items-center justify-between gap-3 py-2">
              <label htmlFor={`tt-${h.teacherId}`} className="min-w-0 text-sm">
                <span className="block truncate font-medium text-gray-900">{h.teacherName}</span>
                <span className="block text-xs text-gray-500">HoD · {h.department}</span>
              </label>
              <Switch
                id={`tt-${h.teacherId}`}
                checked={active.has(h.teacherId)}
                disabled={busy === h.teacherId}
                aria-label={`${h.teacherName} may generate timetables`}
                onCheckedChange={async on => {
                  setBusy(h.teacherId);
                  setErr(null);
                  try {
                    await setTimetabler({ id: h.teacherId, name: h.teacherName }, on, actor);
                    invalidate();
                  } catch (e) {
                    setErr(errText(e));
                  } finally {
                    setBusy(null);
                  }
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
