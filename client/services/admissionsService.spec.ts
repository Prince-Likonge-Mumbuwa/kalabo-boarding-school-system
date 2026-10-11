// Admissions on the in-memory Firestore: roles, intake settings, automatic
// placement, student ids, admission records, closed intakes, cancelling.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('firebase/firestore', async () => await import('../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'OFF1' } }) }));

import { resetStore, getDocData, store, writeLog, fakeHooks } from '../test/fakeFirestore';
import {
  admitLearner,
  assignAdmissionsOfficer,
  cancelAdmission,
  endAdmissionsOfficer,
  getIntakeSettings,
  isAdmissionsOfficer,
  listAdmissions,
  listAdmissionsOfficers,
  loadIntakeClasses,
  saveIntakeSettings,
} from './admissionsService';
import { learnerService } from './schoolService';
import type { AdmissionInput } from '@/types/admissions';

const admin = { uid: 'ADMIN', name: 'Head Teacher' };
const officer = { uid: 'OFF1', name: 'Mrs Officer' };

const kid = (n: number, gender: 'male' | 'female', extra: Partial<AdmissionInput> = {}): AdmissionInput => ({
  fullName: `Learner Number${n}`, gender, dateOfBirth: '2013-05-10', address: 'Kalabo', guardian: `Guardian ${n}`,
  guardianPhone: `09700000${String(n).padStart(2, '0')}`, sponsor: 'Self', dateOfFirstEntry: '2027-01-12',
  admissionType: 'new_intake', level: { type: 'form', level: 1 }, ...extra,
});

beforeEach(() => {
  resetStore({
    system: { academicYear: { currentYear: 2027 } },
    classes: {
      A: { name: 'Form 1A', type: 'form', level: 1, section: 'A', isActive: true, students: 1, formTeacherName: 'Mr Phiri' },
      B: { name: 'Form 1B', type: 'form', level: 1, section: 'B', isActive: true, students: 0 },
      C: { name: 'Form 1C', type: 'form', level: 1, section: 'C', isActive: true, students: 0 },
      F2: { name: 'Form 2A', type: 'form', level: 2, section: 'A', isActive: true, students: 0 },
    },
    learners: {
      // A repeater already in Form 1A for 2027, holding F1A_004.
      r1: { classId: 'A', studentId: 'F1A_004', studentIndex: 4, fullName: 'Repeat Learner', gender: 'male', status: 'active', academicYear: 2027 },
      // Last year's learner who moved on (not in Form 1A any more) — irrelevant.
      // An archived learner who still holds F1B_007 must not be reused.
      x1: { classId: 'B', studentId: 'F1B_007', studentIndex: 7, fullName: 'Left Learner', gender: 'female', status: 'archived' },
      // A 2026 Form 1 learner still in Form 1C before the transition: does not count for 2027.
      old: { classId: 'C', studentId: 'F1C_001', studentIndex: 1, fullName: 'Old Cohort', gender: 'male', status: 'active', academicYear: 2026 },
    },
  });
});

async function setup(capacity = 3, isOpen = true) {
  await saveIntakeSettings({ year: 2027, isOpen, levels: [{ type: 'form', level: 1 }], defaultCapacity: capacity, capacities: {}, excludedClassIds: [] }, admin);
}

describe('roles', () => {
  it('admin assigns and removes the admissions officer role', async () => {
    expect(await isAdmissionsOfficer('OFF1')).toBe(false);
    await assignAdmissionsOfficer({ id: 'OFF1', name: 'Mrs Officer' }, admin);
    expect(await isAdmissionsOfficer('OFF1')).toBe(true);
    expect((await listAdmissionsOfficers()).map(o => [o.teacherName, o.status])).toEqual([['Mrs Officer', 'active']]);
    await endAdmissionsOfficer('OFF1', admin);
    expect(await isAdmissionsOfficer('OFF1')).toBe(false);
    expect(getDocData('staff_roles', 'OFF1__admissions-officer')!.history.map((h: any) => h.action)).toEqual(['assigned', 'ended']);
  });
});

