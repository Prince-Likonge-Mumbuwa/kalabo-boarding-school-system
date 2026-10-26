// @/services/timetableGenerator/curriculumImport.ts
//
// Bulk import of the curriculum (class allocation) from a spreadsheet:
// a CSV file, or rows pasted from Excel / Google Sheets.
//
// One row per class (or level) and subject:
//
//   Class / Level | Subject | Periods | Most | Doubles | Triples | Time of day | Not P8 | Room | Taken
//   Form 1A       | English | 6       |      | 1       |         |             |        |      |
//   Grade 10      | Chemistry | 5     | 6    | 1       |         | Prefer mornings | Yes | Science Lab |
//
// Only Class / Level, Subject and Periods are required. A row may name a
// class ("Form 1A", "10B") or a whole level ("Form 1", "Grade 10").
//
// How rows become the curriculum (levels' subjects + class exceptions):
// - A level row sets the subject for the whole level. Every class of the
//   level takes it, unless a class row for that class says Taken = No or
//   gives different numbers (then the class gets an exception).
// - A subject given only in class rows is taken only by the classes listed.
//   The level gets the setting most of those classes have; a listed class
//   with different numbers gets an exception, and the other classes of the
//   level are marked "Not taken".
// - "Replace" (default) replaces the subjects and exceptions of every level
//   in the file; levels not in the file are untouched. "Update" keeps the
//   level's other subjects and only adds or changes those in the file.
//
// Nothing here talks to Firestore: the result is a new TimetableConfig that
// the Curriculum tab shows as unsaved changes, to review and save.

import { normalizeSubjectName } from '@/services/resultsService';
import {
  activeClasses,
  compareLevels,
  levelKeyOf,
  levelLabel,
  requirementProblems,
  requirementsForClass,
  type ClassLike,
} from './problem';
import {
  TIME_LABEL,
  type ClassException,
  type Room,
  type SubjectRequirement,
  type TimePreference,
  type TimetableConfig,
} from './types';

// ==================== TABLE PARSING ====================

/** Split CSV / TSV text into rows of cells (quotes, CRLF, BOM handled). */
export function parseTable(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/).find(l => l.trim() !== '') ?? '';
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delim = count('\t') > 0 ? '\t' : count(';') > count(',') ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => c !== ''));
}

/** Text for a CSV file (quoted where needed, with a BOM so Excel reads UTF-8). */
export function toCsv(rows: Array<Array<string | number>>): string {
  const q = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
}

// ==================== COLUMNS ====================

export type Column = 'target' | 'subject' | 'min' | 'max' | 'doubles' | 'triples' | 'time' | 'notLast' | 'room' | 'taken';

export const TEMPLATE_HEADER = ['Class / Level', 'Subject', 'Periods', 'Most', 'Doubles', 'Triples', 'Time of day', 'Not P8', 'Room', 'Taken'];

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

const ALIASES: Record<Column, string[]> = {
  target: ['classlevel', 'classorlevel', 'class', 'level', 'classname', 'form', 'grade', 'stream'],
  subject: ['subject', 'subjectname'],
  min: ['periods', 'fewest', 'min', 'minimum', 'periodsaweek', 'periodsperweek', 'fewestperiods', 'lessons', 'lessonsaweek'],
  max: ['most', 'max', 'maximum', 'mostperiods'],
  doubles: ['doubles', 'double', 'doubleperiods'],
  triples: ['triples', 'triple', 'tripleperiods'],
  time: ['timeofday', 'time'],
  notLast: ['notp8', 'avoidp8', 'notlast', 'notlastperiod', 'nop8'],
  room: ['room', 'specialroom'],
  taken: ['taken', 'takes', 'takessubject'],
};

/** Which column each header cell is (null = ignored). */
export function mapHeader(header: string[]): Array<Column | null> {
  const used = new Set<Column>();
  return header.map(h => {
    const k = squash(h);
    const col = (Object.keys(ALIASES) as Column[]).find(c => !used.has(c) && ALIASES[c].includes(k)) ?? null;
    if (col) used.add(col);
    return col;
  });
}

// ==================== VALUES ====================

const intCell = (v: string, label: string): number | string => {
  if (v === '') return 0;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 12) return `${label} must be a whole number from 0 to 12 (got "${v}")`;
  return n;
};

