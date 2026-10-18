// @/services/timetableGenerator/service.ts
//
// Firestore side of the timetable generator: the set-up (curriculum, rooms,
// events), HoD sign-offs, Timetabler roles, generated versions, and
// publishing a version into timetable_entries.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  writeBatch,
  type DocumentData,
} from '@/lib/auditedFirestore';
import { db } from '@/lib/firebase';
import { mapSlot, resolveAuthority, type ClassSlot } from '@/services/assignmentEngine';
import { getDepartmentConfig, departmentOfSubject, type Actor } from '@/services/departmentService';
import type { TermName } from '@/utils/academicTerm';
import { formatYMD } from '@/services/timetableModel';
import type { ClassLike, SlotInput } from './problem';
import {
  EMPTY_CONFIG,
  type AllocationSignoff,
  type ClassException,
  type FixedEvent,
  type LevelCurriculum,
  type PlacedLesson,
  type Room,
  type SubjectRequirement,
  type TimetableConfig,
  type TimetableVersion,
  type VersionSlotInfo,
  type Weekday,
} from './types';

export const CONFIG_DOC = ['timetable_config', 'school'] as const;
export const SIGNOFFS = 'timetable_signoffs';
export const VERSIONS = 'timetable_versions';
export const STAFF_ROLES = 'staff_roles';
export const TIMETABLER_ROLE = 'timetabler';
export const timetablerRoleId = (teacherId: string) => `${teacherId}__${TIMETABLER_ROLE}`;
export const signoffId = (year: number, term: TermName, department: string) =>
  `${year}_${term.replace(/\s+/g, '')}_${department.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const int = (v: unknown, dflt = 0) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : dflt);

// ==================== CONFIG ====================

function normalizeRequirement(r: any): SubjectRequirement | null {
  if (!r || typeof r.normalizedSubject !== 'string' || !r.normalizedSubject) return null;
  const min = int(r.min, 1);
  return {
    normalizedSubject: r.normalizedSubject,
    subject: typeof r.subject === 'string' && r.subject ? r.subject : r.normalizedSubject,
    min,
    max: Math.max(min, int(r.max, min)),
    doubles: int(r.doubles),
    triples: int(r.triples),
    time: r.time === 'morning-only' || r.time === 'prefer-morning' ? r.time : 'any',
    notLast: r.notLast === true,
    roomId: typeof r.roomId === 'string' && r.roomId ? r.roomId : null,
  };
}

export function normalizeConfig(d: DocumentData | null | undefined): TimetableConfig {
  if (!d) return { ...EMPTY_CONFIG, levels: {}, exceptions: [], rooms: [], events: [] };
  const levels: Record<string, LevelCurriculum> = {};
  for (const [key, lv] of Object.entries((d.levels ?? {}) as Record<string, any>)) {
    const subjects = (Array.isArray(lv?.subjects) ? lv.subjects : []).map(normalizeRequirement).filter(Boolean) as SubjectRequirement[];
    levels[key] = { key, label: typeof lv?.label === 'string' ? lv.label : key, subjects };
  }
  const exceptions: ClassException[] = (Array.isArray(d.exceptions) ? d.exceptions : [])
    .filter((e: any) => e && typeof e.classId === 'string' && typeof e.normalizedSubject === 'string')
    .map((e: any) => ({
      classId: e.classId,
      normalizedSubject: e.normalizedSubject,
      ...(e.excluded === true ? { excluded: true } : {}),
      ...(e.min != null ? { min: int(e.min) } : {}),
      ...(e.max != null ? { max: int(e.max) } : {}),
      ...(e.doubles != null ? { doubles: int(e.doubles) } : {}),
      ...(e.triples != null ? { triples: int(e.triples) } : {}),
    }));
  const rooms: Room[] = (Array.isArray(d.rooms) ? d.rooms : [])
    .filter((r: any) => r && typeof r.id === 'string' && typeof r.name === 'string')
    .map((r: any) => ({ id: r.id, name: r.name }));
  const events: FixedEvent[] = (Array.isArray(d.events) ? d.events : [])
    .filter((e: any) => e && typeof e.id === 'string')
    .map((e: any) => ({
      id: e.id,
      name: String(e.name ?? 'Event'),
      days: (Array.isArray(e.days) ? e.days : []).map(Number).filter((x: number) => x >= 1 && x <= 5) as Weekday[],
      periods: (Array.isArray(e.periods) ? e.periods : []).map(Number).filter((x: number) => x >= 1 && x <= 8),
      levels: (Array.isArray(e.levels) ? e.levels : []).filter((x: unknown) => typeof x === 'string'),
    }));
  return {
    levels,
    exceptions,
    rooms,
    events,
    maxTeacherPeriodsPerDay: Math.min(8, Math.max(3, int(d.maxTeacherPeriodsPerDay, 6) || 6)),
    updatedBy: d.updatedBy ?? null,
    updatedByName: d.updatedByName ?? null,
  };
}

export async function getTimetableConfig(): Promise<TimetableConfig> {
  const snap = await getDoc(doc(db, ...CONFIG_DOC));
  return normalizeConfig(snap.exists() ? snap.data() : null);
}

/** Firestore does not accept `undefined`; strip it. */
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export async function saveTimetableConfig(cfg: TimetableConfig, by: Actor): Promise<void> {
  const { updatedBy: _a, updatedByName: _b, ...rest } = cfg;
  await setDoc(doc(db, ...CONFIG_DOC), {
    ...clean(rest),
    updatedBy: by.uid,
    updatedByName: by.name,
    updatedAt: serverTimestamp(),
  });
}

// ==================== INPUTS ====================

export interface GeneratorInputs {
  config: TimetableConfig;
  classes: ClassLike[];
  slots: ClassSlot[];
  slotInputs: SlotInput[];
  departmentOf: (normalizedSubject: string) => string | null;
  /** normalizedSubject → display name, from existing slots. */
  subjectNames: Record<string, string>;
}

/** Owner and live cover/TP: both must be free when the subject is taught. */
export function teachersOfSlot(slot: ClassSlot, at = new Date()): { ids: string[]; names: string[] } {
  const ids: string[] = [];
  const names: string[] = [];
  if (slot.ownerTeacherId) {
    ids.push(slot.ownerTeacherId);
    names.push(slot.ownerTeacherName ?? 'Teacher');
  }
  const auth = resolveAuthority(slot, at);
  if (auth.delegationState === 'live' && auth.operatorTeacherId && !ids.includes(auth.operatorTeacherId)) {
    ids.push(auth.operatorTeacherId);
    names.push(auth.operatorTeacherName ?? 'Teacher');
  }
  return { ids, names };
}

export async function loadGeneratorInputs(): Promise<GeneratorInputs> {
  const [config, classSnap, slotSnap, deptCfg] = await Promise.all([
    getTimetableConfig(),
    getDocs(collection(db, 'classes')),
    getDocs(collection(db, 'class_slots')),
    getDepartmentConfig(),
  ]);
  const classes: ClassLike[] = classSnap.docs.map(d => {
    const x = d.data();
    return { id: d.id, name: x.name || d.id, type: x.type ?? null, level: typeof x.level === 'number' ? x.level : Number(x.level) || null, isActive: x.isActive, archived: x.archived };
  });
  const slots = slotSnap.docs.map(d => mapSlot(d.id, d.data())).filter(s => !s.isFormTeacherSlot);
  const subjectNames: Record<string, string> = {};
  const slotInputs: SlotInput[] = slots.map(s => {
    if (!subjectNames[s.normalizedSubject]) subjectNames[s.normalizedSubject] = s.subject;
    const t = teachersOfSlot(s);
    return { slotId: s.id, classId: s.classId, normalizedSubject: s.normalizedSubject, subject: s.subject, teacherIds: t.ids, teacherNames: t.names };
  });
  return {
    config,
    classes,
    slots,
    slotInputs,
    departmentOf: (n: string) => departmentOfSubject(deptCfg, n),
    subjectNames,
  };
}

// ==================== SIGN-OFFS ====================

const mapSignoff = (id: string, d: DocumentData): AllocationSignoff => ({
  id,
  department: d.department ?? '',
  term: d.term,
  year: d.year,
  byUid: d.byUid ?? '',
  byName: d.byName ?? '',
  byRole: d.byRole === 'admin' ? 'admin' : 'hod',
  at: toDate(d.at),
  vacantCount: int(d.vacantCount),
});

export async function listSignoffs(term: TermName, year: number): Promise<AllocationSignoff[]> {
  const snap = await getDocs(query(collection(db, SIGNOFFS), where('year', '==', year), where('term', '==', term)));
  return snap.docs.map(d => mapSignoff(d.id, d.data()));
}

/** A HoD (their own department) or the admin marks allocations complete. */
export async function signOffAllocations(input: {
  department: string;
  term: TermName;
  year: number;
  by: Actor;
  byRole: 'hod' | 'admin';
  vacantCount: number;
}): Promise<void> {
  await setDoc(doc(db, SIGNOFFS, signoffId(input.year, input.term, input.department)), {
    department: input.department,
    term: input.term,
    year: input.year,
    byUid: input.by.uid,
    byName: input.by.name,
    byRole: input.byRole,
    vacantCount: input.vacantCount,
    at: serverTimestamp(),
  });
}

export async function reopenAllocations(department: string, term: TermName, year: number): Promise<void> {
  await deleteDoc(doc(db, SIGNOFFS, signoffId(year, term, department)));
}

// ==================== TIMETABLERS ====================

export interface TimetablerRole {
  teacherId: string;
  teacherName: string;
  status: 'active' | 'ended';
}

export async function listTimetablers(): Promise<TimetablerRole[]> {
  const snap = await getDocs(query(collection(db, STAFF_ROLES), where('role', '==', TIMETABLER_ROLE)));
  return snap.docs.map(d => {
    const x = d.data();
    return { teacherId: x.teacherId ?? d.id.split('__')[0], teacherName: x.teacherName ?? '', status: x.status === 'active' ? 'active' : 'ended' };
  });
}

export async function isTimetabler(teacherId: string | null | undefined): Promise<boolean> {
  if (!teacherId) return false;
  try {
    const snap = await getDoc(doc(db, STAFF_ROLES, timetablerRoleId(teacherId)));
    return snap.exists() && snap.data()?.status === 'active';
  } catch {
    return false;
  }
}

/** Admin: allow (or stop) a HoD to generate timetables. */
export async function setTimetabler(teacher: { id: string; name: string }, on: boolean, by: Actor): Promise<void> {
  await setDoc(doc(db, STAFF_ROLES, timetablerRoleId(teacher.id)), {
    teacherId: teacher.id,
    teacherName: teacher.name,
    role: TIMETABLER_ROLE,
    status: on ? 'active' : 'ended',
    assignedBy: by.uid,
    assignedByName: by.name,
    updatedAt: serverTimestamp(),
  });
}

// ==================== VERSIONS ====================

const mapVersion = (id: string, d: DocumentData): TimetableVersion => ({
  id,
  name: d.name ?? 'Timetable',
  term: d.term,
  year: d.year,
  status: d.status === 'published' || d.status === 'archived' ? d.status : 'draft',
  lessons: Array.isArray(d.lessons) ? d.lessons : [],
  slots: d.slots ?? {},
  unplaced: Array.isArray(d.unplaced) ? d.unplaced : [],
  notes: Array.isArray(d.notes) ? d.notes : [],
  stats: d.stats ?? null,
  createdBy: d.createdBy ?? '',
  createdByName: d.createdByName ?? '',
  createdAt: toDate(d.createdAt),
  updatedAt: toDate(d.updatedAt),
  publishedBy: d.publishedBy ?? null,
  publishedByName: d.publishedByName ?? null,
  publishedAt: toDate(d.publishedAt),
  effectiveFrom: d.effectiveFrom ?? null,
});

export async function listVersions(term: TermName, year: number): Promise<TimetableVersion[]> {
  const snap = await getDocs(query(collection(db, VERSIONS), where('year', '==', year), where('term', '==', term)));
  return snap.docs
    .map(d => mapVersion(d.id, d.data()))
    .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
}

export async function getVersion(id: string): Promise<TimetableVersion | null> {
  const snap = await getDoc(doc(db, VERSIONS, id));
  return snap.exists() ? mapVersion(snap.id, snap.data()) : null;
}

export interface DraftInput {
  id?: string;
  name: string;
  term: TermName;
  year: number;
  lessons: PlacedLesson[];
  slots: Record<string, VersionSlotInfo>;
  unplaced: TimetableVersion['unplaced'];
  notes: string[];
  stats: TimetableVersion['stats'];
}

/** Saves a draft (new or existing). Returns its id. */
export async function saveDraft(input: DraftInput, by: Actor): Promise<string> {
  const ref = input.id ? doc(db, VERSIONS, input.id) : doc(collection(db, VERSIONS));
  const body = clean({
    name: input.name.trim() || 'Timetable',
    term: input.term,
    year: input.year,
    status: 'draft',
    lessons: input.lessons,
    slots: input.slots,
    unplaced: input.unplaced,
    notes: input.notes.slice(0, 200),
    stats: input.stats,
  });
  if (input.id) {
    await updateDoc(ref, { ...body, updatedAt: serverTimestamp(), updatedBy: by.uid });
  } else {
    await setDoc(ref, { ...body, createdBy: by.uid, createdByName: by.name, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: by.uid });
  }
  return ref.id;
}

export async function deleteDraft(id: string): Promise<void> {
  await deleteDoc(doc(db, VERSIONS, id));
}

// ==================== PUBLISH ====================

const ENTRIES = 'timetable_entries';
const BATCH_LIMIT = 400;

/** Deterministic row id: re-running a publish writes the same rows. */
export const publishedRowId = (versionId: string, slotId: string, day: number, period: number) =>
  `${versionId}_${slotId}_${day}_${period}`.replace(/\//g, '-');

async function commitInChunks(ops: Array<(b: ReturnType<typeof writeBatch>) => void>) {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch);
    await batch.commit();
  }
}

export interface PublishResult {
  rows: number;
  archived: number;
  effectiveFrom: string;
}

/**
 * Admin: make a version THE timetable of its term, from today. In order:
 *   1. the term's live rows are archived (effective until yesterday), and
 *      teachers' unapproved rows are retired;
 *   2. one live row per period of every lesson is written;
 *   3. waiting teacher submissions are superseded, older published versions
 *      archived, and this version marked published.
 * Re-running after an interruption finishes the job (row ids are fixed).
 */
export async function publishVersion(versionId: string, by: Actor, today = formatYMD(new Date())): Promise<PublishResult> {
  const v = await getVersion(versionId);
  if (!v) throw new Error('This timetable no longer exists.');
  if (v.status === 'archived') throw new Error('This timetable was replaced; generate or copy a new one.');
  if (v.unplaced.length) throw new Error('Some lessons have no place yet. Fix them before publishing.');

  const rowsSnap = await getDocs(query(collection(db, ENTRIES), where('term', '==', v.term), where('year', '==', v.year)));
  const newIds = new Set<string>();
  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

  const write: Array<{ id: string; data: DocumentData }> = [];
  for (const l of v.lessons) {
    const info = v.slots[l.slotId];
    if (!info) continue;
    for (let k = 0; k < l.size; k++) {
      const id = publishedRowId(v.id, l.slotId, l.day, l.start + k);
      newIds.add(id);
      write.push({
        id,
        data: {
          slotId: l.slotId,
          classId: info.classId,
          className: info.className,
          subject: info.subject,
          normalizedSubject: info.normalizedSubject,
          term: v.term,
          year: v.year,
          dayOfWeek: l.day,
          periodIndex: l.start + k,
          isDouble: false,
          venue: info.roomName ?? null,
          status: 'active',
          batchId: v.id,
          versionId: v.id,
          effectiveFrom: today,
          effectiveTo: null,
          submittedByUid: by.uid,
          submittedAt: serverTimestamp(),
          approvedByUid: by.uid,
          approvedAt: serverTimestamp(),
          rejectedReason: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    }
  }

  let archived = 0;
  for (const d of rowsSnap.docs) {
    if (newIds.has(d.id)) continue;
    const st = d.data().status;
    if (st === 'active') {
      archived++;
      ops.push(b => b.update(doc(db, ENTRIES, d.id), { status: 'archived', effectiveTo: today, archivedBy: by.uid, archivedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    } else if (st === 'pending' || st === 'draft') {
      ops.push(b => b.update(doc(db, ENTRIES, d.id), { status: 'archived', rejectedReason: 'Replaced by the school timetable', updatedAt: serverTimestamp() }));
    }
  }
  for (const w of write) ops.push(b => b.set(doc(db, ENTRIES, w.id), w.data));

  const [subsSnap, versions] = await Promise.all([
    getDocs(query(collection(db, 'timetable_submissions'), where('term', '==', v.term), where('year', '==', v.year), where('status', '==', 'pending'))),
    listVersions(v.term, v.year),
  ]);
  for (const s of subsSnap.docs) {
    ops.push(b => b.update(doc(db, 'timetable_submissions', s.id), { status: 'superseded', decidedBy: by.uid, decidedAt: serverTimestamp(), rejectedReason: 'Replaced by the school timetable' }));
  }
  for (const other of versions) {
    if (other.id !== v.id && other.status === 'published') {
      ops.push(b => b.update(doc(db, VERSIONS, other.id), { status: 'archived', updatedAt: serverTimestamp() }));
    }
  }
  ops.push(b => b.update(doc(db, VERSIONS, v.id), {
    status: 'published',
    publishedBy: by.uid,
    publishedByName: by.name,
    publishedAt: serverTimestamp(),
    effectiveFrom: today,
    updatedAt: serverTimestamp(),
  }));

  await commitInChunks(ops);
  return { rows: write.length, archived, effectiveFrom: today };
}

/** Admin: withdraw the term's published timetable (from today). */
export async function withdrawTimetable(term: TermName, year: number, by: Actor, today = formatYMD(new Date())): Promise<number> {
  const rowsSnap = await getDocs(query(collection(db, ENTRIES), where('term', '==', term), where('year', '==', year), where('status', '==', 'active')));
  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = rowsSnap.docs.map(d => (b: ReturnType<typeof writeBatch>) =>
    b.update(doc(db, ENTRIES, d.id), { status: 'archived', effectiveTo: today, archivedBy: by.uid, archivedAt: serverTimestamp(), updatedAt: serverTimestamp() }),
  );
  for (const v of await listVersions(term, year)) {
    if (v.status === 'published') ops.push(b => b.update(doc(db, VERSIONS, v.id), { status: 'archived', updatedAt: serverTimestamp() }));
  }
  await commitInChunks(ops);
  return rowsSnap.size;
}

/** Live rows of a term grouped back into lessons (to start a draft from). */
export async function liveLessons(term: TermName, year: number): Promise<{ lessons: PlacedLesson[]; slots: Record<string, VersionSlotInfo> }> {
  const snap = await getDocs(query(collection(db, ENTRIES), where('term', '==', term), where('year', '==', year), where('status', '==', 'active')));
  const rows = snap.docs.map(d => d.data()).filter(r => !r.isDouble);
  const slots: Record<string, VersionSlotInfo> = {};
  const byKey = new Map<string, number[]>();
  for (const r of rows) {
    slots[r.slotId] = { classId: r.classId, className: r.className, subject: r.subject, normalizedSubject: r.normalizedSubject, roomName: r.venue ?? null };
    const k = `${r.slotId}|${r.dayOfWeek}`;
    byKey.set(k, [...(byKey.get(k) ?? []), r.periodIndex]);
  }
  const lessons: PlacedLesson[] = [];
  for (const [k, ps] of byKey) {
    const [slotId, day] = k.split('|');
    const sorted = [...new Set(ps)].sort((a, b) => a - b);
    let start = sorted[0];
    let prev = sorted[0];
    const flush = (end: number) => lessons.push({ slotId, classId: slots[slotId].classId, day: Number(day) as Weekday, start, size: end - start + 1 });
    for (const p of sorted.slice(1)) {
      if (p === prev + 1 && !(prev === 4 && p === 5)) prev = p;
      else {
        flush(prev);
        start = p;
        prev = p;
      }
    }
    flush(prev);
  }
  return { lessons, slots };
}
