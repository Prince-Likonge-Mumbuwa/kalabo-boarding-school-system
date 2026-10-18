// @/services/timetableGenerator/solver.ts
//
// The timetable solver. Pure and deterministic: the same problem, options and
// seed always give the same timetable. Runs in a Web Worker in the app
// (solver.worker.ts) and directly in tests.
//
// HARD RULES — never broken:
//   • a class, a teacher (owner and any live cover) and a special room are in
//     one place at a time;
//   • every lesson keeps its shape (single / double / triple) and never
//     crosses the break (P4 | P5);
//   • "mornings only" subjects stay in P1–P4;
//   • fixed school events stay free;
//   • a subject has at most one lesson a day (two when it has more than five
//     lessons a week), and two lessons of a subject on one day are never
//     side by side (they would read as one longer lesson).
//
// PREFERENCES — scored, the lower the better:
//   • "prefer mornings" subjects in the morning; "not last period" kept off P8;
//   • a subject's lessons spread over the week, not on neighbouring days, and
//     not always at the same period;
//   • a teacher not teaching more than the daily limit, nor four periods in a
//     row, with few gaps;
//   • a class's free periods at the end of the day, not in the middle;
//   • extra periods (between the fewest and the most a week) where they fit.
//
// HOW:
//   1. Place the hardest lessons first (triples, doubles, mornings only,
//      rooms, busy teachers). When a lesson has nowhere to go, it takes the
//      place that displaces the fewest others, which go back in the queue
//      (with a memory so lessons don't keep swapping back). Restart with a
//      new seed if needed and keep the best.
//   2. Improve: move lessons and swap lessons of a class, accepting worse
//      moves now and then early on (simulated annealing), never breaking a
//      hard rule. Keep the best timetable seen.

import { DAYS, MORNING_LAST, PERIODS_PER_DAY, type PlacedLesson, type Problem, type SolveResult, type UnplacedLesson, type Weekday } from './types';
import { startsFor } from './problem';

export interface SolveOptions {
  seed?: number;
  /** Stop after this long (ms). */
  maxMillis?: number;
  /** Improvement-phase iterations (default scales with the problem). */
  improveIterations?: number;
  /** Lessons fixed in place (from the editor). */
  locked?: PlacedLesson[];
  /** A previous timetable to start from where it still fits (not fixed). */
  initial?: PlacedLesson[];
  onProgress?: (p: { phase: 'placing' | 'improving'; fraction: number; score: number; unplaced: number }) => void;
  /** Checked now and then; return true to stop early and keep the best so far. */
  shouldStop?: () => boolean;
  now?: () => number;
}

const W = {
  UNPLACED_REQUIRED: 1000,
  UNPLACED_OPTIONAL: 2,
  AFTERNOON_PREFER_MORNING: 3,
  LAST_PERIOD: 4,
  NEIGHBOUR_DAYS: 1.5,
  SAME_DAY: 3,
  SAME_PERIOD_REPEAT: 0.7,
  TEACHER_OVER_DAILY: 5,
  TEACHER_FOUR_IN_A_ROW: 2,
  TEACHER_GAP: 0.25,
  CLASS_MID_DAY_FREE: 1,
};

/** Small, fast, seedable random numbers (mulberry32). */
export function makeRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CELLS_PER_DAY = PERIODS_PER_DAY;
const NDAYS = DAYS.length;
const NCELLS = NDAYS * CELLS_PER_DAY;

interface SlotX {
  cls: number;
  teachers: number[];
  room: number;
  morningOnly: boolean;
  preferMorning: boolean;
  notLast: boolean;
  maxPerDay: number;
  blocks: number;
  units: number[];
}

/** One candidate place for a lesson: day 0..4, first period 1..8. */
interface Pos { d: number; p: number }

export class TimetableState {
  readonly P: Problem;
  readonly slots: SlotX[];
  readonly unitSize: Int8Array;
  readonly unitSlot: Int32Array;
  readonly unitOptional: Uint8Array;
  readonly classCell: Int32Array;
  readonly teacherCell: Int32Array;
  readonly roomCell: Int32Array;
  readonly blocked: Uint8Array;
  /** Start cell of each unit, or -1. */
  readonly pos: Int32Array;
  readonly locked: Uint8Array;
  readonly slotDay: Int8Array;
  readonly candidates: Pos[][];

