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

/** Pure: one sentence for a group of changes, e.g. "Updated learner Amy Banda (guardianPhone)". */
export function summarizeOps(ops: AuditOp[]): string {
  const events = ops.filter(o => o.op === 'event').map(o => o.action || 'Event');
  const groups = new Map<string, AuditOp[]>();
  for (const o of ops) {
    if (o.op === 'event') continue;
    const k = `${VERB[o.op] ?? 'Changed'}|${o.collection}`;
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  const parts = [...groups.entries()].map(([k, list]) => {
    const [verb, col] = k.split('|');
    const [, one, many] = noun(col);
    if (list.length === 1) {
      const o = list[0];
      const name = o.label || o.docId;
      const fields = o.op === 'update' && o.fields?.length ? ` (${o.fields.slice(0, 4).join(', ')}${o.fields.length > 4 ? '…' : ''})` : '';
      return `${verb} ${one}${name ? ` ${name}` : ''}${fields}`;
    }
    return `${verb} ${list.length} ${many}`;
  });
  return [...events, ...parts].join('; ') || 'No details';
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
    summary: summarizeOps(ops),
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
    summary: learner ? `${what} — ${learner}` : what,
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
