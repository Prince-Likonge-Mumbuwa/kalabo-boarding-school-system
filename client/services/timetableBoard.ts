// Pure helpers for the admin "Who's teaching" board.
import type { BoardClass, BoardLesson, BoardStatus } from '@/services/timetableService';

export interface BoardSummary {
  lessons: number;
  taken: number;
  inProgress: number;
  missed: number;
  uncovered: number;
  upcoming: number;
  dailyTaken: number;
  classes: number;
}

export function summarizeBoard(classes: BoardClass[]): BoardSummary {
  const all = classes.flatMap(c => c.lessons);
  const n = (s: BoardStatus) => all.filter(l => l.status === s).length;
  return {
    lessons: all.length,
    taken: n('taken'),
    inProgress: n('in-progress'),
    missed: n('missed'),
    uncovered: n('uncovered'),
    upcoming: n('upcoming'),
    dailyTaken: classes.filter(c => c.dailyTaken).length,
    classes: classes.length,
  };
}

/** What each class has in one period (null = free). */
export function classesInPeriod(classes: BoardClass[], periodIndex: number) {
  return classes.map(c => ({ cls: c, lesson: c.lessons.find(l => l.row.entry.periodIndex === periodIndex) ?? null }));
}

/** A teacher's lessons that day (as the one teaching), in period order. */
export function teacherDay(classes: BoardClass[], query: string): Array<{ teacher: string; lessons: BoardLesson[] }> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const by = new Map<string, BoardLesson[]>();
  for (const l of classes.flatMap(c => c.lessons)) {
    const name = l.row.operatorTeacherName ?? '';
    if (!name.toLowerCase().includes(q)) continue;
    by.set(name, [...(by.get(name) ?? []), l]);
  }
  return Array.from(by.entries())
    .map(([teacher, lessons]) => ({ teacher, lessons: lessons.sort((a, b) => a.row.entry.periodIndex - b.row.entry.periodIndex) }))
    .sort((a, b) => a.teacher.localeCompare(b.teacher));
}

export const STATUS_LABEL: Record<BoardStatus, string> = {
  taken: 'Register taken',
  'in-progress': 'Not yet marked',
  missed: 'Missed',
  uncovered: 'Uncovered',
  upcoming: 'Later',
};
