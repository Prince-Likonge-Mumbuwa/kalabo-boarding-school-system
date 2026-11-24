// @/components/superadmin/OverviewTab.tsx — the superAdmin's start page:
// a welcome banner with the 3D chart of AI use per tool, the main numbers,
// which subjects and class levels have curriculum material (the coverage
// grid), and teachers waiting for access.
import { Suspense, lazy, useMemo } from 'react';
import { Check, Clock3, Cpu, Database, Library, Sparkles, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardTitle, EmptyState } from '@/components/ai/ui';
import { AI_FEATURES } from '@/components/ai/aiFeatures';
import { superAdminApi } from '@/services/aiApi';
import { LEVELS, type FeatureKey, type SuperAdminOverview } from '@/types/ai';
import { getCurrentAcademicTerm } from '@/utils/academicTerm';
import { cn } from '@/lib/utils';
import { KpiCard, ProgressRing, canDraw3D, use3DPreference, useReducedMotion } from './fx';
import type { Bar3D } from './UsageChart3D';
import { useOverviewAction } from './useOverviewAction';

// three.js comes with this chart only (see vite.config.ts).
const UsageChart3D = lazy(() => import('./UsageChart3D'));

type SectionId = 'overview' | 'curriculum' | 'features' | 'access' | 'usage' | 'finances';

