// @/services/departmentService.ts
//
// Departments and Heads of Department (HoD).
//
//   users/{teacherId}.departments        the departments a teacher belongs to.
//                                        Set by an admin (Teacher Management)
//                                        or by the teacher (Settings). The
//                                        old single `department` text is kept
//                                        in step (names joined) so every
//                                        existing screen still shows it.
//   SCHOOL_DEPARTMENTS                   the school's seven departments (fixed).
//   system/departments.subjects          each department's subjects, chosen
//                                        by its Head of Department (or an
//                                        admin).
//   staff_roles/{teacherId}__hod         Head of Department, given by an
//                                        admin. Same pattern as the
//                                        admissions officer role: only admins
//                                        can write staff_roles (rules), so a
//                                        teacher cannot make themselves HoD.
//
// One HoD per department, and a teacher heads at most one department.
// Appointing a new HoD ends the previous one's role for that department.

import {
  collection,
  runTransaction,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { delegationState, mapSlot, type ClassSlot } from './assignmentEngine';
import type { BoardLesson, SchoolDayBoard } from './timetableService';

export const STAFF_ROLES = 'staff_roles';
export const HOD_ROLE = 'hod';
export const hodRoleId = (teacherId: string) => `${teacherId}__${HOD_ROLE}`;
const DEPARTMENTS_DOC = ['system', 'departments'] as const;

/** The school's departments. */
export const SCHOOL_DEPARTMENTS = [
  'Languages',
  'Mathematics',
  'Natural Sciences',
  'Practical Subjects',
  'Expressive Arts',
  'Business Studies',
  'Social Sciences',
] as const;
/** @deprecated use SCHOOL_DEPARTMENTS */
export const DEFAULT_DEPARTMENTS = SCHOOL_DEPARTMENTS;

/** Names used before the school's list was fixed, and where they belong now. */
const LEGACY_DEPARTMENTS: Record<string, string> = {
  'design & technology': 'Practical Subjects',
  'design and technology': 'Practical Subjects',
  'home economics': 'Practical Subjects',
  'agricultural science': 'Practical Subjects',
  'practicals': 'Practical Subjects',
  'sciences': 'Natural Sciences',
  'science': 'Natural Sciences',
  'maths': 'Mathematics',
  'language': 'Languages',
};

/** The school's spelling of a department name (older names mapped); other text unchanged. */
export function canonicalDepartment(name: string): string {
  const k = name.trim().toLowerCase();
  return SCHOOL_DEPARTMENTS.find(d => d.toLowerCase() === k) ?? LEGACY_DEPARTMENTS[k] ?? name.trim();
}

export interface HodRole {
  id: string;
  teacherId: string;
  teacherName: string;
  department: string;
  status: 'active' | 'ended';
  startDate?: Date;
  endDate?: Date | null;
  assignedByName?: string;
}

export interface Actor {
  uid: string;
  name: string;
}

// ==================== PURE HELPERS ====================

const key = (s: string) => s.trim().toLowerCase();

/** Trimmed, non-empty, no duplicates (case-insensitive), first spelling kept. */
export function normalizeDepartments(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const name = canonicalDepartment(v.replace(/\s+/g, ' ').trim().slice(0, 60));
    if (!name || seen.has(key(name))) continue;
    seen.add(key(name));
    out.push(name);
  }
  return out;
}

/**
 * A teacher's departments from their users/{id} data. Older records only
 * have the single `department` text (or nothing — shown as "General").
 */
export function teacherDepartments(data: { departments?: unknown; department?: unknown } | null | undefined): string[] {
  if (!data) return [];
  if (Array.isArray(data.departments)) return normalizeDepartments(data.departments);
  const single = typeof data.department === 'string' ? data.department.trim() : '';
  if (!single || key(single) === 'general') return [];
  return normalizeDepartments(single.split(/\s*,\s*/));
}

/** The legacy single-text `department` field, kept in step for older screens. */
export const departmentLabel = (departments: string[]) => departments.join(', ');

/** Is `name` one of `list` (case-insensitive)? */
export const hasDepartment = (list: string[] | undefined, name: string) =>
  !!list?.some(d => key(canonicalDepartment(d)) === key(canonicalDepartment(name)));

