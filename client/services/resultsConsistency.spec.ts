// End-to-end consistency tests: the real resultsService, grid loader and
// monitor run against an in-memory Firestore. For the same data, the Results
// Entry numbers, the Monitor, the Report Cards list, the report card and the
// SMS must agree — and every write must pass the Firestore rules model.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('firebase/firestore', async () => await import('../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
const authState = vi.hoisted(() => ({ uid: 'T1' as string | null }));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: authState.uid ? { uid: authState.uid } : null }),
}));

import { resetStore, writeLog, getDocData } from '../test/fakeFirestore';
import { resultsWriteAllowed, type RulesEnv } from '../test/resultsRulesModel';
import { resultsService } from './resultsService';
import { loadMonitorData } from './resultsMonitor';
import { MARK } from './resultsGrid';

// ---------- seed ----------
const TERM = 'Term 3';
const YEAR = 2026;
const day = 24 * 3600 * 1000;
const now = Date.now();

const learner = (id: string, studentId: string, name: string, extra: Record<string, any> = {}) => ({
  [id]: { classId: 'C1', studentId, fullName: name, status: 'active', studentIndex: Number(studentId.slice(-3)), gender: 'female', guardianPhone: '0970000000', ...extra },
});

const slots = {
  C1__Mathematics: { classId: 'C1', className: 'Form 1A', subject: 'Mathematics', normalizedSubject: 'Mathematics', ownerTeacherId: 'T1', ownerTeacherName: 'Mr One' },
  // English: owner T2 is on leave, T3 covers until next week.
  C1__English: {
    classId: 'C1', className: 'Form 1A', subject: 'English', normalizedSubject: 'English', ownerTeacherId: 'T2', ownerTeacherName: 'Ms Two',
    delegateTeacherId: 'T3', delegateTeacherName: 'Mrs Three', delegateRole: 'leave-cover',
    delegateStart: new Date(now - 7 * day), delegateEnd: new Date(now + 7 * day),
  },
  // Biology: subject dropped — slot left vacant, no marks.
  C1__Biology: { classId: 'C1', className: 'Form 1A', subject: 'Biology', normalizedSubject: 'Biology', ownerTeacherId: null },
  'C1__form-teacher': { classId: 'C1', className: 'Form 1A', subject: 'Form Teacher', normalizedSubject: 'form-teacher', isFormTeacherSlot: true, ownerTeacherId: 'T1' },
};

function seed() {
  resetStore({
    system: { assignmentEngine: { migratedAt: 'x' } },
    classes: { C1: { name: 'Form 1A', level: 1, isActive: true, formTeacherId: 'T1' } },
    learners: {
      ...learner('docA', 'F1A_001', 'Alice Banda'),
      ...learner('docB', 'F1A_002', 'Ben Chola'),
      ...learner('docC', 'F1A_003', 'Chipo Daka'),
      // No status and no studentIndex: still a member (used to vanish from the monitor).
      docD: { classId: 'C1', studentId: 'F1A_004', fullName: 'Dalitso Mwale' },
      // Archived: not counted.
      ...learner('docZ', 'F1A_099', 'Zed Archived', { status: 'archived' }),
    },
    class_slots: slots,
    examConfigs: {
      cfg: {
        term: TERM, year: YEAR, isActive: true, createdAt: '2026-09-01',
        examTypes: { week4: true, week8: false, endOfTerm: true },
        week4TotalMarks: 50, week8TotalMarks: 50, endOfTermTotalMarks: 100,
      },
    },
  });
}

const env = (uid: string, enforce: boolean): RulesEnv => ({
  uid, role: 'teacher', enforceAuthority: enforce, slots,
});

/** Every results write in the log must be allowed for this teacher. */
function expectAllWritesAllowed(uid: string) {
  const writes = writeLog.filter(w => w.path.startsWith('results/'));
  expect(writes.length).toBeGreaterThan(0);
  for (const enforce of [false, true]) {
    for (const w of writes) {
      const ok = resultsWriteAllowed(env(uid, enforce), w.op, w.before, w.after);
      if (!ok) throw new Error(`rules (enforce=${enforce}) would refuse ${w.op} ${w.path}`);
    }
  }
}

