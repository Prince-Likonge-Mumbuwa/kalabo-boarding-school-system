// @/services/timetableGenerator/problem.ts
//
// Pure functions (no Firestore): turn the school's set-up into the solver's
// problem, check that the problem can be solved at all, and work out whether
// the school is ready to generate (every department has finished its
// allocations).

import {
  CELLS,
  DAYS,
  MORNING_LAST,
  PERIODS_PER_DAY,
  type AllocationSignoff,
  type ClassException,
  type Issue,
  type Problem,
  type ProblemClass,
  type ProblemSlot,
  type SubjectRequirement,
  type TimetableConfig,
  type Unit,
  type Weekday,
} from './types';
import type { TermName } from '@/utils/academicTerm';

// ==================== CELLS ====================

/** Cell index 0..39 of (day 1..5, period 1..8). */
export const cellOf = (day: number, period: number) => (day - 1) * PERIODS_PER_DAY + (period - 1);
export const dayOfCell = (cell: number) => (Math.floor(cell / PERIODS_PER_DAY) + 1) as Weekday;
export const periodOfCell = (cell: number) => (cell % PERIODS_PER_DAY) + 1;
export const isMorning = (period: number) => period <= MORNING_LAST;

/** First periods a lesson of `size` may start at without crossing the break. */
export function startsFor(size: number, morningOnly: boolean): number[] {
  const out: number[] = [];
  const halves: Array<[number, number]> = morningOnly ? [[1, MORNING_LAST]] : [[1, MORNING_LAST], [MORNING_LAST + 1, PERIODS_PER_DAY]];
  for (const [a, b] of halves) for (let p = a; p + size - 1 <= b; p++) out.push(p);
  return out;
}

// ==================== LEVELS ====================

export interface ClassLike {
  id: string;
  name: string;
  type?: string | null;
  level?: number | null;
  isActive?: boolean;
  archived?: boolean;
}

