// @/services/promotionPlan.ts
//
// Pure planning logic for the year transition (no Firestore here, so every
// rule can be unit-tested). promotionService.ts loads the data, calls these
// functions, and writes the result.
//
// The plan answers, for every active learner:
//   - what happens to them (promote / repeat / graduate / leave / stay),
//   - which class they end up in,
//   - which student id they carry in the new year.
//
// Student ids
// ───────────
// Ids look like `F2A_007` (class prefix + number). When a learner moves up
// they keep their NUMBER and take the new class's prefix: F1A_007 → F2A_007.
// If that id would clash with someone else, the learner gets the next free
// number in the new class instead. Graduates and leavers keep their id with
// the year added (G12A_007 → G12A_007-2026), which frees `G12A_007` for next
// year's Grade 12 and keeps every id unique for ever.

import type {
  ClassDestination,
  ClassRef,
  EnrollmentOutcome,
  LearnerDecision,
  NewClassSpec,
  PlanClassSummary,
  PlanIssue,
  PlanItem,
  PlanLearner,
  PromotionAction,
  PromotionPlan,
  PromotionSettings,
} from '@/types/promotion';

// ==================== SMALL HELPERS ====================

export const classPrefixFor = (type: 'grade' | 'form', level: number, section: string): string =>
  `${type === 'grade' ? 'G' : 'F'}${level}${section}`.toUpperCase();

export const classDisplayName = (type: 'grade' | 'form', level: number, section: string): string =>
  `${type === 'grade' ? 'Grade' : 'Form'} ${level}${section.toUpperCase()}`;

export const newClassTempId = (type: 'grade' | 'form', level: number, section: string): string =>
  `new:${type}-${level}-${section.toUpperCase()}`;

export const isTempClassId = (id: string): boolean => id.startsWith('new:');

const pad3 = (n: number) => String(n).padStart(3, '0');

export const formatStudentId = (prefix: string, index: number): string => `${prefix}_${pad3(index)}`;

/** The id a graduate / leaver keeps: `G12A_007-2026`. Idempotent. */
export const alumniStudentId = (studentId: string, year: number): string => {
  if (!studentId) return '';
  return /-\d{4}$/.test(studentId) ? studentId : `${studentId}-${year}`;
};

/** Number part of `F1A_007` → 7 (null when the id has another shape). */
export const indexFromStudentId = (studentId: string | undefined): number | null => {
  const m = /_(\d+)$/.exec(studentId || '');
  return m ? Number(m[1]) : null;
};

export const isCountedStatus = (status: string | undefined | null): boolean =>
  status === undefined || status === null || status === '' || status === 'active';

export const outcomeFor = (action: PromotionAction): EnrollmentOutcome =>
  action === 'promote' ? 'promoted'
    : action === 'repeat' ? 'repeated'
      : action === 'graduate' ? 'graduated'
        : action === 'leave' ? 'left'
          : 'continuing';

export const ACTION_LABEL: Record<PromotionAction, string> = {
  promote: 'Promote',
  repeat: 'Repeat',
  graduate: 'Graduate',
  leave: 'Leaves school',
  stay: 'New-year admission (stays)',
};

export const DEFAULT_SETTINGS = (fromYear: number): PromotionSettings => ({
  fromYear,
  toYear: fromYear + 1,
  finalFormLevel: 4,
  finalGradeLevel: 12,
});

/** Next level for a class, or 'graduate' after the final year. */
export function nextLevelOf(
  type: 'grade' | 'form',
  level: number,
  settings: Pick<PromotionSettings, 'finalFormLevel' | 'finalGradeLevel'>
): { type: 'grade' | 'form'; level: number } | 'graduate' {
  const final = type === 'grade' ? settings.finalGradeLevel : settings.finalFormLevel;
  if (level >= final) return 'graduate';
  return { type, level: level + 1 };
}

/** Levels that receive a new intake every year (they are not archived when empty). */
export const isIntakeLevel = (type: 'grade' | 'form', level: number): boolean =>
  (type === 'form' && level === 1) || (type === 'grade' && (level === 8 || level === 10));

const sameStream = (c: ClassRef, type: string, level: number, section: string) =>
  c.type === type && c.level === level && c.section.toUpperCase() === section.toUpperCase();

// ==================== DEFAULT CLASS MAP ====================

/**
 * Default destination for every active class: the same stream one level up
 * (Form 1A → Form 2A). The final level graduates. When the next class does
 * not exist yet it is added to `newClasses` (an archived class of that name
 * is re-used instead of creating a duplicate).
 */
