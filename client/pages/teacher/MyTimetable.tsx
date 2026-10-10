// @/pages/teacher/MyTimetable.tsx
//
// ============================================================================
//  MY TIMETABLE — tick-box setup
// ============================================================================
//
//  Copy the printed timetable in: pick a subject, tick its periods. Ticked
//  periods next to each other become a double / triple by themselves, and
//  a subject can have several lessons on one day.
//
//  • Boxes are locked when the class already has another subject then, or
//    when the teacher (or their cover) is in another class then.
//  • "Submit changes" sends only the subjects that changed. Each one
//    REPLACES that subject's live timetable once an admin approves —
//    until then the live timetable stays in force.
// ============================================================================

import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useTeacherClasses } from '@/hooks/useTeacherClasses';
import {
  usePeriods,
  useMyTimetable,
  useMySubmissions,
  useClashContext,
  useSubmitTimetable,
  invalidateTimetableCaches,
} from '@/hooks/useTimetable';
import { useQueryClient } from '@tanstack/react-query';
import { getCurrentAcademicTerm, type TermName } from '@/utils/academicTerm';
import {
  cellBlockers,
  checkClashes,
  groupIntoBlocks,
  blockSizeName,
  DAY_SHORT,
  type RowLike,
  type Weekday,
} from '@/services/timetableModel';
import { ConflictWarning, WeekGrid } from '@/components/timetable/TimetableShared';
import { PeriodTickGrid } from '@/components/timetable/PeriodTickGrid';
import { NowNextCard } from '@/components/timetable/NowNextCard';
import { AlertCircle, CheckCircle2, Clock, Loader2, RefreshCw, Send, Undo2 } from 'lucide-react';

const TERMS: TermName[] = ['Term 1', 'Term 2', 'Term 3'];

interface SubjectInfo {
  slotId: string;
  classId: string;
  className: string;
  subject: string;
  relation: 'owner' | 'delegate';
  coverNote: string | null;
}

interface SubjectState {
  cells: Set<string>;
  venue: string;
}

const keyOf = (d: number, p: number) => `${d}:${p}`;
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(x => b.has(x));

