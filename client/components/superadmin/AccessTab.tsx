// @/components/superadmin/AccessTab.tsx — who may use the AI tools. A teacher
// appears here the first time they open AI Tools in the school app; the
// superAdmin then grants or withdraws access.
import { useState } from 'react';
import { CheckCircle2, Search, UserCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardTitle, EmptyState, Pill, TextInput } from '@/components/ai/ui';
import { superAdminApi } from '@/services/aiApi';
import type { AccessState, AiSettings, AiTeacher } from '@/types/ai';
import { cn } from '@/lib/utils';
import { useOverviewAction } from './useOverviewAction';

const STATE: Record<AccessState, { label: string; tone: 'amber' | 'green' | 'red' }> = {
  pending: { label: 'Waiting', tone: 'amber' },
  granted: { label: 'Granted', tone: 'green' },
  revoked: { label: 'Withdrawn', tone: 'red' },
};

export function AccessTab({ teachers, settings }: { teachers: AiTeacher[]; settings: AiSettings }) {
  const { run, busy, error } = useOverviewAction();
  const [filter, setFilter] = useState<AccessState | 'all'>('all');
  const [search, setSearch] = useState('');
  const setMode = (accessMode: AiSettings['accessMode']) => void run(() => superAdminApi.updateSettings({ accessMode }));
  const setAccess = (uid: string, access: AccessState) => void run(() => superAdminApi.setAccess(uid, access));

  const count = (f: AccessState | 'all') => (f === 'all' ? teachers.length : teachers.filter((t) => t.access === f).length);
  const shown = teachers.filter((t) => (filter === 'all' || t.access === filter)
    && (!search.trim() || `${t.name} ${t.email}`.toLowerCase().includes(search.trim().toLowerCase())));

  const modes: { value: AiSettings['accessMode']; title: string; text: string; icon: typeof Users }[] = [
    { value: 'selected', title: 'Only teachers I grant', text: 'New teachers wait in the list below until you grant access.', icon: UserCheck },
    { value: 'all', title: 'Every signed-in teacher', text: 'Anyone with a school account, except those you withdraw. This includes sign-ups the school has not approved yet.', icon: Users },
  ];

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</p>}
      <div role="radiogroup" aria-label="Who can use the AI tools" className="grid gap-4 md:grid-cols-2">
        {modes.map((m) => {
          const on = settings.accessMode === m.value;
          const Icon = m.icon;
          return (
            <button key={m.value} type="button" role="radio" aria-checked={on} disabled={busy} onClick={() => setMode(m.value)}
              className={cn('flex gap-4 rounded-2xl border bg-white p-5 text-left transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20',
                on ? 'border-blue-600 ring-1 ring-blue-600' : 'border-gray-200 hover:border-gray-300')}>
              <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', on ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}><Icon size={20} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-semibold text-gray-900">{m.title}{on && <CheckCircle2 size={16} className="text-blue-600" />}</span>
                <span className="mt-1 block text-sm text-gray-600">{m.text}</span>
              </span>
            </button>
          );
        })}
      </div>

      <Card padded={false}>
        <div className="p-5 pb-4 sm:p-6 sm:pb-4">
          <CardTitle title="Teachers" hint="Everyone who has opened AI Tools. Granting access records the teacher's term fee in Finances (once per term)." />
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
              {(['all', 'pending', 'granted', 'revoked'] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
                  className={cn('flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition',
                    filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')}>
                  {f === 'all' ? 'All' : STATE[f].label}<span className="tabular-nums opacity-70">{count(f)}</span>
                </button>
              ))}
            </div>
            <div className="relative md:w-72">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <TextInput aria-label="Search teachers" placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 pl-10" />
            </div>
          </div>
        </div>
        {teachers.length === 0 ? (
          <EmptyState icon={<Users size={22} />} title="No teachers yet">Teachers appear here the first time they open AI Tools.</EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState title="No matching teachers" />
        ) : (
          <ul className="divide-y divide-gray-100 border-t border-gray-200">
            {shown.map((t) => (
              <li key={t.uid} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">{t.name.charAt(0).toUpperCase()}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{t.name}</p>
                    <p className="truncate text-xs text-gray-500">{t.email} · last seen {new Date(t.lastSeenAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-[52px] sm:pl-0">
                  <Pill tone={STATE[t.access].tone}>{STATE[t.access].label}</Pill>
                  <span className="ml-auto flex gap-2 sm:ml-2">
                    {t.access !== 'granted' && <Button size="sm" disabled={busy} onClick={() => setAccess(t.uid, 'granted')} className="h-8 rounded-lg bg-blue-600 hover:bg-blue-700">Grant</Button>}
                    {t.access !== 'revoked' && <Button size="sm" variant="outline" disabled={busy} onClick={() => setAccess(t.uid, 'revoked')} className="h-8 rounded-lg">Withdraw</Button>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
