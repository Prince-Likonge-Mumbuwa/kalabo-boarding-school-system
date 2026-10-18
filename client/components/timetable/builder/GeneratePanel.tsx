// Timetable builder → Generate: checks the set-up can work, then runs the
// solver (in the background, with progress) and saves the result as a draft.
import { useMemo, useRef, useState } from 'react';
import { Play, Square, Wand2 } from 'lucide-react';
import { useInvalidateBuilder } from '@/hooks/useTimetableBuilder';
import { buildProblem, checkProblem } from '@/services/timetableGenerator/problem';
import { runSolver, type SolverProgress, type SolverRun } from '@/services/timetableGenerator/runSolver';
import { liveLessons, saveDraft } from '@/services/timetableGenerator/service';
import type { PlacedLesson, Problem, SolveResult, VersionSlotInfo } from '@/services/timetableGenerator/types';
import { formatTermLabel } from '@/utils/academicTerm';
import { useReadiness } from './ReadinessPanel';
import { Btn, Card, Notice, errText, useBuilder } from './shared';

const BUDGETS = [
  { ms: 15_000, label: 'Quick (about 15 seconds)' },
  { ms: 45_000, label: 'Standard (about 45 seconds)' },
  { ms: 120_000, label: 'Thorough (up to 2 minutes)' },
];

export function useProblem(): Problem {
  const { inputs, term, year } = useBuilder();
  return useMemo(
    () => buildProblem({ term, year, config: inputs.config, classes: inputs.classes, slots: inputs.slotInputs }),
    [inputs, term, year],
  );
}

/** Per-slot details saved with a version so it shows without lookups. */
export function slotInfoFor(P: Problem): Record<string, VersionSlotInfo> {
  const rooms = new Map(P.rooms.map(r => [r.id, r.name]));
  const out: Record<string, VersionSlotInfo> = {};
  for (const s of P.slots) {
    out[s.slotId] = { classId: s.classId, className: s.className, subject: s.subject, normalizedSubject: s.normalizedSubject, roomName: s.roomId ? rooms.get(s.roomId) ?? null : null };
  }
  return out;
}

export async function solveAndSave(opts: {
  P: Problem;
  name: string;
  maxMillis: number;
  seed: number;
  locked?: PlacedLesson[];
  initial?: PlacedLesson[];
  id?: string;
  actor: { uid: string; name: string };
  onProgress: (p: SolverProgress) => void;
  setRun: (r: SolverRun | null) => void;
}): Promise<{ id: string; result: SolveResult }> {
  const run = runSolver(opts.P, { seed: opts.seed, maxMillis: opts.maxMillis, locked: opts.locked, initial: opts.initial }, opts.onProgress);
  opts.setRun(run);
  try {
    const result = await run.promise;
    const id = await saveDraft(
      {
        id: opts.id,
        name: opts.name,
        term: opts.P.term,
        year: opts.P.year,
        lessons: result.lessons,
        slots: slotInfoFor(opts.P),
        unplaced: result.unplaced,
        notes: result.notes,
        stats: result.stats,
      },
      opts.actor,
    );
    return { id, result };
  } finally {
    opts.setRun(null);
  }
}

