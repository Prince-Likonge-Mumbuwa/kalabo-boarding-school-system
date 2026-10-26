// @/components/results/TeacherResultsWarning.tsx
//
// Teacher dashboard: results still to enter.
//
//   ┌ Results to enter · Term 3 2026                 120 of 194 entered  62% ▓▓▓░ ┐
//   │ [ WEEK 8 RESULTS DUE IN  02 : 14 : 37 : 09 ]  (live, to the second)          │
//   │   End of Term results due in 23d 04h 12m 51s                                 │
//   │ Week 8 test · due Fri 14 Nov                                     38 missing  │
//   │   Form 1A · Mathematics   ▓▓▓▓░  12 of 40 still to enter           [Enter]   │
//   │   …                                                                          │
//   │ Earlier terms: Term 2 2026 — 14 missing (tap to open)                        │
//   └──────────────────────────────────────────────────────────────────────────────┘
//
// One line per class and subject for each test — the class, subject, test and
// deadline are each said once. The counts come from the Results Entry
// Monitor (the same grid as Results Entry and the report cards).

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { CheckCircle, ChevronDown, ChevronRight, ClipboardList, Info, PenLine } from 'lucide-react';
import { useResultsEntryMonitor } from '@/hooks/useResultsEntryMonitor';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import { getAllTermsForYear, isCurrentTerm, type TermName, type AcademicTermInfo } from '@/utils/academicTerm';
import { deadlineEnd, formatDay } from '@/services/resultsDeadlines';
import { CountdownText, DeadlineCountdown } from './DeadlineCountdown';

interface TeacherResultsWarningProps {
  /** If provided, ONLY this term is scanned; otherwise every term of the academic year. */
  term?: string;
  /** Academic year to scan (defaults to the current academic year). */
  year?: number;
  /** A one-line banner that opens into the full list. */
  compact?: boolean;
  /** Custom navigation handler. Falls back to internal `navigate()`. */
  onNavigateToResults?: (entry: any) => void;
}

const EXAM_ORDER = ['week4', 'week8', 'endOfTerm'];
const EXAM_NAME: Record<string, string> = { week4: 'Week 4', week8: 'Week 8', endOfTerm: 'End of Term' };
const EXAM_KIND: Record<string, string> = { week4: 'test', week8: 'test', endOfTerm: 'exam' };
const ROWS_SHOWN = 4;

interface TestGroup {
  examType: string;
  deadline: string | null;
  missing: number;
  entries: any[];
}