  constructor(P: Problem) {
    this.P = P;
    const classIdx = new Map(P.classes.map((c, i) => [c.id, i]));
    const teacherIdx = new Map(P.teachers.map((t, i) => [t.id, i]));
    const roomIdx = new Map(P.rooms.map((r, i) => [r.id, i]));
    this.slots = P.slots.map(s => {
      const blocks = s.doubles + s.triples + Math.max(0, s.min - 2 * s.doubles - 3 * s.triples) + (s.max - s.min);
      return {
        cls: classIdx.get(s.classId) ?? 0,
        teachers: s.teacherIds.map(t => teacherIdx.get(t)).filter((x): x is number => x !== undefined),
        room: s.roomId ? roomIdx.get(s.roomId) ?? -1 : -1,
        morningOnly: s.time === 'morning-only',
        preferMorning: s.time === 'prefer-morning',
        notLast: s.notLast,
        maxPerDay: blocks > NDAYS ? 2 : 1,
        blocks,
        units: [] as number[],
      };
    });
    const n = P.units.length;
    this.unitSize = new Int8Array(n);
    this.unitSlot = new Int32Array(n);
    this.unitOptional = new Uint8Array(n);
    P.units.forEach((u, i) => {
      this.unitSize[i] = u.size;
      this.unitSlot[i] = u.slot;
      this.unitOptional[i] = u.optional ? 1 : 0;
      this.slots[u.slot].units.push(i);
    });
    this.classCell = new Int32Array(P.classes.length * NCELLS).fill(-1);
    this.teacherCell = new Int32Array(Math.max(1, P.teachers.length) * NCELLS).fill(-1);
    this.roomCell = new Int32Array(Math.max(1, P.rooms.length) * NCELLS).fill(-1);
    this.blocked = new Uint8Array(P.classes.length * NCELLS);
    P.classes.forEach((c, i) => c.blocked.forEach(cell => (this.blocked[i * NCELLS + cell] = 1)));
    this.pos = new Int32Array(n).fill(-1);
    this.locked = new Uint8Array(n);
    this.slotDay = new Int8Array(P.slots.length * NDAYS);
    this.candidates = P.units.map(u => {
      const s = this.slots[u.slot];
      const out: Pos[] = [];
      for (let d = 0; d < NDAYS; d++) for (const p of startsFor(u.size, s.morningOnly)) out.push({ d, p });
      return out;
    });
  }

  cellIndex(d: number, p: number) {
    return d * CELLS_PER_DAY + (p - 1);
  }

  /** Can unit u go at (d, p) as things stand? */
  fits(u: number, d: number, p: number): boolean {
    const s = this.slots[this.unitSlot[u]];
    const size = this.unitSize[u];
    if (this.slotDay[this.unitSlot[u] * NDAYS + d] >= s.maxPerDay) return false;
    for (let k = 0; k < size; k++) {
      const cell = this.cellIndex(d, p + k);
      const ci = s.cls * NCELLS + cell;
      if (this.classCell[ci] !== -1 || this.blocked[ci]) return false;
      for (const t of s.teachers) if (this.teacherCell[t * NCELLS + cell] !== -1) return false;
      if (s.room >= 0 && this.roomCell[s.room * NCELLS + cell] !== -1) return false;
    }
    return !this.touchesSameSubject(u, d, p);
  }

  /** Would the lesson sit right next to another lesson of the same subject? */
  private touchesSameSubject(u: number, d: number, p: number): boolean {
    const slot = this.unitSlot[u];
    const cls = this.slots[slot].cls;
    const size = this.unitSize[u];
    const halfStart = p <= MORNING_LAST ? 1 : MORNING_LAST + 1;
    const halfEnd = p <= MORNING_LAST ? MORNING_LAST : PERIODS_PER_DAY;
    const before = p - 1;
    const after = p + size;
    if (before >= halfStart) {
      const v = this.classCell[cls * NCELLS + this.cellIndex(d, before)];
      if (v !== -1 && v !== u && this.unitSlot[v] === slot) return true;
    }
    if (after <= halfEnd) {
      const v = this.classCell[cls * NCELLS + this.cellIndex(d, after)];
      if (v !== -1 && v !== u && this.unitSlot[v] === slot) return true;
    }
    return false;
  }

  place(u: number, d: number, p: number) {
    const s = this.slots[this.unitSlot[u]];
    for (let k = 0; k < this.unitSize[u]; k++) {
      const cell = this.cellIndex(d, p + k);
      this.classCell[s.cls * NCELLS + cell] = u;
      for (const t of s.teachers) this.teacherCell[t * NCELLS + cell] = u;
      if (s.room >= 0) this.roomCell[s.room * NCELLS + cell] = u;
    }
    this.pos[u] = this.cellIndex(d, p);
    this.slotDay[this.unitSlot[u] * NDAYS + d]++;
  }

  remove(u: number) {
    const start = this.pos[u];
    if (start < 0) return;
    const s = this.slots[this.unitSlot[u]];
    const d = Math.floor(start / CELLS_PER_DAY);
    for (let k = 0; k < this.unitSize[u]; k++) {
      const cell = start + k;
      this.classCell[s.cls * NCELLS + cell] = -1;
      for (const t of s.teachers) if (this.teacherCell[t * NCELLS + cell] === u) this.teacherCell[t * NCELLS + cell] = -1;
      if (s.room >= 0 && this.roomCell[s.room * NCELLS + cell] === u) this.roomCell[s.room * NCELLS + cell] = -1;
    }
    this.pos[u] = -1;
    this.slotDay[this.unitSlot[u] * NDAYS + d]--;
  }

  dayOf(u: number) {
    return Math.floor(this.pos[u] / CELLS_PER_DAY);
  }
  periodOf(u: number) {
    return (this.pos[u] % CELLS_PER_DAY) + 1;
  }

