// Pure timetable logic. No Firebase, no React.
//
// One timetable row = one subject in one period on one day. Two or three
// ticked periods in a row (no break between) form a BLOCK, which is worked
// out here at read time — nothing called "double" is stored.

import type { Period, TimetableConflict } from '@/types/timetable';

export type Weekday = 1 | 2 | 3 | 4 | 5;
export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
export const dayName = (d: Weekday) => DAY_NAMES[d - 1];

/** The fields every row-like object shares (entries, proposals, resolved rows). */
export interface RowLike {
  slotId: string;
  classId: string;
  className: string;
  subject: string;
  dayOfWeek: Weekday;
  periodIndex: number;
}

// ── Periods ───────────────────────────────────────────────────────────
//
// The school's bell schedule (fixed):
//   P1 07:20  P2 08:00  P3 08:40  P4 09:20  (40 minutes each)
//   Break 10:00–10:20 (not a period, no number)
//   P5 10:20  P6 11:00  P7 11:40  P8 12:20–13:00
// No lessons before 07:20 or after 13:00. Lessons are numbered 1..8
// (`order`); break rows carry order 0.

export const MAX_LESSON_PERIODS = 8;
export const SCHOOL_DAY_START = '07:20';
export const SCHOOL_DAY_END = '13:00';

export interface BellRow {
  order: number;
  name: string;
  startTime: string;
  endTime: string;
  kind: Period['kind'];
}

export const SCHOOL_BELL: BellRow[] = [
  { order: 1, name: 'P1', startTime: '07:20', endTime: '08:00', kind: 'lesson' },
  { order: 2, name: 'P2', startTime: '08:00', endTime: '08:40', kind: 'lesson' },
  { order: 3, name: 'P3', startTime: '08:40', endTime: '09:20', kind: 'lesson' },
  { order: 4, name: 'P4', startTime: '09:20', endTime: '10:00', kind: 'lesson' },
  { order: 0, name: 'Break', startTime: '10:00', endTime: '10:20', kind: 'break' },
  { order: 5, name: 'P5', startTime: '10:20', endTime: '11:00', kind: 'lesson' },
  { order: 6, name: 'P6', startTime: '11:00', endTime: '11:40', kind: 'lesson' },
  { order: 7, name: 'P7', startTime: '11:40', endTime: '12:20', kind: 'lesson' },
  { order: 8, name: 'P8', startTime: '12:20', endTime: '13:00', kind: 'lesson' },
];

/** Within the school day (07:20–13:00). */
export const withinSchoolDay = (p: Pick<Period, 'startTime' | 'endTime'>) =>
  hhmmToMinutes(p.startTime) >= hhmmToMinutes(SCHOOL_DAY_START) &&
  hhmmToMinutes(p.endTime) <= hhmmToMinutes(SCHOOL_DAY_END);

/** Active rows of the bell schedule in time order (lessons and break), 07:20–13:00. */
export const bellOrder = (periods: Period[]): Period[] =>
  periods
    .filter(p => p.isActive !== false && withinSchoolDay(p))
    .sort((a, b) => hhmmToMinutes(a.startTime) - hhmmToMinutes(b.startTime) || a.order - b.order);

/** The lesson periods 1..8, in time order. */
export const lessonPeriods = (periods: Period[]): Period[] =>
  bellOrder(periods).filter(
    p => p.kind === 'lesson' && p.order >= 1 && p.order <= MAX_LESSON_PERIODS,
  );

export interface BellPlan {
  /** True when the year's schedule already matches SCHOOL_BELL exactly. */
  upToDate: boolean;
  /** Existing period docs to change (fields to set). */
  updates: Array<{ id: string; label: string; set: Partial<BellRow> & { isActive?: boolean } }>;
  /** Rows of SCHOOL_BELL that have no document yet. */
  creates: BellRow[];
  /** old lesson number → new lesson number (only where it changes). */
  remap: Map<number, number>;
  /** Old lesson numbers that disappear (a 9th+ lesson): their timetable rows are retired. */
  dropped: number[];
  /** Human-readable list of what will change. */
  summary: string[];
}

/**
 * What it takes to make a year's bell schedule exactly SCHOOL_BELL. Active
 * lessons are matched in time order to P1..P8 (their timetable rows and
 * registers follow them); the first non-lesson row becomes the Break;
 * anything else is deactivated. Pure: says what to change.
 */
