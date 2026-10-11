import { describe, it, expect } from 'vitest';
import {
  alumniStudentId,
  buildPromotionPlan,
  defaultClassMap,
  DEFAULT_SETTINGS,
  nextLevelOf,
  suggestedArchive,
} from './promotionPlan';
import type { ClassRef, PlanLearner } from '@/types/promotion';

const cls = (id: string, type: 'grade' | 'form', level: number, section: string, learnerCount = 0, isActive = true): ClassRef => ({
  id, name: `${type === 'grade' ? 'Grade' : 'Form'} ${level}${section}`, type, level, section, isActive, learnerCount,
});
const lr = (id: string, classId: string, studentId: string, extra: Partial<PlanLearner> = {}): PlanLearner => ({
  id, fullName: `Learner ${id}`, classId, studentId, studentIndex: Number(studentId.split('_')[1]), status: 'active', ...extra,
});

const settings = DEFAULT_SETTINGS(2026);

describe('nextLevelOf', () => {
  it('moves forms and grades up and graduates the final year', () => {
    expect(nextLevelOf('form', 1, settings)).toEqual({ type: 'form', level: 2 });
    expect(nextLevelOf('form', 4, settings)).toBe('graduate');
    expect(nextLevelOf('form', 4, { ...settings, finalFormLevel: 5 })).toEqual({ type: 'form', level: 5 });
    expect(nextLevelOf('grade', 11, settings)).toEqual({ type: 'grade', level: 12 });
    expect(nextLevelOf('grade', 12, settings)).toBe('graduate');
  });
});

describe('defaultClassMap', () => {
  it('maps each stream to the same stream one level up, creating missing classes', () => {
    const classes = [cls('F1A', 'form', 1, 'A', 30), cls('F2A', 'form', 2, 'A', 28), cls('F3A', 'form', 3, 'A', 25), cls('G12A', 'grade', 12, 'A', 40), cls('G11A', 'grade', 11, 'A', 35), cls('F1B', 'form', 1, 'B', 0)];
    const { map, newClasses } = defaultClassMap(classes, settings);
    expect(map.F1A).toEqual({ kind: 'class', classId: 'F2A' });
    expect(map.G11A).toEqual({ kind: 'class', classId: 'G12A' });
    expect(map.G12A).toEqual({ kind: 'graduate' });
    // No Form 4 yet → created.
    expect(map.F3A).toEqual({ kind: 'class', classId: 'new:form-4-A' });
    expect(newClasses).toEqual([{ tempId: 'new:form-4-A', name: 'Form 4A', type: 'form', level: 4, section: 'A' }]);
    // Empty class with no next class: nothing to create.
    expect(map.F1B).toBeUndefined();
  });

  it('re-uses an archived class instead of creating a duplicate', () => {
    const classes = [cls('F3A', 'form', 3, 'A', 10), cls('F4A-old', 'form', 4, 'A', 0, false)];
    const { map, newClasses } = defaultClassMap(classes, settings);
    expect(map.F3A).toEqual({ kind: 'class', classId: 'F4A-old' });
    expect(newClasses).toEqual([]);
  });
});

