import { describe, it, expect } from 'vitest';
import {
  groupIntoBlocks,
  nowAndNext,
  checkClashes,
  legacyDoubleOrders,
  lessonPeriods,
  weekdayOf,
  type RowLike,
} from './timetableModel';

import { PERIODS } from '../test/timetableFixtures';
const row = (slotId: string, day: 1 | 2 | 3 | 4 | 5, p: number, classId = slotId.split('__')[0]): RowLike => ({
  slotId, classId, className: classId.toUpperCase(), subject: slotId.split('__')[1], dayOfWeek: day, periodIndex: p,
});

describe('groupIntoBlocks', () => {
  it('joins consecutive periods of one subject into a double / triple', () => {
    const b = groupIntoBlocks([row('8a__MATH', 1, 7), row('8a__MATH', 1, 5), row('8a__MATH', 1, 6)], PERIODS);
    expect(b).toHaveLength(1);
    expect(b[0].label).toBe('P5–P7');
    expect(b[0].size).toBe(3);
    expect(b[0].startTime).toBe('10:20');
    expect(b[0].endTime).toBe('12:20');
  });

  it('a break splits periods into separate lessons', () => {
    const b = groupIntoBlocks([row('8a__MATH', 1, 4), row('8a__MATH', 1, 5)], PERIODS);
    expect(b.map(x => x.label)).toEqual(['P4', 'P5']);
  });

  it('several lessons of one subject on a day (not touching) stay separate', () => {
    const b = groupIntoBlocks([row('8a__MATH', 2, 1), row('8a__MATH', 2, 2), row('8a__MATH', 2, 7)], PERIODS);
    expect(b.map(x => [x.label, x.size])).toEqual([['P1–P2', 2], ['P7', 1]]);
  });

  it('different subjects next to each other are not joined; days are separate', () => {
    const b = groupIntoBlocks(
      [row('8a__MATH', 1, 1), row('8a__ENG', 1, 2), row('8a__MATH', 2, 2), row('8a__MATH', 1, 2, '8a')].slice(0, 3),
      PERIODS,
    );
    expect(b.map(x => `${x.dayOfWeek}:${x.subject}:${x.label}`)).toEqual(['1:MATH:P1', '1:ENG:P2', '2:MATH:P2']);
  });

  it('duplicate rows for the same period count once', () => {
    const b = groupIntoBlocks([row('8a__MATH', 1, 1), row('8a__MATH', 1, 1)], PERIODS);
    expect(b[0].size).toBe(1);
  });
});

describe('nowAndNext', () => {
  const blocks = groupIntoBlocks([row('8a__MATH', 1, 5), row('8a__MATH', 1, 6), row('9b__MATH', 1, 8)], PERIODS);
  const at = (hhmm: string) => new Date(`2026-10-12T${hhmm}:00`);

  it('inside the second half of a double is still the double', () => {
    const r = nowAndNext(blocks, at('11:10'));
    expect(r.current?.label).toBe('P5–P6');
    expect(r.minutesLeft).toBe(30);
    expect(r.next?.className).toBe('9B');
  });
  it('a free period shows the next lesson and how long until it', () => {
    const r = nowAndNext(blocks, at('11:50'));
    expect(r.current).toBeNull();
    expect(r.next?.label).toBe('P8');
    expect(r.minutesToNext).toBe(30);
  });
  it('edges: start minute is in, end minute is out', () => {
    expect(nowAndNext(blocks, at('10:20')).current?.label).toBe('P5–P6');
    expect(nowAndNext(blocks, at('11:40')).current).toBeNull();
  });
  it('after the last lesson the day is over', () => {
    const r = nowAndNext(blocks, at('16:00'));
    expect(r.current).toBeNull();
    expect(r.next).toBeNull();
    expect(r.dayOver).toBe(true);
  });
});

