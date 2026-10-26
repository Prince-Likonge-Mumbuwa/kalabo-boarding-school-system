import { describe, it, expect } from 'vitest';
import {
  admittedSince,
  attendanceByDay,
  attendanceToday,
  buildAttention,
  dailyBrief,
  dataQuality,
  enrolmentByForm,
  examSetupProblems,
  formLabel,
  formPerformance,
  latestTest,
  learnerAttendance,
  learnersAtRisk,
  lessonsFromBoard,
  nameList,
  resultsTrend,
  sponsorSplit,
  staffToday,
  subjectPerformance,
  termTimeline,
  testStats,
  type ClassLite,
  type DailyRegister,
  type ResultRow,
} from './nerveCentre';
import { defaultSponsorList } from './guidancePlan';
import { boardClasses, NOW as FX_NOW } from '../test/nerveFixture';

const classes: ClassLite[] = [
  { id: '1A', name: 'Form 1A', type: 'form', level: 1, formTeacherId: 'T1' },
  { id: '1B', name: 'Form 1B', type: 'form', level: 1, formTeacherId: null },
  { id: '10A', name: 'Grade 10A', type: 'grade', level: 10, formTeacherId: 'T3' },
  { id: 'X', name: 'Old Class', isActive: false },
];
const reg = (classId: string, date: string, present: number, total: number, late = 0, roster?: Record<string, string>): DailyRegister => ({
  classId, className: classes.find(c => c.id === classId)?.name ?? classId, date,
  summary: { total, present, absent: total - present - late, late, excused: 0 }, roster,
});

describe('helpers', () => {
  it('form labels and name lists', () => {
    expect(formLabel({ name: 'Form 2B' })).toBe('Form 2');
    expect(formLabel({ name: 'grade 10a' })).toBe('Grade 10');
    expect(formLabel({ name: 'Blue', type: 'form', level: 3 })).toBe('Form 3');
    expect(formLabel({ name: 'Blue' })).toBe('Other');
    expect(nameList(['a', 'b', 'c', 'd', 'e', 'f'])).toBe('a, b, c, d and 2 more');
  });
});

describe('attendance', () => {
  const regs = [
    reg('1A', '2026-11-12', 36, 40, 2), reg('10A', '2026-11-12', 30, 40),
    reg('1A', '2026-11-05', 35, 40), reg('10A', '2026-11-05', 33, 40), reg('1B', '2026-11-05', 38, 40),
  ];
  it('today: present incl. late, registers taken, change vs the same day last week, lowest class, by form', () => {
    const a = attendanceToday(regs, classes, '2026-11-12');
    expect(a).toMatchObject({ registersTaken: 2, registersDue: 3, present: 68, total: 80, pct: 85, lastWeekPct: 88, change: -3 });
    expect(a.notTaken.map(c => c.name)).toEqual(['Form 1B']);
    expect(a.lowest).toEqual({ className: 'Grade 10A', pct: 75 });
    expect(a.byForm).toEqual([
      { form: 'Form 1', present: 38, total: 40, pct: 95 },
      { form: 'Grade 10', present: 30, total: 40, pct: 75 },
    ]);
  });
  it('no registers yet: no percentage, every class not taken', () => {
    const a = attendanceToday([], classes, '2026-11-12');
    expect(a).toMatchObject({ pct: null, registersTaken: 0, registersDue: 3, change: null, lowest: null });
  });
  it('by day, and per learner', () => {
    expect(attendanceByDay(regs)).toEqual([{ date: '2026-11-05', pct: 88 }, { date: '2026-11-12', pct: 85 }]);
    const m = learnerAttendance([
      reg('1A', 'd1', 1, 2, 0, { a: 'present', b: 'absent' }),
      reg('1A', 'd2', 1, 2, 1, { a: 'late', b: 'excused' }),
    ]);
    expect(m.get('a')).toEqual({ present: 2, total: 2 });
    expect(m.get('b')).toEqual({ present: 0, total: 2 });
  });
});