/**
 * The school list plus any department a teacher already has that is not on
 * it (older free-text values), so nothing a teacher holds is ever hidden.
 */
export function mergeDepartmentOptions(schoolList: string[], ...held: (string[] | undefined)[]): string[] {
  return normalizeDepartments([...schoolList, ...held.flatMap(h => h ?? [])]);
}

/**
 * What appointing `teacherId` as HoD of `department` changes:
 *  - `replaces`: the department's current HoD (another teacher), whose role ends
 *  - `previous`: the department this teacher headed before, if different
 *  - `unchanged`: already the active HoD of this department
 */
export function planHodAssignment(roles: HodRole[], teacherId: string, department: string) {
  const active = roles.filter(r => r.status === 'active');
  const mine = active.find(r => r.teacherId === teacherId) ?? null;
  const holder = active.find(r => key(r.department) === key(department)) ?? null;
  return {
    unchanged: !!mine && key(mine.department) === key(department),
    replaces: holder && holder.teacherId !== teacherId ? holder : null,
    previous: mine && key(mine.department) !== key(department) ? mine.department : null,
  };
}

/** Teachers who belong to a department (case-insensitive). */
export function membersOf<T extends { departments?: string[] }>(teachers: T[], department: string): T[] {
  return teachers.filter(t => hasDepartment(t.departments, department));
}

// ==================== DEPARTMENT LIST ====================

/** The school's departments (fixed list). */
export async function getDepartmentList(): Promise<string[]> {
  return [...SCHOOL_DEPARTMENTS];
}

// ==================== DEPARTMENT SUBJECTS ====================
//
// system/departments.subjects: { [department]: normalised subject names }.
// Chosen by the department's HoD (My Department → Allocations), or by an
// admin. A subject belongs to at most one department. HoDs may allocate
// teachers only to their department's subjects (also enforced by the
// Firestore rules, which read this same map).

export interface DepartmentConfig {
  names: string[];
  /** department → normalised subject names (as in class_slots.normalizedSubject) */
  subjects: Record<string, string[]>;
}

export function normalizeDepartmentConfig(d: any): DepartmentConfig {
  const names = normalizeDepartments(d?.names);
  const subjects: Record<string, string[]> = {};
  const raw = d?.subjects && typeof d.subjects === 'object' ? d.subjects : {};
  for (const [dept, list] of Object.entries(raw)) {
    const clean = Array.isArray(list) ? Array.from(new Set((list as unknown[]).filter((x): x is string => typeof x === 'string' && !!x.trim()))) : [];
    if (clean.length) subjects[dept] = clean;
  }
  void names;
  return { names: [...SCHOOL_DEPARTMENTS], subjects };
}

export async function getDepartmentConfig(): Promise<DepartmentConfig> {
  try {
    const snap = await getDoc(doc(db, ...DEPARTMENTS_DOC));
    return normalizeDepartmentConfig(snap.exists() ? snap.data() : null);
  } catch {
    return normalizeDepartmentConfig(null);
  }
}

/** The department a (normalised) subject belongs to, if any. */
export function departmentOfSubject(cfg: DepartmentConfig, normalizedSubject: string): string | null {
  for (const [dept, list] of Object.entries(cfg.subjects)) if (list.includes(normalizedSubject)) return dept;
  return null;
}

/** Subjects of a department (exact department name as stored). */
export function subjectsOfDepartment(cfg: DepartmentConfig, department: string): string[] {
  const k = Object.keys(cfg.subjects).find(d => key(d) === key(department));
  return k ? cfg.subjects[k] : [];
}

/** Pure: give `department` exactly `subjects`, taking them away from any other department. */
export function withDepartmentSubjects(cfg: DepartmentConfig, department: string, subjects: string[]): Record<string, string[]> {
  const want = Array.from(new Set(subjects.filter(Boolean)));
  const out: Record<string, string[]> = {};
  for (const [dept, list] of Object.entries(cfg.subjects)) {
    if (key(dept) === key(department)) continue;
    const rest = list.filter(x => !want.includes(x));
    if (rest.length) out[dept] = rest;
  }
  if (want.length) out[department] = want;
  return out;
}