export default function MyTimetable() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const cur = getCurrentAcademicTerm();
  const [term, setTerm] = useState<TermName>(cur.term);
  const [year, setYear] = useState<number>(cur.year);

  const periodsQ = usePeriods(year);
  const teacherClassesQ = useTeacherClasses();
  const liveQ = useMyTimetable({ term, year });
  const mySubsQ = useMySubmissions(term, year);
  const submit = useSubmitTimetable();

  // ── My subjects (owner, or covering right now); never Form Teacher ──
  const subjects: SubjectInfo[] = useMemo(() => {
    const out: SubjectInfo[] = [];
    for (const c of teacherClassesQ.data ?? []) {
      for (const s of c.subjects) {
        if (!s.slotId || s.normalizedSubjectId === 'form-teacher' || s.subject === 'Form Teacher') continue;
        if (s.relation === 'delegate' && !s.canOperate) continue;
        out.push({
          slotId: s.slotId,
          classId: c.classId,
          className: c.className,
          subject: s.subject,
          relation: s.relation,
          coverNote:
            s.relation === 'delegate'
              ? `Covering ${s.coversTeacherName ?? 'a colleague'}`
              : s.coveredByTeacherName && s.delegationState === 'live'
                ? `Covered by ${s.coveredByTeacherName} now`
                : null,
        });
      }
    }
    return out.sort((a, b) => (a.className + a.subject).localeCompare(b.className + b.subject, undefined, { numeric: true }));
  }, [teacherClassesQ.data]);
  const slotIds = useMemo(() => subjects.map(s => s.slotId), [subjects]);
  const ctxQ = useClashContext(slotIds, term, year);

  // ── Baselines: pending submission if any, else live ─────────────────
  const { live, pending, rejected } = useMemo(() => {
    const live = new Map<string, SubjectState>();
    for (const r of liveQ.data ?? []) {
      const st = live.get(r.entry.slotId) ?? { cells: new Set<string>(), venue: '' };
      st.cells.add(keyOf(r.entry.dayOfWeek, r.entry.periodIndex));
      st.venue = st.venue || r.entry.venue || '';
      live.set(r.entry.slotId, st);
    }
    const pending = new Map<string, SubjectState>();
    const rejected = new Map<string, string>();
    // Newest first: the first submission that mentions a subject decides.
    const decided = new Set<string>();
    for (const sub of mySubsQ.data ?? []) {
      for (const slotId of sub.scopeSlotIds) {
        if (decided.has(slotId)) continue;
        decided.add(slotId);
        if (sub.status === 'pending') {
          const rows = sub.entries.filter(e => e.slotId === slotId);
          pending.set(slotId, {
            cells: new Set(rows.map(e => keyOf(e.dayOfWeek, e.periodIndex))),
            venue: rows.find(e => e.venue)?.venue ?? '',
          });
        } else if (sub.status === 'rejected') {
          rejected.set(slotId, sub.rejectedReason ?? 'Rejected by admin.');
        }
      }
    }
    return { live, pending, rejected };
  }, [liveQ.data, mySubsQ.data]);

  const baseline = (slotId: string): SubjectState =>
    pending.get(slotId) ?? live.get(slotId) ?? { cells: new Set(), venue: '' };

  // ── Edits (only subjects the teacher touched) ───────────────────────
  const [edits, setEdits] = useState<Record<string, SubjectState>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const stateOf = (slotId: string) => edits[slotId] ?? baseline(slotId);
  const sel = subjects.find(s => s.slotId === (selected ?? subjects[0]?.slotId)) ?? null;

  const changed = subjects.filter(s => {
    const e = edits[s.slotId];
    if (!e) return false;
    const b = baseline(s.slotId);
    return !sameSet(e.cells, b.cells) || e.venue.trim() !== b.venue.trim();
  });

  const rowsOf = (s: SubjectInfo): Array<RowLike & { venue: string }> =>
    [...stateOf(s.slotId).cells].map(k => {
      const [d, p] = k.split(':').map(Number);
      return {
        slotId: s.slotId, classId: s.classId, className: s.className, subject: s.subject,
        dayOfWeek: d as Weekday, periodIndex: p, venue: stateOf(s.slotId).venue,
      };
    });

  const periods = periodsQ.data ?? [];
  const ctx = ctxQ.data;

  const blockers = useMemo(() => {
    if (!sel || !ctx) return new Map<string, string>();
    const others = subjects.filter(s => s.slotId !== sel.slotId).flatMap(rowsOf);
    return cellBlockers(sel, others, ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.slotId, ctx, edits, live, pending, subjects]);

  const conflicts = useMemo(() => {
    if (!ctx || changed.length === 0) return [];
    const ids = new Set(changed.map(s => s.slotId));
    return checkClashes(subjects.flatMap(rowsOf), ctx).filter(c => c.entryIds.some(id => ids.has(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, edits, live, pending, subjects]);

  const toggle = (key: string) => {
    if (!sel) return;
    setMessage(null);
    const st = stateOf(sel.slotId);
    const cells = new Set(st.cells);
    if (cells.has(key)) cells.delete(key);
    else cells.add(key);
    setEdits(prev => ({ ...prev, [sel.slotId]: { ...st, cells } }));
  };
  const setVenue = (venue: string) => {
    if (!sel) return;
    setEdits(prev => ({ ...prev, [sel.slotId]: { ...stateOf(sel.slotId), venue } }));
  };
  const undo = (slotId: string) =>
    setEdits(prev => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });

  const doSubmit = async () => {
    setMessage(null);
    try {
      const r = await submit.mutateAsync({
        term,
        year,
        scopeSlotIds: changed.map(s => s.slotId),
        entries: changed.flatMap(rowsOf).map(r => ({
          slotId: r.slotId, dayOfWeek: r.dayOfWeek, periodIndex: r.periodIndex, venue: r.venue || null,
        })),
      });
      setEdits({});
      setMessage({ ok: true, text: `Sent for approval: ${changed.length} subject(s), ${r.submittedCount} period(s). Your current timetable stays live until the admin approves.` });
    } catch (e: any) {
      setMessage({ ok: false, text: e?.message || 'Could not submit.' });
    }
  };

  const weekCells = useMemo(
    () => subjects.flatMap(rowsOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subjects, edits, live, pending],
  );
  const changedIds = new Set(changed.map(s => s.slotId));

  const loading = periodsQ.isLoading || teacherClassesQ.isLoading || liveQ.isLoading || mySubsQ.isLoading;
  const loadError = periodsQ.error || teacherClassesQ.error || liveQ.error || mySubsQ.error || ctxQ.error;

  return (
    <DashboardLayout activeTab="my-timetable">
      <div className="p-3 sm:p-6 lg:p-8 space-y-4 max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Timetable</h1>
            <p className="text-sm text-gray-600">Pick a subject, tick its periods as on your printed timetable, then submit.</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={term} onChange={e => { setTerm(e.target.value as TermName); setEdits({}); }} className="border border-gray-300 rounded-lg px-2 py-2 text-sm">
              {TERMS.map(t => <option key={t}>{t}</option>)}
            </select>
            <select value={year} onChange={e => { setYear(Number(e.target.value)); setEdits({}); }} className="border border-gray-300 rounded-lg px-2 py-2 text-sm">
              {[cur.year, cur.year + 1].map(y => <option key={y}>{y}</option>)}
            </select>
            <button
              onClick={() => { teacherClassesQ.refetch(); invalidateTimetableCaches(qc); }}
              className="p-2 rounded-lg border border-gray-300 text-gray-600"
              aria-label="Refresh"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {term === cur.term && year === cur.year && <NowNextCard />}

        {loadError && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3">
            Could not load your timetable: {(loadError as Error).message}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm py-10 justify-center">
            <Loader2 className="animate-spin" size={18} /> Loading…
          </div>
        ) : periods.length === 0 ? (
          <Notice text={`The bell schedule for ${year} has not been set up yet. Ask the admin to add the periods first.`} />
        ) : subjects.length === 0 ? (
          <Notice text="You have no subjects assigned. Ask the admin to assign your classes and subjects first." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-4">
            {/* Subject list */}
            <div className="space-y-1.5">
              {subjects.map(s => {
                const st = stateOf(s.slotId);
                const isSel = sel?.slotId === s.slotId;
                const status = changedIds.has(s.slotId)
                  ? { text: 'Changed — not sent', cls: 'text-blue-700' }
                  : pending.has(s.slotId)
                    ? { text: 'Waiting for approval', cls: 'text-amber-700' }
                    : rejected.has(s.slotId)
                      ? { text: 'Rejected — fix and resend', cls: 'text-red-700' }
                      : live.has(s.slotId)
                        ? { text: 'Live', cls: 'text-green-700' }
                        : { text: 'Not set', cls: 'text-gray-500' };
                return (
                  <button
                    key={s.slotId}
                    onClick={() => setSelected(s.slotId)}
                    className={`w-full text-left rounded-lg border px-3 py-2 ${isSel ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-900">{s.className} · {s.subject}</span>
                      <span className="text-xs text-gray-600 whitespace-nowrap">{st.cells.size}/week</span>
                    </div>
                    <div className={`text-[11px] ${status.cls}`}>{status.text}{s.coverNote ? ` · ${s.coverNote}` : ''}</div>
                  </button>
                );
              })}
            </div>

            {/* Editor */}
            {sel && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-gray-900">{sel.className} · {sel.subject}</h2>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    Room
                    <input
                      value={stateOf(sel.slotId).venue}
                      onChange={e => setVenue(e.target.value)}
                      placeholder="optional, e.g. Lab 2"
                      maxLength={40}
                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-40"
                    />
                  </label>
                </div>

                {rejected.has(sel.slotId) && !pending.has(sel.slotId) && (
                  <div className="text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2">
                    Admin's note: {rejected.get(sel.slotId)}
                  </div>
                )}

                {!ctx && ctxQ.isLoading ? (
                  <div className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Checking the school timetable…</div>
                ) : (
                  <PeriodTickGrid periods={periods} ticked={stateOf(sel.slotId).cells} blockers={blockers} onToggle={toggle} disabled={!ctx} />
                )}

                <BlockSummary subject={sel} rows={rowsOf(sel)} periods={periods} />

                {edits[sel.slotId] && (
                  <button onClick={() => undo(sel.slotId)} className="text-xs text-gray-600 inline-flex items-center gap-1">
                    <Undo2 size={12} /> Undo changes to this subject
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Submit bar */}
        {subjects.length > 0 && periods.length > 0 && (
          <div className="sticky bottom-0 z-10 bg-white/95 backdrop-blur border border-gray-200 rounded-xl p-3 space-y-2 shadow-sm">
            <ConflictWarning conflicts={conflicts} />
            {message && (
              <div className={`text-sm rounded-lg px-3 py-2 flex items-start gap-2 ${message.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                {message.ok ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
                {message.text}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-gray-600">
                {changed.length === 0 ? 'No changes yet.' : `${changed.length} subject(s) changed: ${changed.map(s => `${s.className} ${s.subject}`).join(', ')}`}
              </span>
              <button
                onClick={doSubmit}
                disabled={changed.length === 0 || conflicts.length > 0 || submit.isPending || !ctx}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-40"
              >
                {submit.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Submit changes for approval
              </button>
            </div>
          </div>
        )}

        {/* Whole week preview */}
        {subjects.length > 0 && periods.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <Clock size={14} /> My week — compare with your printed timetable
            </h2>
            <WeekGrid
              periods={periods}
              cells={weekCells}
              title={c => `${c.className} ${c.subject}`}
              subtitle={c => (c as any).venue || null}
              tone={c => (changedIds.has(c.slotId) ? 'added' : 'normal')}
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-lg p-4 flex items-start gap-2">
      <AlertCircle size={16} className="mt-0.5" /> {text}
    </div>
  );
}

function BlockSummary({ subject, rows, periods }: { subject: SubjectInfo; rows: RowLike[]; periods: any[] }) {
  const blocks = groupIntoBlocks(rows, periods);
  if (blocks.length === 0) return <p className="text-xs text-gray-500">No periods ticked for {subject.subject} yet.</p>;
  return (
    <p className="text-xs text-gray-700">
      <span className="font-semibold">{rows.length} period(s) a week:</span>{' '}
      {blocks.map(b => `${DAY_SHORT[b.dayOfWeek - 1]} ${b.label}${b.size > 1 ? ` (${blockSizeName(b.size)})` : ''}`).join(' · ')}
    </p>
  );
}