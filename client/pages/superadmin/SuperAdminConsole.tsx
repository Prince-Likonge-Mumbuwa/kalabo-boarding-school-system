// @/pages/superadmin/SuperAdminConsole.tsx — the superAdmin's app. It loads
// everything in one request (GET /api/superadmin/overview) and shows it in
// six sections, each a component in @/components/superadmin/:
//
//   Overview     health, numbers, curriculum coverage, teachers waiting
//   Curriculum   upload and manage the PDFs the AI draws on
//   Syllabus maps  check and approve the topics read from each syllabus
//   AI features  switch tools on/off; daily limit
//   Access       who may use the tools
//   Usage        how much they are used
//
// Large screens: dark sidebar like the main app. Phones and tablets: a top
// bar and a row of section tabs. The open section is kept in the address
// (#curriculum, ...) so a refresh stays put. If the session has ended, it
// returns to the sign-in page.
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BarChart3, LayoutDashboard, Library, ListTree, LogOut, Sparkles, Users, Wallet } from 'lucide-react';
import { SCHOOL_LOGO_URL } from '@/components/ai/brand';
import { Card, Skeleton } from '@/components/ai/ui';
import { AccessTab } from '@/components/superadmin/AccessTab';
import { CurriculumTab } from '@/components/superadmin/CurriculumTab';
import { FeaturesTab } from '@/components/superadmin/FeaturesTab';
import { FinanceTab } from '@/components/superadmin/FinanceTab';
import { OverviewTab } from '@/components/superadmin/OverviewTab';
import { SyllabusTab } from '@/components/superadmin/SyllabusTab';
import { UsageTab } from '@/components/superadmin/UsageTab';
import { AiApiError, superAdminApi, superAdminSession } from '@/services/aiApi';
import { cn } from '@/lib/utils';

export const OVERVIEW_KEY = ['superadmin-overview'];

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'curriculum', label: 'Curriculum', icon: Library },
  { id: 'syllabus', label: 'Syllabus & modules', icon: ListTree },
  { id: 'features', label: 'AI features', icon: Sparkles },
  { id: 'access', label: 'Access', icon: Users },
  { id: 'usage', label: 'Usage', icon: BarChart3 },
  { id: 'finances', label: 'Finances', icon: Wallet },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

/** The line under each section's title. */
const SUBTITLES: Record<SectionId, string> = {
  overview: '',
  curriculum: 'The syllabi, teaching modules, textbooks and past papers the AI writes from.',
  syllabus: 'Check the topics and competences read from each syllabus, and switch teaching modules on or off.',
  features: 'Choose which AI tools teachers can use, and how many documents a day.',
  access: 'Who may use the AI tools. Granting access records the teacher’s term fee.',
  usage: 'How much each tool and each teacher uses the AI.',
  finances: 'Teacher fees received and payments to service providers, in ZMW.',
};

const sectionFromHash = (): SectionId => {
  const id = window.location.hash.replace('#', '');
  return (SECTIONS.find((s) => s.id === id)?.id ?? 'overview') as SectionId;
};