export function planSchoolBell(periods: Period[]): BellPlan {
  const byTime = (a: Period, b: Period) =>
    hhmmToMinutes(a.startTime) - hhmmToMinutes(b.startTime) || a.order - b.order;
  const active = periods.filter(p => p.isActive !== false).sort(byTime);
  const lessons = active.filter(p => p.kind === 'lesson');
  const others = active.filter(p => p.kind !== 'lesson');
  const std = SCHOOL_BELL.filter(r => r.kind === 'lesson');
  const brk = SCHOOL_BELL.find(r => r.kind !== 'lesson')!;

  const updates: BellPlan['updates'] = [];
  const creates: BellRow[] = [];
  const remap = new Map<number, number>();
  const dropped: number[] = [];
  const summary: string[] = [];
  const differs = (p: Period, r: BellRow) =>
    p.order !== r.order || p.name !== r.name || p.startTime !== r.startTime || p.endTime !== r.endTime || p.kind !== r.kind;

  std.forEach((r, i) => {
    const p = lessons[i];
    if (!p) {
      creates.push(r);
      summary.push(`Add ${r.name} ${r.startTime}–${r.endTime}`);
      return;
    }
    if (p.order !== r.order) remap.set(p.order, r.order);
    if (differs(p, r)) {
      updates.push({ id: p.id, label: p.name, set: { ...r } });
      summary.push(`${p.name} (${p.startTime}–${p.endTime}${p.order !== r.order ? `, no. ${p.order}` : ''}) → ${r.name} ${r.startTime}–${r.endTime}`);
    }
  });
  for (const p of lessons.slice(std.length)) {
    dropped.push(p.order);
    updates.push({ id: p.id, label: p.name, set: { isActive: false, order: 0 } });
    summary.push(`${p.name} (${p.startTime}–${p.endTime}) is switched off — there are only 8 lessons`);
  }
  const [first, ...rest] = others;
  if (!first) {
    creates.push(brk);
    summary.push(`Add Break ${brk.startTime}–${brk.endTime}`);
  } else if (differs(first, brk)) {
    updates.push({ id: first.id, label: first.name, set: { ...brk } });
    summary.push(`${first.name} (${first.startTime}–${first.endTime}) → Break ${brk.startTime}–${brk.endTime}`);
  }
  for (const p of rest) {
    updates.push({ id: p.id, label: p.name, set: { isActive: false, order: 0 } });
    summary.push(`${p.name} (${p.startTime}–${p.endTime}) is switched off — the only break is 10:00–10:20`);
  }
  // Inactive lessons keep no number, so they can never clash with P1..P8.
  for (const p of periods) {
    if (p.isActive === false && p.order !== 0) updates.push({ id: p.id, label: p.name, set: { order: 0 } });
  }
  return { upToDate: updates.length === 0 && creates.length === 0, updates, creates, remap, dropped, summary };
}

