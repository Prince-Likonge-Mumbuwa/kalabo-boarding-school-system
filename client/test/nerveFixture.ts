// A small, realistic school for the admin nerve-centre tests (and for
// looking at the dashboard with sample data). Thursday 12 Nov 2026, 10:20.
import type { BoardClass } from '@/services/timetableService';

export const NOW = new Date(2026, 10, 12, 10, 20);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const TODAY = ymd(NOW);

export const term = { term: 'Term 3', year: 2026, startDate: new Date(2026, 8, 1), endDate: new Date(2026, 11, 4), label: 'Term 3 2026', shortLabel: 'T3 2026' };
export const prev = { term: 'Term 2', year: 2026, startDate: new Date(2026, 4, 1), endDate: new Date(2026, 7, 31), label: 'Term 2 2026', shortLabel: 'T2 2026' };

export const classes = [
  { id: '1A', name: 'Form 1A', type: 'form', level: 1, formTeacherId: 'T1', isActive: true },
  { id: '1B', name: 'Form 1B', type: 'form', level: 1, formTeacherId: 'T2', isActive: true },
  { id: '2A', name: 'Form 2A', type: 'form', level: 2, formTeacherId: 'T3', isActive: true },
  { id: '10A', name: 'Grade 10A', type: 'grade', level: 10, formTeacherId: 'T4', isActive: true },
  { id: '12A', name: 'Grade 12A', type: 'grade', level: 12, formTeacherId: null, isActive: true },
];

const NAMES = ['Alice Banda', 'Ben Chola', 'Chipo Daka', 'Dalitso Mwale', 'Esther Phiri', 'Felix Tembo', 'Grace Zulu', 'Hope Mulenga', 'Isaac Lungu', 'Joyce Sakala', 'Kunda Mwape', 'Lubasi Sitali'];
export const learners = classes.flatMap((c, ci) =>
  Array.from({ length: 12 }, (_, i) => ({
    id: `${c.id}-${i}`,
    fullName: `${NAMES[i]}`,
    studentId: `${c.id}_${String(i + 1).padStart(3, '0')}`,
    classId: c.id,
    className: c.name,
    classLevel: c.level,
    gender: i % 2 ? 'male' : 'female',
    status: 'active',
    dateOfBirth: i === 3 && ci === 0 ? '' : '2011-03-04',
    guardianPhone: i === 5 && ci < 2 ? '' : '0977000000',
    sponsor: i % 5 === 0 ? 'CAMFED' : i % 7 === 0 ? 'KGS' : i === 4 && ci === 2 ? 'Mr Banda' : 'Self-sponsored',
    dateOfFirstEntry: i === 11 ? '2026-09-14' : '2025-01-12',
    createdAt: null,
  })),
);

/** Daily registers for the last 10 school days; today 1B and 12A not taken yet. */
export const registers = (() => {
  const out: any[] = [];
  const days: string[] = [];
  for (let k = 14; k >= 0; k--) {
    const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - k);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    days.push(ymd(d));
  }
  days.forEach((date, di) => {
    for (const c of classes) {
      if (date === TODAY && (c.id === '1B' || c.id === '12A')) continue;
      const roster: Record<string, string> = {};
      let present = 0, late = 0;
      for (let i = 0; i < 12; i++) {
        // Lubasi in Form 2A is often absent; a few others miss now and then.
        const absent = (c.id === '2A' && i === 11 && di % 3 !== 0) || (i + di) % 11 === 0;
        const st = absent ? 'absent' : (i + di) % 13 === 0 ? 'late' : 'present';
        roster[`${c.id}-${i}`] = st;
        if (st === 'present') present++;
        if (st === 'late') late++;
      }
      out.push({ classId: c.id, className: c.name, date, summary: { total: 12, present, late, absent: 12 - present - late, excused: 0 }, roster });
    }
  });
  return out;
})();

const period = (order: number, start: string, end: string) => ({ id: `p${order}`, order, name: `P${order}`, startTime: start, endTime: end, kind: 'lesson', academicYear: 2026, isActive: true });
const PERIODS = [period(1, '07:20', '08:00'), period(2, '08:00', '08:40'), period(3, '08:40', '09:20'), period(4, '09:20', '10:00'), period(5, '10:20', '11:00'), period(6, '11:00', '11:40'), period(7, '11:40', '12:20'), period(8, '12:20', '13:00')];
const SUBJECTS = ['Mathematics', 'English', 'Science', 'ICT', 'Geography', 'History', 'Civic Education', 'Biology'];
export const boardClasses: BoardClass[] = classes.map((c, ci) => ({
  classId: c.id,
  className: c.name,
  dailyTaken: !(c.id === '1B' || c.id === '12A'),
  dailyMarkedByName: null,
  lessons: PERIODS.map((p, pi) => {
    const past = pi < 4;
    const now = pi === 4;
    const status = c.id === '10A' && pi === 4 ? 'uncovered' : c.id === '12A' && pi === 6 ? 'uncovered' : past ? ((ci + pi) % 9 === 0 ? 'missed' : 'taken') : now ? (ci % 2 ? 'taken' : 'in-progress') : 'upcoming';
    return {
      status,
      markedByName: null,
      row: { entry: { classId: c.id, className: c.name, subject: SUBJECTS[(ci + pi) % 8], periodIndex: p.order } as any, period: p as any, ownerTeacherId: null, ownerTeacherName: null, operatorTeacherId: null, operatorTeacherName: null, operatorRole: null, delegationState: 'none', delegateUntil: null, isCoveredNow: false } as any,
    } as any;
  }),
}));
export const board = { date: TODAY, dayOfWeek: 4, holiday: null, term: 'Term 3', year: 2026, periods: PERIODS, classes: boardClasses };