  /**
   * Units that would have to move for u to go at (d, p); null when it can
   * never go there (blocked, or a fixed lesson is in the way).
   */
  conflicts(u: number, d: number, p: number): number[] | null {
    const slot = this.unitSlot[u];
    const s = this.slots[slot];
    const out = new Set<number>();
    for (let k = 0; k < this.unitSize[u]; k++) {
      const cell = this.cellIndex(d, p + k);
      const ci = s.cls * NCELLS + cell;
      if (this.blocked[ci]) return null;
      if (this.classCell[ci] !== -1) out.add(this.classCell[ci]);
      for (const t of s.teachers) {
        const v = this.teacherCell[t * NCELLS + cell];
        if (v !== -1) out.add(v);
      }
      if (s.room >= 0) {
        const v = this.roomCell[s.room * NCELLS + cell];
        if (v !== -1) out.add(v);
      }
    }
    // Same subject the same day.
    const sameDay = s.units.filter(v => v !== u && this.pos[v] >= 0 && this.dayOf(v) === d && !out.has(v));
    if (sameDay.length + 1 > s.maxPerDay) {
      // Must move enough of them; pick those right next to it first.
      out.add(sameDay[0]);
    }
    // Neighbours of the same subject.
    const halfStart = p <= MORNING_LAST ? 1 : MORNING_LAST + 1;
    const halfEnd = p <= MORNING_LAST ? MORNING_LAST : PERIODS_PER_DAY;
    for (const q of [p - 1, p + this.unitSize[u]]) {
      if (q < halfStart || q > halfEnd) continue;
      const v = this.classCell[s.cls * NCELLS + this.cellIndex(d, q)];
      if (v !== -1 && this.unitSlot[v] === slot) out.add(v);
    }
    out.delete(u);
    for (const v of out) if (this.locked[v]) return null;
    return [...out];
  }

  // ---------- costs ----------

  slotCost(si: number): number {
    const s = this.slots[si];
    let c = 0;
    const days: number[] = [];
    const startCount = new Int8Array(PERIODS_PER_DAY + 1);
    for (const u of s.units) {
      if (this.pos[u] < 0) {
        c += this.unitOptional[u] ? W.UNPLACED_OPTIONAL : W.UNPLACED_REQUIRED;
        continue;
      }
      const d = this.dayOf(u);
      const p = this.periodOf(u);
      const size = this.unitSize[u];
      if (s.preferMorning && p > MORNING_LAST) c += W.AFTERNOON_PREFER_MORNING * size;
      if (s.notLast && p + size - 1 === PERIODS_PER_DAY) c += W.LAST_PERIOD;
      days.push(d);
      startCount[p]++;
    }
    days.sort((a, b) => a - b);
    for (let i = 1; i < days.length; i++) {
      if (days[i] === days[i - 1]) c += W.SAME_DAY;
      else if (days[i] === days[i - 1] + 1 && s.blocks <= 3) c += W.NEIGHBOUR_DAYS;
    }
    for (let p = 1; p <= PERIODS_PER_DAY; p++) if (startCount[p] > 2) c += W.SAME_PERIOD_REPEAT * (startCount[p] - 2);
    return c;
  }

  teacherDayCost(t: number, d: number): number {
    let load = 0;
    let first = -1;
    let last = -1;
    let c = 0;
    for (let half = 0; half < 2; half++) {
      let run = 0;
      const a = half === 0 ? 1 : MORNING_LAST + 1;
      const b = half === 0 ? MORNING_LAST : PERIODS_PER_DAY;
      for (let p = a; p <= b; p++) {
        if (this.teacherCell[t * NCELLS + this.cellIndex(d, p)] !== -1) {
          load++;
          run++;
          if (first < 0) first = p;
          last = p;
          if (run === 4) c += W.TEACHER_FOUR_IN_A_ROW;
        } else run = 0;
      }
    }
    if (load > this.P.maxTeacherPeriodsPerDay) c += W.TEACHER_OVER_DAILY * (load - this.P.maxTeacherPeriodsPerDay);
    if (first >= 0) c += W.TEACHER_GAP * (last - first + 1 - load);
    return c;
  }

  classDayCost(ci: number, d: number): number {
    let c = 0;
    let lessonLater = false;
    for (let p = PERIODS_PER_DAY; p >= 1; p--) {
      const i = ci * NCELLS + this.cellIndex(d, p);
      if (this.classCell[i] !== -1) lessonLater = true;
      else if (!this.blocked[i] && lessonLater) c += W.CLASS_MID_DAY_FREE;
    }
    return c;
  }

  totalCost(): number {
    let c = 0;
    for (let s = 0; s < this.slots.length; s++) c += this.slotCost(s);
    for (let t = 0; t < this.P.teachers.length; t++) for (let d = 0; d < NDAYS; d++) c += this.teacherDayCost(t, d);
    for (let ci = 0; ci < this.P.classes.length; ci++) for (let d = 0; d < NDAYS; d++) c += this.classDayCost(ci, d);
    return c;
  }