export function parseTime(v: string): TimePreference | null {
  const s = v.toLowerCase().trim();
  if (!s || s === 'any' || s === 'anytime' || s === 'any time') return 'any';
  if (s.includes('only')) return 'morning-only';
  if (s.includes('prefer') || s.includes('morning') || s === 'am') return 'prefer-morning';
  return null;
}

const YES = new Set(['yes', 'y', 'true', '1', 'x', '✓', '✔']);
const NO = new Set(['no', 'n', 'false', '0', '', '-']);
function parseYesNo(v: string): boolean | null {
  const s = v.toLowerCase().trim();
  if (YES.has(s)) return true;
  if (NO.has(s)) return false;
  return null;
}
function parseTaken(v: string): boolean | null {
  const s = v.toLowerCase().trim();
  if (s === '' || YES.has(s) || s === 'taken') return true;
  if (NO.has(s) || s === 'not taken' || s === 'nottaken') return false;
  return null;
}

// ==================== IMPORT ====================

export type ImportMode = 'replace' | 'merge';

export interface ImportContext {
  config: TimetableConfig;
  classes: ClassLike[];
  /** normalizedSubject → display name (subjects classes already have). */
  subjectNames: Record<string, string>;
}

export interface RowMessage {
  /** Line number in the file (the header is line 1). */
  line: number;
  message: string;
}

export interface LevelSummary {
  key: string;
  label: string;
  subjects: number;
  classes: number;
  exceptions: number;
}

export interface ImportResult {
  config: TimetableConfig;
  rowsRead: number;
  rowsUsed: number;
  errors: RowMessage[];
  warnings: string[];
  levels: LevelSummary[];
  newRooms: string[];
}

interface ParsedRow {
  line: number;
  kind: 'class' | 'level';
  classId: string | null;
  levelKey: string;
  req: SubjectRequirement;
  taken: boolean;
}

const newRoomId = () => Math.random().toString(36).slice(2, 9);
const countsKey = (r: Pick<SubjectRequirement, 'min' | 'max' | 'doubles' | 'triples'>) => `${r.min}|${r.max}|${r.doubles}|${r.triples}`;
const sameCounts = (a: SubjectRequirement, b: SubjectRequirement) => countsKey(a) === countsKey(b);

/** The level a cell names: "Form 1", "Grade 10", "F1", "G10". */
function levelKeyFromText(v: string): string | null {
  const m = /^\s*(form|grade|f|g)\s*(\d+)\s*$/i.exec(v);
  if (!m) return null;
  const t = m[1].toLowerCase();
  return `${t === 'f' || t === 'form' ? 'form' : 'grade'}-${Number(m[2])}`;
}

