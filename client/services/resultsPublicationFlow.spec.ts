// Publishing, end to end: the real results service, monitor and publication
// service run against an in-memory Firestore. A guardian's view of a term is
// closed until the admin publishes it (needs 98% entered); staff are never
// affected; older terms stay open.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('firebase/firestore', async () => await import('../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
const authState = vi.hoisted(() => ({ uid: 'T1' as string | null }));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: authState.uid ? { uid: authState.uid } : null }),
}));

import { resetStore, getDocData } from '../test/fakeFirestore';
import { resultsService } from './resultsService';
import { loadMonitorData } from './resultsMonitor';
import {
  clearReleaseCache,
  publishBlocker,
  publishResults,
  ResultsNotReleasedError,
  unpublishResults,
} from './resultsPublication';

const TERM = 'Term 3';
const YEAR = 2026;
const admin = { uid: 'ADMIN', name: 'Head Teacher' };
const classes = [{ id: 'C1', name: 'Form 1A', formTeacherId: 'T1' }];
const publicCard = () =>
  resultsService.generateReportCard('docA', TERM, YEAR, { includeIncomplete: true, markMissing: true, publicView: true });
const staffCard = () =>
  resultsService.generateReportCard('docA', TERM, YEAR, { includeIncomplete: true, markMissing: true });

function seed() {
  const learner = (studentId: string, name: string) => ({ classId: 'C1', studentId, fullName: name, status: 'active', guardianPhone: '0970000000' });
  resetStore({
    system: { assignmentEngine: { migratedAt: 'x' } },
    classes: { C1: { name: 'Form 1A', level: 1, isActive: true, formTeacherId: 'T1' } },
    learners: {
      docA: learner('F1A_001', 'Alice Banda'),
      docB: learner('F1A_002', 'Ben Chola'),
      docC: learner('F1A_003', 'Chipo Daka'),
      docD: learner('F1A_004', 'Dalitso Mwale'),
    },
    class_slots: {
      C1__Mathematics: { classId: 'C1', className: 'Form 1A', subject: 'Mathematics', normalizedSubject: 'Mathematics', ownerTeacherId: 'T1', ownerTeacherName: 'Mr One' },
      C1__English: { classId: 'C1', className: 'Form 1A', subject: 'English', normalizedSubject: 'English', ownerTeacherId: 'T2', ownerTeacherName: 'Ms Two' },
    },
    // Two tests this term: 4 learners x 2 subjects x 2 tests = 16 results expected.
    examConfigs: {
      cfg: {
        term: TERM, year: YEAR, isActive: true, createdAt: '2026-09-01',
        examTypes: { week4: true, week8: false, endOfTerm: true },
        week4TotalMarks: 50, week8TotalMarks: 50, endOfTermTotalMarks: 100,
      },
    },
  });
}

/** Enter one test's marks for some learners (as the subject's teacher). */
async function enter(subject: 'Mathematics' | 'English', exam: 'week4' | 'endOfTerm', learners: string[]) {
  const teacherId = subject === 'Mathematics' ? 'T1' : 'T2';
  authState.uid = teacherId;
  const total = exam === 'week4' ? 50 : 100;
  await resultsService.saveClassResults(
    {
      classId: 'C1', className: 'Form 1A', subjectId: subject, subjectName: subject,
      teacherId, teacherName: teacherId, examType: exam, examName: `${exam} - ${subject}`,
      term: TERM, year: YEAR, totalMarks: total,
      results: learners.map(id => ({ studentId: id, studentName: id, marks: total / 2 })),
    },
    { overwrite: true }
  );
  resultsService.invalidateGrid();
}

const all = ['docA', 'docB', 'docC', 'docD'];
const completion = async () => (await loadMonitorData(TERM, YEAR, classes)).completion;

beforeEach(() => {
  seed();
  resultsService.invalidateGrid();
  clearReleaseCache();
  authState.uid = 'T1';
});

describe('a term that is not published', () => {
  it('is closed to guardians and sponsors, but staff still see it', async () => {
    await enter('Mathematics', 'week4', ['docA']);

    await expect(publicCard()).rejects.toBeInstanceOf(ResultsNotReleasedError);
    await expect(publicCard()).rejects.toThrow('Term 3 2026 results have not been released yet.');

    // Admin / teachers / guidance officers do not use the public view.
    const card = await staffCard();
    expect(card?.studentName).toBe('Alice Banda');
    expect(card?.isComplete).toBe(false);
  });

  it('stays closed even when every result is entered, until the admin publishes', async () => {
    for (const s of ['Mathematics', 'English'] as const) for (const e of ['week4', 'endOfTerm'] as const) await enter(s, e, all);
    await expect(publicCard()).rejects.toBeInstanceOf(ResultsNotReleasedError);
  });
});

