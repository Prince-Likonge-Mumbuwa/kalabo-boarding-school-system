import { describe, it, expect, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';

vi.mock('@/lib/schoolLogo', () => ({ embedSchoolLogo: async () => null }));

import { buildMarkSchedulePDF } from './markSchedulePDF';
import { buildResultsGrid, type GridLearner, type RawResult } from '@/services/resultsGrid';
import { buildSubjectProgressReport } from '@/services/markScheduleProgress';

const NAMES = ['Alice Banda', 'Ben Chola', 'Chipo Daka', 'Dalitso Mwale', 'Esther Phiri', 'Felix Tembo', 'Grace Zulu', 'Hope Mulenga', 'Isaac Lungu', 'Joyce Sakala'];
const learners: GridLearner[] = Array.from({ length: 40 }, (_, i) => ({
  id: `doc${i}`, studentId: `F2A_${String(i + 1).padStart(3, '0')}`, name: `${NAMES[i % 10]} ${i + 1}`,
}));
const subject = { subjectId: 'Mathematics', subjectName: 'Mathematics', ownerTeacherId: 'T1', ownerTeacherName: 'Mr One', operatorTeacherId: 'T1', operatorTeacherName: 'Mr One', operatorRole: 'owner' };
const totals = { week4: 50, week8: 50, endOfTerm: 100 } as const;

/** Term grid: learner i scores base + drift per test; a few absences; tests after `upTo` pending. */
function termGrid(termIndex: number, upTo: number) {
  const results: RawResult[] = [];
  (['week4', 'week8', 'endOfTerm'] as const).forEach((exam, k) => {
    if (k > upTo) return;
    learners.forEach((l, i) => {
      if ((i + k + termIndex) % 17 === 0) { results.push({ studentId: l.id, subjectId: 'Mathematics', examType: exam, marks: -1 }); return; }
      const pct = Math.max(5, Math.min(98, 30 + ((i * 37) % 55) + (termIndex * 3 + k) * (i % 3 === 0 ? 4 : i % 3 === 1 ? -2 : 1)));
      const marks = Math.round((pct / 100) * totals[exam]);
      results.push({ studentId: l.id, subjectId: 'Mathematics', examType: exam, marks, totalMarks: totals[exam], percentage: Math.round((marks / totals[exam]) * 100) });
    });
  });
  return buildResultsGrid({ learners, subjects: [subject], activeExams: ['week4', 'week8', 'endOfTerm'], results });
}

const config = { isActive: true, examTypes: { week4: true, week8: true, endOfTerm: true }, week4TotalMarks: 50, week8TotalMarks: 50, endOfTermTotalMarks: 100 } as any;

const base = {
  className: 'Form 2A', subject: 'Mathematics', examType: 'week8' as const, term: 'Term 3', year: 2026, totalMarks: 50,
  students: learners.map((l, i) => ({ name: l.name, studentId: l.studentId, id: l.id, marks: String(20 + (i % 30)) })),
  teacherName: 'Mr One', schoolName: 'KALABO BOARDING SECONDARY SCHOOL',
};

describe('mark schedule PDF', () => {
  it('adds the progress table (all learners, every test this year) and the progress chart', async () => {
    const progress = buildSubjectProgressReport({
      subject: 'Mathematics',
      terms: [
        { term: 'Term 1', year: 2026, grid: termGrid(0, 2), config },
        { term: 'Term 2', year: 2026, grid: termGrid(1, 2), config },
        { term: 'Term 3', year: 2026, grid: termGrid(2, 1), config },
      ],
    });
    expect(progress.points).toHaveLength(9);
    expect(progress.rows).toHaveLength(40);
    const bytes = await buildMarkSchedulePDF({ ...base, progress });
    if (process.env.MARK_SCHEDULE_PDF_OUT) writeFileSync(process.env.MARK_SCHEDULE_PDF_OUT, bytes);
    const doc = await PDFDocument.load(bytes);
    const sizes = doc.getPages().map(p => Math.round(p.getWidth()));
    // 2 portrait schedule pages, then landscape: 40 learners need 2 table pages, then the chart.
    expect(sizes).toEqual([595, 595, 842, 842, 842]);
  });

  it('without progress data it prints the schedule only', async () => {
    const doc = await PDFDocument.load(await buildMarkSchedulePDF(base));
    expect(doc.getPageCount()).toBe(2);
  });

  it('if the progress could not be loaded it says so instead of printing empty pages', async () => {
    const doc = await PDFDocument.load(await buildMarkSchedulePDF({ ...base, progress: null, progressError: 'offline' }));
    expect(doc.getPageCount()).toBe(3);
  });
});
