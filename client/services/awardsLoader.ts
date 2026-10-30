// @/services/awardsLoader.ts
//
// Reads what the award certificates need from Firestore, using the SAME
// loaders as Report Cards (resultsGridLoader), so the overall percentages
// and positions match the report cards exactly.
//
// Reads: the term's exam settings once, the term's results once, then each
// class's roster and subjects. Nothing is written.

import {
  loadClassGrid,
  loadTermContext,
  loadTermResults,
} from '@/services/resultsGridLoader';
import { EXAM_LABELS, learnerProgress } from '@/services/resultsGrid';
import type { ClassStanding } from '@/services/awardsService';
import type { ExamType } from '@/types/exam';

/** The class fields needed (a Class from useSchoolClasses fits). */
export interface AwardClassInput {
  id: string;
  name: string;
  type: 'grade' | 'form';
  level: number;
}

export interface LoadedStandings {
  classes: ClassStanding[];
  /** Labels of the tests that ran this term, e.g. ["Week 4", "Week 8", "End of Term"]. */
  testLabels: string[];
}

export async function loadAwardStandings(
  classes: AwardClassInput[],
  term: string,
  year: number,
): Promise<LoadedStandings> {
  const ctx = await loadTermContext(term, year);
  const termResults = await loadTermResults(ctx.term, ctx.year);

  const standings = await Promise.all(
    classes.map(async (c): Promise<ClassStanding> => {
      const { grid } = await loadClassGrid(c.id, ctx.term, ctx.year, {
        ctx,
        termResults,
        classInfo: { id: c.id, name: c.name, form: String(c.level) },
      });
      return {
        classId: c.id,
        className: c.name,
        type: c.type,
        level: c.level,
        learners: grid.learners.map(l => {
          const p = learnerProgress(grid, l.id);
          return {
            learnerId: l.id,
            name: p.name,
            overallPercentage: p.overallPercentage,
            overallGrade: p.overallGrade,
            isComplete: p.isComplete,
            hasAnyMarks: p.hasAnyMarks,
          };
        }),
      };
    }),
  );

  return {
    classes: standings,
    testLabels: (ctx.activeExams as ExamType[]).map(e => EXAM_LABELS[e]),
  };
}