describe('checkClashes', () => {
  const teachers = new Map([
    ['8a__MATH', [{ id: 'T1', name: 'Mr Phiri' }]],
    ['8b__MATH', [{ id: 'T1', name: 'Mr Phiri' }]],
    ['8a__ENG', [{ id: 'T2', name: 'Ms Banda' }]],
    ['9a__BIO', [{ id: 'T3', name: 'Mr Lungu' }, { id: 'T2', name: 'Ms Banda' }]], // T2 covers
  ]);
  const ctx = (live: RowLike[], replace: string[] = []) => ({
    live, teachersBySlot: teachers, replaceSlotIds: new Set(replace), periods: PERIODS,
  });

  it('class clash with another teacher already live', () => {
    const c = checkClashes([row('8a__MATH', 1, 1)], ctx([row('8a__ENG', 1, 1)]));
    expect(c.map(x => x.kind)).toEqual(['class-clash']);
    expect(c[0].message).toContain('8A would have ENG and MATH on Monday P1');
  });
  it('teacher clash across classes', () => {
    const c = checkClashes([row('8b__MATH', 2, 4)], ctx([row('8a__MATH', 2, 4)]));
    expect(c.map(x => x.kind)).toEqual(['teacher-clash']);
    expect(c[0].message).toContain('Mr Phiri');
  });
  it('teacher clash through a cover teacher', () => {
    const c = checkClashes([row('8a__ENG', 3, 1)], ctx([row('9a__BIO', 3, 1)]));
    expect(c.map(x => x.kind)).toEqual(['teacher-clash']);
    expect(c[0].message).toContain('Ms Banda');
  });
  it('clash inside the proposal itself', () => {
    const c = checkClashes([row('8a__MATH', 1, 1), row('8b__MATH', 1, 1)], ctx([]));
    expect(c.map(x => x.kind)).toEqual(['teacher-clash']);
  });
  it('live rows of subjects being replaced are ignored (moving a lesson)', () => {
    expect(checkClashes([row('8a__MATH', 1, 2)], ctx([row('8a__MATH', 1, 1)], ['8a__MATH']))).toEqual([]);
    expect(checkClashes([row('8a__MATH', 1, 1)], ctx([row('8a__MATH', 1, 1)], ['8a__MATH']))).toEqual([]);
  });
  it('break, lunch and unknown periods are not lessons', () => {
    const c = checkClashes([row('8a__MATH', 1, 0), row('8a__MATH', 1, 9)], ctx([]));
    expect(c.map(x => x.kind)).toEqual(['not-lesson', 'not-lesson']);
  });
  it('a full clean week has no clashes', () => {
    const rows = [1, 2, 3, 4, 5].flatMap(d => [row('8a__MATH', d as 1, 1), row('8a__MATH', d as 1, 2), row('8a__ENG', d as 1, 4)]);
    expect(checkClashes(rows, ctx([]))).toEqual([]);
  });
});

