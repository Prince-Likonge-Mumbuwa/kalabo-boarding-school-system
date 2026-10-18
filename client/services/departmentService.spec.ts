// Departments and Heads of Department on the in-memory Firestore.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('firebase/firestore', async () => await import('../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}) }));

import { resetStore, getDocData } from '../test/fakeFirestore';
import {
  SCHOOL_DEPARTMENTS,
  canonicalDepartment,
  setOwnDepartmentSubjects,
  assignHod,
  endHod,
  getDepartmentList,
  getHodRole,
  hodRoleId,
  listHods,
  membersOf,
  mergeDepartmentOptions,
  normalizeDepartments,
  planHodAssignment,
  setTeacherDepartments,
  teacherDepartments,
  type HodRole,
  getDepartmentConfig,
  setDepartmentSubjects,
  subjectsOfDepartment,
  departmentOfSubject,
  withDepartmentSubjects,
  setMembership,
  allocationRows,
  teachingLoad,
  departmentRollCall,
} from './departmentService';
import { teacherService } from './schoolService';

const admin = { uid: 'ADMIN', name: 'Head Teacher' };

beforeEach(() => {
  resetStore({
    users: {
      T1: { userType: 'teacher', fullName: 'Muhau N', department: 'Mathematics' },
      T2: { userType: 'teacher', fullName: 'Precious B', departments: ['Social Sciences', 'Languages'], department: 'Social Sciences, Languages' },
      T3: { userType: 'teacher', fullName: 'Chanda M' },
    },
  });
});

describe('pure helpers', () => {
  it('normalises names: trims, collapses spaces, drops blanks and case-insensitive duplicates', () => {
    expect(normalizeDepartments(['  Mathematics ', 'mathematics', '', 'Natural   Sciences', 3, null])).toEqual(['Mathematics', 'Natural Sciences']);
    expect(normalizeDepartments('Mathematics')).toEqual([]);
  });

  it("reads a teacher's departments, falling back to the old single text (never 'General')", () => {
    expect(teacherDepartments({ departments: ['Languages', 'Languages'] })).toEqual(['Languages']);
    expect(teacherDepartments({ department: 'Mathematics' })).toEqual(['Mathematics']);
    expect(teacherDepartments({ department: 'Mathematics, Natural Sciences' })).toEqual(['Mathematics', 'Natural Sciences']);
    expect(teacherDepartments({ department: 'General' })).toEqual([]);
    expect(teacherDepartments({})).toEqual([]);
    expect(teacherDepartments(null)).toEqual([]);
    // the array wins over the old text once it exists, even when empty
    expect(teacherDepartments({ departments: [], department: 'Mathematics' })).toEqual([]);
  });

  it('options keep departments a teacher already holds even if not on the school list', () => {
    expect(mergeDepartmentOptions(['Mathematics'], ['Maths Club'], undefined)).toEqual(['Mathematics', 'Maths Club']);
  });

  it('members are matched case-insensitively', () => {
    const t = [{ id: 'a', departments: ['mathematics'] }, { id: 'b', departments: ['Languages'] }, { id: 'c' }];
    expect(membersOf(t, 'Mathematics').map(x => x.id)).toEqual(['a']);
  });

  it('plans an HoD appointment: replace, move, or nothing to do', () => {
    const roles: HodRole[] = [
      { id: 'x', teacherId: 'T2', teacherName: 'Precious B', department: 'Languages', status: 'active' },
      { id: 'y', teacherId: 'T1', teacherName: 'Muhau N', department: 'Mathematics', status: 'ended' },
    ];
    expect(planHodAssignment(roles, 'T1', 'Languages')).toEqual({ unchanged: false, replaces: roles[0], previous: null });
    expect(planHodAssignment(roles, 'T2', 'languages')).toEqual({ unchanged: true, replaces: null, previous: null });
    expect(planHodAssignment(roles, 'T2', 'Social Sciences')).toEqual({ unchanged: false, replaces: null, previous: 'Languages' });
    // ended roles never count
    expect(planHodAssignment(roles, 'T3', 'Mathematics').replaces).toBeNull();
  });
});