/** 'form-1', 'grade-10'… from the class's type and level (or its name). */
export function levelKeyOf(c: Pick<ClassLike, 'name' | 'type' | 'level'>): string {
  const t = (c.type ?? '').toString().toLowerCase();
  if ((t === 'form' || t === 'grade') && typeof c.level === 'number' && c.level > 0) return `${t}-${c.level}`;
  const m = /^\s*(form|grade)\s*(\d+)/i.exec(c.name ?? '');
  if (m) return `${m[1].toLowerCase()}-${Number(m[2])}`;
  return `class-${(c.name ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export function levelLabel(key: string): string {
  const m = /^(form|grade)-(\d+)$/.exec(key);
  if (m) return `${m[1] === 'form' ? 'Form' : 'Grade'} ${m[2]}`;
  return key.replace(/^class-/, '').replace(/-/g, ' ');
}

/** Sort Form 1..5 then Grade 8..12 (as the school lists them). */
export const compareLevels = (a: string, b: string) => {
  const pa = /^(form|grade)-(\d+)$/.exec(a);
  const pb = /^(form|grade)-(\d+)$/.exec(b);
  if (pa && pb) return pa[1] === pb[1] ? Number(pa[2]) - Number(pb[2]) : pa[1] === 'form' ? -1 : 1;
  return a.localeCompare(b);
};

export const activeClasses = <C extends ClassLike>(classes: C[]) =>
  classes
    .filter(c => c.isActive !== false && !c.archived)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

// ==================== REQUIREMENTS ====================

/** Is a requirement sensible on its own? Returns the problems found. */
export function requirementProblems(r: SubjectRequirement): string[] {
  const out: string[] = [];
  const ints = [r.min, r.max, r.doubles, r.triples];
  if (ints.some(n => !Number.isInteger(n) || n < 0)) out.push('use whole numbers of 0 or more');
  if (r.min < 1) out.push('at least 1 period a week');
  if (r.max < r.min) out.push('the most must be at least the fewest');
  if (r.max > 12) out.push('at most 12 periods a week');
  if (r.doubles * 2 + r.triples * 3 > r.min) out.push('the doubles and triples need more periods than the fewest a week');
  return out;
}

/** The class's requirements: its level's subjects with its exceptions applied. */
export function requirementsForClass(
  cfg: TimetableConfig,
  classId: string,
  levelKey: string,
): SubjectRequirement[] {
  const level = cfg.levels[levelKey];
  if (!level) return [];
  const ex = new Map<string, ClassException>();
  for (const e of cfg.exceptions) if (e.classId === classId) ex.set(e.normalizedSubject, e);
  const out: SubjectRequirement[] = [];
  for (const r of level.subjects) {
    const e = ex.get(r.normalizedSubject);
    if (e?.excluded) continue;
    out.push({
      ...r,
      min: e?.min ?? r.min,
      max: Math.max(e?.max ?? r.max, e?.min ?? r.min),
      doubles: e?.doubles ?? r.doubles,
      triples: e?.triples ?? r.triples,
    });
  }
  return out;
}

/** Number of separate lessons (blocks) a requirement makes, at `periods`. */
export const blockCount = (r: Pick<SubjectRequirement, 'doubles' | 'triples'>, periods: number) =>
  r.doubles + r.triples + Math.max(0, periods - 2 * r.doubles - 3 * r.triples);

// ==================== PROBLEM ====================

export interface SlotInput {
  slotId: string;
  classId: string;
  normalizedSubject: string;
  subject: string;
  /** Owner and any live cover / TP teacher. */
  teacherIds: string[];
  teacherNames: string[];
}

export interface BuildInput {
  term: TermName;
  year: number;
  config: TimetableConfig;
  classes: ClassLike[];
  /** Existing class slots (only those that exist; missing ones are vacant). */
  slots: SlotInput[];
}

export const slotIdOf = (classId: string, normalizedSubject: string) => `${classId}__${normalizedSubject}`;

export function buildProblem({ term, year, config, classes, slots }: BuildInput): Problem {
  const slotMap = new Map(slots.map(s => [s.slotId, s]));
  const pClasses: ProblemClass[] = [];
  const pSlots: ProblemSlot[] = [];
  const teachers = new Map<string, string>();

  for (const c of activeClasses(classes)) {
    const levelKey = levelKeyOf(c);
    const blocked = new Set<number>();
    for (const ev of config.events) {
      if (ev.levels.length && !ev.levels.includes(levelKey)) continue;
      for (const d of ev.days) for (const p of ev.periods) if (p >= 1 && p <= PERIODS_PER_DAY) blocked.add(cellOf(d, p));
    }
    pClasses.push({ id: c.id, name: c.name, levelKey, blocked: [...blocked].sort((a, b) => a - b) });

    for (const r of requirementsForClass(config, c.id, levelKey)) {
      const slotId = slotIdOf(c.id, r.normalizedSubject);
      const s = slotMap.get(slotId);
      const teacherIds = s?.teacherIds.filter(Boolean) ?? [];
      (s?.teacherIds ?? []).forEach((id, i) => id && teachers.set(id, s!.teacherNames[i] ?? 'Teacher'));
      pSlots.push({
        slotId,
        classId: c.id,
        className: c.name,
        levelKey,
        subject: s?.subject || r.subject,
        normalizedSubject: r.normalizedSubject,
        teacherIds,
        teacherNames: s?.teacherNames ?? [],
        roomId: r.roomId && config.rooms.some(x => x.id === r.roomId) ? r.roomId : null,
        min: r.min,
        max: Math.max(r.max, r.min),
        doubles: r.doubles,
        triples: r.triples,
        time: r.time,
        notLast: !!r.notLast,
      });
    }
  }

  // Lessons: triples, doubles, then singles up to `min` (required), then
  // optional singles up to `max`.
  const units: Unit[] = [];
  pSlots.forEach((s, i) => {
    for (let k = 0; k < s.triples; k++) units.push({ id: units.length, slot: i, size: 3, optional: false });
    for (let k = 0; k < s.doubles; k++) units.push({ id: units.length, slot: i, size: 2, optional: false });
    const singles = Math.max(0, s.min - 3 * s.triples - 2 * s.doubles);
    for (let k = 0; k < singles; k++) units.push({ id: units.length, slot: i, size: 1, optional: false });
    for (let k = 0; k < s.max - s.min; k++) units.push({ id: units.length, slot: i, size: 1, optional: true });
  });

  return {
    term,
    year,
    classes: pClasses,
    slots: pSlots,
    teachers: [...teachers].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    rooms: config.rooms,
    units,
    maxTeacherPeriodsPerDay: config.maxTeacherPeriodsPerDay || 6,
  };
}

// ==================== CAN IT BE SOLVED? ====================

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * Arithmetic checks before solving. Errors make a timetable impossible;
 * warnings are worth knowing.
 */
export function checkProblem(p: Problem): Issue[] {
  const issues: Issue[] = [];
  const classById = new Map(p.classes.map(c => [c.id, c]));
  const freeOf = (c: ProblemClass) => CELLS - c.blocked.length;
  const freeMorningOf = (c: ProblemClass) => DAYS.length * MORNING_LAST - c.blocked.filter(x => isMorning(periodOfCell(x))).length;

  if (p.classes.length === 0) issues.push({ level: 'error', message: 'There are no active classes.' });

  // Per class
  for (const c of p.classes) {
    const mine = p.slots.filter(s => s.classId === c.id);
    if (mine.length === 0) {
      issues.push({ level: 'error', message: `${c.name}: no subjects are set for its level (Curriculum).` });
      continue;
    }
    const need = mine.reduce((n, s) => n + s.min, 0);
    if (need > freeOf(c)) {
      issues.push({ level: 'error', message: `${c.name} needs ${need} periods a week but has only ${freeOf(c)} free periods.` });
    }
    const morning = mine.filter(s => s.time === 'morning-only').reduce((n, s) => n + s.min, 0);
    if (morning > freeMorningOf(c)) {
      issues.push({ level: 'error', message: `${c.name} needs ${morning} morning periods for mornings-only subjects but has only ${freeMorningOf(c)}.` });
    }
    if (need <= freeOf(c) && freeOf(c) - need > 6) {
      issues.push({ level: 'warning', message: `${c.name} has ${freeOf(c) - need} periods a week with no lesson.` });
    }
  }

  // Per slot
  for (const s of p.slots) {
    const blocks = blockCount(s, s.min);
    if (s.doubles * 2 + s.triples * 3 > s.min) {
      issues.push({ level: 'error', message: `${s.className} ${s.subject}: doubles and triples need more than ${plural(s.min, 'period')}.` });
    }
    if (blocks > 2 * DAYS.length) {
      issues.push({ level: 'error', message: `${s.className} ${s.subject}: ${blocks} separate lessons do not fit in a week.` });
    }
    if (s.teacherIds.length === 0) {
      issues.push({ level: 'warning', message: `${s.className} ${s.subject} has no teacher yet: it will be timetabled without one.` });
    }
    const c = classById.get(s.classId);
    if (c && s.triples > 0) {
      const halves = s.time === 'morning-only' ? 1 : 2;
      let roomy = 0;
      for (const d of DAYS) for (let h = 0; h < halves; h++) {
        const ps = h === 0 ? [1, 2, 3, 4] : [5, 6, 7, 8];
        const free = ps.filter(pp => !c.blocked.includes(cellOf(d, pp)));
        if (free.length >= 3) roomy++;
      }
      if (roomy < s.triples) issues.push({ level: 'error', message: `${s.className} ${s.subject}: not enough free half-days for ${plural(s.triples, 'triple')}.` });
    }
  }

  // Cells a group of slots can use: where at least one of their classes is
  // free of school events.
  const usable = (group: ProblemSlot[]) => {
    let all = 0;
    let morning = 0;
    const cls = [...new Set(group.map(s => s.classId))].map(id => classById.get(id)).filter(Boolean) as ProblemClass[];
    for (let cell = 0; cell < CELLS; cell++) {
      if (cls.some(c => !c.blocked.includes(cell))) {
        all++;
        if (isMorning(periodOfCell(cell))) morning++;
      }
    }
    return { all, morning };
  };
  const capacity = (who: string, group: ProblemSlot[], verb: string) => {
    if (!group.length) return;
    const { all, morning } = usable(group);
    const need = group.reduce((n, s) => n + s.min, 0);
    if (need > all) issues.push({ level: 'error', message: `${who} ${verb} ${need} periods a week, but only ${all} periods are free.` });
    else if (verb === 'is allocated' && need > 34) issues.push({ level: 'warning', message: `${who} is allocated ${need} periods a week (very heavy).` });
    // A half-day (4 periods) holds at most one triple.
    const triples = group.reduce((n, s) => n + s.triples, 0);
    const morningTriples = group.filter(s => s.time === 'morning-only').reduce((n, s) => n + s.triples, 0);
    if (morningTriples > DAYS.length) issues.push({ level: 'error', message: `${who} ${verb} ${morningTriples} mornings-only triples; a week has only ${DAYS.length} mornings.` });
    else if (triples > 2 * DAYS.length) issues.push({ level: 'error', message: `${who} ${verb} ${triples} triples; a week has room for only ${2 * DAYS.length}.` });
    const m = group.filter(s => s.time === 'morning-only').reduce((n, s) => n + s.min, 0);
    if (m > morning) issues.push({ level: 'error', message: `${who} ${verb} ${m} mornings-only periods, but only ${morning} morning periods are free.` });
  };

  // Per teacher
  for (const t of p.teachers) capacity(t.name, p.slots.filter(s => s.teacherIds.includes(t.id)), 'is allocated');
  // Per room
  for (const r of p.rooms) capacity(r.name, p.slots.filter(s => s.roomId === r.id), 'is needed for');

  return issues;
}

// ==================== READINESS ====================

export interface DepartmentReadiness {
  department: string;
  /** Class subjects of this department that need a teacher. */
  allocations: number;
  vacant: number;
  vacantList: string[];
  signoff: AllocationSignoff | null;
}

export interface Readiness {
  levels: Array<{ key: string; label: string; classCount: number; subjectCount: number }>;
  missingLevels: string[];
  departments: DepartmentReadiness[];
  /** Curriculum subjects no department has chosen. */
  noDepartment: string[];
  vacantTotal: number;
  /** Everything needed to generate is in place. */
  ready: boolean;
  blockers: string[];
}

export function readiness(input: {
  config: TimetableConfig;
  classes: ClassLike[];
  /** Ids of existing slots that have an owner. */
  ownedSlotIds: Set<string>;
  /** normalizedSubject → department (from system/departments). */
  departmentOf: (normalizedSubject: string) => string | null;
  signoffs: AllocationSignoff[];
}): Readiness {
  const { config, classes, ownedSlotIds, departmentOf, signoffs } = input;
  const levels = new Map<string, { key: string; label: string; classCount: number; subjectCount: number }>();
  const depts = new Map<string, DepartmentReadiness>();
  const noDept = new Set<string>();
  let vacantTotal = 0;

  for (const c of activeClasses(classes)) {
    const key = levelKeyOf(c);
    const lv = levels.get(key) ?? { key, label: config.levels[key]?.label || levelLabel(key), classCount: 0, subjectCount: config.levels[key]?.subjects.length ?? 0 };
    lv.classCount++;
    levels.set(key, lv);
    for (const r of requirementsForClass(config, c.id, key)) {
      const dept = departmentOf(r.normalizedSubject);
      if (!dept) {
        noDept.add(r.subject);
        continue;
      }
      const d = depts.get(dept) ?? { department: dept, allocations: 0, vacant: 0, vacantList: [], signoff: null };
      d.allocations++;
      if (!ownedSlotIds.has(slotIdOf(c.id, r.normalizedSubject))) {
        d.vacant++;
        vacantTotal++;
        if (d.vacantList.length < 30) d.vacantList.push(`${c.name} ${r.subject}`);
      }
      depts.set(dept, d);
    }
  }
  for (const s of signoffs) {
    const d = depts.get(s.department);
    if (d) d.signoff = s;
  }

  const missingLevels = [...levels.values()].filter(l => l.subjectCount === 0).map(l => l.label);
  const departments = [...depts.values()].sort((a, b) => a.department.localeCompare(b.department));
  const blockers: string[] = [];
  if (levels.size === 0) blockers.push('There are no active classes.');
  if (missingLevels.length) blockers.push(`Set the subjects for ${missingLevels.join(', ')} (Curriculum).`);
  if (noDept.size) blockers.push(`No department has chosen ${[...noDept].sort().join(', ')}. The HoD (or admin) adds them to a department.`);
  const unsigned = departments.filter(d => !d.signoff);
  if (unsigned.length) blockers.push(`Waiting for allocations to be marked complete: ${unsigned.map(d => d.department).join(', ')}.`);

  return {
    levels: [...levels.values()].sort((a, b) => compareLevels(a.key, b.key)),
    missingLevels,
    departments,
    noDepartment: [...noDept].sort(),
    vacantTotal,
    ready: blockers.length === 0,
    blockers,
  };
}