export function defaultClassMap(
  classes: ClassRef[],
  settings: PromotionSettings
): { map: Record<string, ClassDestination>; newClasses: NewClassSpec[] } {
  const map: Record<string, ClassDestination> = {};
  const newClasses = new Map<string, NewClassSpec>();

  const sources = classes.filter(c => c.isActive);
  for (const c of sources) {
    const next = nextLevelOf(c.type, c.level, settings);
    if (next === 'graduate') {
      map[c.id] = { kind: 'graduate' };
      continue;
    }
    const existing =
      classes.find(x => x.isActive && sameStream(x, next.type, next.level, c.section)) ??
      classes.find(x => !x.isActive && sameStream(x, next.type, next.level, c.section));
    if (existing) {
      map[c.id] = { kind: 'class', classId: existing.id };
      continue;
    }
    // Nobody to move → no need to create the next class.
    if (c.learnerCount === 0) continue;
    const tempId = newClassTempId(next.type, next.level, c.section);
    if (!newClasses.has(tempId)) {
      newClasses.set(tempId, {
        tempId,
        name: classDisplayName(next.type, next.level, c.section),
        type: next.type,
        level: next.level,
        section: c.section.toUpperCase(),
      });
    }
    map[c.id] = { kind: 'class', classId: tempId };
  }
  return { map, newClasses: [...newClasses.values()] };
}

// ==================== DEFAULT DECISIONS ====================

/** Admitted for the new year already (first-entry date in the new year). */
export const isNewYearAdmission = (l: PlanLearner, toYear: number): boolean =>
  !!l.dateOfFirstEntry && l.dateOfFirstEntry >= `${toYear}-01-01`;

export function defaultDecision(
  learner: PlanLearner,
  map: Record<string, ClassDestination>,
  settings: PromotionSettings
): LearnerDecision {
  if (isNewYearAdmission(learner, settings.toYear)) return { action: 'stay' };
  const dest = map[learner.classId];
  if (dest?.kind === 'graduate') return { action: 'graduate' };
  return { action: 'promote' };
}

// ==================== PLAN ====================

export interface PlanInput {
  settings: PromotionSettings;
  classes: ClassRef[];
  /** ALL learners (every status) — needed to keep student ids unique. */
  learners: PlanLearner[];
  map: Record<string, ClassDestination>;
  newClasses: NewClassSpec[];
  decisions?: Record<string, LearnerDecision>;
}

interface ClassInfo {
  id: string;
  name: string;
  type: 'grade' | 'form';
  level: number;
  section: string;
  isNew: boolean;
  isActive: boolean;
}

