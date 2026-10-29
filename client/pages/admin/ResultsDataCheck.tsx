// @/pages/admin/ResultsDataCheck.tsx
//
// Admin-only results data check. "Run check" only reads. Every fix is a
// separate button that says exactly what it will change and asks first.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { AlertCircle, CheckCircle, Loader2, Search, ShieldCheck, ArrowLeft } from 'lucide-react';
import { getCurrentAcademicTerm, formatTermLabel, type TermName } from '@/utils/academicTerm';
import { resultsService } from '@/services/resultsService';
import {
  runDataCheck,
  fixMissingLearnerStatus,
  fixMissingStudentIndex,
  fixMissingNormalizedSubject,
  countAllMissingNormalizedSubject,
  moveWrongTermGroup,
  enableAuthorityEnforcement,
  findSubjectSpellings,
  fixSubjectSpellings,
  type SpellingReport,
  type JoinSpellingsResult,
  type DataCheckReport,
  type WrongTermGroup,
} from '@/services/resultsDataCheck';

const TERMS: TermName[] = ['Term 1', 'Term 2', 'Term 3'];
const EXAM: Record<string, string> = { week4: 'Week 4', week8: 'Week 8', endOfTerm: 'End of Term' };

interface PendingFix {
  title: string;
  message: string;
  run: () => Promise<string>;
}