  /** Cost of what units `us` touch on days `ds`. */
  localCost(us: number[], ds: number[]): number {
    const slots = new Set<number>();
    const teachers = new Set<number>();
    const classes = new Set<number>();
    for (const u of us) {
      const s = this.slots[this.unitSlot[u]];
      slots.add(this.unitSlot[u]);
      classes.add(s.cls);
      s.teachers.forEach(t => teachers.add(t));
    }
    const days = [...new Set(ds.filter(d => d >= 0))];
    let c = 0;
    for (const s of slots) c += this.slotCost(s);
    for (const t of teachers) for (const d of days) c += this.teacherDayCost(t, d);
    for (const ci of classes) for (const d of days) c += this.classDayCost(ci, d);
    return c;
  }

  snapshot(): Int32Array {
    return this.pos.slice();
  }

  restore(snap: Int32Array) {
    for (let u = 0; u < this.pos.length; u++) this.remove(u);
    for (let u = 0; u < snap.length; u++) {
      if (snap[u] >= 0) this.place(u, Math.floor(snap[u] / CELLS_PER_DAY), (snap[u] % CELLS_PER_DAY) + 1);
    }
  }
}

// ==================== SOLVE ====================

export function solve(P: Problem, opts: SolveOptions = {}): SolveResult {
  const now = opts.now ?? (() => Date.now());
  const t0 = now();
  const seed = (opts.seed ?? 1) >>> 0;
  const maxMillis = opts.maxMillis ?? 20_000;
  const deadline = t0 + maxMillis;
  const stop = () => now() > deadline || (opts.shouldStop?.() ?? false);

  let best: { snap: Int32Array; cost: number; unplaced: number } | null = null;
  let iterations = 0;
  const attempts = 6;
  let finalState: TimetableState | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const rnd = makeRandom(seed + attempt * 7919);
    const S = new TimetableState(P);
    applyLocks(S, opts.locked ?? []);
    applyInitial(S, opts.initial ?? []);
    iterations += construct(S, rnd, stop, f =>
      opts.onProgress?.({ phase: 'placing', fraction: (attempt + f) / attempts / 2, score: Infinity, unplaced: unplacedRequired(S) }),
    );
    repair(S, rnd, stop);
    const unplaced = unplacedRequired(S);
    const cost = S.totalCost();
    if (!best || unplaced < best.unplaced || (unplaced === best.unplaced && cost < best.cost)) {
      best = { snap: S.snapshot(), cost, unplaced };
      finalState = S;
    }
    if (unplaced === 0 || stop()) break;
  }

  const S = finalState!;
  S.restore(best!.snap);
  // Re-apply locks flag (restore keeps the flags; positions are the same).
  const rnd = makeRandom(seed ^ 0x9e3779b9);
  placeOptional(S, rnd);
  iterations += improve(S, rnd, opts, stop, t0, maxMillis);

  return result(S, seed, iterations, now() - t0);
}

function unplacedRequired(S: TimetableState): number {
  let n = 0;
  for (let u = 0; u < S.pos.length; u++) if (S.pos[u] < 0 && !S.unitOptional[u]) n++;
  return n;
}

/** Finds an unplaced unit of `slotId` with `size`, preferring required ones. */
function unitFor(S: TimetableState, slotId: string, size: number): number {
  const si = S.P.slots.findIndex(s => s.slotId === slotId);
  if (si < 0) return -1;
  const us = S.slots[si].units.filter(u => S.pos[u] < 0 && S.unitSize[u] === size);
  return us.find(u => !S.unitOptional[u]) ?? us[0] ?? -1;
}

function applyLocks(S: TimetableState, locked: PlacedLesson[]) {
  for (const l of locked) {
    const u = unitFor(S, l.slotId, l.size);
    if (u < 0) continue;
    const okStart = S.candidates[u].some(c => c.d === l.day - 1 && c.p === l.start);
    if (!okStart || !S.fits(u, l.day - 1, l.start)) continue;
    S.place(u, l.day - 1, l.start);
    S.locked[u] = 1;
  }
}

function applyInitial(S: TimetableState, initial: PlacedLesson[]) {
  for (const l of initial) {
    const u = unitFor(S, l.slotId, l.size);
    if (u < 0) continue;
    const okStart = S.candidates[u].some(c => c.d === l.day - 1 && c.p === l.start);
    if (okStart && S.fits(u, l.day - 1, l.start)) S.place(u, l.day - 1, l.start);
  }
}

/**
 * Tries to place unplaced unit u, moving up to two lessons out of its way,
 * each of which must find another place (recursively, `depth` levels).
 * Everything is undone when it does not work out.
 */
function placeWithMoves(S: TimetableState, u: number, depth: number, rnd: () => number, banned = new Set<number>()): boolean {
  const log: Array<[number, number]> = []; // [unit, previous start cell or -1]
  const ok = tryPlace(S, u, depth, rnd, banned, log);
  if (!ok) undo(S, log, 0);
  return ok;
}

function undo(S: TimetableState, log: Array<[number, number]>, mark: number) {
  for (let i = log.length - 1; i >= mark; i--) {
    const [v, prev] = log[i];
    if (S.pos[v] >= 0) S.remove(v);
    if (prev >= 0) S.place(v, Math.floor(prev / PERIODS_PER_DAY), (prev % PERIODS_PER_DAY) + 1);
  }
  log.length = mark;
}