/** Turn the rows of a spreadsheet into a new curriculum. */
export function importCurriculum(table: string[][], ctx: ImportContext, mode: ImportMode = 'replace'): ImportResult {
  const errors: RowMessage[] = [];
  const warnings: string[] = [];
  const cfg = structuredClone(ctx.config);
  const empty = (): ImportResult => ({ config: ctx.config, rowsRead: 0, rowsUsed: 0, errors, warnings, levels: [], newRooms: [] });

  if (table.length === 0) {
    errors.push({ line: 1, message: 'The file is empty.' });
    return empty();
  }
  const cols = mapHeader(table[0]);
  const at = (c: Column) => cols.indexOf(c);
  const missing = (['target', 'subject', 'min'] as Column[]).filter(c => at(c) < 0);
  if (missing.length) {
    const names = { target: 'Class / Level', subject: 'Subject', min: 'Periods' } as Record<string, string>;
    errors.push({ line: 1, message: `The first row must be the column headings. Missing: ${missing.map(c => names[c]).join(', ')}.` });
    return empty();
  }
  const ignored = table[0].filter((h, i) => cols[i] === null && h.trim() !== '');
  if (ignored.length) warnings.push(`Columns not used: ${ignored.join(', ')}.`);

  // ---- classes, levels, subjects, rooms we can match against
  const classes = activeClasses(ctx.classes);
  const classByKey = new Map<string, ClassLike>();
  for (const c of classes) classByKey.set(squash(c.name), c);
  const knownLevels = new Set([...classes.map(levelKeyOf), ...Object.keys(cfg.levels)]);
  const levelByLabel = new Map<string, string>();
  for (const k of knownLevels) {
    levelByLabel.set(squash(levelLabel(k)), k);
    const lbl = cfg.levels[k]?.label;
    if (lbl) levelByLabel.set(squash(lbl), k);
  }

  const subjectByKey = new Map<string, { normalizedSubject: string; subject: string }>();
  const addSubject = (normalizedSubject: string, subject: string) => {
    for (const k of [squash(normalizedSubject), squash(subject)]) if (k && !subjectByKey.has(k)) subjectByKey.set(k, { normalizedSubject, subject });
  };
  for (const [n, s] of Object.entries(ctx.subjectNames)) addSubject(n, s);
  for (const l of Object.values(cfg.levels)) for (const s of l.subjects) addSubject(s.normalizedSubject, s.subject);
  const unknownSubjects = new Set<string>();

  const roomByKey = new Map<string, Room>();
  for (const r of cfg.rooms) roomByKey.set(squash(r.name), r);
  const newRooms: string[] = [];

  // ---- read the rows
  const rows: ParsedRow[] = [];
  const seen = new Map<string, number>();
  for (let i = 1; i < table.length; i++) {
    const line = i + 1;
    const cell = (c: Column) => (at(c) >= 0 ? (table[i][at(c)] ?? '').trim() : '');
    const fail = (message: string) => errors.push({ line, message });

    const targetText = cell('target');
    const subjectText = cell('subject');
    if (!targetText) { fail('Class / Level is empty.'); continue; }
    if (!subjectText) { fail('Subject is empty.'); continue; }

    // Class first (exact name), then level.
    let kind: 'class' | 'level';
    let classId: string | null = null;
    let levelKey: string;
    const cls = classByKey.get(squash(targetText));
    if (cls) {
      kind = 'class';
      classId = cls.id;
      levelKey = levelKeyOf(cls);
    } else {
      const lk = levelByLabel.get(squash(targetText)) ?? levelKeyFromText(targetText);
      if (!lk || !knownLevels.has(lk)) { fail(`"${targetText}" is not an active class or a level of the school.`); continue; }
      kind = 'level';
      levelKey = lk;
    }

    // Subject
    const normalizedInput = normalizeSubjectName(subjectText);
    const match = subjectByKey.get(squash(subjectText)) ?? subjectByKey.get(squash(normalizedInput));
    let normalizedSubject: string;
    let subject: string;
    if (match) ({ normalizedSubject, subject } = match);
    else {
      normalizedSubject = normalizedInput;
      subject = normalizedInput;
      addSubject(normalizedSubject, subject);
      unknownSubjects.add(subject);
    }

    // Taken?
    const taken = parseTaken(cell('taken'));
    if (taken === null) { fail(`Taken must be Yes or No (got "${cell('taken')}").`); continue; }

    // Numbers
    const minRaw = cell('min');
    if (taken && minRaw === '') { fail(`Periods is empty for ${subject}.`); continue; }
    const nums = {
      min: intCell(minRaw, 'Periods'),
      max: intCell(cell('max'), 'Most'),
      doubles: intCell(cell('doubles'), 'Doubles'),
      triples: intCell(cell('triples'), 'Triples'),
    };
    const bad = Object.values(nums).find(v => typeof v === 'string') as string | undefined;
    if (bad) { fail(bad); continue; }
    const min = nums.min as number;
    const max = cell('max') === '' ? min : (nums.max as number);

    const time = parseTime(cell('time'));
    if (!time) { fail(`Time of day must be ${Object.values(TIME_LABEL).join(', ')} (got "${cell('time')}").`); continue; }
    const notLast = parseYesNo(cell('notLast'));
    if (notLast === null) { fail(`Not P8 must be Yes or No (got "${cell('notLast')}").`); continue; }

    let roomId: string | null = null;
    const roomText = cell('room');
    if (roomText && !/^(own|own classroom|none|-)$/i.test(roomText)) {
      let room = roomByKey.get(squash(roomText));
      if (!room) {
        room = { id: newRoomId(), name: roomText };
        roomByKey.set(squash(roomText), room);
        cfg.rooms.push(room);
        newRooms.push(roomText);
      }
      roomId = room.id;
    }

    const req: SubjectRequirement = { normalizedSubject, subject, min, max, doubles: nums.doubles as number, triples: nums.triples as number, time, notLast, roomId };
    if (taken) {
      const probs = requirementProblems(req);
      if (probs.length) { fail(`${targetText} ${subject}: ${probs.join('; ')}.`); continue; }
    }

    const key = `${classId ?? levelKey}|${normalizedSubject}`;
    if (seen.has(key)) {
      warnings.push(`Line ${line}: ${targetText} ${subject} is also on line ${seen.get(key)}; line ${line} is used.`);
      const k = rows.findIndex(r => `${r.classId ?? r.levelKey}|${r.req.normalizedSubject}` === key);
      if (k >= 0) rows.splice(k, 1);
    }
    seen.set(key, line);
    rows.push({ line, kind, classId, levelKey, req, taken });
  }

  if (unknownSubjects.size) {
    warnings.push(`No class has a teacher for ${[...unknownSubjects].sort().join(', ')} yet. They are added to the curriculum; give them teachers in Allocations.`);
  }

  // ---- build each level in the file
  const touched = [...new Set(rows.map(r => r.levelKey))].sort(compareLevels);
  const summaries: LevelSummary[] = [];
  for (const lk of touched) {
    const levelClasses = classes.filter(c => levelKeyOf(c) === lk);
    const classIds = new Set(levelClasses.map(c => c.id));
    const lvRows = rows.filter(r => r.levelKey === lk && r.kind === 'level');
    const clRows = rows.filter(r => r.levelKey === lk && r.kind === 'class');

    // Subjects of the level from the file, and how each is set.
    const fileSubjects = new Map<string, { base: SubjectRequirement; fromLevel: boolean }>();
    for (const r of lvRows) {
      if (!r.taken) {
        warnings.push(`Line ${r.line}: Taken = No on a whole level is ignored; leave ${r.req.subject} out of ${levelLabel(lk)} instead.`);
        continue;
      }
      fileSubjects.set(r.req.normalizedSubject, { base: r.req, fromLevel: true });
    }
    const bySubject = new Map<string, ParsedRow[]>();
    for (const r of clRows) {
      const list = bySubject.get(r.req.normalizedSubject) ?? [];
      list.push(r);
      bySubject.set(r.req.normalizedSubject, list);
    }
    for (const [subj, list] of bySubject) {
      if (fileSubjects.has(subj)) continue;
      const takers = list.filter(r => r.taken);
      if (!takers.length) {
        // Only "Taken = No" rows: keep an existing level subject (merge), else nothing to add.
        const existing = cfg.levels[lk]?.subjects.find(s => s.normalizedSubject === subj);
        if (existing && mode === 'merge') fileSubjects.set(subj, { base: existing, fromLevel: true });
        continue;
      }
      // The setting most of the classes have.
      const tally = new Map<string, { n: number; r: SubjectRequirement }>();
      for (const t of takers) {
        const k = `${countsKey(t.req)}|${t.req.time}|${t.req.notLast}|${t.req.roomId ?? ''}`;
        const e = tally.get(k);
        if (e) e.n++;
        else tally.set(k, { n: 1, r: t.req });
      }
      const base = [...tally.values()].sort((a, b) => b.n - a.n)[0].r;
      fileSubjects.set(subj, { base: { ...base }, fromLevel: false });
    }

    // Level subjects
    const prevSubjects = cfg.levels[lk]?.subjects ?? [];
    let subjects: SubjectRequirement[];
    if (mode === 'merge') {
      subjects = prevSubjects.filter(s => !fileSubjects.has(s.normalizedSubject)).concat([...fileSubjects.values()].map(v => v.base));
    } else {
      subjects = [...fileSubjects.values()].map(v => v.base);
    }
    subjects.sort((a, b) => a.subject.localeCompare(b.subject));
    cfg.levels[lk] = { key: lk, label: cfg.levels[lk]?.label || levelLabel(lk), subjects };

    // Exceptions: drop the old ones the file now decides, then add the new ones.
    const decided = (e: ClassException) =>
      classIds.has(e.classId) && (mode === 'replace' || fileSubjects.has(e.normalizedSubject) || !subjects.some(s => s.normalizedSubject === e.normalizedSubject));
    cfg.exceptions = cfg.exceptions.filter(e => !decided(e));

    const listedClasses = new Set(clRows.map(r => r.classId!));
    const rowOf = new Map(clRows.map(r => [`${r.classId}|${r.req.normalizedSubject}`, r]));
    let exCount = 0;
    for (const [subj, { base, fromLevel }] of fileSubjects) {
      for (const c of levelClasses) {
        const r = rowOf.get(`${c.id}|${subj}`);
        let ex: ClassException | null = null;
        if (r && !r.taken) ex = { classId: c.id, normalizedSubject: subj, excluded: true };
        else if (r) {
          if (!sameCounts(r.req, base)) ex = { classId: c.id, normalizedSubject: subj, min: r.req.min, max: r.req.max, doubles: r.req.doubles, triples: r.req.triples };
          if (r.req.time !== base.time || !!r.req.notLast !== !!base.notLast || (r.req.roomId ?? null) !== (base.roomId ?? null)) {
            warnings.push(`Line ${r.line}: ${c.name} ${base.subject} — time of day, Not P8 and room are set per level; the level's setting is used.`);
          }
        } else if (!fromLevel) ex = { classId: c.id, normalizedSubject: subj, excluded: true };
        if (ex) {
          cfg.exceptions.push(ex);
          exCount++;
        }
      }
    }
    if (mode === 'merge') exCount = cfg.exceptions.filter(e => classIds.has(e.classId)).length;

    // A class of the level left out of a class-by-class file takes none of
    // the class-only subjects: say so, it is usually a forgotten class.
    const classOnly = [...fileSubjects.values()].filter(v => !v.fromLevel);
    if (classOnly.length) {
      const left = levelClasses.filter(c => !listedClasses.has(c.id)).map(c => c.name);
      if (left.length) warnings.push(`${left.join(', ')} ${left.length === 1 ? 'is' : 'are'} not in the file, so ${left.length === 1 ? 'it takes' : 'they take'} none of the ${levelLabel(lk)} subjects listed class by class.`);
    }

    summaries.push({ key: lk, label: cfg.levels[lk].label, subjects: subjects.length, classes: levelClasses.length, exceptions: exCount });
  }

  return {
    config: cfg,
    rowsRead: table.length - 1,
    rowsUsed: rows.length,
    errors,
    warnings,
    levels: summaries,
    newRooms,
  };
}