export const hhmmToMinutes = (hhmm: string): number => {
  const [h, m] = (hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const formatYMD = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Local 'YYYY-MM-DD' → weekday 1..5, or null for Saturday/Sunday. */
export const weekdayOf = (date: Date | string): Weekday | null => {
  const d = typeof date === 'string' ? new Date(`${date}T12:00:00`) : date;
  const dow = d.getDay();
  return dow >= 1 && dow <= 5 ? (dow as Weekday) : null;
};

/**
 * Old rows may carry `isDouble: true` (one row meaning two periods). Return
 * the period orders such a row really occupies: its own and the next lesson
 * period, if that one directly follows (no break between).
 */
export function legacyDoubleOrders(periodIndex: number, periods: Period[]): number[] {
  const bell = bellOrder(periods);
  const i = bell.findIndex(p => p.order === periodIndex);
  const next = i >= 0 ? bell[i + 1] : undefined;
  return next && next.kind === 'lesson' ? [periodIndex, next.order] : [periodIndex];
}

// ── Blocks ────────────────────────────────────────────────────────────

export interface Block<R extends RowLike> {
  key: string;
  slotId: string;
  classId: string;
  className: string;
  subject: string;
  dayOfWeek: Weekday;
  rows: R[];
  periodIndexes: number[];
  periods: Period[];
  /** 'P5' or 'P5–P7'. */
  label: string;
  /** 1 single, 2 double, 3 triple … */
  size: number;
  startTime: string | null;
  endTime: string | null;
}

export const blockSizeName = (n: number) =>
  n === 1 ? 'single' : n === 2 ? 'double' : n === 3 ? 'triple' : `${n} periods`;

/**
 * Group rows into blocks: same subject, same day, periods directly after
 * each other in the bell schedule. A break between two periods splits them.
 */
export function groupIntoBlocks<R extends RowLike>(rows: R[], periods: Period[]): Block<R>[] {
  const bell = bellOrder(periods);
  const pos = new Map(bell.map((p, i) => [p.order, i]));
  const byOrder = new Map(bell.map(p => [p.order, p]));

  const sorted = [...rows].sort(
    (a, b) =>
      a.dayOfWeek - b.dayOfWeek ||
      a.periodIndex - b.periodIndex ||
      a.slotId.localeCompare(b.slotId),
  );

  const blocks: Block<R>[] = [];
  let cur: R[] = [];
  const flush = () => {
    if (cur.length === 0) return;
    const first = cur[0];
    const ps = cur.map(r => byOrder.get(r.periodIndex)).filter(Boolean) as Period[];
    const names = cur.map(r => byOrder.get(r.periodIndex)?.name ?? `#${r.periodIndex}`);
    blocks.push({
      key: `${first.slotId}|${first.dayOfWeek}|${first.periodIndex}`,
      slotId: first.slotId,
      classId: first.classId,
      className: first.className,
      subject: first.subject,
      dayOfWeek: first.dayOfWeek,
      rows: cur,
      periodIndexes: cur.map(r => r.periodIndex),
      periods: ps,
      label: names.length === 1 ? names[0] : `${names[0]}–${names[names.length - 1]}`,
      size: cur.length,
      startTime: byOrder.get(first.periodIndex)?.startTime ?? null,
      endTime: byOrder.get(cur[cur.length - 1].periodIndex)?.endTime ?? null,
    });
    cur = [];
  };

  // Group by slot+day first so other subjects in between don't matter.
  const groups = new Map<string, R[]>();
  for (const r of sorted) {
    const k = `${r.slotId}|${r.dayOfWeek}`;
    const arr = groups.get(k) ?? [];
    if (!arr.some(x => x.periodIndex === r.periodIndex)) arr.push(r);
    groups.set(k, arr);
  }
  for (const arr of groups.values()) {
    for (const r of arr) {
      const prev = cur[cur.length - 1];
      const pi = pos.get(r.periodIndex);
      const pp = prev ? pos.get(prev.periodIndex) : undefined;
      const adjacent =
        prev !== undefined && pi !== undefined && pp !== undefined && pi === pp + 1 &&
        byOrder.get(r.periodIndex)?.kind === 'lesson';
      if (!adjacent) flush();
      cur.push(r);
    }
    flush();
  }

  return blocks.sort(
    (a, b) =>
      a.dayOfWeek - b.dayOfWeek ||
      a.periodIndexes[0] - b.periodIndexes[0] ||
      a.className.localeCompare(b.className),
  );
}

// ── Now & next ────────────────────────────────────────────────────────

export interface NowNext<B> {
  current: B | null;
  next: B | null;
  /** Minutes until `next` starts (null when there is no next). */
  minutesToNext: number | null;
  /** Minutes until `current` ends. */
  minutesLeft: number | null;
  /** All of today's lessons are over. */
  dayOver: boolean;
}

/** `blocks` must all be for the same day. */
export function nowAndNext<B extends { startTime: string | null; endTime: string | null }>(
  blocks: B[],
  at: Date,
): NowNext<B> {
  const now = at.getHours() * 60 + at.getMinutes();
  const timed = blocks
    .filter(b => b.startTime && b.endTime)
    .sort((a, b) => hhmmToMinutes(a.startTime!) - hhmmToMinutes(b.startTime!));
  let current: B | null = null;
  let next: B | null = null;
  for (const b of timed) {
    const s = hhmmToMinutes(b.startTime!);
    const e = hhmmToMinutes(b.endTime!);
    if (now >= s && now < e && !current) current = b;
    else if (s >= now && !next && b !== current) next = b;
  }
  const last = timed[timed.length - 1];
  return {
    current,
    next,
    minutesToNext: next ? hhmmToMinutes(next.startTime!) - now : null,
    minutesLeft: current ? hhmmToMinutes(current.endTime!) - now : null,
    dayOver: !!last && now >= hhmmToMinutes(last.endTime!),
  };
}

// ── Clash checking ────────────────────────────────────────────────────

export interface ClashContext {
  /** Live rows to check against (other subjects, other teachers). */
  live: RowLike[];
  /** Teacher ids (owner and live cover) of every slot involved. */
  teachersBySlot: Map<string, Array<{ id: string; name: string }>>;
  /** Live rows of these slots are being replaced, so they are ignored. */
  replaceSlotIds: Set<string>;
  periods: Period[];
}

/**
 * Check proposed rows against each other and the live timetable.
 *   class-clash   the class already has another subject in that period
 *   teacher-clash a teacher would be in two places at once
 *   not-lesson    the period is a break, lunch or assembly (or unknown)
 */
export function checkClashes(proposal: RowLike[], ctx: ClashContext): TimetableConflict[] {
  // Only lessons 1..8 (before 13:00) are periods; breaks are not.
  const byOrder = new Map(lessonPeriods(ctx.periods).map(p => [p.order, p]));
  const pname = (o: number) => byOrder.get(o)?.name ?? `period ${o}`;
  const out: TimetableConflict[] = [];
  const seen = new Set<string>();
  const add = (c: TimetableConflict) => {
    const k = `${c.kind}|${c.dayOfWeek}|${c.periodIndex}|${c.message}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  };

  const others = [
    ...proposal.map(r => ({ r, proposed: true })),
    ...ctx.live.filter(r => !ctx.replaceSlotIds.has(r.slotId)).map(r => ({ r, proposed: false })),
  ];
  const cell = new Map<string, typeof others>();
  for (const o of others) {
    const k = `${o.r.dayOfWeek}|${o.r.periodIndex}`;
    const arr = cell.get(k) ?? [];
    arr.push(o);
    cell.set(k, arr);
  }

  for (const p of proposal) {
    const where = `${dayName(p.dayOfWeek)} ${pname(p.periodIndex)}`;
    const period = byOrder.get(p.periodIndex);
    if (!period) {
      add({
        kind: 'not-lesson',
        message: `${p.className} ${p.subject}: ${where} is not a lesson period (lessons are P1–P${MAX_LESSON_PERIODS}, ending by ${SCHOOL_DAY_END}).`,
        entryIds: [p.slotId],
        dayOfWeek: p.dayOfWeek,
        periodIndex: p.periodIndex,
      });
    }

    const same = (cell.get(`${p.dayOfWeek}|${p.periodIndex}`) ?? []).filter(o => o.r.slotId !== p.slotId);
    const mine = ctx.teachersBySlot.get(p.slotId) ?? [];

    for (const o of same) {
      if (o.r.classId === p.classId) {
        const [a, b] = [p.subject, o.r.subject].sort();
        add({
          kind: 'class-clash',
          message: `${p.className} would have ${a} and ${b} on ${where}.`,
          entryIds: [p.slotId, o.r.slotId].sort(),
          dayOfWeek: p.dayOfWeek,
          periodIndex: p.periodIndex,
        });
      }
      const theirs = ctx.teachersBySlot.get(o.r.slotId) ?? [];
      for (const t of mine) {
        if (theirs.some(x => x.id === t.id)) {
          const pair = [`${p.className} ${p.subject}`, `${o.r.className} ${o.r.subject}`].sort();
          add({
            kind: 'teacher-clash',
            message: `${t.name} would teach ${pair[0]} and ${pair[1]} at the same time (${where}).`,
            entryIds: [p.slotId, o.r.slotId].sort(),
            dayOfWeek: p.dayOfWeek,
            periodIndex: p.periodIndex,
          });
        }
      }
    }
  }
  return out;
}

export const blockingConflicts = (cs: TimetableConflict[]) => cs.filter(c => c.kind !== 'holiday');

/**
 * For the tick-box editor: why each lesson cell can't be ticked for
 * `subject` (empty map = all free). `otherDraft` is the editor's current
 * ticks for the teacher's OTHER subjects; their live rows are replaced by
 * the draft, so `ctx.replaceSlotIds` must list every subject being edited.
 */
export function cellBlockers(
  subject: Omit<RowLike, 'dayOfWeek' | 'periodIndex'>,
  otherDraft: RowLike[],
  ctx: ClashContext,
): Map<string, string> {
  const out = new Map<string, string>();
  const live = [...ctx.live.filter(r => !ctx.replaceSlotIds.has(r.slotId)), ...otherDraft];
  const local: ClashContext = { ...ctx, live, replaceSlotIds: new Set() };
  for (const p of lessonPeriods(ctx.periods)) {
    for (const d of WEEKDAYS) {
      const cs = checkClashes([{ ...subject, dayOfWeek: d, periodIndex: p.order }], local);
      if (cs.length === 0) continue;
      const other = live.find(
        r => r.dayOfWeek === d && r.periodIndex === p.order && r.slotId !== subject.slotId &&
          cs.some(c => c.entryIds.includes(r.slotId)),
      );
      out.set(
        `${d}:${p.order}`,
        other
          ? other.classId === subject.classId
            ? `${other.subject} is on`
            : `${other.className} ${other.subject}`
          : cs[0].message,
      );
    }
  }
  return out;
}

/**
 * The lesson period running at `at`, else the next one today, else the
 * last one (after school). Null when there are no lesson periods.
 */
export function lessonPeriodAt(periods: Period[], at: Date): { period: Period; running: boolean } | null {
  const lessons = lessonPeriods(periods);
  if (lessons.length === 0) return null;
  const now = at.getHours() * 60 + at.getMinutes();
  const running = lessons.find(p => now >= hhmmToMinutes(p.startTime) && now < hhmmToMinutes(p.endTime));
  if (running) return { period: running, running: true };
  const next = lessons.find(p => hhmmToMinutes(p.startTime) >= now);
  return { period: next ?? lessons[lessons.length - 1], running: false };
}