const r = (l: any, subjectId: string, examType: string, pct: number, total = 100) => ({ studentId: l.id, classId: l.classId, subjectId, examType, marks: Math.round((pct / 100) * total), totalMarks: total, percentage: pct });
const score = (li: number, si: number, ti: number, base: number) => Math.max(8, Math.min(97, base + ((li * 17 + si * 11) % 45) - 18 + ti * 3));
export const rowsThis = learners.flatMap((l, li) =>
  ['Mathematics', 'English', 'Science', 'ICT', 'Geography'].flatMap((s, si) => {
    const weak = l.id === '2A-7' ? -40 : 0;
    return [r(l, s, 'week4', score(li, si, 0, 52 + weak), 50), r(l, s, 'week8', score(li, si, 1, 55 + weak), 50)];
  }),
);
export const rowsLast = learners.flatMap((l, li) =>
  ['Mathematics', 'English', 'Science', 'ICT', 'Geography'].flatMap((s, si) => [r(l, s, 'week4', score(li, si, 0, 49)), r(l, s, 'week8', score(li, si, 1, 50)), r(l, s, 'endOfTerm', score(li, si, 2, 51))]),
);

export const configs = [{
  id: 'c1', term: 'Term 3', year: 2026, isActive: true,
  examTypes: { week4: true, week8: true, endOfTerm: true },
  week4TotalMarks: 50, week8TotalMarks: 50, endOfTermTotalMarks: 100,
  week4Date: '2026-09-28', week4Deadline: '2026-10-02',
  week8Date: '2026-11-02', week8Deadline: '2026-11-13',
  endOfTermDate: '2026-11-25', endOfTermDeadline: null,
}];

export const teachers = [
  { id: 'T1', name: 'Mr Mwale', status: 'active' }, { id: 'T2', name: 'Mrs Phiri', status: 'active' }, { id: 'T3', name: 'Mr Banda', status: 'active' },
  { id: 'T4', name: 'Ms Zulu', status: 'on_leave' }, { id: 'T5', name: 'Mr Sakala', status: 'active' }, { id: 'T6', name: 'Mrs Lungu', status: 'active' },
];
export const slots = [
  ...classes.flatMap(c => SUBJECTS.slice(0, 5).map((s, i) => ({ classId: c.id, className: c.name, subject: s, ownerTeacherId: c.id === '12A' && s === 'ICT' ? null : `T${(i % 6) + 1}`, delegationState: c.id === '10A' && i === 3 ? 'live' : 'none' }))),
];
export const holidays = [{ id: 'h1', name: 'Independence Day', startDate: '2026-10-24', endDate: '2026-10-24', kind: 'public' }];

export const activity = [
  { id: 'a1', at: new Date(NOW.getTime() - 3 * 60_000), summary: 'Mr Mwale saved Week 8 marks for Form 1A Mathematics (12 learners)', ops: [{ collection: 'results' }], areas: ['Results'] },
  { id: 'a2', at: new Date(NOW.getTime() - 9 * 60_000), summary: 'Mrs Phiri took the daily register for Form 1B', ops: [{ collection: 'attendance_sessions' }], areas: ['Attendance'] },
  { id: 'a3', at: new Date(NOW.getTime() - 40 * 60_000), summary: 'Admin published the Term 3 timetable', ops: [{ collection: 'timetable_versions' }], areas: ['Timetable'] },
];

export const monitorDeadlines = [
  { examType: 'week4', deadline: '2026-10-02', total: 300, done: 300, status: { state: 'done', deadline: '2026-10-02', daysLeft: -41, label: 'Complete', tone: 'ok' }, teachersOverdue: 0 },
  { examType: 'week8', deadline: '2026-11-13', total: 300, done: 214, status: { state: 'due-soon', deadline: '2026-11-13', daysLeft: 1, label: 'Due tomorrow', tone: 'warn' }, teachersOverdue: 0 },
  { examType: 'endOfTerm', deadline: null, total: 300, done: 0, status: { state: 'none', deadline: null, daysLeft: null, label: 'No deadline', tone: 'neutral' }, teachersOverdue: 0 },
];
export const monitorTeachers = [
  { teacherId: 'T1', missingEntries: [{ examType: 'week8', missingStudentCount: 30 }, { examType: 'endOfTerm', missingStudentCount: 60 }] },
  { teacherId: 'T3', missingEntries: [{ examType: 'week8', missingStudentCount: 56 }, { examType: 'endOfTerm', missingStudentCount: 60 }] },
];

const q = (data: any) => ({ data, isLoading: false, isFetching: false, error: null, dataUpdatedAt: NOW.getTime(), refetch: async () => {} });

/** What useNerveCentre returns for this school. */
export function nerveData(over: Record<string, any> = {}) {
  return {
    now: NOW,
    today: TODAY,
    term,
    prev,
    classes: q(classes),
    learners: q(learners),
    registers: q(registers),
    board: q(board),
    rowsThis: q(rowsThis),
    rowsLast: q(rowsLast),
    configs: q(configs),
    teachers: q(teachers),
    slots: q(slots),
    holidays: q(holidays),
    sms: q(2),
    activity: q(activity),
    codes: q(0),
    sponsorList: { names: ['KGS', 'CAMFED', 'CDF', 'AP', 'WISE'], aliases: {} },
    monitor: { deadlines: monitorDeadlines, teacherProgress: monitorTeachers, summary: { overallCompletion: 57 }, isLoading: false, isFetching: false, error: null, refetch: async () => {} },
    updatedAt: NOW,
    isFetching: false,
    refresh: async () => {},
    ...over,
  };
}
