import { describe, it, expect } from 'vitest';
import { buildProblem, checkProblem, readiness, levelKeyOf, requirementsForClass, slotIdOf, startsFor } from './problem';
import { solve, hardProblems } from './solver';
import { applyMove, moveTargets } from './editor';
import { EMPTY_CONFIG, type SubjectRequirement, type TimetableConfig } from './types';

const req = (normalizedSubject: string, min: number, extra: Partial<SubjectRequirement> = {}): SubjectRequirement => ({
  normalizedSubject,
  subject: normalizedSubject.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
  min,
  max: extra.max ?? min,
  doubles: 0,
  triples: 0,
  time: 'any',
  ...extra,
});

/** A school like Kalabo Boarding: Forms 1–5 (5 streams each), 25 classes. */
function school(opts: { streams?: number; teachersPerSubject?: number } = {}) {
  const streams = opts.streams ?? 5;
  const subjects: SubjectRequirement[] = [
    req('english', 6, { doubles: 1 }),
    req('mathematics', 6, { doubles: 1, time: 'prefer-morning' }),
    req('additional-mathematics', 2, { doubles: 1, time: 'morning-only' }),
    req('biology', 4, { doubles: 1 }),
    req('chemistry', 3, { doubles: 1 }),
    req('physics', 3, { doubles: 1 }),
    req('geography', 3),
    req('history', 2),
    req('civic-education', 2, { notLast: true }),
    req('computer-studies', 2, { doubles: 1 }),
    req('religious-education', 2, { max: 3 }),
    req('silozi', 2),
  ];
  const config: TimetableConfig = {
    ...EMPTY_CONFIG,
    levels: {},
    rooms: [
      { id: 'lab', name: 'Biology Lab' },
      { id: 'lab2', name: 'Chemistry Lab' },
      { id: 'lab3', name: 'Physics Lab' },
      { id: 'comp', name: 'Computer Lab' },
    ],
    events: [{ id: 'assembly', name: 'Assembly', days: [1], periods: [1], levels: [] }],
  };
  const classes: Array<{ id: string; name: string; type: string; level: number }> = [];
  for (let f = 1; f <= 5; f++) {
    // Seniors use the labs (one class at a time in each lab).
    const senior = (r: SubjectRequirement) =>
      f >= 4 && r.normalizedSubject === 'chemistry' ? { ...r, roomId: 'lab2' }
        : f === 5 && r.normalizedSubject === 'biology' ? { ...r, roomId: 'lab' }
          : f >= 3 && r.normalizedSubject === 'computer-studies' ? { ...r, roomId: 'comp' }
            : r;
    config.levels[`form-${f}`] = { key: `form-${f}`, label: `Form ${f}`, subjects: subjects.map(senior) };
    for (let s = 0; s < streams; s++) {
      const name = `Form ${f}${'ABCDEF'[s]}`;
      classes.push({ id: `F${f}${'ABCDEF'[s]}`, name, type: 'form', level: f });
    }
  }
  // Teachers: each subject has a few teachers sharing the classes, ~25–32 periods each.
  const slots = [] as Array<{ slotId: string; classId: string; normalizedSubject: string; subject: string; teacherIds: string[]; teacherNames: string[] }>;
  for (const subj of subjects) {
    const perTeacher = Math.max(1, Math.floor((subj.time === 'morning-only' ? 16 : 28) / subj.min));
    classes.forEach((c, i) => {
      const t = `${subj.normalizedSubject}-T${Math.floor(i / perTeacher) + 1}`;
      slots.push({ slotId: slotIdOf(c.id, subj.normalizedSubject), classId: c.id, normalizedSubject: subj.normalizedSubject, subject: subj.subject, teacherIds: [t], teacherNames: [t] });
    });
  }
  return { config, classes, slots };
}