describe('admitting', () => {
  it('counts only the intake year and the classes of the intake levels', async () => {
    await setup();
    const classes = await loadIntakeClasses(await getIntakeSettings(2027));
    expect(classes.map(c => [c.id, c.total, c.capacity, c.maxIndex])).toEqual([['A', 1, 3, 4], ['B', 0, 3, 7], ['C', 0, 3, 1]]);
  });

  it('places learners evenly, never over capacity, with unique continuing ids, and records each admission', async () => {
    await setup(3);
    const placed: string[] = [];
    const genders: Array<'male' | 'female'> = ['female', 'male', 'female', 'male', 'female', 'male', 'female', 'male'];
    for (let i = 0; i < genders.length; i++) {
      const r = await admitLearner(kid(i + 1, genders[i]), 2027, officer);
      placed.push(r.record.classId);
      expect(r.record.admissionNumber).toBe(`ADM-2027-000${i + 1}`);
    }
    const count = (id: string) => placed.filter(x => x === id).length;
    // Form 1A already had the repeater: 2 more fill it to 3; B and C take 3 each.
    expect([count('A'), count('B'), count('C')]).toEqual([2, 3, 3]);

    // Full now.
    await expect(admitLearner(kid(99, 'male'), 2027, officer)).rejects.toThrow(/All Form 1 classes are full/);

    const learners = [...store.get('learners')!.values()].filter((l: any) => l.admissionNumber);
    const ids = learners.map((l: any) => l.studentId);
    expect(new Set(ids).size).toBe(ids.length);
    // Numbers continue after anything ever used in the class.
    expect(ids.filter((x: string) => x.startsWith('F1A')).sort()).toEqual(['F1A_005', 'F1A_006']);
    expect(ids.filter((x: string) => x.startsWith('F1B')).sort()).toEqual(['F1B_008', 'F1B_009', 'F1B_010']);
    expect(ids.filter((x: string) => x.startsWith('F1C')).sort()).toEqual(['F1C_002', 'F1C_003', 'F1C_004']);

    const first = learners.find((l: any) => l.admissionNumber === 'ADM-2027-0001') as any;
    expect(first).toMatchObject({ status: 'active', academicYear: 2027, admissionYear: 2027, admittedByName: 'Mrs Officer', birthYear: 2013, classType: 'form', classLevel: 1 });
    expect(getDocData('admission_settings', '2027')!.seq).toBe(8);
    expect(getDocData('classes', 'B')).toMatchObject({ students: 3, nextStudentIndex: 11 });

    const list = await listAdmissions(2027);
    expect(list).toHaveLength(8);
    expect(list[0]).toMatchObject({ admissionNumber: 'ADM-2027-0008', placement: 'auto', status: 'admitted' });
    expect(list.find(r => r.classId === 'A')!.formTeacherName).toBe('Mr Phiri');

    // No write may contain undefined (Firestore refuses it).
    for (const w of writeLog) for (const [k, v] of Object.entries(w.after ?? {})) {
      if (v === undefined) throw new Error(`undefined at ${w.path}.${k}`);
    }
  });

  it('keeps gender balanced across classes', async () => {
    await setup(10);
    for (let i = 0; i < 12; i++) await admitLearner(kid(i + 1, i < 6 ? 'male' : 'female'), 2027, officer);
    const classes = await loadIntakeClasses(await getIntakeSettings(2027));
    const boys = classes.map(c => c.male);
    const girls = classes.map(c => c.female);
    expect(Math.max(...boys) - Math.min(...boys)).toBeLessThanOrEqual(1);
    expect(Math.max(...girls) - Math.min(...girls)).toBeLessThanOrEqual(1);
  });

  it('the old admission path continues the same numbering', async () => {
    await setup(3);
    const r = await admitLearner(kid(1, 'female'), 2027, officer); // → Form 1B (empty, B before C)
    expect(r.record.studentId).toBe('F1B_008');
    const added = await learnerService.addLearner({
      fullName: 'Manual Entry', address: 'x', dateOfFirstEntry: '2027-01-12', gender: 'male', guardian: 'g',
      sponsor: 's', guardianPhone: '0970000000', dateOfBirth: '2013-01-01', classId: 'B',
    });
    expect(added.studentId).toBe('F1B_009');
  });

  it('refuses when closed (officers) or not set up, and only admins choose the class', async () => {
    await expect(admitLearner(kid(1, 'male'), 2027, officer)).rejects.toThrow(/not been set up/);
    await setup(3, false);
    await expect(admitLearner(kid(1, 'male'), 2027, officer)).rejects.toThrow(/closed/);
    await expect(admitLearner({ ...kid(1, 'male'), classIdOverride: 'C' }, 2027, officer, {})).rejects.toThrow(/Only the admin/);
    const r = await admitLearner({ ...kid(1, 'male'), classIdOverride: 'C' }, 2027, admin, { isAdmin: true });
    expect(r.record).toMatchObject({ classId: 'C', placement: 'manual' });
    await expect(admitLearner({ ...kid(2, 'male'), level: { type: 'form', level: 2 } }, 2027, admin, { isAdmin: true })).rejects.toThrow(/not open/);
  });

  it('when another officer admits meanwhile, the learner is re-placed with that admission counted', async () => {
    await setup(1);
    // Form 1A is full (repeater). While our officer counts the classes, another
    // officer's admission lands in Form 1B (the class we would have chosen).
    let fired = false;
    fakeHooks.beforeGetDocs = q => {
      if (fired || q.path !== 'learners') return;
      fired = true;
      store.get('learners')!.set('other', { classId: 'B', studentId: 'F1B_008', studentIndex: 8, fullName: 'Other Officer Learner', gender: 'male', status: 'active', academicYear: 2027 });
      store.get('admission_settings')!.get('2027')!.seq = 1;
    };
    try {
      const r = await admitLearner(kid(1, 'male'), 2027, officer);
      expect(r.record.classId).toBe('C');          // B is now full
      expect(r.record.admissionNumber).toBe('ADM-2027-0002');
      expect(getDocData('admission_settings', '2027')!.seq).toBe(2);
    } finally {
      fakeHooks.beforeGetDocs = null;
    }
  });

  it('cancelling frees the place and archives the learner', async () => {
    await setup(1);
    const a = await admitLearner(kid(1, 'male'), 2027, officer); // B
    await admitLearner(kid(2, 'male'), 2027, officer);           // C (A is full with the repeater)
    await expect(admitLearner(kid(3, 'male'), 2027, officer)).rejects.toThrow(/full/);
    await cancelAdmission(a.record.id, 'Entered twice', admin);
    expect(getDocData('learners', a.learnerId)!.status).toBe('archived');
    expect(getDocData('admissions', a.record.id)).toMatchObject({ status: 'cancelled', cancelReason: 'Entered twice' });
    const again = await admitLearner(kid(3, 'male'), 2027, officer);
    expect(again.record.classId).toBe('B');
    expect(again.record.studentId).toBe('F1B_009'); // number not reused
    expect(again.record.admissionNumber).toBe('ADM-2027-0003');
  });
});
