// End-to-end year transition on the in-memory Firestore: plan → run → check
// that learners, ids, enrollments, SBA, classes, past-year report cards and
// the data check are all right → resume is safe → undo restores everything.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('firebase/firestore', async () => await import('../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'ADMIN' } }) }));

import { resetStore, getDocData, store, writeLog } from '../test/fakeFirestore';
import {
  checkUndo,
  executePromotionRun,
  getSchoolYear,
  loadFormerLearners,
  loadTransitionData,
  startPromotionRun,
  undoPromotionRun,
} from './promotionService';
import { buildPromotionPlan, defaultClassMap, DEFAULT_SETTINGS, suggestedArchive } from './promotionPlan';
import { loadClassRoster } from './resultsGridLoader';
import { resultsService } from './resultsService';
import { runDataCheck } from './resultsDataCheck';
import { learnerService } from './schoolService';
import type { LearnerDecision } from '@/types/promotion';

const learner = (classId: string, className: string, studentId: string, fullName: string, extra: Record<string, any> = {}) => ({
  classId, className, studentId, fullName, status: 'active', studentIndex: Number(studentId.split('_')[1]),
  gender: 'female', guardianPhone: '0970000001', dateOfFirstEntry: '2025-01-10', ...extra,
});

const slot = (classId: string, className: string, subject: string) => ({
  [`${classId}__${subject}`]: { classId, className, subject, normalizedSubject: subject, ownerTeacherId: 'T1', ownerTeacherName: 'Mr One' },
});

const result = (studentId: string, classId: string, marks: number) => ({
  [`${studentId}_Mathematics_endOfTerm_Term3_2026`]: {
    studentId, classId, className: 'x', subjectId: 'Mathematics', subjectName: 'Mathematics',
    examType: 'endOfTerm', marks, totalMarks: 100, percentage: marks, term: 'Term 3', year: 2026,
    normalizedSubject: 'Mathematics', teacherId: 'T1', createdAt: '2026-11-20T10:00:00.000Z',
  },
});

function seed() {
  resetStore({
    system: { assignmentEngine: { migratedAt: 'x' } },
    classes: {
      F1A: { name: 'Form 1A', type: 'form', level: 1, section: 'A', year: 2026, isActive: true, students: 2 },
      F2A: { name: 'Form 2A', type: 'form', level: 2, section: 'A', year: 2026, isActive: true, students: 2 },
      G11A: { name: 'Grade 11A', type: 'grade', level: 11, section: 'A', year: 2026, isActive: true, students: 1 },
      G12A: { name: 'Grade 12A', type: 'grade', level: 12, section: 'A', year: 2026, isActive: true, students: 1 },
    },
    learners: {
      a: learner('F1A', 'Form 1A', 'F1A_001', 'Alice Banda'),
      b: learner('F1A', 'Form 1A', 'F1A_002', 'Ben Chola'),
      d: learner('F2A', 'Form 2A', 'F2A_001', 'Dora Mwila'),
      e: learner('F2A', 'Form 2A', 'F2A_002', 'Eli Phiri'),
      g: learner('G11A', 'Grade 11A', 'G11A_001', 'Grace Tembo'),
      i: learner('G12A', 'Grade 12A', 'G12A_001', 'Isaac Zulu'),
    },
    class_slots: { ...slot('F1A', 'Form 1A', 'Mathematics'), ...slot('F2A', 'Form 2A', 'Mathematics') },
    results: { ...result('a', 'F1A', 80), ...result('b', 'F1A', 40), ...result('d', 'F2A', 70) },
    examConfigs: {
      cfg: {
        term: 'Term 3', year: 2026, isActive: true, createdAt: '2026-09-01',
        examTypes: { week4: false, week8: false, endOfTerm: true }, endOfTermTotalMarks: 100,
      },
    },
    sba_results: {
      // Dora (Form 2A, sits Form 4 in 2028) and Eli (repeats Form 2).
      d_Mathematics_2028: { id: 'd_Mathematics_2028', studentId: 'd', classId: 'F2A', className: 'Form 2A', form: '2', subjectId: 'Mathematics', examYear: 2028, form1Tasks: [8, 9], form1Mark: 17 },
      e_Mathematics_2028: { id: 'e_Mathematics_2028', studentId: 'e', classId: 'F2A', className: 'Form 2A', form: '2', subjectId: 'Mathematics', examYear: 2028, form1Tasks: [5, 6], form1Mark: 11 },
    },
  });
}

async function plan(decisions: Record<string, LearnerDecision> = {}) {
  const data = await loadTransitionData();
  const settings = DEFAULT_SETTINGS(data.suggestedFromYear);
  const { map, newClasses } = defaultClassMap(data.classes, settings);
  return buildPromotionPlan({ settings, classes: data.classes, learners: data.learners, map, newClasses, decisions });
}

