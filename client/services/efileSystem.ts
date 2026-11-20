// @/services/efileSystem.ts — the parts of the Teacher's File that come from
// the school system itself, read live from Firestore in the browser (they are
// not copied to the AI server, so they are always up to date and work even
// when the AI server is off):
//
//   4        Time Table          the teacher's weekly timetable this term (timetable entries)
//   5        Class List/Register one list per class taught, and the subject register built from
//                                the attendance taken in that subject's lessons this term
//   10 (ii)  Progress Chart      each learner's Week 4, Week 8 and End of Term marks
//   10 (vi)  Analysis Sheet      grades 1–9 by sex, pass rate (grade 9 is the only fail), mean
//   10 (vii) Remedial Work Plan  learners who failed (grade 9), and lessons whose evaluation
//                                called for remedial or continuation work (from the eFile)
//
// The tables themselves are made in efileSystemTables.ts.
import { useQueries, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useTeacherClasses } from '@/hooks/useTeacherClasses';
import { getCurrentAcademicTerm } from '@/utils/academicTerm';
import { getTimetableForTeacher } from '@/services/timetableService';
import { attendanceService } from '@/services/attendanceService';
import { resultsService, type StudentResult } from '@/services/resultsService';
import { learnerService } from '@/services/schoolService';
import type { AttendanceSession } from '@/types/attendance';
import type { ResolvedTimetableEntry } from '@/types/timetable';
import type { EFileSummary } from '@/types/ai';
import {
  analysisMd, classListMd, progressChartMd, registerMd, remedialLearnersMd, remedialLessonsMd, timetableMd,
  type LearnerRow, type SystemRecord, type TimetableRow,
} from './efileSystemTables';

export * from './efileSystemTables';

// ───────────── Fetching (live, in the browser) ─────────────

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function timetableRows(entries: ResolvedTimetableEntry[]): TimetableRow[] {
  return entries.filter((e) => e.period).map((e) => ({
    day: e.entry.dayOfWeek, period: e.entry.periodIndex, periodName: e.period!.name, start: e.period!.startTime, end: e.period!.endTime,
    className: e.entry.className, subject: e.entry.subject, venue: e.entry.venue,
  }));
}

/** Everything the system already knows that belongs in the file, for the current term. */
export interface ClassResults { className: string; subject: string; results: StudentResult[] }

export function useSystemRecords(documents: EFileSummary[]): { records: SystemRecord[]; marks: ClassResults[]; loading: boolean; term: string; year: number } {
  const { user } = useAuth();
  const term = getCurrentAcademicTerm();
  const classes = useTeacherClasses();
  const timetable = useQuery({
    queryKey: ['efile-system', 'timetable', user?.uid, term.term, term.year],
    queryFn: () => getTimetableForTeacher(user!.uid, term.term, term.year),
    enabled: !!user?.uid,
    staleTime: 60_000,
  });
  // One (class, subject) pair per subject taught; the form-teacher slot is not a subject.
  const pairs = (classes.data ?? []).flatMap((c) => c.subjects.filter((s) => s.normalizedSubjectId !== 'form-teacher' && !s.isFormTeacher)
    .map((s) => ({ classId: c.classId, className: c.className, subject: s.subject, key: s.normalizedSubjectId })));
  const classIds = [...new Set(pairs.map((p) => p.classId))];
  const learners = useQueries({
    queries: classIds.map((id) => ({ queryKey: ['learners', id], queryFn: () => learnerService.getLearnersByClass(id), staleTime: 120_000 })),
  });
  const from = iso(term.startDate), to = iso(term.endDate);
  const sessions = useQueries({
    queries: classIds.map((id) => ({ queryKey: ['efile-system', 'attendance', id, from, to], queryFn: () => attendanceService.getSessionsForClassRange(id, from, to), staleTime: 60_000 })),
  });
  const results = useQueries({
    queries: pairs.map((p) => ({
      queryKey: ['efile-system', 'results', p.classId, p.key, term.term, term.year],
      queryFn: () => resultsService.getClassSubjectResults(p.classId, p.subject, { term: term.term, year: term.year }),
      staleTime: 60_000,
    })),
  });

  const loading = classes.isLoading || timetable.isLoading || [...learners, ...sessions, ...results].some((q) => q.isLoading);
  const records: SystemRecord[] = [];
  const label = `${term.term}, ${term.year}`;
  records.push({ key: 'timetable', section: 'timetable', title: `My timetable: ${label}`, details: [['Teacher', user?.fullName], ['Term', label]], markdown: timetableMd(timetableRows(timetable.data ?? [])), landscape: true });

  const learnersOf = (classId: string): LearnerRow[] => ((learners[classIds.indexOf(classId)]?.data ?? []) as LearnerRow[]);
  for (const classId of classIds) {
    const className = pairs.find((p) => p.classId === classId)!.className;
    records.push({ key: `list:${classId}`, section: 'classList', title: `Class list: ${className}`, details: [['Class', className], ['Term', label]], markdown: classListMd(learnersOf(classId)) });
  }
  pairs.forEach((p, k) => {
    const all = (sessions[classIds.indexOf(p.classId)]?.data ?? []) as AttendanceSession[];
    const mine = all.filter((s) => s.kind === 'periodic' && (s.normalizedSubject ? s.normalizedSubject === p.key : (s.subject ?? '').toLowerCase() === p.subject.toLowerCase()));
    const details: SystemRecord['details'] = [['Class', p.className], ['Subject', p.subject], ['Term', label]];
    records.push({ key: `register:${p.classId}:${p.key}`, section: 'classList', title: `Register: ${p.className} ${p.subject}`, details, markdown: registerMd(learnersOf(p.classId), mine), landscape: true });
    const res = (results[k]?.data ?? []) as StudentResult[];
    records.push({ key: `progress:${p.classId}:${p.key}`, section: 'progressChart', title: `Progress chart: ${p.className} ${p.subject}`, details, markdown: progressChartMd(learnersOf(p.classId), res), landscape: true });
    records.push({ key: `analysis:${p.classId}:${p.key}`, section: 'analysisSheet', title: `Analysis sheet: ${p.className} ${p.subject}`, details, markdown: analysisMd(learnersOf(p.classId), res), landscape: true });
    const failed = remedialLearnersMd(res);
    if (failed) records.push({ key: `remedial:${p.classId}:${p.key}`, section: 'remedialPlan', title: `Remedial learners: ${p.className} ${p.subject}`, details, markdown: failed, landscape: true });
  });
  const lessons = remedialLessonsMd(documents);
  if (lessons) records.push({ key: 'remedial:lessons', section: 'remedialPlan', title: 'Remedial and continuation lessons', details: [['Teacher', user?.fullName], ['Term', label]], markdown: lessons, landscape: true });
  const marks = pairs.map((p, k) => ({ className: p.className, subject: p.subject, results: (results[k]?.data ?? []) as StudentResult[] }));
  return { records, marks, loading, term: term.term, year: term.year };
}

/** Teacher's Details the system already knows (shown when the teacher has not typed their own). */
export function useProfileDefaults(): Record<string, string> {
  const { user } = useAuth();
  const term = getCurrentAcademicTerm();
  return Object.fromEntries(Object.entries({
    fullName: user?.fullName ?? '', tsNumber: (user as { tsNumber?: string } | null)?.tsNumber ?? '',
    term: term.term.replace(/^Term\s*/i, ''), year: String(term.year),
  }).filter(([, v]) => v));
}
