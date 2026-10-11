// @/services/promotionService.ts
//
// Year transition: loads the school's classes and learners, builds the plan
// (./promotionPlan.ts), runs it, and can undo it.
//
// What a run changes
// ──────────────────
//   learners     classId / className / class fields / studentId / studentIndex
//                move to the new class; `academicYear` becomes the new year.
//                Graduates → status 'graduated'; leavers → status 'transferred'.
//                The old id is kept in `previousStudentIds`.
//   enrollments  one CLOSED record per learner for the closing year: their
//                class, id and outcome that year. Past-year screens use it.
//   sba_results  a learner's running SBA record moves to their new class;
//                a repeater's record moves to their new exam year.
//   classes      missing next classes are created; chosen empty classes are
//                archived; `year` and learner counts are brought up to date.
//   system/academicYear  currentYear = new year.
//   promotion_runs/{from}-{to}  the stored plan + progress (resume / undo).
//
// What a run never changes
// ────────────────────────
//   results, attendance registers, teacher assignments, class subjects,
//   timetables. Results and registers are keyed by the learner's document id
//   and the term/year or date, so they stay correct as they are.
//
// Every step is idempotent: a run that stops half-way can be resumed, and
// learners already moved are skipped (`lastPromotionRunId`).

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCurrentAcademicTerm } from '@/utils/academicTerm';
import type {
  AcademicYearState,
  ClassRef,
  Enrollment,
  PlanItem,
  PlanLearner,
  PromotionPlan,
  PromotionRun,
} from '@/types/promotion';
import { classPrefixFor, isCountedStatus, isTempClassId } from './promotionPlan';
import { ENROLLMENTS, enrollmentId, mapEnrollment } from './enrollmentService';

export const RUNS = 'promotion_runs';
/** The plan's learner lines, in chunks (a large school's plan would not fit
 *  in one document): `promotion_run_items/{runId}_{n}` = { runId, index, items }. */
export const RUN_ITEMS = 'promotion_run_items';
const ITEMS_PER_CHUNK = 250;
const SBA = 'sba_results';
const MAX_BATCH_OPS = 400;

export const runIdFor = (fromYear: number, toYear: number) => `${fromYear}-${toYear}`;

// ==================== SMALL HELPERS ====================

const parseClassName = (name: string): { type: 'grade' | 'form'; level: number; section: string } | null => {
  const m = /(Grade|Form)\s*(\d+)\s*([A-Za-z]*)/i.exec(name || '');
  if (!m) return null;
  return { type: m[1].toLowerCase() === 'grade' ? 'grade' : 'form', level: Number(m[2]), section: (m[3] || 'A').toUpperCase() };
};

const classFields = (id: string, d: DocumentData) => {
  const parsed = parseClassName(d.name || '');
  return {
    id,
    name: d.name || id,
    type: (d.type || parsed?.type || 'grade') as 'grade' | 'form',
    level: Number(d.level ?? parsed?.level ?? 0),
    section: String(d.section || parsed?.section || 'A').toUpperCase(),
    isActive: d.isActive !== false && d.archived !== true,
    year: typeof d.year === 'number' ? d.year : undefined,
  };
};

/**
 * Firestore rejects `undefined` field values (ignoreUndefinedProperties is
 * off in lib/firebase.ts). Drop them from plain objects and arrays; leave
 * sentinels such as serverTimestamp() untouched.
 */
export function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.filter(v => v !== undefined).map(v => clean(v)) as any;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v !== undefined) out[k] = clean(v);
    }
    return out as T;
  }
  return value;
}

/** Commits in chunks below Firestore's 500-writes-per-batch limit. */
class ChunkedWriter {
  private batch = writeBatch(db);
  private ops = 0;
  committed = 0;
  async add(fn: (b: ReturnType<typeof writeBatch>) => void, weight = 1) {
    if (this.ops + weight > MAX_BATCH_OPS) await this.flush();
    fn(this.batch);
    this.ops += weight;
  }
  async flush() {
    if (this.ops === 0) return;
    await this.batch.commit();
    this.committed += this.ops;
    this.batch = writeBatch(db);
    this.ops = 0;
  }
}

