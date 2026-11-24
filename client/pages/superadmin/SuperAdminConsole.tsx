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

  return (
    <div className="min-h-screen bg-gray-50 lg:flex">
      {/* Sidebar (large screens) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-gray-900 text-white lg:flex">
        <div className="flex items-center gap-3 border-b border-gray-800 px-5 py-5">
          <img src={SCHOOL_LOGO_URL} alt="" className="h-10 w-10 rounded-lg bg-white p-0.5" />
          <div className="min-w-0">
            <p className="truncate font-bold">KalaboBoarding</p>
            <p className="text-xs text-gray-400">AI administration</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-5" aria-label="Sections">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const on = section === s.id;
            return (
              <button key={s.id} type="button" onClick={() => go(s.id)} aria-current={on ? 'page' : undefined}
                className={cn('flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                  on ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white')}>
                <Icon size={18} /> <span className="flex-1 text-left">{s.label}</span>
                {badge(s.id) && <span className="rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-gray-900">{badge(s.id)}</span>}
              </button>
            );
          })}
        </nav>
        {data && (
          <div className="mx-3 mb-3 rounded-xl bg-gray-800/60 px-3.5 py-3 text-xs text-gray-400">
            <p className="flex items-center gap-2"><span className={cn('h-2 w-2 rounded-full', data.system.chroma.ok ? 'bg-emerald-400' : 'bg-red-400')} /> Search index {data.system.chroma.ok ? 'online' : 'offline'}</p>
            <p className="mt-1.5 flex items-center gap-2"><span className={cn('h-2 w-2 rounded-full', data.system.nvidiaConfigured ? 'bg-emerald-400' : 'bg-red-400')} /> NVIDIA {data.system.nvidiaConfigured ? 'connected' : 'not set up'}</p>
          </div>
        )}
        <div className="border-t border-gray-800 p-3">
          <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-gray-300 transition hover:bg-red-600/20 hover:text-red-300">
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Top bar and tabs (phones, tablets) */}
        <header className="sticky top-0 z-30 bg-gray-900 text-white lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <img src={SCHOOL_LOGO_URL} alt="" className="h-9 w-9 rounded-lg bg-white p-0.5" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">KalaboBoarding</p>
              <p className="text-xs text-gray-400">AI administration</p>
            </div>
            <button type="button" onClick={signOut} aria-label="Sign out" className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-300 hover:bg-gray-800 hover:text-white"><LogOut size={18} /></button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3" aria-label="Sections">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const on = section === s.id;
              return (
                <button key={s.id} type="button" onClick={() => go(s.id)} aria-current={on ? 'page' : undefined}
                  className={cn('flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition', on ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300')}>
                  <Icon size={16} /> {s.label}
                  {badge(s.id) && <span className="rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-gray-900">{badge(s.id)}</span>}
                </button>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <div className="mb-6 lg:mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{current.label}</h1>
            {data && section === 'overview' && <p className="mt-1 hidden text-sm text-gray-500 sm:block">Writing with {data.system.chatModel} · searching with {data.system.embeddingModel}</p>}
          </div>
          {body}
        </main>
      </div>
    </div>
  );
}