/** One colour per tool, the same in the 3D chart and its legend. */
const TOOL_COLOURS: Partial<Record<FeatureKey, string>> = {
  lessonPlan: '#3b82f6',
  schemeOfWork: '#8b5cf6',
  assessment: '#f59e0b',
  recordOfWork: '#10b981',
  learnerNotes: '#f43f5e',
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

/** The chart for devices that should not draw 3D: the same bars, flat. */
function FlatBars({ bars }: { bars: Bar3D[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="flex h-full items-end justify-center gap-3 px-4 pb-4" role="img" aria-label={`AI use per tool: ${bars.map((b) => `${b.label} ${b.value}`).join(', ')}.`}>
      {bars.map((b) => (
        <span key={b.key} className="w-9 rounded-t-lg shadow-lg" style={{ height: `${Math.max(6, (b.value / max) * 75)}%`, background: `linear-gradient(to top, ${b.color}cc, ${b.color})` }} />
      ))}
    </div>
  );
}

function Hero({ data, toolsOn }: { data: SuperAdminOverview; toolsOn: number }) {
  const reduced = useReducedMotion();
  const able = useMemo(() => canDraw3D(), []);
  const [want3D, setWant3D] = use3DPreference();
  const draw3D = able && want3D;
  const bars: Bar3D[] = AI_FEATURES.filter((f) => TOOL_COLOURS[f.key]).map((f) => ({
    key: f.key, label: f.label, value: data.usage.byFeature[f.key] ?? 0, color: TOOL_COLOURS[f.key]!,
  }));
  const status = [
    { ok: data.system.nvidiaConfigured, on: 'AI writer connected', off: 'AI writer not set up', icon: Cpu },
    { ok: data.system.chroma.ok, on: 'Curriculum search online', off: 'Curriculum search offline', icon: Database },
  ];

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b1b33] via-[#16325c] to-[#2a6fa8] text-white shadow-[0_30px_60px_-25px_rgba(11,27,51,0.6)] motion-safe:animate-rise">
      {/* Drifting shapes behind the content */}
      <span aria-hidden className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full bg-[#5bb4dd]/25 blur-3xl motion-safe:animate-float" />
      <span aria-hidden className="pointer-events-none absolute -bottom-24 right-10 h-72 w-72 rounded-full bg-indigo-400/20 blur-3xl motion-safe:animate-float-slow" />
      <span aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:22px_22px]" />

      <div className="relative grid grid-cols-[minmax(0,1fr)] gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9fd6ef]">{getCurrentAcademicTerm().label}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{greeting()}.</h2>
          <p className="mt-2 max-w-md text-sm text-blue-100/80 sm:text-base">
            Here is how the AI tools are doing at Kalabo Boarding: {data.usage.generatedLast30Days.toLocaleString()} documents written in the last 30 days, with {toolsOn} tools switched on.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {status.map((s) => {
              const Icon = s.icon;
              return (
                <span key={s.on} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium ring-1 ring-inset ring-white/15 backdrop-blur">
                  <span className="relative flex h-2 w-2">
                    {s.ok && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />}
                    <span className={cn('relative inline-flex h-2 w-2 rounded-full', s.ok ? 'bg-emerald-400' : 'bg-red-400')} />
                  </span>
                  <Icon size={13} className="opacity-80" /> {s.ok ? s.on : s.off}
                </span>
              );
            })}
          </div>
          <p className="mt-4 truncate text-[11px] text-blue-100/50">Writing with {data.system.chatModel} · searching with {data.system.embeddingModel}</p>
        </div>

        <div className="min-w-0">
          <div className="h-56 sm:h-64">
            {draw3D ? (
              <Suspense fallback={<FlatBars bars={bars} />}>
                <UsageChart3D bars={bars} still={reduced} />
              </Suspense>
            ) : (
              <FlatBars bars={bars} />
            )}
          </div>
          <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-blue-100/85">
            {bars.map((b) => (
              <li key={b.key} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: b.color }} />
                {b.label} <span className="font-semibold tabular-nums text-white">{b.value.toLocaleString()}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-center text-[11px] text-blue-100/50">
            AI use per tool, all time (opening and generating)
            {able && (
              <>
                {' · '}
                <button type="button" onClick={() => setWant3D(!want3D)} aria-pressed={want3D}
                  className="font-semibold text-[#9fd6ef] underline-offset-2 hover:underline focus:outline-none focus-visible:underline">
                  3D {want3D ? 'on' : 'off'}
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

export function OverviewTab({ data, go }: { data: SuperAdminOverview; go: (id: SectionId) => void }) {
  const { run, busy } = useOverviewAction();
  const ready = data.documents.filter((d) => d.status === 'indexed');
  const waiting = data.teachers.filter((t) => t.access === 'pending');
  const granted = data.teachers.filter((t) => t.access === 'granted').length;
  const toolsOn = Object.values(data.settings.features).filter((f) => f.enabled).length;

  // Coverage: subject -> levels with at least one ready document.
  const coverage = new Map<string, Set<string>>();
  for (const d of ready) {
    const set = coverage.get(d.subject) ?? new Set<string>();
    d.levels.forEach((l) => set.add(l));
    coverage.set(d.subject, set);
  }
  const subjects = [...coverage.keys()].sort((a, b) => a.localeCompare(b));
  // Show the Form columns always; Grade columns only if something covers them.
  const usedLevels = LEVELS.filter((l) => l.startsWith('Form') || subjects.some((s) => coverage.get(s)!.has(l)));
  const cells = subjects.length * usedLevels.length;
  const covered = subjects.reduce((n, s) => n + usedLevels.filter((l) => coverage.get(s)!.has(l)).length, 0);
  const balance = data.finance?.summary.balance;

  return (
    <div className="space-y-6">
      <Hero data={data} toolsOn={toolsOn} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <KpiCard tone="sky" delay={60} icon={<Library size={20} />} label="Documents ready" value={ready.length} hint={`${data.documents.length} in the library`} />
        <KpiCard tone="emerald" delay={120} icon={<Sparkles size={20} />} label="Subjects" value={subjects.length}
          hint={cells ? `${covered} of ${cells} class slots covered` : 'Upload a syllabus to start'}
          extra={cells ? <ProgressRing value={covered / cells} label={`Curriculum coverage ${Math.round((covered / cells) * 100)}%`} /> : undefined} />
        <KpiCard tone="violet" delay={180} icon={<Users size={20} />} label="Teachers granted" value={granted}
          hint={waiting.length ? `${waiting.length} waiting for you` : `${data.teachers.length} have opened AI Tools`} />
        {balance !== undefined ? (
          <KpiCard tone="amber" delay={240} icon={<Wallet size={20} />} label="Balance on hand" value={balance}
            format={(n) => `ZMW ${Math.round(n).toLocaleString()}`} hint={`${data.finance!.summary.unpaid.length} not paid this term`} />
        ) : (
          <KpiCard tone="amber" delay={240} icon={<Sparkles size={20} />} label="Generated, 30 days" value={data.usage.generatedLast30Days} hint={`${toolsOn} tools switched on`} />
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card padded={false} className="motion-safe:animate-rise [animation-delay:200ms]">
          <div className="p-5 pb-0 sm:p-6 sm:pb-0">
            <CardTitle title="Curriculum coverage" hint="Which subjects and class levels the AI has material for."
              right={<Button size="sm" variant="outline" className="h-9 rounded-xl" onClick={() => go('curriculum')}>Manage</Button>} />
          </div>
          {subjects.length === 0 ? (
            <EmptyState icon={<Library size={22} />} title="No curriculum yet" action={<Button onClick={() => go('curriculum')} className="rounded-xl bg-[#16325c] hover:bg-[#0b1b33]">Upload the first syllabus</Button>}>
              Teachers can only generate documents for subjects and levels that have material.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto px-5 pb-5 sm:px-6 sm:pb-6">
              <table className="w-full min-w-[520px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Subject</th>
                    {usedLevels.map((l) => <th key={l} className="whitespace-nowrap px-2 py-2 text-center text-xs font-semibold text-gray-500 [overflow-wrap:normal]">{l}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((s) => (
                    <tr key={s} className="group">
                      <td className="sticky left-0 whitespace-nowrap border-t border-gray-100 bg-white py-2.5 pr-4 font-medium text-gray-900 [overflow-wrap:normal] group-hover:text-[#16325c]">{s}</td>
                      {usedLevels.map((l) => {
                        const on = coverage.get(s)!.has(l);
                        return (
                          <td key={l} className="border-t border-gray-100 px-2 py-2.5 text-center">
                            {on
                              ? <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-sm shadow-emerald-500/30 transition group-hover:scale-110" aria-label="Covered"><Check size={15} strokeWidth={3} /></span>
                              : <span className="inline-block h-7 w-7 rounded-lg bg-gray-50 ring-1 ring-inset ring-gray-100" aria-label="Not covered" />}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card padded={false} className="motion-safe:animate-rise [animation-delay:260ms]">
          <div className="p-5 pb-0 sm:p-6 sm:pb-0">
            <CardTitle title="Waiting for access" hint={waiting.length ? 'Granting records their term fee in Finances.' : undefined}
              right={waiting.length > 0 && <Button size="sm" variant="ghost" className="h-9 rounded-xl text-[#16325c]" onClick={() => go('access')}>See all</Button>} />
          </div>
          {waiting.length === 0 ? (
            <EmptyState icon={<Clock3 size={22} />} title="No one is waiting">Teachers appear here the first time they open AI Tools.</EmptyState>
          ) : (
            <ul className="divide-y divide-gray-100 px-2 pb-3">
              {waiting.slice(0, 6).map((t) => (
                <li key={t.uid} className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-sky-50/60">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#5bb4dd] to-[#16325c] text-sm font-semibold text-white shadow-sm">{t.name.charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">{t.name}</span>
                    <span className="block truncate text-xs text-gray-500">{t.email}</span>
                  </span>
                  <Button size="sm" disabled={busy} onClick={() => void run(() => superAdminApi.setAccess(t.uid, 'granted'))} className="h-8 rounded-lg bg-[#16325c] hover:bg-[#0b1b33]">Grant</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
