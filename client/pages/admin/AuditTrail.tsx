// Admin → Audit trail: who did what, to which record, and when.
// Every change made in the app is recorded (client/lib/auditedFirestore.ts),
// with sign-in / sign-out and the server's face recognition actions. Entries
// can't be changed or deleted (Firestore rules).
import { Fragment, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown, Download, History, Loader2, RefreshCw, Search } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { areaOf, auditCsv, contextLine, loadAuditTrail, type AuditRow } from '@/services/auditService';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const VERB: Record<string, string> = { create: 'Created', set: 'Saved', merge: 'Saved', update: 'Updated', delete: 'Deleted' };
const ROLE: Record<string, string> = { admin: 'Admin', teacher: 'Teacher', system: 'System' };

export function filterAuditRows(rows: AuditRow[], f: { person: string; area: string; text: string }) {
  const q = f.text.trim().toLowerCase();
  return rows.filter(r =>
    (!f.person || r.actorId === f.person)
    && (!f.area || r.areas.includes(f.area))
    && (!q || [r.summary, r.actorName, r.page, ...r.ops.flatMap(o => [o.path, o.label, o.docId, ...(o.fields ?? []), ...Object.values(o.values ?? {}).map(String)])]
      .some(v => v && String(v).toLowerCase().includes(q))));
}

