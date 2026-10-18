// @/services/admissionsService.ts
//
// Admissions on Firestore.
//
//   staff_roles/{teacherId}__admissions-officer   who may admit (admin sets)
//   admission_settings/{year}                     the intake: open/closed,
//                                                 levels, places per class,
//                                                 and `seq` (admissions so far)
//   admissions/{year}-{seq}                       one record per admission
//                                                 (the slip)
//   learners/{id}                                 the new learner
//
// Placing a learner (admitLearner)
// ────────────────────────────────
// 1. Read the intake's `seq`, then count the learners in every intake class.
// 2. Choose the least-full class (admissionsPlan.chooseClass).
// 3. In ONE transaction: check `seq` has not moved (nobody admitted in the
//    meantime — otherwise start again with fresh counts), take the class's
//    next student number, and write the learner, the class, the admission
//    record and seq + 1 together.
// Two officers admitting at the same moment therefore never overfill a
// class or get the same student id: the second one is re-placed with the
// first one counted.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from '@/lib/auditedFirestore';
import { db } from '@/lib/firebase';
import {
  ADMISSIONS_OFFICER_ROLE,
  type AdmissionInput,
  type AdmissionRecord,
  type IntakeClass,
  type IntakeSettings,
  type StaffRole,
} from '@/types/admissions';
import {
  admissionNumberFor,
  capacityOf,
  chooseClass,
  defaultIntakeSettings,
  isFull,
  levelLabel,
  validateAdmission,
  type ExistingLearnerLite,
} from './admissionsPlan';
import { getSchoolYear } from './promotionService';

export const STAFF_ROLES = 'staff_roles';
export const ADMISSION_SETTINGS = 'admission_settings';
export const ADMISSIONS = 'admissions';

const MAX_ATTEMPTS = 6;
const CONFLICT = 'ADMISSION_CONFLICT';

const toDate = (v: any): Date | undefined =>
  !v ? undefined : v instanceof Date ? v : typeof v.toDate === 'function' ? v.toDate() : typeof v === 'string' ? new Date(v) : v.seconds ? new Date(v.seconds * 1000) : undefined;

/** Firestore refuses undefined values. */
const clean = <T extends Record<string, any>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

const pad3 = (n: number) => String(n).padStart(3, '0');
const prefixFor = (type: string, level: number, section: string) =>
  `${type === 'grade' ? 'G' : 'F'}${level}${section}`.toUpperCase();

const isCounted = (status: any) => status === undefined || status === null || status === '' || status === 'active';

function birthYearAndAge(dob: string, today = new Date()) {
  const [y, m, d] = dob.split('-').map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return { birthYear: y, age: Math.max(0, age) };
}

// ==================== ROLES ====================

export const roleDocId = (teacherId: string) => `${teacherId}__${ADMISSIONS_OFFICER_ROLE}`;

const mapRole = (id: string, d: DocumentData): StaffRole => ({
  id,
  teacherId: d.teacherId,
  teacherName: d.teacherName || '',
  teacherEmail: d.teacherEmail,
  role: ADMISSIONS_OFFICER_ROLE,
  status: d.status === 'active' ? 'active' : 'ended',
  startDate: toDate(d.startDate),
  endDate: toDate(d.endDate) ?? null,
  assignedBy: d.assignedBy,
  assignedByName: d.assignedByName,
});

export async function listAdmissionsOfficers(): Promise<StaffRole[]> {
  const snap = await getDocs(query(collection(db, STAFF_ROLES), where('role', '==', ADMISSIONS_OFFICER_ROLE)));
  return snap.docs
    .map(d => mapRole(d.id, d.data()))
    .sort((a, b) => (a.status === b.status ? a.teacherName.localeCompare(b.teacherName) : a.status === 'active' ? -1 : 1));
}

export async function isAdmissionsOfficer(teacherId: string | undefined | null): Promise<boolean> {
  if (!teacherId) return false;
  try {
    const snap = await getDoc(doc(db, STAFF_ROLES, roleDocId(teacherId)));
    return snap.exists() && snap.data()?.status === 'active';
  } catch {
    return false;
  }
}