describe('buildPromotionPlan', () => {
  const classes = [cls('F1A', 'form', 1, 'A', 3), cls('F2A', 'form', 2, 'A', 2), cls('G11A', 'grade', 11, 'A', 2), cls('G12A', 'grade', 12, 'A', 2)];
  const learners: PlanLearner[] = [
    lr('a', 'F1A', 'F1A_001'),
    lr('b', 'F1A', 'F1A_002'),
    lr('c', 'F1A', 'F1A_003'),
    lr('d', 'F2A', 'F2A_001'),
    lr('e', 'F2A', 'F2A_002'),
    lr('g', 'G11A', 'G11A_001'),
    lr('h', 'G11A', 'G11A_007'),
    lr('i', 'G12A', 'G12A_001'),
    lr('j', 'G12A', 'G12A_007'),
    // Already gone: keep their id but are not planned.
    lr('z', 'G12A', 'G12A_002-2025', { status: 'graduated', studentIndex: 2 }),
  ];
  const base = () => {
    const { map, newClasses } = defaultClassMap(classes, settings);
    return { settings, classes, learners, map, newClasses };
  };

  it('promotes, graduates the final year, and keeps learners\' numbers', () => {
    const plan = buildPromotionPlan(base());
    const by = Object.fromEntries(plan.items.map(i => [i.learnerId, i]));
    expect(by.a).toMatchObject({ action: 'promote', toClassId: 'F2A', toStudentId: 'F2A_001' });
    expect(by.c).toMatchObject({ toStudentId: 'F2A_003', toStudentIndex: 3 });
    // F2A cohort moves on to Form 3A (created).
    expect(by.d).toMatchObject({ toClassId: 'new:form-3-A', toClassName: 'Form 3A', toStudentId: 'F3A_001' });
    // G11 → G12 take the numbers the graduates leave free.
    expect(by.h).toMatchObject({ toClassId: 'G12A', toStudentId: 'G12A_007' });
    // Graduates keep their id with the year added.
    expect(by.j).toMatchObject({ action: 'graduate', outcome: 'graduated', toStudentId: 'G12A_007-2026' });
    expect(plan.counts).toEqual({ promote: 7, repeat: 0, graduate: 2, leave: 0, stay: 0 });
    expect(plan.newClasses.map(n => n.name)).toEqual(['Form 3A']);
    expect(plan.issues.filter(i => i.level === 'error')).toEqual([]);
  });

  it('gives a new number when the old one is taken by a repeater', () => {
    const plan = buildPromotionPlan({ ...base(), decisions: { d: { action: 'repeat' } } });
    const by = Object.fromEntries(plan.items.map(i => [i.learnerId, i]));
    expect(by.d).toMatchObject({ action: 'repeat', toClassId: 'F2A', toStudentId: 'F2A_001' });
    // a wanted F2A_001 (taken by the repeater) → next free number.
    expect(by.b.toStudentId).toBe('F2A_002');
    expect(by.c.toStudentId).toBe('F2A_003');
    expect(by.a.toStudentId).toBe('F2A_004');
    const ids = plan.items.filter(i => i.toClassId === 'F2A').map(i => i.toStudentId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never reuses an id held by a learner outside the plan', () => {
    const extra = [...learners, lr('old', 'F2A', 'F2A_003', { status: 'archived' })];
    const plan = buildPromotionPlan({ ...base(), learners: extra });
    const c = plan.items.find(i => i.learnerId === 'c')!;
    expect(c.toStudentId).not.toBe('F2A_003');
    expect(c.toStudentId).toBe('F2A_004');
  });

  it('leavers keep their id with the year and the reason', () => {
    const plan = buildPromotionPlan({ ...base(), decisions: { b: { action: 'leave', reason: 'Transferred to Mongu' } } });
    const b = plan.items.find(i => i.learnerId === 'b')!;
    expect(b).toMatchObject({ action: 'leave', outcome: 'left', toStudentId: 'F1A_002-2026', reason: 'Transferred to Mongu' });
  });

  it('skips learners already placed in the new year and keeps new-year admissions in place', () => {
    const extra = [
      ...learners,
      lr('n1', 'F1A', 'F1A_010', { academicYear: 2027 }),
      lr('n2', 'F1A', 'F1A_011', { dateOfFirstEntry: '2027-01-12' }),
    ];
    const plan = buildPromotionPlan({ ...base(), learners: extra });
    expect(plan.skipped.map(s => s.learnerId)).toEqual(['n1']);
    const n2 = plan.items.find(i => i.learnerId === 'n2')!;
    expect(n2).toMatchObject({ action: 'stay', toClassId: 'F1A', toStudentId: 'F1A_011' });
    const f1 = plan.classSummaries.find(s => s.classId === 'F1A')!;
    expect(f1).toMatchObject({ before: 5, after: 2, outgoing: 3 });
  });

  it('flags promote with no next class as an error', () => {
    const plan = buildPromotionPlan({ ...base(), decisions: { j: { action: 'promote' } } });
    expect(plan.issues.some(i => i.level === 'error' && i.learnerId === 'j')).toBe(true);
  });

  it('class summaries add up and suggest archiving empty non-intake classes', () => {
    const plan = buildPromotionPlan(base());
    const s = Object.fromEntries(plan.classSummaries.map(x => [x.classId, x]));
    expect(s.F1A).toMatchObject({ before: 3, after: 0 });
    expect(s.F2A).toMatchObject({ before: 2, after: 3, incoming: 3, outgoing: 2 });
    expect(s.G12A).toMatchObject({ before: 2, after: 2 });
    expect(s.G11A.after).toBe(0);
    // Form 1 is an intake level (new Form 1s arrive) → not suggested.
    expect(suggestedArchive(plan)).toEqual(['G11A']);
  });

  it('learners in archived classes are not moved', () => {
    const plan = buildPromotionPlan({ ...base(), classes: [...classes, cls('X', 'form', 2, 'Z', 1, false)], learners: [...learners, lr('x', 'X', 'F2Z_001')] });
    expect(plan.skipped.find(s => s.learnerId === 'x')?.reason).toMatch(/archived/);
  });
});

describe('alumniStudentId', () => {
  it('adds the year once', () => {
    expect(alumniStudentId('G12A_007', 2026)).toBe('G12A_007-2026');
    expect(alumniStudentId('G12A_007-2026', 2027)).toBe('G12A_007-2026');
  });
});
