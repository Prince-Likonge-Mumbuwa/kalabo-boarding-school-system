import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase/firestore', async () => await import('../../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}), onAuthStateChanged: () => () => {} }));

import {
  assignmentRows,
  curriculumTemplateRows,
  importCurriculum,
  loadCurriculumFromAssignments,
  mapHeader,
  parseTable,
  parseTime,
  toCsv,
  type ImportContext,
} from './curriculumImport';
import { requirementsForClass } from './problem';
import { EMPTY_CONFIG, type TimetableConfig } from './types';

const classes = [
  { id: '1A', name: 'Form 1A', type: 'form', level: 1, isActive: true },
  { id: '1B', name: 'Form 1B', type: 'form', level: 1, isActive: true },
  { id: '1C', name: 'Form 1C', type: 'form', level: 1, isActive: true },
  { id: '10A', name: 'Grade 10A', type: 'grade', level: 10, isActive: true },
  { id: '10B', name: 'Grade 10B', type: 'grade', level: 10, isActive: true },
  { id: 'OLD', name: 'Form 1Z', type: 'form', level: 1, isActive: false },
];
const subjectNames = { Mathematics: 'Mathematics', English: 'English', Chemistry: 'Chemistry', 'Additional Mathematics': 'Additional Mathematics', French: 'French' };
const cfg = (over: Partial<TimetableConfig> = {}): TimetableConfig => ({ ...structuredClone(EMPTY_CONFIG), ...over });
const ctx = (config = cfg()): ImportContext => ({ config, classes, subjectNames });
const csv = (s: string) => parseTable(s.trim());
const english6 = { normalizedSubject: 'English', subject: 'English', min: 6, max: 6, doubles: 1, triples: 0, time: 'any' as const, notLast: false, roomId: null };

describe('parseTable', () => {
  it('reads CSV with quotes, CRLF and a BOM', () => {
    expect(parseTable('﻿a,b,c\r\n"x, y","say ""hi""",3\r\n\r\n')).toEqual([['a', 'b', 'c'], ['x, y', 'say "hi"', '3']]);
  });
  it('reads rows pasted from Excel (tabs) and semicolon CSV', () => {
    expect(parseTable('Class\tSubject\nForm 1\tEnglish')).toEqual([['Class', 'Subject'], ['Form 1', 'English']]);
    expect(parseTable('Class;Subject;Periods\nForm 1;English;6')).toEqual([['Class', 'Subject', 'Periods'], ['Form 1', 'English', '6']]);
  });
  it('round-trips through toCsv', () => {
    const rows = [['Class / Level', 'Subject'], ['Form 1A', 'Art, Design'], ['Form 1B', 'He said "no"']];
    expect(parseTable(toCsv(rows))).toEqual(rows);
  });
});

describe('headers and values', () => {
  it('recognises common column names', () => {
    expect(mapHeader(['Class / Level', 'Subject', 'Periods per week', 'Max', 'Double', 'Triples', 'Time of day', 'Not P8', 'Special room', 'Taken', 'Teacher']))
      .toEqual(['target', 'subject', 'min', 'max', 'doubles', 'triples', 'time', 'notLast', 'room', 'taken', null]);
  });
  it('reads time of day', () => {
    expect(parseTime('')).toBe('any');
    expect(parseTime('Mornings only (P1–P4)')).toBe('morning-only');
    expect(parseTime('prefer mornings')).toBe('prefer-morning');
    expect(parseTime('evening')).toBeNull();
  });
});