// ==================== TEMPLATE ====================

/**
 * The current curriculum as rows, one per class and subject (class
 * allocation). Classes whose level has no curriculum yet list the subjects
 * they have teachers for, with Periods left blank to fill in.
 */
export function curriculumTemplateRows(ctx: ImportContext & { slots: Array<{ classId: string; normalizedSubject: string; subject: string }> }): string[][] {
  const rows: string[][] = [TEMPLATE_HEADER];
  const roomName = (id: string | null | undefined) => (id ? ctx.config.rooms.find(r => r.id === id)?.name ?? '' : '');
  const timeText = (t: TimePreference) => (t === 'any' ? '' : t === 'morning-only' ? 'Mornings only' : 'Prefer mornings');
  const classes = activeClasses(ctx.classes).sort((a, b) => compareLevels(levelKeyOf(a), levelKeyOf(b)) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const c of classes) {
    const lk = levelKeyOf(c);
    const level = ctx.config.levels[lk];
    if (level?.subjects.length) {
      const reqs = new Map(requirementsForClass(ctx.config, c.id, lk).map(r => [r.normalizedSubject, r]));
      for (const s of level.subjects) {
        const r = reqs.get(s.normalizedSubject);
        if (!r) {
          rows.push([c.name, s.subject, '', '', '', '', '', '', '', 'No']);
          continue;
        }
        rows.push([
          c.name,
          r.subject,
          String(r.min),
          r.max !== r.min ? String(r.max) : '',
          r.doubles ? String(r.doubles) : '',
          r.triples ? String(r.triples) : '',
          timeText(r.time),
          r.notLast ? 'Yes' : '',
          roomName(r.roomId),
          '',
        ]);
      }
      // Subjects the class has teachers for that are not in the curriculum yet.
      for (const sl of ctx.slots.filter(x => x.classId === c.id && !level.subjects.some(s => s.normalizedSubject === x.normalizedSubject))) {
        rows.push([c.name, sl.subject, '', '', '', '', '', '', '', '']);
      }
    } else {
      const taught = ctx.slots.filter(x => x.classId === c.id).sort((a, b) => a.subject.localeCompare(b.subject));
      for (const sl of taught) rows.push([c.name, sl.subject, '', '', '', '', '', '', '', '']);
    }
  }
  return rows;
}
