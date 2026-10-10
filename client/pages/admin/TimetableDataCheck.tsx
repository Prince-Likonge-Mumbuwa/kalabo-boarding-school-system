// @/pages/admin/TimetableDataCheck.tsx
//
// Admin timetable data check. "Run check" only reads; each fix asks first.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { AlertCircle, ArrowLeft, CheckCircle, Loader2, Search } from 'lucide-react';
import { getCurrentAcademicTerm, formatTermLabel, type TermName } from '@/utils/academicTerm';
import {
  runTimetableDataCheck,
  fixLegacyDoubles,
  archiveBadRows,
  applySchoolBell,
  describeRow,
  type TimetableDataCheck as Report,
} from '@/services/timetableDataCheck';
import { invalidateTimetableCaches } from '@/hooks/useTimetable';

const TERMS: TermName[] = ['Term 1', 'Term 2', 'Term 3'];

interface PendingFix {
  title: string;
  message: string;
  run: () => Promise<string>;
}

export default function TimetableDataCheck() {
  const cur = getCurrentAcademicTerm();
  const qc = useQueryClient();
  const [term, setTerm] = useState<TermName>(cur.term);
  const [year, setYear] = useState<number>(cur.year);
  const [report, setReport] = useState<Report | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<PendingFix | null>(null);
  const [working, setWorking] = useState(false);

  const check = async () => {
    setRunning(true);
    setError('');
    try {
      setReport(await runTimetableDataCheck(term, year));
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
      setNotice(await pending.run());
      invalidateTimetableCaches(qc);
      setPending(null);
      await check();
    } catch (e: any) {
      setError(e?.message || 'The fix failed.');
      setPending(null);
    } finally {
      setWorking(false);
    }
  };

  const list = (rows: Report['duplicates']) => rows.map(r => describeRow(r, report?.periods ?? []));
  const bad = report ? report.duplicates.length + report.notLessons.length + report.orphans.length : 0;

  return (
    <DashboardLayout activeTab="attendance">
      <div className="p-3 sm:p-6 lg:p-8 space-y-5 max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link to="/dashboard/admin/attendance-overview" className="text-xs text-blue-600 inline-flex items-center gap-1 mb-1">
              <ArrowLeft size={12} /> Attendance &amp; Timetable
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Timetable data check</h1>
            <p className="text-sm text-gray-600">
              Finds timetable records saved by older versions of the app. Checking only reads; each fix asks first.
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

        {report && (
          <>
            <p className="text-sm text-gray-600">
              {formatTermLabel(report.term, report.year)}: {report.checkedRows} timetable record(s) checked.
            </p>

            <Section
              title="Bell schedule: P1–P4 07:20–10:00, Break 10:00–10:20, P5–P8 10:20–13:00"
              ok={report.bell.upToDate}
              detail={report.needsRenumber
                ? 'Lesson numbers will change, so every timetable row and lesson register of this year is moved to the new numbers. Run this first — the other checks wait for it.'
                : 'Only times or names differ; timetables and registers are not affected.'}
              items={report.bell.summary}
              fixLabel="Apply the school bell schedule"
              onFix={() => setPending({
                title: 'Apply the school bell schedule?',
                message: `The ${report.year} bell schedule becomes P1–P4 07:20–10:00, Break 10:00–10:20, P5–P8 10:20–13:00. ` +
                  'Timetable rows and lesson registers move with their lessons. Nothing is deleted.',
                run: async () => {
                  const r = await applySchoolBell(report.year, report.bell);
                  return `Bell schedule updated (${r.periods} change(s)); moved ${r.rows} timetable row(s) and ${r.registers} register(s)` +
                    (r.retired ? `; retired ${r.retired} row(s) of a lesson beyond P8` : '') +
                    (r.conflicts ? `; ${r.conflicts} register(s) could not be moved because one already exists at the new number` : '') + '.';
                },
              })}
            />

            <Section
              title="Old “double” records"
              ok={report.legacyDoubles.length === 0}
              detail="Saved as one record meaning two periods. They are already read correctly; this makes it permanent (one record per period)."
              items={list(report.legacyDoubles)}
              fixLabel="Split into one record per period"
              onFix={() => setPending({
                title: 'Split old doubles?',
                message: `${report.legacyDoubles.length} record(s) become one record per period. The timetable does not change.`,
                run: async () => `${await fixLegacyDoubles(report)} record(s) split.`,
              })}
            />

            <Section
              title="Duplicates, records on breaks, records of deleted subjects"
              ok={bad === 0}
              detail="Left behind by the old approval step, a changed bell schedule, or a deleted class subject. They make the same lesson appear twice or block periods."
              items={[
                ...list(report.duplicates).map(s => `${s} (duplicate)`),
                ...list(report.notLessons).map(s => `${s} (not a lesson period)`),
                ...list(report.orphans).map(s => `${s} (subject no longer exists)`),
              ]}
              fixLabel="Retire them"
              onFix={() => setPending({
                title: 'Retire these records?',
                message: `${bad} record(s) will be archived (kept for history, no longer shown).`,
                run: async () => `${await archiveBadRows(report)} record(s) archived.`,
              })}
            />

            <Section
              title="Clashes in the live timetable"
              ok={report.clashes.length === 0}
              detail="Two subjects in one class at once, or a teacher in two places. Ask the teacher to correct their timetable (My Timetable), then approve it."
              items={report.clashes.map(c => c.message)}
            />
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
  title, ok, detail, items, fixLabel, onFix,
}: {
  title: string; ok: boolean; detail: string; items: string[]; fixLabel?: string; onFix?: () => void;
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
      {!ok && items.length > 0 && (
        <ul className="mt-2 ml-5 list-disc text-xs text-gray-700">
          {items.slice(0, 25).map((it, i) => <li key={i}>{it}</li>)}
          {items.length > 25 && <li>…and {items.length - 25} more</li>}
        </ul>
      )}
    </div>
  );
}
