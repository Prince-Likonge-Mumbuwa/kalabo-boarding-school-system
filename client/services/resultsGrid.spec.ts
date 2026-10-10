// Tests for the shared results grid. Every scenario here came from a real
// disagreement found between the Results Entry page, the Monitor, the Report
// Cards progress bar, the report card, the SMS and the Parent Portal.
import { describe, it, expect } from 'vitest';
import {
  buildRoster,
  buildResultsGrid,
  subjectProgress,
  learnerProgress,
  classPositions,
  buildReportCard,
  activeExamsFor,
  pickTermConfig,
  gradeForPercentage,
  MARK,
  type GridSubject,
  type RawResult,
  type ExamType,
} from './resultsGrid';

// ---------- helpers ----------
const subj = (id: string, owner = 'T1', operator: string | null = owner): GridSubject => ({
  subjectId: id,
  subjectName: id,
  ownerTeacherId: owner,
  ownerTeacherName: `Teacher ${owner}`,
  operatorTeacherId: operator,
  operatorTeacherName: operator ? `Teacher ${operator}` : null,
  operatorRole: operator === owner ? 'owner' : 'leave-cover',
});
const res = (studentId: string, subjectId: string, examType: string, marks: number, totalMarks = 100): RawResult => ({
  studentId, subjectId, examType, marks, totalMarks,
  percentage: marks >= 0 ? Math.round((marks / totalMarks) * 100) : -1,
});
const learners = (n: number, extra: Partial<{ status: string }>[] = []) =>
  Array.from({ length: n }, (_, i) => ({
    id: `doc${i + 1}`, studentId: `F1A_${String(i + 1).padStart(3, '0')}`, name: `Learner ${String(i + 1).padStart(2, '0')}`,
    ...(extra[i] ?? {}),
  }));
const marksFor = (ids: string[], subjectId: string, exam: ExamType, marks = 50) => ids.map(id => res(id, subjectId, exam, marks));
const ids = (n: number) => Array.from({ length: n }, (_, i) => `doc${i + 1}`);
const BOTH: ExamType[] = ['week4', 'week8'];

// ---------- exam config ----------
describe('exam configuration', () => {
  it('uses isExamActive: an exam needs its box ticked AND total marks > 0', () => {
    const cfg: any = {
      term: 'Term 3', year: 2026, isActive: true,
      examTypes: { week4: true, week8: true, endOfTerm: true },
      week4TotalMarks: 50, week8TotalMarks: 0, endOfTermTotalMarks: 100,
    };
    expect(activeExamsFor(cfg)).toEqual(['week4', 'endOfTerm']);
  });
  it('a switched-off config activates nothing', () => {
    const cfg: any = { term: 'Term 3', year: 2026, isActive: false, examTypes: { week4: true }, week4TotalMarks: 50 };
    expect(activeExamsFor(cfg)).toEqual([]);
  });
  it('picks the active config for the term, never another term', () => {
    const configs: any[] = [
      { id: 'a', term: 'Term 1', year: 2026, isActive: true },
      { id: 'b', term: 'Term 3', year: 2026, isActive: false },
      { id: 'c', term: 'Term 3', year: 2026, isActive: true },
    ];
    expect(pickTermConfig(configs, 'Term 3', 2026)?.id).toBe('c');
    expect(pickTermConfig(configs, 'Term 2', 2026)).toBeUndefined();
  });
});