describe('timetable problem', () => {
  it('works out levels from the class type, or from the name', () => {
    expect(levelKeyOf({ name: 'Form 1A', type: 'form', level: 1 })).toBe('form-1');
    expect(levelKeyOf({ name: 'Grade 12 B' })).toBe('grade-12');
  });

  it('never lets a lesson cross the break, and keeps mornings-only in P1–P4', () => {
    expect(startsFor(2, false)).toEqual([1, 2, 3, 5, 6, 7]);
    expect(startsFor(3, true)).toEqual([1, 2]);
  });

  it('applies class exceptions over the level', () => {
    const cfg: TimetableConfig = {
      ...EMPTY_CONFIG,
      levels: { 'form-1': { key: 'form-1', label: 'Form 1', subjects: [req('english', 6), req('french', 3)] } },
      exceptions: [
        { classId: 'A', normalizedSubject: 'french', excluded: true },
        { classId: 'A', normalizedSubject: 'english', min: 7 },
      ],
    };
    expect(requirementsForClass(cfg, 'A', 'form-1').map(r => [r.normalizedSubject, r.min, r.max])).toEqual([['english', 7, 7]]);
    expect(requirementsForClass(cfg, 'B', 'form-1')).toHaveLength(2);
  });

  it('explains impossible set-ups before solving', () => {
    const cfg: TimetableConfig = {
      ...EMPTY_CONFIG,
      levels: { 'form-1': { key: 'form-1', label: 'Form 1', subjects: [req('english', 30), req('maths', 13, { time: 'morning-only' })] } },
    };
    const p = buildProblem({ term: 'Term 1', year: 2027, config: cfg, classes: [{ id: 'A', name: 'Form 1A', type: 'form', level: 1 }], slots: [
      { slotId: 'A__english', classId: 'A', normalizedSubject: 'english', subject: 'English', teacherIds: ['t1'], teacherNames: ['Mr Phiri'] },
    ] });
    const msgs = checkProblem(p).map(i => `${i.level}: ${i.message}`);
    expect(msgs).toContain('error: Form 1A needs 43 periods a week but has only 40 free periods.');
    expect(msgs.some(m => m.startsWith('warning: Form 1A Maths has no teacher yet'))).toBe(true);
    // A room needed in every period, but assembly takes Monday P1.
    const cfg2: TimetableConfig = {
      ...EMPTY_CONFIG,
      rooms: [{ id: 'lab', name: 'Lab' }],
      events: [{ id: 'a', name: 'Assembly', days: [1], periods: [1], levels: [] }],
      levels: { 'form-1': { key: 'form-1', label: 'Form 1', subjects: [req('biology', 20, { roomId: 'lab' })] } },
    };
    const p2 = buildProblem({ term: 'Term 1', year: 2027, config: cfg2, classes: [{ id: 'A', name: 'Form 1A', type: 'form', level: 1 }, { id: 'B', name: 'Form 1B', type: 'form', level: 1 }], slots: [] });
    expect(checkProblem(p2).map(i => i.message)).toContain('Lab is needed for 40 periods a week, but only 39 periods are free.');
  });

  it('is ready only when every department has signed off and every level has subjects', () => {
    const cfg: TimetableConfig = { ...EMPTY_CONFIG, levels: { 'form-1': { key: 'form-1', label: 'Form 1', subjects: [req('english', 6), req('maths', 6)] } } };
    const base = {
      config: cfg,
      classes: [{ id: 'A', name: 'Form 1A', type: 'form', level: 1 }, { id: 'B', name: 'Form 2A', type: 'form', level: 2 }],
      ownedSlotIds: new Set(['A__english']),
      departmentOf: (s: string) => (s === 'english' ? 'Languages' : s === 'maths' ? 'Mathematics' : null),
    };
    const r1 = readiness({ ...base, signoffs: [] });
    expect(r1.ready).toBe(false);
    expect(r1.missingLevels).toEqual(['Form 2']);
    expect(r1.vacantTotal).toBe(1);
    expect(r1.departments.map(d => [d.department, d.allocations, d.vacant])).toEqual([['Languages', 1, 0], ['Mathematics', 1, 1]]);

    cfg.levels['form-2'] = { key: 'form-2', label: 'Form 2', subjects: [req('english', 6)] };
    const so = (department: string) => ({ id: department, department, term: 'Term 1' as const, year: 2027, byUid: 'h', byName: 'H', byRole: 'hod' as const, at: null, vacantCount: 0 });
    expect(readiness({ ...base, signoffs: [so('Languages')] }).ready).toBe(false);
    expect(readiness({ ...base, signoffs: [so('Languages'), so('Mathematics')] }).ready).toBe(true);
  });
});