describe('results', () => {
  const r = (studentId: string, classId: string, subjectId: string, examType: string, marks: number, totalMarks = 100): ResultRow => ({
    studentId, classId, subjectId, examType, marks, totalMarks, percentage: marks >= 0 ? Math.round((marks / totalMarks) * 100) : undefined,
  });
  const thisTerm = [
    r('a', '1A', 'Maths', 'week4', 30, 50), r('b', '1A', 'Maths', 'week4', 15, 50), r('c', '10A', 'Maths', 'week4', -1, 50),
    r('a', '1A', 'English', 'week4', 80), r('b', '1A', 'English', 'week4', 39.6 as any),
    r('a', '1A', 'Maths', 'week8', 90), r('c', '10A', 'Maths', 'week8', 20),
  ];
  const lastTerm = [r('a', '1A', 'Maths', 'week4', 50), r('b', '1A', 'Maths', 'week4', 30)];

  it('pass rate counts marks of 40% or more (after rounding); absences are not marks', () => {
    // week4: 60, 30, 80, 40 (39.6 rounds up) → 3 of 4 pass, quality 1 of 4
    expect(testStats(thisTerm.filter(x => x.examType === 'week4'))).toEqual({ n: 4, passRate: 75, qualityRate: 25, mean: 53 });
    expect(testStats([])).toEqual({ n: 0, passRate: null, qualityRate: null, mean: null });
  });
  it('trend this term vs last term, and the latest test with marks', () => {
    const t = resultsTrend(thisTerm, lastTerm);
    expect(t.map(p => [p.label, p.thisTerm.passRate, p.lastTerm.passRate])).toEqual([['Week 4', 75, 50], ['Week 8', 50, null], ['End of Term', null, null]]);
    expect(latestTest(t)!.label).toBe('Week 8');
  });
  it('by form and by subject', () => {
    expect(formPerformance(thisTerm, 'week8', classes).map(f => [f.form, f.passRate])).toEqual([['Form 1', 100], ['Grade 10', 0]]);
    expect(subjectPerformance(thisTerm, 2).map(s => [s.subject, s.mean])).toEqual([['English', 60], ['Maths', 50]]);
  });

  it('learners at risk: failing 3+ subjects, or attendance below 80% over 5+ days', () => {
    const rows = [
      ...['Maths', 'English', 'Science'].map(s => r('a', '1A', s, 'week4', 20)),
      ...['Maths', 'English'].map(s => r('b', '1A', s, 'week4', 20)), r('b', '1A', 'Science', 'week4', 60),
    ];
    const att = new Map([['b', { present: 3, total: 6 }], ['c', { present: 2, total: 3 }]]);
    const list = learnersAtRisk(rows, att, [
      { id: 'a', fullName: 'Ann', className: 'Form 1A' },
      { id: 'b', fullName: 'Ben', className: 'Form 1A' },
      { id: 'c', fullName: 'Cat', className: 'Form 1A' }, // too few days to judge
      { id: 'd', fullName: 'Dan', className: 'Form 1A', status: 'transferred' },
    ]);
    expect(list.map(x => [x.name, x.reasons])).toEqual([
      ['Ben', ['attendance 50%']],
      ['Ann', ['failing 3 subjects']],
    ]);
    expect(list[1].failing).toEqual(['English', 'Maths', 'Science']);
  });
});

describe('term timeline', () => {
  it('week of term, days left, markers in order with the next one ahead', () => {
    const t = termTimeline({
      start: new Date(2026, 8, 1), end: new Date(2026, 11, 4), today: new Date(2026, 9, 26),
      config: { examTypes: { week4: true, week8: true, endOfTerm: true }, week4Date: '2026-09-28', week4Deadline: '2026-10-02', week8Date: '2026-10-26', week8Deadline: '2026-10-30', endOfTermDate: '2026-11-23' },
      holidays: [{ name: 'Independence Day', startDate: '2026-10-24' }, { name: 'Outside', startDate: '2027-01-01' }],
    });
    expect(t.week).toBe(8);
    expect(t.daysLeft).toBe(39);
    expect(t.markers.map(m => [m.label, m.past])).toEqual([
      ['Week 4 test', true], ['Week 4 results due', true], ['Independence Day', true],
      ['Week 8 test', false], ['Week 8 results due', false], ['End of Term test', false],
    ]);
    expect(t.next!.label).toBe('Week 8 test');
    expect(t.elapsed).toBeGreaterThan(55);
    expect(t.elapsed).toBeLessThan(60);
  });
});