describe('department list', () => {
  it("is the school's seven departments", async () => {
    expect(await getDepartmentList()).toEqual([
      'Languages', 'Mathematics', 'Natural Sciences', 'Practical Subjects', 'Expressive Arts', 'Business Studies', 'Social Sciences',
    ]);
    expect((await getDepartmentConfig()).names).toEqual([...SCHOOL_DEPARTMENTS]);
  });

  it('older names map to the school list; other text is kept', () => {
    expect(canonicalDepartment('home economics')).toBe('Practical Subjects');
    expect(canonicalDepartment('Design & Technology')).toBe('Practical Subjects');
    expect(canonicalDepartment(' natural sciences ')).toBe('Natural Sciences');
    expect(canonicalDepartment('Maths Club')).toBe('Maths Club');
    expect(teacherDepartments({ departments: ['Agricultural Science', 'Home Economics', 'Languages'] })).toEqual(['Practical Subjects', 'Languages']);
  });
});

describe('membership', () => {
  it('saves the list and keeps the old single text in step for older screens', async () => {
    await setTeacherDepartments('T3', ['Natural Sciences', 'Mathematics', 'natural sciences']);
    expect(getDocData('users', 'T3')).toMatchObject({ departments: ['Natural Sciences', 'Mathematics'], department: 'Natural Sciences, Mathematics' });
  });

  it('teacher list and updates carry departments (old records read from the single text)', async () => {
    const all = await teacherService.getTeachers();
    expect(all.find(t => t.id === 'T1')?.departments).toEqual(['Mathematics']);
    expect(all.find(t => t.id === 'T2')?.departments).toEqual(['Social Sciences', 'Languages']);
    expect(all.find(t => t.id === 'T3')?.departments).toEqual([]);
    await teacherService.updateTeacher('T3', { departments: ['Languages'] });
    expect(getDocData('users', 'T3')).toMatchObject({ departments: ['Languages'], department: 'Languages' });
  });
});

describe('Heads of Department', () => {
  it('appoints a HoD and adds them to the department if they were not a member', async () => {
    await assignHod({ id: 'T3', name: 'Chanda M', departments: [] }, 'Natural Sciences', admin);
    expect(getDocData('staff_roles', hodRoleId('T3'))).toMatchObject({ teacherId: 'T3', role: 'hod', department: 'Natural Sciences', status: 'active', assignedByName: 'Head Teacher' });
    expect(getDocData('users', 'T3')).toMatchObject({ departments: ['Natural Sciences'], department: 'Natural Sciences' });
    expect((await getHodRole('T3'))?.department).toBe('Natural Sciences');
  });

  it('one HoD per department: appointing another ends the previous one', async () => {
    await assignHod({ id: 'T1', name: 'Muhau N', departments: ['Mathematics'] }, 'Mathematics', admin);
    const r = await assignHod({ id: 'T3', name: 'Chanda M', departments: [] }, 'Mathematics', admin);
    expect(r.replaced?.teacherId).toBe('T1');
    expect(getDocData('staff_roles', hodRoleId('T1'))).toMatchObject({ status: 'ended' });
    expect(await getHodRole('T1')).toBeNull();
    expect((await getHodRole('T3'))?.department).toBe('Mathematics');
    const active = (await listHods()).filter(h => h.status === 'active');
    expect(active.map(h => h.teacherId)).toEqual(['T3']);
    // T1 stays a member of Mathematics
    expect(getDocData('users', 'T1')?.department).toBe('Mathematics');
  });

  it('a teacher heads one department: moving keeps one role document with history', async () => {
    await assignHod({ id: 'T2', name: 'Precious B', departments: ['Social Sciences', 'Languages'] }, 'Languages', admin);
    await assignHod({ id: 'T2', name: 'Precious B', departments: ['Social Sciences', 'Languages'] }, 'Social Sciences', admin);
    const d = getDocData('staff_roles', hodRoleId('T2'))!;
    expect(d.department).toBe('Social Sciences');
    expect(d.history.map((x: any) => `${x.action}:${x.department}`)).toEqual(['assigned:Languages', 'ended:Languages', 'assigned:Social Sciences']);
    // departments not changed: already a member
    expect(getDocData('users', 'T2')?.departments).toEqual(['Social Sciences', 'Languages']);
  });

  it('re-appointing the same HoD changes nothing', async () => {
    await assignHod({ id: 'T1', name: 'Muhau N', departments: ['Mathematics'] }, 'Mathematics', admin);
    const before = structuredClone(getDocData('staff_roles', hodRoleId('T1')));
    await assignHod({ id: 'T1', name: 'Muhau N', departments: ['Mathematics'] }, 'mathematics', admin);
    expect(getDocData('staff_roles', hodRoleId('T1'))).toEqual(before);
  });

  it('ends the role', async () => {
    await assignHod({ id: 'T1', name: 'Muhau N', departments: ['Mathematics'] }, 'Mathematics', admin);
    await endHod('T1', admin);
    expect(await getHodRole('T1')).toBeNull();
    expect(getDocData('staff_roles', hodRoleId('T1'))?.status).toBe('ended');
    await endHod('T1', admin); // no-op
    await endHod('nobody', admin); // no-op
  });

  it('refuses an empty department', async () => {
    await expect(assignHod({ id: 'T1', name: 'Muhau N' }, '  ', admin)).rejects.toThrow(/department/);
  });
});