describe('timetable solver', () => {
  it('timetables a 25-class school with no clashes at all', () => {
    const { config, classes, slots } = school();
    const p = buildProblem({ term: 'Term 1', year: 2027, config, classes, slots });
    expect(checkProblem(p).filter(i => i.level === 'error')).toEqual([]);
    const r = solve(p, { seed: 42, maxMillis: 30_000 });
    expect(r.unplaced).toEqual([]);
    expect(r.stats.placedRequired).toBe(r.stats.required);
    expect(hardProblems(p, r.lessons)).toEqual([]);

    // Shapes: each subject gets exactly its doubles, and its periods.
    for (const s of p.slots) {
      const mine = r.lessons.filter(l => l.slotId === s.slotId);
      const periods = mine.reduce((n, l) => n + l.size, 0);
      expect(periods).toBeGreaterThanOrEqual(s.min);
      expect(periods).toBeLessThanOrEqual(s.max);
      expect(mine.filter(l => l.size === 2)).toHaveLength(s.doubles);
      if (s.time === 'morning-only') expect(mine.every(l => l.start + l.size - 1 <= 4)).toBe(true);
    }
    // Assembly (Monday P1) is kept free for everyone.
    expect(r.lessons.some(l => l.day === 1 && l.start === 1)).toBe(false);
    // Rows a class has never exceed 40 - 1 (assembly).
    const perClass = new Map<string, number>();
    for (const l of r.lessons) perClass.set(l.classId, (perClass.get(l.classId) ?? 0) + l.size);
    for (const n of perClass.values()) expect(n).toBeLessThanOrEqual(39);
  }, 60_000);

  it('gives the same timetable for the same seed', () => {
    const { config, classes, slots } = school({ streams: 2 });
    const p = buildProblem({ term: 'Term 1', year: 2027, config, classes, slots });
    const a = solve(p, { seed: 7, improveIterations: 5000 });
    const b = solve(p, { seed: 7, improveIterations: 5000 });
    expect(a.lessons).toEqual(b.lessons);
  });

  it('keeps locked lessons where they are', () => {
    const { config, classes, slots } = school({ streams: 2 });
    const p = buildProblem({ term: 'Term 1', year: 2027, config, classes, slots });
    const locked = [{ slotId: 'F1A__english', classId: 'F1A', day: 3 as const, start: 6, size: 2, locked: true }];
    const r = solve(p, { seed: 3, locked, improveIterations: 5000 });
    expect(r.lessons).toContainEqual(locked[0]);
    expect(hardProblems(p, r.lessons)).toEqual([]);
  });

  it('a teacher shared by two subjects is never in two places', () => {
    const { config, classes, slots } = school({ streams: 2 });
    // One teacher takes Geography and History in every Form 1 class.
    for (const s of slots) if (s.classId.startsWith('F1') && (s.normalizedSubject === 'geography' || s.normalizedSubject === 'history')) s.teacherIds = ['mr-banda'];
    const p = buildProblem({ term: 'Term 1', year: 2027, config, classes, slots });
    const r = solve(p, { seed: 9, improveIterations: 5000 });
    expect(r.unplaced).toEqual([]);
    expect(hardProblems(p, r.lessons)).toEqual([]);
  });

  it('reports what could not be placed, and why', () => {
    const cfg: TimetableConfig = {
      ...EMPTY_CONFIG,
      levels: { 'form-1': { key: 'form-1', label: 'Form 1', subjects: [req('additional-mathematics', 6, { doubles: 3, time: 'morning-only' })] } },
    };
    const classes = ['A', 'B', 'C', 'D', 'E'].map(x => ({ id: x, name: `Form 1${x}`, type: 'form', level: 1 }));
    const slots = classes.map(c => ({ slotId: `${c.id}__additional-mathematics`, classId: c.id, normalizedSubject: 'additional-mathematics', subject: 'Additional Mathematics', teacherIds: ['mrs-mwale'], teacherNames: ['Mrs Mwale'] }));
    const p = buildProblem({ term: 'Term 1', year: 2027, config: cfg, classes, slots });
    // 30 morning periods for one teacher: impossible (20 mornings).
    expect(checkProblem(p).map(i => i.message)).toContain('Mrs Mwale is allocated 30 mornings-only periods, but only 20 morning periods are free.');
    const r = solve(p, { seed: 1, improveIterations: 1000, maxMillis: 3000 });
    expect(r.unplaced.length).toBeGreaterThan(0);
    expect(r.unplaced[0].reason).toMatch(/Mrs Mwale is teaching another class/);
    expect(hardProblems(p, r.lessons)).toEqual([]);
  });

  it('finds clashes in a hand-edited timetable', () => {
    const { config, classes, slots } = school({ streams: 1 });
    const p = buildProblem({ term: 'Term 1', year: 2027, config, classes, slots });
    const probs = hardProblems(p, [
      { slotId: 'F1A__english', classId: 'F1A', day: 2, start: 4, size: 2 },
      { slotId: 'F1A__history', classId: 'F1A', day: 2, start: 4, size: 1 },
    ]);
    expect(probs.map(x => x.kind).sort()).toEqual(['break', 'class']);
  });
});