describe('staff and set-up', () => {
  it('staff today: on leave, live covers, vacant subjects, classes without a form teacher', () => {
    const s = staffToday(
      [{ id: 'T1', name: 'Mr One' }, { id: 'T2', name: 'Ms Two', status: 'on_leave' }, { id: 'T9', name: 'Gone', status: 'transferred' }],
      [
        { classId: '1A', className: 'Form 1A', subject: 'Maths', ownerTeacherId: 'T1' },
        { classId: '1A', className: 'Form 1A', subject: 'English', ownerTeacherId: 'T2', delegationState: 'live' },
        { classId: '1B', className: 'Form 1B', subject: 'Science', ownerTeacherId: null },
        { classId: '1B', className: 'Form 1B', subject: 'Form Teacher', ownerTeacherId: null, isFormTeacherSlot: true },
        { classId: 'X', className: 'Old Class', subject: 'Art', ownerTeacherId: null },
      ],
      classes,
    );
    expect(s.teachers).toBe(2);
    expect(s.onLeave).toEqual(['Ms Two']);
    expect(s.coversLive).toBe(1);
    expect(s.vacant.map(v => `${v.className} ${v.subject}`)).toEqual(['Form 1B Science']);
    expect(s.classesWithoutFormTeacher.map(c => c.name)).toEqual(['Form 1B']);
  });
  it('exam set-up problems', () => {
    expect(examSetupProblems([], 'Term 3 2026')).toEqual(['No exam configuration for Term 3 2026: teachers have no tests to enter.']);
    const c = { isActive: true, examTypes: { week4: true, week8: true, endOfTerm: false }, week4TotalMarks: 50, week8TotalMarks: 50, week4Deadline: '2026-10-02' };
    expect(examSetupProblems([c], 'Term 3 2026')).toEqual(['No results deadline for Week 8: teachers see no countdown.']);
    expect(examSetupProblems([{ ...c, week8Deadline: '2026-10-30' }, { ...c }], 'Term 3 2026')).toEqual([
      'Term 3 2026 has 2 exam configurations; only the newest is used. Delete or merge the others.',
    ]);
  });
});

describe('school overview', () => {
  const learners = [
    { id: 'a', fullName: 'A', className: 'Form 1A', gender: 'female', sponsor: 'CAMFED', guardianPhone: '097', dateOfBirth: '2012-01-01', dateOfFirstEntry: '2026-09-10' },
    { id: 'b', fullName: 'B', className: 'Form 1B', gender: 'male', sponsor: 'Mr Banda', dateOfFirstEntry: '2026-01-10' },
    { id: 'c', fullName: 'C', className: 'Grade 10A', gender: 'female', sponsor: 'Self-sponsored', parentPhone: '096', dateOfBirth: '2010-02-02' },
    { id: 'd', fullName: 'D', className: 'Grade 10A', gender: 'male', status: 'transferred' },
  ];
  it('enrolment by form and gender; admitted this term', () => {
    expect(enrolmentByForm(learners)).toEqual([
      { form: 'Form 1', boys: 1, girls: 1, other: 0, total: 2 },
      { form: 'Grade 10', boys: 0, girls: 1, other: 0, total: 1 },
    ]);
    expect(admittedSince(learners, new Date(2026, 8, 1))).toBe(1);
  });
  it('sponsor split (self-sponsored last) and data quality', () => {
    expect(sponsorSplit(learners, defaultSponsorList())).toEqual([{ name: 'CAMFED', count: 1 }, { name: 'Self-sponsored', count: 2 }]);
    expect(dataQuality(learners, classes, defaultSponsorList()).map(d => [d.id, d.count])).toEqual([
      ['phone', 1], ['dob', 1], ['sponsor', 1], ['formteacher', 1],
    ]);
  });
});