describe('publishing needs 98% of the results', () => {
  it('counts the same results as the Results Entry Monitor', async () => {
    expect(await completion()).toEqual({ requiredEntries: 16, doneEntries: 0 });
    await enter('Mathematics', 'week4', ['docA', 'docB', 'docC']);
    expect(await completion()).toEqual({ requiredEntries: 16, doneEntries: 3 });
    await enter('Mathematics', 'endOfTerm', all);
    expect(await completion()).toEqual({ requiredEntries: 16, doneEntries: 7 });
  });

  it('15 of 16 (93.75%) is refused; 16 of 16 publishes and opens the term', async () => {
    await enter('Mathematics', 'week4', all);
    await enter('Mathematics', 'endOfTerm', all);
    await enter('English', 'week4', all);
    await enter('English', 'endOfTerm', ['docA', 'docB', 'docC']); // Dalitso's English exam missing

    const almost = await completion();
    expect(almost).toEqual({ requiredEntries: 16, doneEntries: 15 });
    expect(publishBlocker(almost, 0, TERM, YEAR)).toBe(
      'Only 93.7% of the results are entered; 98% is needed (1 more result to enter).'
    );
    await expect(publishResults(TERM, YEAR, almost, admin)).rejects.toThrow(/cannot be published yet/);
    expect(getDocData('results_publication', '2026_Term3')).toBeUndefined();
    await expect(publicCard()).rejects.toBeInstanceOf(ResultsNotReleasedError);

    await enter('English', 'endOfTerm', ['docD']);
    const full = await completion();
    expect(full).toEqual({ requiredEntries: 16, doneEntries: 16 });
    expect(publishBlocker(full, 0, TERM, YEAR)).toBeNull();

    await publishResults(TERM, YEAR, full, admin);
    expect(getDocData('results_publication', '2026_Term3')).toMatchObject({
      term: TERM, year: YEAR, published: true, requiredEntries: 16, doneEntries: 16,
      completionPercent: 100, publishedBy: 'ADMIN', publishedByName: 'Head Teacher',
    });

    const card = await publicCard();
    expect(card?.studentName).toBe('Alice Banda');
    expect(card?.isComplete).toBe(true);
  });

  it('withdrawing closes the term again', async () => {
    for (const s of ['Mathematics', 'English'] as const) for (const e of ['week4', 'endOfTerm'] as const) await enter(s, e, all);
    await publishResults(TERM, YEAR, await completion(), admin);
    expect((await publicCard())?.studentName).toBe('Alice Banda');

    await unpublishResults(TERM, YEAR, admin);
    expect(getDocData('results_publication', '2026_Term3')).toMatchObject({ published: false, unpublishedByName: 'Head Teacher' });
    await expect(publicCard()).rejects.toBeInstanceOf(ResultsNotReleasedError);
    expect((await staffCard())?.studentName).toBe('Alice Banda'); // staff unaffected
  });

  it('a term with no tests set up has nothing to publish', async () => {
    resetStore({
      classes: { C1: { name: 'Form 1A', level: 1, isActive: true } },
      learners: { docA: { classId: 'C1', studentId: 'F1A_001', fullName: 'Alice', status: 'active' } },
      class_slots: { C1__Mathematics: { classId: 'C1', className: 'Form 1A', subject: 'Mathematics', normalizedSubject: 'Mathematics', ownerTeacherId: 'T1' } },
      examConfigs: { cfg: { term: TERM, year: YEAR, isActive: true, examTypes: { week4: false, week8: false, endOfTerm: false } } },
    });
    const c = await completion();
    expect(c.requiredEntries).toBe(0);
    expect(publishBlocker(c, 0, TERM, YEAR)).toMatch(/nothing to publish/);
    await expect(publishResults(TERM, YEAR, c, admin)).rejects.toThrow(/cannot be published yet/);
  });
});

describe('older terms stay open as before', () => {
  it('Term 2 2026 needs no publishing', async () => {
    // No release error: the gate lets it through (this school has no Term 2 marks, so no card).
    await expect(
      resultsService.generateReportCard('docA', 'Term 2', 2026, { includeIncomplete: true, markMissing: true, publicView: true })
    ).resolves.toBeNull();
  });

  it('unless the admin withdraws it', async () => {
    await unpublishResults('Term 2', 2026, admin);
    await expect(
      resultsService.generateReportCard('docA', 'Term 2', 2026, { includeIncomplete: true, markMissing: true, publicView: true })
    ).rejects.toBeInstanceOf(ResultsNotReleasedError);
  });
});