/** Admin: set the subjects that belong to a department. */
export async function setDepartmentSubjects(department: string, subjects: string[], by: Actor): Promise<void> {
  const ref = doc(db, ...DEPARTMENTS_DOC);
  const snap = await getDoc(ref);
  const cfg = normalizeDepartmentConfig(snap.exists() ? snap.data() : null);
  await setDoc(ref, {
    subjects: withDepartmentSubjects(cfg, department, subjects),
    updatedBy: by.uid, updatedByName: by.name, updatedAt: serverTimestamp(),
  }, { merge: false });
}

/**
 * HoD: choose their own department's subjects. Only this department's entry
 * changes (the Firestore rules allow a HoD nothing else), so a subject that
 * already belongs to another department is refused, not taken.
 */
export async function setOwnDepartmentSubjects(department: string, subjects: string[], by: Actor): Promise<string[]> {
  const ref = doc(db, ...DEPARTMENTS_DOC);
  const want = Array.from(new Set(subjects.map(s => s.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const raw = snap.exists() ? snap.data() : null;
    const cfg = normalizeDepartmentConfig(raw);
    const taken = want
      .map(s => ({ s, d: departmentOfSubject(cfg, s) }))
      .filter((x): x is { s: string; d: string } => !!x.d && key(x.d) !== key(department));
    if (taken.length) {
      throw new Error(taken.map(x => `${x.s} belongs to ${x.d}`).join('; ') + '. Ask that Head of Department or an administrator to release it first.');
    }
    // Keep the stored key's spelling for this department (the rules compare it exactly).
    const stored = Object.keys(raw?.subjects ?? {}).find(d => key(d) === key(department)) ?? department;
    tx.set(ref, {
      subjects: { [stored]: want },
      updatedBy: by.uid, updatedByName: by.name, updatedAt: serverTimestamp(),
    }, { merge: true });
    return want;
  });
}

// ==================== TEACHER MEMBERSHIP ====================

/**
 * Set the departments a teacher belongs to. Admins may do this for anyone;
 * a teacher may do it for themselves (users/{uid} self-update is allowed
 * for these fields by the Firestore rules).
 */
export async function setTeacherDepartments(teacherId: string, departments: string[]): Promise<string[]> {
  const list = normalizeDepartments(departments);
  await updateDoc(doc(db, 'users', teacherId), {
    departments: list,
    department: departmentLabel(list),
    updatedAt: serverTimestamp(),
  });
  return list;
}

/**
 * Add a teacher to one department, or take them out of it, changing nothing
 * else. This is what a HoD does (the Firestore rules let a HoD change a
 * teacher's departments only by their own department). Admins use it too.
 */
export async function setMembership(teacherId: string, department: string, member: boolean): Promise<string[]> {
  const [dept] = normalizeDepartments([department]);
  if (!dept) throw new Error('Choose a department.');
  const ref = doc(db, 'users', teacherId);
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Teacher not found.');
    const data = snap.data();
    // Work on the stored names as they are: only this department is added or
    // removed (the rules compare the stored list exactly).
    const stored: string[] = Array.isArray(data.departments)
      ? data.departments.filter((d: unknown): d is string => typeof d === 'string')
      : teacherDepartments(data);
    const current = teacherDepartments(data);
    if (member === hasDepartment(current, dept)) return current;
    const next = member
      ? [...stored, department.trim()]
      : stored.filter(d => !hasDepartment([d], dept));
    tx.update(ref, { departments: next, department: departmentLabel(normalizeDepartments(next)), updatedAt: serverTimestamp() });
    return normalizeDepartments(next);
  });
}

// ==================== HEADS OF DEPARTMENT ====================

const toDate = (v: any): Date | undefined =>
  !v ? undefined : v instanceof Date ? v : typeof v.toDate === 'function' ? v.toDate() : typeof v === 'string' ? new Date(v) : v.seconds ? new Date(v.seconds * 1000) : undefined;

