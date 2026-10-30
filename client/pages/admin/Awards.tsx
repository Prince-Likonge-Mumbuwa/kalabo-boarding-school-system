// @/pages/admin/Awards.tsx
//
// Admin: "Awards" tab of Results & SBA — /dashboard/admin/awards
//
// Shows the overall top three learners of a term in every class and every
// grade level, and prints their certificates (gold 1st, silver 2nd, bronze
// 3rd). The admin can untick anyone before printing.
//
//   data     → services/awardsLoader.ts  (same numbers as Report Cards)
//   ranking  → services/awardsService.ts (top three, ties, pass rule)
//   PDF      → services/pdf/certificatePDF.ts

import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Award, Download, Loader2, RefreshCw } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useEmbedded } from '@/components/workspace/embedded';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { getCurrentAcademicTerm, type TermName } from '@/utils/academicTerm';
import { loadAwardStandings } from '@/services/awardsLoader';
import {
  computeAwards,
  levelKeyOf,
  levelLabelOf,
  testsLabel,
  toCertificates,
  winnerKey,
  type AwardGroup,
  type AwardWinner,
} from '@/services/awardsService';
import type { AwardScope, CertificateAward } from '@/services/pdf/certificatePDF';

const TERMS: TermName[] = ['Term 1', 'Term 2', 'Term 3'];

