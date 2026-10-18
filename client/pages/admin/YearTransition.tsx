// @/pages/admin/YearTransition.tsx
//
// Admin: close the academic year and move every learner into the new one.
//
//   1. Year      — which year closes, which levels are final.
//   2. Classes   — where each class goes (Form 1A → Form 2A, Grade 12 graduates).
//   3. Learners  — exceptions: repeat, leave, a different stream, …
//   4. Review    — numbers per class, new classes, classes to archive, id
//                  changes, problems. Type the new year to run.
//
// Nothing is written until "Run". A run can be resumed if it stops and
// undone afterwards (History tab). See services/promotionService.ts.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Download,
  GraduationCap,
  History,
  Info,
  Loader2,
  RotateCcw,
  Search,
  Users,
} from 'lucide-react';
import {
  ACTION_LABEL,
  DEFAULT_SETTINGS,
  buildPromotionPlan,
  defaultClassMap,
  idChangeRows,
  isTempClassId,
  nextLevelOf,
  suggestedArchive,
} from '@/services/promotionPlan';
import {
  checkUndo,
  executePromotionRun,
  loadFormerLearners,
  loadTransitionData,
  startPromotionRun,
  undoPromotionRun,
  type RunOutcome,
  type RunProgress,
  type UndoCheck,
} from '@/services/promotionService';
import { resultsService } from '@/services/resultsService';

/**
 * After learners were promoted, graduated or left: bring the face records in
 * line at once (leavers' faces deleted, promoted learners' classes updated)
 * instead of waiting for the 3-hourly face sync. Best effort: if it fails,
 * the scheduled sync does the same later.
 */
const syncFaces = () => {
  import('@/lib/face/faceApi').then(m => m.faceApi.sync()).catch(() => {});
};
import type {
  ClassDestination,
  LearnerDecision,
  PlanItem,
  PromotionAction,
  PromotionRun,
  PromotionSettings,
} from '@/types/promotion';

type Tab = 'transition' | 'history' | 'former';
type Step = 1 | 2 | 3 | 4 | 5;

const STEPS: Array<{ n: Step; label: string }> = [
  { n: 1, label: 'Year' },
  { n: 2, label: 'Classes' },
  { n: 3, label: 'Learners' },
  { n: 4, label: 'Review & run' },
];

const ACTIONS: PromotionAction[] = ['promote', 'repeat', 'graduate', 'leave', 'stay'];

const ACTION_STYLE: Record<PromotionAction, string> = {
  promote: 'bg-blue-50 text-blue-800 border-blue-200',
  repeat: 'bg-amber-50 text-amber-800 border-amber-200',
  graduate: 'bg-green-50 text-green-800 border-green-200',
  leave: 'bg-gray-100 text-gray-700 border-gray-300',
  stay: 'bg-purple-50 text-purple-800 border-purple-200',
};

