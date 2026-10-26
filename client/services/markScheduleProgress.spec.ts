import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase/firestore', async () => await import('../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}), onAuthStateChanged: () => () => {} }));

import { buildResultsGrid, learnerProgress, type GridLearner, type GridSubject, type RawResult } from './resultsGrid';
import { buildSubjectProgressReport, cellText, findSubjectId } from './markScheduleProgress';
import { termsUpTo } from './markScheduleProgressLoader';

const subj = (subjectId: string): GridSubject => ({
  subjectId, subjectName: subjectId, ownerTeacherId: 'T1', ownerTeacherName: 'Mr One',
  operatorTeacherId: 'T1', operatorTeacherName: 'Mr One', operatorRole: 'owner',
});
const L = (id: string, studentId: string, name: string): GridLearner => ({ id, studentId, name });
const res = (studentId: string, examType: string, marks: number, totalMarks: number, subjectId = 'Mathematics'): RawResult => ({
  studentId, subjectId, examType, marks, totalMarks, percentage: marks >= 0 ? Math.round((marks / totalMarks) * 100) : undefined,
});
const cfg = (w4: number, w8: number, eot: number) => ({
  term: 'x', year: 2026, isActive: true, examTypes: { week4: true, week8: true, endOfTerm: true },
  week4TotalMarks: w4, week8TotalMarks: w8, endOfTermTotalMarks: eot,
}) as any;

const alice = L('docA', 'F1A_001', 'Alice Banda');
const ben = L('docB', 'F1A_002', 'Ben Chola');
const chipo = L('docC', 'F1A_003', 'Chipo Daka');
const dalitso = L('docD', 'F1A_004', 'Dalitso Mwale'); // joined in Term 2

// Term 1: W4 out of 50, W8 out of 50, EOT out of 100.
const term1 = buildResultsGrid({
  learners: [alice, ben, chipo],
  subjects: [subj('Mathematics'), subj('English')],
  activeExams: ['week4', 'week8', 'endOfTerm'],
  results: [
    res('docA', 'week4', 30, 50), res('docA', 'week8', 35, 50), res('docA', 'endOfTerm', 80, 100),
    res('docB', 'week4', 20, 50), res('docB', 'week8', -1, 50), res('docB', 'endOfTerm', 45, 100),
    // An old row saved by admission number (older code): still Chipo.
    res('F1A_003', 'week4', 10, 50), res('docC', 'week8', 15, 50), res('docC', 'endOfTerm', 30, 100),
    res('docA', 'week4', 50, 50, 'English'),
  ],
});
// Term 2: only Week 4 and Week 8 so far (EOT pending), W4 out of 40.
const term2 = buildResultsGrid({
  learners: [alice, ben, chipo, dalitso],
  subjects: [subj('Mathematics')],
  activeExams: ['week4', 'week8', 'endOfTerm'],
  results: [
    res('docA', 'week4', 36, 40), res('docB', 'week4', 30, 40), res('docC', 'week4', 8, 40), res('docD', 'week4', 20, 40),
    res('docA', 'week8', 45, 50),
  ],
});

const report = buildSubjectProgressReport({
  subject: 'Maths', // spelled differently from the grid's "Mathematics"
  subjectCandidates: ['Mathematics'],
  terms: [
    { term: 'Term 1', year: 2026, grid: term1, config: cfg(50, 50, 100) },
    { term: 'Term 2', year: 2026, grid: term2, config: cfg(40, 50, 100) },
  ],
});
const row = (name: string) => report.rows.find(r => r.name === name)!;

