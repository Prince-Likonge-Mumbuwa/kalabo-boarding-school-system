// @/services/auditService.ts — reading the audit trail (Admin → Audit trail).
//
// Two sources, shown together in time order:
//   audit_log   every change made in the app (client/lib/auditedFirestore.ts)
//               and sign-in / sign-out / session expiry
//   face_audit  face recognition actions done on the server (consent,
//               faces added / removed, scans, clean-ups)
import { collection, getDocs, limit, orderBy, query, startAfter, where, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AuditOp } from '@/lib/auditedFirestore';

export interface AuditRow {
  id: string;
  source: 'app' | 'face';
  at: Date;
  actorId: string;
  actorName: string;
  actorRole: string;
  page?: string;
  ops: AuditOp[];
  /** Readable areas (Learners, Results…). */
  areas: string[];
  summary: string;
}

/** Collection → [area, singular, plural]. */
const NOUNS: Record<string, [string, string, string]> = {
  learners: ['Learners', 'learner', 'learners'],
  users: ['Staff', 'staff record', 'staff records'],
  teachers: ['Staff', 'staff record', 'staff records'],
  classes: ['Classes', 'class', 'classes'],
  results: ['Results', 'result', 'results'],
  attendance_sessions: ['Attendance', 'register', 'registers'],
  attendance: ['Attendance', 'attendance record', 'attendance records'],
  class_slots: ['Class assignments', 'class allocation', 'class allocations'],
  teacher_assignments: ['Class assignments', 'teaching assignment', 'teaching assignments'],
  assignment_events: ['Class assignments', 'assignment history entry', 'assignment history entries'],
  staff_roles: ['Staff roles', 'staff role', 'staff roles'],
  system: ['Settings', 'setting', 'settings'],
  admissions: ['Admissions', 'admission', 'admissions'],
  admission_settings: ['Admissions', 'admission setting', 'admission settings'],
  enrollments: ['Year transition', 'enrolment record', 'enrolment records'],
  promotion_runs: ['Year transition', 'year transition', 'year transition records'],
  promotion_run_items: ['Year transition', 'year transition list', 'year transition lists'],
  periods: ['Timetable', 'period', 'periods'],
  school_holidays: ['Timetable', 'holiday', 'holidays'],
  timetable_entries: ['Timetable', 'timetable entry', 'timetable entries'],
  timetable_submissions: ['Timetable', 'timetable submission', 'timetable submissions'],
  timetable_versions: ['Timetable', 'generated timetable', 'generated timetables'],
  timetable_config: ['Timetable', 'timetable curriculum', 'timetable curriculum changes'],
  timetable_signoffs: ['Timetable', 'allocations sign-off', 'allocations sign-offs'],
  examConfigs: ['Exams', 'exam setting', 'exam settings'],
  exam_configs: ['Exams', 'exam setting', 'exam settings'],
  exams: ['Exams', 'exam', 'exams'],
  reportCards: ['Report cards', 'report card', 'report cards'],
  report_cards: ['Report cards', 'report card', 'report cards'],
  messages: ['SMS', 'message', 'messages'],
  sms_logs: ['SMS', 'SMS record', 'SMS records'],
  campaigns: ['SMS', 'SMS campaign', 'SMS campaigns'],
  session: ['Sign-in', 'session', 'sessions'],
  face: ['Face recognition', 'face record', 'face records'],
};

const noun = (col: string): [string, string, string] => {
  if (NOUNS[col]) return NOUNS[col];
  if (/^sba/i.test(col)) return ['SBA', 'SBA record', 'SBA records'];
  const plain = col.replace(/_/g, ' ');
  return [plain.charAt(0).toUpperCase() + plain.slice(1), `${plain} record`, `${plain} records`];
};

export const areaOf = (collectionName: string) => noun(collectionName)[0];

const VERB: Record<string, string> = { create: 'Created', set: 'Saved', merge: 'Saved', update: 'Updated', delete: 'Deleted' };

// ---------- what a change was for (class, subject, exam, term…) ----------

