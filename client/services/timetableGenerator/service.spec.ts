import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('firebase/firestore', async () => await import('../../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}), onAuthStateChanged: () => () => {} }));

import { resetStore, store } from '../../test/fakeFirestore';
import { PERIODS } from '../../test/timetableFixtures';
import {
  liveLessons,
  loadGeneratorInputs,
  normalizeConfig,
  publishVersion,
  saveDraft,
  saveTimetableConfig,
  getTimetableConfig,
  signOffAllocations,
  listSignoffs,
  reopenAllocations,
  withdrawTimetable,
  setTimetabler,
  isTimetabler,
} from './service';
import { getSchoolDayBoard, getTodayTimetableForTeacher, inForceOn } from '@/services/timetableService';

const ADMIN = { uid: 'ADMIN', name: 'Head' };
const slot = (classId: string, subj: string, subject: string, owner: string | null) => ({
  classId, className: `Form ${classId}`, subject, normalizedSubject: subj, ownerTeacherId: owner, ownerTeacherName: owner,
});
const rows = (status?: string) =>
  [...(store.get('timetable_entries')?.values() ?? [])].filter((r: any) => !status || r.status === status) as any[];

beforeEach(() => {
  resetStore({
    periods: Object.fromEntries(PERIODS.map(p => [p.id, { ...p }])),
    classes: { '1A': { name: 'Form 1A', type: 'form', level: 1, isActive: true }, '1B': { name: 'Form 1B', type: 'form', level: 1, isActive: false } },
    class_slots: {
      '1A__english': slot('1A', 'english', 'English', 'T1'),
      '1A__mathematics': slot('1A', 'mathematics', 'Mathematics', 'T2'),
      '1A__form-teacher': { ...slot('1A', 'form-teacher', 'Form Teacher', 'T1'), isFormTeacherSlot: true },
    },
    users: { T1: { fullName: 'T1', status: 'active' }, T2: { fullName: 'T2', status: 'active' } },
    system: { departments: { subjects: { Languages: ['english'], Mathematics: ['mathematics'] } } },
  });
});

const VERSION = {
  name: 'Term 3 timetable',
  term: 'Term 3' as const,
  year: 2026,
  lessons: [
    { slotId: '1A__english', classId: '1A', day: 1 as const, start: 2, size: 2 },
    { slotId: '1A__mathematics', classId: '1A', day: 1 as const, start: 5, size: 1 },
  ],
  slots: {
    '1A__english': { classId: '1A', className: 'Form 1A', subject: 'English', normalizedSubject: 'english', roomName: null },
    '1A__mathematics': { classId: '1A', className: 'Form 1A', subject: 'Mathematics', normalizedSubject: 'mathematics', roomName: 'Room 4' },
  },
  unplaced: [],
  notes: [],
  stats: null,
};

describe('generator inputs and set-up', () => {
  it('loads classes, subject slots (not Form Teacher) with their teachers, and departments', async () => {
    const inp = await loadGeneratorInputs();
    expect(inp.slotInputs.map(s => s.slotId).sort()).toEqual(['1A__english', '1A__mathematics']);
    expect(inp.slotInputs.find(s => s.slotId === '1A__english')!.teacherIds).toEqual(['T1']);
    expect(inp.departmentOf('english')).toBe('Languages');
    expect(inp.departmentOf('silozi')).toBeNull();
  });

  it('saves and reads the curriculum (no undefined values reach Firestore)', async () => {
    const cfg = normalizeConfig({
      levels: { 'form-1': { label: 'Form 1', subjects: [{ normalizedSubject: 'english', subject: 'English', min: 6, max: 5, doubles: 1, time: 'prefer-morning' }] } },
      rooms: [{ id: 'lab', name: 'Lab' }],
      events: [{ id: 'e', name: 'Assembly', days: [1, 9], periods: [1], levels: [] }],
    });
    expect(cfg.levels['form-1'].subjects[0]).toMatchObject({ min: 6, max: 6, doubles: 1, triples: 0, time: 'prefer-morning', roomId: null });
    expect(cfg.events[0].days).toEqual([1]);
    await saveTimetableConfig(cfg, ADMIN);
    expect(await getTimetableConfig()).toMatchObject({ levels: cfg.levels, rooms: cfg.rooms, maxTeacherPeriodsPerDay: 6 });
  });

  it('sign-offs per department and term; reopening removes it', async () => {
    await signOffAllocations({ department: 'Languages', term: 'Term 3', year: 2026, by: { uid: 'T1', name: 'T1' }, byRole: 'hod', vacantCount: 0 });
    expect((await listSignoffs('Term 3', 2026)).map(s => [s.department, s.byRole])).toEqual([['Languages', 'hod']]);
    expect(await listSignoffs('Term 1', 2027)).toEqual([]);
    await reopenAllocations('Languages', 'Term 3', 2026);
    expect(await listSignoffs('Term 3', 2026)).toEqual([]);
  });

  it('timetabler role', async () => {
    expect(await isTimetabler('T1')).toBe(false);
    await setTimetabler({ id: 'T1', name: 'T1' }, true, ADMIN);
    expect(await isTimetabler('T1')).toBe(true);
    await setTimetabler({ id: 'T1', name: 'T1' }, false, ADMIN);
    expect(await isTimetabler('T1')).toBe(false);
  });
});

describe('publishing', () => {
  it('writes one live row per period, archives the old timetable from today, and keeps history by date', async () => {
    // An older, teacher-made timetable: English on Monday P1.
    store.set('timetable_entries', new Map([
      ['old1', { slotId: '1A__english', classId: '1A', className: 'Form 1A', subject: 'English', normalizedSubject: 'english', term: 'Term 3', year: 2026, dayOfWeek: 1, periodIndex: 1, isDouble: false, status: 'active' }],
      ['pend', { slotId: '1A__english', classId: '1A', className: 'Form 1A', subject: 'English', normalizedSubject: 'english', term: 'Term 3', year: 2026, dayOfWeek: 2, periodIndex: 1, isDouble: false, status: 'pending' }],
    ]));
    const id = await saveDraft(VERSION, ADMIN);
    const r = await publishVersion(id, ADMIN, '2026-10-19');
    expect(r).toEqual({ rows: 3, archived: 1, effectiveFrom: '2026-10-19' });
    expect(rows('active').map(x => `${x.subject} ${x.dayOfWeek}:${x.periodIndex} ${x.venue ?? ''}`).sort()).toEqual([
      'English 1:2 ', 'English 1:3 ', 'Mathematics 1:5 Room 4',
    ]);
    expect(store.get('timetable_entries')!.get('old1')).toMatchObject({ status: 'archived', effectiveTo: '2026-10-19' });
    expect(store.get('timetable_entries')!.get('pend')!.status).toBe('archived');
    expect(store.get('timetable_versions')!.get(id)).toMatchObject({ status: 'published', effectiveFrom: '2026-10-19' });

    // Re-running does not duplicate rows.
    await publishVersion(id, ADMIN, '2026-10-19');
    expect(rows('active')).toHaveLength(3);

    // Monday 12 Oct (before): the old timetable. Monday 19 Oct: the new one.
    const before = await getTodayTimetableForTeacher('T1', new Date('2026-10-12T07:00:00'));
    expect(before.map(x => x.entry.periodIndex)).toEqual([1]);
    const after = await getTodayTimetableForTeacher('T1', new Date('2026-10-19T07:00:00'));
    expect(after.map(x => x.entry.periodIndex)).toEqual([2, 3]);
    const board = await getSchoolDayBoard('2026-10-12', new Date('2026-10-19T07:00:00'));
    expect(board.classes.find(c => c.classId === '1A')!.lessons.map(l => l.row.entry.periodIndex)).toEqual([1]);
  });

  it('publishing another version archives the first; withdrawing archives the rows from today', async () => {
    const a = await saveDraft(VERSION, ADMIN);
    await publishVersion(a, ADMIN, '2026-10-19');
    const b = await saveDraft({ ...VERSION, lessons: [VERSION.lessons[1]] }, ADMIN);
    await publishVersion(b, ADMIN, '2026-10-26');
    expect(store.get('timetable_versions')!.get(a)!.status).toBe('archived');
    expect(rows('active')).toHaveLength(1);
    expect(rows('archived').every(x => x.effectiveTo === '2026-10-26')).toBe(true);
    // The week of the 19th still shows version A.
    const mid = await getTodayTimetableForTeacher('T1', new Date('2026-10-19T07:00:00'));
    expect(mid.map(x => x.entry.periodIndex)).toEqual([2, 3]);

    expect(await withdrawTimetable('Term 3', 2026, ADMIN, '2026-11-02')).toBe(1);
    expect(rows('active')).toHaveLength(0);
    expect(store.get('timetable_versions')!.get(b)!.status).toBe('archived');
  });

  it('refuses to publish a timetable with lessons that have no place', async () => {
    const id = await saveDraft({ ...VERSION, unplaced: [{ slotId: '1A__english', classId: '1A', className: 'Form 1A', subject: 'English', size: 1, reason: 'x' }] }, ADMIN);
    await expect(publishVersion(id, ADMIN, '2026-10-19')).rejects.toThrow(/no place/);
  });

  it('reads the live timetable back as lessons (doubles kept together, never across the break)', async () => {
    const id = await saveDraft({ ...VERSION, lessons: [...VERSION.lessons, { slotId: '1A__mathematics', classId: '1A', day: 2, start: 4, size: 1 }, { slotId: '1A__mathematics', classId: '1A', day: 2, start: 5, size: 1 }] }, ADMIN);
    await publishVersion(id, ADMIN, '2026-10-19');
    const { lessons } = await liveLessons('Term 3', 2026);
    expect(lessons.map(l => `${l.slotId} ${l.day}:${l.start}x${l.size}`).sort()).toEqual([
      '1A__english 1:2x2', '1A__mathematics 1:5x1', '1A__mathematics 2:4x1', '1A__mathematics 2:5x1',
    ]);
  });

  it('in force on a date', () => {
    expect(inForceOn({ status: 'active' }, '2026-01-01')).toBe(true);
    expect(inForceOn({ status: 'archived' }, '2026-01-01')).toBe(false);
    expect(inForceOn({ status: 'active', effectiveFrom: '2026-10-19' }, '2026-10-18')).toBe(false);
    expect(inForceOn({ status: 'archived', effectiveFrom: '2026-10-01', effectiveTo: '2026-10-19' }, '2026-10-18')).toBe(true);
    expect(inForceOn({ status: 'archived', effectiveFrom: '2026-10-01', effectiveTo: '2026-10-19' }, '2026-10-19')).toBe(false);
    expect(inForceOn({ status: 'pending' }, '2026-10-19')).toBe(false);
  });
});