function tryPlace(S: TimetableState, u: number, depth: number, rnd: () => number, banned: Set<number>, log: Array<[number, number]>): boolean {
  const cands = S.candidates[u];
  const offset = Math.floor(rnd() * cands.length);
  // Free places first.
  for (let i = 0; i < cands.length; i++) {
    const c = cands[(i + offset) % cands.length];
    if (S.fits(u, c.d, c.p)) {
      log.push([u, S.pos[u]]);
      S.place(u, c.d, c.p);
      return true;
    }
  }
  if (depth <= 0) return false;
  const options: Array<{ c: Pos; conf: number[] }> = [];
  for (const c of cands) {
    const conf = S.conflicts(u, c.d, c.p);
    if (!conf || conf.length === 0 || conf.length > 2 || conf.some(v => banned.has(v))) continue;
    options.push({ c, conf });
  }
  options.sort((a, b) => a.conf.length - b.conf.length || rnd() - 0.5);
  banned.add(u);
  for (const { c, conf } of options.slice(0, depth >= 2 ? 14 : 24)) {
    const mark = log.length;
    for (const v of conf) {
      log.push([v, S.pos[v]]);
      S.remove(v);
    }
    if (!S.fits(u, c.d, c.p)) {
      undo(S, log, mark);
      continue;
    }
    log.push([u, -1]);
    S.place(u, c.d, c.p);
    let all = true;
    for (const v of conf) {
      if (!tryPlace(S, v, depth - 1, rnd, banned, log)) {
        all = false;
        break;
      }
    }
    if (all) {
      banned.delete(u);
      return true;
    }
    undo(S, log, mark);
  }
  banned.delete(u);
  return false;
}

/** Last effort for lessons still without a place. */
function repair(S: TimetableState, rnd: () => number, stop: () => boolean) {
  for (let round = 0; round < 3; round++) {
    let left = 0;
    for (let u = 0; u < S.pos.length; u++) {
      if (S.pos[u] >= 0 || S.unitOptional[u]) continue;
      if (stop()) return;
      if (!placeWithMoves(S, u, 3, rnd)) left++;
    }
    if (left === 0) return;
  }
}

/** Placing phase. Returns the iterations used. */
function construct(S: TimetableState, rnd: () => number, stop: () => boolean, progress: (f: number) => void): number {
  const P = S.P;
  const teacherLoad = new Float64Array(P.teachers.length);
  P.slots.forEach((s, i) => S.slots[i].teachers.forEach(t => (teacherLoad[t] += s.min)));
  const roomLoad = new Float64Array(P.rooms.length);
  P.slots.forEach((s, i) => S.slots[i].room >= 0 && (roomLoad[S.slots[i].room] += s.min));
  const difficulty = (u: number) => {
    const s = S.slots[S.unitSlot[u]];
    let d = S.unitSize[u] * 100;
    if (s.morningOnly) d += 60;
    if (s.room >= 0) d += 30 + roomLoad[s.room];
    for (const t of s.teachers) d += teacherLoad[t];
    return d + rnd() * 10;
  };

  const queue = [];
  for (let u = 0; u < S.pos.length; u++) if (S.pos[u] < 0 && !S.unitOptional[u]) queue.push(u);
  const diff = new Map(queue.map(u => [u, difficulty(u)]));
  queue.sort((a, b) => diff.get(b)! - diff.get(a)!);

  const total = queue.length || 1;
  const ejectCount = new Int32Array(S.pos.length);
  const ejectedBy = new Int32Array(S.pos.length).fill(-1);
  const ejectedAt = new Int32Array(S.pos.length);
  const maxIter = 400 + 60 * S.pos.length;
  let iter = 0;
  const gaveUp: number[] = [];

  while (queue.length && iter < maxIter) {
    iter++;
    if ((iter & 255) === 0) {
      progress(1 - queue.length / total);
      if (stop()) break;
    }
    const u = queue.shift()!;
    const cands = S.candidates[u];
    // 1) A free place, the best one by preferences (with a little chance).
    let bestPos: Pos | null = null;
    let bestScore = Infinity;
    for (const c of cands) {
      if (!S.fits(u, c.d, c.p)) continue;
      const before = S.localCost([u], [c.d]);
      S.place(u, c.d, c.p);
      const after = S.localCost([u], [c.d]);
      S.remove(u);
      const score = after - before + rnd() * 0.6;
      if (score < bestScore) {
        bestScore = score;
        bestPos = c;
      }
    }
    if (bestPos) {
      S.place(u, bestPos.d, bestPos.p);
      continue;
    }
    // 2) Move one or two lessons out of the way to other free places.
    if (placeWithMoves(S, u, 2, rnd)) continue;
    // 3) Still nothing: take the place that displaces the fewest, and put
    //    them back in the queue.
    let bestConf: number[] | null = null;
    for (const c of cands) {
      const conf = S.conflicts(u, c.d, c.p);
      if (!conf) continue;
      let score = rnd() * 0.9;
      for (const v of conf) {
        score += 1 + ejectCount[v] * 0.35 + (S.unitOptional[v] ? -0.8 : 0);
        if (ejectedBy[u] === v && iter - ejectedAt[u] < 25) score += 6;
      }
      if (score < bestScore) {
        bestScore = score;
        bestPos = c;
        bestConf = conf;
      }
    }
    if (!bestPos || !bestConf) {
      gaveUp.push(u);
      continue;
    }
    for (const v of bestConf) {
      S.remove(v);
      ejectCount[v]++;
      ejectedBy[v] = u;
      ejectedAt[v] = iter;
      if (!S.unitOptional[v]) queue.unshift(v);
    }
    if (S.fits(u, bestPos.d, bestPos.p)) S.place(u, bestPos.d, bestPos.p);
    else queue.push(u);
  }
  progress(1);
  return iter;
}