const mapHod = (id: string, d: DocumentData): HodRole => ({
  id,
  teacherId: d.teacherId,
  teacherName: d.teacherName || '',
  department: d.department || '',
  status: d.status === 'active' ? 'active' : 'ended',
  startDate: toDate(d.startDate),
  endDate: toDate(d.endDate) ?? null,
  assignedByName: d.assignedByName,
});

export async function listHods(): Promise<HodRole[]> {
  const snap = await getDocs(query(collection(db, STAFF_ROLES), where('role', '==', HOD_ROLE)));
  return snap.docs.map(d => mapHod(d.id, d.data()));
}

/** The department this teacher heads now, or null. */
export async function getHodRole(teacherId: string | undefined | null): Promise<HodRole | null> {
  if (!teacherId) return null;
  try {
    const snap = await getDoc(doc(db, STAFF_ROLES, hodRoleId(teacherId)));
    if (!snap.exists()) return null;
    const r = mapHod(snap.id, snap.data());
    return r.status === 'active' && r.department ? r : null;
  } catch {
    return null;
  }
}

const historyOf = (snapData: DocumentData | undefined) => (Array.isArray(snapData?.history) ? snapData!.history : []);

/**
 * Admin: appoint a teacher Head of `department`. In one batch:
 *   - the department's current HoD (if another teacher) steps down,
 *   - the teacher's role document is set (any previous department ends),
 *   - the teacher is added to the department if not already a member.
 */
export async function assignHod(
  teacher: { id: string; name: string; departments?: string[] },
  department: string,
  by: Actor,
): Promise<{ replaced: HodRole | null }> {
  const [dept] = normalizeDepartments([department]);
  if (!dept) throw new Error('Choose a department.');
  const roles = await listHods();
  const plan = planHodAssignment(roles, teacher.id, dept);
  if (plan.unchanged) return { replaced: null };

  const now = new Date();
  const batch = writeBatch(db);

  if (plan.replaces) {
    const prevRef = doc(db, STAFF_ROLES, hodRoleId(plan.replaces.teacherId));
    const prevSnap = await getDoc(prevRef);
    batch.update(prevRef, {
      status: 'ended',
      endDate: now,
      history: [...historyOf(prevSnap.data()), { action: 'ended', department: plan.replaces.department, at: now.toISOString(), byName: by.name, reason: `replaced by ${teacher.name}` }],
      updatedAt: serverTimestamp(),
    });
  }

  const ref = doc(db, STAFF_ROLES, hodRoleId(teacher.id));
  const snap = await getDoc(ref);
  const history = historyOf(snap.data());
  if (plan.previous) history.push({ action: 'ended', department: plan.previous, at: now.toISOString(), byName: by.name });
  batch.set(ref, {
    teacherId: teacher.id,
    teacherName: teacher.name,
    role: HOD_ROLE,
    department: dept,
    status: 'active',
    startDate: now,
    endDate: null,
    assignedBy: by.uid,
    assignedByName: by.name,
    history: [...history, { action: 'assigned', department: dept, at: now.toISOString(), byName: by.name }],
    updatedAt: serverTimestamp(),
  });

  if (!hasDepartment(teacher.departments, dept)) {
    const list = normalizeDepartments([...(teacher.departments ?? []), dept]);
    batch.update(doc(db, 'users', teacher.id), { departments: list, department: departmentLabel(list), updatedAt: serverTimestamp() });
  }

  await batch.commit();
  return { replaced: plan.replaces };
}

/** Admin: end a teacher's HoD role. */
export async function endHod(teacherId: string, by: Actor): Promise<void> {
  const ref = doc(db, STAFF_ROLES, hodRoleId(teacherId));
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data()?.status !== 'active') return;
  const now = new Date();
  await updateDoc(ref, {
    status: 'ended',
    endDate: now,
    history: [...historyOf(snap.data()), { action: 'ended', department: snap.data()?.department, at: now.toISOString(), byName: by.name }],
    updatedAt: serverTimestamp(),
  });
}

// ==================== HoD: CLASS ALLOCATIONS ====================
//
// Allocations are the assignment engine's class_slots — the SAME records the
// admin edits in Teacher Management and that Results Entry, the Results
// Entry Monitor, attendance and the timetable read. A HoD only gets a view
// limited to their department's subjects; changes go through the same
// teacherService.assignTeacherToClass / removeTeacherSubject calls.

