// @/pages/teacher/MyTimetable.tsx
//
// ============================================================================
//  MY TIMETABLE — the school's timetable, as published
// ============================================================================
//
//  The timetable is generated from the HoDs' allocations and published by the
//  administration. Teachers no longer submit their own: this page shows
//  their week (days as rows, periods as columns), the timetable of each
//  class they teach, and branded PDFs to download.
//
//  • A cover teacher sees the lessons they cover, automatically.
//  • A newly published timetable shows here at once.
// ============================================================================

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CalendarRange, Download, Loader2, Megaphone, RefreshCw } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useTeacherClasses } from '@/hooks/useTeacherClasses';
import { useClassTimetable, useMyTimetable, usePeriods, invalidateTimetableCaches } from '@/hooks/useTimetable';
import { formatTermLabel, getCurrentAcademicTerm, getNextAcademicTerm, type TermName } from '@/utils/academicTerm';
import { groupIntoBlocks } from '@/services/timetableModel';
import { NowNextCard } from '@/components/timetable/NowNextCard';
import { DayRowsGrid, type GridLesson } from '@/components/timetable/DayRowsGrid';
import { cellsFromRows } from '@/services/timetableGenerator/documents';
import { downloadPdf, generateTimetablePDF, pdfFileName } from '@/services/pdf/timetablePDF';
import type { Period, ResolvedTimetableEntry } from '@/types/timetable';

const fmtYMD = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const teacherOf = (r: ResolvedTimetableEntry) => r.operatorTeacherName ?? r.ownerTeacherName ?? 'No teacher yet';

function gridFrom(rows: ResolvedTimetableEntry[], periods: Period[], view: (r: ResolvedTimetableEntry) => { title: string; lines: Array<string | null | undefined>; muted?: boolean }): GridLesson[] {
  const blocks = groupIntoBlocks(rows.map(r => ({ ...r.entry, _r: r })), periods);
  return blocks.map(b => {
    const r = (b.rows[0] as any)._r as ResolvedTimetableEntry;
    const v = view(r);
    return { key: b.key, day: b.dayOfWeek, start: b.periodIndexes[0], size: b.size, title: v.title, lines: v.lines, tone: v.muted ? 'muted' : 'normal' };
  });
}

