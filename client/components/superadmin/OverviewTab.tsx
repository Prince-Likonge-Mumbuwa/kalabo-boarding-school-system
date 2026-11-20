// @/components/superadmin/OverviewTab.tsx — the superAdmin's start page:
// the main numbers, which subjects and class levels have curriculum
// material (the coverage grid), and teachers waiting for access.
import { Check, Clock3, FileText, Library, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardTitle, EmptyState, Stat } from '@/components/ai/ui';
import { superAdminApi } from '@/services/aiApi';
import { LEVELS, type SuperAdminOverview } from '@/types/ai';
import { useOverviewAction } from './useOverviewAction';

type SectionId = 'overview' | 'curriculum' | 'features' | 'access' | 'usage';

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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat icon={<Library size={20} />} label="Documents ready" value={ready.length} hint={`${data.documents.length} in the library`} />
        <Stat icon={<FileText size={20} />} label="Subjects covered" value={subjects.length} />
        <Stat icon={<Users size={20} />} label="Teachers with access" value={granted} hint={waiting.length ? `${waiting.length} waiting` : `${data.teachers.length} have opened AI Tools`} />
        <Stat icon={<Sparkles size={20} />} label="Generated, 30 days" value={data.usage.generatedLast30Days} hint={`${toolsOn} of 5 tools switched on`} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card padded={false}>
          <div className="p-5 pb-0 sm:p-6 sm:pb-0">
            <CardTitle title="Curriculum coverage" hint="Which subjects and class levels the AI has material for."
              right={<Button size="sm" variant="outline" className="h-9 rounded-xl" onClick={() => go('curriculum')}>Manage</Button>} />
          </div>
          {subjects.length === 0 ? (
            <EmptyState icon={<Library size={22} />} title="No curriculum yet" action={<Button onClick={() => go('curriculum')} className="rounded-xl bg-blue-600 hover:bg-blue-700">Upload the first syllabus</Button>}>
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
                    <tr key={s}>
                      <td className="sticky left-0 whitespace-nowrap border-t border-gray-100 bg-white py-2.5 pr-4 font-medium text-gray-900 [overflow-wrap:normal]">{s}</td>
                      {usedLevels.map((l) => {
                        const on = coverage.get(s)!.has(l);
                        return (
                          <td key={l} className="border-t border-gray-100 px-2 py-2.5 text-center">
                            {on
                              ? <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100" aria-label="Covered"><Check size={15} /></span>
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

        <Card padded={false}>
          <div className="p-5 pb-0 sm:p-6 sm:pb-0">
            <CardTitle title="Waiting for access" right={waiting.length > 0 && <Button size="sm" variant="ghost" className="h-9 rounded-xl text-blue-700" onClick={() => go('access')}>See all</Button>} />
          </div>
          {waiting.length === 0 ? (
            <EmptyState icon={<Clock3 size={22} />} title="No one is waiting">Teachers appear here the first time they open AI Tools.</EmptyState>
          ) : (
            <ul className="divide-y divide-gray-100 px-2 pb-3">
              {waiting.slice(0, 6).map((t) => (
                <li key={t.uid} className="flex items-center gap-3 px-3 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">{t.name.charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">{t.name}</span>
                    <span className="block truncate text-xs text-gray-500">{t.email}</span>
                  </span>
                  <Button size="sm" disabled={busy} onClick={() => void run(() => superAdminApi.setAccess(t.uid, 'granted'))} className="h-8 rounded-lg bg-blue-600 hover:bg-blue-700">Grant</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