describe('importCurriculum', () => {
  it('a level row applies to every class of the level; a class row makes an exception', () => {
    const r = importCurriculum(csv(`
Class / Level,Subject,Periods,Most,Doubles,Triples,Time of day,Not P8,Room,Taken
Form 1,English,6,,1,,,,,
Form 1,Maths,5,6,1,,Mornings only,Yes,,
Form 1B,English,5,,1,,,,,
Form 1C,Maths,,,,,,,,No
`), ctx());
    expect(r.errors).toEqual([]);
    expect(r.rowsUsed).toBe(4);
    const lv = r.config.levels['form-1'];
    expect(lv.label).toBe('Form 1');
    expect(lv.subjects).toEqual([
      { normalizedSubject: 'English', subject: 'English', min: 6, max: 6, doubles: 1, triples: 0, time: 'any', notLast: false, roomId: null },
      { normalizedSubject: 'Mathematics', subject: 'Mathematics', min: 5, max: 6, doubles: 1, triples: 0, time: 'morning-only', notLast: true, roomId: null },
    ]);
    expect(r.config.exceptions).toEqual([
      { classId: '1B', normalizedSubject: 'English', min: 5, max: 5, doubles: 1, triples: 0 },
      { classId: '1C', normalizedSubject: 'Mathematics', excluded: true },
    ]);
    // Form 1A follows the level.
    expect(requirementsForClass(r.config, '1A', 'form-1').map(x => [x.subject, x.min])).toEqual([['English', 6], ['Mathematics', 5]]);
    expect(requirementsForClass(r.config, '1C', 'form-1').map(x => x.subject)).toEqual(['English']);
    expect(r.levels).toEqual([{ key: 'form-1', label: 'Form 1', subjects: 2, classes: 3, exceptions: 2 }]);
  });

  it('class-by-class rows: the level takes the most common setting, other classes do not take class-only subjects', () => {
    const r = importCurriculum(csv(`
Class,Subject,Periods,Doubles
Grade 10A,English,6,1
Grade 10B,English,6,1
Grade 10A,Chemistry,5,1
Grade 10B,French,4,0
`), ctx());
    expect(r.errors).toEqual([]);
    const lv = r.config.levels['grade-10'];
    expect(lv.subjects.map(s => [s.subject, s.min, s.doubles])).toEqual([['Chemistry', 5, 1], ['English', 6, 1], ['French', 4, 0]]);
    expect(requirementsForClass(r.config, '10A', 'grade-10').map(x => x.subject)).toEqual(['Chemistry', 'English']);
    expect(requirementsForClass(r.config, '10B', 'grade-10').map(x => x.subject)).toEqual(['English', 'French']);
  });

  it('warns about a class of the level left out of a class-by-class file', () => {
    const r = importCurriculum(csv(`
Class,Subject,Periods
Form 1A,English,6
Form 1B,English,6
`), ctx());
    expect(r.warnings.some(w => w.includes('Form 1C is not in the file'))).toBe(true);
    expect(requirementsForClass(r.config, '1C', 'form-1')).toEqual([]);
  });

  it('skips bad rows and says which line and why', () => {
    const r = importCurriculum(csv(`
Class / Level,Subject,Periods,Doubles,Time of day,Not P8,Taken
Form 9,English,6,,,,
Form 1,,6,,,,
Form 1,English,,,,,
Form 1,English,two,,,,
Form 1,English,3,2,,,
Form 1,English,6,,evening,,
Form 1,English,6,,,maybe,
Form 1,English,6,,,,perhaps
Form 1,English,6,1,,,
`), ctx());
    // Line 4 (no Periods) is fine: the subject gets the default setting.
    expect(r.errors.map(e => e.line)).toEqual([2, 3, 5, 6, 7, 8, 9]);
    expect(r.errors[0].message).toMatch(/"Form 9" is not an active class or a level/);
    expect(r.errors[3].message).toMatch(/doubles and triples need more periods/);
    expect(r.rowsUsed).toBe(1); // line 10 replaces line 4 (same subject)
    expect(r.config.levels['form-1'].subjects).toHaveLength(1);
  });

  it('ignores inactive classes', () => {
    const r = importCurriculum(csv('Class,Subject,Periods\nForm 1Z,English,6'), ctx());
    expect(r.errors[0].message).toMatch(/not an active class/);
  });

  it('refuses a file without the needed headings', () => {
    const r = importCurriculum(csv('Name,Lessons\nForm 1,English'), ctx());
    expect(r.errors[0]).toEqual({ line: 1, message: 'The first row must be the column headings. Missing: Class, Subject.' });
    expect(r.config).toEqual(ctx().config);
  });

  it('matches existing rooms by name and adds new ones', () => {
    const base = cfg({ rooms: [{ id: 'lab', name: 'Science Lab' }] });
    const r = importCurriculum(csv(`
Class,Subject,Periods,Room
Grade 10,Chemistry,5,science lab
Grade 10,ICT,4,Computer Room
`), ctx(base));
    const subj = Object.fromEntries(r.config.levels['grade-10'].subjects.map(s => [s.subject, s.roomId]));
    expect(subj.Chemistry).toBe('lab');
    const comp = r.config.rooms.find(x => x.name === 'Computer Room')!;
    expect(subj.ICT).toBe(comp.id);
    expect(r.newRooms).toEqual(['Computer Room']);
  });

  it('flags subjects no class has a teacher for yet', () => {
    const r = importCurriculum(csv('Class,Subject,Periods\nForm 1,Latin,3'), ctx());
    expect(r.config.levels['form-1'].subjects[0]).toMatchObject({ normalizedSubject: 'Latin', min: 3 });
    expect(r.warnings.some(w => w.includes('No class has a teacher for Latin'))).toBe(true);
  });

  it('replace keeps levels not in the file; merge keeps the level\'s other subjects', () => {
    const base = cfg({
      levels: {
        'form-1': { key: 'form-1', label: 'Form 1', subjects: [{ normalizedSubject: 'French', subject: 'French', min: 3, max: 3, doubles: 0, triples: 0, time: 'any', notLast: false, roomId: null }] },
        'grade-10': { key: 'grade-10', label: 'Grade 10', subjects: [{ normalizedSubject: 'English', subject: 'English', min: 6, max: 6, doubles: 0, triples: 0, time: 'any', notLast: false, roomId: null }] },
      },
      exceptions: [
        { classId: '1A', normalizedSubject: 'French', excluded: true },
        { classId: '10A', normalizedSubject: 'English', min: 5 },
      ],
    });
    const rows = csv('Class,Subject,Periods\nForm 1,English,6');
    const rep = importCurriculum(rows, ctx(base), 'replace');
    expect(rep.config.levels['form-1'].subjects.map(s => s.subject)).toEqual(['English']);
    expect(rep.config.levels['grade-10']).toEqual(base.levels['grade-10']);
    expect(rep.config.exceptions).toEqual([{ classId: '10A', normalizedSubject: 'English', min: 5 }]);

    const mer = importCurriculum(rows, ctx(base), 'merge');
    expect(mer.config.levels['form-1'].subjects.map(s => s.subject)).toEqual(['English', 'French']);
    expect(mer.config.exceptions).toEqual(base.exceptions);
    // The original is never changed.
    expect(base.levels['form-1'].subjects).toHaveLength(1);
  });

  it('a later duplicate row wins, with a note', () => {
    const r = importCurriculum(csv('Class,Subject,Periods\nForm 1,English,6\nForm 1,English,5'), ctx());
    expect(r.config.levels['form-1'].subjects[0].min).toBe(5);
    expect(r.warnings.some(w => w.startsWith('Line 3:'))).toBe(true);
  });
});

