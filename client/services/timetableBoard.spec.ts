import { describe, it, expect } from 'vitest';
import { summarizeBoard, classesInPeriod, teacherDay } from './timetableBoard';
import { lessonPeriodAt } from './timetableModel';
import { PERIODS } from '../test/timetableFixtures';

const l = (p: number, status: any, teacher: string) =>
  ({ status, markedByName: null, row: { entry: { periodIndex: p }, operatorTeacherName: teacher } }) as any;
const classes = [
  { classId: '8a', className: '8A', dailyTaken: true, dailyMarkedByName: 'FT', lessons: [l(1, 'taken', 'Mr Phiri'), l(2, 'missed', 'Mr Phiri')] },
  { classId: '8b', className: '8B', dailyTaken: false, dailyMarkedByName: null, lessons: [l(1, 'in-progress', 'Ms Banda'), l(4, 'uncovered', 'Mr Lungu')] },
] as any;

describe('board helpers', () => {
  it('summary counts every status and daily registers', () => {
    expect(summarizeBoard(classes)).toEqual({
      lessons: 4, taken: 1, inProgress: 1, missed: 1, uncovered: 1, upcoming: 0, dailyTaken: 1, classes: 2,
    });
  });
  it('what each class has in a period (free = null)', () => {
    expect(classesInPeriod(classes, 2).map(x => x.lesson?.status ?? 'free')).toEqual(['missed', 'free']);
  });
  it('teacher lookup by name', () => {
    const r = teacherDay(classes, 'phiri');
    expect(r).toHaveLength(1);
    expect(r[0].lessons.map((x: any) => x.row.entry.periodIndex)).toEqual([1, 2]);
    expect(teacherDay(classes, 'p')).toEqual([]);
  });
  it('period at a time: running, between (next), after school (last)', () => {
    const at = (t: string) => new Date(`2026-10-12T${t}:00`);
    expect(lessonPeriodAt(PERIODS, at('08:30'))).toMatchObject({ period: { name: 'P2' }, running: true });
    expect(lessonPeriodAt(PERIODS, at('10:05'))).toMatchObject({ period: { name: 'P5' }, running: false }); // break
    expect(lessonPeriodAt(PERIODS, at('14:00'))).toMatchObject({ period: { name: 'P8' }, running: false }); // after 13:00
  });
});
