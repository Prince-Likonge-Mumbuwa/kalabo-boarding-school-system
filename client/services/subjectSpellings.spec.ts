// The same subject saved under different spellings ("PRINCIPLES OF ACCOUNTS"
// / "Principles of Accounts" / "Priciples of Accounts") is ONE subject on
// every screen, and Results Data Check saves the marks under one spelling.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('firebase/firestore', async () => await import('../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'ADMIN' } }) }));

import { resetStore, store, getDocData } from '../test/fakeFirestore';
import { resultsService } from './resultsService';
import { findSubjectSpellings, fixSubjectSpellings, fixMissingNormalizedSubject } from './resultsDataCheck';

const TERM = 'Term 3';
const YEAR = 2026;
const learner = (id: string, n: number) => ({ [id]: { classId: 'C1', studentId: `F1A_00${n}`, fullName: id, status: 'active', studentIndex: n } });
const mark = (student: string, subjectId: string, examType: string, marks: number, updatedAt: string, extra: Record<string, any> = {}) => ({
  [`${student}_${subjectId}_${examType}_Term3_2026`]: {
    studentId: student, classId: 'C1', subjectId, subjectName: subjectId, normalizedSubject: 'Principles of Accounts',
    examType, term: TERM, year: YEAR, marks, totalMarks: 100, percentage: marks, updatedAt, ...extra,
  },
});

beforeEach(() => {
  resetStore({
    system: { assignmentEngine: { migratedAt: 'x' } },
    classes: { C1: { name: 'Form 1A', level: 1, isActive: true } },
    learners: { ...learner('docA', 1), ...learner('docB', 2), ...learner('docC', 3) },
    class_slots: {
      'C1__Principles of Accounts': { classId: 'C1', className: 'Form 1A', subject: 'PRINCIPLES OF ACCOUNTS', normalizedSubject: 'Principles of Accounts', ownerTeacherId: 'T1', ownerTeacherName: 'Mr One' },
      // An extra assignment typed with a typo, no teacher.
      'C1__Priciples of Accounts': { classId: 'C1', className: 'Form 1A', subject: 'Priciples of Accounts', normalizedSubject: 'Priciples of Accounts', ownerTeacherId: null },
      C1__English: { classId: 'C1', className: 'Form 1A', subject: 'English', normalizedSubject: 'English', ownerTeacherId: 'T2' },
    },
    examConfigs: { cfg: { term: TERM, year: YEAR, isActive: true, createdAt: '2026-09-01', examTypes: { week4: false, week8: false, endOfTerm: true }, endOfTermTotalMarks: 100 } },
    results: {
      ...mark('docA', 'PRINCIPLES OF ACCOUNTS', 'endOfTerm', 61, '2026-10-01'),          // old spelling
      ...mark('docB', 'Principles of Accounts', 'endOfTerm', 72, '2026-10-02'),          // right spelling
      ...mark('docC', 'Priciples of Accounts', 'endOfTerm', 55, '2026-10-03'),           // typo
      // docB also under the old spelling, OLDER than the right one: dropped.
      ...mark('docB', 'PRINCIPLES OF ACCOUNTS', 'endOfTerm', 40, '2026-09-20'),
      ...mark('docA', 'English', 'endOfTerm', 50, '2026-10-01', { normalizedSubject: 'English' }),
    },
  });
  resultsService.invalidateGrid();
});

describe('screens', () => {
  it('the class grid shows Principles of Accounts once, with every learner\'s mark', async () => {
    const { grid } = await resultsService.loadGrid('C1', TERM, YEAR);
    const poa = grid.subjects.filter(s => /acc/i.test(s.subjectId));
    expect(poa.map(s => [s.subjectId, s.subjectName])).toEqual([['Principles of Accounts', 'Principles of Accounts']]);
    const m = (id: string) => grid.cells.get(`${id}|Principles of Accounts|endOfTerm`)?.marks;
    expect([m('docA'), m('docB'), m('docC')]).toEqual([61, 72, 55]); // docB: the newer mark
  });

  it('a report card lists the subject once', async () => {
    const card = (await resultsService.generateReportCard('docA', TERM, YEAR, { includeIncomplete: true })) as any;
    expect(card.subjects.filter((s: any) => /acc/i.test(s.subjectName)).length).toBe(1);
  });
});

