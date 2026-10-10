// JavaScript model of the TEACHER branches of the firestore.rules blocks for
// timetable_entries, timetable_submissions and attendance_sessions.
// Used by unit tests to check every write a teacher's app makes would be
// allowed. A model, not the real engine — run `pnpm test:rules` for that.

type Data = Record<string, any>;

export interface TtRulesEnv {
  uid: string;
  enforceAuthority: boolean;
  slots: Record<string, Data>;
  now?: Date;
}

const toDate = (v: any) => (v instanceof Date ? v : v?.toDate ? v.toDate() : new Date(v));
const live = (s: Data, now: Date) =>
  s.delegateTeacherId != null && s.delegateStart != null && s.delegateEnd != null &&
  now >= toDate(s.delegateStart) && now <= toDate(s.delegateEnd);
const operatorOf = (s: Data, now: Date) => (live(s, now) ? s.delegateTeacherId : s.ownerTeacherId ?? null);

export function ownerOrOperator(env: TtRulesEnv, slotId: any) {
  const s = typeof slotId === 'string' ? env.slots[slotId] : undefined;
  return !!s && (s.ownerTeacherId === env.uid || operatorOf(s, env.now ?? new Date()) === env.uid);
}

const TERMS = ['Term 1', 'Term 2', 'Term 3'];

function entryShape(d: Data) {
  return ['slotId', 'classId', 'className', 'subject', 'normalizedSubject', 'term', 'year', 'dayOfWeek', 'periodIndex', 'isDouble', 'status']
    .every(k => k in d) &&
    TERMS.includes(d.term) && Number.isInteger(d.year) &&
    Number.isInteger(d.dayOfWeek) && d.dayOfWeek >= 1 && d.dayOfWeek <= 5 &&
    Number.isInteger(d.periodIndex) && d.periodIndex >= 1 && typeof d.isDouble === 'boolean' &&
    ['draft', 'pending', 'active', 'rejected', 'archived'].includes(d.status);
}

function submissionShape(d: Data) {
  return ['teacherId', 'term', 'year', 'scopeSlotIds', 'status'].every(k => k in d) &&
    TERMS.includes(d.term) && Number.isInteger(d.year) && Array.isArray(d.scopeSlotIds) &&
    ['pending', 'approved', 'rejected', 'superseded'].includes(d.status);
}

function sessionShape(d: Data) {
  const ok = ['classId', 'className', 'date', 'kind', 'markedBy', 'markedByName', 'markedAt', 'roster', 'summary', 'schemaVersion']
    .every(k => k in d) && d.schemaVersion === 1 && ['daily', 'periodic'].includes(d.kind);
  return ok && (d.kind === 'daily' ||
    (Number.isInteger(d.period) && d.period >= 1 && d.period <= 8 && typeof d.subject === 'string' && d.subject.length > 0));
}
const sessionSlotOk = (env: TtRulesEnv, d: Data) => d.slotId != null && ownerOrOperator(env, d.slotId);
const identitySame = (a: Data, b: Data) =>
  a.classId === b.classId && a.date === b.date && a.kind === b.kind &&
  (a.period ?? null) === (b.period ?? null) && (a.subject ?? null) === (b.subject ?? null);

export function teacherWriteAllowed(
  env: TtRulesEnv,
  collection: string,
  op: 'set' | 'update' | 'delete',
  before: Data | null,
  after: Data | null,
): boolean {
  if (collection === 'timetable_entries') {
    if (op === 'delete') return before!.submittedByUid === env.uid && ['pending', 'draft', 'rejected'].includes(before!.status);
    if (!before) {
      return entryShape(after!) && after!.submittedByUid === env.uid && ['pending', 'draft'].includes(after!.status) &&
        (!env.enforceAuthority || ownerOrOperator(env, after!.slotId));
    }
    return entryShape(after!) && before.submittedByUid === env.uid &&
      ['pending', 'draft', 'rejected'].includes(before.status) &&
      ['pending', 'draft', 'rejected'].includes(after!.status) && after!.submittedByUid === env.uid;
  }
  if (collection === 'timetable_submissions') {
    if (op === 'delete') return before!.teacherId === env.uid && before!.status === 'pending';
    if (!before) return submissionShape(after!) && after!.teacherId === env.uid && after!.status === 'pending';
    return submissionShape(after!) && before.teacherId === env.uid && after!.teacherId === env.uid &&
      before.status === 'pending' && ['pending', 'superseded'].includes(after!.status);
  }
  if (collection === 'attendance_sessions') {
    if (op === 'delete') return before!.markedBy === env.uid || sessionSlotOk(env, before!);
    if (!before) {
      return sessionShape(after!) && after!.markedBy === env.uid && (!env.enforceAuthority || sessionSlotOk(env, after!));
    }
    return (before.markedBy === env.uid || sessionSlotOk(env, before)) && identitySame(before, after!) &&
      after!.markedBy === env.uid && sessionShape(after!);
  }
  return true;
}
