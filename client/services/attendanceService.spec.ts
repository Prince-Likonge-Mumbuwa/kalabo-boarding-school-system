import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('firebase/firestore', async () => await import('../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}), onAuthStateChanged: () => () => {} }));

import { resetStore, store, writeLog } from '../test/fakeFirestore';
import { teacherWriteAllowed, type TtRulesEnv } from '../test/timetableRulesModel';
import { attendanceService } from './attendanceService';

const slots = {
  '8a__MATH': { classId: '8a', normalizedSubject: 'MATH', ownerTeacherId: 'T1',
    delegateTeacherId: 'T3', delegateStart: new Date('2026-10-01'), delegateEnd: new Date('2026-10-30') },
  '8a__form-teacher': { classId: '8a', normalizedSubject: 'form-teacher', ownerTeacherId: 'FT' },
};
const env = (uid: string, enforceAuthority = true): TtRulesEnv => ({ uid, enforceAuthority, slots, now: new Date('2026-10-12T10:00:00') });
const block = (by: string) =>
  [7, 8].map(period => ({
    classId: '8a', className: '8A', date: '2026-10-12', kind: 'periodic' as const, subject: 'Mathematics',
    period, slotId: '8a__MATH', normalizedSubject: 'MATH', roster: { s1: 'present' as const }, markedBy: by, markedByName: by,
  }));
const lastWrites = (from: number) => writeLog.slice(from).map(w => [w.op, w.before, w.after] as const);

beforeEach(() => {
  resetStore({ class_slots: slots });
  writeLog.length = 0;
});

describe('attendance registers', () => {
  it('a double lesson saves one register per period, with subject key and slot id', async () => {
    await attendanceService.markSessions(block('T3'));
    const docs = [...store.get('attendance_sessions')!.values()];
    expect(docs.map((d: any) => d.period)).toEqual([7, 8]);
    expect(docs.every((d: any) => d.slotId === '8a__MATH' && d.normalizedSubject === 'MATH')).toBe(true);
  });

  it('rules: periods 7 and 8 are allowed, 9 is not (only P1–P8); the live cover may save', async () => {
    const from = writeLog.length;
    await attendanceService.markSessions(block('T3'));
    for (const [op, b, a] of lastWrites(from)) expect(teacherWriteAllowed(env('T3'), 'attendance_sessions', op, b, a)).toBe(true);
    const [, b9, a9] = lastWrites(from)[0];
    expect(teacherWriteAllowed(env('T3'), 'attendance_sessions', 'set', b9, { ...a9, period: 9 })).toBe(false);
  });

  it('rules: owner and cover can edit each other’s register; an unrelated teacher cannot', async () => {
    await attendanceService.markSessions(block('T1'));
    const from = writeLog.length;
    await attendanceService.markSessions(block('T3'));
    for (const [op, b, a] of lastWrites(from)) {
      expect(teacherWriteAllowed(env('T3'), 'attendance_sessions', op, b, a)).toBe(true);
      expect(teacherWriteAllowed(env('T9'), 'attendance_sessions', op, b, { ...a, markedBy: 'T9' })).toBe(false);
    }
  });

  it('rules: creating a register for a subject you do not teach is refused once enforced', async () => {
    const from = writeLog.length;
    await attendanceService.markSessions(block('T9'));
    for (const [op, b, a] of lastWrites(from)) {
      expect(teacherWriteAllowed(env('T9'), 'attendance_sessions', op, b, a)).toBe(false);
      expect(teacherWriteAllowed(env('T9', false), 'attendance_sessions', op, b, a)).toBe(true);
    }
  });

  it('daily register carries the form class slot; old registers without a slot stay marker-only', async () => {
    const from = writeLog.length;
    await attendanceService.markSession({ classId: '8a', className: '8A', date: '2026-10-12', kind: 'daily',
      roster: { s1: 'present' }, markedBy: 'FT', markedByName: 'FT' });
    const [[op, b, a]] = lastWrites(from);
    expect(a!.slotId).toBe('8a__form-teacher');
    expect(teacherWriteAllowed(env('FT'), 'attendance_sessions', op, b, a)).toBe(true);
    const old = { ...a, slotId: undefined, markedBy: 'X' };
    delete (old as any).slotId;
    expect(teacherWriteAllowed(env('FT'), 'attendance_sessions', 'update', old, { ...a, markedBy: 'FT' })).toBe(false);
  });

  it('deleting a block removes every period', async () => {
    await attendanceService.markSessions(block('T1'));
    const n = await attendanceService.deleteSessions(
      [7, 8].map(period => ({ classId: '8a', date: '2026-10-12', kind: 'periodic' as const, subject: 'Mathematics', period })),
    );
    expect(n).toBe(2);
    expect(store.get('attendance_sessions')!.size).toBe(0);
  });

  it('learner index includes learners with no status, skips archived', async () => {
    resetStore({ learners: { a: { classId: '8a', fullName: 'A', status: 'active' }, b: { classId: '8a', fullName: 'B' }, c: { classId: '8a', fullName: 'C', status: 'archived' } } });
    expect((await attendanceService.getActiveLearnersIndexed()).map(l => l.id).sort()).toEqual(['a', 'b']);
  });
});