// ---------- roster ----------
describe('roster', () => {
  it('counts active learners and learners with no status; drops archived/withdrawn', () => {
    const r = buildRoster([
      { id: 'a', name: 'A', status: 'active' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C', status: 'archived' },
      { id: 'd', name: 'D', status: 'withdrawn' },
    ]);
    expect(r.map(l => l.id)).toEqual(['a', 'b']);
  });
  it('keeps learners that have no studentIndex (they used to vanish from the monitor)', () => {
    const r = buildRoster([{ id: 'a', name: 'A', status: 'active' }]);
    expect(r).toHaveLength(1);
  });
});

// ---------- the cases that used to disagree ----------
describe('grid counting', () => {
  it('baseline: all marked → 100% everywhere', () => {
    const roster = buildRoster(learners(10));
    const g = buildResultsGrid({
      learners: roster, subjects: [subj('Mathematics')], activeExams: BOTH,
      results: [...marksFor(ids(10), 'Mathematics', 'week4'), ...marksFor(ids(10), 'Mathematics', 'week8')],
    });
    const sp = subjectProgress(g, 'Mathematics');
    expect(sp.completionPercentage).toBe(100);
    expect(sp.isComplete).toBe(true);
    expect(learnerProgress(g, 'doc1').completionPercentage).toBe(100);
  });

  it('learner moved out: their old marks are ignored and the real gap (L9) is reported', () => {
    // Roster is doc1..doc9; doc10 moved to another class but has old marks here.
    const roster = buildRoster(learners(9));
    const g = buildResultsGrid({
      learners: roster, subjects: [subj('Mathematics')], activeExams: BOTH,
      results: [
        ...marksFor([...ids(8), 'doc10'], 'Mathematics', 'week4'),
        ...marksFor([...ids(9), 'doc10'], 'Mathematics', 'week8'),
      ],
    });
    const sp = subjectProgress(g, 'Mathematics');
    expect(sp.exams[0].doneCount).toBe(8);
    expect(sp.exams[0].missingLearnerIds).toEqual(['doc9']);
    expect(sp.completionPercentage).toBe(94); // 17 / 18
    expect(sp.missingEntries).toBe(1);
    expect(sp.completionPercentage).toBeLessThanOrEqual(100);
    expect(g.ignored.offRoster).toBe(2);
  });

  it('archived learner still in the class is not expected to have marks', () => {
    const roster = buildRoster(learners(10, Array(9).fill({}).concat([{ status: 'archived' }])));
    const g = buildResultsGrid({
      learners: roster, subjects: [subj('Mathematics')], activeExams: BOTH,
      results: [...marksFor(ids(9), 'Mathematics', 'week4'), ...marksFor(ids(9), 'Mathematics', 'week8')],
    });
    expect(subjectProgress(g, 'Mathematics').completionPercentage).toBe(100);
  });

  it('a partly not-conducted exam is NOT treated as fully not conducted', () => {
    const roster = buildRoster(learners(10));
    const g = buildResultsGrid({
      learners: roster, subjects: [subj('Mathematics')], activeExams: BOTH,
      results: [
        res('doc1', 'Mathematics', 'week4', MARK.NOT_CONDUCTED),
        ...marksFor(['doc2', 'doc3', 'doc4', 'doc5'], 'Mathematics', 'week4'),
        ...marksFor(ids(10), 'Mathematics', 'week8'),
      ],
    });
    const w4 = subjectProgress(g, 'Mathematics').exams[0];
    expect(w4.notConducted).toBe(false);
    expect(w4.doneCount).toBe(5);
    expect(w4.missingLearnerIds).toHaveLength(5);
  });

  it('a whole exam marked not conducted counts as done, even for a learner who joined later', () => {
    const roster = buildRoster(learners(10));
    const g = buildResultsGrid({
      learners: roster, subjects: [subj('Mathematics')], activeExams: BOTH,
      results: [
        ...marksFor(ids(9), 'Mathematics', 'week4', MARK.NOT_CONDUCTED), // doc10 joined after
        ...marksFor(ids(10), 'Mathematics', 'week8'),
      ],
    });
    const sp = subjectProgress(g, 'Mathematics');
    expect(sp.exams[0].notConducted).toBe(true);
    expect(sp.exams[0].doneCount).toBe(10);
    expect(sp.completionPercentage).toBe(100);
  });

  it('a switched-off exam is ignored even if marks were saved for it', () => {
    const roster = buildRoster(learners(10));
    const g = buildResultsGrid({
      learners: roster, subjects: [subj('Mathematics')], activeExams: ['week4', 'endOfTerm'],
      results: [...marksFor(ids(10), 'Mathematics', 'week4'), ...marksFor(ids(10), 'Mathematics', 'endOfTerm'), ...marksFor(ids(3), 'Mathematics', 'week8')],
    });
    expect(subjectProgress(g, 'Mathematics').completionPercentage).toBe(100);
    expect(g.ignored.inactiveExam).toBe(3);
  });

  it('results saved under the custom id (old code) still match the learner', () => {
    const roster = buildRoster(learners(2));
    const g = buildResultsGrid({
      learners: roster, subjects: [subj('Mathematics')], activeExams: ['week4'],
      results: [res('F1A_001', 'Mathematics', 'week4', 70), res('doc2', 'Mathematics', 'week4', 60)],
    });
    expect(subjectProgress(g, 'Mathematics').completionPercentage).toBe(100);
  });

  it('absent counts as done', () => {
    const roster = buildRoster(learners(2));
    const g = buildResultsGrid({
      learners: roster, subjects: [subj('Mathematics')], activeExams: ['week4'],
      results: [res('doc1', 'Mathematics', 'week4', MARK.ABSENT), res('doc2', 'Mathematics', 'week4', 60)],
    });
    expect(subjectProgress(g, 'Mathematics').isComplete).toBe(true);
  });

  it('results for a subject the class no longer has (or Form Teacher) are ignored', () => {
    const roster = buildRoster(learners(1));
    const g = buildResultsGrid({
      learners: roster, subjects: [subj('Mathematics')], activeExams: ['week4'],
      results: [res('doc1', 'Mathematics', 'week4', 70), res('doc1', 'History', 'week4', 70), res('doc1', 'form-teacher', 'week4', 70)],
    });
    expect(g.ignored.unknownSubject).toBe(2);
    expect(learnerProgress(g, 'doc1').totalSubjects).toBe(1);
  });
});

// ---------- report card: the 57% vs 62% case ----------
describe('report card', () => {
  // Week 8 switched off after Maths had entered it; English W4 absent;
  // Biology End of Term not entered; History removed; Form Teacher exists
  // (neither History nor Form Teacher is a subject in the grid).
  const roster = buildRoster([{ id: 'docL1', studentId: 'F1A_001', name: 'Learner One', status: 'active' }]);
  const g = buildResultsGrid({
    learners: roster,
    subjects: [subj('Mathematics'), subj('English'), subj('Biology')],
    activeExams: ['week4', 'endOfTerm'],
    results: [
      res('docL1', 'Mathematics', 'week4', 80), res('docL1', 'Mathematics', 'week8', 30), res('docL1', 'Mathematics', 'endOfTerm', 70),
      res('docL1', 'English', 'week4', MARK.ABSENT), res('docL1', 'English', 'endOfTerm', 60),
      res('docL1', 'Biology', 'week4', 50),
    ],
  });
  const card = buildReportCard(g, 'docL1', { classId: 'C1', className: 'Form 1A', form: '1', term: 'Term 3', year: 2026 });

  it('progress bar = completed real subjects / real subjects (2 of 3 = 67%)', () => {
    expect(learnerProgress(g, 'docL1').completionPercentage).toBe(67);
    expect(card.completionPercentage).toBe(67);
  });
  it('average uses only active exams: Maths 75, English 60, Biology 50 → 62%, grade 4', () => {
    expect(card.subjects.map(s => [s.subjectName, s.average])).toEqual([
      ['Mathematics', 75], ['English', 60], ['Biology', 50],
    ]);
    expect(card.percentage).toBe(62);
    expect(card.grade).toBe(4);
  });
  it('absent prints as ABS (-1); a mark not yet entered is pending (-3), never ABS', () => {
    const eng = card.subjects.find(s => s.subjectName === 'English')!;
    const bio = card.subjects.find(s => s.subjectName === 'Biology')!;
    expect(eng.week4).toBe(MARK.ABSENT);
    expect(bio.endOfTerm).toBe(MARK.PENDING);
    expect(bio.missingExams).toEqual(['End of Term']);
  });
  it('lists every subject, including ones with no marks yet', () => {
    const g2 = buildResultsGrid({
      learners: roster, subjects: [subj('Mathematics'), subj('Chemistry')], activeExams: ['week4'],
      results: [res('docL1', 'Mathematics', 'week4', 80)],
    });
    const c2 = buildReportCard(g2, 'docL1', { classId: 'C1', className: 'Form 1A', form: '1', term: 'Term 3', year: 2026 });
    expect(c2.subjects.map(s => s.subjectName)).toEqual(['Mathematics', 'Chemistry']);
    expect(c2.subjects[1].average).toBe(-1);
    expect(c2.isProvisional).toBe(true);
  });
  it('is provisional while anything is pending, and says so in the comment', () => {
    expect(card.isProvisional).toBe(true);
    expect(card.teachersComment.startsWith('PROVISIONAL')).toBe(true);
  });
});

// ---------- positions ----------
describe('class positions', () => {
  it('ranks from the same averages, ties share a place, learners without marks get —', () => {
    const roster = buildRoster(learners(4));
    const g = buildResultsGrid({
      learners: roster, subjects: [subj('Mathematics')], activeExams: ['week4'],
      results: [res('doc1', 'Mathematics', 'week4', 90), res('doc2', 'Mathematics', 'week4', 70), res('doc3', 'Mathematics', 'week4', 70)],
    });
    const pos = classPositions(g);
    expect(pos.get('doc1')).toBe('1/3');
    expect(pos.get('doc2')).toBe('2/3');
    expect(pos.get('doc3')).toBe('2/3');
    expect(pos.get('doc4')).toBe('—');
  });
});

// ---------- grades ----------
describe('grades', () => {
  it('ECZ bands', () => {
    expect([75, 74, 65, 60, 55, 50, 45, 40, 39, -1].map(gradeForPercentage)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, -1]);
  });
});