export interface Actor {
  uid: string;
  name: string;
}

export async function assignAdmissionsOfficer(
  teacher: { id: string; name: string; email?: string },
  by: Actor
): Promise<void> {
  const ref = doc(db, STAFF_ROLES, roleDocId(teacher.id));
  const snap = await getDoc(ref);
  const history = (snap.exists() ? snap.data()?.history : null) ?? [];
  await setDoc(ref, clean({
    teacherId: teacher.id,
    teacherName: teacher.name,
    teacherEmail: teacher.email ?? null,
    role: ADMISSIONS_OFFICER_ROLE,
    status: 'active',
    startDate: new Date(),
    endDate: null,
    assignedBy: by.uid,
    assignedByName: by.name,
    history: [...history, { action: 'assigned', at: new Date().toISOString(), byName: by.name }],
    updatedAt: serverTimestamp(),
  }));
}

export async function endAdmissionsOfficer(teacherId: string, by: Actor): Promise<void> {
  const ref = doc(db, STAFF_ROLES, roleDocId(teacherId));
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const history = snap.data()?.history ?? [];
  await updateDoc(ref, {
    status: 'ended',
    endDate: new Date(),
    history: [...history, { action: 'ended', at: new Date().toISOString(), byName: by.name }],
    updatedAt: serverTimestamp(),
  });
}

// ==================== INTAKE SETTINGS ====================

const settingsRef = (year: number) => doc(db, ADMISSION_SETTINGS, String(year));

export async function getIntakeSettings(year: number): Promise<IntakeSettings & { exists: boolean }> {
  const snap = await getDoc(settingsRef(year));
  const base = defaultIntakeSettings(year);
  if (!snap.exists()) return { ...base, exists: false };
  const d = snap.data();
  return {
    year,
    isOpen: d.isOpen === true,
    levels: Array.isArray(d.levels) && d.levels.length ? d.levels : base.levels,
    defaultCapacity: Number(d.defaultCapacity) > 0 ? Number(d.defaultCapacity) : base.defaultCapacity,
    capacities: d.capacities || {},
    excludedClassIds: d.excludedClassIds || [],
    seq: Number(d.seq) || 0,
    updatedAt: d.updatedAt,
    updatedByName: d.updatedByName,
    exists: true,
  };
}

/** Admin: save the intake settings (never touches `seq`). */
export async function saveIntakeSettings(
  s: Pick<IntakeSettings, 'year' | 'isOpen' | 'levels' | 'defaultCapacity' | 'capacities' | 'excludedClassIds'>,
  by: Actor
): Promise<void> {
  if (!(s.defaultCapacity > 0)) throw new Error('Places per class must be more than 0.');
  if (!s.levels.length) throw new Error('Choose at least one level to admit into.');
  const ref = settingsRef(s.year);
  const existing = await getDoc(ref);
  await setDoc(ref, {
    year: s.year,
    isOpen: s.isOpen,
    levels: s.levels.map(l => ({ type: l.type, level: l.level })),
    defaultCapacity: s.defaultCapacity,
    capacities: s.capacities,
    excludedClassIds: s.excludedClassIds,
    seq: existing.exists() ? Number(existing.data()?.seq) || 0 : 0,
    updatedAt: serverTimestamp(),
    updatedBy: by.uid,
    updatedByName: by.name,
  });
}

/**
 * The intake to work on: next year's when it is open (admitting before the
 * year transition), else the school year's.
 */
export async function defaultIntakeYear(): Promise<number> {
  const sy = await getSchoolYear();
  const next = await getIntakeSettings(sy + 1).catch(() => null);
  if (next?.exists && next.isOpen) return sy + 1;
  return sy;
}

// ==================== INTAKE CLASSES ====================

/**
 * Every active class of the intake's levels with its numbers for the intake
 * year. A learner counts for the year when their `academicYear` is that
 * year (learners from before the field existed count for the school year),
 * so admitting next year's intake before the year transition is not
 * blocked by this year's learners still sitting in those classes.
 */
