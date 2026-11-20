// @/pages/teacher/ai/AiTools.tsx — the AI Tools home: a welcome banner with
// today's allowance, one card per tool and the teacher's latest documents.
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, FileText, FolderOpen, Sparkles } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { AiGate } from '@/components/ai/AiGate';
import { GENERATORS, featureByKey } from '@/components/ai/aiFeatures';
import { SCHOOL_LOGO_URL } from '@/components/ai/brand';
import { Card, EmptyState, Pill, Skeleton } from '@/components/ai/ui';
import { useAuth } from '@/hooks/useAuth';
import { teacherAi } from '@/services/aiApi';
import type { TeacherAiSession } from '@/types/ai';
import { getCurrentAcademicTerm } from '@/utils/academicTerm';
import { cn } from '@/lib/utils';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
export const timeAgo = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days} d ago` : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

function Hub({ session }: { session: TeacherAiSession }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const term = getCurrentAcademicTerm();
  const { data: documents, isLoading } = useQuery({ queryKey: ['efile'], queryFn: teacherAi.efileList, retry: false });
  const firstName = (user?.fullName ?? '').split(' ')[0];

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#16325c] via-[#1d4b8f] to-blue-600 px-6 py-7 text-white shadow-lg sm:px-8 sm:py-9">
        {/* Soft light shapes, then the school crest on a white badge (the crest image has a white background). */}
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 right-40 h-64 w-64 rounded-full bg-sky-300/20 blur-3xl" />
        <div className="relative flex items-center gap-8">
        <div className="max-w-2xl flex-1">
          <p className="text-sm font-medium text-blue-100">{greeting()}{firstName ? `, ${firstName}` : ''}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">AI Tools</h1>
          <p className="mt-2 text-sm leading-relaxed text-blue-100 sm:text-base">
            Prepare lesson plans, schemes of work, assessments and records of work from the official curriculum, ready to print on school letterhead.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full bg-white/15 px-3 py-1 ring-1 ring-inset ring-white/20">{term.label}</span>
            {session.remainingToday !== null && (
              <span className="rounded-full bg-white/15 px-3 py-1 ring-1 ring-inset ring-white/20">
                {session.remainingToday} of {session.dailyLimit} documents left today
              </span>
            )}
            <span className="rounded-full bg-white/15 px-3 py-1 ring-1 ring-inset ring-white/20">{documents?.length ?? 0} in your eFile</span>
          </div>
        </div>
        <span className="hidden h-32 w-32 shrink-0 items-center justify-center rounded-[2rem] bg-white p-2.5 shadow-xl ring-4 ring-white/20 md:flex lg:h-36 lg:w-36">
          <img src={SCHOOL_LOGO_URL} alt="Kalabo Boarding Secondary School crest" className="h-full w-full object-contain" />
        </span>
        </div>
      </section>

      {/* Tools */}
      <section aria-labelledby="tools-heading">
        <h2 id="tools-heading" className="mb-4 text-lg font-semibold text-gray-900">Create a document</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {GENERATORS.map((tool) => {
            const on = session.features[tool.key]?.enabled;
            const Icon = tool.icon;
            return (
              <button key={tool.key} type="button" disabled={!on} onClick={() => navigate(`/dashboard/teacher/ai/${tool.slug}`)}
                className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition enabled:hover:-translate-y-0.5 enabled:hover:border-gray-300 enabled:hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60">
                <div className="flex items-start justify-between">
                  <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', tool.tone.icon)}><Icon size={22} /></span>
                  {on ? <Pill tone="green">Ready</Pill> : <Pill>Coming soon</Pill>}
                </div>
                <h3 className="mt-4 font-semibold text-gray-900">{tool.label}</h3>
                <p className="mt-1 text-sm text-gray-600">{tool.description}</p>
                <ul className="mt-4 hidden space-y-1.5 text-sm text-gray-600 sm:block">
                  {tool.outputs.map((o) => (
                    <li key={o} className="flex items-center gap-2"><Check size={14} className={tool.tone.text} /> {o}</li>
                  ))}
                </ul>
                <span className={cn('mt-5 inline-flex items-center gap-1 pt-1 text-sm font-semibold', on ? 'text-blue-700' : 'text-gray-400')}>
                  {on ? 'Start' : 'Not available yet'} {on && <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Recent documents */}
      <section aria-labelledby="recent-heading">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="recent-heading" className="text-lg font-semibold text-gray-900">Recent documents</h2>
          {session.features.eFile?.enabled && (
            <Link to="/dashboard/teacher/ai/efile" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-800">
              <FolderOpen size={16} /> Open eFile
            </Link>
          )}
        </div>
        <Card padded={false}>
          {isLoading ? (
            <div className="divide-y divide-gray-100">{[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-4 p-4"><Skeleton className="h-10 w-10" /><div className="flex-1"><Skeleton className="h-4 w-1/2" /><Skeleton className="mt-2 h-3 w-1/4" /></div></div>)}</div>
          ) : !documents?.length ? (
            <EmptyState icon={<Sparkles size={22} />} title="Nothing here yet">Documents you generate appear here and are kept in your eFile.</EmptyState>
          ) : (
            <ul className="divide-y divide-gray-100">
              {documents.slice(0, 5).map((d) => {
                const tool = featureByKey(d.feature);
                const Icon = tool.icon;
                return (
                  <li key={d.id}>
                    <Link to={`/dashboard/teacher/ai/efile/${d.id}`} className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-gray-50 sm:px-5">
                      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tool.tone.icon)}><Icon size={18} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-900">{d.title}</span>
                        <span className="block text-xs text-gray-500">{tool.label} · {timeAgo(d.createdAt)}</span>
                      </span>
                      <FileText size={16} className="hidden shrink-0 text-gray-400 sm:block" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

export default function AiTools() {
  return (
    <DashboardLayout activeTab="ai-tools">
      <div className="mx-auto max-w-7xl">
        <AiGate>{(session) => <Hub session={session} />}</AiGate>
      </div>
    </DashboardLayout>
  );
}