export default function MyTimetable() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const cur = getCurrentAcademicTerm();
  const terms = [cur, getNextAcademicTerm(cur)];
  const [termKey, setTermKey] = useState(`${cur.term}|${cur.year}`);
  const [termStr, yearStr] = termKey.split('|');
  const term = termStr as TermName;
  const year = Number(yearStr);

  const periodsQ = usePeriods(year);
  const mineQ = useMyTimetable({ term, year });
  const teacherClassesQ = useTeacherClasses();
  const periods = periodsQ.data ?? [];
  const rows = mineQ.data ?? [];

  // Classes to look at: the ones I teach (incl. cover) and my form class.
  const classes = useMemo(() => {
    const m = new Map<string, { id: string; name: string; form: boolean }>();
    for (const c of teacherClassesQ.data ?? []) {
      const form = c.subjects.some(s => s.normalizedSubjectId === 'form-teacher' && (s.relation === 'owner' || s.canOperate));
      m.set(c.classId, { id: c.classId, name: c.className, form });
    }
    for (const r of rows) if (!m.has(r.entry.classId)) m.set(r.entry.classId, { id: r.entry.classId, name: r.entry.className, form: false });
    return [...m.values()].sort((a, b) => Number(b.form) - Number(a.form) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [teacherClassesQ.data, rows]);
  const [classId, setClassId] = useState('');
  const selectedClass = classes.find(c => c.id === classId) ?? classes[0];
  const classQ = useClassTimetable(selectedClass?.id, { term, year });

  const periodsCount = rows.length;
  const published = rows.map(r => r.entry.effectiveFrom).filter(Boolean).sort().pop() ?? null;
  const recent = published && (Date.now() - new Date(`${published}T12:00:00`).getTime()) / 86_400_000 <= 14;

  const myGrid = useMemo(
    () => gridFrom(rows, periods, r => ({
      title: `${r.entry.className} · ${r.entry.subject}`,
      lines: [r.entry.venue, r.isCoveredNow && r.operatorTeacherId === user?.uid ? 'Covering' : r.isCoveredNow ? `Covered by ${r.operatorTeacherName}` : null],
      muted: r.isCoveredNow && r.operatorTeacherId !== user?.uid,
    })),
    [rows, periods, user?.uid],
  );
  const classGrid = useMemo(
    () => gridFrom(classQ.data ?? [], periods, r => ({ title: r.entry.subject, lines: [teacherOf(r), r.entry.venue] })),
    [classQ.data, periods],
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const note = published ? `In force from ${fmtYMD(published)}` : undefined;
  const download = async (kind: 'mine' | 'class') => {
    setBusy(kind);
    setErr(null);
    try {
      const bytes = kind === 'mine'
        ? await generateTimetablePDF({
          title: 'Teacher timetable', term, year, note,
          pages: [{ heading: user?.fullName ?? 'Teacher', subheading: `${periodsCount} periods a week`, cells: cellsFromRows(rows, periods, r => [r.entry.className, r.entry.subject, r.entry.venue ?? '']) }],
        })
        : await generateTimetablePDF({
          title: 'Class timetable', term, year, note,
          pages: [{ heading: selectedClass?.name ?? 'Class', subheading: `${classQ.data?.length ?? 0} periods a week`, cells: cellsFromRows(classQ.data ?? [], periods, r => [r.entry.subject, teacherOf(r), r.entry.venue ?? '']) }],
        });
      downloadPdf(bytes, pdfFileName(kind === 'mine' ? user?.fullName ?? 'my-timetable' : selectedClass?.name ?? 'class', term, year));
    } catch (e) {
      setErr((e as Error)?.message || 'Could not make the PDF.');
    } finally {
      setBusy(null);
    }
  };

  const loading = periodsQ.isLoading || mineQ.isLoading;
  const loadError = periodsQ.error || mineQ.error;

  return (
    <DashboardLayout activeTab="my-timetable">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">My Timetable</h1>
            <p className="text-sm text-gray-600">The school timetable for your classes, as published by the administration.</p>
          </div>
          <div className="flex items-center gap-2">
            <select aria-label="Term" value={termKey} onChange={e => setTermKey(e.target.value)} className="min-h-[40px] rounded-lg border border-gray-300 bg-white px-2 text-sm">
              {terms.map(t => <option key={`${t.term}|${t.year}`} value={`${t.term}|${t.year}`}>{formatTermLabel(t.term, t.year)}</option>)}
            </select>
            <button onClick={() => { teacherClassesQ.refetch(); invalidateTimetableCaches(qc); }} className="min-h-[40px] rounded-lg border border-gray-300 bg-white px-2.5 text-gray-600" aria-label="Refresh">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {recent && published && (
          <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <Megaphone size={16} className="mt-0.5 flex-shrink-0" />
            <span>A new school timetable is in force from <b>{fmtYMD(published)}</b>. Please follow it from that day.</span>
          </div>
        )}

        {term === cur.term && year === cur.year && <NowNextCard />}

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Could not load your timetable: {(loadError as Error).message}</div>
        )}
        {err && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</div>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500"><Loader2 className="animate-spin" size={18} /> Loading…</div>
        ) : (
          <>
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900"><CalendarRange size={16} /> My week{periodsCount ? ` · ${periodsCount} periods` : ''}</h2>
                <button type="button" onClick={() => download('mine')} disabled={!periodsCount || busy === 'mine'} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white disabled:opacity-40">
                  {busy === 'mine' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download my timetable (PDF)
                </button>
              </div>
              {periodsCount === 0 ? (
                <Notice text={`No timetable has been published for ${formatTermLabel(term, year)} yet. It will appear here as soon as the school publishes it.`} />
              ) : (
                <DayRowsGrid lessons={myGrid} ariaLabel="My week" />
              )}
            </section>

            {classes.length > 0 && (
              <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-gray-900">
                    Class timetable
                    <select aria-label="Class" value={selectedClass?.id ?? ''} onChange={e => setClassId(e.target.value)} className="min-h-[36px] rounded-lg border border-gray-300 bg-white px-2 text-sm font-normal">
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.form ? ' (my form class)' : ''}</option>)}
                    </select>
                  </h2>
                  <button type="button" onClick={() => download('class')} disabled={!classQ.data?.length || busy === 'class'} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 disabled:opacity-40">
                    {busy === 'class' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Class timetable (PDF)
                  </button>
                </div>
                {classQ.isLoading ? (
                  <p className="text-sm text-gray-500">Loading…</p>
                ) : classGrid.length ? (
                  <DayRowsGrid lessons={classGrid} ariaLabel={`Timetable of ${selectedClass?.name}`} />
                ) : (
                  <Notice text={`No timetable for ${selectedClass?.name} yet.`} />
                )}
              </section>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <AlertCircle size={16} className="mt-0.5" /> {text}
    </div>
  );
}