describe('department subjects', () => {
  it('a subject belongs to one department: choosing it for another moves it', async () => {
    await setDepartmentSubjects('Mathematics', ['Mathematics', 'Computer Science'], admin);
    let cfg = await getDepartmentConfig();
    expect(subjectsOfDepartment(cfg, 'mathematics')).toEqual(['Mathematics', 'Computer Science']);
    expect(departmentOfSubject(cfg, 'Computer Science')).toBe('Mathematics');
    await setDepartmentSubjects('Natural Sciences', ['Biology', 'Computer Science'], admin);
    cfg = await getDepartmentConfig();
    expect(subjectsOfDepartment(cfg, 'Mathematics')).toEqual(['Mathematics']);
    expect(departmentOfSubject(cfg, 'Computer Science')).toBe('Natural Sciences');
    // emptying a department removes its entry
    await setDepartmentSubjects('Mathematics', [], admin);
    expect((await getDepartmentConfig()).subjects.Mathematics).toBeUndefined();
  });

  it("a HoD sets only their own department's subjects and cannot take another department's", async () => {
    const hod = { uid: 'T1', name: 'Muhau N' };
    await setDepartmentSubjects('Natural Sciences', ['Biology'], admin);
    expect(await setOwnDepartmentSubjects('Mathematics', ['Mathematics', 'Computer Science', 'Mathematics'], hod)).toEqual(['Computer Science', 'Mathematics']);
    let cfg = await getDepartmentConfig();
    expect(subjectsOfDepartment(cfg, 'Mathematics')).toEqual(['Computer Science', 'Mathematics']);
    expect(subjectsOfDepartment(cfg, 'Natural Sciences')).toEqual(['Biology']); // untouched
    expect(getDocData('system', 'departments')?.updatedBy).toBe('T1');
    await expect(setOwnDepartmentSubjects('Mathematics', ['Mathematics', 'Biology'], hod)).rejects.toThrow(/Biology belongs to Natural Sciences/);
    // clearing their list
    await setOwnDepartmentSubjects('Mathematics', [], hod);
    cfg = await getDepartmentConfig();
    expect(subjectsOfDepartment(cfg, 'Mathematics')).toEqual([]);
    expect(subjectsOfDepartment(cfg, 'Natural Sciences')).toEqual(['Biology']);
  });

  it('pure: withDepartmentSubjects', () => {
    const cfg = { names: ['A', 'B'], subjects: { A: ['x', 'y'], B: ['z'] } };
    expect(withDepartmentSubjects(cfg, 'B', ['y', 'z'])).toEqual({ A: ['x'], B: ['y', 'z'] });
    expect(withDepartmentSubjects(cfg, 'A', [])).toEqual({ B: ['z'] });
  });
});

describe('HoD membership (one department only)', () => {
  it('adds and removes only that department, keeping the others', async () => {
    expect(await setMembership('T2', 'Mathematics', true)).toEqual(['Social Sciences', 'Languages', 'Mathematics']);
    expect(getDocData('users', 'T2')?.department).toBe('Social Sciences, Languages, Mathematics');
    expect(await setMembership('T2', 'mathematics', true)).toEqual(['Social Sciences', 'Languages', 'Mathematics']); // no duplicate
    expect(await setMembership('T2', 'Mathematics', false)).toEqual(['Social Sciences', 'Languages']);
  });

  it('works for older records that only have the single department text', async () => {
    expect(await setMembership('T1', 'Natural Sciences', true)).toEqual(['Mathematics', 'Natural Sciences']);
    expect(await setMembership('T3', 'Languages', true)).toEqual(['Languages']);
    await expect(setMembership('NOPE', 'Languages', true)).rejects.toThrow(/not found/);
  });

  it('membership changes only that department; older stored names are left as they are', async () => {
    resetStore({ users: { T9: { userType: 'teacher', fullName: 'Old Record', departments: ['Home Economics', 'Languages'] } } });
    // already a member of Practical Subjects (the old name maps to it): nothing written
    expect(await setMembership('T9', 'Practical Subjects', true)).toEqual(['Practical Subjects', 'Languages']);
    expect(getDocData('users', 'T9')?.departments).toEqual(['Home Economics', 'Languages']);
    expect(await setMembership('T9', 'Mathematics', true)).toEqual(['Practical Subjects', 'Languages', 'Mathematics']);
    expect(getDocData('users', 'T9')?.departments).toEqual(['Home Economics', 'Languages', 'Mathematics']);
    expect(await setMembership('T9', 'Languages', false)).toEqual(['Practical Subjects', 'Mathematics']);
    expect(getDocData('users', 'T9')?.departments).toEqual(['Home Economics', 'Mathematics']);
  });
});