const base = (subject: string, examType: 'week4' | 'week8' | 'endOfTerm', teacherId: string, totalMarks: number) => ({
  classId: 'C1', className: 'Form 1A', subjectId: subject, subjectName: subject,
  teacherId, teacherName: teacherId, examType, examName: `${examType} - ${subject}`,
  term: TERM, year: YEAR, totalMarks,
});

beforeEach(() => {
  seed();
  resultsService.invalidateGrid();
  authState.uid = 'T1';
});

// ---------- saving ----------
describe('saving results', () => {
  it('a slot keyed under an older subject spelling: owner can save, rules allow it, monitor counts it', async () => {
    const { store } = await import('../test/fakeFirestore');
    const old = { classId: 'C1', className: 'Form 1A', subject: 'Computer Studies', normalizedSubject: 'Computer Studies', ownerTeacherId: 'T1', ownerTeacherName: 'Mr One' };
    store.get('class_slots')!.set('C1__Computer Studies', old);
    (slots as any)['C1__Computer Studies'] = old;
    try {
      const r = await resultsService.saveClassResults({
        ...base('ICT', 'week4', 'T1', 50),
        results: [{ studentId: 'docA', studentName: 'Alice', marks: 33 }],
      }, { overwrite: true });
      expect(r.count).toBe(1);
      const row = [...store.get('results')!.values()].find((x: any) => x.marks === 33) as any;
      expect(row.subjectId).toBe('ICT');
      expect(row.normalizedSubject).toBe('Computer Studies'); // the real slot id → rules find it
      expectAllWritesAllowed('T1');
      authState.uid = 'T2';
      await expect(resultsService.saveClassResults({
        ...base('ICT', 'week4', 'T2', 50), results: [{ studentId: 'docB', studentName: 'B', marks: 1 }],
      }, { overwrite: true })).rejects.toThrow(/not assigned/);
      resultsService.invalidateGrid();
      const m = await loadMonitorData(TERM, YEAR, [{ id: 'C1', name: 'Form 1A', formTeacherId: 'T1' }]);
      const t1 = m.teachers.find(t => t.teacherId === 'T1')!;
      const ictRow = t1.classProgress[0].subjects.find(x => x.subjectId === 'ICT')!;
      expect(ictRow.week4StudentCount).toBe(1); // the saved mark is counted under the subject
    } finally {
      delete (slots as any)['C1__Computer Studies'];
    }
  });

  it('saves by document id, accepts custom ids, reports learners it could not save', async () => {
    const r = await resultsService.saveClassResults({
      ...base('Mathematics', 'week4', 'T1', 50),
      results: [
        { studentId: 'docA', studentName: 'Alice', marks: 40 },
        { studentId: 'F1A_002', studentName: 'Ben', marks: -1 },   // custom id still works
        { studentId: 'docZ', studentName: 'Zed', marks: 30 },      // archived → skipped
        { studentId: 'docC', studentName: 'Chipo', marks: 55 },    // above total → skipped
      ],
    }, { overwrite: true });

    expect(r.count).toBe(2);
    expect(r.skipped.map(s => s.studentId)).toEqual(['docZ', 'docC']);
    const row = getDocData('results', 'docB_Mathematics_week4_Term3_2026')!;
    expect(row.studentId).toBe('docB');
    expect(row.normalizedSubject).toBe('Mathematics');
    expect(row.enteredBy).toBe('T1');
    expect(row.lastEditedBy).toBe('T1');
    expect(Number.isInteger(row.year)).toBe(true);
    expectAllWritesAllowed('T1');
  });

  it('re-saving keeps enteredBy and createdAt (rules require enteredBy unchanged)', async () => {
    await resultsService.saveClassResults({ ...base('Mathematics', 'week4', 'T1', 50), results: [{ studentId: 'docA', studentName: 'A', marks: 10 }] }, { overwrite: true });
    const first = getDocData('results', 'docA_Mathematics_week4_Term3_2026')!;
    writeLog.length = 0;
    await resultsService.saveClassResults({ ...base('Mathematics', 'week4', 'T1', 50), results: [{ studentId: 'docA', studentName: 'A', marks: 20 }] }, { overwrite: true });
    const second = getDocData('results', 'docA_Mathematics_week4_Term3_2026')!;
    expect(second.marks).toBe(20);
    expect(second.enteredBy).toBe(first.enteredBy);
    expect(second.createdAt).toBe(first.createdAt);
    expectAllWritesAllowed('T1');
  });

  it('a covered owner and the covering teacher can both save; an unassigned teacher cannot', async () => {
    authState.uid = 'T2';
    const r2 = await resultsService.saveClassResults({
      ...base('English', 'week4', 'T2', 50), results: [{ studentId: 'docA', studentName: 'A', marks: 10 }],
    }, { overwrite: true });
    expect(r2.count).toBe(1);
    expectAllWritesAllowed('T2');

    writeLog.length = 0;
    authState.uid = 'T3';
    const r3 = await resultsService.saveClassResults({
      ...base('English', 'week4', 'T3', 50), results: [{ studentId: 'docA', studentName: 'A', marks: 12 }],
    }, { overwrite: true });
    expect(r3.count).toBe(1);
    expectAllWritesAllowed('T3');

    authState.uid = 'T9';
    await expect(resultsService.saveClassResults({
      ...base('English', 'week4', 'T9', 50), results: [{ studentId: 'docA', studentName: 'A', marks: 10 }],
    }, { overwrite: true })).rejects.toThrow(/not assigned/);
    // and the rules model refuses an unassigned teacher when enforced
    const w = writeLog.find(x => x.path.startsWith('results/'))!;
    expect(resultsWriteAllowed(env('T9', true), 'set', null, { ...w.after!, enteredBy: 'T9', lastEditedBy: 'T9' })).toBe(false);
  });

  it('mark exam not conducted: every active learner gets -2; refused if marks exist', async () => {
    authState.uid = 'T3';
    const r = await resultsService.markExamNotConducted(base('English', 'endOfTerm', 'T3', 100));
    expect(r.count).toBe(4); // A, B, C, D — not the archived learner
    expectAllWritesAllowed('T3');

    authState.uid = 'T1';
    await resultsService.saveClassResults({ ...base('Mathematics', 'endOfTerm', 'T1', 100), results: [{ studentId: 'docA', studentName: 'A', marks: 70 }] }, { overwrite: true });
    await expect(resultsService.markExamNotConducted(base('Mathematics', 'endOfTerm', 'T1', 100))).rejects.toThrow(/already saved/);
  });

  it('delete: a teacher may delete their own rows, not another teacher\'s (rules model)', async () => {
    await resultsService.saveClassResults({ ...base('Mathematics', 'week4', 'T1', 50), results: [{ studentId: 'docA', studentName: 'A', marks: 10 }] }, { overwrite: true });
    writeLog.length = 0;
    await resultsService.deleteClassResults({ classId: 'C1', subjectId: 'Mathematics', examType: 'week4', term: TERM, year: YEAR });
    const del = writeLog.find(w => w.op === 'delete')!;
    expect(resultsWriteAllowed(env('T1', false), 'delete', del.before, null)).toBe(true);
    expect(resultsWriteAllowed(env('T1', true), 'delete', del.before, null)).toBe(true);
    expect(resultsWriteAllowed(env('T3', false), 'delete', del.before, null)).toBe(false);
    expect(resultsWriteAllowed(env('T3', true), 'delete', del.before, null)).toBe(false);
  });

  it('legacy rows without normalizedSubject cannot be updated by a teacher once authority is enforced', () => {
    const legacy = { classId: 'C1', subjectId: 'Mathematics', studentId: 'docA', examType: 'week4', term: TERM, year: YEAR, marks: 10, totalMarks: 50, teacherId: 'T1' };
    const after = { ...legacy, marks: 20, normalizedSubject: 'Mathematics', lastEditedBy: 'T1' };
    expect(resultsWriteAllowed(env('T1', true), 'update', legacy, after)).toBe(false);
    expect(resultsWriteAllowed(env('T1', false), 'update', legacy, after)).toBe(true);
  });
});

