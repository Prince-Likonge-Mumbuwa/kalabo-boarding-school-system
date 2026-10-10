import { describe, it, expect } from 'vitest';
import { buildRollup, buildRollupsForRange, computeStudentIndex } from './attendanceMath';

const ses = (o: any) => ({
  id: 'x', className: '8A', markedBy: 'T', markedByName: 'T', markedAt: new Date(), schemaVersion: 1,
  summary: { total: 1, present: 1, absent: 0, late: 0, excused: 0 }, ...o,
});

describe('attendance math', () => {
  it('range rollups keep class ids that contain "_"', () => {
    const r = buildRollupsForRange([ses({ classId: 'grade_8a', date: '2026-10-12', kind: 'daily', roster: { s: 'present' } })] as any, []);
    expect([r[0].classId, r[0].date]).toEqual(['grade_8a', '2026-10-12']);
  });

  it('late arrival uses the day’s first lesson, even when it is not period 1', () => {
    const day = [
      ses({ classId: 'c', date: 'd', kind: 'daily', roster: { s1: 'absent' } }),
      ses({ classId: 'c', date: 'd', kind: 'periodic', period: 4, subject: 'Maths', roster: { s1: 'present' } }),
      ses({ classId: 'c', date: 'd', kind: 'periodic', period: 2, subject: 'English', roster: { s1: 'present' } }),
    ];
    const r = buildRollup('c', '8A', 'd', day as any, new Map());
    expect(r.lateArrivals.map(l => l.firstPeriodSubject)).toEqual(['English']);
    const idx = computeStudentIndex('s1', 'S', 'c', '8A', day as any, 'd');
    expect(idx.recentLate.map(l => l.firstPeriodSubject)).toEqual(['English']);
  });
});