describe('hand edits', () => {
  const cfg: TimetableConfig = {
    ...EMPTY_CONFIG,
    levels: { 'form-1': { key: 'form-1', label: 'Form 1', subjects: [req('english', 4, { doubles: 1 }), req('maths', 4, { doubles: 1, time: 'morning-only' }), req('history', 2)] } },
    events: [{ id: 'a', name: 'Assembly', days: [1], periods: [1], levels: [] }],
  };
  const classes = [{ id: 'A', name: 'Form 1A', type: 'form', level: 1 }, { id: 'B', name: 'Form 1B', type: 'form', level: 1 }];
  const slots = classes.flatMap(c => [
    { slotId: `${c.id}__english`, classId: c.id, normalizedSubject: 'english', subject: 'English', teacherIds: ['eng'], teacherNames: ['Mrs English'] },
    { slotId: `${c.id}__maths`, classId: c.id, normalizedSubject: 'maths', subject: 'Maths', teacherIds: [`m${c.id}`], teacherNames: ['Mr Maths'] },
    { slotId: `${c.id}__history`, classId: c.id, normalizedSubject: 'history', subject: 'History', teacherIds: ['h'], teacherNames: ['Ms History'] },
  ]);
  const p = buildProblem({ term: 'Term 1', year: 2027, config: cfg, classes, slots });
  const lessons = [
    { slotId: 'A__english', classId: 'A', day: 2 as const, start: 1, size: 2 },
    { slotId: 'B__english', classId: 'B', day: 3 as const, start: 1, size: 2 },
    { slotId: 'A__maths', classId: 'A', day: 3 as const, start: 1, size: 2 },
    { slotId: 'A__history', classId: 'A', day: 4 as const, start: 6, size: 1 },
    { slotId: 'A__english', classId: 'A', day: 4 as const, start: 7, size: 1 },
  ];

  it('offers only places with no clash, and says why the others are refused', () => {
    const t = moveTargets(p, lessons, 0); // A English double, Tue P1–2
    // Wed P1 holds A's Maths double: a swap, refused because Mrs English teaches 1B then.
    expect(t.get('3:1')).toEqual({ ok: false, reason: 'Swap not possible: Mrs English is teaching Form 1B then.' });
    expect(t.get('1:1')).toEqual({ ok: false, reason: 'A school event is on then.' });
    expect(t.get('2:4')).toEqual({ ok: false, reason: 'A lesson cannot run across the break.' });
    expect(t.get('4:5')).toMatchObject({ ok: false, reason: 'The class has another lesson then.' });
    expect(t.get('4:2')).toEqual({ ok: false, reason: 'English is already on Thu.' });
    expect(t.get('5:5')).toEqual({ ok: true });
  });

  it('swaps two lessons of the same length when both fit', () => {
    const t = moveTargets(p, lessons, 3); // A History, Thu P6 ↔ A English single, Thu P7
    expect(t.get('4:7')).toMatchObject({ ok: true, swapWith: 4 });
    const after = applyMove(lessons, 3, 4, 7, t.get('4:7')!);
    expect(after[3]).toMatchObject({ day: 4, start: 7 });
    expect(after[4]).toMatchObject({ day: 4, start: 6 });
    expect(hardProblems(p, after)).toEqual([]);
  });

  it('keeps mornings-only subjects in the morning', () => {
    const t = moveTargets(p, lessons, 2);
    expect(t.get('5:5')).toEqual({ ok: false, reason: 'Maths is mornings only.' });
    expect(t.get('5:1')).toEqual({ ok: true });
  });
});
