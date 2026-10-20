// @/components/guidance/GuidanceWorkspace.tsx
//
// Guidance & counselling: learners grouped by sponsor, their results for a
// term, one-PDF downloads, and one-time codes that let each sponsor download
// their learners' report cards from the Parent Portal.
// Used by the admin (/dashboard/admin/guidance) and by guidance officers
// (/dashboard/teacher/guidance).

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Ban,
  Check,
  Copy,
  Download,
  HeartHandshake,
  KeyRound,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { learnerService } from '@/services/schoolService';
import {
  buildSponsorReports,
  createSponsorCode,
  listSponsorCodes,
  revokeSponsorCode,
  type SponsorReports,
} from '@/services/guidanceService';
import { displayStatus, groupLearnersBySponsor, levelHeading, shareMessage, sortLearnersByForm } from '@/services/guidancePlan';
import { getCurrentAcademicTerm, type TermName } from '@/utils/academicTerm';
import type { SponsorCode, SponsorGroup } from '@/types/guidance';
import type { Learner } from '@/types/school';

const TERMS: TermName[] = ['Term 1', 'Term 2', 'Term 3'];
const VALID_DAYS = [7, 14, 30, 90];

type Actor = { uid: string; name: string; isAdmin: boolean };

const portalUrl = () =>
  `${typeof window !== 'undefined' ? window.location.origin : 'https://www.kalaboboarding.com'}/parent-portal?mode=sponsor`;

const fmtDate = (d?: Date | null) =>
  d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function GuidanceWorkspace({ user }: { user: Actor }) {
  const [tab, setTab] = useState<'sponsors' | 'codes'>('sponsors');
  const [term, setTerm] = useState<TermName>(() => getCurrentAcademicTerm().term);
  const [year, setYear] = useState<number>(() => getCurrentAcademicTerm().year);

  const learnersQ = useQuery({ queryKey: ['guidance', 'learners'], queryFn: () => learnerService.getAllLearners(), staleTime: 5 * 60_000 });
  const learners = learnersQ.data ?? [];
  const groups = useMemo(() => groupLearnersBySponsor(learners), [learners]);

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => now + 1 - i);
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900 flex items-center gap-2">
            <HeartHandshake size={20} className="text-rose-600" /> Guidance &amp; Counselling
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Results of sponsored learners, and one-time codes that let each sponsor download their learners' report cards from the Parent Portal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={term} onChange={e => setTerm(e.target.value as TermName)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(['sponsors', 'codes'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm rounded-md font-medium ${tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
          >
            {t === 'sponsors' ? 'Sponsors' : 'Sponsor codes'}
          </button>
        ))}
      </div>

      {tab === 'sponsors' ? (
        learnersQ.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-600 p-4"><Loader2 size={16} className="animate-spin" /> Loading learners…</div>
        ) : learnersQ.isError ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">Could not load learners. Please refresh.</div>
        ) : (
          <SponsorsTab groups={groups} learners={learners} term={term} year={year} user={user} />
        )
      ) : (
        <CodesTab user={user} />
      )}
    </div>
  );
}

// ==================== SPONSORS ====================