describe('attention', () => {
  const att = attendanceToday([reg('1A', '2026-11-12', 36, 40)], classes, '2026-11-12');
  const at = (h: number, m = 0) => new Date(2026, 10, 12, h, m);

  it('registers: nothing before 08:00, amber from 08:00, red from 10:00; not on a holiday', () => {
    expect(buildAttention({ now: at(7, 30), schoolDay: true, attendance: att })).toEqual([]);
    expect(buildAttention({ now: at(8, 5), schoolDay: true, attendance: att })[0]).toMatchObject({
      id: 'registers', severity: 'warning', title: "2 classes haven't taken today's register", detail: 'Form 1B, Grade 10A',
    });
    expect(buildAttention({ now: at(10, 1), schoolDay: true, attendance: att })[0].severity).toBe('critical');
    expect(buildAttention({ now: at(11), schoolDay: false, attendance: att })).toEqual([]);
  });

  it('everything else, worst first, each with where to fix it', () => {
    const items = buildAttention({
      now: at(9),
      schoolDay: true,
      lessons: { total: 120, uncoveredNow: [{ className: 'Grade 10A', subject: 'Maths', period: 'P3' }], uncoveredLater: [], missed: 2 },
      results: { deadlines: [
        { exam: 'week8', deadline: '2026-11-10', overdue: true, dueSoon: false, done: 300, total: 400, teachersBehind: 4, teachersOverdue: 4, countdown: '1d 09h' },
        { exam: 'week4', deadline: '2026-11-01', overdue: true, dueSoon: false, done: 400, total: 400, teachersBehind: 0, teachersOverdue: 0 },
      ] },
      examProblems: ['No results deadline for End of Term: teachers see no countdown.'],
      staff: staffToday([], [{ classId: '1B', className: 'Form 1B', subject: 'Science', ownerTeacherId: null }], classes),
      smsFailedWeek: 3,
      atRisk: 5,
      sponsorNamesNotListed: 2,
      sponsorCodesExpiring: 1,
      noGuardianPhone: 7,
    });
    expect(items.map(i => [i.severity, i.title])).toEqual([
      ['critical', '1 lesson running now with no teacher'],
      ['critical', 'Week 8 results overdue by 1d 09h — 4 teachers still entering'],
      ['warning', '2 lesson registers missed today'],
      ['warning', 'No results deadline for End of Term: teachers see no countdown.'],
      ['warning', '1 class subject with no teacher'],
      ['warning', '1 class without a form teacher'],
      ['warning', '3 SMS failed to send this week'],
      ['info', '5 learners at risk — failing several subjects or often absent'],
      ['info', '2 learners with a sponsor name not on the sponsor list'],
      ['info', '1 sponsor code expire within 3 days unused'],
      ['info', '7 learners with no guardian phone — no results SMS'],
    ]);
    expect(items[1].to).toBe('/dashboard/admin/results-monitor?status=overdue');
    expect(items[0].detail).toBe('P3 Grade 10A Maths');
  });

  it('no timetable published on a school day', () => {
    expect(buildAttention({ now: at(9), schoolDay: true, lessons: { total: 0, uncoveredNow: [], uncoveredLater: [], missed: 0 } })[0]).toMatchObject({ id: 'no-timetable' });
  });
});

describe('daily brief', () => {
  it('a short text with attendance, results and what needs attention', () => {
    const att = attendanceToday([reg('1A', '2026-11-12', 36, 40)], classes, '2026-11-12');
    const text = dailyBrief({
      schoolName: 'Kalabo Boarding Secondary School', date: new Date(2026, 10, 12), termLabel: 'Term 3 2026', week: 11,
      attendance: att,
      attention: [{ id: 'x', severity: 'critical', area: 'Lessons', title: '1 lesson running now with no teacher', detail: 'P3 Grade 10A Maths', to: '' }, { id: 'y', severity: 'info', area: 'Data', title: 'ignored', to: '' }],
      latest: { exam: 'week8', label: 'Week 8', thisTerm: { n: 10, passRate: 71, qualityRate: 22, mean: 55 }, lastTerm: { n: 0, passRate: null, qualityRate: null, mean: null } },
    });
    expect(text).toBe([
      '*Kalabo Boarding Secondary School — daily brief*',
      'Thursday, 12 November 2026 · Term 3 2026, week 11',
      'Attendance: 90% present (36 of 40). Registers 1/3.',
      'Results (Week 8): pass rate 71%, quality 22%.',
      '',
      'Needs attention:',
      '• 1 lesson running now with no teacher (P3 Grade 10A Maths)',
    ].join('\n'));
  });
});


describe('lessons from the day board', () => {
  it('splits lessons with no teacher into now and later, and counts registers by period', () => {
    const l = lessonsFromBoard(boardClasses, FX_NOW); // 10:20, P5 running
    expect(l.total).toBe(40);
    expect(l.uncoveredNow).toEqual([{ className: 'Grade 10A', subject: 'Biology', period: 'P5' }]);
    expect(l.uncoveredLater).toEqual([{ className: 'Grade 12A', subject: 'Science', period: 'P7' }]);
    expect(l.missed).toBe(1);
    // started = P1–P4 (20) + P5 (5, incl. the uncovered one now)
    expect(l.started).toBe(25);
    expect(l.byPeriod.map(p => [p.period, p.isPast, p.isNow])).toEqual([
      ['P1', true, false], ['P2', true, false], ['P3', true, false], ['P4', true, false],
      ['P5', false, true], ['P6', false, false], ['P7', false, false], ['P8', false, false],
    ]);
    expect(l.byPeriod[4]).toMatchObject({ lessons: 5, uncovered: 1 });
  });
});