const EXAM_NAMES: Record<string, string> = { week4: 'Week 4', week8: 'Week 8', endOfTerm: 'End of Term' };

interface OpContext {
  exam?: string;      // "Week 4"
  className?: string; // "Form 2A"
  subject?: string;   // "Mathematics"
  term?: string;      // "Term 3 2026"
  date?: string;      // "Mon 19 Oct 2026" (registers)
  period?: string;    // "3"
  person?: string;    // learner / record name
  mark?: string;      // "45/50"
}

const str = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : String(v));

function niceDate(v: unknown): string | undefined {
  const t = str(v);
  if (!t) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (!m) return t;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** Pure: the class, subject, exam, term and year a change was for, from its values (or its record ID). */
export function contextOf(o: AuditOp): OpContext {
  const v = o.values ?? {};
  const c: OpContext = {};
  const examType = str(v.examType);
  c.exam = (examType && EXAM_NAMES[examType]) || str(v.examName)?.replace(/\s+(Test|Exam)$/i, '');
  c.className = str(v.className);
  c.subject = str(v.subjectName) ?? str(v.subject);
  const term = str(v.term);
  const year = str(v.year);
  if (term) c.term = year && !term.includes(year) ? `${term} ${year}` : term;
  else if (str(v.examYear)) c.term = `${v.examYear} exam year`;
  else if (year) c.term = year;
  c.date = niceDate(v.date);
  c.period = str(v.period);
  c.person = str(v.studentName) ?? o.label;
  if (typeof v.marks === 'number' && v.marks >= 0) c.mark = typeof v.totalMarks === 'number' ? `${v.marks}/${v.totalMarks}` : String(v.marks);
  else if (str(v.status) === 'absent') c.mark = 'absent';

  // Older entries (and deletions) carry no values: read what the record ID
  // holds — results/<learner>_<subject>_<week4|week8|endOfTerm>_<Term3>_<2026>.
  if (o.collection === 'results' && (!c.exam || !c.term)) {
    const m = /_([^_]+)_(week4|week8|endOfTerm)_Term(\d)_(\d{4})$/.exec(o.docId);
    if (m) {
      c.subject ??= m[1].replace(/([a-z])([A-Z])/g, '$1 $2');
      c.exam ??= EXAM_NAMES[m[2]];
      c.term ??= `Term ${m[3]} ${m[4]}`;
    }
  }
  return c;
}

const placeOf = (c: OpContext, withPeriod = true) =>
  [c.className, c.subject, c.exam && !c.term ? c.exam : undefined, c.term, c.date, withPeriod && c.period ? `period ${c.period}` : undefined]
    .filter(Boolean).join(' · ');

/** Pure: "Form 2A · Mathematics · Term 3 2026" for one change (empty when unknown). */
export const contextLine = (o: AuditOp) => {
  const c = contextOf(o);
  return [c.person && c.person !== c.className ? c.person : undefined, c.exam, placeOf(c)].filter(Boolean).join(' · ');
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Pure: one sentence for changes of one kind to one collection, all for the same class / subject / exam / term. */
function describeGroup(verb: string, col: string, list: AuditOp[]): string {
  const c = contextOf(list[0]);
  const ctx = placeOf(c, col !== 'attendance_sessions' || list.length === 1);
  const tail = ctx ? ` — ${ctx}` : '';
  const n = list.length;

  if (col === 'results') {
    const what = c.exam ? `${c.exam} ` : '';
    if (n === 1) {
      const who = c.person ? ` of ${c.person}` : '';
      const mark = c.mark && verb !== 'Deleted' ? ` (${c.mark})` : '';
      return `${verb} the ${what}mark${who}${mark}${tail}`;
    }
    if (verb === 'Deleted') return `Deleted ${what}marks of ${plural(n, 'learner')}${tail}`;
    return `${verb} ${what}marks for ${plural(n, 'learner')}${tail}`;
  }
  if (col === 'sba_results') {
    if (n === 1) return `${verb} the SBA marks${c.person ? ` of ${c.person}` : ''}${tail}`;
    return `${verb} SBA marks for ${plural(n, 'learner')}${tail}`;
  }
  if (col === 'attendance_sessions') {
    const periods = list.map(o => contextOf(o).period).filter(Boolean);
    const p = n > 1 && periods.length ? ` · periods ${periods.join(', ')}` : '';
    const what = verb === 'Deleted' ? 'Deleted the register' : 'Took the register';
    return `${what}${n > 1 ? ` (${plural(n, 'period')})` : ''}${tail}${p}`;
  }

  const [, one, many] = noun(col);
  if (n === 1) {
    const o = list[0];
    const name = o.label || o.docId;
    const fields = o.op === 'update' && o.fields?.length ? ` (${o.fields.slice(0, 4).join(', ')}${o.fields.length > 4 ? '…' : ''})` : '';
    const extra = ctx && ctx !== name ? ` — ${ctx}` : '';
    return `${verb} ${one}${name ? ` ${name}` : ''}${fields}${extra}`;
  }
  return `${verb} ${n} ${many}${tail}`;
}

/** Pure: one sentence for a group of changes, e.g. "Saved Week 4 marks for 38 learners — Form 2A · Mathematics · Term 3 2026". */
export function summarizeOps(ops: AuditOp[]): string {
  const events = ops.filter(o => o.op === 'event').map(o => o.action || 'Event');
  const groups = new Map<string, { verb: string; col: string; list: AuditOp[] }>();
  for (const o of ops) {
    if (o.op === 'event') continue;
    const verb = VERB[o.op] ?? 'Changed';
    const c = contextOf(o);
    // Registers of a double lesson are one action: group without the period.
    const k = [verb, o.collection, c.className, c.subject, c.exam, c.term, c.date].join('|');
    const g = groups.get(k) ?? { verb, col: o.collection, list: [] };
    g.list.push(o);
    groups.set(k, g);
  }
  const parts = [...groups.values()].map(g => describeGroup(g.verb, g.col, g.list));
  return [...events, ...parts].join('; ') || 'No details';
}

/** Words that read naturally after a name ("Muhau Nakwebwa saved …"). */
const VERB_START = /^(Saved|Created|Updated|Deleted|Changed|Took|Signed|Recorded|Withdrew|Added|Removed|Scanned|Synced|Entered)\b/;

/** Pure: the sentence with the person in front, e.g. "Muhau Nakwebwa saved Week 4 marks for …". */
export function withActor(name: string, sentence: string): string {
  const who = name.trim();
  if (!who) return sentence;
  if (VERB_START.test(sentence)) return `${who} ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
  return `${who}: ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
}

const FACE_ACTIONS: Record<string, string> = {
  'consent.granted': 'Recorded guardian consent for face recognition',
  'consent.withdrawn': 'Withdrew face recognition consent (faces deleted)',
  'face.enrolled': 'Added a face',
  'face.removed': 'Removed a face angle',
  'face.removedAll': 'Removed all faces',
  'match.live': 'Scanned faces (camera)',
  'match.photo': 'Scanned faces (photo)',
  'admin.sync': 'Synced face records with learner records',
  'admin.purgeAll': 'Deleted every saved face',
  'face.deletedLearnerLeft': 'Deleted the faces of a learner who left',
};

const toDate = (v: any): Date => {
  if (!v) return new Date(0);
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'string' || typeof v === 'number') return new Date(v);
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  return new Date(0);
};

export function mapAppEntry(id: string, d: any): AuditRow {
  const ops: AuditOp[] = Array.isArray(d.ops) ? d.ops : [];
  return {
    id,
    source: 'app',
    at: toDate(d.at ?? d.clientAt),
    actorId: d.actorId || '',
    actorName: d.actorName || '',
    actorRole: d.actorRole || '',
    page: d.page || undefined,
    ops,
    areas: Array.from(new Set(ops.map(o => areaOf(o.collection)))),
    summary: withActor(d.actorName || '', summarizeOps(ops)),
  };
}

export function mapFaceEntry(id: string, d: any): AuditRow {
  const { action, userId, userName, at, ...details } = d ?? {};
  const values: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(details)) {
    if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) values[k] = v as any;
  }
  const what = FACE_ACTIONS[action] ?? String(action || 'Face recognition');
  const learner = details.studentId || details.learnerId;
  return {
    id: `face_${id}`,
    source: 'face',
    at: toDate(at),
    actorId: userId || '',
    actorName: userName || '',
    actorRole: userId === 'system' ? 'system' : '',
    ops: [{ op: 'event', collection: 'face', docId: String(details.learnerId || ''), path: details.learnerId ? `learners/${details.learnerId}` : '', action: what, values }],
    areas: ['Face recognition'],
    summary: withActor(userName || (userId === 'system' ? 'System' : ''), learner ? `${what} — ${learner}` : what),
  };
}