// ---------- every screen agrees ----------
describe('every screen shows the same numbers', () => {
  beforeEach(async () => {
    // Maths (T1): W4 for A, B(absent), C; EOT for A, B, C, D.
    authState.uid = 'T1';
    await resultsService.saveClassResults({ ...base('Mathematics', 'week4', 'T1', 50), results: [
      { studentId: 'docA', studentName: 'A', marks: 40 }, { studentId: 'docB', studentName: 'B', marks: -1 }, { studentId: 'docC', studentName: 'C', marks: 25 },
    ] }, { overwrite: true });
    await resultsService.saveClassResults({ ...base('Mathematics', 'endOfTerm', 'T1', 100), results: [
      { studentId: 'docA', studentName: 'A', marks: 70 }, { studentId: 'docB', studentName: 'B', marks: 60 },
      { studentId: 'docC', studentName: 'C', marks: 50 }, { studentId: 'docD', studentName: 'D', marks: 90 },
    ] }, { overwrite: true });
    // English (T3 covering): W4 for all four; EOT not yet.
    authState.uid = 'T3';
    await resultsService.saveClassResults({ ...base('English', 'week4', 'T3', 50), results: [
      { studentId: 'docA', studentName: 'A', marks: 30 }, { studentId: 'docB', studentName: 'B', marks: 35 },
      { studentId: 'docC', studentName: 'C', marks: 20 }, { studentId: 'docD', studentName: 'D', marks: 45 },
    ] }, { overwrite: true });
    // A Week 8 mark saved before the admin switched Week 8 off — must be ignored.
    authState.uid = 'T1';
    await resultsService.saveClassResults({ ...base('Mathematics', 'week8', 'T1', 50), results: [{ studentId: 'docA', studentName: 'A', marks: 5 }] }, { overwrite: true });
    // An old row for a learner who left the class — must be ignored.
    const { store } = await import('../test/fakeFirestore');
    store.get('results')!.set('old', { classId: 'C1', subjectId: 'Mathematics', studentId: 'docGONE', examType: 'week4', term: TERM, year: YEAR, marks: 50, totalMarks: 50, percentage: 100 });
    resultsService.invalidateGrid();
  });

  it('Results Entry (per subject) == Monitor (per teacher, per subject)', async () => {
    const entry = await resultsService.getSubjectCompletionStatus('C1', TERM, YEAR);
    const monitor = await loadMonitorData(TERM, YEAR, [{ id: 'C1', name: 'Form 1A', formTeacherId: 'T1' }]);

    // Subjects: Biology (vacant, no marks) and Form Teacher are not subjects.
    expect(entry.map(s => s.subjectId).sort()).toEqual(['English', 'Mathematics']);

    const maths = entry.find(s => s.subjectId === 'Mathematics')!;
    expect(maths.totalStudents).toBe(4);
    expect(maths.enteredStudents.week4).toBe(3);
    expect(maths.enteredStudents.endOfTerm).toBe(4);
    expect(maths.missingStudentIds!.week4).toEqual(['docD']);
    expect(maths.percentComplete).toBe(88); // 7 of 8

    const t1 = monitor.teachers.find(t => t.teacherId === 'T1')!;
    const t1Maths = t1.classProgress[0].subjects.find(s => s.subjectId === 'Mathematics')!;
    expect(t1Maths.completionPercentage).toBe(maths.percentComplete);
    expect(t1Maths.week4StudentCount).toBe(maths.enteredStudents.week4);
    expect(t1.missingCount).toBe(1);
    expect(t1.missingEntries[0].missingStudentIds).toEqual(['docD']);
    expect(t1.formTeacherClasses).toEqual(['C1']);   // form teacher role shown, not counted

    // English is credited to the covering teacher T3, not the owner T2.
    expect(monitor.teachers.find(t => t.teacherId === 'T2')).toBeUndefined();
    const t3 = monitor.teachers.find(t => t.teacherId === 'T3')!;
    const eng = entry.find(s => s.subjectId === 'English')!;
    expect(t3.completionPercentage).toBe(eng.percentComplete);
    expect(t3.teachingAssignments[0].isDelegate).toBe(true);
    expect(monitor.failedClasses).toEqual([]);
  });

  it('Report Cards list == report card == SMS', async () => {
    const list = await resultsService.getStudentProgress('C1', TERM, YEAR);
    expect(list.map(s => s.studentName)).toEqual(['Alice Banda', 'Ben Chola', 'Chipo Daka', 'Dalitso Mwale']);

    const alice = list.find(s => s.documentId === 'docA')!;
    // Maths complete (W4 + EOT); English pending EOT → 1 of 2 subjects
    expect(alice.totalSubjects).toBe(2);
    expect(alice.completionPercentage).toBe(50);
    // Maths: W4 80%, EOT 70% → 75; English: W4 60% → 60; overall 68 (67.5 rounds to 68)
    expect(alice.overallPercentage).toBe(68);

    const card = (await resultsService.generateReportCard('F1A_001', TERM, YEAR, { includeIncomplete: true }))!;
    expect(card.percentage).toBe(alice.overallPercentage);
    expect(card.completionPercentage).toBe(alice.completionPercentage);
    expect(card.isProvisional).toBe(true);
    expect(card.subjects.find(s => s.subjectId === 'English')!.endOfTerm).toBe(MARK.PENDING);
    expect(card.subjects.find(s => s.subjectId === 'Mathematics')!.average).toBe(75); // Week 8 ignored

    const ben = (await resultsService.generateReportCard('docB', TERM, YEAR, { includeIncomplete: true }))!;
    expect(ben.subjects.find(s => s.subjectId === 'Mathematics')!.week4).toBe(MARK.ABSENT);

    const sms = (await resultsService.formatStudentResultsSMSAsync('F1A_001', TERM, YEAR))!;
    expect(sms.payload.overallPercentage).toBe(card.percentage);
    expect(sms.body).toContain(`AVG ${card.percentage}`);
    expect(sms.body).toContain('PROVISIONAL');

    const cls = await resultsService.formatClassResultsSMSAsync('C1', TERM, YEAR);
    expect(cls.messages.find(m => m.documentId === 'docA')!.payload.overallPercentage).toBe(card.percentage);
    expect(cls.messages.find(m => m.documentId === 'docA')!.studentId).toBe('F1A_001'); // same id the SMS backend always got
  });

  it('class positions come from the same averages', async () => {
    const bulk = await resultsService.generateClassReportCards('C1', TERM, YEAR, { includeIncomplete: true });
    const byName = Object.fromEntries(bulk.reportCards.map(c => [c.studentName, c]));
    // Dalitso: Maths EOT 90 → 90, English W4 90 → 90 → overall 90 → 1st
    expect(byName['Dalitso Mwale'].position).toBe('1/4');
    const sorted = [...bulk.reportCards].sort((a, b) => b.percentage - a.percentage);
    expect(sorted[0].studentName).toBe('Dalitso Mwale');
    // archived learner never gets a card
    expect(bulk.reportCards.find(c => c.studentName === 'Zed Archived')).toBeUndefined();
  });

  it('archived learners get no report card', async () => {
    expect(await resultsService.generateReportCard('docZ', TERM, YEAR, { includeIncomplete: true })).toBeNull();
  });
});
