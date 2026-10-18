// Builds the pages of the branded timetable PDFs from a generated version
// (admin / Timetabler) or from the live rows a teacher sees.
import type { TimetableCell, TimetablePage } from '@/services/pdf/timetablePDF';
import type { ResolvedTimetableEntry, Period } from '@/types/timetable';
import { groupIntoBlocks } from '@/services/timetableModel';
import type { PlacedLesson, Problem, TimetableVersion } from './types';

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true });

export function teacherNameOfSlot(P: Problem | null, slotId: string): string | null {
  const s = P?.slots.find(x => x.slotId === slotId);
  return s?.teacherNames[0] ?? null;
}

/** One page per class (all classes when `classIds` is empty). */
export function classPages(v: Pick<TimetableVersion, 'lessons' | 'slots'>, P: Problem | null, classIds: string[] = []): TimetablePage[] {
  const classes = new Map<string, string>();
  for (const l of v.lessons) classes.set(l.classId, v.slots[l.slotId]?.className ?? l.classId);
  const wanted = [...classes].map(([id, name]) => ({ id, name })).filter(c => !classIds.length || classIds.includes(c.id)).sort(byName);
  return wanted.map(c => {
    const mine = v.lessons.filter(l => l.classId === c.id);
    const periods = mine.reduce((n, l) => n + l.size, 0);
    return {
      heading: c.name,
      subheading: `Class timetable - ${periods} periods a week`,
      cells: mine.map<TimetableCell>(l => {
        const info = v.slots[l.slotId];
        return { day: l.day, start: l.start, size: l.size, lines: [info?.subject ?? '', teacherNameOfSlot(P, l.slotId) ?? 'No teacher yet', info?.roomName ?? ''] };
      }),
    };
  });
}

/** A teacher's page: every lesson of the subjects they own or cover. */
export function teacherPage(v: Pick<TimetableVersion, 'lessons' | 'slots'>, P: Problem, teacherId: string): TimetablePage {
  const t = P.teachers.find(x => x.id === teacherId);
  const slotIds = new Set(P.slots.filter(s => s.teacherIds.includes(teacherId)).map(s => s.slotId));
  const mine: PlacedLesson[] = v.lessons.filter(l => slotIds.has(l.slotId));
  const periods = mine.reduce((n, l) => n + l.size, 0);
  return {
    heading: t?.name ?? 'Teacher',
    subheading: `Teacher timetable - ${periods} periods a week`,
    cells: mine.map(l => {
      const info = v.slots[l.slotId];
      return { day: l.day, start: l.start, size: l.size, lines: [info?.className ?? '', info?.subject ?? '', info?.roomName ?? ''] };
    }),
  };
}

/** Pages for every teacher with lessons. */
export function allTeacherPages(v: Pick<TimetableVersion, 'lessons' | 'slots'>, P: Problem): TimetablePage[] {
  return [...P.teachers].sort(byName).map(t => teacherPage(v, P, t.id)).filter(p => p.cells.length > 0);
}

/** Live rows (as My Timetable reads them) → cells; doubles merged. */
export function cellsFromRows(rows: ResolvedTimetableEntry[], periods: Period[], lines: (r: ResolvedTimetableEntry) => string[]): TimetableCell[] {
  const blocks = groupIntoBlocks(
    rows.map(r => ({ ...r.entry, _r: r })),
    periods,
  );
  return blocks.map(b => ({
    day: b.dayOfWeek as TimetableCell['day'],
    start: b.periodIndexes[0],
    size: b.size,
    lines: lines((b.rows[0] as any)._r as ResolvedTimetableEntry),
  }));
}