export default function AuditTrail() {
  const today = useMemo(() => new Date(), []);
  const weekAgo = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 6); return d; }, []);
  const [from, setFrom] = useState(iso(weekAgo));
  const [to, setTo] = useState(iso(today));
  const [person, setPerson] = useState('');
  const [area, setArea] = useState('');
  const [text, setText] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const badRange = fromIso(from) > fromIso(to);
  const q = useInfiniteQuery({
    queryKey: ['audit_trail', from, to],
    queryFn: ({ pageParam }) => loadAuditTrail(fromIso(from), fromIso(to), pageParam as any),
    initialPageParam: undefined as any,
    getNextPageParam: last => last.cursor ?? undefined,
    enabled: !badRange,
    staleTime: 30_000,
  });

  const all = useMemo(() => (q.data?.pages ?? []).flatMap(p => p.rows).sort((a, b) => b.at.getTime() - a.at.getTime()), [q.data]);
  const people = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of all) if (r.actorId && !m.has(r.actorId)) m.set(r.actorId, r.actorName || r.actorId);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);
  const areas = useMemo(() => Array.from(new Set(all.flatMap(r => r.areas))).sort(), [all]);
  const rows = useMemo(() => filterAuditRows(all, { person, area, text }), [all, person, area, text]);

  const exportCsv = () => {
    const blob = new Blob([auditCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-trail_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  let lastDay = '';
  return (
    <DashboardLayout activeTab="audit-trail">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 sm:text-2xl"><History size={22} /> Audit trail</h1>
            <p className="text-sm text-gray-600">Every change made in the system — who, what, which record and when. Entries can't be changed or deleted.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => q.refetch()} disabled={q.isFetching} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw size={14} className={q.isFetching ? 'animate-spin' : ''} /> Refresh
            </button>
            <button type="button" onClick={exportCsv} disabled={!rows.length} className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-white p-3 sm:grid-cols-3 lg:grid-cols-5">
          <label className="text-xs text-gray-600">From
            <input type="date" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
          </label>
          <label className="text-xs text-gray-600">To
            <input type="date" value={to} min={from} max={iso(today)} onChange={e => e.target.value && setTo(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
          </label>
          <label className="text-xs text-gray-600">Person
            <select value={person} onChange={e => setPerson(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900">
              <option value="">Everyone</option>
              {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-600">Area
            <select value={area} onChange={e => setArea(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900">
              <option value="">All areas</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="col-span-2 text-xs text-gray-600 sm:col-span-2 lg:col-span-1">Search
            <span className="relative mt-1 block">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={text} onChange={e => setText(e.target.value)} placeholder="Name, student ID, field…" className="w-full rounded-lg border border-gray-300 py-1.5 pl-8 pr-2 text-sm text-gray-900" />
            </span>
          </label>
        </div>

        {badRange ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">The "From" date is after the "To" date.</p>
        ) : q.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Loading…</p>
        ) : q.isError ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Could not load the audit trail: {(q.error as Error)?.message}</p>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white">
            <p className="border-b border-gray-100 px-4 py-2 text-xs text-gray-600">
              {rows.length} entr{rows.length === 1 ? 'y' : 'ies'}{rows.length !== all.length ? ` of ${all.length} loaded` : ''}
              {q.hasNextPage ? ' · older entries in this range not loaded yet' : ''}
            </p>
            <ul className="divide-y divide-gray-100">
              {rows.map(r => {
                const day = r.at.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                const header = day !== lastDay;
                lastDay = day;
                const expanded = open === r.id;
                return (
                  <Fragment key={r.id}>
                    {header && <li className="bg-gray-50 px-4 py-1.5 text-xs font-semibold text-gray-600">{day}</li>}
                    <li>
                      <button type="button" onClick={() => setOpen(expanded ? null : r.id)} aria-expanded={expanded} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-blue-50/50">
                        <span className="w-16 shrink-0 pt-0.5 font-mono text-xs text-gray-500">{r.at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-gray-900">{r.summary}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                            <span className="font-medium text-gray-700">{r.actorName || r.actorId || 'Unknown'}</span>
                            {r.actorRole && <span className="rounded bg-gray-100 px-1.5">{ROLE[r.actorRole] ?? r.actorRole}</span>}
                            {r.areas.map(a => <span key={a} className="rounded bg-blue-50 px-1.5 text-blue-800">{a}</span>)}
                          </span>
                        </span>
                        <ChevronDown size={16} className={`mt-1 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      </button>
                      {expanded && (
                        <div className="space-y-1.5 bg-gray-50/60 px-4 pb-3 pt-1 text-xs">
                          <p className="text-gray-500">
                            {r.at.toLocaleString('en-GB')}{r.page ? ` · page ${r.page}` : ''}{r.source === 'face' ? ' · recorded by the face recognition server' : ''}
                          </p>
                          <ul className="space-y-1">
                            {r.ops.map((o, i) => (
                              <li key={i} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
                                <span className="font-medium text-gray-800">{o.op === 'event' ? o.action : `${VERB[o.op] ?? o.op} · ${areaOf(o.collection)}`}</span>
                                {o.path && <span className="ml-2 break-all font-mono text-gray-500">{o.path}</span>}
                                {o.label && <span className="ml-2 text-gray-700">“{o.label}”</span>}
                                {o.op !== 'event' && contextLine(o) && (
                                  <span className="mt-0.5 block text-gray-700">{contextLine(o)}</span>
                                )}
                                {o.values && Object.keys(o.values).length > 0 && (
                                  <span className="mt-0.5 block break-words text-gray-600">
                                    {Object.entries(o.values).map(([k, v]) => `${k}: ${v === null ? '—' : String(v)}`).join(' · ')}
                                  </span>
                                )}
                                {o.fields && o.fields.some(f => !(o.values && f in o.values)) && (
                                  <span className="mt-0.5 block text-gray-500">Also changed: {o.fields.filter(f => !(o.values && f in o.values)).join(', ')}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  </Fragment>
                );
              })}
              {rows.length === 0 && <li className="p-6 text-center text-sm text-gray-500">Nothing recorded {all.length ? 'matches these filters' : 'in these dates'}.</li>}
            </ul>
            {q.hasNextPage && (
              <div className="border-t border-gray-100 p-3 text-center">
                <button type="button" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50">
                  {q.isFetchingNextPage && <Loader2 size={14} className="animate-spin" />} Load older entries
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
