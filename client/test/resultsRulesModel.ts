// A line-by-line JavaScript model of the `results` rules in firestore.rules,
// used by the unit tests to check that every write the app makes would be
// allowed (or refused) by the deployed rules.
//
// It is a MODEL, not the real rules engine: it cannot catch syntax errors in
// firestore.rules. Run the real emulator tests (pnpm test:rules) for that.
//
// Where the real rules would raise an error (reading a missing field
// directly), the model returns false, because Firestore denies on error.

type Data = Record<string, any>;

export interface RulesEnv {
  uid: string | null;
  role: 'admin' | 'teacher' | null;
  enforceAuthority: boolean;
  /** class_slots documents by id */
  slots: Record<string, Data>;
  now?: Date;
}

class RuleError extends Error {}
const field = (d: Data, k: string) => {
  if (!(k in d)) throw new RuleError(`missing field ${k}`);
  return d[k];
};
const get = (d: Data, k: string, dflt: any) => (k in d ? d[k] : dflt);
const toDate = (v: any) => (v instanceof Date ? v : v?.toDate ? v.toDate() : new Date(v));

function delegateLive(s: Data, now: Date) {
  return (
    get(s, 'delegateTeacherId', null) != null &&
    get(s, 'delegateStart', null) != null &&
    get(s, 'delegateEnd', null) != null &&
    now >= toDate(s.delegateStart) &&
    now <= toDate(s.delegateEnd)
  );
}
const operatorOf = (s: Data, now: Date) => (delegateLive(s, now) ? s.delegateTeacherId : get(s, 'ownerTeacherId', null));

function canEnterMarks(env: RulesEnv, classId: string, subj: string) {
  const s = env.slots[`${classId}__${subj}`];
  return env.uid != null && !!s && (
    get(s, 'ownerTeacherId', null) === env.uid || operatorOf(s, env.now ?? new Date()) === env.uid
  );
}

const isTeacher = (env: RulesEnv) => env.uid != null && env.role === 'teacher';
const isAdmin = (env: RulesEnv) => env.uid != null && env.role === 'admin';

function teacherMayCreate(env: RulesEnv, d: Data) {
  return isTeacher(env) && (
    !env.enforceAuthority ||
    (canEnterMarks(env, field(d, 'classId'), field(d, 'normalizedSubject')) && field(d, 'enteredBy') === env.uid)
  );
}

function teacherMayUpdate(env: RulesEnv, before: Data, after: Data) {
  return isTeacher(env) && (
    !env.enforceAuthority || (
      canEnterMarks(env, field(before, 'classId'), field(before, 'normalizedSubject')) &&
      field(after, 'classId') === field(before, 'classId') &&
      field(after, 'normalizedSubject') === field(before, 'normalizedSubject') &&
      get(after, 'enteredBy', null) === get(before, 'enteredBy', null) &&
      field(after, 'lastEditedBy') === env.uid
    )
  );
}

function teacherMayDelete(env: RulesEnv, d: Data) {
  return isTeacher(env) && (
    (env.enforceAuthority && canEnterMarks(env, field(d, 'classId'), get(d, 'normalizedSubject', ''))) ||
    (!env.enforceAuthority && (get(d, 'teacherId', '') === env.uid || get(d, 'enteredBy', '') === env.uid))
  );
}

export function isValidResultShape(d: Data) {
  const has = ['studentId', 'classId', 'subjectId', 'examType', 'term', 'year', 'marks', 'totalMarks'].every(k => k in d);
  return (
    has &&
    typeof d.studentId === 'string' && d.studentId.length > 0 &&
    typeof d.classId === 'string' && d.classId.length > 0 &&
    typeof d.subjectId === 'string' && d.subjectId.length > 0 &&
    ['week4', 'week8', 'endOfTerm'].includes(d.examType) &&
    ['Term 1', 'Term 2', 'Term 3'].includes(d.term) &&
    Number.isInteger(d.year) &&
    typeof d.marks === 'number' &&
    typeof d.totalMarks === 'number' && d.totalMarks > 0 &&
    (d.marks === -1 || d.marks === -2 || (d.marks >= 0 && d.marks <= d.totalMarks))
  );
}

const safe = (fn: () => boolean) => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof RuleError) return false;
    throw e;
  }
};

/** Would this write to /results be allowed? */
export function resultsWriteAllowed(
  env: RulesEnv,
  op: 'set' | 'update' | 'delete',
  before: Data | null,
  after: Data | null
): boolean {
  if (op === 'delete') return isAdmin(env) || safe(() => teacherMayDelete(env, before!));
  if (before === null) {
    return isAdmin(env) || safe(() => teacherMayCreate(env, after!) && isValidResultShape(after!));
  }
  return isAdmin(env) || safe(() => teacherMayUpdate(env, before, after!) && isValidResultShape(after!));
}