export default function ResultsDataCheck() {
  const cur = getCurrentAcademicTerm();
  const [term, setTerm] = useState<TermName>(cur.term);
  const [year, setYear] = useState<number>(cur.year);
  const [report, setReport] = useState<DataCheckReport | null>(null);
  const [allTermsMissing, setAllTermsMissing] = useState<string[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<PendingFix | null>(null);
  const [working, setWorking] = useState(false);
  const [spellings, setSpellings] = useState<SpellingReport | null>(null);
  const [checkingSpellings, setCheckingSpellings] = useState(false);

  const checkSpellings = async () => {
    setCheckingSpellings(true);
    setError('');
    try {
      setSpellings(await findSubjectSpellings());
    } catch (e: any) {
      setError(e?.message || 'The spelling check failed.');
    } finally {
      setCheckingSpellings(false);
    }
  };

  const check = async () => {
    setRunning(true);
    setError('');
    setNotice('');
    try {
      setReport(await runDataCheck(term, year));
    } catch (e: any) {
      setError(e?.message || 'The check failed.');
    } finally {
      setRunning(false);
    }
  };

  const confirmFix = async () => {
    if (!pending) return;
    setWorking(true);
    try {
      const msg = await pending.run();
      resultsService.invalidateGrid();
      setNotice(msg);
      setPending(null);
      await check();
    } catch (e: any) {
      setError(e?.message || 'The fix failed.');
      setPending(null);
    } finally {
      setWorking(false);
    }
  };

  const askMove = (g: WrongTermGroup) =>
    setPending({
      title: 'Move marks to the term they were saved in?',
      message:
        `${g.resultIds.length} ${EXAM[g.examType] ?? g.examType} mark(s) for ${g.subjectId} in ${g.className} are filed as ` +
        `${g.savedAs.term} ${g.savedAs.year} but were saved during ${g.savedDuring.term} ${g.savedDuring.year}. ` +
        `They will be moved to ${g.savedDuring.term} ${g.savedDuring.year}. Check with the teacher first if unsure.`,
      run: async () => `${await moveWrongTermGroup(g)} mark(s) moved.`,
    });

  return (
    <DashboardLayout activeTab="results-sba">
      <div className="p-3 sm:p-6 lg:p-8 space-y-5 max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link to="/dashboard/admin/results-monitor" className="text-xs text-blue-600 inline-flex items-center gap-1 mb-1">
              <ArrowLeft size={12} /> Results &amp; SBA
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Results data check</h1>
            <p className="text-sm text-gray-600">
              Finds records that make screens disagree. Checking only reads; each fix asks first.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select value={term} onChange={e => setTerm(e.target.value as TermName)} className="border border-gray-300 rounded-lg px-2 py-2 text-sm">
              {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value) || cur.year)} className="border border-gray-300 rounded-lg px-2 py-2 text-sm w-24" />
            <button onClick={check} disabled={running} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {running ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Run check
            </button>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3">{error}</div>}
        {notice && <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg p-3">{notice}</div>}

        <SpellingsCard report={spellings} checking={checkingSpellings} onCheck={checkSpellings} />

        {report && (
          <>
            <p className="text-sm text-gray-600">
              {formatTermLabel(report.term, report.year)}: {report.results.totalForTerm} result rows, {report.learners.total} learner records.
            </p>

            <Section
              title="Learners with no status"
              ok={report.learners.missingStatus.length === 0}
              detail="The results screens count them as active, but attendance and analysis screens skip them."
              items={report.learners.missingStatus.map(l => l.name)}
              fixLabel="Set them to active"
              onFix={() => setPending({
                title: 'Set status to active?',
                message: `${report.learners.missingStatus.length} learner(s) with no status will be set to "active". Learners with any other status are not touched.`,
                run: async () => `${await fixMissingLearnerStatus(report.learners.missingStatus.map(l => l.id))} learner(s) updated.`,
              })}
            />

            <Section
              title="Learners with no index number"
              ok={report.learners.missingStudentIndex.length === 0}
              detail="Lists ordered by index number leave these learners out."
              items={report.learners.missingStudentIndex.map(l => l.name)}
              fixLabel="Give them the next index in their class"
              onFix={() => setPending({
                title: 'Assign index numbers?',
                message: `${report.learners.missingStudentIndex.length} learner(s) get the next free index number in their class. Existing numbers are not changed.`,
                run: async () => `${await fixMissingStudentIndex(report.learners.missingStudentIndex)} learner(s) updated.`,
              })}
            />

            <Section
              title="Learners with no learner ID, or a learner ID used twice"
              ok={report.learners.missingStudentId.length === 0 && report.learners.duplicateStudentIds.length === 0}
              detail="Results now use the database id, so marks are safe — but IDs on report cards and in SMS can be wrong. Fix these by hand in Class Management."
              items={[
                ...report.learners.missingStudentId.map(l => `${l.name} (no ID)`),
                ...report.learners.duplicateStudentIds.map(d => `${d.studentId} used by ${d.learnerIds.length} learners`),
              ]}
            />

            <Section
              title="Result rows missing the subject key used by the security rules"
              ok={report.results.missingNormalizedSubject.length === 0}
              detail="Needed before switching on server-side checks; otherwise teachers could not edit these rows."
              items={[`${report.results.missingNormalizedSubject.length} row(s) in this term`]}
              fixLabel="Add the key"
              onFix={() => setPending({
                title: 'Add the subject key?',
                message: `Adds the subject key to ${report.results.missingNormalizedSubject.length} row(s). Marks are not changed.`,
                run: async () => `${await fixMissingNormalizedSubject(report.results.missingNormalizedSubject)} row(s) updated.`,
              })}
            />

            <Section
              title="Marks that may be filed under the wrong term"
              ok={report.results.wrongTerm.length === 0}
              detail="Saved after this term had ended — usually because the entry page used to open on Term 1. Moving is refused if marks already exist in the target term."
            >
              {report.results.wrongTerm.map(g => (
                <div key={g.key} className="flex flex-wrap items-center justify-between gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <span>
                    {g.className} • {g.subjectId} • {EXAM[g.examType] ?? g.examType}: {g.resultIds.length} mark(s) saved during {g.savedDuring.term} {g.savedDuring.year}
                    {g.conflicts > 0 && <span className="text-red-600"> — {g.conflicts} already exist there</span>}
                  </span>
                  <button disabled={g.conflicts > 0} onClick={() => askMove(g)} className="px-3 py-1 rounded-lg bg-blue-600 text-white text-xs disabled:opacity-40">
                    Move to {g.savedDuring.term} {g.savedDuring.year}
                  </button>
                </div>
              ))}
            </Section>

            <Section
              title="Marks for learners no longer in that class"
              ok={report.results.offRoster.length === 0}
              detail="Moved or archived learners. They are already left out of every count; listed for information only."
              items={[`${report.results.offRoster.length} row(s)`]}
            />

            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
              <div className="font-medium text-gray-900 flex items-center gap-2"><ShieldCheck size={16} /> Server-side entry checks</div>
              <p className="text-sm text-gray-600">
                Slot migration: {report.engine.migrated ? 'done' : 'not run'} • Enforcement: <strong>{report.engine.enforceAuthority ? 'ON' : 'OFF'}</strong>
              </p>
              <p className="text-xs text-gray-500">
                When ON, the database itself refuses marks from anyone who is not the teacher responsible for that class and subject
                right now. Switch it on only after the updated firestore.rules are deployed and every teacher is using the updated app.
              </p>
              {!report.engine.enforceAuthority && report.engine.migrated && (
                <div className="flex flex-wrap gap-2">
                  <button
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm"
                    onClick={async () => setAllTermsMissing(await countAllMissingNormalizedSubject())}
                  >
                    Check all terms (reads every result row)
                  </button>
                  {allTermsMissing && allTermsMissing.length > 0 && (
                    <button
                      className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm"
                      onClick={() => setPending({
                        title: 'Add the subject key in all terms?',
                        message: `Adds the key to ${allTermsMissing.length} row(s) across all terms. Marks are not changed.`,
                        run: async () => {
                          const n = await fixMissingNormalizedSubject(allTermsMissing);
                          setAllTermsMissing([]);
                          return `${n} row(s) updated.`;
                        },
                      })}
                    >
                      Add key to {allTermsMissing.length} row(s)
                    </button>
                  )}
                  {allTermsMissing && allTermsMissing.length === 0 && (
                    <button
                      className="px-3 py-1.5 rounded-lg bg-green-700 text-white text-sm"
                      onClick={() => setPending({
                        title: 'Switch on server-side checks?',
                        message: 'Only the responsible teacher (owner, or the live cover/TP) will be able to save marks. Make sure the new rules are deployed and teachers have refreshed the app.',
                        run: async () => { await enableAuthorityEnforcement(); return 'Server-side checks are ON.'; },
                      })}
                    >
                      Switch on
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <ConfirmationModal
        isOpen={!!pending}
        onClose={() => setPending(null)}
        onConfirm={confirmFix}
        title={pending?.title ?? ''}
        message={pending?.message ?? ''}
        type="transfer"
        confirmText="Yes, do it"
        isLoading={working}
      />
    </DashboardLayout>
  );
}

function Section({
  title, ok, detail, items, fixLabel, onFix, children,
}: {
  title: string; ok: boolean; detail: string; items?: string[]; fixLabel?: string; onFix?: () => void; children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-4 ${ok ? 'bg-green-50/40 border-green-200' : 'bg-amber-50/40 border-amber-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-gray-900 flex items-center gap-2">
            {ok ? <CheckCircle size={16} className="text-green-600" /> : <AlertCircle size={16} className="text-amber-600" />}
            {title}
          </div>
          <p className="text-xs text-gray-600 mt-0.5">{detail}</p>
        </div>
        {!ok && fixLabel && onFix && (
          <button onClick={onFix} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs whitespace-nowrap">{fixLabel}</button>
        )}
      </div>
      {!ok && items && items.length > 0 && (
        <ul className="mt-2 ml-5 list-disc text-xs text-gray-700">
          {items.slice(0, 15).map((it, i) => <li key={i}>{it}</li>)}
          {items.length > 15 && <li>…and {items.length - 15} more</li>}
        </ul>
      )}
      {!ok && children && <div className="mt-2 space-y-1.5">{children}</div>}
    </div>
  );
}

/** Same subject saved under different spellings — all terms, separate from the term check. */
export function SpellingsCard({ report, checking, onCheck }: { report: SpellingReport | null; checking: boolean; onCheck: () => Promise<void> | void }) {
  const [confirming, setConfirming] = useState(false);
  const [joining, setJoining] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [outcome, setOutcome] = useState<JoinSpellingsResult | null>(null);
  const [joinError, setJoinError] = useState('');

  const rows = report?.groups.reduce((n, g) => n + g.resultIds.length, 0) ?? 0;
  const ok = !!report && report.groups.length === 0 && report.duplicateSlots.length === 0;

  const join = async () => {
    if (!report) return;
    setConfirming(false);
    setJoining(true);
    setJoinError('');
    setOutcome(null);
    setProgress([0, 0]);
    try {
      const r = await fixSubjectSpellings(report.groups, (done, total) => setProgress([done, total]));
      resultsService.invalidateGrid();
      setOutcome(r);
      await onCheck();
    } catch (e: any) {
      console.error('Join spellings failed', e);
      setJoinError(
        e?.code === 'permission-denied'
          ? 'The database refused the change. Only an administrator can join spellings — sign in again as an administrator and retry.'
          : `Joining failed: ${e?.message || e}. Nothing after the last saved batch was changed; you can run it again.`,
      );
    } finally {
      setJoining(false);
      setProgress(null);
    }
  };

  return (
    <div className={`rounded-xl border p-4 ${!report ? 'bg-white border-gray-200' : ok ? 'bg-green-50/40 border-green-200' : 'bg-amber-50/40 border-amber-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium text-gray-900 flex items-center gap-2">
            {report && (ok ? <CheckCircle size={16} className="text-green-600" /> : <AlertCircle size={16} className="text-amber-600" />)}
            Same subject, different spellings (all terms)
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            e.g. "PRINCIPLES OF ACCOUNTS" and "Priciples of Accounts" showing as two subjects, each with its own marks.
            Screens already join them; fixing saves every mark under the subject&apos;s one spelling.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onCheck()} disabled={checking || joining} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs disabled:opacity-50">
            {checking ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />} {report ? 'Check again' : 'Check spellings'}
          </button>
          {report && report.groups.length > 0 && (
            <button onClick={() => setConfirming(true)} disabled={joining || checking} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs disabled:opacity-50">
              {joining && <Loader2 size={12} className="animate-spin" />} Join spellings ({rows} marks)
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 space-y-2 text-xs text-gray-700" aria-live="polite">
        {joining && (
          <p className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-blue-900">
            <Loader2 size={14} className="animate-spin" />
            {progress && progress[1] > 0 ? `Saving… ${progress[0]} of ${progress[1]} changes` : 'Reading the marks…'}
          </p>
        )}
        {joinError && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-red-800" role="alert">{joinError}</p>}
        {outcome && !joining && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-green-900" role="status">
            {outcome.moved} mark(s) now under the right subject name
            {outcome.droppedOlder > 0 && `; ${outcome.droppedOlder} older duplicate mark(s) removed`}.
            {outcome.skipped.length > 0 && (
              <span className="block text-amber-800">
                {outcome.skipped.length} mark(s) could not be moved: {[...new Set(outcome.skipped.map(x => x.reason))].join('; ')}.
              </span>
            )}
          </div>
        )}
        {report && (
          <>
            <p>{report.totalRows} mark rows checked.{ok && ' Every subject is saved under one spelling.'}</p>
            {report.groups.length > 0 && (
              <ul className="ml-5 list-disc" aria-label="Spellings to join">
                {report.groups.slice(0, 30).map(g => (
                  <li key={`${g.from}|${g.to}`}>
                    &ldquo;{g.from}&rdquo; → <strong>{g.to}</strong>: {g.resultIds.length} mark(s), {g.classIds.length} class(es), {g.terms.join(', ')}
                  </li>
                ))}
                {report.groups.length > 30 && <li>…and {report.groups.length - 30} more</li>}
              </ul>
            )}
            {report.duplicateSlots.length > 0 && (
              <div>
                <p className="font-medium text-gray-900">Classes with two assignments for one subject (fix by hand in Teacher Management — remove the extra one):</p>
                <ul className="ml-5 list-disc" aria-label="Duplicate subject assignments">
                  {report.duplicateSlots.map(g => (
                    <li key={`${g.classId}|${g.subject}`}>
                      {g.className} • {g.subject}: {g.slots.map(s => `"${s.subject}"${s.teacher ? ` (${s.teacher})` : ' (no teacher)'}`).join(' and ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmationModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={join}
        title="Join the spellings of each subject?"
        message={
          `${rows} mark(s) saved under another spelling will be saved under the subject's one spelling` +
          (report?.groups[0] ? ` (e.g. "${report.groups[0].from}" → "${report.groups[0].to}")` : '') +
          '. Mark values are not changed. If a learner has a mark for the same test under two spellings, the newer mark is kept.'
        }
        type="transfer"
        confirmText="Yes, join them"
      />
    </div>
  );
}