export default function SuperAdminConsole() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signedIn = superAdminSession.isSignedIn();
  const [section, setSection] = useState<SectionId>(sectionFromHash);
  const { data, isLoading, error } = useQuery({
    queryKey: OVERVIEW_KEY,
    queryFn: superAdminApi.overview,
    enabled: signedIn,
    retry: false,
    // While a document is being indexed, check every 3 seconds so its status updates by itself.
    refetchInterval: (query) => (query.state.data?.documents.some((d) => d.status === 'indexing') ? 3000 : false),
  });

  // Follow the address: back/forward buttons and links to #curriculum etc. switch section.
  useEffect(() => {
    const onHash = () => setSection(sectionFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (id: SectionId) => {
    setSection(id);
    if (window.location.hash !== `#${id}`) window.history.pushState(null, '', `#${id}`);
    window.scrollTo({ top: 0 });
  };
  const signOut = () => {
    superAdminSession.signOut();
    queryClient.removeQueries({ queryKey: OVERVIEW_KEY });
    navigate('/superadmin', { replace: true });
  };

  // A 401 means the session ended (8 hours, or the account was re-created).
  const expired = error instanceof AiApiError && error.status === 401;
  useEffect(() => { if (expired) signOut(); }, [expired]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!signedIn) return <Navigate to="/superadmin" replace />;

  const waiting = data?.teachers.filter((t) => t.access === 'pending').length ?? 0;
  const drafts = data?.maps?.filter((m) => m.status === 'draft').length ?? 0;
  const unpaid = data?.finance?.summary.unpaid.length ?? 0;
  const badge = (id: SectionId) => (id === 'access' && waiting > 0 ? waiting : id === 'syllabus' && drafts > 0 ? drafts : id === 'finances' && unpaid > 0 ? unpaid : null);
  const current = SECTIONS.find((s) => s.id === section)!;

  let body: ReactNode;
  if (isLoading)
    body = (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Card key={i}><Skeleton className="h-4 w-1/2" /><Skeleton className="mt-3 h-7 w-1/3" /></Card>)}</div>
        <Card><Skeleton className="h-48 w-full" /></Card>
      </div>
    );
  else if (error || !data)
    body = <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">{(error as Error)?.message ?? 'Could not load the console.'}</p>;
  else
    body = (
      <>
        {(!data.system.nvidiaConfigured || !data.system.chroma.ok) && (
          <div role="alert" className="mb-6 flex gap-3 rounded-2xl bg-amber-50 px-4 py-3.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div className="space-y-1">
              {!data.system.nvidiaConfigured && <p>NVIDIA_API_KEY is not set in ai-server/.env, so documents cannot be indexed or generated. Add it and restart the AI server.</p>}
              {!data.system.chroma.ok && <p>{data.system.chroma.error}</p>}
            </div>
          </div>
        )}
        {section === 'overview' && <OverviewTab data={data} go={go} />}
        {section === 'curriculum' && <CurriculumTab documents={data.documents} />}
        {section === 'syllabus' && <SyllabusTab maps={data.maps ?? []} documents={data.documents} modules={data.modules ?? []} />}
        {section === 'features' && <FeaturesTab settings={data.settings} />}
        {section === 'access' && <AccessTab teachers={data.teachers} settings={data.settings} />}
        {section === 'usage' && <UsageTab usage={data.usage} teachers={data.teachers} />}
        {section === 'finances' && <FinanceTab finance={data.finance} />}
      </>
    );

  const Light = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
    <p className="flex items-center gap-2.5">
      <span className="relative flex h-2 w-2">
        {ok && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', ok ? 'bg-emerald-400' : 'bg-red-400')} />
      </span>
      {children}
    </p>
  );

  return (
    <div className="relative min-h-screen bg-[#f3f6fb] lg:flex">
      {/* Soft brand light behind the pages */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <span className="absolute -right-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-[#5bb4dd]/15 blur-3xl" />
        <span className="absolute -bottom-48 left-1/3 h-[30rem] w-[30rem] rounded-full bg-indigo-300/15 blur-3xl" />
      </div>

      {/* Sidebar (large screens) */}
      <aside className="sticky top-0 z-10 hidden h-screen w-64 shrink-0 flex-col bg-gradient-to-b from-[#16325c] via-[#112a4f] to-[#0b1b33] text-white shadow-[8px_0_30px_-12px_rgba(11,27,51,0.5)] lg:flex">
        <div className="flex items-center gap-3 px-5 py-6">
          <span className="relative">
            <span aria-hidden className="absolute -inset-1.5 rounded-2xl bg-[#5bb4dd]/40 blur-md" />
            <img src={SCHOOL_LOGO_URL} alt="" className="relative h-11 w-11 rounded-xl bg-white p-0.5 shadow-lg" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold tracking-tight">KalaboBoarding</p>
            <p className="text-xs text-[#9fd6ef]">AI command centre</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2" aria-label="Sections">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const on = section === s.id;
            return (
              <button key={s.id} type="button" onClick={() => go(s.id)} aria-current={on ? 'page' : undefined}
                className={cn('group relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5bb4dd]',
                  on ? 'bg-white/[0.12] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]' : 'text-blue-100/70 hover:bg-white/[0.06] hover:text-white')}>
                {on && <span aria-hidden className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-[#5bb4dd] shadow-[0_0_12px_#5bb4dd]" />}
                <Icon size={18} className={cn('transition', on ? 'text-[#7fcbec]' : 'group-hover:translate-x-0.5')} />
                <span className="flex-1 text-left">{s.label}</span>
                {badge(s.id) && <span className="rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-gray-900 shadow-[0_0_10px_rgba(251,191,36,0.6)]">{badge(s.id)}</span>}
              </button>
            );
          })}
        </nav>
        {data && (
          <div className="mx-3 mb-3 space-y-2 rounded-2xl bg-white/[0.06] px-4 py-3.5 text-xs text-blue-100/80 ring-1 ring-inset ring-white/10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-100/50">System</p>
            <Light ok={data.system.nvidiaConfigured}>AI writer {data.system.nvidiaConfigured ? 'connected' : 'not set up'}</Light>
            <Light ok={data.system.chroma.ok}>Search index {data.system.chroma.ok ? 'online' : 'offline'}</Light>
          </div>
        )}
        <div className="border-t border-white/10 p-3">
          <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-blue-100/70 transition hover:bg-red-500/15 hover:text-red-200">
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>

      <div className="relative min-w-0 flex-1">
        {/* Top bar and tabs (phones, tablets) */}
        <header className="sticky top-0 z-30 bg-gradient-to-r from-[#0b1b33] to-[#16325c] text-white shadow-lg lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <img src={SCHOOL_LOGO_URL} alt="" className="h-9 w-9 rounded-lg bg-white p-0.5" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">KalaboBoarding</p>
              <p className="text-xs text-[#9fd6ef]">AI command centre</p>
            </div>
            <button type="button" onClick={signOut} aria-label="Sign out" className="flex h-10 w-10 items-center justify-center rounded-xl text-blue-100/80 hover:bg-white/10 hover:text-white"><LogOut size={18} /></button>
          </div>
          <nav className="flex gap-1.5 overflow-x-auto px-3 pb-3" aria-label="Sections">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const on = section === s.id;
              return (
                <button key={s.id} type="button" onClick={() => go(s.id)} aria-current={on ? 'page' : undefined}
                  className={cn('flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition',
                    on ? 'bg-[#5bb4dd] text-[#0b1b33] shadow-[0_0_14px_rgba(91,180,221,0.55)]' : 'bg-white/10 text-blue-100/80')}>
                  <Icon size={16} /> {s.label}
                  {badge(s.id) && <span className="rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-gray-900">{badge(s.id)}</span>}
                </button>
              );
            })}
          </nav>
        </header>

        <main className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {section !== 'overview' && (
            <div key={section} className="mb-6 motion-safe:animate-rise lg:mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2a6fa8]">AI administration</p>
              <h1 className="mt-1 bg-gradient-to-r from-[#0b1b33] via-[#16325c] to-[#2a6fa8] bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">{current.label}</h1>
              <p className="mt-1 text-sm text-gray-500">{SUBTITLES[section]}</p>
            </div>
          )}
          {section === 'overview' && <h1 className="sr-only">Overview</h1>}
          <div key={`body-${section}`} className="motion-safe:animate-fade-in">{body}</div>
        </main>
      </div>
    </div>
  );
}
