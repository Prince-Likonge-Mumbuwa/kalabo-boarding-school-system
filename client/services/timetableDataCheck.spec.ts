import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('firebase/firestore', async () => await import('../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}), onAuthStateChanged: () => () => {} }));

import { resetStore, store } from '../test/fakeFirestore';
import { PERIODS } from '../test/timetableFixtures';
import { runTimetableDataCheck, fixLegacyDoubles, archiveBadRows } from './timetableDataCheck';

const e = (slotId: string, day: number, p: number, extra: any = {}) => {
  const [classId, subj] = slotId.split('__');
  return { slotId, classId, className: classId.toUpperCase(), subject: subj, normalizedSubject: subj,
    term: 'Term 3', year: 2026, dayOfWeek: day, periodIndex: p, isDouble: false, status: 'active', ...extra };
};

beforeEach(() => {
  resetStore({
    periods: Object.fromEntries(PERIODS.map(p => [p.id, { ...p }])),
    class_slots: {
      '8a__MATH': { classId: '8a', subject: 'MATH', normalizedSubject: 'MATH', ownerTeacherId: 'T1', ownerTeacherName: 'T1' },
      '8a__ENG': { classId: '8a', subject: 'ENG', normalizedSubject: 'ENG', ownerTeacherId: 'T2', ownerTeacherName: 'T2' },
    },
    timetable_entries: {
      d1: e('8a__MATH', 1, 7, { isDouble: true }),      // → P7 + P8
      d2: e('8a__MATH', 2, 4, { isDouble: true }),      // before the break → just P4
      dup1: e('8a__ENG', 3, 1), dup2: e('8a__ENG', 3, 1),
      brk: e('8a__ENG', 4, 9),                          // not a lesson period (only P1–P8)
      gone: e('9z__OLD', 1, 1),                         // slot deleted
      c1: e('8a__ENG', 1, 8),                           // clashes with d1's tail (P8)
      arch: e('8a__MATH', 5, 1, { status: 'archived' }),
    },
  });
});

describe('timetable data check', () => {
  it('finds old doubles, duplicates, break rows, orphans and clashes', async () => {
    const c = await runTimetableDataCheck('Term 3', 2026);
    expect(c.legacyDoubles.map(r => r.id).sort()).toEqual(['d1', 'd2']);
    expect(c.duplicates.map(r => r.id)).toEqual(['dup2']);
    expect(c.notLessons.map(r => r.id)).toEqual(['brk']);
    expect(c.orphans.map(r => r.id)).toEqual(['gone']);
    expect(c.clashes.map(x => x.kind)).toEqual(['class-clash']);
    expect(c.clashes[0].message).toContain('Monday P8');
  });

  it('fixes: doubles split into one row per period; bad rows archived; re-check is clean except real clashes', async () => {
    let c = await runTimetableDataCheck('Term 3', 2026);
    expect(await fixLegacyDoubles(c)).toBe(2);
    expect(await archiveBadRows(c)).toBe(3);
    const live = [...store.get('timetable_entries')!.values()].filter((r: any) => r.status === 'active');
    expect(live.filter((r: any) => r.slotId === '8a__MATH').map((r: any) => `${r.dayOfWeek}:${r.periodIndex}`).sort())
      .toEqual(['1:7', '1:8', '2:4']);
    expect(live.every((r: any) => r.isDouble === false)).toBe(true);
    c = await runTimetableDataCheck('Term 3', 2026);
    expect([c.legacyDoubles.length, c.duplicates.length, c.notLessons.length, c.orphans.length]).toEqual([0, 0, 0, 0]);
    expect(c.clashes).toHaveLength(1); // still there: needs a timetable edit
    // Running the double fix again creates nothing new.
    expect(await fixLegacyDoubles(c)).toBe(0);
  });
});

import { applySchoolBell } from './timetableDataCheck';
describe('applying the school bell schedule to an old one', () => {
  it('times become 07:20–13:00 with the 10:00 break; rows and registers follow their lessons', async () => {
    const P = (order: number, name: string, kind: string, s: string, e: string) =>
      ({ order, name, kind, startTime: s, endTime: e, academicYear: 2026, isActive: true });
    resetStore({
      periods: {
        a: P(1, 'P1', 'lesson', '07:30', '08:20'), b: P(2, 'P2', 'lesson', '08:20', '09:10'),
        c: P(3, 'Break', 'break', '09:10', '09:30'), d: P(4, 'P3', 'lesson', '09:30', '10:20'),
        e: P(5, 'P4', 'lesson', '10:20', '11:10'), f: P(6, 'Lunch', 'lunch', '11:10', '12:00'),
        g: P(7, 'P5', 'lesson', '12:00', '12:50'), h: P(8, 'P6', 'lesson', '12:50', '13:40'),
        i: P(9, 'P7', 'lesson', '13:40', '14:30'), j: P(10, 'P8', 'lesson', '14:30', '15:20'),
      },
      class_slots: { '8a__MATH': { classId: '8a', subject: 'MATH', normalizedSubject: 'MATH', ownerTeacherId: 'T1' } },
      timetable_entries: { t1: e('8a__MATH', 1, 4), t2: e('8a__MATH', 1, 2), t3: e('8a__MATH', 2, 10) },
      attendance_sessions: {
        '8a_2026-10-12_p4_Mathematics': { classId: '8a', date: '2026-10-12', kind: 'periodic', period: 4, subject: 'Mathematics', markedBy: 'T1' },
        '8a_2026-10-12_p7_Mathematics': { classId: '8a', date: '2026-10-12', kind: 'periodic', period: 7, subject: 'Mathematics', markedBy: 'T1' },
        '8a_2026-10-12_daily': { classId: '8a', date: '2026-10-12', kind: 'daily', markedBy: 'FT' },
      },
    });
    const c = await runTimetableDataCheck('Term 3', 2026);
    expect(c.needsRenumber).toBe(true);
    expect(c.notLessons).toEqual([]); // nothing is flagged until the bell is fixed
    const r = await applySchoolBell(2026, c.bell);
    expect(r).toMatchObject({ rows: 2, registers: 2, conflicts: 0, retired: 0 });
    const ps = [...store.get('periods')!.values()].filter((p: any) => p.isActive)
      .sort((x: any, y: any) => x.startTime.localeCompare(y.startTime)).map((p: any) => `${p.name}:${p.order} ${p.startTime}-${p.endTime}`);
    expect(ps).toEqual([
      'P1:1 07:20-08:00', 'P2:2 08:00-08:40', 'P3:3 08:40-09:20', 'P4:4 09:20-10:00', 'Break:0 10:00-10:20',
      'P5:5 10:20-11:00', 'P6:6 11:00-11:40', 'P7:7 11:40-12:20', 'P8:8 12:20-13:00',
    ]);
    expect(store.get('periods')!.get('f')).toMatchObject({ isActive: false, order: 0 }); // lunch
    expect(store.get('timetable_entries')!.get('t1')!.periodIndex).toBe(3);
    expect(store.get('timetable_entries')!.get('t2')!.periodIndex).toBe(2);
    expect(store.get('timetable_entries')!.get('t3')!.periodIndex).toBe(8);
    expect([...store.get('attendance_sessions')!.keys()].sort()).toEqual([
      '8a_2026-10-12_daily', '8a_2026-10-12_p3_Mathematics', '8a_2026-10-12_p5_Mathematics',
    ]);
    const again = await runTimetableDataCheck('Term 3', 2026);
    expect([again.needsRenumber, again.bell.upToDate]).toEqual([false, true]);
  });
});
