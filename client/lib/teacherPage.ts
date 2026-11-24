// @/lib/teacherPage.ts — learner notes end with "## Answers (Teacher's Copy)".
// That heading starts a new page wherever the notes are printed (the paper,
// Word, the eFile PDF), so the teacher can hand out the notes and keep the
// answers back.
export const startsTeacherPage = (line: string): boolean => /^##\s+Answers\s*\(Teacher/i.test(line.trim());