/** Puts extra (optional) periods where they lower the cost. */
function placeOptional(S: TimetableState, rnd: () => number) {
  const opt: number[] = [];
  for (let u = 0; u < S.pos.length; u++) if (S.unitOptional[u] && S.pos[u] < 0) opt.push(u);
  opt.sort(() => rnd() - 0.5);
  for (const u of opt) {
    let best: Pos | null = null;
    let bestDelta = 0;
    for (const c of S.candidates[u]) {
      if (!S.fits(u, c.d, c.p)) continue;
      const before = S.localCost([u], [c.d]);
      S.place(u, c.d, c.p);
      const delta = S.localCost([u], [c.d]) - before;
      S.remove(u);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = c;
      }
    }
    if (best) S.place(u, best.d, best.p);
  }
}

/** Improvement phase (simulated annealing). Returns the iterations used. */
function improve(
  S: TimetableState,
  rnd: () => number,
  opts: SolveOptions,
  stop: () => boolean,
  t0: number,
  maxMillis: number,
): number {
  const n = S.pos.length;
  if (n === 0) return 0;
  const iterations = opts.improveIterations ?? Math.min(3_000_000, 200_000 + n * 1500);
  const byClassSize = new Map<string, number[]>();
  for (let u = 0; u < n; u++) {
    const k = `${S.slots[S.unitSlot[u]].cls}|${S.unitSize[u]}`;
    const arr = byClassSize.get(k) ?? [];
    arr.push(u);
    byClassSize.set(k, arr);
  }
  let cost = S.totalCost();
  let best = { cost, snap: S.snapshot() };
  const T0 = 2.0;
  const T1 = 0.03;
  const now = opts.now ?? (() => Date.now());
  let it = 0;

  for (; it < iterations; it++) {
    if ((it & 1023) === 0) {
      opts.onProgress?.({ phase: 'improving', fraction: 0.5 + (it / iterations) * 0.5, score: best.cost, unplaced: unplacedRequired(S) });
      if (stop()) break;
    }
    const T = T0 * Math.pow(T1 / T0, it / iterations);
    const u = Math.floor(rnd() * n);
    if (S.locked[u]) continue;
    const r = rnd();

    if (S.pos[u] < 0) {
      // Try to bring an unplaced lesson in.
      const c = S.candidates[u][Math.floor(rnd() * S.candidates[u].length)];
      if (!c || !S.fits(u, c.d, c.p)) continue;
      const before = S.localCost([u], [c.d]);
      S.place(u, c.d, c.p);
      const delta = S.localCost([u], [c.d]) - before;
      if (delta <= 0 || rnd() < Math.exp(-delta / T)) cost += delta;
      else S.remove(u);
    } else if (r < 0.06 && S.unitOptional[u]) {
      // Take an extra period out again.
      const d = S.dayOf(u);
      const p = S.periodOf(u);
      const before = S.localCost([u], [d]);
      S.remove(u);
      const delta = S.localCost([u], [d]) - before;
      if (delta <= 0 || rnd() < Math.exp(-delta / T)) cost += delta;
      else S.place(u, d, p);
    } else if (r < 0.55) {
      // Move.
      const c = S.candidates[u][Math.floor(rnd() * S.candidates[u].length)];
      const d0 = S.dayOf(u);
      const p0 = S.periodOf(u);
      if (!c || (c.d === d0 && c.p === p0)) continue;
      const before = S.localCost([u], [d0, c.d]);
      S.remove(u);
      if (!S.fits(u, c.d, c.p)) {
        S.place(u, d0, p0);
        continue;
      }
      S.place(u, c.d, c.p);
      const delta = S.localCost([u], [d0, c.d]) - before;
      if (delta <= 0 || rnd() < Math.exp(-delta / T)) cost += delta;
      else {
        S.remove(u);
        S.place(u, d0, p0);
      }
    } else {
      // Swap with a lesson of the same class and length.
      const peers = byClassSize.get(`${S.slots[S.unitSlot[u]].cls}|${S.unitSize[u]}`)!;
      const v = peers[Math.floor(rnd() * peers.length)];
      if (v === u || S.locked[v] || S.pos[v] < 0 || S.unitSlot[v] === S.unitSlot[u]) continue;
      const du = S.dayOf(u), pu = S.periodOf(u), dv = S.dayOf(v), pv = S.periodOf(v);
      // Each must be allowed to start where the other is.
      if (!S.candidates[u].some(c => c.d === dv && c.p === pv) || !S.candidates[v].some(c => c.d === du && c.p === pu)) continue;
      const before = S.localCost([u, v], [du, dv]);
      S.remove(u);
      S.remove(v);
      const ok = S.fits(u, dv, pv) && (S.place(u, dv, pv), S.fits(v, du, pu));
      if (!ok) {
        if (S.pos[u] >= 0) S.remove(u);
        S.place(u, du, pu);
        S.place(v, dv, pv);
        continue;
      }
      S.place(v, du, pu);
      const delta = S.localCost([u, v], [du, dv]) - before;
      if (delta <= 0 || rnd() < Math.exp(-delta / T)) cost += delta;
      else {
        S.remove(u);
        S.remove(v);
        S.place(u, du, pu);
        S.place(v, dv, pv);
      }
    }
    if (cost < best.cost - 1e-9) best = { cost, snap: S.snapshot() };
    if ((it & 4095) === 0 && now() - t0 > maxMillis) break;
  }
  S.restore(best.snap);
  return it;
}

