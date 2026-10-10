// Data check: finds the problems, and each fix changes only what it reports.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('firebase/firestore', async () => await import('../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'ADMIN' } }) }));

import { resetStore, getDocData } from '../test/fakeFirestore';
import {
  runDataCheck,
  fixMissingLearnerStatus,
  fixMissingStudentIndex,
  fixMissingNormalizedSubject,
  moveWrongTermGroup,
  enableAuthorityEnforcement,
} from './resultsDataCheck';

const row = (id: string, extra: Record<string, any>) => ({
  [id]: { classId: 'C1', subjectId: 'Mathematics', examType: 'week4', marks: 10, totalMarks: 50, percentage: 20, ...extra },
});

beforeEach(() => {
  resetStore({
    classes: { C1: { name: 'Form 1A' } },
    system: { assignmentEngine: { migratedAt: 'x' } },
    learners: {
      a: { classId: 'C1', fullName: 'A', studentId: 'F1A_001', status: 'active', studentIndex: 1 },
      b: { classId: 'C1', fullName: 'B', studentId: 'F1A_001', studentIndex: 2 },          // no status, duplicate id
      c: { classId: 'C1', fullName: 'C', status: 'active' },                              // no index, no custom id
      z: { classId: 'C1', fullName: 'Z', studentId: 'F1A_099', status: 'archived', studentIndex: 9 },
    },
    results: {
      // Saved during Term 3 2026 but filed as Term 1 2026
      ...row('a_Mathematics_week4_Term1_2026', { studentId: 'a', term: 'Term 1', year: 2026, createdAt: '2026-10-01T08:00:00Z' }),
      // Legit Term 1 row (saved in Term 1), missing normalizedSubject
      ...row('b_Mathematics_endOfTerm_Term1_2026', { studentId: 'b', examType: 'endOfTerm', term: 'Term 1', year: 2026, createdAt: '2026-03-01T08:00:00Z' }),
      // Archived learner's row
      ...row('z_Mathematics_week4_Term1_2026', { studentId: 'z', term: 'Term 1', year: 2026, createdAt: '2026-03-01T08:00:00Z', normalizedSubject: 'Mathematics' }),
    },
  });
});

describe('data check', () => {
  it('reports every problem without writing anything', async () => {
    const r = await runDataCheck('Term 1', 2026);
    expect(r.learners.missingStatus.map(l => l.id)).toEqual(['b']);
    expect(r.learners.missingStudentIndex.map(l => l.id)).toEqual(['c']);
    expect(r.learners.missingStudentId.map(l => l.id)).toEqual(['c']);
    expect(r.learners.duplicateStudentIds).toEqual([{ studentId: 'F1A_001', learnerIds: ['a', 'b'] }]);
    expect(r.results.missingNormalizedSubject.sort()).toEqual(['a_Mathematics_week4_Term1_2026', 'b_Mathematics_endOfTerm_Term1_2026']);
    expect(r.results.offRoster.map(o => o.id)).toEqual(['z_Mathematics_week4_Term1_2026']);
    expect(r.results.wrongTerm).toHaveLength(1);
    expect(r.results.wrongTerm[0].savedDuring).toEqual({ term: 'Term 3', year: 2026 });
    expect(r.results.wrongTerm[0].resultIds).toEqual(['a_Mathematics_week4_Term1_2026']);
    expect(r.engine).toEqual({ migrated: true, enforceAuthority: false });
  });

  it('January saves for Term 3 of the previous year are not flagged', async () => {
    resetStore({
      classes: { C1: { name: 'Form 1A' } },
      learners: { a: { classId: 'C1', fullName: 'A', status: 'active', studentIndex: 1 } },
      results: row('a_x', { studentId: 'a', term: 'Term 3', year: 2025, createdAt: '2026-01-20T08:00:00Z', normalizedSubject: 'Mathematics' }),
    });
    const r = await runDataCheck('Term 3', 2025);
    expect(r.results.wrongTerm).toHaveLength(0);
  });

  it('fixes change only what they report', async () => {
    await fixMissingLearnerStatus(['b']);
    expect(getDocData('learners', 'b')!.status).toBe('active');
    expect(getDocData('learners', 'z')!.status).toBe('archived');

    await fixMissingStudentIndex([{ id: 'c', classId: 'C1' }]);
    expect(getDocData('learners', 'c')!.studentIndex).toBe(10); // after the highest (9)

    expect(await fixMissingNormalizedSubject(['b_Mathematics_endOfTerm_Term1_2026'])).toBe(1);
    expect(getDocData('results', 'b_Mathematics_endOfTerm_Term1_2026')!.normalizedSubject).toBe('Mathematics');
  });

  it('moves a wrong-term group, and refuses when it would overwrite', async () => {
    const r = await runDataCheck('Term 1', 2026);
    const g = r.results.wrongTerm[0];
    expect(await moveWrongTermGroup(g)).toBe(1);
    expect(getDocData('results', 'a_Mathematics_week4_Term1_2026')).toBeUndefined();
    const moved = getDocData('results', 'a_Mathematics_week4_Term3_2026')!;
    expect(moved.term).toBe('Term 3');
    expect(moved.marks).toBe(10);
    expect(moved.movedFrom).toBe('Term 1 2026');

    await expect(moveWrongTermGroup({ ...g, conflicts: 2 })).rejects.toThrow(/nothing was moved/);
  });

  it('will not switch on enforcement while rows lack normalizedSubject', async () => {
    await expect(enableAuthorityEnforcement()).rejects.toThrow(/lack normalizedSubject/);
    await fixMissingNormalizedSubject(['a_Mathematics_week4_Term1_2026', 'b_Mathematics_endOfTerm_Term1_2026']);
    await enableAuthorityEnforcement();
    expect(getDocData('system', 'assignmentEngine')!.enforceAuthority).toBe(true);
    expect(getDocData('system', 'assignmentEngine')!.migratedAt).toBe('x'); // merged, not replaced
  });
});