describe('only Class and Subject', () => {
  it('needs only the two columns; new subjects start at the default setting', () => {
    const r = importCurriculum(csv('Class,Subject\nForm 1A,English\nForm 1B,English\nForm 1C,English\nForm 1A,French'), ctx());
    expect(r.errors).toEqual([]);
    expect(r.config.levels['form-1'].subjects).toEqual([
      { normalizedSubject: 'English', subject: 'English', min: 4, max: 4, doubles: 0, triples: 0, time: 'any', notLast: false, roomId: null },
      { normalizedSubject: 'French', subject: 'French', min: 4, max: 4, doubles: 0, triples: 0, time: 'any', notLast: false, roomId: null },
    ]);
    expect(requirementsForClass(r.config, '1B', 'form-1').map(x => x.subject)).toEqual(['English']);
  });

  it('keeps the periods a subject already has, for the level and for a class exception', () => {
    const base = cfg({
      levels: { 'form-1': { key: 'form-1', label: 'Form 1', subjects: [english6] } },
      exceptions: [{ classId: '1B', normalizedSubject: 'English', min: 5, max: 5 }],
    });
    const r = importCurriculum(csv('Class,Subject\nForm 1A,English\nForm 1B,English\nForm 1C,English'), ctx(base));
    expect(r.config.levels['form-1'].subjects).toEqual([english6]);
    expect(r.config.exceptions).toEqual([{ classId: '1B', normalizedSubject: 'English', min: 5, max: 5, doubles: 1, triples: 0 }]);
  });
});