const toPlanLearner = (id: string, d: DocumentData): PlanLearner => ({
  id,
  fullName: d.fullName || d.name || 'Unknown',
  gender: d.gender,
  studentId: d.studentId || '',
  studentIndex: typeof d.studentIndex === 'number' ? d.studentIndex : undefined,
  classId: d.classId || '',
  status: d.status,
  academicYear: typeof d.academicYear === 'number' ? d.academicYear : undefined,
  dateOfFirstEntry: typeof d.dateOfFirstEntry === 'string' ? d.dateOfFirstEntry : undefined,
});

const mapRun = (id: string, d: DocumentData): PromotionRun => ({
  id,
  fromYear: d.fromYear,
  toYear: d.toYear,
  status: d.status,
  settings: d.settings,
  items: d.items || [],
  newClasses: d.newClasses || [],
  createdClassIds: d.createdClassIds || {},
  archivedClassIds: d.archivedClassIds || [],
  yearUpdatedClassIds: d.yearUpdatedClassIds || [],
  counts: d.counts || { promote: 0, repeat: 0, graduate: 0, leave: 0, stay: 0 },
  sbaMoved: d.sbaMoved,
  startedAt: d.startedAt,
  completedAt: d.completedAt,
  revertedAt: d.revertedAt,
  startedBy: d.startedBy,
  startedByName: d.startedByName,
  error: d.error,
  requestedArchiveIds: d.requestedArchiveIds || [],
  reactivatedClassIds: d.reactivatedClassIds || [],
  classYearBefore: d.classYearBefore || {},
  warnings: d.warnings || [],
  undoWarnings: d.undoWarnings || [],
});

// ==================== SCHOOL YEAR ====================

/**
 * The academic year the school is in: set by the last year transition,
 * otherwise the calendar's academic year.
 */
export async function getSchoolYear(): Promise<number> {
  try {
    const snap = await getDoc(doc(db, 'system', 'academicYear'));
    const y = snap.exists() ? Number(snap.data()?.currentYear) : NaN;
    if (Number.isFinite(y) && y > 2000) return y;
  } catch {
    /* signed out / rules — fall back to the calendar */
  }
  return getCurrentAcademicTerm().year;
}

/**
 * Year to stamp on a newly admitted learner: the school year, or the year of
 * their first-entry date when that is later (admitted for next year before
 * the transition has been run).
 */
export async function admissionYearFor(dateOfFirstEntry?: string): Promise<number> {
  const school = await getSchoolYear();
  const y = Number((dateOfFirstEntry || '').slice(0, 4));
  return Number.isFinite(y) && y > school ? y : school;
}

// ==================== LOADING ====================

export interface TransitionData {
  classes: ClassRef[];
  classYears: Map<string, number | undefined>;
  learners: PlanLearner[];
  yearState: AcademicYearState | null;
  runs: PromotionRun[];
  suggestedFromYear: number;
}

export async function loadTransitionData(): Promise<TransitionData> {
  const [classSnap, learnerSnap, sysSnap, runSnap] = await Promise.all([
    getDocs(collection(db, 'classes')),
    getDocs(collection(db, 'learners')),
    getDoc(doc(db, 'system', 'academicYear')),
    getDocs(collection(db, RUNS)),
  ]);

  const learners = learnerSnap.docs.map(d => toPlanLearner(d.id, d.data()));
  const counts = new Map<string, number>();
  for (const l of learners) {
    if (isCountedStatus(l.status)) counts.set(l.classId, (counts.get(l.classId) ?? 0) + 1);
  }

  const classYears = new Map<string, number | undefined>();
  const classes: ClassRef[] = classSnap.docs.map(d => {
    const c = classFields(d.id, d.data());
    classYears.set(d.id, c.year);
    return { id: c.id, name: c.name, type: c.type, level: c.level, section: c.section, isActive: c.isActive, learnerCount: counts.get(d.id) ?? 0 };
  });

  const yearState = sysSnap.exists()
    ? ({ currentYear: Number(sysSnap.data()?.currentYear), lastRunId: sysSnap.data()?.lastRunId } as AcademicYearState)
    : null;
  const runs = (await Promise.all(runSnap.docs.map(d => withItems(d.id, d.data())))).sort((a, b) => b.fromYear - a.fromYear);

  return { classes, classYears, learners, yearState, runs, suggestedFromYear: suggestFromYear(yearState, classes, classYears) };
}