export async function loadIntakeClasses(settings: IntakeSettings, schoolYear?: number): Promise<IntakeClass[]> {
  const sy = schoolYear ?? (await getSchoolYear());
  const classSnap = await getDocs(collection(db, 'classes'));
  const wanted = classSnap.docs.filter(d => {
    const c = d.data();
    if (c.isActive === false || c.archived === true) return false;
    return settings.levels.some(l => l.type === c.type && l.level === Number(c.level));
  });

  const out: IntakeClass[] = [];
  for (const d of wanted) {
    const c = d.data();
    const learners = await getDocs(query(collection(db, 'learners'), where('classId', '==', d.id)));
    let total = 0, male = 0, female = 0, admittedHere = 0, maxIndex = 0;
    const prefix = prefixFor(c.type, Number(c.level), c.section || 'A');
    for (const l of learners.docs) {
      const x = l.data();
      if (typeof x.studentIndex === 'number') maxIndex = Math.max(maxIndex, x.studentIndex);
      const m = new RegExp(`^${prefix}_(\\d+)`).exec(x.studentId || '');
      if (m) maxIndex = Math.max(maxIndex, Number(m[1]));
      const year = typeof x.academicYear === 'number' ? x.academicYear : sy;
      if (!isCounted(x.status) || year !== settings.year) continue;
      total++;
      if (x.gender === 'male') male++;
      else if (x.gender === 'female') female++;
      if (x.admissionYear === settings.year && x.admissionNumber) admittedHere++;
    }
    out.push({
      id: d.id,
      name: c.name || d.id,
      type: c.type,
      level: Number(c.level),
      section: (c.section || 'A').toUpperCase(),
      capacity: capacityOf(settings, d.id),
      excluded: settings.excludedClassIds.includes(d.id),
      total,
      male,
      female,
      admittedHere,
      maxIndex: Math.max(maxIndex, Number(c.nextStudentIndex || 1) - 1),
      formTeacherName: c.formTeacherName || undefined,
    });
  }
  return out.sort((a, b) => a.type.localeCompare(b.type) || a.level - b.level || a.name.localeCompare(b.name));
}

// ==================== DUPLICATES ====================

/** Learners already on the system who might be this learner. */
export async function findExistingLearners(input: Pick<AdmissionInput, 'fullName' | 'guardianPhone'>): Promise<ExistingLearnerLite[]> {
  const name = input.fullName.trim();
  const queries = [
    getDocs(query(collection(db, 'learners'), where('fullName', '==', name))),
  ];
  if (input.guardianPhone?.trim()) {
    queries.push(getDocs(query(collection(db, 'learners'), where('guardianPhone', '==', input.guardianPhone.trim()))));
  }
  const snaps = await Promise.all(queries);
  const seen = new Map<string, ExistingLearnerLite>();
  for (const s of snaps) for (const d of s.docs) {
    const x = d.data();
    seen.set(d.id, {
      id: d.id,
      fullName: x.fullName || x.name || '',
      dateOfBirth: x.dateOfBirth,
      guardianPhone: x.guardianPhone || x.parentPhone,
      className: x.className,
      studentId: x.studentId,
      status: x.status,
    });
  }
  return [...seen.values()];
}

// ==================== ADMIT ====================

export interface AdmitResult {
  record: AdmissionRecord;
  learnerId: string;
  placementReason: string;
}

/**
 * Enrol one learner: place them, generate their student id, and write the
 * learner, class, admission record and intake counter in one transaction.
 */
