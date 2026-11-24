// @/services/efileSystem.ts — the parts of the Teacher's File that come from
// the school system itself, read live in the browser (they are not copied to
// the AI server, so they are always up to date):
//
//   1, 2     Vision, Mission     the admin's statements (Settings → Vision & mission; Firestore system/school_statements)
//   4        Time Table          the teacher's weekly timetable this term (timetable entries)
//   5        Class List/Register one list per class taught, and the subject register built from
//                                the attendance taken in that subject's lessons this term
//   6        Syllabus            each class's official syllabus (the superAdmin's curriculum, AI server)
//   10       Records of Work     the lessons taught: every lesson plan evaluated after the lesson
//   11 (i)   Homework            the homework set in each lesson plan
//   11 (ii)  Progress Chart      each learner's Week 4, Week 8 and End of Term marks
//   11 (vi)  Analysis Sheet      grades 1–9 by sex, pass rate (grade 9 is the only fail), mean
//   11 (vii) Remedial Work Plan  learners who failed (grade 9) and lessons whose evaluation called
//                                for follow-up (the AI's remedial work for them is an entry there)
//
// Sections 6, 10 and 11 follow the year and term the teacher picks at the top
// of the eFile (FilePeriod), so earlier terms' records can be looked up; the
// timetable, class lists and registers are always the current term's.
// The tables themselves are made in efileSystemTables.ts.
import { useQueries, useQuery } from '@tanstack/react-query';
import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useTeacherClasses } from '@/hooks/useTeacherClasses';
import { useMyDepartments } from '@/hooks/useDepartments';
import { useSchoolStatements } from '@/components/efile/SchoolStatementsCard';
import { SCHOOL_NAME } from '@/components/ai/brand';
import { getCurrentAcademicTerm, getTermByName, type TermName } from '@/utils/academicTerm';
import { getTimetableForTeacher } from '@/services/timetableService';
import { attendanceService } from '@/services/attendanceService';
import { normalizeSubjectName, resultsService, type StudentResult } from '@/services/resultsService';
import { learnerService } from '@/services/schoolService';
import { teacherAi } from '@/services/aiApi';
import type { AttendanceSession } from '@/types/attendance';
import type { ResolvedTimetableEntry } from '@/types/timetable';
import { levelOfClass, type EFileSummary } from '@/types/ai';
import {
  analysisMd, classListMd, homeworkMd, lessonDay, progressChartMd, recordsOfWorkMd, registerMd,
  remedialLearnersMd, remedialLessonsMd, statementsMd, syllabusMd, timetableMd,
  type LearnerRow, type SystemRecord, type TimetableRow,
} from './efileSystemTables';

export * from './efileSystemTables';

// ───────────── The year and term the file shows ─────────────

export interface FilePeriod { term: TermName; year: number }
export const periodLabel = (p: FilePeriod) => `${p.term} ${p.year}`;
export const periodKey = (p: FilePeriod) => `${p.year}-${p.term}`;
export const currentPeriod = (): FilePeriod => {
  const t = getCurrentAcademicTerm();
  return { term: t.term, year: t.year };
};
const TERMS: TermName[] = ['Term 1', 'Term 2', 'Term 3'];
const asTerm = (t: string): TermName | null => (TERMS as string[]).includes(t) ? (t as TermName) : null;

/** Newest first: the current term, then every term the teacher has results in. */
export function sortPeriods(periods: FilePeriod[]): FilePeriod[] {
  const seen = new Map(periods.map((p) => [periodKey(p), p]));
  return [...seen.values()].sort((a, b) => b.year - a.year || TERMS.indexOf(b.term) - TERMS.indexOf(a.term));
}

/** Does this eFile document belong to the term? Its Term box first, else its date. */
export function inPeriod(d: EFileSummary, p: FilePeriod): boolean {
  const label = d.inputs.term?.trim();
  if (label && /term\s*\d/i.test(label)) return label.toLowerCase() === periodLabel(p).toLowerCase();
  const info = getTermByName(p.term, p.year);
  const day = lessonDay(d);
  return !!info && day >= info.startDate && day <= info.endDate;
}

// ───────────── Fetching (live, in the browser) ─────────────

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function timetableRows(entries: ResolvedTimetableEntry[]): TimetableRow[] {
  return entries.filter((e) => e.period).map((e) => ({
    day: e.entry.dayOfWeek, period: e.entry.periodIndex, periodName: e.period!.name, start: e.period!.startTime, end: e.period!.endTime,
    className: e.entry.className, subject: e.entry.subject, venue: e.entry.venue,
  }));
}

