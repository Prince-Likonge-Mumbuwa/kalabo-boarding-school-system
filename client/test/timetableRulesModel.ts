// JavaScript model of the TEACHER branches of the firestore.rules blocks for
// timetable_entries, timetable_submissions (teachers may not write either:
// the timetable is generated and published) and attendance_sessions.
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
  // Teachers no longer write timetables: the school timetable is generated
  // and published by the admin.
  if (collection === 'timetable_entries' || collection === 'timetable_submissions') return false;
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