/** Every slot (class + subject) of these subjects. */
export async function listSlotsForSubjects(subjects: string[]): Promise<ClassSlot[]> {
  const list = Array.from(new Set(subjects.filter(Boolean)));
  const out: ClassSlot[] = [];
  for (let i = 0; i < list.length; i += 10) {
    const snap = await getDocs(query(collection(db, 'class_slots'), where('normalizedSubject', 'in', list.slice(i, i + 10))));
    for (const d of snap.docs) out.push(mapSlot(d.id, d.data()));
  }
  return out;
}

export interface AllocationRow {
  classId: string;
  className: string;
  slot: ClassSlot | null;
  ownerTeacherId: string | null;
  ownerTeacherName: string | null;
  /** A live cover / TP (set by the admin), shown for information. */
  coverTeacherName: string | null;
  coverRole: 'leave-cover' | 'tp' | null;
}

/** One subject across classes: who owns it in each class right now. */
export function allocationRows(
  classes: Array<{ id: string; name: string }>,
  slots: ClassSlot[],
  normalizedSubject: string,
  now = new Date(),
): AllocationRow[] {
  const bySlot = new Map(slots.filter(s => s.normalizedSubject === normalizedSubject).map(s => [s.classId, s]));
  return [...classes]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map(c => {
      const slot = bySlot.get(c.id) ?? null;
      const live = !!slot && delegationState(slot, now) === 'live';
      return {
        classId: c.id,
        className: c.name,
        slot,
        ownerTeacherId: slot?.ownerTeacherId ?? null,
        ownerTeacherName: slot?.ownerTeacherName ?? null,
        coverTeacherName: live ? slot!.delegateTeacherName : null,
        coverRole: live ? slot!.delegateRole : null,
      };
    });
}

/** How many classes each teacher owns among these slots. */
export function teachingLoad(slots: ClassSlot[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of slots) if (s.ownerTeacherId) m.set(s.ownerTeacherId, (m.get(s.ownerTeacherId) ?? 0) + 1);
  return m;
}

// ==================== HoD: ROLL CALL ====================
//
// Built on getSchoolDayBoard — the same lesson-by-lesson view as the admin's
// "Who's Teaching" — so a HoD and the admin always see the same picture.

export interface RollCallRow {
  teacherId: string;
  teacherName: string;
  onLeave: boolean;
  /** Lessons this teacher teaches that day (as owner or live cover) that have started. */
  due: number;
  taken: number;
  missed: BoardLesson[];
  /** Started, not yet marked, still running. */
  running: BoardLesson[];
  /** Later in the day. */
  later: number;
  /** Their form class's daily register; null when not a form teacher. */
  daily: { className: string; taken: boolean } | null;
}

export function departmentRollCall(
  board: Pick<SchoolDayBoard, 'classes'> | null | undefined,
  members: Array<{ id: string; name: string; status?: string; assignedClassId?: string | null }>,
): RollCallRow[] {
  const lessons = (board?.classes ?? []).flatMap(c => c.lessons);
  return members.map(m => {
    const mine = lessons.filter(l =>
      l.row.operatorTeacherId === m.id || (l.status === 'uncovered' && l.row.ownerTeacherId === m.id));
    const started = mine.filter(l => l.status !== 'upcoming');
    const form = m.assignedClassId ? (board?.classes ?? []).find(c => c.classId === m.assignedClassId) : undefined;
    return {
      teacherId: m.id,
      teacherName: m.name,
      onLeave: m.status === 'on_leave',
      due: started.length,
      taken: started.filter(l => l.status === 'taken').length,
      missed: started.filter(l => l.status === 'missed' || l.status === 'uncovered'),
      running: started.filter(l => l.status === 'in-progress'),
      later: mine.length - started.length,
      daily: form ? { className: form.className, taken: form.dailyTaken } : null,
    };
  }).sort((a, b) => b.missed.length - a.missed.length || a.teacherName.localeCompare(b.teacherName));
}
