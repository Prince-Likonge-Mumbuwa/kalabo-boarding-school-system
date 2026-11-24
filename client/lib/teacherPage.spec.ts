import { describe, expect, it } from 'vitest';
import { writingPosition } from '@/components/ai/GenerationStage';
import { startsTeacherPage } from './teacherPage';

describe('learner notes on paper', () => {
  it('starts a new page only at the teacher\'s answers', () => {
    expect(startsTeacherPage("## Answers (Teacher's Copy)")).toBe(true);
    expect(startsTeacherPage('## Answers (Teacher’s copy)')).toBe(true);
    expect(startsTeacherPage('## Answers')).toBe(false);
    expect(startsTeacherPage('## Marking Key')).toBe(false);
    expect(startsTeacherPage("### Answers (Teacher's Copy)")).toBe(false);
  });

  it('shows the notes\' own sections as one writing step', () => {
    expect(writingPosition('learnerNotes', '## Learning Outcomes\n- x').index).toBe(0);
    expect(writingPosition('learnerNotes', '## Learning Outcomes\n## 2.1.1 Formulas\n### Cell references').index).toBe(1);
    expect(writingPosition('learnerNotes', '## Learning Outcomes\n## Formulas\n## Key Terms').index).toBe(2);
    expect(writingPosition('learnerNotes', "## Learning Outcomes\n## Formulas\n## Key Terms\n## Summary\n## Practice Exercise\n## Answers (Teacher's Copy)").index).toBe(5);
    // Other tools are unchanged.
    expect(writingPosition('assessment', '## Paper Details\n## Marking Key').index).toBe(3);
  });
});