describe('loadCurriculumFromAssignments', () => {
  const a = (classId: string, subject: string, teacher = 't1') => ({ classId, normalizedSubject: subject, subject, teacherIds: teacher ? [teacher] : [] });

  it('rows for active classes with a teacher; vacant assignments are counted', () => {
    const { rows, vacant } = assignmentRows(classes, [a('1A', 'English'), a('1A', 'Mathematics'), a('1B', 'English', ''), a('OLD', 'English')]);
    expect(rows).toEqual([['Class', 'Subject'], ['Form 1A', 'English'], ['Form 1A', 'Mathematics']]);
    expect(vacant).toBe(1);
  });

  it('each class takes the subjects it has teachers for; levels without assignments are untouched', () => {
    const base = cfg({
      levels: {
        'form-1': { key: 'form-1', label: 'Form 1', subjects: [english6] },
        'grade-10': { key: 'grade-10', label: 'Grade 10', subjects: [{ ...english6, min: 7, max: 7 }] },
      },
    });
    const r = loadCurriculumFromAssignments(ctx(base), [
      a('1A', 'English'), a('1B', 'English'), a('1C', 'English'),
      a('1A', 'French'), a('1C', 'Mathematics', ''),
    ]);
    expect(r.errors).toEqual([]);
    expect(r.vacant).toBe(1);
    expect(r.config.levels['form-1'].subjects.map(s => [s.subject, s.min])).toEqual([['English', 6], ['French', 4]]);
    expect(requirementsForClass(r.config, '1A', 'form-1').map(x => x.subject)).toEqual(['English', 'French']);
    expect(requirementsForClass(r.config, '1C', 'form-1').map(x => x.subject)).toEqual(['English']);
    expect(r.config.levels['grade-10']).toEqual(base.levels['grade-10']);
    expect(r.warnings.some(w => w.includes('1 class assignment has no teacher'))).toBe(true);
  });

  it('says so when there are no assignments', () => {
    const r = loadCurriculumFromAssignments(ctx(), []);
    expect(r.rowsUsed).toBe(0);
    expect(r.config).toEqual(ctx().config);
  });
});

describe('curriculumTemplateRows', () => {
  it('exports the class allocation, and re-importing it gives the same curriculum', () => {
    const first = importCurriculum(csv(`
Class / Level,Subject,Periods,Most,Doubles,Time of day,Not P8,Room,Taken
Form 1,English,6,7,1,,,,
Form 1,Mathematics,5,,1,Mornings only,Yes,Maths Room,
Form 1B,English,5,,1,,,,
Form 1C,Mathematics,,,,,,,No
`), ctx());
    const rows = curriculumTemplateRows({ ...ctx(first.config), slots: [{ classId: '10A', normalizedSubject: 'Chemistry', subject: 'Chemistry' }] });
    expect(rows[0]).toEqual(['Class', 'Subject']);
    expect(rows).toContainEqual(['Form 1A', 'Mathematics']);
    expect(rows).not.toContainEqual(['Form 1C', 'Mathematics']);
    expect(rows).toContainEqual(['Grade 10A', 'Chemistry']);

    // Re-import Form 1 only.
    const form1 = rows.filter((r, i) => i === 0 || r[0].startsWith('Form'));
    const again = importCurriculum(parseTable(toCsv(form1)), ctx(first.config));
    expect(again.errors).toEqual([]);
    for (const id of ['1A', '1B', '1C']) {
      expect(requirementsForClass(again.config, id, 'form-1')).toEqual(requirementsForClass(first.config, id, 'form-1'));
    }
  });
});
