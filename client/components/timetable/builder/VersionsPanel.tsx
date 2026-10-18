// Timetable builder → Timetables: the term's drafts and published timetable.
// Open one to review it by class, teacher or room; drafts can be edited by
// hand (moves and swaps are clash-checked), regenerated around locked
// lessons, and published by an admin. Branded PDFs for any view.
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, Copy, Download, FileText, Lock, Rocket, Save, Trash2, Undo2, Unlock, Wand2, XCircle,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useInvalidateBuilder, useVersions } from '@/hooks/useTimetableBuilder';
import { invalidateTimetableCaches } from '@/hooks/useTimetable';
import { DayRowsGrid, type GridLesson } from '@/components/timetable/DayRowsGrid';
import { hardProblems } from '@/services/timetableGenerator/solver';
import { applyMove, moveTargets } from '@/services/timetableGenerator/editor';
import { allTeacherPages, classPages, teacherPage } from '@/services/timetableGenerator/documents';
import { deleteDraft, getVersion, publishVersion, saveDraft, withdrawTimetable } from '@/services/timetableGenerator/service';
import type { PlacedLesson, TimetableVersion, Weekday } from '@/services/timetableGenerator/types';
import { downloadPdf, generateTimetablePDF, pdfFileName, type TimetablePage } from '@/services/pdf/timetablePDF';
import { formatTermLabel } from '@/utils/academicTerm';
import { slotInfoFor, solveAndSave, useProblem } from './GeneratePanel';
import { Btn, Card, Notice, errText, fmtDate, fmtYMD, useBuilder } from './shared';
import type { SolverProgress, SolverRun } from '@/services/timetableGenerator/runSolver';

const STATUS = {
  draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-700' },
  published: { label: 'Published — teachers see this', cls: 'bg-green-100 text-green-800' },
  archived: { label: 'Replaced', cls: 'bg-amber-100 text-amber-800' },
} as const;