const MEDAL: Record<number, { label: string; className: string }> = {
  1: { label: '1st', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  2: { label: '2nd', className: 'bg-slate-100 text-slate-700 border-slate-300' },
  3: { label: '3rd', className: 'bg-orange-100 text-orange-800 border-orange-300' },
};

type ScopeChoice = 'both' | AwardScope;

/** Saves PDF bytes as a file in the browser. */
function savePdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes.slice().buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Awards() {
  const embedded = useEmbedded();
  const current = getCurrentAcademicTerm();
  const years = [current.year - 1, current.year, current.year + 1];
  const [term, setTerm] = useState<TermName>(current.term);
  const [year, setYear] = useState<number>(current.year);
  const [scope, setScope] = useState<ScopeChoice>('both');
  const [level, setLevel] = useState<string>('all');
  const [showScore, setShowScore] = useState(true);
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  /** Winners the admin unticked (by winnerKey). */
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { classes, isLoading: classesLoading } = useSchoolClasses({ isActive: true });
  const classList = useMemo(
    () => (classes ?? []).map(c => ({ id: c.id, name: c.name, type: c.type, level: c.level })),
    [classes],
  );

  const standings = useQuery({
    queryKey: ['awards', term, year, classList.map(c => c.id).join(',')],
    queryFn: () => loadAwardStandings(classList, term, year),
    enabled: classList.length > 0,
    staleTime: 60_000,
  });

  const levels = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of classList) seen.set(levelKeyOf(c), levelLabelOf(c));
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [classList]);

  const groups: AwardGroup[] = useMemo(() => {
    if (!standings.data) return [];
    const scopes: AwardScope[] = scope === 'both' ? ['class', 'level'] : [scope];
    return computeAwards(standings.data.classes, { scopes }).filter(g => level === 'all' || g.levelKey === level);
  }, [standings.data, scope, level]);

  const isIncluded = (g: AwardGroup, w: AwardWinner) => !excluded.has(winnerKey(g, w));
  const selectedCount = groups.reduce((n, g) => n + g.winners.filter(w => isIncluded(g, w)).length, 0);
  const pendingTotal = groups.filter(g => g.scope === 'class').reduce((n, g) => n + g.pendingCount, 0);

  const toggle = (g: AwardGroup, w: AwardWinner) =>
    setExcluded(prev => {
      const next = new Set(prev);
      const k = winnerKey(g, w);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  async function print(certs: CertificateAward[], filename: string, busyKey: string) {
    if (certs.length === 0 || !standings.data) return;
    setBusy(busyKey);
    setError(null);
    try {
      const { generateCertificatesPDF } = await import('@/services/pdf/certificatePDF');
      const bytes = await generateCertificatesPDF(certs, {
        term,
        year,
        testsLabel: testsLabel(standings.data.testLabels),
        showScore,
        issueDate: new Date(`${issueDate}T12:00:00`),
      });
      savePdf(bytes, filename);
    } catch (e) {
      console.error('Certificate PDF failed:', e);
      setError(e instanceof Error ? e.message : 'The certificates could not be made.');
    } finally {
      setBusy(null);
    }
  }

  const fileBase = `award-certificates-${term.replace(/\s+/g, '-')}-${year}`;
  const loading = classesLoading || standings.isLoading;

  return (
    <DashboardLayout activeTab="results-sba">
      <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div className="min-w-0">
            {!embedded && (
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 tracking-tight">Awards</h1>
            )}
            <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
              Overall top three in each class and each grade level — all subjects, all of the term's tests.
              Same overall percentages as the report cards.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Field label="Term">
              <select value={term} onChange={e => setTerm(e.target.value as TermName)} className={selectCls}>
                {TERMS.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Year">
              <select value={year} onChange={e => setYear(Number(e.target.value))} className={selectCls}>
                {years.map(y => <option key={y}>{y}</option>)}
              </select>
            </Field>
            <Field label="Awards">
              <select value={scope} onChange={e => setScope(e.target.value as ScopeChoice)} className={selectCls}>
                <option value="both">Class + Grade level</option>
                <option value="class">Class only</option>
                <option value="level">Grade level only</option>
              </select>
            </Field>
            <Field label="Level">
              <select value={level} onChange={e => setLevel(e.target.value)} className={selectCls}>
                <option value="all">All levels</option>
                {levels.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </Field>
            <button
              onClick={() => standings.refetch()}
              disabled={standings.isFetching}
              className="inline-flex items-center bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 px-3 py-2 text-sm disabled:opacity-50"
              title="Reload results"
            >
              <RefreshCw size={15} className={standings.isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Print settings */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700">
            <label className="inline-flex items-center gap-2">
              Date on certificates
              <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={showScore} onChange={e => setShowScore(e.target.checked)} className="rounded" />
              Print the overall % and grade
            </label>
          </div>
          <button
            onClick={() => print(toCertificates(groups, term, year, isIncluded), `${fileBase}.pdf`, 'all')}
            disabled={selectedCount === 0 || busy !== null}
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy === 'all' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Download {selectedCount} certificate{selectedCount === 1 ? '' : 's'}
          </button>
        </div>

        {error && <Notice tone="error">{error}</Notice>}
        {standings.isError && (
          <Notice tone="error">Results could not be loaded: {(standings.error as Error)?.message ?? 'please try again.'}</Notice>
        )}
        {pendingTotal > 0 && !loading && (
          <Notice tone="warn">
            {pendingTotal} learner{pendingTotal === 1 ? ' has' : 's have'} tests still pending and {pendingTotal === 1 ? 'is' : 'are'} not ranked.
            Their averages could still change — print once all marks are in (see Results Monitor).
          </Notice>
        )}

        {loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center gap-3">
            <Loader2 className="animate-spin text-blue-600" size={32} />
            <p className="text-sm text-gray-600">Working out the top learners…</p>
          </div>
        )}

        {!loading && standings.data && groups.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Award className="mx-auto text-gray-300 mb-3" size={40} />
            <p className="text-sm text-gray-600">No results for {term} {year} yet.</p>
          </div>
        )}

        {/* One card per class / grade level */}
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map(g => (
            <div key={g.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className={`px-4 py-2.5 flex items-center justify-between ${g.scope === 'level' ? 'bg-indigo-50' : 'bg-gray-50'}`}>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">
                    {g.scope === 'level' ? 'Grade level award' : 'Class award'}
                  </p>
                  <p className="font-semibold text-gray-900 truncate">{g.groupLabel}</p>
                </div>
                <button
                  onClick={() => print(
                    toCertificates([g], term, year, isIncluded),
                    `${fileBase}-${g.groupLabel.replace(/\s+/g, '-')}${g.scope === 'level' ? '-level' : ''}.pdf`,
                    g.id,
                  )}
                  disabled={busy !== null || g.winners.every(w => !isIncluded(g, w))}
                  className="inline-flex items-center gap-1 text-xs text-indigo-700 hover:text-indigo-900 disabled:opacity-40"
                  title={`Download ${g.groupLabel} certificates`}
                >
                  {busy === g.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  PDF
                </button>
              </div>

              {g.winners.length === 0 ? (
                <p className="px-4 py-4 text-sm text-gray-500">No learner qualifies yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {g.winners.map(w => (
                    <li key={w.learnerId} className="px-4 py-2.5 flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isIncluded(g, w)}
                        onChange={() => toggle(g, w)}
                        className="rounded"
                        aria-label={`Print certificate for ${w.learnerName}`}
                      />
                      <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${MEDAL[w.position].className}`}>
                        {w.tied ? '=' : ''}{MEDAL[w.position].label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm truncate ${isIncluded(g, w) ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{w.learnerName}</p>
                        {g.scope === 'level' && <p className="text-xs text-gray-500">{w.className}</p>}
                      </div>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums">{w.percentage}%</span>
                    </li>
                  ))}
                </ul>
              )}
              {g.pendingCount > 0 && (
                <p className="px-4 py-2 text-[11px] text-amber-700 bg-amber-50 border-t border-amber-100">
                  {g.pendingCount} not ranked — tests pending
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}

const selectCls = 'px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-0.5">{label}</label>
      {children}
    </div>
  );
}

function Notice({ tone, children }: { tone: 'warn' | 'error'; children: ReactNode }) {
  const cls = tone === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-900';
  return (
    <div className={`border rounded-xl p-3 flex items-start gap-2 text-sm ${cls}`}>
      <AlertCircle size={18} className="shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}
