// The school's pass rule: the ONLY fail is grade 9 (0–39%). Grades 1–8 pass.
// Every screen, dashboard and PDF uses these helpers.
import { describe, it, expect } from 'vitest';
import {
  gradeForPercentage, gradeForAverage, gradeCategory, isFailGrade, isPassGrade, isPassPercentage,
  isQualityGrade, isQuantityGrade, teacherCommentFor,
} from './resultsGrid';

describe('pass rule: only grade 9 fails', () => {
  it('40–44% is grade 8, a pass (Satisfactory); 0–39% is grade 9, the only fail', () => {
    expect(gradeForPercentage(44)).toBe(8);
    expect(gradeForPercentage(40)).toBe(8);
    expect(gradeForPercentage(39)).toBe(9);
    expect(gradeForPercentage(0)).toBe(9);
    expect(gradeCategory(8)).toBe('satisfactory');
    expect(gradeCategory(7)).toBe('satisfactory');
    expect(gradeCategory(9)).toBe('fail');
    for (let g = 1; g <= 8; g++) { expect(isPassGrade(g)).toBe(true); expect(isFailGrade(g)).toBe(false); }
    expect(isPassGrade(9)).toBe(false);
    expect(isFailGrade(9)).toBe(true);
    expect(isPassGrade(-1)).toBe(false); // no mark is neither
    expect(isFailGrade(-1)).toBe(false);
  });

  it('pass by percentage: 40% and above; a missing mark is neither pass nor fail', () => {
    expect(isPassPercentage(40)).toBe(true);
    expect(isPassPercentage(39.5)).toBe(true); // rounds to 40, like the report card
    expect(isPassPercentage(39.4)).toBe(false);
    expect(isPassPercentage(49)).toBe(true); // the old 50% rule called this a fail
    expect(isPassPercentage(-1)).toBe(false);
  });

  it('quality = grades 1–2, quantity = grades 3–8; every learner is exactly one of quality, quantity or fail', () => {
    for (let g = 1; g <= 9; g++) {
      const n = [isQualityGrade(g), isQuantityGrade(g), isFailGrade(g)].filter(Boolean).length;
      expect(n).toBe(1);
    }
    expect(isQuantityGrade(8)).toBe(true);
    expect(isQuantityGrade(2)).toBe(false);
  });

  it('averages are graded after rounding, so the analysis and the report card agree', () => {
    expect(gradeForAverage([40, 39, 40])).toBe(8); // 39.67 → 40 → grade 8 (was 9 in the analysis)
    expect(gradeForAverage([70, 69, 70])).toBe(2); // 69.67 → 70 → grade 2
    expect(gradeForAverage([39, 39, 40])).toBe(9); // 39.33 → 39
    expect(gradeForAverage([-1, 45])).toBe(7); // absent marks are left out
    expect(gradeForAverage([])).toBe(-1);
  });

  it('report-card comment counts subjects passed at 40%+ and says "Satisfactory" for a 40–49% average', () => {
    const subj = (subjectName: string, average: number) => ({ subjectName, average, isComplete: true } as any);
    const text = teacherCommentFor({ percentage: 45, isProvisional: false, subjects: [subj('English', 42), subj('Maths', 48), subj('Biology', 38)] } as any);
    expect(text).toMatch(/^Satisfactory overall performance with 2\/3 subjects passed \(45% average\)/);
    expect(text).toMatch(/Biology/);
    expect(teacherCommentFor({ percentage: 55, isProvisional: false, subjects: [subj('English', 44), subj('Maths', 66)] } as any))
      .toMatch(/2\/2 subjects passed/);
    expect(teacherCommentFor({ percentage: 35, isProvisional: false, subjects: [subj('English', 35)] } as any))
      .toMatch(/^Performance requires improvement/);
  });
});