describe('helpers', () => {
  it('legacy doubles occupy the next lesson only when no break is between', () => {
    expect(legacyDoubleOrders(1, PERIODS)).toEqual([1, 2]);
    expect(legacyDoubleOrders(4, PERIODS)).toEqual([4]);
    expect(legacyDoubleOrders(8, PERIODS)).toEqual([8]);
  });
  it('lesson periods skip breaks; weekdayOf handles weekends', () => {
    expect(lessonPeriods(PERIODS).map(p => p.name)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']);
    expect(weekdayOf('2026-10-12')).toBe(1);
    expect(weekdayOf('2026-10-10')).toBeNull();
  });
});

import { cellBlockers } from './timetableModel';
describe('cellBlockers', () => {
  const teachers = new Map([
    ['8a__MATH', [{ id: 'T1', name: 'T1' }]],
    ['8b__MATH', [{ id: 'T1', name: 'T1' }]],
    ['8a__ENG', [{ id: 'T2', name: 'T2' }]],
  ]);
  it('locks cells taken by another subject of the class and by my other classes', () => {
    const ctx = { live: [row('8a__ENG', 1, 1), row('8a__MATH', 2, 2)], teachersBySlot: teachers,
      replaceSlotIds: new Set(['8a__MATH', '8b__MATH']), periods: PERIODS };
    const m = cellBlockers(
      { slotId: '8a__MATH', classId: '8a', className: '8A', subject: 'MATH' },
      [row('8b__MATH', 3, 4)],
      ctx,
    );
    expect(m.get('1:1')).toBe('ENG is on');
    expect(m.get('3:4')).toBe('8B MATH');
    expect(m.has('2:2')).toBe(false); // my own live row of the subject being edited
    expect(m.size).toBe(2);
  });
});

import { planSchoolBell, SCHOOL_BELL } from './timetableModel';
describe('school bell schedule (P1–P4 07:20–10:00, Break 10:00–10:20, P5–P8 to 13:00)', () => {
  const P = (id: string, order: number, name: string, kind: any, s: string, e: string, isActive = true) =>
    ({ id, order, name, kind, startTime: s, endTime: e, academicYear: 2026, isActive });
  // The schedule the earlier app version seeded.
  const OLD = [
    P('a', 1, 'P1', 'lesson', '07:30', '08:20'), P('b', 2, 'P2', 'lesson', '08:20', '09:10'),
    P('c', 3, 'Break', 'break', '09:10', '09:30'), P('d', 4, 'P3', 'lesson', '09:30', '10:20'),
    P('e', 5, 'P4', 'lesson', '10:20', '11:10'), P('f', 6, 'Lunch', 'lunch', '11:10', '12:00'),
    P('g', 7, 'P5', 'lesson', '12:00', '12:50'), P('h', 8, 'P6', 'lesson', '12:50', '13:40'),
    P('i', 9, 'P7', 'lesson', '13:40', '14:30'), P('j', 10, 'P8', 'lesson', '14:30', '15:20'),
  ];
  it('the fixed schedule is exactly the school day', () => {
    expect(SCHOOL_BELL.map(r => `${r.name} ${r.startTime}-${r.endTime}`)).toEqual([
      'P1 07:20-08:00', 'P2 08:00-08:40', 'P3 08:40-09:20', 'P4 09:20-10:00', 'Break 10:00-10:20',
      'P5 10:20-11:00', 'P6 11:00-11:40', 'P7 11:40-12:20', 'P8 12:20-13:00',
    ]);
    expect(lessonPeriods(PERIODS).map(p => p.name)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']);
  });
  it('the old schedule is mapped lesson by lesson; lunch switched off; break moved', () => {
    const plan = planSchoolBell(OLD as any);
    expect(plan.upToDate).toBe(false);
    expect([...plan.remap.entries()]).toEqual([[4, 3], [5, 4], [7, 5], [8, 6], [9, 7], [10, 8]]);
    expect(plan.dropped).toEqual([]);
    expect(plan.creates).toEqual([]);
    const set = Object.fromEntries(plan.updates.map(u => [u.id, u.set]));
    expect(set.c).toMatchObject({ name: 'Break', startTime: '10:00', endTime: '10:20', order: 0 });
    expect(set.f).toEqual({ isActive: false, order: 0 });
    expect(set.j).toMatchObject({ name: 'P8', startTime: '12:20', endTime: '13:00', order: 8 });
  });
  it('a 9th lesson is switched off and its number dropped; missing rows are created', () => {
    const extra = [...PERIODS.map(p => ({ ...p })), P('x', 9, 'P9', 'lesson', '12:40', '13:00')] as any;
    const plan = planSchoolBell(extra);
    expect(plan.dropped).toEqual([9]);
    expect(planSchoolBell([P('only', 1, 'P1', 'lesson', '07:20', '08:00')] as any).creates.map(r => r.name))
      .toEqual(['P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'Break']);
  });
  it('the school schedule needs no change; nothing before 07:20 or after 13:00 is a period', () => {
    expect(planSchoolBell(PERIODS)).toMatchObject({ upToDate: true });
    const outside = [...PERIODS, P('e1', 9, 'Early', 'lesson', '06:40', '07:20'), P('l1', 10, 'Late', 'lesson', '13:00', '13:40')];
    expect(lessonPeriods(outside as any)).toHaveLength(8);
  });
});
