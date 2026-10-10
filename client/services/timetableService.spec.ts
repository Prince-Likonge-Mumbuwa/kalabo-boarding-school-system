import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('firebase/firestore', async () => await import('../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}), onAuthStateChanged: () => () => {} }));

import { resetStore, store, writeLog } from '../test/fakeFirestore';
import { teacherWriteAllowed } from '../test/timetableRulesModel';
import {
  submitTimetable,
  approveSubmission,
  rejectSubmission,
  getPendingSubmissions,
  getMySubmissions,
  getTimetableForClass,
  getTodayTimetableForTeacher,
  getCurrentPeriod,
  getSchoolDayBoard,
  getCoverageForDate,
  getCoverageForTeachers,
} from './timetableService';
import { PERIODS } from '../test/timetableFixtures';

const TERM = 'Term 3' as const;
const MON = '2026-10-12';
const slot = (classId: string, subj: string, subject: string, owner: string, extra: any = {}) => ({
  classId, className: classId.toUpperCase(), subject, normalizedSubject: subj,
  ownerTeacherId: owner, ownerTeacherName: owner, ...extra,
});
const cover = (who: string, from: string, to: string) => ({
  delegateTeacherId: who, delegateTeacherName: who, delegateRole: 'cover',
  delegateStart: new Date(from), delegateEnd: new Date(to),
});

beforeEach(() => {
  resetStore({
    periods: Object.fromEntries(PERIODS.map(p => [p.id, { ...p }])),
    class_slots: {
      '8a__MATH': slot('8a', 'MATH', 'Mathematics', 'T1'),
      '8a__ENG': slot('8a', 'ENG', 'English', 'T2'),
      '8b__MATH': slot('8b', 'MATH', 'Mathematics', 'T1'),
      '9a__BIO': slot('9a', 'BIO', 'Biology', 'T3'),
    },
    classes: { '8a': { name: '8A' }, '8b': { name: '8B' }, '9a': { name: '9A' } },
    users: { T1: { fullName: 'T1', status: 'active' }, T2: { fullName: 'T2', status: 'active' }, T3: { fullName: 'T3', status: 'active' } },
  });
  writeLog.length = 0;
});

const rows = (status = 'active') =>
  [...(store.get('timetable_entries')?.values() ?? [])].filter((r: any) => r.status === status) as any[];
const tick = (slotId: string, ...cells: Array<[1 | 2 | 3 | 4 | 5, number]>) =>
  cells.map(([dayOfWeek, periodIndex]) => ({ slotId, dayOfWeek, periodIndex }));
async function live(teacher: string, scope: string[], entries: any[]) {
  const r = await submitTimetable(teacher, teacher, { term: TERM, year: 2026, scopeSlotIds: scope, entries });
  await approveSubmission(r.submissionId, 'ADMIN');
  return r;
}
/** Every write a teacher made (not ADMIN approval writes) passes the rules model. */
function expectTeacherWritesAllowed(uid: string, from = 0) {
  for (const w of writeLog.slice(from)) {
    const col = w.path.split('/')[0];
    if (w.after?.approvedByUid || w.after?.status === 'archived' || w.after?.decidedBy) continue;
    expect(
      teacherWriteAllowed({ uid, enforceAuthority: true, slots: Object.fromEntries(store.get('class_slots')!) }, col, w.op, w.before, w.after),
      `${w.op} ${w.path}`,
    ).toBe(true);
  }
}

describe('submit and approve', () => {
  it('several periods in one class on one day, incl. a triple', async () => {
    await live('T1', ['8a__MATH'], tick('8a__MATH', [1, 5], [1, 6], [1, 7], [1, 1]));
    expect(rows().map(r => r.periodIndex).sort((a, b) => a - b)).toEqual([1, 5, 6, 7]);
    expect(rows().every(r => r.isDouble === false)).toBe(true);
  });

  it('moving a lesson replaces it (no duplicate left behind)', async () => {
    await live('T1', ['8a__MATH'], tick('8a__MATH', [1, 1]));
    await live('T1', ['8a__MATH'], tick('8a__MATH', [1, 2]));
    expect(rows().map(r => r.periodIndex)).toEqual([2]);
    expect(rows('archived')).toHaveLength(1);
  });

  it('unticking everything clears the subject once approved', async () => {
    await live('T1', ['8a__MATH'], tick('8a__MATH', [1, 1], [2, 1]));
    const r = await live('T1', ['8a__MATH'], []);
    expect(r.submittedCount).toBe(0);
    expect(rows()).toHaveLength(0);
  });

  it('a submission only replaces its own subjects', async () => {
    await live('T1', ['8a__MATH', '8b__MATH'], [...tick('8a__MATH', [1, 1]), ...tick('8b__MATH', [1, 2])]);
    await live('T1', ['8b__MATH'], tick('8b__MATH', [3, 4]));
    expect(rows().map(r => `${r.slotId}:${r.dayOfWeek}:${r.periodIndex}`).sort()).toEqual(['8a__MATH:1:1', '8b__MATH:3:4']);
  });

  it('refuses a class clash with another teacher already live', async () => {
    await live('T2', ['8a__ENG'], tick('8a__ENG', [1, 1]));
    await expect(
      submitTimetable('T1', 'T1', { term: TERM, year: 2026, scopeSlotIds: ['8a__MATH'], entries: tick('8a__MATH', [1, 1]) }),
    ).rejects.toThrow(/8A would have English and Mathematics on Monday P1/);
  });

  it('refuses a teacher clash across classes', async () => {
    await live('T1', ['8a__MATH'], tick('8a__MATH', [2, 4]));
    await expect(
      submitTimetable('T1', 'T1', { term: TERM, year: 2026, scopeSlotIds: ['8b__MATH'], entries: tick('8b__MATH', [2, 4]) }),
    ).rejects.toThrow(/T1 would teach/);
  });

  it('refuses a clash with a cover teacher’s duties', async () => {
    store.get('class_slots')!.set('9a__BIO', slot('9a', 'BIO', 'Biology', 'T3', cover('T2', '2026-01-01', '2026-12-31')));
    await live('T3', ['9a__BIO'], tick('9a__BIO', [2, 1]));
    await expect(
      submitTimetable('T2', 'T2', { term: TERM, year: 2026, scopeSlotIds: ['8a__ENG'], entries: tick('8a__ENG', [2, 1]) }),
    ).rejects.toThrow(/T2 would teach/);
  });

  it('refuses breaks and subjects the teacher does not teach', async () => {
    await expect(
      submitTimetable('T1', 'T1', { term: TERM, year: 2026, scopeSlotIds: ['8a__MATH'], entries: tick('8a__MATH', [1, 9]) }),
    ).rejects.toThrow(/not a lesson period/);
    await expect(
      submitTimetable('T1', 'T1', { term: TERM, year: 2026, scopeSlotIds: ['8a__ENG'], entries: tick('8a__ENG', [1, 1]) }),
    ).rejects.toThrow(/don't currently teach English/);
  });

  it('approval re-checks: a clash that appeared after submitting blocks it', async () => {
    const a = await submitTimetable('T1', 'T1', { term: TERM, year: 2026, scopeSlotIds: ['8a__MATH'], entries: tick('8a__MATH', [4, 1]) });
    await live('T2', ['8a__ENG'], tick('8a__ENG', [4, 1]));
    const pending = await getPendingSubmissions();
    expect(pending.find(p => p.id === a.submissionId)!.conflicts[0].kind).toBe('class-clash');
    await expect(approveSubmission(a.submissionId, 'ADMIN')).rejects.toThrow(/Cannot approve/);
    expect(rows('pending')).toHaveLength(1);
  });

  it('resubmitting replaces my pending rows; the earlier submission is superseded', async () => {
    const a = await submitTimetable('T1', 'T1', { term: TERM, year: 2026, scopeSlotIds: ['8a__MATH'], entries: tick('8a__MATH', [1, 1]) });
    const b = await submitTimetable('T1', 'T1', { term: TERM, year: 2026, scopeSlotIds: ['8a__MATH'], entries: tick('8a__MATH', [1, 2]) });
    expect(b.replacedPendingCount).toBe(1);
    expect(store.get('timetable_submissions')!.get(a.submissionId)!.status).toBe('superseded');
    expect(rows('pending').map(r => r.periodIndex)).toEqual([2]);
    await expect(approveSubmission(a.submissionId, 'ADMIN')).rejects.toThrow(/superseded/);
    expectTeacherWritesAllowed('T1');
  });

  it('pending view shows before/after; reject keeps the live timetable and records the reason', async () => {
    await live('T1', ['8a__MATH'], tick('8a__MATH', [1, 1]));
    const b = await submitTimetable('T1', 'T1', { term: TERM, year: 2026, scopeSlotIds: ['8a__MATH'], entries: tick('8a__MATH', [1, 2]) });
    const [p] = await getPendingSubmissions();
    expect(p.replacedEntries.map(e => e.periodIndex)).toEqual([1]);
    expect(p.entries.map(e => e.periodIndex)).toEqual([2]);
    expect(p.classNames).toEqual(['8A']);
    await rejectSubmission(b.submissionId, 'Wrong day', 'ADMIN');
    expect(rows().map(r => r.periodIndex)).toEqual([1]);
    const mine = await getMySubmissions('T1', TERM, 2026);
    expect(mine[0].status).toBe('rejected');
    expect(mine[0].rejectedReason).toBe('Wrong day');
  });

  it('all teacher writes pass the rules (authority enforced)', async () => {
    const from = writeLog.length;
    await submitTimetable('T1', 'T1', { term: TERM, year: 2026, scopeSlotIds: ['8a__MATH', '8b__MATH'], entries: tick('8a__MATH', [1, 1], [1, 2]) });
    expectTeacherWritesAllowed('T1', from);
  });
});

describe('reading the timetable', () => {
  it('old double rows are read as two periods (not across a break)', async () => {
    store.set('timetable_entries', new Map([
      ['old1', { slotId: '8a__MATH', classId: '8a', className: '8A', subject: 'Mathematics', normalizedSubject: 'MATH',
        term: TERM, year: 2026, dayOfWeek: 1, periodIndex: 7, isDouble: true, status: 'active' }],
      ['old2', { slotId: '8a__ENG', classId: '8a', className: '8A', subject: 'English', normalizedSubject: 'ENG',
        term: TERM, year: 2026, dayOfWeek: 1, periodIndex: 4, isDouble: true, status: 'active' }],
    ]));
    const r = await getTimetableForClass('8a', TERM, 2026);
    expect(r.map(x => `${x.entry.subject}:${x.entry.periodIndex}`)).toEqual(['English:4', 'Mathematics:7', 'Mathematics:8']);
  });

  it('teacher’s day: the second half of a double is the current period; numbers are P1–P8', async () => {
    await live('T1', ['8a__MATH'], tick('8a__MATH', [1, 5], [1, 6], [1, 8]));
    const at = new Date(`${MON}T11:10:00`);
    expect((await getCurrentPeriod('T1', at))?.entry.periodIndex).toBe(6);
    const day = await getTodayTimetableForTeacher('T1', at);
    expect(day.map(r => r.entry.periodIndex)).toEqual([5, 6, 8]);
    // After 13:00 there is no current period.
    expect(await getCurrentPeriod('T1', new Date(`${MON}T13:30:00`))).toBeNull();
  });

  it('a cover teacher gets the lessons only on the days the cover runs; the owner does not', async () => {
    await live('T1', ['8a__MATH'], tick('8a__MATH', [1, 1]));
    store.get('class_slots')!.set('8a__MATH', slot('8a', 'MATH', 'Mathematics', 'T1', cover('T3', '2026-10-12T00:00:00', '2026-10-16T23:59:00')));
    expect(await getTodayTimetableForTeacher('T3', new Date(`${MON}T07:00:00`))).toHaveLength(1);
    expect(await getTodayTimetableForTeacher('T1', new Date(`${MON}T07:00:00`))).toHaveLength(0);
    expect(await getTodayTimetableForTeacher('T3', new Date('2026-10-19T07:00:00'))).toHaveLength(0);
    expect(await getTodayTimetableForTeacher('T1', new Date('2026-10-19T07:00:00'))).toHaveLength(1);
  });
});

describe('school day board and coverage', () => {
  const mark = (classId: string, period: number, subject: string, by: string, extra: any = {}) =>
    store.get('attendance_sessions')?.set(`${classId}_${period}`, {
      classId, date: MON, kind: 'periodic', period, subject, markedBy: by, markedByName: by, ...extra,
    }) ?? store.set('attendance_sessions', new Map([[`${classId}_${period}`, {
      classId, date: MON, kind: 'periodic', period, subject, markedBy: by, markedByName: by, ...extra }]]));

  beforeEach(async () => {
    await live('T1', ['8a__MATH', '8b__MATH'], [...tick('8a__MATH', [1, 1], [1, 2]), ...tick('8b__MATH', [1, 4])]);
    await live('T2', ['8a__ENG'], tick('8a__ENG', [1, 7]));
  });

  it('statuses: taken / missed / in progress / upcoming / uncovered, and daily register', async () => {
    mark('8a', 1, 'Mathematics', 'T1');
    store.get('attendance_sessions')!.set('8a_daily', { classId: '8a', date: MON, kind: 'daily', markedBy: 'FT', markedByName: 'FT' });
    store.get('users')!.set('T2', { fullName: 'T2', status: 'on_leave' });
    const b = await getSchoolDayBoard(MON, new Date(`${MON}T09:45:00`));
    const a8 = b.classes.find(c => c.classId === '8a')!;
    expect(a8.lessons.map(l => `${l.row.entry.periodIndex}:${l.status}`)).toEqual(['1:taken', '2:missed', '7:uncovered']);
    expect(a8.dailyTaken).toBe(true);
    const b8 = b.classes.find(c => c.classId === '8b')!;
    expect(b8.lessons.map(l => l.status)).toEqual(['in-progress']);
    expect(b.classes.find(c => c.classId === '9a')!.dailyTaken).toBe(false); // listed though nothing marked
  });

  it('matches registers by subject key when recorded', async () => {
    mark('8a', 1, 'Maths', 'T1', { normalizedSubject: 'MATH' });
    const b = await getSchoolDayBoard(MON, new Date(`${MON}T16:00:00`));
    expect(b.classes.find(c => c.classId === '8a')!.lessons[0].status).toBe('taken');
  });

  it('teacher coverage only counts their own timetabled lessons', async () => {
    mark('8a', 1, 'Mathematics', 'T1');
    mark('8a', 5, 'Mathematics', 'T1'); // not on the timetable
    const t = await getCoverageForTeachers(MON, new Date(`${MON}T16:00:00`));
    const t1 = t.find(x => x.teacherId === 'T1')!;
    expect([t1.expectedCount, t1.markedCount, t1.coverageRate]).toEqual([3, 1, 33]);
    expect(t1.missingEntries.map(e => `${e.entry.classId}:${e.entry.periodIndex}`)).toEqual(['8a:2', '8b:4']);
    const c = await getCoverageForDate(MON, new Date(`${MON}T16:00:00`));
    expect(c.find(x => x.classId === '8b')!.missingCount).toBe(1);
  });

  it('a past date credits whoever covered on that date', async () => {
    store.get('class_slots')!.set('8a__MATH', slot('8a', 'MATH', 'Mathematics', 'T1', cover('T3', '2026-10-01', '2026-10-09T23:59:00')));
    const t = await getCoverageForTeachers('2026-10-05', new Date('2026-10-10T10:00:00'));
    expect(t.find(x => x.teacherId === 'T3')!.expectedCount).toBe(2);
    expect(t.find(x => x.teacherId === 'T1')!.expectedCount).toBe(1); // 8B only
  });

  it('weekends and holidays are empty', async () => {
    expect((await getSchoolDayBoard('2026-10-10')).classes).toEqual([]);
    store.set('school_holidays', new Map([['h', { name: 'Independence', startDate: MON, endDate: MON, kind: 'public' }]]));
    const b = await getSchoolDayBoard(MON);
    expect(b.holiday?.name).toBe('Independence');
    expect(b.classes).toEqual([]);
  });
});

describe('bell schedule guard', () => {
  it('a period with lessons cannot be renumbered or turned into a break; times can change', async () => {
    const { upsertPeriod } = await import('./timetableService');
    await live('T1', ['8a__MATH'], tick('8a__MATH', [1, 4]));
    const p3 = { ...PERIODS.find(p => p.order === 4)! }; // P4 (09:20–10:00)
    await expect(upsertPeriod({ ...p3, order: 5 })).rejects.toThrow(/1 lesson\(s\) are timetabled in P4/);
    await expect(upsertPeriod({ ...p3, kind: 'break' })).rejects.toThrow(/timetabled/);
    await expect(upsertPeriod({ ...p3, startTime: '09:35' })).resolves.toBe(p3.id);
    await expect(upsertPeriod({ ...p3, endTime: '13:20', id: undefined, order: 9 })).rejects.toThrow(/07:20–13:00/);
    await expect(upsertPeriod({ ...p3, startTime: '07:00', endTime: '07:20', id: undefined, order: 1 })).rejects.toThrow(/07:20–13:00/);
    await expect(upsertPeriod({ ...p3, id: undefined, order: 9, startTime: '12:00', endTime: '12:30' })).rejects.toThrow(/1 to 8/);
  });

  it('seeding gives P1–P8 and one unnumbered break, ending at 13:00', async () => {
    const { seedDefaultPeriods, listPeriods } = await import('./timetableService');
    resetStore({});
    expect(await seedDefaultPeriods(2027)).toBe(9);
    const ps = await listPeriods(2027);
    expect(ps.map(p => `${p.name}:${p.order}`)).toEqual(['P1:1', 'P2:2', 'P3:3', 'P4:4', 'Break:0', 'P5:5', 'P6:6', 'P7:7', 'P8:8']);
    expect(ps[ps.length - 1].endTime).toBe('13:00');
    expect(await seedDefaultPeriods(2027)).toBe(0);
  });
});