function SponsorsTab(props: { groups: SponsorGroup[]; learners: Learner[]; term: TermName; year: number; user: Actor }) {
  const { groups, learners, term, year, user } = props;
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = groups.find(g => g.key === selectedKey) ?? null;

  const visible = groups.filter(g => !search.trim() || g.spellings.some(s => s.toLowerCase().includes(search.trim().toLowerCase())));
  const totalSponsored = groups.reduce((s, g) => s + g.count, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      <div className="bg-white border border-gray-200 rounded-xl p-3 h-fit">
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search sponsors…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <p className="text-xs text-gray-500 px-1 mb-2">
          {groups.length} sponsor{groups.length === 1 ? '' : 's'} · {totalSponsored} sponsored learner{totalSponsored === 1 ? '' : 's'} (self-sponsored not shown)
        </p>
        {groups.length === 0 ? (
          <p className="text-sm text-gray-600 p-2">No learner has a sponsor recorded yet. Sponsors are entered on the learner's details.</p>
        ) : (
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {visible.map(g => (
              <button
                key={g.key}
                onClick={() => setSelectedKey(g.key)}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between gap-2 text-sm ${
                  g.key === selectedKey ? 'bg-blue-50 border border-blue-200 text-blue-900' : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                <span className="truncate">
                  {g.name}
                  {g.spellings.length > 1 && <span className="block text-[11px] text-gray-500 truncate">also: {g.spellings.slice(1).join(', ')}</span>}
                </span>
                <span className="text-xs font-semibold bg-gray-100 text-gray-700 rounded-full px-2 py-0.5 shrink-0">{g.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected ? (
        <SponsorDetail key={`${selected.key}|${term}|${year}`} group={selected} groups={groups} learners={learners} term={term} year={year} user={user} />
      ) : (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center text-sm text-gray-600">
          <Users className="mx-auto text-gray-300 mb-2" size={36} />
          Choose a sponsor to see their learners' results, download all their report cards, or give them a code.
        </div>
      )}
    </div>
  );
}

function SponsorDetail(props: { group: SponsorGroup; groups: SponsorGroup[]; learners: Learner[]; term: TermName; year: number; user: Actor }) {
  const { group, groups, learners, term, year, user } = props;
  const [reports, setReports] = useState<SponsorReports | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [codeOpen, setCodeOpen] = useState(false);

  const members = useMemo(() => {
    const ids = new Set(group.learnerIds);
    return sortLearnersByForm(learners.filter(l => ids.has(l.id)));
  }, [group, learners]);

  const cardById = useMemo(() => new Map((reports?.cards ?? []).map(c => [c.documentId, c])), [reports]);

  const loadResults = async () => {
    setLoading(true);
    setError('');
    setProgress([0, group.learnerIds.length]);
    try {
      setReports(await buildSponsorReports(group.learnerIds, term, year, { onProgress: (d, t) => setProgress([d, t]) }));
    } catch (e: any) {
      setError(e?.message || 'Could not load the results.');
    } finally {
      setLoading(false);
    }
  };

  const downloadAll = async () => {
    setDownloading(true);
    setError('');
    try {
      const r = reports ?? (await buildSponsorReports(group.learnerIds, term, year));
      if (!reports) setReports(r);
      if (r.cards.length === 0) {
        setError(`None of these learners has results for ${term} ${year} yet.`);
        return;
      }
      const { generateSponsorReportsPDF, sponsorPdfFileName, downloadPdf } = await import('@/services/pdf/sponsorReportsPDF');
      const bytes = await generateSponsorReportsPDF({ sponsorName: group.name, term, year, cards: r.cards, noResults: r.noResults });
      downloadPdf(bytes, sponsorPdfFileName(group.name, term, year));
    } catch (e: any) {
      setError(e?.message || 'Could not make the PDF.');
    } finally {
      setDownloading(false);
    }
  };

  // Learners grouped under Form/Grade headings.
  const sections: { heading: string; rows: Learner[] }[] = [];
  for (const l of members) {
    const h = levelHeading(l.className, l.classLevel);
    const last = sections[sections.length - 1];
    if (last && last.heading === h) last.rows.push(l);
    else sections.push({ heading: h, rows: [l] });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 space-y-4 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{group.name}</h2>
          <p className="text-sm text-gray-600">
            {group.count} learner{group.count === 1 ? '' : 's'} · {term} {year}
            {reports && ` · ${reports.cards.length} with results`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={loadResults} disabled={loading} className="px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {loading ? `Loading ${progress[0]}/${progress[1]}` : reports ? 'Reload results' : 'Show results'}
          </button>
          <button onClick={downloadAll} disabled={downloading || loading} className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5 disabled:opacity-50">
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Download all (PDF)
          </button>
          <button onClick={() => setCodeOpen(true)} className="px-3 py-2 text-sm rounded-lg bg-rose-600 text-white hover:bg-rose-700 flex items-center gap-1.5">
            <KeyRound size={14} /> Generate sponsor code
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200">
              <th className="py-2 px-2">Learner</th>
              <th className="py-2 px-2">Student ID</th>
              <th className="py-2 px-2">Class</th>
              <th className="py-2 px-2 text-center">Average</th>
              <th className="py-2 px-2 text-center">Grade</th>
              <th className="py-2 px-2 text-center">Position</th>
              <th className="py-2 px-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {sections.map(s => (
              <SectionRows key={s.heading} heading={s.heading} rows={s.rows} cardById={cardById} loaded={!!reports} />
            ))}
          </tbody>
        </table>
      </div>
      {!reports && <p className="text-xs text-gray-500">Press <strong>Show results</strong> to see each learner's {term} {year} results.</p>}

      <CodeDialog open={codeOpen} onClose={() => setCodeOpen(false)} group={group} groups={groups} term={term} year={year} user={user} />
    </div>
  );
}

function SectionRows(props: { heading: string; rows: Learner[]; cardById: Map<string, any>; loaded: boolean }) {
  return (
    <>
      <tr className="bg-gray-50">
        <td colSpan={7} className="py-1.5 px-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">{props.heading} · {props.rows.length}</td>
      </tr>
      {props.rows.map(l => {
        const c = props.cardById.get(l.id);
        return (
          <tr key={l.id} className="border-b border-gray-100">
            <td className="py-2 px-2 font-medium text-gray-900">{l.fullName}</td>
            <td className="py-2 px-2 text-gray-600">{l.studentId || '—'}</td>
            <td className="py-2 px-2 text-gray-600">{l.className || '—'}</td>
            <td className="py-2 px-2 text-center">{c ? `${c.percentage}%` : '—'}</td>
            <td className="py-2 px-2 text-center font-semibold">{c && c.overallGrade > 0 ? c.overallGrade : '—'}</td>
            <td className="py-2 px-2 text-center">{c?.position || '—'}</td>
            <td className="py-2 px-2 text-center">
              {!props.loaded ? <span className="text-gray-400">—</span>
                : !c ? <span className="text-xs text-gray-500">No results</span>
                : c.status === 'pass' ? <span className="text-xs font-semibold text-green-700">Pass</span>
                : c.status === 'fail' ? <span className="text-xs font-semibold text-red-700">Fail</span>
                : <span className="text-xs text-amber-700">Pending</span>}
              {c?.isProvisional && <span className="block text-[10px] text-amber-700">provisional</span>}
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ==================== GENERATE A CODE ====================

function CodeDialog(props: { open: boolean; onClose: () => void; group: SponsorGroup; groups: SponsorGroup[]; term: TermName; year: number; user: Actor }) {
  const { open, onClose, group, groups, term, year, user } = props;
  const queryClient = useQueryClient();
  const [name, setName] = useState(group.name);
  const [extra, setExtra] = useState<Set<string>>(new Set());
  const [validDays, setValidDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<SponsorCode | null>(null);
  const [copied, setCopied] = useState<'' | 'code' | 'msg'>('');

  const others = groups.filter(g => g.key !== group.key);
  const chosen = [group, ...others.filter(g => extra.has(g.key))];
  const learnerIds = Array.from(new Set(chosen.flatMap(g => g.learnerIds)));

  const close = () => {
    setCreated(null);
    setError('');
    setExtra(new Set());
    setCopied('');
    onClose();
  };

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const c = await createSponsorCode(
        { sponsorName: name, sponsorKeys: chosen.map(g => g.key), learnerIds, term, year, validDays },
        { uid: user.uid, name: user.name }
      );
      setCreated(c);
      await queryClient.invalidateQueries({ queryKey: ['guidance', 'codes'] });
    } catch (e: any) {
      setError(e?.message || 'Could not make the code.');
    } finally {
      setBusy(false);
    }
  };

  const message = created ? shareMessage(created, portalUrl()) : '';
  const copy = async (what: 'code' | 'msg') => {
    if (await copyText(what === 'code' ? created!.code : message)) {
      setCopied(what);
      setTimeout(() => setCopied(''), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) close(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound size={18} className="text-rose-600" /> Sponsor code</DialogTitle>
          <DialogDescription>
            The sponsor enters this code in the Parent Portal to download all {term} {year} report cards of the learners they sponsor. It works once.
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-4">
            <div className="text-center bg-rose-50 border border-rose-200 rounded-xl p-5">
              <p className="text-xs uppercase tracking-wide text-rose-700 font-semibold">Code for {created.sponsorName}</p>
              <p className="text-3xl font-mono font-bold tracking-widest text-gray-900 mt-2 select-all">{created.code}</p>
              <p className="text-xs text-gray-600 mt-2">
                {created.learnerCount} learner{created.learnerCount === 1 ? '' : 's'} · {created.term} {created.year} · valid until {fmtDate(created.expiresAt)} · one use
              </p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700">{message}</div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => copy('code')} className="px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 flex items-center gap-1.5">
                {copied === 'code' ? <Check size={14} className="text-green-600" /> : <Copy size={14} />} Copy code
              </button>
              <button onClick={() => copy('msg')} className="px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 flex items-center gap-1.5">
                {copied === 'msg' ? <Check size={14} className="text-green-600" /> : <Copy size={14} />} Copy message
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-1.5"
              >
                <MessageCircle size={14} /> Send on WhatsApp
              </a>
            </div>
            <div className="flex justify-end">
              <button onClick={close} className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white">Done</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Sponsor name (shown to the sponsor)</span>
              <input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </label>

            {others.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700">Same sponsor written differently?</p>
                <p className="text-xs text-gray-500 mb-2">Tick other names that are this same organisation so their learners are included too.</p>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {others.map(g => (
                    <label key={g.key} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={extra.has(g.key)}
                        onChange={e => {
                          const next = new Set(extra);
                          if (e.target.checked) next.add(g.key); else next.delete(g.key);
                          setExtra(next);
                        }}
                      />
                      <span className="flex-1 truncate">{g.name}</span>
                      <span className="text-xs text-gray-500">{g.count}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <label className="block">
              <span className="text-sm font-medium text-gray-700">If not used, the code stops working after</span>
              <select value={validDays} onChange={e => setValidDays(Number(e.target.value))} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                {VALID_DAYS.map(d => <option key={d} value={d}>{d} days</option>)}
              </select>
            </label>

            <div className="text-sm bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-900">
              Reports: <strong>{term} {year}</strong> · Learners: <strong>{learnerIds.length}</strong>
              <span className="block text-xs text-blue-800 mt-0.5">The learner list is fixed now. Learners added to this sponsor later need a new code.</span>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2">
              <button onClick={close} className="px-4 py-2 text-sm rounded-lg border border-gray-300">Cancel</button>
              <button onClick={create} disabled={busy || !name.trim()} className="px-4 py-2 text-sm rounded-lg bg-rose-600 text-white hover:bg-rose-700 flex items-center gap-1.5 disabled:opacity-50">
                {busy && <Loader2 size={14} className="animate-spin" />} Generate code
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ==================== CODES LIST ====================

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  used: 'bg-gray-100 text-gray-700 border-gray-200',
  expired: 'bg-amber-50 text-amber-700 border-amber-200',
  revoked: 'bg-red-50 text-red-700 border-red-200',
};

function CodesTab({ user }: { user: Actor }) {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['guidance', 'codes'], queryFn: () => listSponsorCodes() });
  const [filter, setFilter] = useState<'all' | 'active' | 'used' | 'expired' | 'revoked'>('all');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const codes = (q.data ?? []).filter(c => filter === 'all' || displayStatus(c) === filter);

  const revoke = async (code: string) => {
    setBusy(code);
    setError('');
    try {
      await revokeSponsorCode(code, { uid: user.uid, name: user.name });
      await queryClient.invalidateQueries({ queryKey: ['guidance', 'codes'] });
    } catch (e: any) {
      setError(e?.message || 'Could not cancel the code.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">Each code works once. A used, expired or cancelled code cannot be used again — generate a new one.</p>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={e => setFilter(e.target.value as any)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="used">Used</option>
            <option value="expired">Expired</option>
            <option value="revoked">Cancelled</option>
          </select>
          <button onClick={() => q.refetch()} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50" title="Refresh">
            <RefreshCw size={14} className={q.isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-600"><Loader2 size={16} className="animate-spin" /> Loading codes…</div>
      ) : q.isError ? (
        <p className="text-sm text-red-600">Could not load the codes.</p>
      ) : codes.length === 0 ? (
        <p className="text-sm text-gray-600 py-4 text-center">No codes{filter !== 'all' ? ' with this status' : ' yet'}.</p>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200">
                <th className="py-2 px-2">Code</th>
                <th className="py-2 px-2">Sponsor</th>
                <th className="py-2 px-2">Reports</th>
                <th className="py-2 px-2 text-center">Learners</th>
                <th className="py-2 px-2">Made</th>
                <th className="py-2 px-2">Status</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {codes.map(c => {
                const st = displayStatus(c);
                return (
                  <tr key={c.code} className="border-b border-gray-100">
                    <td className="py-2 px-2 font-mono font-semibold text-gray-900 whitespace-nowrap">{c.code}</td>
                    <td className="py-2 px-2 text-gray-800">{c.sponsorName}</td>
                    <td className="py-2 px-2 text-gray-600 whitespace-nowrap">{c.term} {c.year}</td>
                    <td className="py-2 px-2 text-center">{c.learnerCount}</td>
                    <td className="py-2 px-2 text-gray-600 text-xs">{fmtDate(c.createdAt)}<span className="block">{c.createdByName}</span></td>
                    <td className="py-2 px-2">
                      <span className={`text-xs border rounded-full px-2 py-0.5 ${STATUS_STYLE[st]}`}>
                        {st === 'revoked' ? 'cancelled' : st}
                      </span>
                      <span className="block text-[11px] text-gray-500 mt-0.5">
                        {st === 'used' ? `used ${fmtDate(c.usedAt)}` : st === 'revoked' ? `by ${c.revokedByName || '—'}` : st === 'active' ? `until ${fmtDate(c.expiresAt)}` : `on ${fmtDate(c.expiresAt)}`}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right">
                      {st === 'active' && (
                        <button
                          onClick={() => revoke(c.code)}
                          disabled={busy === c.code}
                          className="px-2.5 py-1 text-xs rounded-lg text-red-600 bg-red-50 hover:bg-red-100 inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          {busy === c.code ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />} Cancel
                        </button>
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
}