// ==================== RESULT ====================

const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function result(S: TimetableState, seed: number, iterations: number, millis: number): SolveResult {
  const P = S.P;
  const lessons: PlacedLesson[] = [];
  const unplaced: UnplacedLesson[] = [];
  let required = 0, placedRequired = 0, optional = 0, placedOptional = 0;
  for (let u = 0; u < S.pos.length; u++) {
    const slot = P.slots[S.unitSlot[u]];
    if (S.unitOptional[u]) optional++;
    else required++;
    if (S.pos[u] >= 0) {
      if (S.unitOptional[u]) placedOptional++;
      else placedRequired++;
      lessons.push({
        slotId: slot.slotId,
        classId: slot.classId,
        day: (S.dayOf(u) + 1) as Weekday,
        start: S.periodOf(u),
        size: S.unitSize[u],
        ...(S.locked[u] ? { locked: true } : {}),
      });
    } else if (!S.unitOptional[u]) {
      unplaced.push({
        slotId: slot.slotId,
        classId: slot.classId,
        className: slot.className,
        subject: slot.subject,
        size: S.unitSize[u],
        reason: whyNot(S, u),
      });
    }
  }
  lessons.sort((a, b) => a.classId.localeCompare(b.classId) || a.day - b.day || a.start - b.start);
  return {
    lessons,
    unplaced,
    notes: notesFor(S),
    stats: { required, placedRequired, optional, placedOptional, score: Math.round(S.totalCost() * 10) / 10, iterations, millis, seed },
  };
}

/** The most common reason a lesson could not be placed. */
export function whyNot(S: TimetableState, u: number): string {
  const P = S.P;
  const s = S.slots[S.unitSlot[u]];
  const slot = P.slots[S.unitSlot[u]];
  const counts = new Map<string, number>();
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const c of S.candidates[u]) {
    let why = '';
    for (let k = 0; k < S.unitSize[u] && !why; k++) {
      const cell = S.cellIndex(c.d, c.p + k);
      if (S.blocked[s.cls * NCELLS + cell]) why = 'a school event';
      else if (S.classCell[s.cls * NCELLS + cell] !== -1) why = `${slot.className} already has a lesson`;
      else {
        const t = s.teachers.find(t => S.teacherCell[t * NCELLS + cell] !== -1);
        if (t !== undefined) why = `${P.teachers[t].name} is teaching another class`;
        else if (s.room >= 0 && S.roomCell[s.room * NCELLS + cell] !== -1) why = `${P.rooms[s.room].name} is in use`;
      }
    }
    if (!why && S.slotDay[S.unitSlot[u] * NDAYS + c.d] >= s.maxPerDay) why = `${slot.subject} is already on that day`;
    if (why) bump(why);
  }
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  const shape = S.unitSize[u] === 3 ? 'triple' : S.unitSize[u] === 2 ? 'double' : 'single period';
  return top
    ? `No place for this ${shape}: mostly because ${top[0]}${s.morningOnly ? ' (mornings only)' : ''}.`
    : `No place for this ${shape}.`;
}

/** Preferences not met, in plain words. */
function notesFor(S: TimetableState): string[] {
  const P = S.P;
  const notes: Array<{ w: number; text: string }> = [];
  P.slots.forEach((slot, si) => {
    const s = S.slots[si];
    const placed = s.units.filter(u => S.pos[u] >= 0);
    for (const u of placed) {
      const p = S.periodOf(u);
      if (s.preferMorning && p > MORNING_LAST) notes.push({ w: 3, text: `${slot.className} ${slot.subject} is in the afternoon on ${DAY[S.dayOf(u)]} (prefers mornings).` });
      if (s.notLast && p + S.unitSize[u] - 1 === PERIODS_PER_DAY) notes.push({ w: 2, text: `${slot.className} ${slot.subject} is in the last period on ${DAY[S.dayOf(u)]}.` });
    }
    const days = placed.map(u => S.dayOf(u));
    const dup = days.filter((d, i) => days.indexOf(d) !== i);
    for (const d of new Set(dup)) notes.push({ w: 2, text: `${slot.className} ${slot.subject} has two lessons on ${DAY[d]}.` });
    const extra = s.units.filter(u => S.unitOptional[u] && S.pos[u] < 0).length;
    if (extra) notes.push({ w: 1, text: `${slot.className} ${slot.subject}: ${slot.min + (slot.max - slot.min - extra)} periods a week (wanted up to ${slot.max}).` });
  });
  P.teachers.forEach((t, ti) => {
    for (let d = 0; d < NDAYS; d++) {
      let load = 0;
      for (let p = 1; p <= PERIODS_PER_DAY; p++) if (S.teacherCell[ti * NCELLS + S.cellIndex(d, p)] !== -1) load++;
      if (load > P.maxTeacherPeriodsPerDay) notes.push({ w: 3, text: `${t.name} teaches ${load} periods on ${DAY[d]}.` });
    }
  });
  P.classes.forEach((c, ci) => {
    for (let d = 0; d < NDAYS; d++) {
      if (S.classDayCost(ci, d) > 0) notes.push({ w: 1, text: `${c.name} has a free period in the middle of ${DAY[d]}.` });
    }
  });
  return notes.sort((a, b) => b.w - a.w).map(n => n.text).slice(0, 200);
}