describe('Results Data Check', () => {
  it('finds the spellings and the duplicate assignment; joining saves every mark under one spelling', async () => {
    const r = await findSubjectSpellings();
    expect(r.groups.map(g => [g.from, g.to, g.resultIds.length])).toEqual([
      ['PRINCIPLES OF ACCOUNTS', 'Principles of Accounts', 2],
      ['Priciples of Accounts', 'Principles of Accounts', 1],
    ]);
    expect(r.duplicateSlots.map(d => [d.className, d.subject, d.slots.length])).toEqual([['Form 1A', 'Principles of Accounts', 2]]);

    const fixed = await fixSubjectSpellings(r.groups);
    expect(fixed).toEqual({ moved: 2, droppedOlder: 1, skipped: [] });

    const rows = [...store.get('results')!.entries()];
    const poa = rows.filter(([, x]: any) => /acc/i.test(x.subjectId));
    expect(poa.map(([, x]: any) => x.subjectId)).toEqual(['Principles of Accounts', 'Principles of Accounts', 'Principles of Accounts']);
    expect(getDocData('results', 'docA_Principles of Accounts_endOfTerm_Term3_2026')).toMatchObject({ marks: 61, spellingFixedFrom: 'PRINCIPLES OF ACCOUNTS', normalizedSubject: 'Principles of Accounts' });
    expect(getDocData('results', 'docB_Principles of Accounts_endOfTerm_Term3_2026')).toMatchObject({ marks: 72 });
    expect(getDocData('results', 'docC_Principles of Accounts_endOfTerm_Term3_2026')).toMatchObject({ marks: 55 });
    expect(getDocData('results', 'docB_PRINCIPLES OF ACCOUNTS_endOfTerm_Term3_2026')).toBeUndefined();
    expect(getDocData('results', 'docA_English_endOfTerm_Term3_2026')).toMatchObject({ marks: 50 }); // untouched

    expect((await findSubjectSpellings()).groups).toEqual([]);
  });

  it('when the misspelt mark is the newer one, it replaces the older right-spelt mark', async () => {
    store.get('results')!.set('docB_PRINCIPLES OF ACCOUNTS_endOfTerm_Term3_2026', {
      ...getDocData('results', 'docB_PRINCIPLES OF ACCOUNTS_endOfTerm_Term3_2026'), marks: 88, updatedAt: '2026-10-20',
    });
    await fixSubjectSpellings((await findSubjectSpellings()).groups);
    expect(getDocData('results', 'docB_Principles of Accounts_endOfTerm_Term3_2026')).toMatchObject({ marks: 88 });
  });
});

describe('Results Data Check — marks that cannot be moved', () => {
  it('reports them instead of failing everything', async () => {
    store.get('results')!.set('odd1', { studentId: 'docA', classId: 'C1', subjectId: 'PRINCIPLES OF ACCOUNTS', examType: 'week4', marks: 3 }); // no term/year
    const r = await fixSubjectSpellings((await findSubjectSpellings()).groups);
    expect(r.skipped).toEqual([{ id: 'odd1', reason: 'missing learner, test, term or year' }]);
    expect(r.moved).toBe(2);
  });
  it('reports progress', async () => {
    const seen: Array<[number, number]> = [];
    await fixSubjectSpellings((await findSubjectSpellings()).groups, (a, b) => seen.push([a, b]));
    expect(seen[0]).toEqual([0, 5]);          // 2 marks moved (save + delete each) + docB's older mark removed
    expect(seen[seen.length - 1]).toEqual([5, 5]);
  });
});

describe('Results Data Check — adding the missing subject key', () => {
  it('uses the class\'s real assignment, even one created under an older spelling', async () => {
    const slots = store.get('class_slots')!;
    slots.delete('C1__Principles of Accounts');
    slots.set('C1__PRINCIPLES OF ACCOUNTS', { classId: 'C1', subject: 'PRINCIPLES OF ACCOUNTS', normalizedSubject: 'PRINCIPLES OF ACCOUNTS', ownerTeacherId: 'T1' });
    const res = store.get('results')!;
    for (const [id, r] of res) delete (r as any).normalizedSubject;
    const ids = [...res.keys()];
    expect(await fixMissingNormalizedSubject(ids)).toBe(ids.length);
    const key = (id: string) => (getDocData('results', id) as any).normalizedSubject;
    expect(key('docA_PRINCIPLES OF ACCOUNTS_endOfTerm_Term3_2026')).toBe('PRINCIPLES OF ACCOUNTS'); // the staffed assignment
    expect(key('docC_Priciples of Accounts_endOfTerm_Term3_2026')).toBe('PRINCIPLES OF ACCOUNTS');
    expect(key('docA_English_endOfTerm_Term3_2026')).toBe('English');
    // Rows that already have a key are left alone.
    expect(await fixMissingNormalizedSubject(ids)).toBe(0);
  });
});