export function GeneratePanel({ onOpenVersion, onOpenReadiness }: { onOpenVersion: (id: string) => void; onOpenReadiness: () => void }) {
  const { term, year, actor } = useBuilder();
  const { readiness } = useReadiness();
  const P = useProblem();
  const issues = useMemo(() => checkProblem(P), [P]);
  const errors = issues.filter(i => i.level === 'error');
  const warnings = issues.filter(i => i.level === 'warning');
  const invalidate = useInvalidateBuilder();

  const [name, setName] = useState(`${formatTermLabel(term, year)} timetable`);
  const [budget, setBudget] = useState(BUDGETS[1].ms);
  const [fromLive, setFromLive] = useState(false);
  const [progress, setProgress] = useState<SolverProgress | null>(null);
  const [run, setRun] = useState<SolverRun | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showWarnings, setShowWarnings] = useState(false);
  const started = useRef(0);

  const periods = P.units.filter(u => !u.optional).reduce((n, u) => n + u.size, 0);
  const canGenerate = readiness.ready && errors.length === 0 && P.units.length > 0;

  const generate = async () => {
    setMsg(null);
    setProgress({ phase: 'placing', fraction: 0, score: Infinity, unplaced: 0 });
    started.current = Date.now();
    try {
      const initial = fromLive ? (await liveLessons(term, year)).lessons : undefined;
      const seed = Math.floor(Math.random() * 1_000_000) + 1;
      const { id, result } = await solveAndSave({ P, name, maxMillis: budget, seed, initial, actor, onProgress: setProgress, setRun });
      invalidate();
      setMsg({
        ok: result.unplaced.length === 0,
        text: result.unplaced.length === 0
          ? `Done: all ${result.stats.placedRequired} lessons placed with no clashes. Saved as a draft.`
          : `${result.unplaced.length} lesson${result.unplaced.length === 1 ? '' : 's'} could not be placed. Saved as a draft so you can see why.`,
      });
      onOpenVersion(id);
    } catch (e) {
      if ((e as Error)?.message !== 'Cancelled') setMsg({ ok: false, text: errText(e) });
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      {!readiness.ready && (
        <Notice tone="warn">
          The timetable can be generated once every department has marked its allocations complete and every level has its subjects.{' '}
          <button type="button" className="font-medium underline" onClick={onOpenReadiness}>See what is missing</button>
        </Notice>
      )}

      <Card title="Before generating">
        <p className="text-sm text-gray-700">
          {P.classes.length} classes · {P.slots.length} class subjects · {periods} periods to place · {P.teachers.length} teachers · {P.rooms.length} special room{P.rooms.length === 1 ? '' : 's'}
        </p>
        <div className="mt-3 space-y-2">
          {errors.length === 0 ? (
            <Notice tone="ok">The set-up adds up: no class, teacher or room needs more periods than the week has.</Notice>
          ) : (
            <Notice tone="error">
              <p className="font-medium">These make a timetable impossible — fix them first:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">{errors.map(e => <li key={e.message}>{e.message}</li>)}</ul>
            </Notice>
          )}
          {warnings.length > 0 && (
            <Notice tone="warn">
              <button type="button" className="font-medium underline" onClick={() => setShowWarnings(s => !s)}>
                {warnings.length} thing{warnings.length === 1 ? '' : 's'} worth knowing
              </button>
              {showWarnings && <ul className="mt-1 list-disc space-y-0.5 pl-5">{warnings.map(w => <li key={w.message}>{w.message}</li>)}</ul>}
            </Notice>
          )}
        </div>
      </Card>

      <Card title="Generate">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-gray-700">
            Name
            <input value={name} onChange={e => setName(e.target.value)} maxLength={80} className="mt-1 block w-full min-h-[38px] rounded-lg border border-gray-300 px-2" />
          </label>
          <label className="text-sm text-gray-700">
            Search time
            <select value={budget} onChange={e => setBudget(Number(e.target.value))} className="mt-1 block w-full min-h-[38px] rounded-lg border border-gray-300 px-2">
              {BUDGETS.map(b => <option key={b.ms} value={b.ms}>{b.label}</option>)}
            </select>
          </label>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={fromLive} onChange={e => setFromLive(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>Start from the timetable in use now — keeps what still fits, so teachers' weeks change less.</span>
        </label>

        {progress ? (
          <div className="mt-4 space-y-2" aria-live="polite">
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${Math.max(3, Math.round(Math.max(progress.fraction, Math.min(0.98, (Date.now() - started.current) / budget)) * 100))}%` }} />
            </div>
            <p className="text-sm text-gray-600">
              {progress.phase === 'placing' ? 'Placing lessons…' : 'Improving the timetable…'}
              {progress.unplaced > 0 && progress.phase === 'placing' ? ` ${progress.unplaced} still to place.` : ''}
            </p>
            <Btn variant="danger" onClick={() => run?.cancel()} disabled={!run}><Square size={14} /> Cancel</Btn>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Btn variant="primary" onClick={generate} disabled={!canGenerate}><Wand2 size={15} /> Generate timetable</Btn>
            {!canGenerate && <span className="text-xs text-gray-500">{!readiness.ready ? 'Waiting for readiness.' : errors.length ? 'Fix the problems above.' : 'Nothing to timetable yet.'}</span>}
          </div>
        )}
        {msg && <div className="mt-3"><Notice tone={msg.ok ? 'ok' : 'warn'}>{msg.text}</Notice></div>}
        <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500"><Play size={12} /> Generating never changes the timetable teachers see. A draft goes live only when an admin publishes it.</p>
      </Card>
    </div>
  );
}