export function buildPromotionPlan(input: PlanInput): PromotionPlan {
  const { settings, classes, learners, map, newClasses } = input;
  const decisions = input.decisions ?? {};
  const issues: PlanIssue[] = [];
  const skipped: PromotionPlan['skipped'] = [];

  if (settings.toYear !== settings.fromYear + 1) {
    issues.push({ level: 'error', message: `The new year must follow the closing year (${settings.fromYear} → ${settings.fromYear + 1}).` });
  }

  const info = new Map<string, ClassInfo>();
  for (const c of classes) {
    info.set(c.id, { id: c.id, name: c.name, type: c.type, level: c.level, section: c.section, isNew: false, isActive: c.isActive });
  }
  for (const n of newClasses) {
    info.set(n.tempId, { id: n.tempId, name: n.name, type: n.type, level: n.level, section: n.section, isNew: true, isActive: true });
  }

  // ---- who is in the plan ----
  const active = learners.filter(l => isCountedStatus(l.status));
  const eligible: PlanLearner[] = [];
  const stayingOutside: PlanLearner[] = []; // active but not planned (already in the new year)
  for (const l of active) {
    const cls = info.get(l.classId);
    if ((l.academicYear ?? 0) >= settings.toYear) {
      skipped.push({ learnerId: l.id, fullName: l.fullName, reason: `Already placed for ${settings.toYear}` });
      stayingOutside.push(l);
      continue;
    }
    if (!cls || cls.isNew) {
      skipped.push({ learnerId: l.id, fullName: l.fullName, reason: 'Not in any class' });
      continue;
    }
    if (!cls.isActive) {
      skipped.push({ learnerId: l.id, fullName: l.fullName, reason: `Class ${cls.name} is archived` });
      continue;
    }
    eligible.push(l);
  }

  // ---- decisions + destinations ----
  type Draft = Omit<PlanItem, 'toStudentId' | 'toStudentIndex'> & { fromIndexGuess: number | null };
  const drafts: Draft[] = [];
  for (const l of eligible) {
    const from = info.get(l.classId)!;
    const dec = decisions[l.id] ?? defaultDecision(l, map, settings);
    let toClassId = l.classId;

    if (dec.action === 'promote') {
      const dest = map[l.classId];
      toClassId = dec.toClassId ?? (dest?.kind === 'class' ? dest.classId : '');
      if (!toClassId) {
        issues.push({
          level: 'error',
          learnerId: l.id,
          classId: l.classId,
          message: `${l.fullName} (${from.name}) is set to Promote but ${from.name} has no next class. Choose a class or set Graduate.`,
        });
        toClassId = l.classId;
      }
    } else if (dec.action === 'repeat' || dec.action === 'stay') {
      toClassId = dec.toClassId ?? l.classId;
    }

    const to = info.get(toClassId);
    if (!to) {
      issues.push({ level: 'error', learnerId: l.id, message: `${l.fullName}: destination class not found.` });
      continue;
    }

    if (dec.action === 'promote' && toClassId !== l.classId && (to.type !== from.type || to.level !== from.level + 1)) {
      issues.push({
        level: 'warning',
        learnerId: l.id,
        classId: l.classId,
        message: `${l.fullName} is promoted from ${from.name} to ${to.name}, which is not the next level.`,
      });
    }
    if (dec.action === 'repeat' && (to.type !== from.type || to.level !== from.level)) {
      issues.push({
        level: 'warning',
        learnerId: l.id,
        message: `${l.fullName} repeats but is placed in ${to.name}, a different level from ${from.name}.`,
      });
    }

    drafts.push({
      learnerId: l.id,
      fullName: l.fullName,
      gender: l.gender,
      action: dec.action,
      outcome: outcomeFor(dec.action),
      fromClassId: l.classId,
      fromClassName: from.name,
      fromStudentId: l.studentId || '',
      fromStudentIndex: l.studentIndex ?? indexFromStudentId(l.studentId) ?? 0,
      toClassId,
      toClassName: to.name,
      reason: dec.action === 'leave' ? (dec.reason || '').trim() || undefined : undefined,
      fromIndexGuess: l.studentIndex ?? indexFromStudentId(l.studentId),
    });
  }

  // Graduating from a class that is not the final level is unusual.
  const nonFinalGrads = new Map<string, number>();
  for (const d of drafts) {
    if (d.action !== 'graduate') continue;
    const c = info.get(d.fromClassId)!;
    if (nextLevelOf(c.type, c.level, settings) !== 'graduate') {
      nonFinalGrads.set(c.name, (nonFinalGrads.get(c.name) ?? 0) + 1);
    }
  }
  for (const [name, n] of nonFinalGrads) {
    issues.push({ level: 'warning', message: `${n} learner(s) in ${name} are set to graduate although ${name} is not a final year.` });
  }

  // ---- student ids ----
  const planned = new Set(drafts.map(d => d.learnerId));
  const prefixOf = (classId: string) => {
    const c = info.get(classId)!;
    return classPrefixFor(c.type, c.level, c.section);
  };

  // Ids held by anyone the plan does not change.
  const taken = new Set<string>();
  for (const l of learners) {
    if (!planned.has(l.id) && l.studentId) taken.add(l.studentId);
  }

  const result = new Map<string, { id: string; index: number }>();
  const movers: Draft[] = [];

  for (const d of drafts) {
    if (d.action === 'graduate' || d.action === 'leave') {
      const id = alumniStudentId(d.fromStudentId, settings.fromYear);
      result.set(d.learnerId, { id, index: d.fromStudentIndex });
      if (id) taken.add(id);
      continue;
    }
    const keepsClass = d.toClassId === d.fromClassId;
    const keepsPrefix = d.fromStudentId.startsWith(`${prefixOf(d.toClassId)}_`);
    if (keepsClass && d.fromStudentId && keepsPrefix && !taken.has(d.fromStudentId)) {
      result.set(d.learnerId, { id: d.fromStudentId, index: d.fromStudentIndex });
      taken.add(d.fromStudentId);
      continue;
    }
    movers.push(d);
  }

  // Movers try to keep their number; deterministic order.
  movers.sort((a, b) =>
    a.toClassId.localeCompare(b.toClassId) ||
    (a.fromIndexGuess ?? 1e9) - (b.fromIndexGuess ?? 1e9) ||
    a.fullName.localeCompare(b.fullName)
  );
  const losers: Draft[] = [];
  for (const d of movers) {
    const prefix = prefixOf(d.toClassId);
    if (d.fromIndexGuess && d.fromIndexGuess > 0) {
      const want = formatStudentId(prefix, d.fromIndexGuess);
      if (!taken.has(want)) {
        taken.add(want);
        result.set(d.learnerId, { id: want, index: d.fromIndexGuess });
        continue;
      }
    }
    losers.push(d);
  }

  // Next free number per destination prefix: above every number in use with
  // that prefix and every index in that class (matches the admission code).
  const nextFree = new Map<string, number>();
  const highest = (classId: string): number => {
    const prefix = prefixOf(classId);
    let max = 0;
    const re = new RegExp(`^${prefix}_(\\d+)(?:-\\d{4})?$`);
    for (const id of taken) {
      const m = re.exec(id);
      if (m) max = Math.max(max, Number(m[1]));
    }
    for (const l of learners) {
      if (l.classId === classId && typeof l.studentIndex === 'number') max = Math.max(max, l.studentIndex);
    }
    return max;
  };
  losers.sort((a, b) => a.toClassId.localeCompare(b.toClassId) || a.fullName.localeCompare(b.fullName));
  for (const d of losers) {
    const prefix = prefixOf(d.toClassId);
    let n = nextFree.get(d.toClassId) ?? highest(d.toClassId) + 1;
    while (taken.has(formatStudentId(prefix, n))) n++;
    const id = formatStudentId(prefix, n);
    taken.add(id);
    result.set(d.learnerId, { id, index: n });
    nextFree.set(d.toClassId, n + 1);
  }

  const items: PlanItem[] = drafts.map(({ fromIndexGuess, ...d }) => ({
    ...d,
    toStudentId: result.get(d.learnerId)!.id,
    toStudentIndex: result.get(d.learnerId)!.index,
  }));

  // ---- class summaries ----
  const sum = new Map<string, PlanClassSummary>();
  const ensure = (id: string): PlanClassSummary => {
    let s = sum.get(id);
    if (!s) {
      const c = info.get(id)!;
      s = { classId: id, name: c.name, type: c.type, level: c.level, isNew: c.isNew, before: 0, after: 0, incoming: 0, outgoing: 0, staying: 0 };
      sum.set(id, s);
    }
    return s;
  };
  for (const c of info.values()) if (c.isActive) ensure(c.id);
  for (const l of [...eligible, ...stayingOutside]) {
    if (info.has(l.classId)) ensure(l.classId).before++;
  }
  for (const l of stayingOutside) {
    if (info.has(l.classId)) {
      ensure(l.classId).after++;
      ensure(l.classId).staying++;
    }
  }
  for (const it of items) {
    const from = ensure(it.fromClassId);
    if (it.action === 'graduate' || it.action === 'leave') {
      from.outgoing++;
      continue;
    }
    const to = ensure(it.toClassId);
    to.after++;
    if (it.toClassId === it.fromClassId) {
      to.staying++;
    } else {
      to.incoming++;
      from.outgoing++;
    }
  }

  // Only create new classes that receive someone.
  const usedNew = new Set(items.filter(i => isTempClassId(i.toClassId)).map(i => i.toClassId));
  const neededNewClasses = newClasses.filter(n => usedNew.has(n.tempId));
  for (const n of newClasses) if (!usedNew.has(n.tempId)) sum.delete(n.tempId);

  const classSummaries = [...sum.values()].sort((a, b) =>
    a.type.localeCompare(b.type) || a.level - b.level || a.name.localeCompare(b.name)
  );
  const emptyAfter = classSummaries.filter(s => !s.isNew && s.after === 0).map(s => s.classId);

  const counts: Record<PromotionAction, number> = { promote: 0, repeat: 0, graduate: 0, leave: 0, stay: 0 };
  for (const it of items) counts[it.action]++;

  if (items.length === 0) {
    issues.push({ level: 'info', message: 'There are no learners to move.' });
  }

  return {
    settings,
    items,
    newClasses: neededNewClasses,
    emptyAfter,
    classSummaries,
    issues,
    skipped,
    counts,
  };
}

/** Classes suggested for archiving: empty after the move and not an intake level. */
export function suggestedArchive(plan: PromotionPlan): string[] {
  return plan.classSummaries
    .filter(s => !s.isNew && s.after === 0 && !isIntakeLevel(s.type, s.level))
    .map(s => s.classId);
}

/** Rows for the "old id → new id" CSV handed to the school after the run. */
export function idChangeRows(items: PlanItem[]): string[][] {
  const rows = [['Learner', 'Outcome', 'From class', 'Old ID', 'To class', 'New ID']];
  const label: Record<EnrollmentOutcome, string> = {
    promoted: 'Promoted', repeated: 'Repeating', graduated: 'Graduated', left: 'Left school', continuing: 'Continuing',
  };
  for (const it of [...items].sort((a, b) => a.toClassName.localeCompare(b.toClassName) || a.toStudentId.localeCompare(b.toStudentId))) {
    rows.push([
      it.fullName,
      label[it.outcome],
      it.fromClassName,
      it.fromStudentId,
      it.action === 'graduate' || it.action === 'leave' ? '' : it.toClassName,
      it.toStudentId,
    ]);
  }
  return rows;
}