// ==================== CHECKING A TIMETABLE ====================

export interface HardProblem {
  kind: 'class' | 'teacher' | 'room' | 'event' | 'break' | 'morning' | 'same-day';
  message: string;
  day: Weekday;
  period: number;
  slotIds: string[];
}

/**
 * Checks a timetable (e.g. after hand edits, or a published one against
 * today's allocations) against the hard rules. Empty = no clash.
 */
export function hardProblems(P: Problem, lessons: PlacedLesson[]): HardProblem[] {
  const out: HardProblem[] = [];
  const slotById = new Map(P.slots.map(s => [s.slotId, s]));
  const classById = new Map(P.classes.map(c => [c.id, c]));
  const teacherName = new Map(P.teachers.map(t => [t.id, t.name]));
  const roomName = new Map(P.rooms.map(r => [r.id, r.name]));
  const at = new Map<string, string[]>();
  const add = (k: string, slotId: string) => at.set(k, [...(at.get(k) ?? []), slotId]);
  const perDay = new Map<string, number[]>();

  for (const l of lessons) {
    const s = slotById.get(l.slotId);
    if (!s) continue;
    const end = l.start + l.size - 1;
    if (l.start <= MORNING_LAST && end > MORNING_LAST) {
      out.push({ kind: 'break', message: `${s.className} ${s.subject} runs across the break on ${DAY[l.day - 1]}.`, day: l.day, period: l.start, slotIds: [s.slotId] });
    }
    if (s.time === 'morning-only' && end > MORNING_LAST) {
      out.push({ kind: 'morning', message: `${s.className} ${s.subject} must be in the morning (${DAY[l.day - 1]} P${l.start}).`, day: l.day, period: l.start, slotIds: [s.slotId] });
    }
    const k = `${s.slotId}|${l.day}`;
    perDay.set(k, [...(perDay.get(k) ?? []), l.start]);
    for (let p = l.start; p <= end; p++) {
      add(`c|${s.classId}|${l.day}|${p}`, s.slotId);
      s.teacherIds.forEach(t => add(`t|${t}|${l.day}|${p}`, s.slotId));
      if (s.roomId) add(`r|${s.roomId}|${l.day}|${p}`, s.slotId);
      const c = classById.get(s.classId);
      if (c?.blocked.includes((l.day - 1) * PERIODS_PER_DAY + (p - 1))) {
        out.push({ kind: 'event', message: `${s.className} ${s.subject} is during a school event (${DAY[l.day - 1]} P${p}).`, day: l.day, period: p, slotIds: [s.slotId] });
      }
    }
  }
  for (const [k, slotIds] of at) {
    const uniq = [...new Set(slotIds)];
    if (slotIds.length < 2) continue;
    const [kind, id, day, period] = k.split('|');
    const names = uniq.map(x => { const s = slotById.get(x)!; return `${s.className} ${s.subject}`; }).join(' and ');
    const d = Number(day) as Weekday;
    const when = `${DAY[d - 1]} P${period}`;
    if (kind === 'c') out.push({ kind: 'class', message: `${classById.get(id)?.name ?? 'A class'} has two lessons at ${when}: ${names}.`, day: d, period: Number(period), slotIds: uniq });
    if (kind === 't') out.push({ kind: 'teacher', message: `${teacherName.get(id) ?? 'A teacher'} is in two classes at ${when}: ${names}.`, day: d, period: Number(period), slotIds: uniq });
    if (kind === 'r') out.push({ kind: 'room', message: `${roomName.get(id) ?? 'A room'} is booked twice at ${when}: ${names}.`, day: d, period: Number(period), slotIds: uniq });
  }
  for (const [k, starts] of perDay) {
    const [slotId, day] = k.split('|');
    const s = slotById.get(slotId)!;
    const blocks = s.doubles + s.triples + Math.max(0, s.max - 2 * s.doubles - 3 * s.triples);
    const maxPerDay = blocks > NDAYS ? 2 : 1;
    if (starts.length > maxPerDay) {
      out.push({ kind: 'same-day', message: `${s.className} ${s.subject} has ${starts.length} lessons on ${DAY[Number(day) - 1]}.`, day: Number(day) as Weekday, period: Math.min(...starts), slotIds: [slotId] });
    }
  }
  return out;
}