describe('buildSubjectProgressReport', () => {
  it('lists every test of the year in order, with its total marks', () => {
    expect(report.points.map(p => p.short)).toEqual(['T1 W4', 'T1 W8', 'T1 EOT', 'T2 W4', 'T2 W8', 'T2 EOT']);
    expect(report.points.map(p => p.totalMarks)).toEqual([50, 50, 100, 40, 50, 100]);
    expect(report.terms.map(t => t.short)).toEqual(['T1', 'T2']);
  });

  it('learners are the class of the term shown, in grid order', () => {
    expect(report.rows.map(r => r.name)).toEqual(['Alice Banda', 'Ben Chola', 'Chipo Daka', 'Dalitso Mwale']);
  });

  it('shows percentages (not raw marks), absences, pending and not-in-class', () => {
    const a = row('Alice Banda');
    expect(['T1 W4', 'T1 W8', 'T1 EOT', 'T2 W4', 'T2 W8', 'T2 EOT'].map((_, i) => cellText(a.cells[report.points[i].key])))
      .toEqual(['60', '70', '80', '90', '90', '—']);
    expect(cellText(row('Ben Chola').cells[report.points[1].key])).toBe('ABS');
    expect(cellText(row('Chipo Daka').cells[report.points[0].key])).toBe('20'); // row saved by admission number
    expect(row('Dalitso Mwale').cells[report.points[0].key].status).toBe('not_in_class');
    expect(cellText(row('Dalitso Mwale').cells[report.points[0].key])).toBe('');
  });

  it('a term average is the report card subject average for that term', () => {
    const t1 = report.terms[0].key;
    for (const l of [alice, ben, chipo]) {
      const card = learnerProgress(term1, l.id).subjects.find(s => s.subjectId === 'Mathematics')!;
      expect(report.rows.find(r => r.learnerId === l.id)!.termAverages[t1]).toBe(card.average);
    }
    expect(row('Alice Banda').termAverages).toEqual({ [report.terms[0].key]: 70, [report.terms[1].key]: 90 });
    expect(row('Alice Banda').yearAverage).toBe(80);
    expect(row('Alice Banda').grade).toBe(1);
    // Absent is not a zero: Ben's Term 1 average is (40 + 45) / 2.
    expect(row('Ben Chola').termAverages[t1]).toBe(43);
  });

  it('change runs from the first to the latest mark; positions by year average share ties', () => {
    expect(row('Alice Banda')).toMatchObject({ first: 60, latest: 90, change: 30, position: '1' });
    expect(row('Chipo Daka')).toMatchObject({ first: 20, latest: 20, change: 0 });
    expect(row('Dalitso Mwale')).toMatchObject({ first: 50, latest: 50, change: null, yearAverage: 50 });
    // Year averages: Alice 80, Ben 59, Chipo 24, Dalitso 50.
    expect(report.rows.map(r => r.position)).toEqual(['1', '2', '4', '3']);
  });

  it('class statistics per test', () => {
    const t1w4 = report.stats[report.points[0].key];
    expect(t1w4).toMatchObject({ entered: 3, absent: 0, pending: 0, mean: 40, highest: 60, lowest: 20, passRate: 67, qualityRate: 0 });
    const t1w8 = report.stats[report.points[1].key];
    expect(t1w8).toMatchObject({ entered: 2, absent: 1, mean: 50 });
    const t2w8 = report.stats[report.points[4].key];
    expect(t2w8).toMatchObject({ entered: 1, pending: 3 });
    const t2eot = report.stats[report.points[5].key];
    expect(t2eot).toMatchObject({ entered: 0, pending: 4, mean: null, passRate: null });
  });

  it('grade spread, most improved and needs attention', () => {
    // Alice 80 → 1, Ben (43 + 75)/2 = 59 → 5, Chipo (27 + 20)/2 = 24 → 9, Dalitso 50 → 6
    expect(report.gradeDistribution).toEqual([1, 0, 0, 0, 1, 1, 0, 0, 1]);
    // Ben 40 → 75 (+35), Alice 60 → 90 (+30): biggest rise first.
    expect(report.improved.map(r => r.name)).toEqual(['Ben Chola', 'Alice Banda']);
    expect(report.needsAttention.map(r => r.name)).toEqual(['Chipo Daka']);
    expect(report.hasMarks).toBe(true);
  });

  it('a term that could not be loaded is reported, and the rest still shows', () => {
    const r = buildSubjectProgressReport({
      subject: 'Mathematics',
      terms: [
        { term: 'Term 1', year: 2026, grid: null, error: 'offline' },
        { term: 'Term 2', year: 2026, grid: term2, config: cfg(40, 50, 100) },
      ],
    });
    expect(r.problems).toEqual(['Term 1 2026 could not be loaded: offline.']);
    expect(r.points.map(p => p.short)).toEqual(['T2 W4', 'T2 W8', 'T2 EOT']);
    expect(r.rows).toHaveLength(4);
  });

  it('no marks at all', () => {
    const empty = buildResultsGrid({ learners: [alice], subjects: [subj('Mathematics')], activeExams: ['week4'], results: [] });
    const r = buildSubjectProgressReport({ subject: 'Mathematics', terms: [{ term: 'Term 1', year: 2026, grid: empty }] });
    expect(r.hasMarks).toBe(false);
    expect(r.rows[0]).toMatchObject({ yearAverage: null, grade: -1, position: '—', change: null });
  });
});

describe('helpers', () => {
  it('findSubjectId matches however the subject is spelled', () => {
    expect(findSubjectId(term1, ['english'])).toBe('English');
    expect(findSubjectId(term1, ['Physics'])).toBeNull();
  });
  it('termsUpTo gives Term 1 up to the term shown', () => {
    expect(termsUpTo('Term 1')).toEqual(['Term 1']);
    expect(termsUpTo('Term 3')).toEqual(['Term 1', 'Term 2', 'Term 3']);
  });
});