/** Missing entries grouped by test; overdue / nearest deadline first, then W4, W8, EOT. */
function groupByTest(entries: any[]): TestGroup[] {
  const map = new Map<string, TestGroup>();
  for (const e of entries) {
    const g = map.get(e.examType) ?? { examType: e.examType, deadline: e.deadline ?? null, missing: 0, entries: [] };
    g.missing += e.missingStudentCount ?? 0;
    g.entries.push(e);
    map.set(e.examType, g);
  }
  const order = (g: TestGroup) => deadlineEnd(g.deadline)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return [...map.values()]
    .map(g => ({ ...g, entries: [...g.entries].sort((a, b) => b.missingStudentCount - a.missingStudentCount || a.className.localeCompare(b.className, undefined, { numeric: true })) }))
    .sort((a, b) => order(a) - order(b) || EXAM_ORDER.indexOf(a.examType) - EXAM_ORDER.indexOf(b.examType));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ─────────────────────────────────────────────────────────────────────────────
// One class + subject that still needs marks for a test
// ─────────────────────────────────────────────────────────────────────────────

function EntryRow({ entry, onEnter }: { entry: any; onEnter: () => void }) {
  const total = entry.totalStudentCount || 0;
  const missing = entry.missingStudentCount || 0;
  const donePct = total > 0 ? Math.round(((total - missing) / total) * 100) : 0;
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-gray-900">
          <span className="font-semibold">{entry.className}</span>
          <span className="text-gray-400"> · </span>
          {entry.subjectName}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-200 sm:w-32">
            <span className="block h-full rounded-full bg-blue-500" style={{ width: `${donePct}%` }} />
          </span>
          <span className="text-xs text-gray-600">
            <span className="font-semibold text-gray-900">{missing}</span> of {total} still to enter
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onEnter}
        aria-label={`Enter ${EXAM_NAME[entry.examType] ?? entry.examType} marks for ${entry.className} ${entry.subjectName}`}
        className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
      >
        <PenLine size={12} /> Enter
      </button>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// One test (Week 4 / Week 8 / End of Term) of a term
// ─────────────────────────────────────────────────────────────────────────────

function TestSection({ group, onEnter }: { group: TestGroup; onEnter: (entry: any) => void }) {
  const [all, setAll] = useState(false);
  const rows = all ? group.entries : group.entries.slice(0, ROWS_SHOWN);
  const hidden = group.entries.length - rows.length;
  return (
    <section aria-label={`${EXAM_NAME[group.examType]} ${EXAM_KIND[group.examType]}`} className="py-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-gray-100 pb-1">
        <h4 className="text-sm font-bold text-gray-900">
          {EXAM_NAME[group.examType] ?? group.examType} {EXAM_KIND[group.examType] ?? 'test'}
          <span className="ml-2 text-xs font-normal text-gray-500">
            {group.deadline ? `results due ${formatDay(group.deadline, { weekday: 'short', day: 'numeric', month: 'short' })}` : 'no deadline set'}
          </span>
        </h4>
        <span className="text-xs text-gray-600">{plural(group.missing, 'mark')} missing</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {rows.map(e => (
          <EntryRow key={`${e.classId}|${e.subjectId}|${e.examType}`} entry={e} onEnter={() => onEnter(e)} />
        ))}
      </ul>
      {group.entries.length > ROWS_SHOWN && (
        <button type="button" onClick={() => setAll(!all)} className="mt-1 text-xs font-medium text-blue-700 hover:underline">
          {all ? 'Show fewer' : `Show ${hidden} more`}
        </button>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The countdowns: the nearest deadline big, the others as one line each
// ─────────────────────────────────────────────────────────────────────────────

function Countdowns({ groups, onEnter }: { groups: TestGroup[]; onEnter: (entry: any) => void }) {
  const withDeadline = groups.filter(g => g.deadline);
  if (!withDeadline.length) return null;
  const [first, ...rest] = withDeadline;
  const classes = new Set(first.entries.map(e => `${e.classId}|${e.subjectId}`)).size;
  return (
    <div className="space-y-2">
      <DeadlineCountdown
        deadline={first.deadline!}
        title={`${EXAM_NAME[first.examType]} results`}
        detail={<>{plural(first.missing, 'mark')} still to enter in {plural(classes, 'class subject', 'class subjects')}.</>}
        action={
          <button
            type="button"
            onClick={() => onEnter(first.entries[0])}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-black"
          >
            <PenLine size={14} /> Enter now
          </button>
        }
      />
      {rest.map(g => (
        <p key={g.examType} className="flex flex-wrap items-center gap-x-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700">
          <CountdownText deadline={g.deadline!} label={`${EXAM_NAME[g.examType]} results`} />
          <span className="text-gray-500">· {plural(g.missing, 'mark')} to enter</span>
        </p>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

export const TeacherResultsWarning = ({ term: termProp, year: yearProp, compact = false, onNavigateToResults }: TeacherResultsWarningProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [openEarlier, setOpenEarlier] = useState<string | null>(null);

  const academicTerm = useAcademicTerm();
  const year = yearProp ?? academicTerm.year;

  const termsToScan: AcademicTermInfo[] = useMemo(() => {
    if (termProp) {
      const info = academicTerm.getByName(termProp as TermName, year);
      return info ? [info] : [];
    }
    return getAllTermsForYear(year);
  }, [termProp, year, academicTerm]);

  // Hooks can't be called in a loop: a fixed slot per possible term.
  const [t1, t2, t3] = termsToScan;
  const m1 = useResultsEntryMonitor({ term: t1?.term, year: t1?.year, teacherId: user?.uid, enabled: !!t1 });
  const m2 = useResultsEntryMonitor({ term: t2?.term, year: t2?.year, teacherId: user?.uid, enabled: !!t2 });
  const m3 = useResultsEntryMonitor({ term: t3?.term, year: t3?.year, teacherId: user?.uid, enabled: !!t3 });
  const monitors = [m1, m2, m3];
  const isLoading = termsToScan.length > 0 && monitors.some((m, i) => i < termsToScan.length && m.isLoading);

  const reports = useMemo(
    () =>
      termsToScan
        .map((info, i) => {
          const progress = [m1, m2, m3][i]?.myProgress;
          return progress ? { info, progress, isCurrent: isCurrentTerm(info.term, info.year) } : null;
        })
        .filter(Boolean) as Array<{ info: AcademicTermInfo; progress: any; isCurrent: boolean }>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [termsToScan, m1.myProgress, m2.myProgress, m3.myProgress],
  );

  // The main term: the pinned one, else the current one, else the latest with gaps.
  const withGaps = reports.filter(r => r.progress.missingCount > 0);
  const order: Record<string, number> = { 'Term 1': 1, 'Term 2': 2, 'Term 3': 3 };
  const main =
    (termProp ? withGaps[0] : withGaps.find(r => r.isCurrent)) ??
    [...withGaps].sort((a, b) => order[b.info.term] - order[a.info.term])[0];
  const earlier = withGaps.filter(r => r !== main).sort((a, b) => order[b.info.term] - order[a.info.term]);

  const enter = (entry: any, info: AcademicTermInfo) => {
    if (onNavigateToResults) {
      onNavigateToResults({ ...entry, term: info.term, year: info.year });
    } else {
      navigate('/dashboard/teacher/results-entry', {
        state: {
          classId: entry.classId,
          className: entry.className,
          subjectId: entry.subjectId,
          subjectName: entry.subjectName,
          examType: entry.examType,
          examName: entry.examName,
          term: info.term,
          year: info.year,
        },
      });
    }
  };

  // ── Loading / nothing to do ────────────────────────────────────────────
  if (isLoading) {
    if (compact) return null;
    return (
      <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 h-5 w-1/3 rounded bg-gray-200" />
        <div className="h-16 rounded bg-gray-100" />
      </div>
    );
  }

  if (!main) {
    if (compact) return null;
    const anyAssignments = reports.some(r => (r.progress.teachingAssignments?.length ?? 0) > 0);
    if (!anyAssignments) {
      return (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <Info className="text-gray-500" size={20} />
          <div>
            <p className="font-medium text-gray-700">No class assignments found</p>
            <p className="text-sm text-gray-500">You don't have any subjects to enter marks for in {year}. Please contact the administrator.</p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
        <CheckCircle className="text-green-600" size={20} />
        <div>
          <p className="font-semibold text-green-800">All results entered</p>
          <p className="text-sm text-green-700">
            Every mark is in for {termProp && reports[0] ? reports[0].info.label : `every term of ${year}`}.
          </p>
        </div>
      </div>
    );
  }

  const groups = groupByTest(main.progress.missingEntries ?? []);
  const p = main.progress;
  const pct = p.completionPercentage;

  const body = (
    <div className="space-y-4 p-4">
      <Countdowns groups={groups} onEnter={e => enter(e, main.info)} />
      <div className="space-y-3">
        {groups.map(g => (
          <TestSection key={g.examType} group={g} onEnter={e => enter(e, main.info)} />
        ))}
      </div>
      {earlier.length > 0 && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Earlier terms</p>
          {earlier.map(r => {
            const isOpen = openEarlier === r.info.term;
            return (
              <div key={r.info.term} className="rounded-lg border border-red-200 bg-red-50/50">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenEarlier(isOpen ? null : r.info.term)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                >
                  <span className="flex items-center gap-1.5 font-medium text-red-900">
                    {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    {r.info.label}
                  </span>
                  <span className="text-xs text-red-800">{plural(r.progress.missingCount, 'mark')} missing</span>
                </button>
                {isOpen && (
                  <div className="space-y-3 border-t border-red-100 bg-white px-3 py-2">
                    {groupByTest(r.progress.missingEntries ?? []).map(g => (
                      <TestSection key={g.examType} group={g} onEnter={e => enter(e, r.info)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const header = (
    <div className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <h3 className="flex items-center gap-2 font-bold text-gray-900">
        <ClipboardList size={18} className="text-blue-700" />
        Results to enter
        <span className="text-sm font-normal text-gray-500">· {main.info.label}</span>
      </h3>
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-600">
          {p.completedCount} of {p.totalRequired} entered
        </span>
        <span className="h-2 w-28 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
          <span className={`block h-full rounded-full ${pct < 50 ? 'bg-red-500' : pct < 75 ? 'bg-amber-500' : 'bg-blue-600'}`} style={{ width: `${pct}%` }} />
        </span>
        <span className="w-10 text-right text-sm font-bold text-gray-900">{pct}%</span>
      </div>
    </div>
  );

  // ── Compact: one line that opens into the list ─────────────────────────
  if (compact) {
    const next = groups.find(g => g.deadline);
    const totalMissing = withGaps.reduce((n, r) => n + r.progress.missingCount, 0);
    return (
      <div className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex w-full flex-wrap items-center justify-between gap-2 bg-amber-50 px-3 py-2.5 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <ClipboardList size={16} />
            {plural(totalMissing, 'mark')} to enter
          </span>
          <span className="flex items-center gap-2 text-xs">
            {next && <CountdownText deadline={next.deadline!} label={EXAM_NAME[next.examType]} />}
            {open ? <ChevronDown size={15} className="text-amber-800" /> : <ChevronRight size={15} className="text-amber-800" />}
          </span>
        </button>
        {open && (
          <>
            {header}
            {body}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {header}
      {body}
    </div>
  );
};