describe('allocations and roll call (pure)', () => {
  const slot = (classId: string, subject: string, owner: string | null, extra: any = {}) => ({
    id: `${classId}__${subject}`, classId, className: classId, subject, normalizedSubject: subject, isFormTeacherSlot: false,
    ownerAssignmentId: owner ? 'a' : null, ownerTeacherId: owner, ownerTeacherName: owner ? `Name ${owner}` : null, ownerSince: null,
    delegateAssignmentId: null, delegateTeacherId: null, delegateTeacherName: null, delegateRole: null, delegateStart: null, delegateEnd: null,
    updatedAt: null, ...extra,
  });

  it('one subject across all classes, with vacant classes and live covers', () => {
    const now = new Date('2026-10-14T09:00:00');
    const rows = allocationRows(
      [{ id: 'B', name: 'Form 2B' }, { id: 'A', name: 'Form 2A' }, { id: 'C', name: 'Form 10C' }],
      [
        slot('A', 'Mathematics', 'T1', { delegateTeacherId: 'T9', delegateTeacherName: 'Cover T', delegateRole: 'leave-cover', delegateStart: new Date('2026-10-01'), delegateEnd: new Date('2026-10-30') }),
        slot('B', 'Mathematics', null),
        slot('A', 'Biology', 'T5'),
      ] as any,
      'Mathematics', now,
    );
    expect(rows.map(r => [r.className, r.ownerTeacherId, r.coverTeacherName])).toEqual([
      ['Form 2A', 'T1', 'Cover T'], ['Form 2B', null, null], ['Form 10C', null, null],
    ]);
    expect(teachingLoad([slot('A', 'M', 'T1'), slot('B', 'M', 'T1'), slot('C', 'M', null)] as any).get('T1')).toBe(2);
  });

  it('roll call counts lessons taught (incl. cover) vs registers, and the daily register', () => {
    const L = (op: string | null, owner: string, status: string, p: number) => ({ status, markedByName: null, row: { operatorTeacherId: op, ownerTeacherId: owner, entry: { periodIndex: p } } });
    const board = { classes: [
      { classId: 'A', className: 'Form 2A', dailyTaken: true, lessons: [L('T1', 'T1', 'taken', 1), L('T1', 'T1', 'missed', 2), L('T1', 'T1', 'upcoming', 6)] },
      { classId: 'B', className: 'Form 2B', dailyTaken: false, lessons: [L('T2', 'T9', 'in-progress', 3), L(null, 'T3', 'uncovered', 4)] },
    ] } as any;
    const rows = departmentRollCall(board, [
      { id: 'T1', name: 'One', assignedClassId: 'A' },
      { id: 'T2', name: 'Two (covering)' },
      { id: 'T3', name: 'Three', status: 'on_leave', assignedClassId: 'B' },
    ]);
    const by = Object.fromEntries(rows.map(r => [r.teacherId, r]));
    expect([by.T1.due, by.T1.taken, by.T1.missed.length, by.T1.later, by.T1.daily]).toEqual([2, 1, 1, 1, { className: 'Form 2A', taken: true }]);
    expect([by.T2.due, by.T2.running.length, by.T2.daily]).toEqual([1, 1, null]);
    expect([by.T3.onLeave, by.T3.missed.length, by.T3.daily]).toEqual([true, 1, { className: 'Form 2B', taken: false }]);
    expect(departmentRollCall(null, [{ id: 'T1', name: 'One' }])[0].due).toBe(0);
  });
});