/** Learners by id (30 per query, Firestore's limit for "in"): names and sex of learners now in other classes. */
async function learnersByIds(ids: string[]): Promise<LearnerRow[]> {
  const out: LearnerRow[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await getDocs(query(collection(db, 'learners'), where(documentId(), 'in', ids.slice(i, i + 30))));
    snap.forEach((doc) => {
      const d = doc.data();
      out.push({ id: doc.id, fullName: d.fullName || d.name || '', gender: d.gender, studentId: d.studentId });
    });
  }
  return out;
}

/** Everything the system already knows that belongs in the file. */
export interface ClassResults { className: string; subject: string; results: StudentResult[] }

const subjectKey = (s: string) => normalizeSubjectName(s);
const sameSubject = (a: string, b: string) => subjectKey(a) === subjectKey(b);

export function useSystemRecords(documents: EFileSummary[], period: FilePeriod = currentPeriod()): {
  records: SystemRecord[]; marks: ClassResults[]; loading: boolean; term: string; year: number; periods: FilePeriod[];
} {
  const { user } = useAuth();
  const now = getCurrentAcademicTerm();
  const isCurrent = period.term === now.term && period.year === now.year;
  const label = periodLabel(period);
  const classes = useTeacherClasses();
  const timetable = useQuery({
    queryKey: ['efile-system', 'timetable', user?.uid, now.term, now.year],
    queryFn: () => getTimetableForTeacher(user!.uid, now.term, now.year),
    enabled: !!user?.uid,
    staleTime: 60_000,
  });
  // One (class, subject) pair per subject taught now; the form-teacher slot is not a subject.
  const pairs = (classes.data ?? []).flatMap((c) => c.subjects.filter((s) => s.normalizedSubjectId !== 'form-teacher' && !s.isFormTeacher)
    .map((s) => ({ classId: c.classId, className: c.className, subject: s.subject, key: s.normalizedSubjectId })));
  const classIds = [...new Set(pairs.map((p) => p.classId))];
  const learners = useQueries({
    queries: classIds.map((id) => ({ queryKey: ['learners', id], queryFn: () => learnerService.getLearnersByClass(id), staleTime: 120_000 })),
  });
  const from = iso(now.startDate), to = iso(now.endDate);
  const sessions = useQueries({
    queries: classIds.map((id) => ({ queryKey: ['efile-system', 'attendance', id, from, to], queryFn: () => attendanceService.getSessionsForClassRange(id, from, to), staleTime: 60_000 })),
  });
  // Marks: the classes taught now, for the chosen term…
  const classResults = useQueries({
    queries: pairs.map((p) => ({
      queryKey: ['efile-system', 'results', p.classId, p.key, period.term, period.year],
      queryFn: () => resultsService.getClassSubjectResults(p.classId, p.subject, { term: period.term, year: period.year }),
      staleTime: 60_000,
    })),
  });
  // …and every mark this teacher has entered (one query on teacherId, no extra index):
  // earlier years' classes, and the list of terms to choose from.
  const mine = useQuery({
    queryKey: ['efile-system', 'teacher-results', user?.uid],
    queryFn: () => resultsService.getTeacherResults(user!.uid),
    enabled: !!user?.uid,
    staleTime: 5 * 60_000,
  });

  // Group the chosen term's marks by class and subject.
  const groups = new Map<string, { classId: string; className: string; subject: string; results: Map<string, StudentResult> }>();
  const groupOf = (classId: string, className: string, subject: string) => {
    const k = `${classId}::${subjectKey(subject)}`;
    let g = groups.get(k);
    if (!g) { g = { classId, className, subject, results: new Map() }; groups.set(k, g); }
    return g;
  };
  pairs.forEach((p, k) => {
    const g = groupOf(p.classId, p.className, p.subject);
    for (const r of (classResults[k]?.data ?? []) as StudentResult[]) g.results.set(r.id, r);
  });
  for (const r of mine.data ?? [])
    if (r.term === period.term && r.year === period.year) groupOf(r.classId, r.className || r.classId, r.subjectName || r.subjectId).results.set(r.id, r);
  const grouped = [...groups.values()].map((g) => ({ ...g, results: [...g.results.values()] })).filter((g) => g.results.length || (isCurrent && pairs.some((p) => p.classId === g.classId && sameSubject(p.subject, g.subject))));

  // Learners in these results who are not on a current class list (promoted, moved).
  const known = new Set(learners.flatMap((q) => ((q.data ?? []) as LearnerRow[]).map((l) => l.id)));
  const missing = [...new Set(grouped.flatMap((g) => g.results.map((r) => r.studentId)).filter((id) => !known.has(id)))].sort();
  const others = useQuery({
    queryKey: ['efile-system', 'learners-by-id', missing.join(',')],
    queryFn: () => learnersByIds(missing),
    enabled: missing.length > 0,
    staleTime: 10 * 60_000,
  });

  // 1, 2: the admin's statements and the teacher's departments.
  const statements = useSchoolStatements();
  const myDepartments = useMyDepartments();

  // 6: the official syllabus of each class level and subject taught now.
  const levels = [...new Map(pairs.map((p) => [`${subjectKey(p.subject)}|${levelOfClass(p.className) ?? ''}`, { subject: p.subject, level: levelOfClass(p.className) }])).values()]
    .filter((x): x is { subject: string; level: NonNullable<ReturnType<typeof levelOfClass>> } => !!x.level);
  const syllabi = useQueries({
    queries: levels.map((x) => ({
      queryKey: ['efile-system', 'syllabus', x.subject, x.level],
      queryFn: () => teacherAi.curriculumMap(x.subject, x.level),
      staleTime: 30 * 60_000,
      retry: false,
    })),
  });

  const loading = classes.isLoading || timetable.isLoading || mine.isLoading || others.isLoading
    || [...learners, ...sessions, ...classResults].some((q) => q.isLoading);
  const records: SystemRecord[] = [];
  const nowLabel = `${now.term}, ${now.year}`;

  // 1 Vision, 2 Mission Statement
  if (statements.data) {
    const depts = myDepartments.data ?? [];
    for (const kind of ['vision', 'mission'] as const) {
      const md = statementsMd(kind, statements.data, depts, SCHOOL_NAME);
      if (md) records.push({ key: `statement:${kind}`, section: kind, title: kind === 'vision' ? 'Vision' : 'Mission statement', details: [['School', SCHOOL_NAME], ['Department', depts.join(', ') || undefined]], markdown: md });
    }
  }

  // 4 Time Table
  records.push({ key: 'timetable', section: 'timetable', title: `My timetable: ${nowLabel}`, details: [['Teacher', user?.fullName], ['Term', nowLabel]], markdown: timetableMd(timetableRows(timetable.data ?? [])), landscape: true });

  // 5 Class List / Register (current term)
  const roster = (classId: string): LearnerRow[] => ((learners[classIds.indexOf(classId)]?.data ?? []) as LearnerRow[]);
  for (const classId of classIds) {
    const className = pairs.find((p) => p.classId === classId)!.className;
    records.push({ key: `list:${classId}`, section: 'classList', title: `Class list: ${className}`, details: [['Class', className], ['Term', nowLabel]], markdown: classListMd(roster(classId)) });
  }
  pairs.forEach((p) => {
    const all = (sessions[classIds.indexOf(p.classId)]?.data ?? []) as AttendanceSession[];
    const taken = all.filter((s) => s.kind === 'periodic' && (s.normalizedSubject ? s.normalizedSubject === p.key : (s.subject ?? '').toLowerCase() === p.subject.toLowerCase()));
    records.push({ key: `register:${p.classId}:${p.key}`, section: 'classList', title: `Register: ${p.className} ${p.subject}`, details: [['Class', p.className], ['Subject', p.subject], ['Term', nowLabel]], markdown: registerMd(roster(p.classId), taken), landscape: true });
  });

  // 6 Syllabus
  const termNo = Number(period.term.replace(/\D/g, '')) || null;
  levels.forEach((x, k) => {
    const map = syllabi[k]?.data;
    if (map) records.push({ key: `syllabus:${x.subject}:${x.level}`, section: 'syllabus', title: `Syllabus: ${x.subject}, ${x.level}`, details: [['Subject', x.subject], ['Class level', x.level], ['Term', label]], markdown: syllabusMd(map, termNo), landscape: true });
  });

  // 10 Records of Work and 11 (i) Homework: the chosen term's lesson plans, per class and subject.
  // (Remedial work is written by the AI only after an evaluation shows the lesson did not go well: an entry in 11 (vii).)
  const plans = documents.filter((d) => d.feature === 'lessonPlan' && inPeriod(d, period));
  const planGroups = new Map<string, EFileSummary[]>();
  for (const d of plans) {
    const k = `${d.inputs.className || d.inputs.level || ''}|${d.inputs.subject || ''}`;
    planGroups.set(k, [...(planGroups.get(k) ?? []), d]);
  }
  for (const [k, list] of [...planGroups].sort(([a], [b]) => a.localeCompare(b))) {
    const [className, subject] = k.split('|');
    const details: SystemRecord['details'] = [['Class', className], ['Subject', subject], ['Teacher', user?.fullName], ['Term', label]];
    records.push({ key: `row:${k}`, section: 'recordsOfWork', title: `Record of work: ${className} ${subject}`, details, markdown: recordsOfWorkMd(list), landscape: true });
    records.push({ key: `homework:${k}`, section: 'homework', title: `Homework: ${className} ${subject}`, details, markdown: homeworkMd(list), landscape: true });
  }

  // 11 (ii), (vi), (vii): marks of the chosen term
  const people = new Map<string, LearnerRow>();
  for (const q of learners) for (const l of (q.data ?? []) as LearnerRow[]) people.set(l.id, l);
  for (const l of others.data ?? []) people.set(l.id, l);
  const sorted = [...grouped].sort((a, b) => a.className.localeCompare(b.className) || a.subject.localeCompare(b.subject));
  for (const g of sorted) {
    const k = `${g.classId}:${subjectKey(g.subject)}`;
    const ids = new Set([...roster(g.classId).map((l) => l.id), ...g.results.map((r) => r.studentId)]);
    // A past term lists the learners who wrote it; the current term, the class as it is now.
    const list = isCurrent ? [...roster(g.classId), ...g.results.filter((r) => !roster(g.classId).some((l) => l.id === r.studentId)).map((r) => people.get(r.studentId)).filter((l): l is LearnerRow => !!l)]
      : [...ids].map((id) => people.get(id)).filter((l): l is LearnerRow => !!l && g.results.some((r) => r.studentId === l.id));
    const details: SystemRecord['details'] = [['Class', g.className], ['Subject', g.subject], ['Term', label]];
    records.push({ key: `progress:${k}`, section: 'progressChart', title: `Progress chart: ${g.className} ${g.subject}`, details, markdown: progressChartMd(list, g.results), landscape: true });
    records.push({ key: `analysis:${k}`, section: 'analysisSheet', title: `Analysis sheet: ${g.className} ${g.subject}`, details, markdown: analysisMd(list, g.results), landscape: true });
    const failed = remedialLearnersMd(g.results);
    if (failed) records.push({ key: `remedial:${k}`, section: 'remedialPlan', title: `Remedial learners: ${g.className} ${g.subject}`, details, markdown: failed, landscape: true });
  }
  const lessons = remedialLessonsMd(plans);
  if (lessons) records.push({ key: 'remedial:lessons', section: 'remedialPlan', title: 'Remedial and continuation lessons', details: [['Teacher', user?.fullName], ['Term', label]], markdown: lessons, landscape: true });

  const marks = sorted.map((g) => ({ className: g.className, subject: g.subject, results: g.results }));
  const periods = sortPeriods([
    currentPeriod(),
    ...(mine.data ?? []).flatMap((r) => { const t = asTerm(r.term); return t && r.year ? [{ term: t, year: r.year }] : []; }),
    ...documents.flatMap((d) => {
      const m = /^(Term [123])\s+(\d{4})$/.exec(d.inputs.term?.trim() ?? '');
      return m ? [{ term: m[1] as TermName, year: Number(m[2]) }] : [];
    }),
  ]);
  return { records, marks, loading, term: period.term, year: period.year, periods };
}