export function VersionsPanel({ openId, onOpen }: { openId: string | null; onOpen: (id: string | null) => void }) {
  const { term, year } = useBuilder();
  const versionsQ = useVersions(term, year);
  const list = versionsQ.data ?? [];

  if (openId) return <VersionEditor id={openId} onClose={() => onOpen(null)} onOpen={onOpen} />;

  return (
    <Card title={`Timetables · ${formatTermLabel(term, year)}`}>
      {versionsQ.isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-gray-500">None yet. Generate one in the Generate tab.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {list.map(v => (
            <li key={v.id}>
              <button type="button" onClick={() => onOpen(v.id)} className="flex w-full flex-col gap-1 py-3 text-left hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between sm:px-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-gray-900">{v.name}</span>
                  <span className="block text-xs text-gray-500">
                    {v.createdByName} · {fmtDate(v.updatedAt ?? v.createdAt)}
                    {v.stats && ` · ${v.lessons.length} lessons`}
                    {v.unplaced.length > 0 && ` · ${v.unplaced.length} not placed`}
                    {v.effectiveFrom && ` · in force from ${fmtYMD(v.effectiveFrom)}`}
                  </span>
                </span>
                <span className={`self-start rounded-full px-2 py-0.5 text-xs font-medium sm:self-auto ${STATUS[v.status].cls}`}>{STATUS[v.status].label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type View = 'class' | 'teacher' | 'room';

function VersionEditor({ id, onClose, onOpen }: { id: string; onClose: () => void; onOpen: (id: string | null) => void }) {
  const { isAdmin, actor, term, year, inputs } = useBuilder();
  const P = useProblem();
  const qc = useQueryClient();
  const invalidate = useInvalidateBuilder();
  const [v, setV] = useState<TimetableVersion | null>(null);
  const [lessons, setLessons] = useState<PlacedLesson[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [view, setView] = useState<View>('class');
  const [who, setWho] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<'publish' | 'withdraw' | 'delete' | null>(null);
  const [progress, setProgress] = useState<SolverProgress | null>(null);
  const [run, setRun] = useState<SolverRun | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    let live = true;
    setLoadErr(null);
    getVersion(id)
      .then(x => {
        if (!live) return;
        if (!x) setLoadErr('This timetable no longer exists.');
        setV(x);
        setLessons(x?.lessons ?? []);
        setName(x?.name ?? '');
        setDirty(false);
        setSelected(null);
      })
      .catch(e => live && setLoadErr(errText(e)));
    return () => {
      live = false;
    };
  }, [id]);

  const editable = v?.status === 'draft';
  const slots = v?.slots ?? {};
  const classes = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of lessons) m.set(l.classId, slots[l.slotId]?.className ?? l.classId);
    for (const c of P.classes) if (!m.has(c.id)) m.set(c.id, c.name);
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [lessons, slots, P.classes]);
  const options = view === 'class' ? classes : view === 'teacher' ? P.teachers : P.rooms;
  const current = options.some(o => o.id === who) ? who : options[0]?.id ?? '';

  const slotById = useMemo(() => new Map(P.slots.map(s => [s.slotId, s])), [P.slots]);
  const visible = useMemo(() => {
    return lessons
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => {
        if (view === 'class') return l.classId === current;
        const s = slotById.get(l.slotId);
        return view === 'teacher' ? !!s?.teacherIds.includes(current) : s?.roomId === current;
      });
  }, [lessons, view, current, slotById]);

  const problems = useMemo(() => hardProblems(P, lessons), [P, lessons]);
  const unknown = useMemo(() => [...new Set(lessons.filter(l => !slotById.has(l.slotId)).map(l => `${slots[l.slotId]?.className ?? ''} ${slots[l.slotId]?.subject ?? l.slotId}`.trim()))], [lessons, slotById, slots]);
  const targets = useMemo(() => (editable && selected !== null && view === 'class' ? moveTargets(P, lessons, selected) : undefined), [editable, selected, view, P, lessons]);

  const blocked = useMemo(() => {
    const m = new Map<string, string>();
    if (view !== 'class') return m;
    const c = P.classes.find(x => x.id === current);
    if (!c) return m;
    for (const ev of inputs.config.events) {
      if (ev.levels.length && !ev.levels.includes(c.levelKey)) continue;
      for (const d of ev.days) for (const p of ev.periods) m.set(`${d}:${p}`, ev.name);
    }
    return m;
  }, [view, current, P.classes, inputs.config.events]);

  const gridLessons: GridLesson[] = visible.map(({ l, i }) => {
    const info = slots[l.slotId];
    const s = slotById.get(l.slotId);
    const teacher = s?.teacherNames[0] ?? 'No teacher yet';
    const title = view === 'class' ? info?.subject ?? l.slotId : info?.className ?? l.classId;
    const lines = view === 'class' ? [teacher, info?.roomName] : view === 'teacher' ? [info?.subject, info?.roomName] : [info?.subject, teacher];
    const clash = problems.some(p => p.slotIds.includes(l.slotId) && p.day === l.day && p.period >= l.start && p.period < l.start + l.size);
    return { key: String(i), day: l.day, start: l.start, size: l.size, title, lines, locked: l.locked, tone: selected === i ? 'selected' : clash ? 'warn' : s ? 'normal' : 'muted' };
  });

  const pick = (key: string) => {
    if (!editable || view !== 'class') return;
    const i = Number(key);
    setSelected(selected === i ? null : i);
  };
  const moveTo = (day: number, start: number) => {
    if (selected === null || !targets) return;
    const t = targets.get(`${day}:${start}`);
    if (!t?.ok) {
      if (t?.reason) setMsg({ tone: 'warn', text: t.reason });
      return;
    }
    setLessons(applyMove(lessons, selected, day as Weekday, start, t));
    setSelected(null);
    setDirty(true);
    setMsg(null);
  };
  const toggleLock = () => {
    if (selected === null) return;
    setLessons(lessons.map((l, i) => (i === selected ? { ...l, locked: !l.locked || undefined } : l)));
    setDirty(true);
  };

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      if ((e as Error)?.message !== 'Cancelled') setMsg({ tone: 'error', text: errText(e) });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  const save = () =>
    act('save', async () => {
      await saveDraft({ id: v!.id, name, term: v!.term, year: v!.year, lessons, slots: { ...slotInfoFor(P), ...slots }, unplaced: v!.unplaced, notes: v!.notes, stats: v!.stats }, actor);
      setV({ ...v!, lessons, name });
      setDirty(false);
      invalidate();
      setMsg({ tone: 'ok', text: 'Saved.' });
    });

  const regenerate = () =>
    act('regen', async () => {
      const locked = lessons.filter(l => l.locked);
      const { result } = await solveAndSave({ P, name, maxMillis: 30_000, seed: Math.floor(Math.random() * 1e6) + 1, locked, initial: lessons, id: v!.id, actor, onProgress: setProgress, setRun });
      setProgress(null);
      const fresh = await getVersion(v!.id);
      setV(fresh);
      setLessons(fresh?.lessons ?? result.lessons);
      setDirty(false);
      invalidate();
      setMsg({ tone: result.unplaced.length ? 'warn' : 'ok', text: result.unplaced.length ? `${result.unplaced.length} lessons could not be placed.` : `Regenerated around ${locked.length} locked lesson${locked.length === 1 ? '' : 's'}.` });
    }).finally(() => setProgress(null));

  const copy = () =>
    act('copy', async () => {
      const newId = await saveDraft({ name: `${v!.name} (copy)`, term: v!.term, year: v!.year, lessons: v!.lessons.map(({ locked: _l, ...l }) => l), slots: v!.slots, unplaced: v!.unplaced, notes: v!.notes, stats: v!.stats }, actor);
      invalidate();
      onOpen(newId);
    });

  const publish = () =>
    act('publish', async () => {
      if (dirty) await saveDraft({ id: v!.id, name, term: v!.term, year: v!.year, lessons, slots: { ...slotInfoFor(P), ...slots }, unplaced: v!.unplaced, notes: v!.notes, stats: v!.stats }, actor);
      const r = await publishVersion(v!.id, actor);
      setV(await getVersion(v!.id));
      setDirty(false);
      invalidate();
      invalidateTimetableCaches(qc);
      setMsg({ tone: 'ok', text: `Published: ${r.rows} periods are now every teacher's timetable (from ${fmtYMD(r.effectiveFrom)}).` });
    });

  const withdraw = () =>
    act('withdraw', async () => {
      const n = await withdrawTimetable(v!.term, v!.year, actor);
      setV(await getVersion(v!.id));
      invalidate();
      invalidateTimetableCaches(qc);
      setMsg({ tone: 'ok', text: `Withdrawn: ${n} periods removed from teachers' timetables from today.` });
    });

  const remove = () =>
    act('delete', async () => {
      await deleteDraft(v!.id);
      invalidate();
      onClose();
    });

  const pdf = (kind: 'view' | 'classes' | 'teachers') =>
    act(`pdf-${kind}`, async () => {
      const src = { lessons, slots: { ...slotInfoFor(P), ...slots } };
      let pages: TimetablePage[];
      let title: string;
      if (kind === 'classes') {
        pages = classPages(src, P);
        title = 'Master timetable';
      } else if (kind === 'teachers') {
        pages = allTeacherPages(src, P);
        title = 'Teachers’ timetables';
      } else if (view === 'class') {
        pages = classPages(src, P, [current]);
        title = 'Class timetable';
      } else if (view === 'teacher') {
        pages = [teacherPage(src, P, current)];
        title = 'Teacher timetable';
      } else {
        const room = P.rooms.find(r => r.id === current);
        pages = [{ heading: room?.name ?? 'Room', subheading: 'Room timetable', cells: visible.map(({ l }) => ({ day: l.day, start: l.start, size: l.size, lines: [slots[l.slotId]?.className ?? '', slots[l.slotId]?.subject ?? ''] })) }];
        title = 'Room timetable';
      }
      const note = v?.status === 'published' && v.effectiveFrom ? `In force from ${fmtYMD(v.effectiveFrom)}` : v?.status === 'draft' ? 'DRAFT - not yet published' : undefined;
      const bytes = await generateTimetablePDF({ title, term: v!.term, year: v!.year, note, pages });
      const label = kind === 'view' ? options.find(o => o.id === current)?.name ?? title : title;
      downloadPdf(bytes, pdfFileName(label, v!.term, v!.year));
    });

  if (loadErr) return <div className="space-y-3"><Btn onClick={onClose}><ArrowLeft size={14} /> All timetables</Btn><Notice tone="error">{loadErr}</Notice></div>;
  if (!v) return <p className="text-sm text-gray-500">Loading…</p>;

  const sel = selected !== null ? lessons[selected] : null;

  return (
    <div className="space-y-4 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Btn variant="ghost" onClick={onClose}><ArrowLeft size={14} /> All timetables</Btn>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS[v.status].cls}`}>{STATUS[v.status].label}</span>
      </div>

      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            {editable ? (
              <input aria-label="Timetable name" value={name} onChange={e => { setName(e.target.value); setDirty(true); }} className="w-full max-w-md rounded-lg border border-gray-300 px-2 py-1.5 text-lg font-semibold" />
            ) : (
              <h2 className="text-lg font-semibold text-gray-900">{v.name}</h2>
            )}
            <p className="mt-1 text-xs text-gray-600">
              {formatTermLabel(v.term, v.year)} · {lessons.length} lessons
              {v.stats && ` · ${v.stats.placedRequired} of ${v.stats.required} required lessons placed`}
              {v.publishedByName && ` · published by ${v.publishedByName}${v.effectiveFrom ? ` from ${fmtYMD(v.effectiveFrom)}` : ''}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {editable && <Btn variant="primary" busy={busy === 'save'} disabled={!dirty} onClick={save}><Save size={14} /> Save</Btn>}
            {editable && <Btn busy={busy === 'regen'} onClick={regenerate} title="Keeps locked lessons, re-solves the rest"><Wand2 size={14} /> Regenerate unlocked</Btn>}
            {!editable && <Btn busy={busy === 'copy'} onClick={copy}><Copy size={14} /> Copy to a new draft</Btn>}
            {isAdmin && editable && <Btn variant="primary" onClick={() => setConfirm('publish')} disabled={v.unplaced.length > 0 || problems.length > 0}><Rocket size={14} /> Publish</Btn>}
            {isAdmin && v.status === 'published' && <Btn variant="danger" onClick={() => setConfirm('withdraw')}><XCircle size={14} /> Withdraw</Btn>}
            {editable && <Btn variant="danger" onClick={() => setConfirm('delete')}><Trash2 size={14} /> Delete draft</Btn>}
          </div>
        </div>

        {confirm && (
          <div className="mt-3 rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm">
            {confirm === 'publish' && <p>Publish <b>{name}</b>? From today it becomes the timetable of every teacher and class for {formatTermLabel(v.term, v.year)}, replacing the one in use. Registers already taken stay as they are.</p>}
            {confirm === 'withdraw' && <p>Withdraw the published timetable? From today teachers will have no timetable for {formatTermLabel(v.term, v.year)} until another is published.</p>}
            {confirm === 'delete' && <p>Delete the draft <b>{v.name}</b>? This cannot be undone.</p>}
            <div className="mt-2 flex gap-2">
              <Btn variant={confirm === 'publish' ? 'primary' : 'danger'} busy={!!busy} onClick={confirm === 'publish' ? publish : confirm === 'withdraw' ? withdraw : remove}>
                {confirm === 'publish' ? 'Publish now' : confirm === 'withdraw' ? 'Withdraw' : 'Delete'}
              </Btn>
              <Btn variant="ghost" onClick={() => setConfirm(null)}>Cancel</Btn>
            </div>
          </div>
        )}

        {progress && (
          <div className="mt-3 space-y-2" aria-live="polite">
            <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${Math.max(3, Math.round(progress.fraction * 100))}%` }} /></div>
            <Btn variant="danger" onClick={() => run?.cancel()}>Cancel</Btn>
          </div>
        )}
        {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
        {isAdmin && editable && (v.unplaced.length > 0 || problems.length > 0) && (
          <p className="mt-2 text-xs text-gray-500">Publishing is possible once every lesson has a place and there are no clashes.</p>
        )}
      </Card>

      {(problems.length > 0 || v.unplaced.length > 0 || unknown.length > 0) && (
        <div className="space-y-2">
          {problems.length > 0 && (
            <Notice tone="error">
              <p className="font-medium">{problems.length} clash{problems.length === 1 ? '' : 'es'} with today's allocations{v.status === 'published' ? ' (a teacher was re-allocated after publishing)' : ''}:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">{problems.slice(0, 12).map((p, i) => <li key={i}>{p.message}</li>)}</ul>
            </Notice>
          )}
          {v.unplaced.length > 0 && (
            <Notice tone="warn">
              <p className="font-medium">Not placed:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">{v.unplaced.slice(0, 20).map((u, i) => <li key={i}>{u.className} {u.subject}: {u.reason}</li>)}</ul>
            </Notice>
          )}
          {unknown.length > 0 && <Notice tone="info">No longer in the curriculum: {unknown.join(', ')}.</Notice>}
        </div>
      )}

      <Card
        title={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-300 p-0.5" role="tablist" aria-label="View by">
              {(['class', 'teacher', 'room'] as View[]).map(x => (
                <button key={x} role="tab" aria-selected={view === x} onClick={() => { setView(x); setSelected(null); setWho(''); }} disabled={x === 'room' && !P.rooms.length}
                  className={`rounded-md px-3 py-1 text-sm capitalize disabled:opacity-40 ${view === x ? 'bg-blue-600 text-white' : 'text-gray-700'}`}>{x}</button>
              ))}
            </div>
            <select aria-label={`Choose a ${view}`} value={current} onChange={e => { setWho(e.target.value); setSelected(null); }} className="min-h-[36px] max-w-[14rem] rounded-lg border border-gray-300 px-2 text-sm font-normal">
              {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        }
        actions={
          <>
            <Btn busy={busy === 'pdf-view'} onClick={() => pdf('view')} disabled={!current}><Download size={14} /> PDF</Btn>
            <Btn busy={busy === 'pdf-classes'} onClick={() => pdf('classes')}><FileText size={14} /> All classes</Btn>
            <Btn busy={busy === 'pdf-teachers'} onClick={() => pdf('teachers')}><FileText size={14} /> All teachers</Btn>
          </>
        }
      >
        {editable && view === 'class' && (
          <p className="mb-2 text-xs text-gray-600">
            {sel
              ? <>Moving <b>{slots[sel.slotId]?.subject}</b>: pick a green place, or a lesson marked “Swap”. Places that would clash are not offered (hover to see why).</>
              : 'Tap a lesson to move it, swap it or lock it in place.'}
          </p>
        )}
        <DayRowsGrid
          lessons={gridLessons}
          onLessonClick={editable && view === 'class' ? pick : undefined}
          onCellClick={editable && view === 'class' ? moveTo : undefined}
          targets={targets}
          blocked={blocked}
          ariaLabel={`Timetable of ${options.find(o => o.id === current)?.name ?? ''}`}
        />
        {sel && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Btn onClick={toggleLock}>{sel.locked ? <><Unlock size={14} /> Unlock</> : <><Lock size={14} /> Lock in place</>}</Btn>
            <Btn variant="ghost" onClick={() => setSelected(null)}><Undo2 size={14} /> Done</Btn>
          </div>
        )}
        {view === 'teacher' && (
          <p className="mt-2 text-xs text-gray-600">{visible.reduce((n, { l }) => n + l.size, 0)} periods a week.</p>
        )}
      </Card>

      {v.notes.length > 0 && (
        <Card title={<span className="inline-flex items-center gap-1.5"><CheckCircle2 size={15} className="text-gray-400" /> Preferences not fully met ({v.notes.length})</span>}>
          <ul className="max-h-60 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm text-gray-700">{v.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </Card>
      )}
      <p className="text-xs text-gray-500">{term === v.term && year === v.year ? '' : `This timetable is for ${formatTermLabel(v.term, v.year)}.`}</p>
    </div>
  );
}