const destKey = (d: ClassDestination | undefined) => (!d ? '' : d.kind === 'graduate' ? 'graduate' : d.classId);

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function YearTransition() {
  const [tab, setTab] = useState<Tab>('transition');
  const dataQuery = useQuery({ queryKey: ['yearTransition'], queryFn: loadTransitionData, staleTime: 0 });
  const data = dataQuery.data;

  const unfinished = data?.runs.find(r => r.status === 'running' || r.status === 'failed');

  return (
    <DashboardLayout activeTab="year-transition">
      <div className="p-3 sm:p-6 lg:p-8 space-y-5 max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Year transition</h1>
            <p className="text-sm text-gray-600">
              Close the academic year: promote learners, graduate the final year, and get classes ready for new admissions.
            </p>
          </div>
          {data && (
            <div className="text-sm text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2">
              School year: <span className="font-semibold">{data.yearState?.currentYear ?? data.suggestedFromYear}</span>
            </div>
          )}
        </div>

        <div className="flex gap-1 border-b border-gray-200">
          {([
            ['transition', 'Year transition', GraduationCap],
            ['history', 'History', History],
            ['former', 'Graduates & leavers', Users],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {dataQuery.isLoading && (
          <div className="flex items-center gap-2 text-gray-600 text-sm"><Loader2 size={16} className="animate-spin" /> Loading classes and learners…</div>
        )}
        {dataQuery.error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3">
            {(dataQuery.error as Error).message || 'Could not load the school data.'}
          </div>
        )}

        {data && tab === 'transition' && (
          unfinished
            ? <UnfinishedRun run={unfinished} onDone={() => dataQuery.refetch()} />
            : <Wizard data={data} onFinished={() => dataQuery.refetch()} />
        )}
        {data && tab === 'history' && <RunHistory runs={data.runs} onChanged={() => dataQuery.refetch()} />}
        {tab === 'former' && <FormerLearners />}
      </div>
    </DashboardLayout>
  );
}

// ==================== WIZARD ====================

function Wizard({ data, onFinished }: { data: Awaited<ReturnType<typeof loadTransitionData>>; onFinished: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(1);

  const [settings, setSettings] = useState<PromotionSettings>(() => DEFAULT_SETTINGS(data.suggestedFromYear));
  const defaults = useMemo(() => defaultClassMap(data.classes, settings), [data.classes, settings]);
  const [mapOverrides, setMapOverrides] = useState<Record<string, ClassDestination>>({});
  const [decisions, setDecisions] = useState<Record<string, LearnerDecision>>({});
  const map = useMemo(() => ({ ...defaults.map, ...mapOverrides }), [defaults.map, mapOverrides]);

  const plan = useMemo(
    () => buildPromotionPlan({ settings, classes: data.classes, learners: data.learners, map, newClasses: defaults.newClasses, decisions }),
    [settings, data.classes, data.learners, map, defaults.newClasses, decisions]
  );

  const [archive, setArchive] = useState<Set<string>>(new Set());
  const [archiveTouched, setArchiveTouched] = useState(false);
  const suggested = useMemo(() => suggestedArchive(plan), [plan]);
  useEffect(() => {
    if (!archiveTouched) setArchive(new Set(suggested));
  }, [suggested, archiveTouched]);

  const [confirmText, setConfirmText] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [runError, setRunError] = useState('');
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [ranItems, setRanItems] = useState<PlanItem[]>([]);

  const errors = plan.issues.filter(i => i.level === 'error');
  const alreadyDone = data.runs.find(r => r.fromYear === settings.fromYear && r.status === 'completed');
  const activeClasses = data.classes.filter(c => c.isActive);
  const activeLearners = data.learners.filter(l => !l.status || l.status === 'active').length;
  const now = new Date();
  const early = now.getFullYear() === settings.fromYear && now.getMonth() < 11;

  const run = async () => {
    setRunning(true);
    setRunError('');
    try {
      const archiveIds = plan.emptyAfter.filter(id => archive.has(id));
      const runId = await startPromotionRun(plan, archiveIds, { uid: user?.uid, name: user?.fullName });
      const out = await executePromotionRun(runId, setProgress);
      setRanItems(plan.items);
      setOutcome(out);
      setStep(5);
      syncFaces();
      resultsService.invalidateGrid();
      queryClient.invalidateQueries();
    } catch (e: any) {
      setRunError(e?.message || 'The transition failed. Open this page again to resume it.');
    } finally {
      setRunning(false);
    }
  };

  if (step === 5 && outcome) {
    return <Finished outcome={outcome} items={ranItems} settings={settings} onClose={onFinished} />;
  }

  return (
    <div className="space-y-5">
      {/* Stepper */}
      <ol className="flex flex-wrap gap-2">
        {STEPS.map(s => (
          <li key={s.n}>
            <button
              onClick={() => !running && setStep(s.n)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border ${
                step === s.n ? 'bg-blue-600 text-white border-blue-600' : step > s.n ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-600 border-gray-300'
              }`}
            >
              <span className="font-semibold">{s.n}</span> {s.label}
            </button>
          </li>
        ))}
      </ol>

      {alreadyDone && (
        <Banner tone="warn">
          {settings.fromYear} → {settings.toYear} has already been run. To run it again, undo it in the History tab first.
        </Banner>
      )}

      {/* STEP 1 */}
      {step === 1 && (
        <Card title="Which year is closing?">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Closing year">
              <input
                type="number"
                value={settings.fromYear}
                onChange={e => {
                  const y = parseInt(e.target.value) || settings.fromYear;
                  setSettings(s => ({ ...s, fromYear: y, toYear: y + 1 }));
                  setMapOverrides({});
                  setDecisions({});
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </Field>
            <Field label="New year">
              <div className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg font-semibold">{settings.toYear}</div>
            </Field>
            <Field label="Final Form (graduates)">
              <select
                value={settings.finalFormLevel}
                onChange={e => { setSettings(s => ({ ...s, finalFormLevel: Number(e.target.value) })); setMapOverrides({}); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value={4}>Form 4 (O-level ends)</option>
                <option value={5}>Form 5</option>
              </select>
            </Field>
            <Field label="Final Grade (graduates)">
              <div className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg">Grade {settings.finalGradeLevel}</div>
            </Field>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 mt-5">
            <Stat label="Active classes" value={activeClasses.length} />
            <Stat label="Active learners" value={activeLearners} />
            <Stat label="Learners to place" value={plan.items.length} />
          </div>

          <div className="mt-5 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Before you start</h3>
            <Check ok={!early} text={early
              ? `It is still ${settings.fromYear}. Run this when ${settings.toYear} begins — before then, Results Entry, SBA and attendance still work on the ${settings.fromYear} classes.`
              : `The new year (${settings.toYear}) has begun.`} />
            <Check ok={null} text={<>Term 3 marks for {settings.fromYear} should be complete. Check the <Link className="text-blue-600 underline" to="/dashboard/admin/results-monitor">Results Monitor</Link>. Marks entered later still go to the right class: past-year screens use the {settings.fromYear} class lists.</>} />
            <Check ok={plan.skipped.filter(s => !s.reason.startsWith('Already')).length === 0}
              text={`${plan.skipped.filter(s => !s.reason.startsWith('Already')).length} active learner(s) are not in an active class and will not be moved.`} />
            <Check ok={null} text="Results, attendance registers, teacher assignments and timetables are not changed. Teachers stay with their classes (streams); change assignments in Teachers if needed." />
          </div>

          {plan.skipped.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-gray-700">Not moved ({plan.skipped.length})</summary>
              <ul className="mt-2 space-y-1 text-gray-600 max-h-48 overflow-auto">
                {plan.skipped.map(s => <li key={s.learnerId}>{s.fullName} — {s.reason}</li>)}
              </ul>
            </details>
          )}
          <StepNav onNext={() => setStep(2)} />
        </Card>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <Card title="Where does each class go?" subtitle={`The default moves each stream up one level. Classes that do not exist yet are created. Final-year classes graduate.`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-3">Class in {settings.fromYear}</th>
                  <th className="py-2 pr-3">Learners</th>
                  <th className="py-2 pr-3" />
                  <th className="py-2 pr-3">Goes to in {settings.toYear}</th>
                </tr>
              </thead>
              <tbody>
                {[...activeClasses]
                  .sort((a, b) => a.type.localeCompare(b.type) || a.level - b.level || a.name.localeCompare(b.name))
                  .map(c => {
                    const dest = map[c.id];
                    const isDefault = destKey(dest) === destKey(defaults.map[c.id]);
                    const next = nextLevelOf(c.type, c.level, settings);
                    return (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium text-gray-900">{c.name}</td>
                        <td className="py-2 pr-3 text-gray-700">{c.learnerCount}</td>
                        <td className="py-2 pr-3 text-gray-400"><ArrowRight size={14} /></td>
                        <td className="py-2 pr-3">
                          <select
                            value={destKey(dest)}
                            onChange={e => {
                              const v = e.target.value;
                              setMapOverrides(m => ({ ...m, [c.id]: v === 'graduate' ? { kind: 'graduate' } : { kind: 'class', classId: v } }));
                            }}
                            className={`border rounded-lg px-2 py-1.5 text-sm min-w-[14rem] ${isDefault ? 'border-gray-300' : 'border-amber-400 bg-amber-50'}`}
                          >
                            {!dest && <option value="">— no next class —</option>}
                            <option value="graduate">Graduate (completes school)</option>
                            {defaults.newClasses.map(n => <option key={n.tempId} value={n.tempId}>{n.name} (new class)</option>)}
                            {data.classes
                              .filter(x => x.id !== c.id)
                              .sort((a, b) => a.type.localeCompare(b.type) || a.level - b.level || a.name.localeCompare(b.name))
                              .map(x => <option key={x.id} value={x.id}>{x.name}{x.isActive ? '' : ' (archived)'}</option>)}
                          </select>
                          {dest?.kind === 'class' && isTempClassId(dest.classId) && (
                            <span className="ml-2 text-xs text-blue-700">will be created</span>
                          )}
                          {next !== 'graduate' && dest?.kind === 'graduate' && (
                            <span className="ml-2 text-xs text-amber-700">not a final year</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <StepNav onBack={() => setStep(1)} onNext={() => setStep(3)} />
        </Card>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <LearnerDecisions
          data={data}
          plan={plan}
          map={map}
          newClasses={defaults.newClasses}
          decisions={decisions}
          setDecisions={setDecisions}
          settings={settings}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}

      {/* STEP 4 */}
      {step === 4 && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {ACTIONS.map(a => <Stat key={a} label={ACTION_LABEL[a]} value={plan.counts[a]} />)}
          </div>

          {plan.issues.length > 0 && (
            <Card title="Check these first">
              <ul className="space-y-1.5 text-sm">
                {plan.issues.map((i, k) => (
                  <li key={k} className="flex gap-2">
                    {i.level === 'error' ? <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                      : i.level === 'warning' ? <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                        : <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />}
                    <span className={i.level === 'error' ? 'text-red-800' : 'text-gray-700'}>{i.message}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title={`Classes in ${settings.toYear}`} subtitle="Learner numbers before and after the move.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-3">Class</th>
                    <th className="py-2 pr-3 text-right">Now</th>
                    <th className="py-2 pr-3 text-right">Leaving</th>
                    <th className="py-2 pr-3 text-right">Staying</th>
                    <th className="py-2 pr-3 text-right">Arriving</th>
                    <th className="py-2 pr-3 text-right">After</th>
                    <th className="py-2 pr-3">Archive if empty</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.classSummaries.map(s => {
                    const empty = plan.emptyAfter.includes(s.classId);
                    return (
                      <tr key={s.classId} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium text-gray-900">
                          {s.name}
                          {s.isNew && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">new</span>}
                        </td>
                        <td className="py-2 pr-3 text-right">{s.before}</td>
                        <td className="py-2 pr-3 text-right text-gray-600">{s.outgoing || ''}</td>
                        <td className="py-2 pr-3 text-right text-gray-600">{s.staying || ''}</td>
                        <td className="py-2 pr-3 text-right text-gray-600">{s.incoming || ''}</td>
                        <td className={`py-2 pr-3 text-right font-semibold ${s.after === 0 ? 'text-gray-400' : 'text-gray-900'}`}>{s.after}</td>
                        <td className="py-2 pr-3">
                          {empty ? (
                            <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                              <input
                                type="checkbox"
                                checked={archive.has(s.classId)}
                                onChange={e => {
                                  setArchiveTouched(true);
                                  setArchive(prev => {
                                    const n = new Set(prev);
                                    e.target.checked ? n.add(s.classId) : n.delete(s.classId);
                                    return n;
                                  });
                                }}
                              />
                              {archive.has(s.classId) ? 'Archive' : 'Keep for new admissions'}
                            </label>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Student id changes" subtitle="Learners keep their number in the new class where it is free. Graduates and leavers keep their id with the year added.">
            <IdChanges items={plan.items} />
            <button
              onClick={() => downloadCsv(`id-changes-${settings.fromYear}-${settings.toYear}.csv`, idChangeRows(plan.items))}
              className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
            >
              <Download size={14} /> Download full list (CSV)
            </button>
          </Card>

          <Card title="Run the transition">
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
              <li>Learners move to their {settings.toYear} classes; graduates and leavers become former learners.</li>
              <li>The {settings.fromYear} class lists are saved, so {settings.fromYear} report cards, results and data checks stay as they were.</li>
              <li>SBA marks move with each learner (repeaters' SBA moves to their new exam year).</li>
              <li>You can undo the whole run from the History tab.</li>
            </ul>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <Field label={`Type ${settings.toYear} to confirm`}>
                <input value={confirmText} onChange={e => setConfirmText(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32" />
              </Field>
              <button
                onClick={run}
                disabled={running || errors.length > 0 || !!alreadyDone || plan.items.length === 0 || confirmText.trim() !== String(settings.toYear)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {running ? <Loader2 size={14} className="animate-spin" /> : <GraduationCap size={14} />}
                Move {plan.items.length} learners to {settings.toYear}
              </button>
              {errors.length > 0 && <span className="text-sm text-red-700">Fix the problems above first.</span>}
            </div>
            {progress && running && (
              <div className="mt-4">
                <div className="text-sm text-gray-700 mb-1">{progress.message}</div>
                <div className="h-2 bg-gray-100 rounded">
                  <div className="h-2 bg-blue-600 rounded" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
                </div>
              </div>
            )}
            {runError && <Banner tone="error">{runError}</Banner>}
          </Card>
          <StepNav onBack={() => setStep(3)} />
        </div>
      )}
    </div>
  );
}

// ==================== STEP 3: LEARNERS ====================

function LearnerDecisions(props: {
  data: Awaited<ReturnType<typeof loadTransitionData>>;
  plan: ReturnType<typeof buildPromotionPlan>;
  map: Record<string, ClassDestination>;
  newClasses: ReturnType<typeof defaultClassMap>['newClasses'];
  decisions: Record<string, LearnerDecision>;
  setDecisions: React.Dispatch<React.SetStateAction<Record<string, LearnerDecision>>>;
  settings: PromotionSettings;
  onBack: () => void;
  onNext: () => void;
}) {
  const { data, plan, newClasses, decisions, setDecisions, settings } = props;
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());

  const byClass = useMemo(() => {
    const m = new Map<string, PlanItem[]>();
    for (const it of plan.items) {
      const arr = m.get(it.fromClassId) ?? [];
      arr.push(it);
      m.set(it.fromClassId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.fullName.localeCompare(b.fullName));
    return m;
  }, [plan.items]);

  const classOrder = data.classes
    .filter(c => byClass.has(c.id))
    .sort((a, b) => a.type.localeCompare(b.type) || a.level - b.level || a.name.localeCompare(b.name));

  const destOptions = [
    ...newClasses.map(n => ({ id: n.tempId, name: `${n.name} (new)` })),
    ...data.classes.filter(c => c.isActive).sort((a, b) => a.type.localeCompare(b.type) || a.level - b.level || a.name.localeCompare(b.name)).map(c => ({ id: c.id, name: c.name })),
  ];

  const q = search.trim().toLowerCase();
  const setFor = (id: string, d: LearnerDecision | null) =>
    setDecisions(prev => {
      const n = { ...prev };
      if (d) n[id] = d;
      else delete n[id];
      return n;
    });

  const changed = Object.keys(decisions).length;

  return (
    <Card
      title="Exceptions for individual learners"
      subtitle="Everyone follows their class by default. Change only the learners who repeat, leave, or go to a different stream."
    >
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Find a learner or id"
            className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-64"
          />
        </div>
        {changed > 0 && (
          <button onClick={() => setDecisions({})} className="text-sm text-gray-600 underline">
            Reset {changed} change(s)
          </button>
        )}
      </div>

      <div className="space-y-2">
        {classOrder.map(c => {
          const rows = (byClass.get(c.id) ?? []).filter(r => !q || r.fullName.toLowerCase().includes(q) || r.fromStudentId.toLowerCase().includes(q));
          if (q && rows.length === 0) return null;
          const isOpen = open.has(c.id) || !!q;
          const exceptions = (byClass.get(c.id) ?? []).filter(r => decisions[r.learnerId]).length;
          const dest = props.map[c.id];
          const destName = dest?.kind === 'graduate' ? 'Graduate' : dest ? (destOptions.find(o => o.id === dest.classId)?.name ?? '—') : 'no next class';
          return (
            <div key={c.id} className="border border-gray-200 rounded-lg">
              <button
                onClick={() => setOpen(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
                className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50"
              >
                <span className="flex items-center gap-2 font-medium text-gray-900">
                  {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  {c.name} <span className="text-gray-500 font-normal">→ {destName}</span>
                </span>
                <span className="text-gray-500">
                  {(byClass.get(c.id) ?? []).length} learners{exceptions ? ` · ${exceptions} changed` : ''}
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-gray-100 overflow-x-auto">
                  <div className="flex flex-wrap gap-2 px-3 py-2 text-xs text-gray-600">
                    Set whole class:
                    {(['promote', 'repeat', 'graduate'] as PromotionAction[]).map(a => (
                      <button
                        key={a}
                        onClick={() => setDecisions(prev => {
                          const n = { ...prev };
                          for (const r of byClass.get(c.id) ?? []) n[r.learnerId] = { action: a };
                          return n;
                        })}
                        className="px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-50"
                      >
                        {ACTION_LABEL[a]}
                      </button>
                    ))}
                    <button
                      onClick={() => setDecisions(prev => {
                        const n = { ...prev };
                        for (const r of byClass.get(c.id) ?? []) delete n[r.learnerId];
                        return n;
                      })}
                      className="px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-50"
                    >
                      Default
                    </button>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {rows.map(r => {
                        const d = decisions[r.learnerId];
                        const action = r.action;
                        const showDest = action === 'promote' || action === 'repeat' || action === 'stay';
                        return (
                          <tr key={r.learnerId} className={`border-t border-gray-100 ${d ? 'bg-amber-50/40' : ''}`}>
                            <td className="px-3 py-1.5">
                              <div className="font-medium text-gray-900">{r.fullName}</div>
                              <div className="text-xs text-gray-500">{r.fromStudentId || 'no id'}</div>
                            </td>
                            <td className="px-3 py-1.5">
                              <select
                                value={action}
                                onChange={e => {
                                  const a = e.target.value as PromotionAction;
                                  setFor(r.learnerId, { action: a, toClassId: undefined, reason: d?.reason });
                                }}
                                className={`border rounded px-2 py-1 text-xs ${ACTION_STYLE[action]}`}
                              >
                                {ACTIONS.map(a => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-1.5">
                              {showDest ? (
                                <select
                                  value={r.toClassId}
                                  onChange={e => setFor(r.learnerId, { action, toClassId: e.target.value })}
                                  className="border border-gray-300 rounded px-2 py-1 text-xs"
                                >
                                  {!destOptions.some(o => o.id === r.toClassId) && <option value={r.toClassId}>{r.toClassName}</option>}
                                  {destOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                </select>
                              ) : action === 'leave' ? (
                                <input
                                  value={d?.reason ?? ''}
                                  onChange={e => setFor(r.learnerId, { action: 'leave', reason: e.target.value })}
                                  placeholder="Reason (e.g. transferred to …)"
                                  className="border border-gray-300 rounded px-2 py-1 text-xs w-56"
                                />
                              ) : (
                                <span className="text-xs text-gray-500">Leaves {r.fromClassName} in {settings.fromYear}</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-xs text-gray-600 whitespace-nowrap">
                              {r.toStudentId && r.toStudentId !== r.fromStudentId ? <>New id <span className="font-mono">{r.toStudentId}</span></> : null}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              {d && (
                                <button onClick={() => setFor(r.learnerId, null)} className="text-xs text-gray-500 underline">default</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <StepNav onBack={props.onBack} onNext={props.onNext} />
    </Card>
  );
}

function IdChanges({ items }: { items: PlanItem[] }) {
  const changed = items.filter(i => i.toStudentId !== i.fromStudentId);
  const renumbered = changed.filter(i =>
    (i.action === 'promote' || i.action === 'repeat' || i.action === 'stay') &&
    i.fromStudentIndex !== i.toStudentIndex
  );
  const shown = (renumbered.length > 0 ? renumbered : changed).slice(0, 12);
  return (
    <div className="text-sm">
      <p className="text-gray-700">
        {changed.length} id(s) change. {renumbered.length > 0
          ? `${renumbered.length} learner(s) get a new number because theirs is taken in the new class:`
          : 'Everyone keeps their number.'}
      </p>
      {shown.length > 0 && (
        <table className="mt-2 text-xs">
          <tbody>
            {shown.map(i => (
              <tr key={i.learnerId}>
                <td className="pr-4 py-0.5 text-gray-900">{i.fullName}</td>
                <td className="pr-2 font-mono text-gray-500">{i.fromStudentId}</td>
                <td className="pr-2 text-gray-400">→</td>
                <td className="font-mono text-gray-900">{i.toStudentId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ==================== FINISHED ====================

function Finished({ outcome, items, settings, onClose }: { outcome: RunOutcome; items: PlanItem[]; settings: PromotionSettings; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <Banner tone="ok">
        {settings.toYear} is ready: {outcome.moved} learner(s) placed
        {outcome.createdClasses ? `, ${outcome.createdClasses} class(es) created` : ''}
        {outcome.archivedClasses ? `, ${outcome.archivedClasses} class(es) archived` : ''}
        {outcome.sbaMoved ? `, ${outcome.sbaMoved} SBA record(s) moved` : ''}.
      </Banner>
      {outcome.warnings.length > 0 && (
        <Card title="Notes">
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
            {outcome.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </Card>
      )}
      <Card title="Next steps">
        <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-2">
          <li>
            <button onClick={() => downloadCsv(`id-changes-${settings.fromYear}-${settings.toYear}.csv`, idChangeRows(items))} className="text-blue-600 underline">
              Download the id changes
            </button>{' '}for form teachers and the office.
          </li>
          <li><Link to="/dashboard/admin/classes" className="text-blue-600 underline">Admit the new Form 1 learners</Link> (Class Management → class → Add learner / Import CSV).</li>
          <li><Link to="/dashboard/admin/teachers" className="text-blue-600 underline">Check teacher assignments</Link>, especially for new classes, which start with no subjects.</li>
          <li><Link to="/dashboard/admin/exams" className="text-blue-600 underline">Set up the Term 1 {settings.toYear} exams</Link>.</li>
        </ol>
      </Card>
      <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Done</button>
    </div>
  );
}

// ==================== UNFINISHED RUN ====================

function UnfinishedRun({ run, onDone }: { run: PromotionRun; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [error, setError] = useState(run.error || '');

  const resume = async () => {
    setBusy(true);
    setError('');
    try {
      await executePromotionRun(run.id, setProgress);
      syncFaces();
      resultsService.invalidateGrid();
      queryClient.invalidateQueries();
      onDone();
    } catch (e: any) {
      setError(e?.message || 'Resume failed.');
    } finally {
      setBusy(false);
    }
  };
  const undo = async () => {
    setBusy(true);
    setError('');
    try {
      await undoPromotionRun(run.id, setProgress);
      syncFaces();
      resultsService.invalidateGrid();
      queryClient.invalidateQueries();
      onDone();
    } catch (e: any) {
      setError(e?.message || 'Undo failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={`The ${run.fromYear} → ${run.toYear} transition did not finish`}>
      <p className="text-sm text-gray-700">
        Some learners may already be in their {run.toYear} classes. Resume to finish the same plan
        (learners already moved are skipped), or undo what was done.
      </p>
      {error && <Banner tone="error">{error}</Banner>}
      {progress && busy && <p className="text-sm text-gray-600 mt-2">{progress.message}</p>}
      <div className="flex gap-3 mt-4">
        <button onClick={resume} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />} Resume
        </button>
        <button onClick={undo} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50">
          <RotateCcw size={14} /> Undo
        </button>
      </div>
    </Card>
  );
}

// ==================== HISTORY ====================

function RunHistory({ runs, onChanged }: { runs: PromotionRun[]; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const [undoing, setUndoing] = useState<PromotionRun | null>(null);
  const [check, setCheck] = useState<UndoCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const latestCompleted = runs.find(r => r.status === 'completed');

  const askUndo = async (r: PromotionRun) => {
    setUndoing(r);
    setCheck(null);
    setError('');
    try {
      setCheck(await checkUndo(r.id));
    } catch (e: any) {
      setError(e?.message || 'Could not check the run.');
    }
  };
  const doUndo = async () => {
    if (!undoing) return;
    setBusy(true);
    try {
      const out = await undoPromotionRun(undoing.id);
      setMsg(`Undone: ${out.restored} learner(s) restored to ${undoing.fromYear}.${out.warnings.length ? ' ' + out.warnings.join(' ') : ''}`);
      setUndoing(null);
      resultsService.invalidateGrid();
      queryClient.invalidateQueries();
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Undo failed.');
    } finally {
      setBusy(false);
    }
  };

  if (runs.length === 0) return <p className="text-sm text-gray-600">No year transitions yet.</p>;

  return (
    <div className="space-y-4">
      {msg && <Banner tone="ok">{msg}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}
      {runs.map(r => (
        <Card key={r.id} title={`${r.fromYear} → ${r.toYear}`} subtitle={`${statusLabel(r.status)}${r.startedByName ? ` · by ${r.startedByName}` : ''}`}>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {ACTIONS.map(a => <Stat key={a} label={ACTION_LABEL[a]} value={r.counts?.[a] ?? 0} />)}
          </div>
          <div className="flex flex-wrap gap-3 mt-4">
            <button
              onClick={() => downloadCsv(`id-changes-${r.fromYear}-${r.toYear}.csv`, idChangeRows(r.items))}
              className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
            >
              <Download size={14} /> Id changes (CSV)
            </button>
            {latestCompleted?.id === r.id && (
              <button onClick={() => askUndo(r)} className="inline-flex items-center gap-2 px-3 py-1.5 border border-red-300 text-red-700 rounded-lg text-sm hover:bg-red-50">
                <RotateCcw size={14} /> Undo this transition
              </button>
            )}
          </div>
          {(r.warnings?.length ?? 0) > 0 && (
            <details className="mt-3 text-sm text-gray-700">
              <summary className="cursor-pointer">Notes ({r.warnings!.length})</summary>
              <ul className="list-disc pl-5 mt-1">{r.warnings!.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </details>
          )}
          {undoing?.id === r.id && (
            <div className="mt-4 border border-red-200 bg-red-50 rounded-lg p-3 text-sm space-y-2">
              <p className="font-medium text-red-900">Undo {r.fromYear} → {r.toYear}?</p>
              <p className="text-red-900">
                Every learner goes back to their {r.fromYear} class and id, graduates and leavers become active again,
                SBA records move back, created classes are removed (if unused) and archived classes return.
              </p>
              {!check ? (
                <p className="flex items-center gap-2 text-red-900"><Loader2 size={14} className="animate-spin" /> Checking…</p>
              ) : (
                <>
                  {check.newYearResults > 0 && (
                    <p className="text-red-900">
                      {check.newYearResults} mark(s) were already entered for {r.toYear}. They are kept, filed under the {r.toYear} classes.
                    </p>
                  )}
                  {check.learnersAdmittedIntoCreatedClasses > 0 && (
                    <p className="text-red-900">
                      {check.learnersAdmittedIntoCreatedClasses} learner(s) were admitted into classes the run created; those classes are kept.
                    </p>
                  )}
                </>
              )}
              <div className="flex gap-2">
                <button onClick={doUndo} disabled={busy || !check} className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm disabled:opacity-50">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Undo
                </button>
                <button onClick={() => setUndoing(null)} disabled={busy} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">Cancel</button>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

const statusLabel = (s: PromotionRun['status']) =>
  s === 'completed' ? 'Completed' : s === 'reverted' ? 'Undone' : s === 'failed' ? 'Stopped — resume or undo' : 'In progress';

// ==================== FORMER LEARNERS ====================

function FormerLearners() {
  const q = useQuery({ queryKey: ['formerLearners'], queryFn: loadFormerLearners });
  const [year, setYear] = useState<string>('all');
  const [search, setSearch] = useState('');
  const rows = q.data ?? [];
  const years = [...new Set(rows.map(r => r.exitYear).filter(Boolean))].sort((a, b) => (b as number) - (a as number));
  const s = search.trim().toLowerCase();
  const shown = rows.filter(r =>
    (year === 'all' || String(r.exitYear) === year) &&
    (!s || r.fullName.toLowerCase().includes(s) || r.studentId.toLowerCase().includes(s))
  );

  return (
    <Card title="Graduates & leavers" subtitle="Their results, report cards and SBA records stay in the system.">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={year} onChange={e => setYear(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-2 text-sm">
          <option value="all">All years</option>
          {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
        </select>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or id" className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-56" />
        </div>
        <button
          onClick={() => downloadCsv('former-learners.csv', [
            ['Name', 'Id', 'Last class', 'Status', 'Year left', 'Reason', 'Guardian', 'Guardian phone'],
            ...shown.map(r => [r.fullName, r.studentId, r.className, r.status === 'graduated' ? 'Graduated' : 'Left', String(r.exitYear ?? ''), r.exitReason ?? '', r.guardian ?? '', r.guardianPhone ?? '']),
          ])}
          disabled={shown.length === 0}
          className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <Download size={14} /> CSV
        </button>
      </div>
      {q.isLoading ? (
        <p className="text-sm text-gray-600 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>
      ) : q.error ? (
        <Banner tone="error">{(q.error as Error).message}</Banner>
      ) : shown.length === 0 ? (
        <p className="text-sm text-gray-600">No former learners{year !== 'all' ? ` for ${year}` : ''}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Id</th>
                <th className="py-2 pr-3">Last class</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Year</th>
                <th className="py-2 pr-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-3 text-gray-900">{r.fullName}</td>
                  <td className="py-1.5 pr-3 font-mono text-xs">{r.studentId}</td>
                  <td className="py-1.5 pr-3">{r.className}</td>
                  <td className="py-1.5 pr-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${r.status === 'graduated' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                      {r.status === 'graduated' ? 'Graduated' : 'Left'}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">{r.exitYear ?? ''}</td>
                  <td className="py-1.5 pr-3 text-gray-600">{r.exitReason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ==================== SMALL UI ====================

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {subtitle && <p className="text-sm text-gray-600 mt-0.5">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
      <div className="text-xs text-gray-600">{label}</div>
      <div className="text-xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function Check({ ok, text }: { ok: boolean | null; text: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      {ok === true ? <CheckCircle size={16} className="text-green-600 shrink-0 mt-0.5" />
        : ok === false ? <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          : <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />}
      <span className="text-gray-700">{text}</span>
    </div>
  );
}

function Banner({ tone, children }: { tone: 'ok' | 'warn' | 'error'; children: React.ReactNode }) {
  const cls = tone === 'ok' ? 'bg-green-50 border-green-200 text-green-800'
    : tone === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-900'
      : 'bg-red-50 border-red-200 text-red-800';
  return <div className={`border text-sm rounded-lg p-3 mt-3 first:mt-0 ${cls}`}>{children}</div>;
}

function StepNav({ onBack, onNext }: { onBack?: () => void; onNext?: () => void }) {
  return (
    <div className="flex justify-between mt-5">
      {onBack ? <button onClick={onBack} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Back</button> : <span />}
      {onNext && (
        <button onClick={onNext} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
          Next <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}
