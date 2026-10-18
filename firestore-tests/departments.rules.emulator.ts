// Firestore rules for departments and Heads of Department (run with `pnpm test:rules`).
//  - teachers cannot put themselves in (or take themselves out of) a department
//  - a HoD changes membership of their own department only
//  - a HoD allocates department teachers to department subjects, through the
//    same engine documents the admin uses — and nothing else
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it, vi, expect } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, addDoc, collection } from 'firebase/firestore';

const h = vi.hoisted(() => ({ db: null as any, uid: 'HOD' }));
vi.mock('@/lib/firebase', () => ({ get db() { return h.db; }, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: h.uid } }) }));

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-kalabo',
    firestore: { rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8085 },
  });
});
afterAll(async () => { await env?.cleanup(); });

const slot = (classId: string, subject: string, owner: string | null) => ({
  classId, className: classId, subject, normalizedSubject: subject, isFormTeacherSlot: false,
  ownerTeacherId: owner, ownerTeacherName: owner, ownerAssignmentId: owner ? `row_${classId}` : null,
  delegateTeacherId: null, delegateAssignmentId: null, delegateRole: null, delegateStart: null, delegateEnd: null,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/ADMIN'), { userType: 'admin' });
    await setDoc(doc(db, 'users/HOD'), { userType: 'teacher', fullName: 'Hod', departments: ['Mathematics'], status: 'active' });
    await setDoc(doc(db, 'users/T2'), { userType: 'teacher', fullName: 'Two', departments: ['Mathematics'], status: 'active' });
    await setDoc(doc(db, 'users/T3'), { userType: 'teacher', fullName: 'Three', departments: ['Languages'], status: 'active' });
    await setDoc(doc(db, 'users/OLD'), { userType: 'teacher', fullName: 'Old record', department: 'Mathematics', status: 'active' });
    await setDoc(doc(db, 'users/HOD2'), { userType: 'teacher', fullName: 'Languages HoD', departments: ['Languages'], status: 'active' });
    await setDoc(doc(db, 'staff_roles/HOD__hod'), { teacherId: 'HOD', role: 'hod', department: 'Mathematics', status: 'active' });
    await setDoc(doc(db, 'staff_roles/HOD2__hod'), { teacherId: 'HOD2', role: 'hod', department: 'Languages', status: 'ended' });
    await setDoc(doc(db, 'system/departments'), { names: ['Mathematics', 'Languages'], subjects: { Mathematics: ['Mathematics', 'Computer Science'], Languages: ['English'] } });
    await setDoc(doc(db, 'system/assignmentEngine'), { migratedAt: new Date() });
    await setDoc(doc(db, 'classes/F2A'), { name: 'Form 2A', isActive: true, teachers: ['T2'] });
    await setDoc(doc(db, 'class_slots/F2A__Mathematics'), slot('F2A', 'Mathematics', 'T2'));
    await setDoc(doc(db, 'class_slots/F2A__English'), slot('F2A', 'English', 'T3'));
    await setDoc(doc(db, 'teacher_assignments/row_F2A'), {
      teacherId: 'T2', classId: 'F2A', subject: 'Mathematics', normalizedSubject: 'Mathematics',
      isFormTeacher: false, roleType: 'substantive', status: 'active',
    });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe('department membership', () => {
  it('a teacher cannot add themselves to a department, or change their department text', async () => {
    await assertFails(updateDoc(doc(as('T3'), 'users/T3'), { departments: ['Languages', 'Mathematics'] }));
    await assertFails(updateDoc(doc(as('T3'), 'users/T3'), { department: 'Mathematics' }));
    await assertSucceeds(updateDoc(doc(as('T3'), 'users/T3'), { fullName: 'Three Banda' })); // profile still editable
  });
  it('the HoD adds a teacher to their department and removes one', async () => {
    await assertSucceeds(updateDoc(doc(as('HOD'), 'users/T3'), { departments: ['Languages', 'Mathematics'], department: 'Languages, Mathematics' }));
    await assertSucceeds(updateDoc(doc(as('HOD'), 'users/T2'), { departments: [], department: '' }));
    await assertSucceeds(updateDoc(doc(as('HOD'), 'users/OLD'), { departments: ['Mathematics'], department: 'Mathematics' }));
  });
  it('the HoD cannot touch other departments or other fields', async () => {
    await assertFails(updateDoc(doc(as('HOD'), 'users/T3'), { departments: [] }));                          // removes Languages
    await assertFails(updateDoc(doc(as('HOD'), 'users/T3'), { departments: ['Languages', 'Science'] }));    // adds another dept
    await assertFails(updateDoc(doc(as('HOD'), 'users/T3'), { departments: ['Languages', 'Mathematics'], status: 'inactive' }));
    await assertFails(updateDoc(doc(as('HOD'), 'users/ADMIN'), { departments: ['Mathematics'] }));          // not a teacher
  });
  it('an ended HoD and an ordinary teacher cannot change anyone', async () => {
    await assertFails(updateDoc(doc(as('HOD2'), 'users/T2'), { departments: ['Mathematics', 'Languages'] }));
    await assertFails(updateDoc(doc(as('T2'), 'users/T3'), { departments: ['Languages', 'Mathematics'] }));
  });
});

describe('HoD allocations (rules)', () => {
  it('may give a department subject to a department teacher', async () => {
    await assertSucceeds(setDoc(doc(as('HOD'), 'class_slots/F2A__Mathematics'), { ...slot('F2A', 'Mathematics', 'HOD') }, { merge: true }));
    await assertSucceeds(setDoc(doc(as('HOD'), 'class_slots/F2B__Computer Science'), slot('F2B', 'Computer Science', 'T2')));
    await assertSucceeds(setDoc(doc(as('HOD'), 'class_slots/F2A__Mathematics'), { ownerTeacherId: null, ownerTeacherName: null, ownerAssignmentId: null }, { merge: true }));
  });
  it('may not use teachers of other departments, other subjects, form teacher slots, or start covers', async () => {
    await assertFails(setDoc(doc(as('HOD'), 'class_slots/F2A__Mathematics'), { ownerTeacherId: 'T3' }, { merge: true }));
    await assertFails(setDoc(doc(as('HOD'), 'class_slots/F2A__English'), { ownerTeacherId: 'T2' }, { merge: true }));
    await assertFails(setDoc(doc(as('HOD'), 'class_slots/F2A__form-teacher'), { ...slot('F2A', 'form-teacher', 'T2'), isFormTeacherSlot: true }));
    await assertFails(setDoc(doc(as('HOD'), 'class_slots/F2A__Mathematics'), { delegateTeacherId: 'T2', delegateRole: 'tp' }, { merge: true }));
    await assertFails(setDoc(doc(as('HOD'), 'class_slots/WRONG_ID'), slot('F2B', 'Mathematics', 'T2')));
    await assertFails(setDoc(doc(as('T2'), 'class_slots/F2A__Mathematics'), { ownerTeacherId: 'T2' }, { merge: true }));
  });
  it('history rows: create for department teachers, end department rows, nothing else', async () => {
    const row = { teacherId: 'T2', classId: 'F2B', subject: 'Mathematics', normalizedSubject: 'Mathematics', isFormTeacher: false, roleType: 'substantive', status: 'active', assignedBy: 'HOD' };
    await assertSucceeds(setDoc(doc(as('HOD'), 'teacher_assignments/new1'), row));
    await assertFails(setDoc(doc(as('HOD'), 'teacher_assignments/new2'), { ...row, teacherId: 'T3' }));
    await assertFails(setDoc(doc(as('HOD'), 'teacher_assignments/new3'), { ...row, roleType: 'tp' }));
    await assertFails(setDoc(doc(as('HOD'), 'teacher_assignments/new4'), { ...row, normalizedSubject: 'English', subject: 'English' }));
    await assertSucceeds(setDoc(doc(as('HOD'), 'teacher_assignments/row_F2A'), { status: 'ended', endReason: 'replaced', endDate: new Date() }, { merge: true }));
  });
  it('audit events and membership caches', async () => {
    await assertSucceeds(addDoc(collection(as('HOD'), 'assignment_events'), { type: 'owner-assigned', actorId: 'HOD' }));
    await assertFails(addDoc(collection(as('HOD'), 'assignment_events'), { type: 'owner-assigned', actorId: 'ADMIN' }));
    await assertSucceeds(updateDoc(doc(as('HOD'), 'classes/F2A'), { teachers: ['T2', 'HOD'] }));
    await assertFails(updateDoc(doc(as('HOD'), 'classes/F2A'), { formTeacherId: 'HOD' }));
    await assertSucceeds(updateDoc(doc(as('HOD'), 'classes/F2A'), { teachers: ['T2'], formTeacherId: null, formTeacherName: null })); // cache rebuild: missing → null
    await assertSucceeds(updateDoc(doc(as('HOD'), 'users/T2'), { assignedClasses: [], formClassId: null, formClassName: null, isFormTeacher: false, assignedClassId: null, assignedClassName: null }));
    await assertFails(updateDoc(doc(as('HOD'), 'users/T2'), { formClassId: 'F2A' }));
    await assertSucceeds(updateDoc(doc(as('HOD'), 'users/T2'), { assignedClasses: ['F2A'] }));
    await assertFails(updateDoc(doc(as('T2'), 'classes/F2A'), { teachers: ['T2', 'T3'] }));
  });
});

describe('HoD allocation through the real assignment engine', () => {
  it('assignOwner and removeOwner succeed for the HoD (same code as Teacher Management)', async () => {
    const engine = await import('@/services/assignmentEngine');
    h.db = as('HOD'); h.uid = 'HOD';
    await engine.assignOwner({ teacherId: 'HOD', classId: 'F2A', subject: 'Mathematics' });
    let s = await getDoc(doc(as('ADMIN'), 'class_slots/F2A__Mathematics'));
    expect(s.data()?.ownerTeacherId).toBe('HOD');
    expect((await getDoc(doc(as('ADMIN'), 'teacher_assignments/row_F2A'))).data()?.status).toBe('ended');
    await engine.removeOwner('F2A__Mathematics');
    s = await getDoc(doc(as('ADMIN'), 'class_slots/F2A__Mathematics'));
    expect(s.data()?.ownerTeacherId).toBeNull();
  });
  it('the engine refuses (rules) a teacher outside the department', async () => {
    const engine = await import('@/services/assignmentEngine');
    h.db = as('HOD'); h.uid = 'HOD';
    await expect(engine.assignOwner({ teacherId: 'T3', classId: 'F2A', subject: 'Mathematics' })).rejects.toBeTruthy();
  });
});