// ───────────── Teaching load (for the work plan and the syllabus grid) ─────────────

export interface TeachingLoad {
  classId: string;
  className: string;
  subject: string;
  /** Curriculum level ("Form 2", "Grade 11") or "" if the class name does not say. */
  level: string;
  /** From this term's timetable: periods a week, and lessons a week (consecutive periods = one lesson). */
  periodsPerWeek: number;
  lessonsPerWeek: number;
}

/** Teaching weeks in a term, from the school calendar (13 if the calendar has no dates). */
export function weeksInTerm(p: FilePeriod): number {
  const info = getTermByName(p.term, p.year);
  if (!info) return 13;
  return Math.max(1, Math.min(16, Math.round((info.endDate.getTime() - info.startDate.getTime()) / (7 * 86_400_000))));
}

/** Each class and subject the teacher teaches now, with its lessons a week from the timetable. */
export function useTeachingLoad(): { load: TeachingLoad[]; loading: boolean } {
  const { user } = useAuth();
  const now = getCurrentAcademicTerm();
  const classes = useTeacherClasses();
  const timetable = useQuery({
    queryKey: ['efile-system', 'timetable', user?.uid, now.term, now.year],
    queryFn: () => getTimetableForTeacher(user!.uid, now.term, now.year),
    enabled: !!user?.uid,
    staleTime: 60_000,
  });
  const rows = timetableRows(timetable.data ?? []);
  const load = (classes.data ?? []).flatMap((c) => c.subjects.filter((s) => s.normalizedSubjectId !== 'form-teacher' && !s.isFormTeacher).map((s): TeachingLoad => {
    const mine = rows.filter((r) => r.className === c.className && sameSubject(r.subject, s.subject));
    let lessons = 0;
    for (const day of [1, 2, 3, 4, 5]) {
      const periods = [...new Set(mine.filter((r) => r.day === day).map((r) => r.period))].sort((a, b) => a - b);
      periods.forEach((p, k) => { if (k === 0 || p !== periods[k - 1] + 1) lessons++; });
    }
    return { classId: c.classId, className: c.className, subject: s.subject, level: levelOfClass(c.className) ?? '', periodsPerWeek: mine.length, lessonsPerWeek: lessons };
  }));
  return { load, loading: classes.isLoading || timetable.isLoading };
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
