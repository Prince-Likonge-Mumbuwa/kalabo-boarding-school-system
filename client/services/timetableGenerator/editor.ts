// @/services/timetableGenerator/editor.ts
//
// Hand edits on a generated timetable: where can a lesson go, and moving or
// swapping it. Uses the same hard rules as the solver, so an edited
// timetable can never get a clash.

import { MORNING_LAST, PERIODS_PER_DAY, type PlacedLesson, type Problem, type ProblemSlot, type Weekday } from './types';
import { blockCount } from './problem';

export interface Target {
  ok: boolean;
  /** Index of the lesson it swaps with, when the place is taken by one of the same length. */
  swapWith?: number;
  reason?: string;
}

const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const halfOf = (p: number) => (p <= MORNING_LAST ? 0 : 1);

interface Occ {
  cls: Map<string, number>;
  teacher: Map<string, number>;
  room: Map<string, number>;
}

function occupancy(P: Problem, lessons: PlacedLesson[], skip: Set<number>, slotOf: (id: string) => ProblemSlot | undefined): Occ {
  const occ: Occ = { cls: new Map(), teacher: new Map(), room: new Map() };
  lessons.forEach((l, i) => {
    if (skip.has(i)) return;
    const s = slotOf(l.slotId);
    for (let p = l.start; p < l.start + l.size; p++) {
      occ.cls.set(`${l.classId}|${l.day}|${p}`, i);
      s?.teacherIds.forEach(t => occ.teacher.set(`${t}|${l.day}|${p}`, i));
      if (s?.roomId) occ.room.set(`${s.roomId}|${l.day}|${p}`, i);
    }
  });
  return occ;
}

/** Why `lesson` cannot go at (day, start) given the occupancy; null if it can. */
function whyNot(
  P: Problem,
  occ: Occ,
  lessons: PlacedLesson[],
  skip: Set<number>,
  lesson: PlacedLesson,
  day: Weekday,
  start: number,
  slotOf: (id: string) => ProblemSlot | undefined,
): string | null {
  const s = slotOf(lesson.slotId);
  const end = start + lesson.size - 1;
  if (start < 1 || end > PERIODS_PER_DAY || halfOf(start) !== halfOf(end)) return 'A lesson cannot run across the break.';
  if (s?.time === 'morning-only' && end > MORNING_LAST) return `${s.subject} is mornings only.`;
  const cls = P.classes.find(c => c.id === lesson.classId);
  for (let p = start; p <= end; p++) {
    if (cls?.blocked.includes((day - 1) * PERIODS_PER_DAY + (p - 1))) return 'A school event is on then.';
    if (occ.cls.has(`${lesson.classId}|${day}|${p}`)) return 'The class has another lesson then.';
    for (const t of s?.teacherIds ?? []) {
      const other = occ.teacher.get(`${t}|${day}|${p}`);
      if (other !== undefined) {
        const o = lessons[other];
        const name = s!.teacherNames[s!.teacherIds.indexOf(t)] ?? 'The teacher';
        return `${name} is teaching ${P.classes.find(c => c.id === o.classId)?.name ?? 'another class'} then.`;
      }
    }
    if (s?.roomId && occ.room.has(`${s.roomId}|${day}|${p}`)) return `${P.rooms.find(r => r.id === s.roomId)?.name ?? 'The room'} is in use then.`;
  }
  if (s) {
    const sameDay = lessons.filter((l, i) => !skip.has(i) && l.slotId === lesson.slotId && l.day === day);
    const maxPerDay = blockCount(s, s.max) > 5 ? 2 : 1;
    if (sameDay.length + 1 > maxPerDay) return `${s.subject} is already on ${DAY[day - 1]}.`;
    if (sameDay.some(l => halfOf(l.start) === halfOf(start) && (l.start + l.size === start || end + 1 === l.start))) {
      return `It would join the other ${s.subject} lesson into one.`;
    }
  }
  return null;
}

/** Every place lesson `index` could move to (or swap into). Key: 'day:start'. */
export function moveTargets(P: Problem, lessons: PlacedLesson[], index: number): Map<string, Target> {
  const slotMap = new Map(P.slots.map(s => [s.slotId, s]));
  const slotOf = (id: string) => slotMap.get(id);
  const lesson = lessons[index];
  const out = new Map<string, Target>();
  const skip = new Set([index]);
  const occ = occupancy(P, lessons, skip, slotOf);

  for (let d = 1 as Weekday; d <= 5; d = (d + 1) as Weekday) {
    for (let p = 1; p + lesson.size - 1 <= PERIODS_PER_DAY; p++) {
      if (d === lesson.day && p === lesson.start) continue;
      const key = `${d}:${p}`;
      // A lesson of the same class and length exactly there: try a swap.
      const other = lessons.findIndex((l, i) => i !== index && l.classId === lesson.classId && l.day === d && l.start === p && l.size === lesson.size);
      if (other >= 0) {
        if (lessons[other].locked) {
          out.set(key, { ok: false, reason: 'That lesson is locked.' });
          continue;
        }
        const both = new Set([index, other]);
        const occ2 = occupancy(P, lessons, both, slotOf);
        const a = whyNot(P, occ2, lessons, both, lesson, d, p, slotOf);
        // Place the moved lesson, then check the other one in its old spot.
        const moved = lessons.map((l, i) => (i === index ? { ...l, day: d, start: p } : l));
        const occ3 = occupancy(P, moved, new Set([other]), slotOf);
        const b = a ?? whyNot(P, occ3, moved, new Set([other]), lessons[other], lesson.day, lesson.start, slotOf);
        out.set(key, b ? { ok: false, reason: `Swap not possible: ${b}` } : { ok: true, swapWith: other });
        continue;
      }
      const why = whyNot(P, occ, lessons, skip, lesson, d, p, slotOf);
      out.set(key, why ? { ok: false, reason: why } : { ok: true });
    }
  }
  return out;
}

/** Applies a move (or swap) returned as ok by moveTargets. */
export function applyMove(lessons: PlacedLesson[], index: number, day: Weekday, start: number, target: Target): PlacedLesson[] {
  if (!target.ok) return lessons;
  const from = lessons[index];
  return lessons.map((l, i) => {
    if (i === index) return { ...l, day, start };
    if (target.swapWith === i) return { ...l, day: from.day, start: from.start };
    return l;
  });
}
