// Award certificates: the overall top three per class and per grade level.
import { describe, it, expect } from 'vitest';
import {
  computeAwards,
  topThree,
  serialFor,
  testsLabel,
  toCertificates,
  type ClassStanding,
  type LearnerStanding,
} from '@/services/awardsService';

const L = (learnerId: string, overallPercentage: number, extra: Partial<LearnerStanding> = {}): LearnerStanding => ({
  learnerId, name: learnerId.toUpperCase(), overallPercentage, overallGrade: 1,
  isComplete: true, hasAnyMarks: true, ...extra,
});

const classes: ClassStanding[] = [
  { classId: 'f2a', className: 'Form 2A', type: 'form', level: 2, learners: [L('a', 88), L('b', 75), L('c', 70), L('x', 95, { isComplete: false })] },
  { classId: 'f2b', className: 'Form 2B', type: 'form', level: 2, learners: [L('d', 80), L('e', 39), L('n', 0, { hasAnyMarks: false })] },
  { classId: 'g11a', className: 'Grade 11A', type: 'grade', level: 11, learners: [L('f', 66)] },
];

const cand = (id: string, p: number) => ({ ...L(id, p), className: 'Form 2A' });

describe('topThree', () => {
  it('ties share a position and the next position is skipped (like report cards)', () => {
    const w = topThree([cand('a', 82), cand('b', 82), cand('c', 80), cand('d', 75)]);
    expect(w.map(x => [x.learnerId, x.position, x.tied])).toEqual([['a', 1, true], ['b', 1, true], ['c', 3, false]]);
  });

  it('a tie for third includes everyone on that mark', () => {
    expect(topThree([cand('a', 90), cand('b', 80), cand('c', 70), cand('d', 70)]).map(x => x.position)).toEqual([1, 2, 3, 3]);
  });
});

describe('computeAwards', () => {
  const groups = computeAwards(classes);
  const byId = (id: string) => groups.find(g => g.id === id)!;

  it('ranks each class on the overall percentage', () => {
    expect(byId('class:f2a').winners.map(w => [w.learnerId, w.position])).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });

  it('leaves out learners with pending tests, and counts them', () => {
    expect(byId('class:f2a').winners.some(w => w.learnerId === 'x')).toBe(false);
    expect(byId('class:f2a').pendingCount).toBe(1);
  });

  it('never awards a fail (below 40%)', () => {
    expect(byId('class:f2b').winners.map(w => w.learnerId)).toEqual(['d']);
  });

  it('ranks a grade level across all its classes', () => {
    const level = byId('level:form-2');
    expect(level.groupLabel).toBe('Form 2');
    expect(level.winners.map(w => [w.learnerId, w.className, w.position])).toEqual([
      ['a', 'Form 2A', 1], ['d', 'Form 2B', 2], ['b', 'Form 2A', 3],
    ]);
    expect(byId('level:grade-11').winners[0].learnerId).toBe('f');
  });

  it('lists grade levels first, Form before Grade', () => {
    expect(groups.map(g => g.id)).toEqual(['level:form-2', 'level:grade-11', 'class:f2a', 'class:f2b', 'class:g11a']);
  });

  it('can do one scope only', () => {
    expect(computeAwards(classes, { scopes: ['level'] }).every(g => g.scope === 'level')).toBe(true);
  });
});

describe('certificates', () => {
  it('serials are stable and joint winners get a letter', () => {
    const [g] = computeAwards(
      [{ classId: 'f2a', className: 'Form 2A', type: 'form', level: 2, learners: [L('a', 90), L('b', 90)] }],
      { scopes: ['class'] },
    );
    expect(g.winners.map(w => serialFor(g, w, 'Term 3', 2026))).toEqual(['KBS/2026/T3/F2A/1-a', 'KBS/2026/T3/F2A/1-b']);
  });

  it('unticked winners are not printed', () => {
    const groups = computeAwards(classes, { scopes: ['class'] }).filter(g => g.id === 'class:f2a');
    expect(toCertificates(groups, 'Term 3', 2026, (_g, w) => w.learnerId !== 'b').map(c => c.learnerName)).toEqual(['A', 'C']);
  });

  it('describes the tests', () => {
    expect(testsLabel(['Week 4', 'Week 8', 'End of Term'])).toBe('Week 4, Week 8 and End of Term tests');
    expect(testsLabel(['End of Term'])).toBe('End of Term tests');
  });
});