export async function admitLearner(
  input: AdmissionInput,
  year: number,
  by: Actor,
  opts: { isAdmin?: boolean } = {}
): Promise<AdmitResult> {
  const errors = validateAdmission(input);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  if (input.classIdOverride && !opts.isAdmin) throw new Error('Only the admin can choose the class.');

  const schoolYear = await getSchoolYear();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const settings = await getIntakeSettings(year);
    if (!settings.exists) throw new Error(`Admissions for ${year} have not been set up. Ask the admin.`);
    if (!settings.isOpen && !opts.isAdmin) throw new Error(`Admissions for ${year} are closed.`);
    if (!settings.levels.some(l => l.type === input.level.type && l.level === input.level.level)) {
      throw new Error(`${levelLabel(input.level)} is not open for admission.`);
    }

    const classes = await loadIntakeClasses(settings, schoolYear);
    let target: IntakeClass | undefined;
    let reason: string;
    if (input.classIdOverride) {
      target = classes.find(c => c.id === input.classIdOverride);
      if (!target) throw new Error('That class is not part of this intake.');
      if (isFull(target)) throw new Error(`${target.name} is full (${target.total} of ${target.capacity}). Raise its places first.`);
      reason = `Placed in ${target.name} by the admin.`;
    } else {
      const choice = chooseClass(classes, input.level, input.gender);
      if (!choice) {
        throw new Error(`All ${levelLabel(input.level)} classes are full. Ask the admin to add places or a class.`);
      }
      target = classes.find(c => c.id === choice.classId)!;
      reason = choice.reason;
    }

    const seq0 = settings.seq;
    try {
      const result = await runTransaction(db, async tx => {
        const sRef = settingsRef(year);
        const cRef = doc(db, 'classes', target!.id);
        const sSnap = await tx.get(sRef);
        const cSnap = await tx.get(cRef);
        if (!sSnap.exists()) throw new Error(`Admissions for ${year} have not been set up.`);
        if ((Number(sSnap.data()?.seq) || 0) !== seq0) throw new Error(CONFLICT);
        if (!cSnap.exists()) throw new Error('Class not found.');

        const c = cSnap.data();
        const index = Math.max(Number(c.nextStudentIndex) || 1, target!.maxIndex + 1);
        const prefix = prefixFor(c.type, Number(c.level), c.section || 'A');
        const studentId = `${prefix}_${pad3(index)}`;
        const seq = seq0 + 1;
        const admissionNumber = admissionNumberFor(year, seq);
        const admissionId = `${year}-${String(seq).padStart(4, '0')}`;
        const learnerRef = doc(collection(db, 'learners'));
        const { birthYear, age } = birthYearAndAge(input.dateOfBirth);
        const fullName = input.fullName.trim().replace(/\s+/g, ' ');

        tx.set(learnerRef, clean({
          studentId,
          studentIndex: index,
          classPrefix: prefix,
          fullName,
          name: fullName,
          preferredName: input.preferredName?.trim() || null,
          dateOfBirth: input.dateOfBirth,
          birthYear,
          age,
          gender: input.gender,
          address: input.address.trim(),
          guardian: input.guardian.trim(),
          guardianPhone: input.guardianPhone.trim(),
          parentPhone: input.guardianPhone.trim(),
          guardianRelationship: input.guardianRelationship?.trim() || null,
          alternativeGuardian: input.alternativeGuardian?.trim() || null,
          alternativeGuardianPhone: input.alternativeGuardianPhone?.trim() || null,
          sponsor: input.sponsor.trim(),
          classId: target!.id,
          className: c.name,
          classType: c.type,
          classLevel: Number(c.level),
          classSection: c.section || 'A',
          dateOfFirstEntry: input.dateOfFirstEntry,
          enrollmentDate: serverTimestamp(),
          previousSchool: input.previousSchool?.trim() || null,
          previousGrade: input.previousGrade?.trim() || null,
          examNumber: input.examNumber?.trim() || null,
          medicalNotes: input.medicalNotes?.trim() || null,
          allergies: input.allergies ?? [],
          status: 'active',
          academicYear: year,
          admissionYear: year,
          admissionType: input.admissionType,
          admissionNumber,
          admissionId,
          admittedBy: by.uid,
          admittedByName: by.name,
          createdBy: by.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }));

        tx.update(cRef, {
          students: (Number(c.students) || 0) + 1,
          nextStudentIndex: index + 1,
          updatedAt: serverTimestamp(),
        });

        const record: AdmissionRecord = {
          id: admissionId,
          admissionNumber,
          year,
          seq,
          learnerId: learnerRef.id,
          studentId,
          fullName,
          gender: input.gender,
          dateOfBirth: input.dateOfBirth,
          classId: target!.id,
          className: c.name,
          classType: c.type,
          classLevel: Number(c.level),
          formTeacherName: c.formTeacherName || null,
          guardian: input.guardian.trim(),
          guardianPhone: input.guardianPhone.trim(),
          sponsor: input.sponsor.trim(),
          admissionType: input.admissionType,
          dateOfFirstEntry: input.dateOfFirstEntry,
          previousSchool: input.previousSchool?.trim() || null,
          examNumber: input.examNumber?.trim() || null,
          placement: input.classIdOverride ? 'manual' : 'auto',
          admittedBy: by.uid,
          admittedByName: by.name,
          status: 'admitted',
        };
        tx.set(doc(db, ADMISSIONS, admissionId), clean({ ...record, admittedAt: serverTimestamp() }));
        tx.update(sRef, { seq, lastAdmissionAt: serverTimestamp() });
        return { record: { ...record, admittedAt: new Date() }, learnerId: learnerRef.id };
      });
      return { ...result, placementReason: reason };
    } catch (e: any) {
      if (e?.message === CONFLICT) continue; // someone admitted meanwhile: count again
      throw e;
    }
  }
  throw new Error('Many admissions are being saved at once. Please press Save again.');
}