export interface AuditPage {
  rows: AuditRow[];
  /** Pass back to load older entries; null when everything in the range is loaded. */
  cursor: { app: QueryDocumentSnapshot | null; face: QueryDocumentSnapshot | null; appDone: boolean; faceDone: boolean } | null;
}

export const AUDIT_PAGE_SIZE = 200;

/**
 * Entries between `from` (start of that day) and `to` (end of that day),
 * newest first, AUDIT_PAGE_SIZE at a time from each source.
 */
export async function loadAuditTrail(from: Date, to: Date, cursor?: AuditPage['cursor']): Promise<AuditPage> {
  const start = new Date(from); start.setHours(0, 0, 0, 0);
  const end = new Date(to); end.setHours(23, 59, 59, 999);
  const page = async (col: string, after: QueryDocumentSnapshot | null, done: boolean) => {
    if (done) return { docs: [] as QueryDocumentSnapshot[], done: true };
    const parts: any[] = [where('at', '>=', start), where('at', '<=', end), orderBy('at', 'desc')];
    if (after) parts.push(startAfter(after));
    parts.push(limit(AUDIT_PAGE_SIZE));
    try {
      const snap = await getDocs(query(collection(db, col), ...parts));
      return { docs: snap.docs as QueryDocumentSnapshot[], done: snap.docs.length < AUDIT_PAGE_SIZE };
    } catch (e) {
      if (col === 'face_audit') return { docs: [], done: true }; // face recognition not set up
      throw e;
    }
  };
  const [app, face] = await Promise.all([
    page('audit_log', cursor?.app ?? null, cursor?.appDone ?? false),
    page('face_audit', cursor?.face ?? null, cursor?.faceDone ?? false),
  ]);
  const rows = [
    ...app.docs.map(d => mapAppEntry(d.id, d.data())),
    ...face.docs.map(d => mapFaceEntry(d.id, d.data())),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const appLast = app.docs[app.docs.length - 1] ?? cursor?.app ?? null;
  const faceLast = face.docs[face.docs.length - 1] ?? cursor?.face ?? null;
  return {
    rows,
    cursor: app.done && face.done ? null : { app: appLast, face: faceLast, appDone: app.done, faceDone: face.done },
  };
}

/** Pure: rows as CSV, one line per change. */
export function auditCsv(rows: AuditRow[]): string {
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [['Date', 'Time', 'Person', 'Role', 'Action', 'Change', 'Area', 'Record', 'Name', 'Fields', 'Values', 'Page'].join(',')];
  for (const r of rows) {
    const date = r.at.toLocaleDateString('en-GB');
    const time = r.at.toLocaleTimeString('en-GB');
    for (const o of r.ops.length ? r.ops : [null]) {
      lines.push([
        date, time, r.actorName || r.actorId, r.actorRole, r.summary,
        o ? (o.op === 'event' ? o.action : VERB[o.op] ?? o.op) : '',
        o ? areaOf(o.collection) : '', o?.path ?? '', o?.label ?? '',
        o?.fields?.join(' ') ?? '',
        o?.values ? Object.entries(o.values).map(([k, v]) => `${k}=${v}`).join('; ') : '',
        r.page ?? '',
      ].map(esc).join(','));
    }
  }
  return lines.join('\n');
}