/** Firestore refuses undefined field values: no write may contain one. */
function expectNoUndefinedWrites() {
  const find = (v: any, path: string): string | null => {
    if (v === undefined) return path;
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const r = find(v[i], `${path}[${i}]`); if (r) return r; } return null; }
    if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) { const r = find(x, `${path}.${k}`); if (r) return r; } }
    return null;
  };
  for (const w of writeLog) {
    if (!w.after) continue;
    const bad = find(w.after, w.path);
    if (bad) throw new Error(`undefined value written at ${bad}`);
  }
}

beforeEach(() => {
  seed();
  resultsService.invalidateGrid();
});

describe('year transition', () => {
  it('suggests closing the year the classes are in', async () => {
    const data = await loadTransitionData();
    expect(data.suggestedFromYear).toBe(2026);
    expect(await getSchoolYear()).toBeGreaterThan(2000);
  });

  it('moves every learner, keeps history, SBA and ids consistent', async () => {
    const p = await plan({ e: { action: 'repeat' } });
    expect(p.issues.filter(i => i.level === 'error')).toEqual([]);
    const archive = suggestedArchive(p);
    expect(archive).toEqual(['G11A']);

    const runId = await startPromotionRun(p, archive, { uid: 'ADMIN', name: 'Admin' });
    const out = await executePromotionRun(runId);
    expect(out.moved).toBe(6);

    // Learners.
    expect(getDocData('learners', 'a')).toMatchObject({ classId: 'F2A', className: 'Form 2A', studentId: 'F2A_001', academicYear: 2027, previousStudentIds: ['F1A_001'] });
    // Repeater keeps F2A_002; Ben wanted F2A_002 → gets the next number.
    expect(getDocData('learners', 'e')).toMatchObject({ classId: 'F2A', studentId: 'F2A_002', academicYear: 2027 });
    expect(getDocData('learners', 'b')!.studentId).toBe('F2A_003');
    // Form 3A did not exist → created; Dora keeps her number.
    const f3 = [...store.get('classes')!.entries()].find(([, c]) => c.name === 'Form 3A')!;
    expect(f3[1]).toMatchObject({ type: 'form', level: 3, section: 'A', year: 2027, isActive: true, students: 1 });
    expect(getDocData('learners', 'd')).toMatchObject({ classId: f3[0], studentId: 'F3A_001' });
    expect(getDocData('learners', 'g')).toMatchObject({ classId: 'G12A', studentId: 'G12A_001' });
    // Graduate.
    expect(getDocData('learners', 'i')).toMatchObject({ status: 'graduated', graduationYear: 2026, exitYear: 2026, studentId: 'G12A_001-2026', classId: 'G12A' });

    // Enrollments for the closed year.
    expect(getDocData('enrollments', 'a_2026')).toMatchObject({ classId: 'F1A', studentId: 'F1A_001', outcome: 'promoted', closed: true, nextClassId: 'F2A', nextStudentId: 'F2A_001' });
    expect(getDocData('enrollments', 'i_2026')).toMatchObject({ classId: 'G12A', studentId: 'G12A_001', outcome: 'graduated' });

    // Classes: counts, year, archive.
    expect(getDocData('classes', 'F1A')).toMatchObject({ students: 0, year: 2027, isActive: true });
    expect(getDocData('classes', 'F2A')).toMatchObject({ students: 3, year: 2027 });
    expect(getDocData('classes', 'G11A')).toMatchObject({ isActive: false, archived: true, students: 0 });
    expect(getDocData('classes', 'G12A')).toMatchObject({ students: 1, year: 2027 });
    expect(getDocData('system', 'academicYear')).toMatchObject({ currentYear: 2027, lastRunId: '2026-2027' });
    expect(getDocData('promotion_runs', '2026-2027')!.status).toBe('completed');

    // SBA: Dora's record follows her; Eli's moves to his new exam year.
    expect(getDocData('sba_results', 'd_Mathematics_2028')).toMatchObject({ classId: f3[0], className: 'Form 3A', form: '3', form1Tasks: [8, 9] });
    expect(getDocData('sba_results', 'e_Mathematics_2028')).toBeUndefined();
    expect(getDocData('sba_results', 'e_Mathematics_2029')).toMatchObject({ classId: 'F2A', examYear: 2029, form1Tasks: [5, 6] });

    // Current rosters vs the closed year.
    expect((await loadClassRoster('F1A')).map(l => l.id)).toEqual([]);
    const f1Then = await loadClassRoster('F1A', { year: 2026 });
    expect(f1Then.map(l => [l.id, l.studentId])).toEqual([['a', 'F1A_001'], ['b', 'F1A_002']]);
    expect((await loadClassRoster('F2A', { year: 2027 })).map(l => l.id).sort()).toEqual(['a', 'b', 'e']);

    // Past report card: Alice's Term 3 2026 card is still Form 1A's, with her mark and position.
    const card = await resultsService.generateReportCard('a', 'Term 3', 2026, { includeIncomplete: true });
    expect(card).toMatchObject({ classId: 'F1A', studentName: 'Alice Banda', position: '1/2' });
    const cls = await resultsService.generateClassReportCards('F1A', 'Term 3', 2026);
    expect(cls.reportCards.map(c => c.studentName)).toEqual(['Alice Banda', 'Ben Chola']);
    expect(cls.reportCards[0].parentsPhone).toBe('0970000001');
    // The old id still finds the learner.
    expect((await learnerService.getLearnerByStudentId('F1A_001'))?.id).toBe('a');

    // Data check: 2026 marks are not "off roster".
    const report = await runDataCheck('Term 3', 2026);
    expect(report.results.offRoster).toEqual([]);
    expect(report.learners.duplicateStudentIds).toEqual([]);

    const former = await loadFormerLearners();
    expect(former.map(f => [f.id, f.exitYear])).toEqual([['i', 2026]]);

    expectNoUndefinedWrites();

    // Running again is refused.
    await expect(startPromotionRun(p, [], {})).rejects.toThrow(/already been run/);
  });

  it('resuming a stopped run does not move anyone twice', async () => {
    const p = await plan();
    const runId = await startPromotionRun(p, [], {});
    // Simulate a run that stopped after Alice was moved.
    await executePromotionRun(runId);
    store.get('promotion_runs')!.get(runId)!.status = 'failed';
    const again = await executePromotionRun(runId);
    expect(again.moved).toBe(0);
    expect(again.skippedAlreadyDone).toBe(p.items.length);
    expect(getDocData('learners', 'a')!.studentId).toBe('F2A_001');
    expect(getDocData('learners', 'a')!.previousStudentIds).toEqual(['F1A_001']);
  });

  it('a large school: the plan is stored in chunks and everyone is moved', async () => {
    const m = store.get('learners')!;
    for (let k = 1; k <= 600; k++) {
      const id = `x${k}`;
      m.set(id, learner('F1A', 'Form 1A', `F1A_${String(k + 10).padStart(3, '0')}`, `Extra ${k}`));
    }
    const p = await plan();
    const runId = await startPromotionRun(p, [], {});
    expect(store.get('promotion_run_items')!.size).toBe(Math.ceil(p.items.length / 250));
    expect(getDocData('promotion_runs', runId)!.items).toBeUndefined();
    const out = await executePromotionRun(runId);
    expect(out.moved).toBe(p.items.length);
    expect(getDocData('learners', 'x600')).toMatchObject({ classId: 'F2A', studentId: 'F2A_610' });
    expect(getDocData('classes', 'F2A')!.students).toBe(602);
  });

  it('new-year admissions stay where they are', async () => {
    store.get('learners')!.set('n', learner('F1A', 'Form 1A', 'F1A_003', 'New Intake', { dateOfFirstEntry: '2027-01-12' }));
    const p = await plan();
    const n = p.items.find(i => i.learnerId === 'n')!;
    expect(n.action).toBe('stay');
    const runId = await startPromotionRun(p, [], {});
    await executePromotionRun(runId);
    expect(getDocData('learners', 'n')).toMatchObject({ classId: 'F1A', studentId: 'F1A_003', academicYear: 2027 });
    expect(getDocData('classes', 'F1A')!.students).toBe(1);
  });

  it('undo puts everything back', async () => {
    const before = structuredClone(Object.fromEntries(store.get('learners')!));
    const sbaBefore = structuredClone(Object.fromEntries(store.get('sba_results')!));
    const p = await plan({ e: { action: 'repeat' }, b: { action: 'leave', reason: 'Moved to Mongu' } });
    const runId = await startPromotionRun(p, suggestedArchive(p), {});
    await executePromotionRun(runId);
    expect(getDocData('learners', 'b')).toMatchObject({ status: 'transferred', exitReason: 'Moved to Mongu', studentId: 'F1A_002-2026' });

    expect(await checkUndo(runId)).toEqual({ newYearResults: 0, learnersAdmittedIntoCreatedClasses: 0 });
    await undoPromotionRun(runId);

    for (const [id, l] of Object.entries(before)) {
      const now = getDocData('learners', id)!;
      for (const k of ['classId', 'className', 'studentId', 'studentIndex', 'status']) {
        expect([id, k, now[k]]).toEqual([id, k, (l as any)[k]]);
      }
      expect(now.academicYear).toBe(2026);
    }
    expect(Object.fromEntries(store.get('sba_results')!)).toMatchObject(sbaBefore);
    expect(store.get('sba_results')!.has('e_Mathematics_2029')).toBe(false);
    expect(store.get('enrollments')!.size).toBe(0);
    expect([...store.get('classes')!.values()].some(c => c.name === 'Form 3A')).toBe(false);
    expect(getDocData('classes', 'G11A')).toMatchObject({ isActive: true, archived: false, students: 1, year: 2026 });
    expect(getDocData('classes', 'F1A')).toMatchObject({ students: 2, year: 2026 });
    expect(getDocData('system', 'academicYear')!.currentYear).toBe(2026);
    expect(getDocData('promotion_runs', runId)!.status).toBe('reverted');
    expectNoUndefinedWrites();

    // …and the year can be run again.
    const p2 = await plan();
    const run2 = await startPromotionRun(p2, [], {});
    await executePromotionRun(run2);
    expect(getDocData('learners', 'a')!.classId).toBe('F2A');
  });
});