// ==================== LIST / CANCEL ====================

const mapRecord = (id: string, d: DocumentData): AdmissionRecord => ({
  ...(d as AdmissionRecord),
  id,
  admittedAt: toDate(d.admittedAt),
  cancelledAt: toDate(d.cancelledAt),
});

export async function listAdmissions(year: number): Promise<AdmissionRecord[]> {
  const snap = await getDocs(query(collection(db, ADMISSIONS), where('year', '==', year)));
  return snap.docs.map(d => mapRecord(d.id, d.data())).sort((a, b) => b.seq - a.seq);
}

export async function getAdmission(id: string): Promise<AdmissionRecord | null> {
  const snap = await getDoc(doc(db, ADMISSIONS, id));
  return snap.exists() ? mapRecord(snap.id, snap.data()) : null;
}

/**
 * Admin: undo an admission made in error. The learner is archived (kept for
 * the record, not deleted) and the place is freed. The admission number is
 * not re-used.
 */
export async function cancelAdmission(id: string, reason: string, by: Actor): Promise<void> {
  const rec = await getAdmission(id);
  if (!rec) throw new Error('Admission not found.');
  if (rec.status === 'cancelled') return;
  await runTransaction(db, async tx => {
    const lRef = doc(db, 'learners', rec.learnerId);
    const cRef = doc(db, 'classes', rec.classId);
    const l = await tx.get(lRef);
    const c = await tx.get(cRef);
    const wasActive = l.exists() && isCounted(l.data()?.status) && l.data()?.classId === rec.classId;
    tx.update(doc(db, ADMISSIONS, id), {
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
      cancelledBy: by.uid,
      cancelledByName: by.name,
      cancelReason: reason || null,
    });
    if (l.exists()) {
      tx.update(lRef, {
        status: 'archived',
        archivedAt: serverTimestamp(),
        exitReason: `Admission cancelled${reason ? `: ${reason}` : ''}`,
        updatedAt: serverTimestamp(),
      });
    }
    if (c.exists() && wasActive) {
      tx.update(cRef, { students: Math.max(0, (Number(c.data()?.students) || 0) - 1), updatedAt: serverTimestamp() });
    }
  });
}

/** Admin: set every intake class's `students` to its real active count. */
export async function recountClasses(classIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  for (const id of classIds) {
    const snap = await getDocs(query(collection(db, 'learners'), where('classId', '==', id)));
    batch.update(doc(db, 'classes', id), { students: snap.docs.filter(d => isCounted(d.data().status)).length });
  }
  await batch.commit();
}