/**
 * Year being closed: the recorded school year; else the year most active
 * classes carry; else the calendar (January–March still belongs to the year
 * that is ending, since Term 3 runs into January).
 */
export function suggestFromYear(
  yearState: AcademicYearState | null,
  classes: ClassRef[],
  classYears: Map<string, number | undefined>,
  now = new Date()
): number {
  if (yearState?.currentYear && yearState.currentYear > 2000) return yearState.currentYear;
  const tally = new Map<number, number>();
  for (const c of classes) {
    const y = classYears.get(c.id);
    if (c.isActive && typeof y === 'number' && y > 2000) tally.set(y, (tally.get(y) ?? 0) + 1);
  }
  if (tally.size > 0) return [...tally.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  return now.getMonth() <= 2 ? now.getFullYear() - 1 : now.getFullYear();
}

async function loadRunItems(runId: string): Promise<PlanItem[]> {
  const snap = await getDocs(query(collection(db, RUN_ITEMS), where('runId', '==', runId)));
  return snap.docs
    .map(d => d.data())
    .sort((a, b) => a.index - b.index)
    .flatMap(d => (d.items || []) as PlanItem[]);
}

async function withItems(id: string, data: DocumentData): Promise<PromotionRun> {
  const run = mapRun(id, data);
  if (!Array.isArray(data.items)) run.items = await loadRunItems(id);
  return run;
}

export async function loadRuns(): Promise<PromotionRun[]> {
  const snap = await getDocs(collection(db, RUNS));
  const runs = await Promise.all(snap.docs.map(d => withItems(d.id, d.data())));
  return runs.sort((a, b) => b.fromYear - a.fromYear);
}

export async function getRun(runId: string): Promise<PromotionRun | null> {
  const snap = await getDoc(doc(db, RUNS, runId));
  return snap.exists() ? withItems(snap.id, snap.data()) : null;
}

// ==================== START ====================

export interface RunUser {
  uid?: string;
  name?: string;
}

/**
 * Store the plan as a run. Refuses when the year was already moved (undo
 * first) or a run for it is unfinished (resume it instead).
 */
export async function startPromotionRun(
  plan: PromotionPlan,
  archiveClassIds: string[],
  user: RunUser = {}
): Promise<string> {
  const errors = plan.issues.filter(i => i.level === 'error');
  if (errors.length > 0) throw new Error(`Fix the plan first: ${errors[0].message}`);
  if (plan.items.length === 0) throw new Error('There are no learners to move.');

  const { fromYear, toYear } = plan.settings;
  const runId = runIdFor(fromYear, toYear);
  const existing = await getRun(runId);
  if (existing?.status === 'completed') {
    throw new Error(`${fromYear} → ${toYear} has already been run. Undo it first if it must be run again.`);
  }
  if (existing?.status === 'running' || existing?.status === 'failed') {
    throw new Error(`A ${fromYear} → ${toYear} run is unfinished. Resume it instead of starting again.`);
  }

  // Learner lines first (replacing those of an undone earlier attempt),
  // then the run record that points at them.
  const stale = await getDocs(query(collection(db, RUN_ITEMS), where('runId', '==', runId)));
  const itemWriter = new ChunkedWriter();
  for (const d of stale.docs) await itemWriter.add(b => b.delete(d.ref));
  for (let i = 0, n = 0; i < plan.items.length; i += ITEMS_PER_CHUNK, n++) {
    const chunk = plan.items.slice(i, i + ITEMS_PER_CHUNK);
    await itemWriter.add(b => b.set(doc(db, RUN_ITEMS, `${runId}_${n}`), clean({ runId, index: n, items: chunk })));
  }
  await itemWriter.flush();

  await setDoc(doc(db, RUNS, runId), clean({
    fromYear,
    toYear,
    status: 'running',
    settings: plan.settings,
    itemCount: plan.items.length,
    newClasses: plan.newClasses,
    createdClassIds: {},
    requestedArchiveIds: archiveClassIds,
    archivedClassIds: [],
    reactivatedClassIds: [],
    yearUpdatedClassIds: [],
    classYearBefore: {},
    counts: plan.counts,
    startedAt: serverTimestamp(),
    startedBy: user.uid ?? null,
    startedByName: user.name ?? null,
    error: null,
  }));
  return runId;
}

// ==================== EXECUTE ====================

export interface RunProgress {
  step: 'classes' | 'learners' | 'finishing' | 'done';
  done: number;
  total: number;
  message: string;
}

export interface RunOutcome {
  runId: string;
  moved: number;
  skippedAlreadyDone: number;
  sbaMoved: number;
  createdClasses: number;
  archivedClasses: number;
  warnings: string[];
}

/** Run (or resume) a stored plan. */
export async function executePromotionRun(
  runId: string,
  onProgress: (p: RunProgress) => void = () => {}
): Promise<RunOutcome> {
  const run = await getRun(runId);
  if (!run) throw new Error('Run not found.');
  if (run.status === 'completed') throw new Error('This run is already complete.');
  if (run.status === 'reverted') throw new Error('This run was undone. Start a new one.');

  const runRef = doc(db, RUNS, runId);
  const warnings: string[] = [];
  try {
    if (run.status !== 'running') await updateDoc(runRef, { status: 'running', error: null });

    // ---------- 1. classes ----------
    onProgress({ step: 'classes', done: 0, total: run.newClasses.length, message: 'Preparing classes…' });
    const classSnap = await getDocs(collection(db, 'classes'));
    const classes = new Map(classSnap.docs.map(d => [d.id, { ...classFields(d.id, d.data()), raw: d.data() }]));
    const created: Record<string, string> = { ...run.createdClassIds };

    for (const spec of run.newClasses) {
      if (created[spec.tempId] && classes.has(created[spec.tempId])) continue;
      const reuse = [...classes.values()].find(c =>
        c.isActive && c.type === spec.type && c.level === spec.level && c.section === spec.section
      );
      if (reuse) {
        created[spec.tempId] = reuse.id;
        continue;
      }
      const ref = doc(collection(db, 'classes'));
      const data = {
        name: spec.name,
        year: run.toYear,
        type: spec.type,
        level: spec.level,
        section: spec.section,
        students: 0,
        teachers: [],
        isActive: true,
        createdByRunId: runId,
        createdDate: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(ref, clean(data));
      created[spec.tempId] = ref.id;
      classes.set(ref.id, { ...classFields(ref.id, data), raw: data });
    }
    await updateDoc(runRef, { createdClassIds: created });

    const resolve = (id: string) => (isTempClassId(id) ? created[id] : id);
    for (const it of run.items) {
      if (!resolve(it.toClassId)) throw new Error(`Class ${it.toClassName} could not be created.`);
    }

    // Archived classes chosen as destinations come back into use.
    const reactivated: string[] = [...(run.reactivatedClassIds ?? [])];
    for (const id of new Set(run.items.map(i => resolve(i.toClassId)))) {
      const c = classes.get(id);
      if (c && !c.isActive && (run.items.some(i => resolve(i.toClassId) === id && i.action !== 'graduate' && i.action !== 'leave'))) {
        await updateDoc(doc(db, 'classes', id), { isActive: true, archived: false, updatedAt: serverTimestamp() });
        c.isActive = true;
        if (!reactivated.includes(id)) reactivated.push(id);
      }
    }
    await updateDoc(runRef, { reactivatedClassIds: reactivated });

    // ---------- 2. learners (+ enrollments + SBA) ----------
    const learnerSnap = await getDocs(collection(db, 'learners'));
    const learners = new Map(learnerSnap.docs.map(d => [d.id, d.data()]));

    // SBA records of the source classes, by learner.
    const sbaByLearner = new Map<string, Array<{ id: string; data: DocumentData }>>();
    const sourceClassIds = new Set(
      run.items.filter(i => i.action === 'promote' || i.action === 'repeat').map(i => i.fromClassId)
    );
    for (const classId of sourceClassIds) {
      const snap = await getDocs(query(collection(db, SBA), where('classId', '==', classId)));
      for (const d of snap.docs) {
        const data = d.data();
        const arr = sbaByLearner.get(data.studentId) ?? [];
        arr.push({ id: d.id, data });
        sbaByLearner.set(data.studentId, arr);
      }
    }

    const writer = new ChunkedWriter();
    let moved = 0;
    let skippedAlreadyDone = 0;
    let sbaMoved = 0;
    const total = run.items.length;

    for (let i = 0; i < run.items.length; i++) {
      const it = run.items[i];
      const current = learners.get(it.learnerId);
      if (!current) {
        warnings.push(`${it.fullName}: learner record no longer exists — skipped.`);
        continue;
      }
      if (current.lastPromotionRunId === runId) {
        skippedAlreadyDone++;
        continue;
      }

      const toClassId = resolve(it.toClassId);
      const to = classes.get(toClassId)!;
      const from = classes.get(it.fromClassId);
      const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

      // SBA: only records the learner has not yet sat (examYear >= new year).
      const sbaMoves: NonNullable<Enrollment['sbaMoves']> = [];
      const movesClass = toClassId !== it.fromClassId;
      if (it.action === 'promote' || it.action === 'repeat') {
        for (const r of sbaByLearner.get(it.learnerId) ?? []) {
          const examYear = Number(r.data.examYear);
          if (!Number.isFinite(examYear) || examYear < run.toYear) continue;
          const newForm = String(to.level || r.data.form || '');
          if (it.action === 'promote') {
            if (!movesClass) continue;
            ops.push(b => b.update(doc(db, SBA, r.id), { classId: toClassId, className: to.name, form: newForm, updatedAt: new Date().toISOString() }));
            sbaMoves.push({ fromId: r.id, toId: r.id, classId: r.data.classId, className: r.data.className || '', form: String(r.data.form ?? '') });
          } else {
            // Repeater: sits the exam a year later → same record, next exam year.
            const newExamYear = examYear + 1;
            const newId = `${it.learnerId}_${r.data.subjectId}_${newExamYear}`;
            const clash = await getDoc(doc(db, SBA, newId));
            if (clash.exists()) {
              warnings.push(`${it.fullName}: SBA ${r.data.subjectName || r.data.subjectId} for ${newExamYear} already exists — left unchanged.`);
              continue;
            }
            const copy = { ...r.data, id: newId, examYear: newExamYear, classId: toClassId, className: to.name, form: newForm, updatedAt: new Date().toISOString() };
            ops.push(b => b.set(doc(db, SBA, newId), clean(copy)));
            ops.push(b => b.delete(doc(db, SBA, r.id)));
            sbaMoves.push({ fromId: r.id, toId: newId, classId: r.data.classId, className: r.data.className || '', form: String(r.data.form ?? '') });
          }
        }
      }

      // Closed enrollment for the year that ends.
      const enrollment: Enrollment = {
        learnerId: it.learnerId,
        year: run.fromYear,
        classId: it.fromClassId,
        className: from?.name || it.fromClassName,
        classType: from?.type,
        classLevel: from?.level,
        classSection: from?.section,
        studentId: current.studentId || it.fromStudentId,
        studentIndex: typeof current.studentIndex === 'number' ? current.studentIndex : it.fromStudentIndex,
        fullName: current.fullName || current.name || it.fullName,
        gender: current.gender ?? null,
        outcome: it.outcome,
        nextClassId: it.action === 'graduate' || it.action === 'leave' ? null : toClassId,
        nextClassName: it.action === 'graduate' || it.action === 'leave' ? null : to.name,
        nextStudentId: it.toStudentId || null,
        closed: true,
        runId,
        sbaMoves,
        createdAt: serverTimestamp(),
      };
      ops.push(b => b.set(doc(db, ENROLLMENTS, enrollmentId(it.learnerId, run.fromYear)), clean(enrollment)));

      // Learner.
      const prevIds: string[] = Array.isArray(current.previousStudentIds) ? [...current.previousStudentIds] : [];
      const oldId = current.studentId || '';
      if (oldId && oldId !== it.toStudentId && !prevIds.includes(oldId)) prevIds.push(oldId);
      const common = {
        lastPromotionRunId: runId,
        previousStudentIds: prevIds,
        updatedAt: serverTimestamp(),
      };

      if (it.action === 'graduate' || it.action === 'leave') {
        ops.push(b => b.update(doc(db, 'learners', it.learnerId), clean({
          ...common,
          status: it.action === 'graduate' ? 'graduated' : 'transferred',
          studentId: it.toStudentId || oldId,
          academicYear: run.fromYear,
          exitYear: run.fromYear,
          exitReason: it.action === 'graduate' ? 'Completed school' : (it.reason || 'Left school'),
          leftAt: serverTimestamp(),
          ...(it.action === 'graduate' ? { graduationYear: run.fromYear } : {}),
        })));
      } else {
        ops.push(b => b.update(doc(db, 'learners', it.learnerId), clean({
          ...common,
          status: 'active',
          academicYear: run.toYear,
          classId: toClassId,
          className: to.name,
          classType: to.type,
          classLevel: to.level,
          classSection: to.section,
          classPrefix: classPrefixFor(to.type, to.level, to.section),
          studentId: it.toStudentId,
          studentIndex: it.toStudentIndex,
        })));
      }

      await writer.add(b => ops.forEach(op => op(b)), ops.length);
      moved++;
      sbaMoved += sbaMoves.length;
      if (i % 25 === 0 || i === total - 1) {
        onProgress({ step: 'learners', done: i + 1, total, message: `Moving learners… ${i + 1} of ${total}` });
      }
    }
    await writer.flush();

    // ---------- 3. classes: counts, year, archive ----------
    onProgress({ step: 'finishing', done: total, total, message: 'Updating classes…' });
    const after = await getDocs(collection(db, 'learners'));
    const counts = new Map<string, number>();
    for (const d of after.docs) {
      const data = d.data();
      if (isCountedStatus(data.status)) counts.set(data.classId, (counts.get(data.classId) ?? 0) + 1);
    }

    const requested: string[] = run.requestedArchiveIds ?? [];
    const archived: string[] = [...run.archivedClassIds];
    const yearUpdated: string[] = [...run.yearUpdatedClassIds];
    const yearBefore: Record<string, number | null> = { ...(run.classYearBefore ?? {}) };
    const classWriter = new ChunkedWriter();

    for (const c of classes.values()) {
      const n = counts.get(c.id) ?? 0;
      const update: Record<string, any> = { students: n };
      if (requested.includes(c.id) && c.isActive) {
        if (n === 0) {
          Object.assign(update, { isActive: false, archived: true, archivedAt: serverTimestamp(), archivedByRunId: runId });
          if (!archived.includes(c.id)) archived.push(c.id);
        } else {
          warnings.push(`${c.name} was not archived: it still has ${n} learner(s).`);
        }
      }
      const staysActive = c.isActive && update.isActive !== false;
      if (staysActive && c.year !== run.toYear) {
        if (!(c.id in yearBefore)) yearBefore[c.id] = c.year ?? null;
        update.year = run.toYear;
        if (!yearUpdated.includes(c.id)) yearUpdated.push(c.id);
      }
      if ((c.raw?.students ?? null) === n && Object.keys(update).length === 1) continue;
      update.updatedAt = serverTimestamp();
      await classWriter.add(b => b.update(doc(db, 'classes', c.id), clean(update)));
    }
    await classWriter.flush();

    // ---------- 4. school year + run record ----------
    await setDoc(doc(db, 'system', 'academicYear'), {
      currentYear: run.toYear,
      lastRunId: runId,
      updatedAt: serverTimestamp(),
    });

    await updateDoc(runRef, clean({
      status: 'completed',
      completedAt: serverTimestamp(),
      archivedClassIds: archived,
      yearUpdatedClassIds: yearUpdated,
      classYearBefore: yearBefore,
      sbaMoved: (run.sbaMoved ?? 0) + sbaMoved,
      warnings,
      error: null,
    }));

    onProgress({ step: 'done', done: total, total, message: 'Done' });
    return {
      runId,
      moved,
      skippedAlreadyDone,
      sbaMoved,
      createdClasses: [...classes.values()].filter(c => c.raw?.createdByRunId === runId).length,
      archivedClasses: archived.length,
      warnings,
    };
  } catch (e: any) {
    await updateDoc(runRef, { status: 'failed', error: e?.message || String(e) }).catch(() => {});
    throw e;
  }
}

// ==================== UNDO ====================

export interface UndoCheck {
  newYearResults: number;
  learnersAdmittedIntoCreatedClasses: number;
}

/** What an undo would leave behind (shown before confirming). */
export async function checkUndo(runId: string): Promise<UndoCheck> {
  const run = await getRun(runId);
  if (!run) throw new Error('Run not found.');
  const results = await getDocs(query(collection(db, 'results'), where('year', '==', run.toYear)));
  const planned = new Set(run.items.map(i => i.learnerId));
  const createdIds = new Set(Object.values(run.createdClassIds));
  let admitted = 0;
  if (createdIds.size > 0) {
    const learners = await getDocs(collection(db, 'learners'));
    for (const d of learners.docs) {
      if (!planned.has(d.id) && createdIds.has(d.data().classId)) admitted++;
    }
  }
  return { newYearResults: results.docs.filter(d => planned.has(d.data().studentId)).length, learnersAdmittedIntoCreatedClasses: admitted };
}

/**
 * Put every learner, SBA record and class back where the run found them.
 * Results or registers saved in the new year are left as they are.
 */
export async function undoPromotionRun(
  runId: string,
  onProgress: (p: RunProgress) => void = () => {}
): Promise<{ restored: number; warnings: string[] }> {
  const run = await getRun(runId);
  if (!run) throw new Error('Run not found.');
  if (run.status === 'reverted') throw new Error('This run has already been undone.');
  const warnings: string[] = [];

  const enrSnap = await getDocs(query(collection(db, ENROLLMENTS), where('runId', '==', runId)));
  const enrollments = enrSnap.docs.map(d => mapEnrollment(d.data()));
  const learnerSnap = await getDocs(collection(db, 'learners'));
  const learners = new Map(learnerSnap.docs.map(d => [d.id, d.data()]));

  const writer = new ChunkedWriter();
  let restored = 0;
  for (let i = 0; i < enrollments.length; i++) {
    const e = enrollments[i];
    const current = learners.get(e.learnerId);
    const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

    // SBA back first.
    for (const m of e.sbaMoves ?? []) {
      if (m.fromId === m.toId) {
        const snap = await getDoc(doc(db, SBA, m.toId));
        if (snap.exists()) ops.push(b => b.update(doc(db, SBA, m.toId), { classId: m.classId, className: m.className, form: m.form }));
      } else {
        const snap = await getDoc(doc(db, SBA, m.toId));
        if (snap.exists()) {
          const data = snap.data();
          ops.push(b => b.set(doc(db, SBA, m.fromId), clean({
            ...data, id: m.fromId, examYear: Number(data.examYear) - 1, classId: m.classId, className: m.className, form: m.form,
          })));
          ops.push(b => b.delete(doc(db, SBA, m.toId)));
        }
      }
    }

    if (current) {
      const prevIds: string[] = Array.isArray(current.previousStudentIds)
        ? current.previousStudentIds.filter((x: string) => x !== e.studentId)
        : [];
      ops.push(b => b.update(doc(db, 'learners', e.learnerId), clean({
        status: 'active',
        classId: e.classId,
        className: e.className,
        classType: e.classType ?? null,
        classLevel: e.classLevel ?? null,
        classSection: e.classSection ?? null,
        classPrefix: e.classType && e.classLevel ? classPrefixFor(e.classType, e.classLevel, e.classSection || 'A') : (current.classPrefix ?? null),
        studentId: e.studentId,
        studentIndex: e.studentIndex ?? null,
        academicYear: run.fromYear,
        previousStudentIds: prevIds,
        lastPromotionRunId: null,
        graduationYear: null,
        exitYear: null,
        exitReason: null,
        leftAt: null,
        updatedAt: serverTimestamp(),
      })));
      restored++;
    } else {
      warnings.push(`${e.fullName}: learner record no longer exists.`);
    }
    ops.push(b => b.delete(doc(db, ENROLLMENTS, enrollmentId(e.learnerId, e.year))));
    await writer.add(b => ops.forEach(op => op(b)), ops.length);
    if (i % 25 === 0 || i === enrollments.length - 1) {
      onProgress({ step: 'learners', done: i + 1, total: enrollments.length, message: `Restoring learners… ${i + 1} of ${enrollments.length}` });
    }
  }
  await writer.flush();

  // Classes.
  onProgress({ step: 'finishing', done: enrollments.length, total: enrollments.length, message: 'Restoring classes…' });
  const after = await getDocs(collection(db, 'learners'));
  const allByClass = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const d of after.docs) {
    const data = d.data();
    allByClass.set(data.classId, (allByClass.get(data.classId) ?? 0) + 1);
    if (isCountedStatus(data.status)) counts.set(data.classId, (counts.get(data.classId) ?? 0) + 1);
  }
  const yearBefore: Record<string, number | null> = run.classYearBefore ?? {};
  const reactivated: string[] = run.reactivatedClassIds ?? [];
  const createdIds = Object.values(run.createdClassIds);

  const classSnap = await getDocs(collection(db, 'classes'));
  const classWriter = new ChunkedWriter();
  for (const d of classSnap.docs) {
    const id = d.id;
    const update: Record<string, any> = { students: counts.get(id) ?? 0, updatedAt: serverTimestamp() };
    if (run.archivedClassIds.includes(id)) Object.assign(update, { isActive: true, archived: false, archivedAt: null, archivedByRunId: null });
    if (id in yearBefore) update.year = yearBefore[id] ?? run.fromYear;
    if (reactivated.includes(id) && (counts.get(id) ?? 0) === 0) Object.assign(update, { isActive: false, archived: true });

    // Only classes this run actually created (not existing ones it re-used).
    if (createdIds.includes(id) && d.data().createdByRunId === runId) {
      const [slots, assignments] = await Promise.all([
        getDocs(query(collection(db, 'class_slots'), where('classId', '==', id))),
        getDocs(query(collection(db, 'teacher_assignments'), where('classId', '==', id))),
      ]);
      if ((allByClass.get(id) ?? 0) === 0 && slots.empty && assignments.empty) {
        await classWriter.add(b => b.delete(doc(db, 'classes', id)));
        continue;
      }
      warnings.push(`${d.data().name || id} was created by the run but is now in use, so it was kept.`);
    }
    await classWriter.add(b => b.update(doc(db, 'classes', id), clean(update)));
  }
  await classWriter.flush();

  await setDoc(doc(db, 'system', 'academicYear'), { currentYear: run.fromYear, lastRunId: null, updatedAt: serverTimestamp() });
  await updateDoc(doc(db, RUNS, runId), { status: 'reverted', revertedAt: serverTimestamp(), undoWarnings: warnings });
  onProgress({ step: 'done', done: enrollments.length, total: enrollments.length, message: 'Done' });
  return { restored, warnings };
}

// ==================== FORMER LEARNERS ====================

export interface FormerLearner {
  id: string;
  fullName: string;
  gender?: string;
  studentId: string;
  className: string;
  status: string;
  exitYear?: number;
  exitReason?: string;
  guardian?: string;
  guardianPhone?: string;
}

/** Graduates and leavers, newest first. */
export async function loadFormerLearners(): Promise<FormerLearner[]> {
  const snap = await getDocs(query(collection(db, 'learners'), where('status', 'in', ['graduated', 'transferred'])));
  return snap.docs
    .map(d => {
      const x = d.data();
      return {
        id: d.id,
        fullName: x.fullName || x.name || 'Unknown',
        gender: x.gender,
        studentId: x.studentId || '',
        className: x.className || '',
        status: x.status,
        exitYear: typeof x.exitYear === 'number' ? x.exitYear : (typeof x.graduationYear === 'number' ? x.graduationYear : undefined),
        exitReason: x.exitReason,
        guardian: x.guardian,
        guardianPhone: x.guardianPhone || x.parentPhone,
      };
    })
    .sort((a, b) => (b.exitYear ?? 0) - (a.exitYear ?? 0) || a.className.localeCompare(b.className) || a.fullName.localeCompare(b.fullName));
}

export type { PlanItem };
