"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const firestore = require("firebase-admin/firestore");
const toChild = (l) => ({
  id: l.id,
  studentId: l.studentId || "",
  fullName: l.fullName || l.name || "Unknown",
  className: l.className || ""
});
const portalDirect = {
  async parentChildren(phone) {
    const { learnerService: learnerService2 } = await Promise.resolve().then(() => schoolService);
    const learners = await learnerService2.getLearnersByGuardianPhone(phone);
    return learners.map(toChild);
  },
  async parentReport(phone, learnerId, term, year) {
    const children = await portalDirect.parentChildren(phone);
    if (!children.some((c) => c.id === learnerId)) return null;
    const { resultsService: resultsService2 } = await Promise.resolve().then(() => resultsService$1);
    return resultsService2.generateReportCard(learnerId, term, year, {
      includeIncomplete: true,
      markMissing: true,
      publicView: true
    });
  },
  async sponsorCheck(code) {
    const { checkSponsorCode: checkSponsorCode2 } = await Promise.resolve().then(() => guidanceService);
    const c = await checkSponsorCode2(code);
    return { code: c.code, sponsorName: c.sponsorName, term: c.term, year: c.year, learnerCount: c.learnerCount };
  },
  async sponsorReports(code) {
    const { checkSponsorCode: checkSponsorCode2, buildSponsorReports: buildSponsorReports2 } = await Promise.resolve().then(() => guidanceService);
    const c = await checkSponsorCode2(code);
    const { assertTermReleased: assertTermReleased2 } = await Promise.resolve().then(() => resultsPublication);
    await assertTermReleased2(c.term, c.year);
    return buildSponsorReports2(c.learnerIds, c.term, c.year, { publicView: true });
  },
  async sponsorRedeem(code) {
    const { redeemSponsorCode: redeemSponsorCode2 } = await Promise.resolve().then(() => guidanceService);
    const { normalizeCodeInput: normalizeCodeInput2 } = await Promise.resolve().then(() => guidancePlan);
    await redeemSponsorCode2(normalizeCodeInput2(code) || code);
  }
};
function getFirestore() {
  return firestore.getFirestore();
}
const isDb = (x) => !!x && typeof x.collection === "function" && typeof x.batch === "function";
const isDocRef = (x) => !!x && typeof x.collection === "function" && typeof x.set === "function" && !isDb(x);
const isColRef = (x) => !!x && typeof x.doc === "function" && typeof x.add === "function";
function collection(parent, path, ...rest) {
  const full = [path, ...rest].join("/");
  if (isDb(parent)) return parent.collection(full);
  if (isDocRef(parent)) return parent.collection(full);
  throw new Error("collection(): first argument must be the database or a document reference");
}
function doc(parent, path, ...rest) {
  if (isColRef(parent)) return path === void 0 ? parent.doc() : parent.doc([path, ...rest].join("/"));
  if (isDb(parent)) {
    if (path === void 0) throw new Error("doc(): a path is required");
    return parent.doc([path, ...rest].join("/"));
  }
  if (isDocRef(parent) && path !== void 0) return parent.firestore.doc(`${parent.path}/${[path, ...rest].join("/")}`);
  throw new Error("doc(): first argument must be the database or a collection reference");
}
class DocumentSnapshot {
  constructor(snap) {
    this.snap = snap;
  }
  get id() {
    return this.snap.id;
  }
  get ref() {
    return this.snap.ref;
  }
  exists() {
    return this.snap.exists;
  }
  data() {
    return this.snap.exists ? this.snap.data() : void 0;
  }
  get(field) {
    return this.snap.get(field);
  }
}
class QuerySnapshot {
  docs;
  constructor(snap) {
    this.docs = snap.docs.map((d) => new DocumentSnapshot(d));
  }
  get size() {
    return this.docs.length;
  }
  get empty() {
    return this.docs.length === 0;
  }
  forEach(cb) {
    this.docs.forEach(cb);
  }
}
const wrapDoc = (s) => new DocumentSnapshot(s);
const where = (field, op, value) => ({ kind: "where", field, op, value });
const orderBy = (field, dir = "asc") => ({ kind: "orderBy", field, dir });
const limit = (n) => ({ kind: "limit", n });
function query(base, ...constraints) {
  let q = base;
  for (const c of constraints) {
    if (c.kind === "where") q = q.where(c.field, c.op, c.value);
    else if (c.kind === "orderBy") q = q.orderBy(c.field, c.dir);
    else if (c.kind === "limit") q = q.limit(c.n);
    else if (c.kind === "startAfter") {
      const v = c.values.map((x) => x instanceof DocumentSnapshot ? x.snap : x);
      q = q.startAfter(...v);
    }
  }
  return q;
}
async function getDoc(ref) {
  return wrapDoc(await ref.get());
}
async function getDocs(q) {
  return new QuerySnapshot(await q.get());
}
async function updateDoc(ref, dataOrField, ...more) {
  if (typeof dataOrField === "string" || dataOrField instanceof firestore.FieldPath) await ref.update(dataOrField, ...more);
  else await ref.update(dataOrField);
}
async function addDoc(col, data) {
  return col.add(data);
}
async function deleteDoc(ref) {
  await ref.delete();
}
class WriteBatchAdapter {
  constructor(b) {
    this.b = b;
  }
  set(ref, data, options) {
    options?.merge ? this.b.set(ref, data, { merge: true }) : this.b.set(ref, data);
    return this;
  }
  update(ref, dataOrField, ...more) {
    this.b.update(ref, dataOrField, ...more);
    return this;
  }
  delete(ref) {
    this.b.delete(ref);
    return this;
  }
  async commit() {
    await this.b.commit();
  }
}
const writeBatch = (db2) => new WriteBatchAdapter(db2.batch());
class TransactionAdapter {
  constructor(t) {
    this.t = t;
  }
  async get(ref) {
    return wrapDoc(await this.t.get(ref));
  }
  set(ref, data, options) {
    options?.merge ? this.t.set(ref, data, { merge: true }) : this.t.set(ref, data);
    return this;
  }
  update(ref, dataOrField, ...more) {
    this.t.update(ref, dataOrField, ...more);
    return this;
  }
  delete(ref) {
    this.t.delete(ref);
    return this;
  }
}
function runTransaction(db2, fn) {
  return db2.runTransaction((t) => fn(new TransactionAdapter(t)));
}
const serverTimestamp = () => firestore.FieldValue.serverTimestamp();
const increment = (n) => firestore.FieldValue.increment(n);
const arrayUnion = (...v) => firestore.FieldValue.arrayUnion(...v);
const auth = { currentUser: null };
const db = getFirestore();
const getAuth = (_app) => auth;
const PUBLICATION_COLLECTION = "results_publication";
const FIRST_PUBLISHED_TERM = { term: "Term 3", year: 2026 };
const TERM_NUMBERS = { "Term 1": 1, "Term 2": 2, "Term 3": 3 };
class ResultsNotReleasedError extends Error {
  code = "results-not-published";
  term;
  year;
  constructor(term, year) {
    super(
      `${term} ${year} results have not been released yet. They will be available here once the school has published them.`
    );
    this.name = "ResultsNotReleasedError";
    this.term = term;
    this.year = year;
  }
}
const publicationId = (term, year) => `${Number(year)}_${String(term).replace(/\s+/g, "")}`;
const termNumber = (term) => TERM_NUMBERS[term] ?? NaN;
const termOrder = (term, year) => Number(year) * 3 + termNumber(term);
function isOpenByDefault(term, year) {
  const order = termOrder(term, year);
  if (Number.isNaN(order)) return false;
  return order < termOrder(FIRST_PUBLISHED_TERM.term, FIRST_PUBLISHED_TERM.year);
}
function isReleased(record, term, year) {
  if (record) return record.published === true;
  return isOpenByDefault(term, year);
}
const isPermissionDenied$2 = (e) => e?.code === "permission-denied" || /missing or insufficient permissions/i.test(e?.message ?? "");
const toDate$3 = (v) => v && typeof v.toDate === "function" ? v.toDate() : v instanceof Date ? v : null;
const fromDoc = (d) => ({
  term: String(d.term ?? ""),
  year: Number(d.year),
  published: d.published === true,
  requiredEntries: Number(d.requiredEntries ?? 0),
  doneEntries: Number(d.doneEntries ?? 0),
  completionPercent: Number(d.completionPercent ?? 0),
  publishedAt: toDate$3(d.publishedAt),
  publishedByName: String(d.publishedByName ?? ""),
  unpublishedAt: toDate$3(d.unpublishedAt),
  unpublishedByName: String(d.unpublishedByName ?? "")
});
async function getPublication(term, year) {
  try {
    const snap = await getDoc(doc(db, PUBLICATION_COLLECTION, publicationId(term, year)));
    return snap.exists() ? fromDoc(snap.data()) : null;
  } catch (e) {
    if (isPermissionDenied$2(e)) return null;
    throw e;
  }
}
const CACHE_TTL_MS = 15e3;
const releasedCache = /* @__PURE__ */ new Map();
function clearReleaseCache() {
  releasedCache.clear();
}
function isTermReleased(term, year) {
  const key = publicationId(term, year);
  const hit = releasedCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;
  const promise = getPublication(term, year).then((record) => isReleased(record, term, year));
  releasedCache.set(key, { at: Date.now(), promise });
  promise.catch(() => releasedCache.delete(key));
  return promise;
}
async function assertTermReleased(term, year) {
  if (!await isTermReleased(term, year)) throw new ResultsNotReleasedError(term, year);
}
const resultsPublication = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  FIRST_PUBLISHED_TERM,
  PUBLICATION_COLLECTION,
  ResultsNotReleasedError,
  assertTermReleased,
  clearReleaseCache,
  getPublication,
  isOpenByDefault,
  isReleased,
  isTermReleased,
  publicationId
}, Symbol.toStringTag, { value: "Module" }));
const levelNumber = (v) => {
  const n = typeof v === "number" ? v : parseInt(String(v ?? "").replace(/\D+/g, ""), 10);
  return Number.isFinite(n) ? n : 99;
};
const byText = (a, b) => a.localeCompare(b, void 0, { numeric: true, sensitivity: "base" });
function sortCardsByForm(cards) {
  return [...cards].sort((a, b) => levelNumber(a.form) - levelNumber(b.form) || byText(a.className || "", b.className || "") || byText(a.studentName || "", b.studentName || ""));
}
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_PREFIX = "SP";
function normalizeCodeInput(input) {
  let s = String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length === 10 && s.startsWith(CODE_PREFIX)) s = s.slice(2);
  if (s.length !== 8) return null;
  if (![...s].every((c) => CODE_ALPHABET.includes(c))) return null;
  return `${CODE_PREFIX}-${s.slice(0, 4)}-${s.slice(4)}`;
}
function displayStatus(code, now = /* @__PURE__ */ new Date()) {
  if (code.status !== "active") return code.status;
  if (code.expiresAt && code.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}
function codeProblem(code, now = /* @__PURE__ */ new Date()) {
  if (!code) return "That code was not found. Please check it, or ask the school for a new one.";
  switch (displayStatus(code, now)) {
    case "used":
      return "That code has already been used. Each code works only once — please ask the school guidance office for a new one.";
    case "revoked":
      return "That code was cancelled by the school. Please ask the guidance office for a new one.";
    case "expired":
      return "That code has expired. Please ask the school guidance office for a new one.";
    default:
      return null;
  }
}
const guidancePlan = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  CODE_ALPHABET,
  CODE_PREFIX,
  codeProblem,
  displayStatus,
  normalizeCodeInput,
  sortCardsByForm
}, Symbol.toStringTag, { value: "Module" }));
const getCarrier = (phone) => {
  if (!phone) return "UNKNOWN";
  if (/^260(96|76)/.test(phone)) return "MTN";
  if (/^260(97|77)/.test(phone)) return "AIRTEL";
  if (/^260(95|75)/.test(phone)) return "ZAMTEL";
  if (/^260(98|78)/.test(phone)) return "ZedMobile";
  return "OTHER";
};
const validateZambianNumber = (phone) => {
  if (!phone) return null;
  let cleaned = String(phone).trim().replace(/[\s\-()]+/g, "");
  if (cleaned.startsWith("+")) cleaned = cleaned.substring(1);
  if (cleaned.startsWith("0")) cleaned = "260" + cleaned.substring(1);
  if (!cleaned.startsWith("260")) cleaned = "260" + cleaned;
  const pattern = /^260(75|76|77|78|95|96|97|98)\d{7}$/;
  if (!pattern.test(cleaned)) return null;
  return {
    number: "+" + cleaned,
    digits: cleaned,
    national9: cleaned.slice(3),
    carrier: getCarrier(cleaned)
  };
};
const looseSubjectKey = (s) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
function editDistance(a, b, max = Infinity) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}
const SMALL_WORDS = /* @__PURE__ */ new Set(["of", "in", "and", "the", "for", "to", "a"]);
const titleCase = (s) => s.toLowerCase().split(" ").map((w, i) => i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
function tidyUnknownSubject(s) {
  const cleaned = s.trim().replace(/\s+/g, " ");
  const letters = cleaned.replace(/[^A-Za-z]/g, "");
  if (!letters) return cleaned;
  const allUpper = letters === letters.toUpperCase();
  const allLower = letters === letters.toLowerCase();
  if (allLower || allUpper && letters.length > 4) return titleCase(cleaned);
  return cleaned;
}
function makeSubjectNormalizer(map) {
  const loose = /* @__PURE__ */ new Map();
  const compact = /* @__PURE__ */ new Map();
  for (const [alias, subject] of Object.entries(map)) {
    for (const name of [alias, subject]) {
      loose.set(looseSubjectKey(name), subject);
      compact.set(looseSubjectKey(name).replace(/ /g, ""), subject);
    }
  }
  const fuzzy = [...loose.entries()].map(([key, subject]) => ({ key: key.replace(/ /g, ""), subject })).filter((x) => x.key.length >= 6);
  const cache = /* @__PURE__ */ new Map();
  return function normalizeSubjectName2(subjectName) {
    if (!subjectName) return "";
    const trimmed = String(subjectName).trim();
    if (map[trimmed]) return map[trimmed];
    const hit = cache.get(trimmed);
    if (hit !== void 0) return hit;
    let out = loose.get(looseSubjectKey(trimmed)) ?? compact.get(looseSubjectKey(trimmed).replace(/ /g, ""));
    if (!out) {
      const k = looseSubjectKey(trimmed).replace(/ /g, "");
      if (k.length >= 5) {
        let best = Infinity;
        const at = /* @__PURE__ */ new Set();
        for (const t of fuzzy) {
          const allowed = t.key.length <= 8 ? 1 : 2;
          const dist = editDistance(k, t.key, allowed);
          if (dist > allowed) continue;
          if (dist < best) {
            best = dist;
            at.clear();
          }
          if (dist === best) at.add(t.subject);
        }
        if (at.size === 1) out = [...at][0];
      }
    }
    out ??= tidyUnknownSubject(trimmed);
    cache.set(trimmed, out);
    return out;
  };
}
const FORM_TEACHER_SUBJECT = "Form Teacher";
const FORM_TEACHER_SLOT = "form-teacher";
const SLOTS = "class_slots";
const META_REF = () => doc(db, "system", "assignmentEngine");
class AssignmentRuleError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "AssignmentRuleError";
  }
}
const toNormalized = (subject) => {
  const s = subject.trim();
  return s === FORM_TEACHER_SUBJECT ? FORM_TEACHER_SLOT : normalizeSubjectName(s);
};
const safeKey = (s) => s.replace(/[\/#\[\]?]/g, "-");
const slotIdForNormalized = (classId, normalizedSubject) => `${classId}__${safeKey(normalizedSubject)}`;
const slotIdFor = (classId, subject) => slotIdForNormalized(classId, toNormalized(subject));
const tsToDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v.seconds === "number") return new Date(v.seconds * 1e3);
  return null;
};
const mapSlot = (id, d) => ({
  id,
  classId: d.classId,
  className: d.className || "",
  subject: d.subject || "",
  normalizedSubject: d.normalizedSubject || "",
  isFormTeacherSlot: d.isFormTeacherSlot === true,
  ownerAssignmentId: d.ownerAssignmentId ?? null,
  ownerTeacherId: d.ownerTeacherId ?? null,
  ownerTeacherName: d.ownerTeacherName ?? null,
  ownerSince: tsToDate(d.ownerSince),
  delegateAssignmentId: d.delegateAssignmentId ?? null,
  delegateTeacherId: d.delegateTeacherId ?? null,
  delegateTeacherName: d.delegateTeacherName ?? null,
  delegateRole: d.delegateRole ?? null,
  delegateStart: tsToDate(d.delegateStart),
  delegateEnd: tsToDate(d.delegateEnd),
  updatedAt: tsToDate(d.updatedAt)
});
const delegationState = (slot, now = /* @__PURE__ */ new Date()) => {
  if (!slot?.delegateTeacherId || !slot.delegateStart || !slot.delegateEnd) return "none";
  if (now < slot.delegateStart) return "pending";
  if (now > slot.delegateEnd) return "expired";
  return "live";
};
const resolveAuthority = (slot, now = /* @__PURE__ */ new Date()) => {
  const state = delegationState(slot, now);
  const base = {
    slotId: slot?.id ?? null,
    ownerTeacherId: slot?.ownerTeacherId ?? null,
    ownerTeacherName: slot?.ownerTeacherName ?? null,
    delegationState: state,
    delegateUntil: state === "live" || state === "pending" ? slot?.delegateEnd ?? null : null
  };
  if (slot && state === "live") {
    return {
      ...base,
      operatorTeacherId: slot.delegateTeacherId,
      operatorTeacherName: slot.delegateTeacherName,
      operatorRole: slot.delegateRole
    };
  }
  return {
    ...base,
    operatorTeacherId: slot?.ownerTeacherId ?? null,
    operatorTeacherName: slot?.ownerTeacherName ?? null,
    operatorRole: slot?.ownerTeacherId ? "owner" : null
  };
};
async function isEngineReady() {
  try {
    return (await getDoc(META_REF())).exists();
  } catch {
    return false;
  }
}
async function getSlot(classId, subject) {
  const snap = await getDoc(doc(db, SLOTS, slotIdFor(classId, subject)));
  return snap.exists() ? mapSlot(snap.id, snap.data()) : null;
}
async function findSlotForSubject(classId, subject) {
  const direct = await getSlot(classId, subject);
  if (direct) return direct;
  const asGiven = await getDoc(doc(db, SLOTS, slotIdForNormalized(classId, subject.trim())));
  if (asGiven.exists()) return mapSlot(asGiven.id, asGiven.data());
  const want = toNormalized(subject);
  const snap = await getDocs(query(collection(db, SLOTS), where("classId", "==", classId)));
  for (const d of snap.docs) {
    const s = mapSlot(d.id, d.data());
    if (toNormalized(s.normalizedSubject || s.subject) === want || toNormalized(s.subject) === want) return s;
  }
  return null;
}
function isExamActive(config, examType) {
  if (!config) return false;
  if (config.isActive === false) return false;
  if (config.examTypes?.[examType] !== true) return false;
  const marks = examType === "week4" ? config.week4TotalMarks : examType === "week8" ? config.week8TotalMarks : config.endOfTermTotalMarks;
  return (marks ?? 0) > 0;
}
function isExamWrittenBy(config, examType, classId) {
  if (!classId) return true;
  return !(config?.notWrittenBy?.[examType] ?? []).includes(classId);
}
const ALL_EXAM_TYPES = ["week4", "week8", "endOfTerm"];
const EXAM_LABELS = {
  week4: "Week 4",
  week8: "Week 8",
  endOfTerm: "End of Term"
};
const MARK = {
  ABSENT: -1,
  NOT_CONDUCTED: -2,
  PENDING: -3
};
const GRADE_BANDS = [
  { grade: 1, min: 75, description: "Distinction", code: "D1" },
  { grade: 2, min: 70, description: "Distinction", code: "D2" },
  { grade: 3, min: 65, description: "Merit", code: "M1" },
  { grade: 4, min: 60, description: "Merit", code: "M2" },
  { grade: 5, min: 55, description: "Credit", code: "C1" },
  { grade: 6, min: 50, description: "Credit", code: "C2" },
  { grade: 7, min: 45, description: "Satisfactory", code: "S1" },
  { grade: 8, min: 40, description: "Satisfactory", code: "S2" },
  { grade: 9, min: 0, description: "Unsatisfactory", code: "U" }
];
const gradeForPercentage = (percentage) => {
  if (typeof percentage !== "number" || percentage < 0 || Number.isNaN(percentage)) return -1;
  const p = Math.round(percentage);
  for (const band of GRADE_BANDS) if (p >= band.min) return band.grade;
  return 9;
};
const PASS_MIN_PERCENT = 40;
const isPassPercentage = (percentage) => percentage >= 0 && Math.round(percentage) >= PASS_MIN_PERCENT;
const gradeDescription = (grade) => GRADE_BANDS.find((b) => b.grade === grade)?.description ?? "Incomplete";
function pickTermConfig(configs, term, year) {
  if (!configs?.length) return void 0;
  const matching = configs.filter((c) => c.term === term && Number(c.year) === Number(year));
  return matching.find((c) => c.isActive !== false) ?? matching[0];
}
const activeExamsFor = (config) => ALL_EXAM_TYPES.filter((t) => isExamActive(config, t));
const isCountedLearner = (l) => l.status === void 0 || l.status === null || l.status === "" || l.status === "active";
function buildRoster(learners) {
  return learners.filter(isCountedLearner).map((l) => ({
    id: l.id,
    studentId: l.studentId || "",
    name: l.name || "Unknown",
    gender: l.gender,
    studentIndex: l.studentIndex
  })).sort((a, b) => a.name.localeCompare(b.name));
}
const cellKey = (learnerId, subjectId, examType) => `${learnerId}|${subjectId}|${examType}`;
const columnKey = (subjectId, examType) => `${subjectId}|${examType}`;
const PENDING_CELL = { status: "pending", marks: null, percentage: null };
const percentageOf = (r) => {
  if (typeof r.percentage === "number" && r.percentage >= 0) return r.percentage;
  if (typeof r.totalMarks === "number" && r.totalMarks > 0) {
    return Math.round(r.marks / r.totalMarks * 100);
  }
  return r.marks;
};
function buildResultsGrid(input) {
  const { learners, subjects, activeExams, results } = input;
  const byDocId = new Map(learners.map((l) => [l.id, l]));
  const byCustomId = /* @__PURE__ */ new Map();
  for (const l of learners) {
    if (l.studentId && !byDocId.has(l.studentId)) byCustomId.set(l.studentId, l);
  }
  const subjectIds = new Set(subjects.map((s) => s.subjectId));
  const examSet = new Set(activeExams);
  const cells = /* @__PURE__ */ new Map();
  const cellUpdatedAt = /* @__PURE__ */ new Map();
  const ignored = { offRoster: 0, unknownSubject: 0, inactiveExam: 0 };
  const columnHasReal = /* @__PURE__ */ new Set();
  const columnHasNC = /* @__PURE__ */ new Set();
  for (const r of results) {
    if (!subjectIds.has(r.subjectId)) {
      ignored.unknownSubject++;
      continue;
    }
    if (!examSet.has(r.examType)) {
      ignored.inactiveExam++;
      continue;
    }
    const learner = byDocId.get(r.studentId) ?? byCustomId.get(r.studentId);
    if (!learner) {
      ignored.offRoster++;
      continue;
    }
    const col = columnKey(r.subjectId, r.examType);
    let cell;
    if (r.marks === MARK.NOT_CONDUCTED) {
      cell = { status: "not_conducted", marks: r.marks, percentage: null };
      columnHasNC.add(col);
    } else if (r.marks === MARK.ABSENT) {
      cell = { status: "absent", marks: r.marks, percentage: null };
      columnHasReal.add(col);
    } else if (typeof r.marks === "number" && r.marks >= 0) {
      cell = { status: "entered", marks: r.marks, percentage: percentageOf(r) };
      columnHasReal.add(col);
    } else {
      continue;
    }
    const key = cellKey(learner.id, r.subjectId, r.examType);
    const prev = cellUpdatedAt.get(key);
    if (prev !== void 0 && (r.updatedAt ?? "") < prev) continue;
    cells.set(key, cell);
    cellUpdatedAt.set(key, r.updatedAt ?? "");
  }
  const notConductedColumns = /* @__PURE__ */ new Set();
  for (const col of columnHasNC) {
    if (!columnHasReal.has(col)) notConductedColumns.add(col);
  }
  for (const l of learners) {
    for (const s of subjects) {
      for (const e of activeExams) {
        const key = cellKey(l.id, s.subjectId, e);
        if (notConductedColumns.has(columnKey(s.subjectId, e))) {
          cells.set(key, { status: "not_conducted", marks: MARK.NOT_CONDUCTED, percentage: null });
        } else if (!cells.has(key)) {
          cells.set(key, PENDING_CELL);
        }
      }
    }
  }
  return { activeExams, learners, subjects, cells, notConductedColumns, ignored };
}
const getCell = (grid, learnerId, subjectId, examType) => grid.cells.get(cellKey(learnerId, subjectId, examType)) ?? PENDING_CELL;
const pct = (done, total, emptyValue) => total > 0 ? Math.round(done / total * 100) : emptyValue;
function subjectProgress(grid, subjectId) {
  const subject = grid.subjects.find((s) => s.subjectId === subjectId);
  const total = grid.learners.length;
  const exams = grid.activeExams.map((examType) => {
    let entered = 0;
    let absent = 0;
    let nc = 0;
    const missing = [];
    for (const l of grid.learners) {
      const c = getCell(grid, l.id, subjectId, examType);
      if (c.status === "entered") entered++;
      else if (c.status === "absent") absent++;
      else if (c.status === "not_conducted") nc++;
      else missing.push(l.id);
    }
    const done2 = entered + absent + nc;
    return {
      examType,
      doneCount: done2,
      enteredCount: entered,
      absentCount: absent,
      notConductedCount: nc,
      totalCount: total,
      percentage: pct(done2, total, 100),
      notConducted: grid.notConductedColumns.has(columnKey(subjectId, examType)),
      missingLearnerIds: missing
    };
  });
  const required = total * grid.activeExams.length;
  const done = exams.reduce((s, e) => s + e.doneCount, 0);
  return {
    subjectId,
    subjectName: subject?.subjectName ?? subjectId,
    totalStudents: total,
    exams,
    requiredEntries: required,
    doneEntries: done,
    missingEntries: required - done,
    completionPercentage: pct(done, required, 100),
    isComplete: required - done === 0
  };
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
function learnerProgress(grid, learnerId) {
  const learner = grid.learners.find((l) => l.id === learnerId);
  const rows = grid.subjects.map((s) => {
    const cells = {};
    const scores = [];
    const pending = [];
    for (const e of grid.activeExams) {
      const c = getCell(grid, learnerId, s.subjectId, e);
      cells[e] = c;
      if (c.status === "entered" && c.percentage !== null) scores.push(c.percentage);
      if (c.status === "pending") pending.push(EXAM_LABELS[e]);
    }
    const average = scores.length ? Math.round(mean(scores)) : -1;
    return {
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      teacherName: s.operatorTeacherName || s.ownerTeacherName || "Not assigned",
      cells,
      average,
      grade: gradeForPercentage(average),
      isComplete: pending.length === 0,
      pendingExams: pending
    };
  });
  const total = rows.length;
  const completed = rows.filter((r) => r.isComplete).length;
  const averages = rows.filter((r) => r.average >= 0).map((r) => r.average);
  const hasAnyMarks = averages.length > 0;
  const overall = hasAnyMarks ? Math.round(mean(averages)) : 0;
  return {
    learnerId,
    studentId: learner?.studentId ?? "",
    name: learner?.name ?? "Unknown",
    subjects: rows,
    totalSubjects: total,
    completedSubjects: completed,
    completionPercentage: pct(completed, total, 0),
    isComplete: total > 0 && completed === total && grid.activeExams.length > 0,
    overallPercentage: overall,
    overallGrade: hasAnyMarks ? gradeForPercentage(overall) : -1,
    hasAnyMarks,
    status: !hasAnyMarks ? "pending" : isPassPercentage(overall) ? "pass" : "fail"
  };
}
function classPositions(grid) {
  const ranked = grid.learners.map((l) => learnerProgress(grid, l.id)).filter((p) => p.hasAnyMarks).sort((a, b) => b.overallPercentage - a.overallPercentage);
  const out = /* @__PURE__ */ new Map();
  let lastScore = null;
  let lastPos = 0;
  ranked.forEach((p, i) => {
    const pos = p.overallPercentage === lastScore ? lastPos : i + 1;
    lastScore = p.overallPercentage;
    lastPos = pos;
    out.set(p.learnerId, `${pos}/${ranked.length}`);
  });
  for (const l of grid.learners) if (!out.has(l.id)) out.set(l.id, "—");
  return out;
}
const cardMarkValue = (c) => {
  if (!c) return MARK.PENDING;
  if (c.status === "entered") return c.percentage ?? MARK.PENDING;
  if (c.status === "absent") return MARK.ABSENT;
  if (c.status === "not_conducted") return MARK.NOT_CONDUCTED;
  return MARK.PENDING;
};
function buildReportCard(grid, learnerId, ctx) {
  const p = learnerProgress(grid, learnerId);
  const learner = grid.learners.find((l) => l.id === learnerId);
  const positions = ctx.positions ?? classPositions(grid);
  const subjects = p.subjects.map((s) => ({
    subjectId: s.subjectId,
    subjectName: s.subjectName,
    teacherName: s.teacherName,
    week4: grid.activeExams.includes("week4") ? cardMarkValue(s.cells.week4) : MARK.PENDING,
    week8: grid.activeExams.includes("week8") ? cardMarkValue(s.cells.week8) : MARK.PENDING,
    endOfTerm: grid.activeExams.includes("endOfTerm") ? cardMarkValue(s.cells.endOfTerm) : MARK.PENDING,
    average: s.average,
    averagePercentage: s.average,
    grade: s.grade,
    gradeDescription: gradeDescription(s.grade),
    isComplete: s.isComplete,
    missingExams: s.pendingExams,
    comment: ""
  }));
  for (const s of subjects) s.comment = subjectCommentFor(s);
  const customId = learner?.studentId || learnerId;
  const card = {
    id: `report-${customId}-${ctx.term}-${ctx.year}`,
    studentId: customId,
    documentId: learnerId,
    studentName: p.name,
    className: ctx.className,
    classId: ctx.classId,
    form: ctx.form,
    gender: ctx.gender || learner?.gender || "Not specified",
    term: ctx.term,
    year: ctx.year,
    subjects,
    percentage: p.overallPercentage,
    grade: p.overallGrade,
    overallGrade: p.overallGrade,
    overallGradeDescription: gradeDescription(p.overallGrade),
    position: positions.get(learnerId) ?? "—",
    status: p.status,
    isComplete: p.isComplete,
    isProvisional: !p.isComplete,
    completionPercentage: p.completionPercentage,
    completedSubjects: p.completedSubjects,
    totalSubjects: p.totalSubjects,
    activeExams: grid.activeExams,
    examConfigSummary: grid.activeExams.length ? `Based on: ${grid.activeExams.map((e) => EXAM_LABELS[e]).join(" + ")}` : void 0,
    totalMarks: subjects.filter((s) => s.average >= 0).reduce((a, s) => a + s.average, 0),
    generatedDate: ctx.generatedDate ?? (/* @__PURE__ */ new Date()).toLocaleDateString("en-GB"),
    improvement: ctx.improvement ?? "stable",
    teachersComment: ctx.teachersComment ?? "",
    parentsPhone: ctx.parentsPhone ?? "",
    parentsEmail: ctx.parentsEmail ?? ""
  };
  card.teachersComment = ctx.teachersComment ?? teacherCommentFor(card);
  return card;
}
const SUBJECT_COMMENTS = {
  1: "Outstanding performance showing exceptional mastery across all assessments.",
  2: "Excellent work with strong understanding demonstrated consistently.",
  3: "Very good performance with solid comprehension throughout.",
  4: "Good grasp of concepts with consistent effort shown in all tests.",
  5: "Commendable effort showing satisfactory understanding overall.",
  6: "Acceptable performance meeting basic subject requirements.",
  7: "Fair performance across assessments; more practice and review needed.",
  8: "Below expectations; requires additional support and guidance.",
  9: "Needs immediate intervention and intensive remedial work."
};
function subjectCommentFor(s) {
  if (s.missingExams.length > 0) {
    return `Pending: ${s.missingExams.join(", ")}.${s.average >= 0 ? ` Average so far: ${s.average}%.` : ""}`;
  }
  if (s.average < 0) return "No assessment data available.";
  return SUBJECT_COMMENTS[s.grade] || "Assessment completed.";
}
function teacherCommentFor(card) {
  const valid = card.subjects.filter((s) => s.average >= 0);
  if (valid.length === 0) return "No marks have been entered yet for this term.";
  const sorted = [...valid].sort((a, b) => b.average - a.average);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];
  const passCount = valid.filter((s) => isPassPercentage(s.average)).length;
  const p = card.percentage;
  let text;
  if (p >= 70) {
    text = `Excellent overall performance with ${p}% average. Particularly strong in ${strongest.subjectName}. Keep up the outstanding work across all subjects!`;
  } else if (p >= 50) {
    text = `Good overall performance with ${passCount}/${valid.length} subjects passed (${p}% average). Focus more attention on ${weakest.subjectName} for improvement next term.`;
  } else if (isPassPercentage(p)) {
    text = `Satisfactory overall performance with ${passCount}/${valid.length} subjects passed (${p}% average). More effort is needed, especially in ${weakest.subjectName}.`;
  } else {
    text = `Performance requires improvement with ${p}% average. Need to focus on ${weakest.subjectName} and all core subjects. Additional support and remedial classes recommended.`;
  }
  if (card.isProvisional) {
    const pending = card.subjects.filter((s) => !s.isComplete).length;
    text = `PROVISIONAL — ${pending} subject${pending === 1 ? "" : "s"} still awaiting marks. ` + text;
  }
  return text;
}
const TERM_MONTHS = {
  TERM_1_START: 0,
  // January
  TERM_1_END: 3,
  // April
  TERM_2_START: 4,
  // May
  TERM_2_END: 7,
  // August
  TERM_3_START: 8,
  // September
  TERM_3_END: 11
  // December
};
function buildTermInfo(term, year, startDate, endDate, isCurrent = false) {
  return {
    term,
    year,
    startDate,
    endDate,
    label: formatTermLabel(term, year),
    shortLabel: `${term.replace("Term ", "T")} ${year}`,
    isCurrent
  };
}
function formatTermLabel(term, year) {
  return `${term} ${year}`;
}
function endOfDay(year, month, day) {
  const d = new Date(year, month, day, 23, 59, 59, 999);
  return d;
}
function startOfDay(year, month, day) {
  const d = new Date(year, month, day, 0, 0, 0, 0);
  return d;
}
function getCurrentAcademicTerm(date = /* @__PURE__ */ new Date()) {
  const month = date.getMonth();
  const calendarYear = date.getFullYear();
  if (month >= TERM_MONTHS.TERM_1_START && month <= TERM_MONTHS.TERM_1_END) {
    return buildTermInfo(
      "Term 1",
      calendarYear,
      startOfDay(calendarYear, 0, 1),
      // Jan 1
      endOfDay(calendarYear, 3, 30),
      // Apr 30
      true
    );
  }
  if (month >= TERM_MONTHS.TERM_2_START && month <= TERM_MONTHS.TERM_2_END) {
    return buildTermInfo(
      "Term 2",
      calendarYear,
      startOfDay(calendarYear, 4, 1),
      // May 1
      endOfDay(calendarYear, 7, 31),
      // Aug 31
      true
    );
  }
  if (month >= TERM_MONTHS.TERM_3_START && month <= TERM_MONTHS.TERM_3_END) {
    return buildTermInfo(
      "Term 3",
      calendarYear,
      startOfDay(calendarYear, 8, 1),
      // Sep 1
      endOfDay(calendarYear + 1, 0, 31),
      // Jan 31 (next year)
      true
    );
  }
  return buildTermInfo(
    "Term 1",
    calendarYear,
    startOfDay(calendarYear, 0, 1),
    endOfDay(calendarYear, 3, 30),
    true
  );
}
function getAllTermsForYear(year) {
  return [
    buildTermInfo(
      "Term 1",
      year,
      startOfDay(year, 0, 1),
      endOfDay(year, 3, 30)
    ),
    buildTermInfo(
      "Term 2",
      year,
      startOfDay(year, 4, 1),
      endOfDay(year, 7, 31)
    ),
    buildTermInfo(
      "Term 3",
      year,
      startOfDay(year, 8, 1),
      endOfDay(year + 1, 0, 31)
    )
  ];
}
function isCurrentTerm(term, year) {
  const current = getCurrentAcademicTerm();
  return current.term === term && current.year === year;
}
function getTermByName(term, year) {
  const validTerms = ["Term 1", "Term 2", "Term 3"];
  if (!validTerms.includes(term)) return null;
  const allTerms = getAllTermsForYear(year);
  return allTerms.find((t) => t.term === term) ?? null;
}
const toDate$2 = (timestamp) => {
  if (!timestamp) return void 0;
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp.toDate === "function") return timestamp.toDate();
  if (typeof timestamp.seconds === "number") {
    return new Date(timestamp.seconds * 1e3);
  }
  return void 0;
};
function cleanNotWritten(v) {
  if (!v || typeof v !== "object") return null;
  const out = {};
  for (const k of ["week4", "week8", "endOfTerm"]) {
    const ids = Array.isArray(v[k]) ? v[k].filter((x) => typeof x === "string" && x) : [];
    if (ids.length) out[k] = ids;
  }
  return Object.keys(out).length ? out : null;
}
function resolveTermMetadata(term, year) {
  const info = getTermByName(term, year);
  if (info) {
    return {
      termStartDate: info.startDate,
      termEndDate: info.endDate,
      termLabel: info.label,
      termShortLabel: info.shortLabel,
      isCurrentTerm: isCurrentTerm(term, year)
    };
  }
  const fallbackStart = new Date(year, 0, 1);
  const fallbackEnd = new Date(year, 3, 30);
  return {
    termStartDate: fallbackStart,
    termEndDate: fallbackEnd,
    termLabel: formatTermLabel(term, year),
    termShortLabel: `${term.replace("Term ", "T")} ${year}`,
    isCurrentTerm: false
  };
}
function enrichConfig(id, data) {
  const term = data.term ?? "Term 1";
  const year = data.year ?? (/* @__PURE__ */ new Date()).getFullYear();
  const meta = resolveTermMetadata(term, year);
  return {
    id,
    term,
    year,
    examTypes: data.examTypes || { week4: true, week8: true, endOfTerm: true },
    week4Date: data.week4Date,
    week8Date: data.week8Date,
    endOfTermDate: data.endOfTermDate,
    week4Deadline: data.week4Deadline ?? null,
    week8Deadline: data.week8Deadline ?? null,
    endOfTermDeadline: data.endOfTermDeadline ?? null,
    notWrittenBy: cleanNotWritten(data.notWrittenBy),
    notWrittenReason: data.notWrittenReason && typeof data.notWrittenReason === "object" ? data.notWrittenReason : null,
    week4TotalMarks: data.week4TotalMarks,
    week8TotalMarks: data.week8TotalMarks,
    endOfTermTotalMarks: data.endOfTermTotalMarks,
    isActive: data.isActive !== false,
    createdBy: data.createdBy,
    createdAt: toDate$2(data.createdAt),
    updatedAt: toDate$2(data.updatedAt),
    // ── Derived term metadata ──────────────────────────────────────────
    ...meta
  };
}
const examConfigService = {
  // ═══════════════════════════════════════════════════════════════════════
  // READ
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * Get exam configurations with optional filters.
   * Every returned config is enriched with its term window metadata.
   */
  getConfigs: async (filters) => {
    try {
      const configsRef = collection(db, "examConfigs");
      const constraints = [];
      if (filters?.year !== void 0) {
        constraints.push(where("year", "==", filters.year));
      }
      if (filters?.term) {
        constraints.push(where("term", "==", filters.term));
      }
      if (filters?.isActive !== void 0) {
        constraints.push(where("isActive", "==", filters.isActive));
      }
      let q;
      if (constraints.length > 0) {
        q = query(configsRef, ...constraints, orderBy("createdAt", "desc"));
      } else {
        q = query(
          configsRef,
          orderBy("year", "desc"),
          orderBy("term"),
          orderBy("createdAt", "desc")
        );
      }
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => enrichConfig(d.id, d.data()));
    } catch (error) {
      console.error("Error fetching exam configs:", error);
      throw error;
    }
  },
  /**
   * Get a single exam configuration by ID.
   * Returns `null` if it doesn't exist.
   */
  getConfigById: async (configId) => {
    try {
      const configRef = doc(db, "examConfigs", configId);
      const configDoc = await getDoc(configRef);
      if (!configDoc.exists()) return null;
      return enrichConfig(configDoc.id, configDoc.data());
    } catch (error) {
      console.error("Error fetching exam config:", error);
      throw error;
    }
  },
  /**
   * Get the ACTIVE configuration for a specific term and year.
   * Returns the most recently created active config, or `null`.
   */
  getActiveConfigForTerm: async (term, year) => {
    try {
      const configsRef = collection(db, "examConfigs");
      const q = query(
        configsRef,
        where("term", "==", term),
        where("year", "==", year),
        where("isActive", "==", true),
        orderBy("createdAt", "desc"),
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;
      const docSnapshot = snapshot.docs[0];
      return enrichConfig(docSnapshot.id, docSnapshot.data());
    } catch (error) {
      console.error("Error fetching active exam config:", error);
      throw error;
    }
  },
  /**
   * NEW: Get the active configuration for the CURRENT academic term
   * (auto-detected from the real-time calendar).
   *
   * This is the preferred method for dashboards and warnings.
   */
  getCurrentTermConfig: async () => {
    const { term, year } = getCurrentAcademicTerm();
    return examConfigService.getActiveConfigForTerm(term, year);
  },
  // ═══════════════════════════════════════════════════════════════════════
  // WRITE
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * Create a new exam configuration.
   *
   * Term-window metadata (termStartDate, termEndDate, termLabel, etc.)
   * is derived automatically — callers must NOT supply it.
   */
  createConfig: async (data) => {
    try {
      if (!data.term || data.year === void 0) {
        throw new Error("createConfig requires both `term` and `year`.");
      }
      const configData = {
        term: data.term,
        year: data.year,
        examTypes: data.examTypes || {
          week4: true,
          week8: true,
          endOfTerm: true
        },
        week4Date: data.week4Date ?? null,
        week8Date: data.week8Date ?? null,
        endOfTermDate: data.endOfTermDate ?? null,
        week4Deadline: data.week4Deadline ?? null,
        week8Deadline: data.week8Deadline ?? null,
        endOfTermDeadline: data.endOfTermDeadline ?? null,
        notWrittenBy: cleanNotWritten(data.notWrittenBy),
        notWrittenReason: data.notWrittenReason ?? null,
        week4TotalMarks: data.week4TotalMarks ?? 100,
        week8TotalMarks: data.week8TotalMarks ?? 100,
        endOfTermTotalMarks: data.endOfTermTotalMarks ?? 100,
        isActive: true,
        createdBy: data.createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      const configsRef = collection(db, "examConfigs");
      const docRef = await addDoc(configsRef, configData);
      return docRef.id;
    } catch (error) {
      console.error("Error creating exam config:", error);
      throw error;
    }
  },
  /**
   * Update an existing exam configuration.
   * Derived term-metadata fields are NOT writable.
   */
  updateConfig: async (configId, updates) => {
    try {
      const configRef = doc(db, "examConfigs", configId);
      const clean = Object.fromEntries(
        Object.entries(updates).map(([k, v]) => [k, v === void 0 ? null : v])
      );
      await updateDoc(configRef, {
        ...clean,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error updating exam config:", error);
      throw error;
    }
  },
  /**
   * Delete an exam configuration (hard delete).
   */
  deleteConfig: async (configId) => {
    try {
      const configRef = doc(db, "examConfigs", configId);
      await deleteDoc(configRef);
    } catch (error) {
      console.error("Error deleting exam config:", error);
      throw error;
    }
  },
  /**
   * Deactivate a configuration (soft delete).
   * Preserves historical data while hiding it from active views.
   */
  deactivateConfig: async (configId) => {
    try {
      const configRef = doc(db, "examConfigs", configId);
      await updateDoc(configRef, {
        isActive: false,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error deactivating exam config:", error);
      throw error;
    }
  },
  // ═══════════════════════════════════════════════════════════════════════
  // BULK OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * Copy configurations from one term to another.
   * Term-window metadata is NOT copied — it's always derived at read-time.
   */
  copyConfigs: async (fromYear, fromTerm, toYear, toTerm) => {
    try {
      const configsRef = collection(db, "examConfigs");
      const q = query(
        configsRef,
        where("year", "==", fromYear),
        where("term", "==", fromTerm)
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        throw new Error(
          `No configurations found for ${fromTerm} ${fromYear}.`
        );
      }
      const batch = writeBatch(db);
      snapshot.docs.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        const newConfigRef = doc(collection(db, "examConfigs"));
        const {
          termStartDate: _ignoreTermStart,
          termEndDate: _ignoreTermEnd,
          termLabel: _ignoreTermLabel,
          termShortLabel: _ignoreTermShort,
          isCurrentTerm: _ignoreIsCurrent,
          id: _ignoreId,
          createdAt: _ignoreCreatedAt,
          updatedAt: _ignoreUpdatedAt,
          // Deadlines are dates of the source term: never carry them over.
          week4Deadline: _ignoreW4Deadline,
          week8Deadline: _ignoreW8Deadline,
          endOfTermDeadline: _ignoreEotDeadline,
          // Which classes skip a test is decided per term (e.g. Grade 12
          // only skips End of Term in Term 3): never carried over.
          notWrittenBy: _ignoreNotWritten,
          notWrittenReason: _ignoreNotWrittenReason,
          ...copyable
        } = data;
        batch.set(newConfigRef, {
          ...copyable,
          week4Deadline: null,
          week8Deadline: null,
          endOfTermDeadline: null,
          notWrittenBy: null,
          notWrittenReason: null,
          term: toTerm,
          year: toYear,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
      console.log(
        `✅ Copied ${snapshot.size} config(s) from ${fromTerm} ${fromYear} → ${toTerm} ${toYear}`
      );
    } catch (error) {
      console.error("Error copying exam configs:", error);
      throw error;
    }
  },
  // ═══════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * Check whether an active config exists for a given term/year.
   */
  hasActiveConfig: async (term, year) => {
    const config = await examConfigService.getActiveConfigForTerm(term, year);
    return config !== null;
  },
  /**
   * Convenience: list all active configs for the current academic term.
   * (Normally there's just one, but this handles edge cases.)
   */
  getCurrentTermConfigs: async () => {
    const { term, year } = getCurrentAcademicTerm();
    return examConfigService.getConfigs({
      term,
      year,
      isActive: true
    });
  }
};
const ENROLLMENTS = "enrollments";
const enrollmentId = (learnerId, year) => `${learnerId}_${year}`;
const isPermissionDenied$1 = (e) => e?.code === "permission-denied" || /missing or insufficient permissions/i.test(e?.message ?? "");
const mapEnrollment = (d) => ({
  learnerId: d.learnerId,
  year: Number(d.year),
  classId: d.classId,
  className: d.className || "",
  classType: d.classType,
  classLevel: d.classLevel,
  classSection: d.classSection,
  studentId: d.studentId || "",
  studentIndex: typeof d.studentIndex === "number" ? d.studentIndex : void 0,
  fullName: d.fullName || "",
  gender: d.gender,
  outcome: d.outcome,
  nextClassId: d.nextClassId ?? null,
  nextClassName: d.nextClassName ?? null,
  nextStudentId: d.nextStudentId ?? null,
  closed: d.closed === true,
  runId: d.runId || "",
  sbaMoves: d.sbaMoves || [],
  createdAt: d.createdAt
});
async function loadClosedClassEnrollments(classId, year) {
  if (!classId || !Number.isFinite(year)) return null;
  try {
    const snap = await getDocs(query(
      collection(db, ENROLLMENTS),
      where("classId", "==", classId),
      where("year", "==", year)
    ));
    const rows = snap.docs.map((d) => mapEnrollment(d.data())).filter((e) => e.closed);
    return rows.length > 0 ? rows : null;
  } catch (e) {
    if (isPermissionDenied$1(e)) return null;
    throw e;
  }
}
async function classIdForYear(learnerId, fallbackClassId, year) {
  if (!learnerId || !Number.isFinite(year)) return fallbackClassId;
  try {
    const snap = await getDoc(doc(db, ENROLLMENTS, enrollmentId(learnerId, year)));
    if (snap.exists()) {
      const e = mapEnrollment(snap.data());
      if (e.closed && e.classId) return e.classId;
    }
  } catch (e) {
    if (!isPermissionDenied$1(e)) throw e;
  }
  return fallbackClassId;
}
const isPermissionDenied = (e) => e?.code === "permission-denied" || /missing or insufficient permissions/i.test(e?.message ?? "");
const currentTerm = () => {
  const t = getCurrentAcademicTerm();
  return { term: t.term, year: t.year };
};
async function loadTermContext(term, year, opts = {}) {
  const cur = currentTerm();
  const t = term || cur.term;
  const y = year ?? cur.year;
  try {
    const configs = await examConfigService.getConfigs({ year: y, term: t });
    const config = pickTermConfig(configs, t, y);
    return { term: t, year: y, config, activeExams: activeExamsFor(config) };
  } catch (e) {
    if (opts.publicFallback && isPermissionDenied(e)) {
      return { term: t, year: y, config: void 0, activeExams: [...ALL_EXAM_TYPES], degraded: true };
    }
    throw e;
  }
}
const learnerFromDoc = (id, d) => ({
  id,
  studentId: d.studentId || "",
  name: d.fullName || d.name || d.studentName || "Unknown",
  status: d.status,
  gender: d.gender,
  studentIndex: typeof d.studentIndex === "number" ? d.studentIndex : void 0,
  classId: d.classId
});
async function loadClassRoster(classId, opts = {}) {
  if (opts.year !== void 0 && opts.year !== null) {
    const closed = await loadClosedClassEnrollments(classId, Number(opts.year));
    if (closed) {
      return buildRoster(closed.map((e) => ({
        id: e.learnerId,
        studentId: e.studentId,
        name: e.fullName || "Unknown",
        status: "active",
        gender: e.gender,
        studentIndex: e.studentIndex,
        classId: e.classId
      })));
    }
  }
  const snap = await getDocs(query(collection(db, "learners"), where("classId", "==", classId)));
  return buildRoster(snap.docs.map((d) => learnerFromDoc(d.id, d.data())));
}
const slotKeyFor = (classId, normalizedSubject) => slotIdForNormalized(classId, normalizedSubject).slice(classId.length + 2);
const subjectFromSlot = (slot, now) => {
  const auth2 = resolveAuthority(slot, now);
  const normalized = normalizeSubjectName(slot.normalizedSubject || slot.subject);
  return {
    subjectId: normalized,
    // A known subject shows its proper name, however the slot was typed.
    subjectName: isKnownSubject(normalized) ? normalized : slot.subject || normalized,
    ownerTeacherId: slot.ownerTeacherId,
    ownerTeacherName: slot.ownerTeacherName,
    operatorTeacherId: auth2.operatorTeacherId,
    operatorTeacherName: auth2.operatorTeacherName,
    operatorRole: auth2.operatorRole,
    slotKey: slot.id.startsWith(`${slot.classId}__`) ? slot.id.slice(slot.classId.length + 2) : slotKeyFor(slot.classId, normalized),
    isVacant: !auth2.operatorTeacherId && !slot.ownerTeacherId
  };
};
async function subjectsFromAssignments(classId, now) {
  const snap = await getDocs(query(collection(db, "teacher_assignments"), where("classId", "==", classId)));
  const bySubject = /* @__PURE__ */ new Map();
  for (const d of snap.docs) {
    const a = d.data();
    if (a.status === "ended") continue;
    const raw = (a.subject || "").trim();
    if (!raw || raw === FORM_TEACHER_SUBJECT || a.normalizedSubject === FORM_TEACHER_SLOT) continue;
    const isDelegate = a.roleType === "tp" || a.roleType === "leave-cover";
    const end = a.endDate?.toDate ? a.endDate.toDate() : a.endDate ? new Date(a.endDate) : null;
    const start = a.startDate?.toDate ? a.startDate.toDate() : a.startDate ? new Date(a.startDate) : null;
    if (isDelegate && end && end < now) continue;
    const delegateLive = isDelegate && (!start || start <= now);
    const normalized = a.normalizedSubject || normalizeSubjectName(raw);
    const entry = bySubject.get(normalized) ?? {
      subjectId: normalized,
      subjectName: raw,
      ownerTeacherId: null,
      ownerTeacherName: null,
      operatorTeacherId: null,
      operatorTeacherName: null,
      operatorRole: null,
      slotKey: slotKeyFor(classId, normalized),
      isVacant: true
    };
    if (!isDelegate) {
      entry.ownerTeacherId = a.teacherId ?? null;
      entry.ownerTeacherName = a.teacherName ?? null;
      if (entry.operatorRole !== "leave-cover" && entry.operatorRole !== "tp") {
        entry.operatorTeacherId = a.teacherId ?? null;
        entry.operatorTeacherName = a.teacherName ?? null;
        entry.operatorRole = "owner";
      }
    } else if (delegateLive) {
      entry.operatorTeacherId = a.teacherId ?? null;
      entry.operatorTeacherName = a.teacherName ?? null;
      entry.operatorRole = a.roleType;
    }
    entry.isVacant = !entry.operatorTeacherId && !entry.ownerTeacherId;
    bySubject.set(normalized, entry);
  }
  return [...bySubject.values()];
}
async function loadClassSubjects(classId, now = /* @__PURE__ */ new Date()) {
  const slotSnap = await getDocs(query(collection(db, "class_slots"), where("classId", "==", classId)));
  const slots = slotSnap.docs.map((d) => mapSlot(d.id, d.data())).filter((s) => !s.isFormTeacherSlot);
  const subjects = slots.length > 0 ? mergeSameSubject(slots.map((s) => subjectFromSlot(s, now))) : await subjectsFromAssignments(classId, now);
  return subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
}
function mergeSameSubject(subjects) {
  const by = /* @__PURE__ */ new Map();
  for (const s of subjects) {
    const prev = by.get(s.subjectId);
    if (!prev || prev.isVacant && !s.isVacant) by.set(s.subjectId, s);
  }
  return [...by.values()];
}
function gridSubjects(subjects, results) {
  const withMarks = new Set(results.map((r) => r.subjectId));
  return subjects.filter((s) => !s.isVacant || withMarks.has(s.subjectId));
}
const resultFromDoc = (d) => ({
  studentId: d.studentId,
  // Marks saved under another spelling of the subject belong to the same
  // subject (Results Data Check → "Same subject, different spellings" fixes
  // the stored rows).
  subjectId: normalizeSubjectName(d.subjectId || ""),
  examType: d.examType,
  marks: typeof d.marks === "number" ? d.marks : Number(d.marks),
  totalMarks: d.totalMarks,
  percentage: d.percentage,
  updatedAt: d.updatedAt,
  classId: d.classId,
  teacherId: d.teacherId
});
async function loadClassResults(classId, term, year) {
  const snap = await getDocs(query(
    collection(db, "results"),
    where("classId", "==", classId),
    where("term", "==", term),
    where("year", "==", year)
  ));
  return snap.docs.map((d) => resultFromDoc(d.data()));
}
async function loadClassInfo(classId) {
  const snap = await getDoc(doc(db, "classes", classId));
  if (!snap.exists()) throw new Error("Class not found");
  const d = snap.data();
  return { id: classId, name: d.name || "Unknown class", form: d.level?.toString() || "1" };
}
async function loadClassGrid(classId, term, year, opts = {}) {
  const ctx = opts.ctx ?? await loadTermContext(term, year, { publicFallback: opts.publicFallback });
  let degraded = !!ctx.degraded;
  const [classInfo, learners, results] = await Promise.all([
    opts.classInfo ? Promise.resolve(opts.classInfo) : loadClassInfo(classId),
    loadClassRoster(classId, { year: ctx.year }),
    opts.termResults ? Promise.resolve(opts.termResults.filter((r) => r.classId === classId)) : loadClassResults(classId, ctx.term, ctx.year)
  ]);
  let allSubjects;
  try {
    allSubjects = await loadClassSubjects(classId);
  } catch (e) {
    if (!opts.publicFallback || !isPermissionDenied(e)) throw e;
    degraded = true;
    const seen = /* @__PURE__ */ new Map();
    for (const r of results) {
      if (!seen.has(r.subjectId)) {
        seen.set(r.subjectId, {
          subjectId: r.subjectId,
          subjectName: r.subjectId,
          ownerTeacherId: null,
          ownerTeacherName: null,
          operatorTeacherId: null,
          operatorTeacherName: null,
          operatorRole: null,
          slotKey: slotKeyFor(classId, r.subjectId),
          isVacant: true
        });
      }
    }
    allSubjects = [...seen.values()].sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  }
  const subjects = gridSubjects(allSubjects, results);
  const activeExams = ctx.activeExams.filter((e) => isExamWrittenBy(ctx.config, e, classId));
  const grid = buildResultsGrid({ learners, subjects, activeExams, results });
  return { grid, classInfo, term: ctx.term, year: ctx.year, config: ctx.config, allSubjects, degraded };
}
const COLLECTIONS = {
  RESULTS: "results",
  LEARNERS: "learners",
  CLASSES: "classes",
  TEACHER_ASSIGNMENTS: "teacher_assignments",
  REPORT_CARDS: "report_cards"
};
const SUBJECT_NORMALIZATION_MAP = {
  // --- STEM ---
  "Mathematics": "Mathematics",
  "Maths": "Mathematics",
  "Math": "Mathematics",
  "Additional Mathematics": "Additional Mathematics",
  "Add Maths": "Additional Mathematics",
  "Add Math": "Additional Mathematics",
  "Integrated Science": "Integrated Science",
  "Int Science": "Integrated Science",
  "IS": "Integrated Science",
  "Physics": "Physics",
  "Phy": "Physics",
  "Chemistry": "Chemistry",
  "Chem": "Chemistry",
  "Biology": "Biology",
  "Bio": "Biology",
  "Agricultural Science": "Agricultural Science",
  "Agric": "Agricultural Science",
  "Agriculture": "Agricultural Science",
  "Computer Science": "Computer Science",
  "Comp Sci": "Computer Science",
  "Computing": "Computer Science",
  "ICT": "ICT",
  "Computer Studies": "ICT",
  // --- Humanities ---
  "Geography": "Geography",
  "Geo": "Geography",
  "History": "History",
  "Hist": "History",
  "Civic Education": "Civic Education",
  "Civic Educ": "Civic Education",
  "Civics": "Civic Education",
  "Religious Education": "Religious Education",
  "RE": "Religious Education",
  "Religious Studies": "Religious Education",
  "Social Studies": "Social Studies",
  "Social": "Social Studies",
  // --- Languages ---
  "English": "English",
  "English Language": "English",
  "Eng": "English",
  "Literature in English": "Literature in English",
  "Literature": "Literature in English",
  "Lit": "Literature in English",
  "French": "French",
  "FRE": "French",
  "Chinese": "Chinese",
  "CHI": "Chinese",
  "Portuguese": "Portuguese",
  "POR": "Portuguese",
  "Swahili": "Swahili",
  "SWA": "Swahili",
  "Icibemba": "Icibemba",
  "Bemba": "Icibemba",
  "Cinyanja": "Cinyanja",
  "Nyanja": "Cinyanja",
  "Chitonga": "Chitonga",
  "Tonga": "Chitonga",
  "Silozi": "Silozi",
  "Lozi": "Silozi",
  "Kiikaonde": "Kiikaonde",
  "Kaonde": "Kiikaonde",
  "Lunda": "Lunda",
  "Luvale": "Luvale",
  // --- Business ---
  "Business Studies": "Business Studies",
  "Business": "Business Studies",
  "Commerce": "Commerce",
  "Comm": "Commerce",
  "Principles of Accounts": "Principles of Accounts",
  "Accounts": "Principles of Accounts",
  "Accounting": "Principles of Accounts",
  "POA": "Principles of Accounts",
  "Economics": "Economics",
  "Econ": "Economics",
  // --- Technical / Vocational ---
  "Design & Technology": "Design & Technology",
  "Design and Technology": "Design & Technology",
  "Technical Drawing": "Design & Technology",
  "DT": "Design & Technology",
  "Food & Nutrition": "Food & Nutrition",
  "Food and Nutrition": "Food & Nutrition",
  "Foods": "Food & Nutrition",
  "Home Economics": "Home Economics",
  "Home Econ": "Home Economics",
  "HE": "Home Economics",
  "Fashion & Fabrics": "Fashion & Fabrics",
  "Fashion and Fabrics": "Fashion & Fabrics",
  "Fashion": "Fashion & Fabrics",
  "Hospitality Management": "Hospitality Management",
  "Hospitality": "Hospitality Management",
  "Travel & Tourism": "Travel & Tourism",
  "Travel and Tourism": "Travel & Tourism",
  "Tourism": "Travel & Tourism",
  "Physical Education": "Physical Education",
  "PE": "Physical Education",
  "Art & Design": "Art & Design",
  "Art and Design": "Art & Design",
  "Art": "Art & Design",
  "Design": "Art & Design",
  "Music": "Music",
  "MUS": "Music"
};
const SUBJECT_SMS_ABBREVIATIONS = {
  // ----- STEM & Natural Sciences -----
  "Mathematics": "MATH",
  "Additional Mathematics": "ADMA",
  "Integrated Science": "IS",
  "Physics": "PHY",
  "Chemistry": "CHEM",
  "Biology": "BIO",
  "Agricultural Science": "AGR",
  "Computer Science": "CS",
  "ICT": "ICT",
  // ----- Social Sciences & Humanities -----
  "Geography": "GEO",
  "History": "HIST",
  "Civic Education": "CIV",
  "Religious Education": "RE",
  "Social Studies": "SOC",
  // ----- Languages & Literature -----
  "English": "ENG",
  "Literature in English": "LIT",
  "French": "FRE",
  "Chinese": "CHI",
  "Portuguese": "POR",
  "Swahili": "SWA",
  "Icibemba": "BEM",
  "Cinyanja": "NYA",
  "Chitonga": "TON",
  "Silozi": "SIL",
  "Kiikaonde": "KIK",
  "Lunda": "LUN",
  "Luvale": "LUV",
  // ----- Business & Commercial -----
  "Business Studies": "BS",
  "Commerce": "COM",
  "Principles of Accounts": "PA",
  "Economics": "ECON",
  // ----- Technical, Practical & Vocational -----
  "Design & Technology": "DT",
  "Food & Nutrition": "FN",
  "Home Economics": "HE",
  "Fashion & Fabrics": "FF",
  "Hospitality Management": "HM",
  "Travel & Tourism": "TT",
  "Physical Education": "PE",
  "Art & Design": "ART",
  "Music": "MUS"
};
const GRADE_SYSTEM = {
  1: { min: 75, max: 100, description: "Distinction" },
  2: { min: 70, max: 74, description: "Distinction" },
  3: { min: 65, max: 69, description: "Merit" },
  4: { min: 60, max: 64, description: "Merit" },
  5: { min: 55, max: 59, description: "Credit" },
  6: { min: 50, max: 54, description: "Credit" },
  7: { min: 45, max: 49, description: "Satisfactory" },
  8: { min: 40, max: 44, description: "Satisfactory" },
  9: { min: 0, max: 39, description: "Unsatisfactory" }
};
const normalizeSubjectName = makeSubjectNormalizer(SUBJECT_NORMALIZATION_MAP);
const KNOWN_SUBJECTS = new Set(Object.values(SUBJECT_NORMALIZATION_MAP));
const isKnownSubject = (name) => KNOWN_SUBJECTS.has(name);
function readResult(d) {
  const r = d;
  const subjectId = normalizeSubjectName(r.subjectId || "");
  return { ...r, subjectId, subjectName: isKnownSubject(subjectId) ? subjectId : r.subjectName };
}
const getSubjectSmsCode = (subjectName) => {
  if (!subjectName) return "???";
  const normalized = normalizeSubjectName(subjectName);
  if (SUBJECT_SMS_ABBREVIATIONS[normalized]) {
    return SUBJECT_SMS_ABBREVIATIONS[normalized];
  }
  const firstWord = normalized.trim().split(/\s+/)[0] || "???";
  return firstWord.substring(0, 3).toUpperCase();
};
const getGradeShortCode = (gradeNum) => {
  const map = {
    1: "D1",
    2: "D2",
    3: "M1",
    4: "M2",
    5: "C1",
    6: "C2",
    7: "S1",
    8: "S2",
    9: "U"
  };
  return map[gradeNum] || "-";
};
const calculateGrade = (percentage) => gradeForPercentage(percentage);
const getGradeDescription = (grade) => {
  if (grade === -1) return "Incomplete";
  const gradeKey = grade;
  return GRADE_SYSTEM[gradeKey]?.description || "Unknown";
};
const formatStudentResultsSMS = (payload, options = {}) => {
  const {
    includeHeader = true,
    footer = "Kalabo Sec School",
    includeGrade = true,
    maxSubjects = 20
  } = options;
  const lines = [];
  if (includeHeader) {
    const termShort = (payload.term || "").replace(/^Term\s*/i, "T");
    lines.push(`KALABO SEC - ${termShort} ${payload.year}`);
  }
  const idPart = payload.studentId ? ` (${payload.studentId})` : "";
  const classPart = payload.className ? ` ${payload.className}` : "";
  lines.push(`${payload.studentName}${idPart}${classPart}`);
  const subjects = (payload.subjects || []).slice(0, maxSubjects);
  const subjectTokens = subjects.filter((s) => typeof s.percentage === "number" && s.percentage >= 0).map((s) => `${getSubjectSmsCode(s.subjectName)} ${s.percentage}`);
  if (subjectTokens.length > 0) {
    lines.push(subjectTokens.join(" "));
  }
  const gradePart = includeGrade && payload.overallGrade > 0 ? ` (${getGradeShortCode(payload.overallGrade)})` : "";
  lines.push(`AVG ${payload.overallPercentage}${gradePart}${payload.provisional ? " PROVISIONAL" : ""}`);
  if (footer && footer.trim()) {
    lines.push(footer.trim());
  }
  return lines.join("\n");
};
const isGsm7 = (text) => {
  const gsm7Basic = `@£$¥èéùìòÇ
Øø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà`;
  for (let i = 0; i < text.length; i++) {
    if (!gsm7Basic.includes(text[i])) {
      if (text[i] === "{" || text[i] === "}" || text[i] === "[" || text[i] === "]" || text[i] === "~" || text[i] === "|" || text[i] === "^" || text[i] === "\\") {
        continue;
      }
      return false;
    }
  }
  return true;
};
const getSmsSegments = (text) => {
  const length = text.length;
  const gsm = isGsm7(text);
  if (gsm) {
    return {
      length,
      encoding: "GSM-7",
      segments: length <= 160 ? 1 : Math.ceil(length / 153)
    };
  }
  return {
    length,
    encoding: "UCS-2",
    segments: length <= 70 ? 1 : Math.ceil(length / 67)
  };
};
class ResultsService {
  resultsCollection = collection(db, COLLECTIONS.RESULTS);
  learnersCollection = collection(db, COLLECTIONS.LEARNERS);
  classesCollection = collection(db, COLLECTIONS.CLASSES);
  teacherAssignmentsCollection = collection(db, COLLECTIONS.TEACHER_ASSIGNMENTS);
  reportCardsCollection = collection(db, COLLECTIONS.REPORT_CARDS);
  async initialize() {
    try {
      console.log("🔌 Initializing ResultsService...");
      const testQuery = query(this.teacherAssignmentsCollection, limit(1));
      const snapshot = await getDocs(testQuery);
      console.log(`✅ Connected to Firestore, found ${snapshot.size} teacher assignments`);
      return { success: true };
    } catch (error) {
      console.error("❌ Failed to initialize:", error);
      return {
        success: false,
        error: error.code === "permission-denied" ? "Permission denied. Check Firebase rules." : "Failed to connect to Firestore"
      };
    }
  }
  // ==================== LEARNER METHODS ====================
  async getLearnersInClass(classId) {
    try {
      console.log(`🔍 Fetching learners for class: ${classId}`);
      const learnersQuery = query(
        this.learnersCollection,
        where("classId", "==", classId)
      );
      const snapshot = await getDocs(learnersQuery);
      const learners = snapshot.docs.map((doc2) => {
        const data = doc2.data();
        const name = data.name || data.studentName || data.fullName || "Unknown";
        const customStudentId = data.studentId || data.id || data.registrationNumber || data.admissionNumber || doc2.id;
        return {
          id: customStudentId,
          name,
          data: { ...data, firestoreDocId: doc2.id },
          documentId: doc2.id
        };
      });
      console.log(`✅ Found ${learners.length} learners in class ${classId}`);
      return learners;
    } catch (error) {
      console.error(`❌ Error fetching learners:`, error);
      return [];
    }
  }
  async getLearnerCountInClass(classId) {
    try {
      const learners = await this.getLearnersInClass(classId);
      return learners.length;
    } catch (error) {
      console.error(`❌ Error getting learner count:`, error);
      return 0;
    }
  }
  /**
   * Find a learner by Firestore document id (preferred) or custom id.
   * If several learners share a custom id, an active one is preferred.
   */
  async resolveStudentDocument(inputId) {
    if (!inputId) return null;
    try {
      const docSnap = await getDoc(doc(this.learnersCollection, inputId));
      if (docSnap.exists()) {
        const data = docSnap.data();
        return { documentId: inputId, customId: data.studentId || inputId, data };
      }
    } catch {
    }
    const customSnapshot = await getDocs(query(this.learnersCollection, where("studentId", "==", inputId)));
    if (customSnapshot.empty) return null;
    const pick = customSnapshot.docs.find((d) => (d.data().status ?? "active") === "active") ?? customSnapshot.docs[0];
    return { documentId: pick.id, customId: inputId, data: pick.data() };
  }
  // ==================== TEACHER ASSIGNMENTS ====================
  /**
   * The subjects a class currently takes and who is responsible for each.
   *
   * Source: class_slots (or current assignment rows before the slot
   * migration) via the shared grid loader. Ended assignment rows and the
   * Form Teacher role are NOT subjects — counting them made removed subjects
   * and the Form Teacher show up as "expected" on report cards.
   *
   * `teacherId` is whoever may enter marks right now (live cover/TP, else
   * the owner). `id` is the slot key.
   */
  async getTeacherAssignmentsForClass(classId) {
    const subjects = await loadClassSubjects(classId);
    return subjects.filter((s) => !s.isVacant).map((s) => ({
      id: s.slotKey,
      subject: s.subjectName,
      subjectId: s.subjectId,
      teacherId: s.operatorTeacherId || s.ownerTeacherId || "unknown",
      teacherName: s.operatorTeacherName || s.ownerTeacherName || "Not Assigned",
      classId
    }));
  }
  async getExpectedSubjectsForClass(classId) {
    const assignments = await this.getTeacherAssignmentsForClass(classId);
    return assignments.map((a) => ({ id: a.subjectId, name: a.subject }));
  }
  // ==================== RESULTS QUERIES ====================
  async getStudentResults(studentDocumentId, filters) {
    try {
      const constraints = [where("studentId", "==", studentDocumentId)];
      if (filters?.term) constraints.push(where("term", "==", filters.term));
      if (filters?.year) constraints.push(where("year", "==", filters.year));
      if (filters?.subjectId) {
        constraints.push(where("subjectId", "==", normalizeSubjectName(filters.subjectId)));
      }
      const q = query(this.resultsCollection, ...constraints, orderBy("subjectName"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc2) => readResult(doc2.data()));
    } catch (error) {
      console.error("Error fetching student results:", error);
      return [];
    }
  }
  async getTeacherResults(teacherId, filters) {
    try {
      const constraints = [where("teacherId", "==", teacherId)];
      if (filters?.classId) constraints.push(where("classId", "==", filters.classId));
      if (filters?.subjectId) {
        constraints.push(where("subjectId", "==", normalizeSubjectName(filters.subjectId)));
      }
      if (filters?.term) constraints.push(where("term", "==", filters.term));
      if (filters?.year) constraints.push(where("year", "==", filters.year));
      const q = query(this.resultsCollection, ...constraints);
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc2) => readResult(doc2.data()));
    } catch (error) {
      console.error("Error fetching teacher results:", error);
      return [];
    }
  }
  async getAllResults(filters) {
    try {
      const constraints = [];
      if (filters?.classId) constraints.push(where("classId", "==", filters.classId));
      if (filters?.subjectId) {
        constraints.push(where("subjectId", "==", normalizeSubjectName(filters.subjectId)));
      }
      if (filters?.term) constraints.push(where("term", "==", filters.term));
      if (filters?.year) constraints.push(where("year", "==", filters.year));
      if (filters?.examType) constraints.push(where("examType", "==", filters.examType));
      const q = constraints.length > 0 ? query(this.resultsCollection, ...constraints) : query(this.resultsCollection);
      const snapshot = await getDocs(q);
      const results = snapshot.docs.map((doc2) => readResult(doc2.data()));
      return results.sort((a, b) => {
        if (a.className !== b.className) return a.className.localeCompare(b.className);
        return a.studentName.localeCompare(b.studentName);
      });
    } catch (error) {
      console.error("Error fetching all results:", error);
      return [];
    }
  }
  async getClassSubjectResults(classId, subjectId, filters) {
    try {
      const constraints = [
        where("classId", "==", classId),
        where("subjectId", "==", normalizeSubjectName(subjectId))
      ];
      if (filters?.term) constraints.push(where("term", "==", filters.term));
      if (filters?.year) constraints.push(where("year", "==", filters.year));
      if (filters?.examType) constraints.push(where("examType", "==", filters.examType));
      const q = query(this.resultsCollection, ...constraints, orderBy("studentName"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc2) => readResult(doc2.data()));
    } catch (error) {
      console.error("Error fetching class subject results:", error);
      return [];
    }
  }
  async checkExistingResults(classId, subjectId, examType, term, year) {
    try {
      const q = query(
        this.resultsCollection,
        where("classId", "==", classId),
        where("subjectId", "==", normalizeSubjectName(subjectId)),
        where("examType", "==", examType),
        where("term", "==", term),
        where("year", "==", year)
      );
      const snapshot = await getDocs(q);
      const results = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
      return {
        exists: results.length > 0,
        count: results.length,
        results
      };
    } catch (error) {
      console.error("Error checking existing results:", error);
      throw error;
    }
  }
  // ==================== SAVE RESULTS ====================
  /**
   * Save marks for one class + subject + exam.
   *
   * - Learners are matched by Firestore document id (custom ids are still
   *   accepted for older callers). Learners who are not active members of the
   *   class are NOT silently dropped: they are returned in `skipped`.
   * - Marks must be -1 (absent), -2 (not conducted) or 0..totalMarks.
   * - The subject's owner (even while covered) or a live cover/TP teacher
   *   may save. Firestore rules enforce the same once
   *   system/assignmentEngine.enforceAuthority is switched on.
   * - Rows carry `normalizedSubject` (the slot key) plus `enteredBy` (set
   *   once, on create) and `lastEditedBy`, which the rules require.
   * - Only learners passed in `results` are written; other saved marks for
   *   the same exam are left as they are.
   */
  async saveClassResults(data, options) {
    const normalizedSubjectId = normalizeSubjectName(data.subjectId);
    const normalizedSubjectName = normalizeSubjectName(data.subjectName);
    const year = Number(data.year);
    const totalMarks = Number(data.totalMarks);
    if (!Number.isInteger(year)) throw new Error("Invalid year.");
    if (!(totalMarks > 0)) {
      throw new Error("Total marks for this exam are not set. Ask the admin to set them in Exam Management.");
    }
    const slot = await isEngineReady() ? await this.assertCanEnterMarks(data.teacherId, data.classId, data.subjectId) : null;
    const existing = await this.checkExistingResults(
      data.classId,
      normalizedSubjectId,
      data.examType,
      data.term,
      year
    );
    if (existing.exists && !options?.overwrite) {
      throw new Error(
        `Results already exist for ${normalizedSubjectName} - ${data.examType}. Use overwrite option to replace.`
      );
    }
    const existingIds = new Set(existing.results.map((r) => r.id));
    const [classDoc, roster] = await Promise.all([
      getDoc(doc(this.classesCollection, data.classId)),
      // The class's learners in the term's year (a closed year keeps the
      // cohort it had then, even after the year transition).
      loadClassRoster(data.classId, { year })
    ]);
    const form = classDoc.data()?.level?.toString() || "1";
    const byDocId = new Map(roster.map((l) => [l.id, l]));
    const byCustomId = new Map(roster.filter((l) => l.studentId).map((l) => [l.studentId, l]));
    const uid = data.teacherId;
    const slotKey = slot ? slot.id.slice(data.classId.length + 2) : slotKeyFor(data.classId, normalizedSubjectId);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const saved = [];
    const skipped = [];
    const writes = [];
    for (const r of data.results) {
      const learner = byDocId.get(r.studentId) ?? byCustomId.get(r.studentId);
      if (!learner) {
        skipped.push({ studentId: r.studentId, studentName: r.studentName, reason: "Not an active learner in this class" });
        continue;
      }
      const marks = Number(r.marks);
      const valid = marks === MARK.ABSENT || marks === MARK.NOT_CONDUCTED || Number.isFinite(marks) && marks >= 0 && marks <= totalMarks;
      if (!valid) {
        skipped.push({ studentId: r.studentId, studentName: r.studentName, reason: `Mark ${r.marks} is not between 0 and ${totalMarks}` });
        continue;
      }
      let percentage = -1;
      let grade = -1;
      let status;
      if (marks === MARK.NOT_CONDUCTED) status = "not_conducted";
      else if (marks === MARK.ABSENT) status = "absent";
      else {
        percentage = Math.round(marks / totalMarks * 100);
        grade = calculateGrade(percentage);
        status = "entered";
      }
      const id = this.generateResultId(learner.id, normalizedSubjectId, data.examType, data.term, year);
      const isNew = !existingIds.has(id);
      const resultData = {
        id,
        studentId: learner.id,
        studentName: learner.name || r.studentName,
        classId: data.classId,
        className: data.className,
        form,
        subjectId: normalizedSubjectId,
        subjectName: normalizedSubjectName,
        normalizedSubject: slotKey,
        teacherId: data.teacherId,
        teacherName: data.teacherName,
        examType: data.examType,
        examName: data.examName,
        marks,
        totalMarks,
        percentage,
        grade,
        term: data.term,
        year,
        status,
        updatedAt: now,
        lastEditedBy: uid,
        customStudentId: learner.studentId || learner.id,
        ...isNew ? { createdAt: now, enteredBy: uid } : {}
      };
      writes.push({ id, payload: resultData });
      saved.push(resultData);
    }
    for (let i = 0; i < writes.length; i += 450) {
      const batch = writeBatch(db);
      for (const w of writes.slice(i, i + 450)) {
        batch.set(doc(this.resultsCollection, w.id), w.payload, { merge: true });
      }
      await batch.commit();
    }
    this.invalidateGrid(data.classId);
    return {
      success: true,
      count: saved.length,
      results: saved,
      overwritten: existing.exists,
      skipped
    };
  }
  /** Throws unless the teacher owns the slot or is its live cover/TP. */
  async assertCanEnterMarks(teacherId, classId, subject) {
    const slot = await findSlotForSubject(classId, subject);
    const auth2 = resolveAuthority(slot);
    if (slot && (slot.ownerTeacherId === teacherId || auth2.operatorTeacherId === teacherId)) return slot;
    throw new AssignmentRuleError(
      "NOT_OPERATOR",
      `You are not assigned to ${slot?.subject || subject} in ${slot?.className || "this class"}, so you cannot enter its marks.`
    );
  }
  /**
   * Record that an exam was not held for this class + subject: every active
   * learner gets -2. Refuses if real marks or absences are already saved —
   * those must be deleted first, so nobody's mark is overwritten by mistake.
   */
  async markExamNotConducted(data) {
    const existing = await this.checkExistingResults(
      data.classId,
      normalizeSubjectName(data.subjectId),
      data.examType,
      data.term,
      Number(data.year)
    );
    const real = existing.results.filter((r) => r.marks !== MARK.NOT_CONDUCTED);
    if (real.length > 0) {
      throw new Error(
        `${real.length} mark(s) are already saved for this exam. Delete them first if the exam was not conducted.`
      );
    }
    const roster = await loadClassRoster(data.classId, { year: Number(data.year) });
    return this.saveClassResults(
      {
        ...data,
        results: roster.map((l) => ({ studentId: l.id, studentName: l.name, marks: MARK.NOT_CONDUCTED }))
      },
      { overwrite: true }
    );
  }
  async deleteClassResults(data) {
    try {
      const normalizedSubjectId = normalizeSubjectName(data.subjectId);
      const existing = await this.checkExistingResults(
        data.classId,
        normalizedSubjectId,
        data.examType,
        data.term,
        data.year
      );
      if (!existing.exists) {
        console.log("⚠️ No results to delete.");
        return { success: true, deletedCount: 0 };
      }
      const batch = writeBatch(db);
      existing.results.forEach((result) => {
        const docRef = doc(this.resultsCollection, result.id);
        batch.delete(docRef);
      });
      await batch.commit();
      this.invalidateGrid(data.classId);
      console.log(`🗑️ Deleted ${existing.count} results for ${normalizedSubjectId} ${data.examType}`);
      return { success: true, deletedCount: existing.count };
    } catch (error) {
      console.error("Error deleting results:", error);
      throw error;
    }
  }
  async updateStudentResult(resultId, marks, totalMarks) {
    try {
      let percentage = -1;
      let grade = -1;
      let status = "not_entered";
      if (marks === -2) {
        status = "not_conducted";
      } else if (marks === -1) {
        status = "absent";
      } else if (marks >= 0) {
        percentage = Math.round(marks / totalMarks * 100);
        grade = calculateGrade(percentage);
        status = "entered";
      }
      const docRef = doc(this.resultsCollection, resultId);
      await updateDoc(docRef, {
        marks,
        totalMarks,
        percentage,
        grade,
        status,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        lastEditedBy: getAuth().currentUser?.uid ?? null
      });
      this.invalidateGrid();
      const updatedDoc = await getDoc(docRef);
      return updatedDoc.data();
    } catch (error) {
      console.error("Error updating result:", error);
      return null;
    }
  }
  // ==================== SHARED GRID (cached briefly) ====================
  //
  // Report Cards, SMS and Parent Portal all read one class grid. A short
  // cache stops a class of 40 from loading the same grid 40 times while one
  // screen builds its cards. Any save or delete clears it.
  gridCache = /* @__PURE__ */ new Map();
  static GRID_TTL_MS = 15e3;
  loadGrid(classId, term, year, opts = {}) {
    const key = `${classId}|${term}|${year}${opts.publicView ? "|public" : ""}`;
    const hit = this.gridCache.get(key);
    if (hit && Date.now() - hit.at < ResultsService.GRID_TTL_MS) return hit.promise;
    const promise = loadClassGrid(classId, term, Number(year), { publicFallback: !!opts.publicView });
    this.gridCache.set(key, { at: Date.now(), promise });
    promise.catch(() => this.gridCache.delete(key));
    return promise;
  }
  invalidateGrid(classId) {
    if (!classId) {
      this.gridCache.clear();
      return;
    }
    for (const key of [...this.gridCache.keys()]) {
      if (key.startsWith(`${classId}|`)) this.gridCache.delete(key);
    }
  }
  // ==================== STUDENT PROGRESS (Report Cards list) ====================
  /**
   * One row per active learner, from the shared grid. The progress bar is
   * completed subjects / subjects (Form Teacher and dropped subjects are not
   * subjects); averages use only the term's active exams.
   */
  async getStudentProgress(classId, term, year) {
    const loaded = await this.loadGrid(classId, term, year);
    return loaded.grid.learners.map((l) => this.toStudentProgress(loaded, l.id));
  }
  toStudentProgress(loaded, learnerId) {
    const { grid, classInfo } = loaded;
    const p = learnerProgress(grid, learnerId);
    const learner = grid.learners.find((l) => l.id === learnerId);
    const cellOut = (c) => {
      if (!c) return { status: "missing" };
      if (c.status === "entered") return { status: "complete", marks: c.percentage ?? void 0 };
      if (c.status === "absent") return { status: "absent", marks: MARK.ABSENT };
      if (c.status === "not_conducted") return { status: "not_conducted", marks: MARK.NOT_CONDUCTED };
      return { status: "missing" };
    };
    const examCount = grid.activeExams.length;
    return {
      studentId: learner.studentId || learner.id,
      documentId: learner.id,
      studentName: p.name,
      className: classInfo.name,
      classId: classInfo.id,
      form: classInfo.form,
      gender: learner.gender,
      overallPercentage: p.overallPercentage,
      overallGrade: p.overallGrade,
      status: p.status,
      isComplete: p.isComplete,
      completionPercentage: p.completionPercentage,
      subjects: p.subjects.map((s) => {
        const done = grid.activeExams.filter((e) => s.cells[e] && s.cells[e].status !== "pending").length;
        return {
          subjectId: s.subjectId,
          subjectName: s.subjectName,
          teacherName: s.teacherName,
          week4: cellOut(s.cells.week4),
          week8: cellOut(s.cells.week8),
          endOfTerm: cellOut(s.cells.endOfTerm),
          averagePercentage: s.average >= 0 ? s.average : void 0,
          subjectProgress: examCount > 0 ? Math.round(done / examCount * 100) : 0,
          grade: s.grade
        };
      }),
      missingSubjects: p.totalSubjects - p.completedSubjects,
      totalSubjects: p.totalSubjects,
      activeExams: grid.activeExams
    };
  }
  // ==================== REPORT CARD GENERATION ====================
  cardFor(loaded, learnerId, learnerData, positions, improvement) {
    return buildReportCard(loaded.grid, learnerId, {
      classId: loaded.classInfo.id,
      className: loaded.classInfo.name,
      form: loaded.classInfo.form,
      term: loaded.term,
      year: loaded.year,
      gender: learnerData?.gender,
      parentsPhone: learnerData?.guardianPhone || learnerData?.parentPhone || learnerData?.parentsPhone || "",
      parentsEmail: learnerData?.parentEmail || learnerData?.parentsEmail || "",
      positions,
      improvement
    });
  }
  /** True when at least one cell (entered, absent or not conducted) exists. */
  hasAnyEntry(card) {
    return card.subjects.some(
      (s) => [s.week4, s.week8, s.endOfTerm].some((v) => v !== MARK.PENDING)
    );
  }
  /**
   * Report card for one learner, built from the shared grid — the same
   * numbers the Report Cards list, the admin PDF, the SMS and the Parent
   * Portal show. Returns null when the learner is not an active member of
   * their class or nothing has been entered yet.
   */
  async generateReportCard(inputStudentId, term, year, options) {
    if (options?.publicView) await assertTermReleased(term, year);
    const studentDoc = await this.resolveStudentDocument(inputStudentId);
    if (!studentDoc) {
      console.warn(`⚠️ Student not found: ${inputStudentId}`);
      return null;
    }
    const classId = await classIdForYear(studentDoc.documentId, studentDoc.data.classId, Number(year));
    if (!classId) return null;
    const loaded = await this.loadGrid(classId, term, year, { publicView: options?.publicView });
    if (!loaded.grid.learners.some((l) => l.id === studentDoc.documentId)) return null;
    const improvement = await this.calculateImprovement(studentDoc.documentId, term, year).catch(
      () => "stable"
    );
    const card = this.cardFor(loaded, studentDoc.documentId, studentDoc.data, classPositions(loaded.grid), improvement);
    if (!this.hasAnyEntry(card)) return null;
    if (!card.isComplete && !options?.includeIncomplete) return null;
    return loaded.degraded ? { ...card, degraded: true } : card;
  }
  /** All report cards for a class from ONE grid load (positions computed once). */
  async generateClassReportCards(classId, term, year, options) {
    const loaded = await this.loadGrid(classId, term, year);
    const positions = classPositions(loaded.grid);
    const learnerDocs = await getDocs(query(this.learnersCollection, where("classId", "==", classId)));
    const dataById = new Map(learnerDocs.docs.map((d) => [d.id, d.data()]));
    const missing = loaded.grid.learners.filter((l) => !dataById.has(l.id));
    if (missing.length > 0) {
      const snaps = await Promise.all(missing.map((l) => getDoc(doc(this.learnersCollection, l.id)).catch(() => null)));
      for (const snap of snaps) if (snap?.exists()) dataById.set(snap.id, snap.data());
    }
    const includeIncomplete = options?.includeIncomplete ?? true;
    const cards = await Promise.all(
      loaded.grid.learners.map(async (l) => {
        const improvement = await this.calculateImprovement(l.id, term, year).catch(() => "stable");
        return this.cardFor(loaded, l.id, dataById.get(l.id), positions, improvement);
      })
    );
    const reportCards = cards.filter((c) => this.hasAnyEntry(c)).filter((c) => includeIncomplete || c.isComplete).sort((a, b) => a.studentName.localeCompare(b.studentName));
    const passed = reportCards.filter((r) => r.status === "pass").length;
    const failed = reportCards.filter((r) => r.status === "fail").length;
    const complete = reportCards.filter((r) => r.isComplete).length;
    return {
      reportCards,
      summary: {
        total: reportCards.length,
        passed,
        failed,
        avgPercentage: reportCards.length ? Math.round(reportCards.reduce((s, r) => s + r.percentage, 0) / reportCards.length) : 0,
        complete,
        incomplete: reportCards.length - complete
      }
    };
  }
  // ==================== SUBJECT COMPLETION (Results Entry) ====================
  /**
   * Per-subject completion for a class, from the shared grid — the same
   * numbers the Results Entry Monitor shows for that class and subject.
   * Exams that are not active this term report 0 and complete = false.
   */
  async getSubjectCompletionStatus(classId, term, year) {
    const { grid, classInfo } = await this.loadGrid(classId, term, year);
    return grid.subjects.map((s) => {
      const sp = subjectProgress(grid, s.subjectId);
      const ex = (t) => sp.exams.find((e) => e.examType === t);
      const doneIds = (t) => {
        const e = ex(t);
        if (!e) return [];
        const missing = new Set(e.missingLearnerIds);
        return grid.learners.filter((l) => !missing.has(l.id)).map((l) => l.id);
      };
      return {
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        teacherId: s.operatorTeacherId || s.ownerTeacherId || "",
        teacherName: s.operatorTeacherName || s.ownerTeacherName || "Not assigned",
        classId,
        className: classInfo.name,
        term,
        year,
        week4Complete: ex("week4")?.percentage === 100,
        week8Complete: ex("week8")?.percentage === 100,
        endOfTermComplete: ex("endOfTerm")?.percentage === 100,
        percentComplete: sp.completionPercentage,
        totalStudents: sp.totalStudents,
        enteredStudents: {
          week4: ex("week4")?.doneCount ?? 0,
          week8: ex("week8")?.doneCount ?? 0,
          endOfTerm: ex("endOfTerm")?.doneCount ?? 0
        },
        enteredStudentIds: {
          week4: doneIds("week4"),
          week8: doneIds("week8"),
          endOfTerm: doneIds("endOfTerm")
        },
        missingStudentIds: {
          week4: ex("week4")?.missingLearnerIds ?? [],
          week8: ex("week8")?.missingLearnerIds ?? [],
          endOfTerm: ex("endOfTerm")?.missingLearnerIds ?? []
        },
        notConducted: {
          week4: ex("week4")?.notConducted ?? false,
          week8: ex("week8")?.notConducted ?? false,
          endOfTerm: ex("endOfTerm")?.notConducted ?? false
        },
        activeExams: grid.activeExams
      };
    });
  }
  // ==================== ANALYTICS METHODS ====================
  async calculateClassComparison(options) {
    try {
      const constraints = [];
      if (options?.term) constraints.push(where("term", "==", options.term));
      if (options?.year) constraints.push(where("year", "==", options.year));
      const q = constraints.length > 0 ? query(this.resultsCollection, ...constraints) : query(this.resultsCollection);
      const snapshot = await getDocs(q);
      const results = snapshot.docs.map((doc2) => readResult(doc2.data()));
      const classMap = /* @__PURE__ */ new Map();
      results.filter((r) => r.examType === "endOfTerm" && r.percentage >= 0).forEach((result) => {
        const key = result.classId;
        if (!classMap.has(key)) {
          classMap.set(key, {
            className: result.className,
            form: result.form,
            percentages: [],
            students: /* @__PURE__ */ new Set()
          });
        }
        const classData = classMap.get(key);
        classData.percentages.push(result.percentage);
        classData.students.add(result.studentId);
      });
      return Array.from(classMap.entries()).map(([classId, data]) => {
        const avgMarks = data.percentages.length > 0 ? Math.round(data.percentages.reduce((a, b) => a + b, 0) / data.percentages.length) : 0;
        const passRate = data.percentages.length > 0 ? Math.round(data.percentages.filter((p) => isPassPercentage(p)).length / data.percentages.length * 100) : 0;
        return {
          class: data.className,
          className: data.className,
          form: data.form,
          passRate,
          avgMarks,
          totalStudents: data.students.size,
          improvement: 0
        };
      }).sort((a, b) => b.passRate - a.passRate);
    } catch (error) {
      console.error("Error calculating class comparison:", error);
      return [];
    }
  }
  async calculateSubjectAnalysis(options) {
    try {
      const constraints = [];
      if (options?.term) constraints.push(where("term", "==", options.term));
      if (options?.year) constraints.push(where("year", "==", options.year));
      if (options?.classId) constraints.push(where("classId", "==", options.classId));
      const q = constraints.length > 0 ? query(this.resultsCollection, ...constraints) : query(this.resultsCollection);
      const snapshot = await getDocs(q);
      const results = snapshot.docs.map((doc2) => readResult(doc2.data()));
      const subjectMap = /* @__PURE__ */ new Map();
      results.filter((r) => r.examType === "endOfTerm" && r.percentage >= 0).forEach((result) => {
        const key = result.subjectId;
        if (!subjectMap.has(key)) {
          subjectMap.set(key, {
            subject: result.subjectName,
            percentages: [],
            grades: []
          });
        }
        const subject = subjectMap.get(key);
        subject.percentages.push(result.percentage);
        subject.grades.push(result.grade);
      });
      return Array.from(subjectMap.entries()).map(([subjectId, data]) => {
        const avgScore = data.percentages.length > 0 ? Math.round(data.percentages.reduce((a, b) => a + b, 0) / data.percentages.length) : 0;
        const passRate = data.percentages.length > 0 ? Math.round(data.percentages.filter((p) => isPassPercentage(p)).length / data.percentages.length * 100) : 0;
        const gradeCounts = /* @__PURE__ */ new Map();
        data.grades.forEach((grade) => {
          gradeCounts.set(grade, (gradeCounts.get(grade) || 0) + 1);
        });
        let topGrade = "N/A";
        let maxCount = 0;
        gradeCounts.forEach((count, grade) => {
          if (count > maxCount) {
            maxCount = count;
            topGrade = grade.toString();
          }
        });
        let difficulty = "medium";
        if (avgScore >= 70) difficulty = "easy";
        else if (avgScore <= 40) difficulty = "hard";
        return {
          subject: data.subject,
          passRate,
          avgScore,
          topGrade,
          difficulty
        };
      }).sort((a, b) => b.passRate - a.passRate);
    } catch (error) {
      console.error("Error calculating subject analysis:", error);
      return [];
    }
  }
  calculateGradeDistribution(results) {
    const studentSubjectAverages = /* @__PURE__ */ new Map();
    const resultGroups = /* @__PURE__ */ new Map();
    results.filter((r) => r.percentage >= 0).forEach((result) => {
      const key = `${result.studentId}_${result.subjectId}`;
      if (!resultGroups.has(key)) {
        resultGroups.set(key, []);
      }
      resultGroups.get(key).push(result);
    });
    resultGroups.forEach((groupResults, key) => {
      const percentages = groupResults.map((r) => r.percentage);
      const avgPercentage = percentages.reduce((a, b) => a + b, 0) / percentages.length;
      const grade = calculateGrade(avgPercentage);
      if (!studentSubjectAverages.has(key)) {
        studentSubjectAverages.set(key, []);
      }
      studentSubjectAverages.get(key).push(grade);
    });
    const gradeCounts = /* @__PURE__ */ new Map();
    for (let i = 1; i <= 9; i++) {
      gradeCounts.set(i, 0);
    }
    studentSubjectAverages.forEach((grades) => {
      grades.forEach((grade) => {
        gradeCounts.set(grade, (gradeCounts.get(grade) || 0) + 1);
      });
    });
    const total = Array.from(studentSubjectAverages.values()).reduce((sum, grades) => sum + grades.length, 0);
    return Array.from(gradeCounts.entries()).map(([grade, count]) => ({
      grade,
      count,
      percentage: total > 0 ? Math.round(count / total * 100) : 0,
      description: getGradeDescription(grade)
    })).filter((g) => g.count > 0);
  }
  calculatePerformanceTrend(results) {
    const examTypes = ["week4", "week8", "endOfTerm"];
    const examLabels = {
      week4: "Week 4",
      week8: "Week 8",
      endOfTerm: "End of Term"
    };
    const trendData = examTypes.map((examType) => {
      const examResults = results.filter((r) => r.examType === examType && r.percentage >= 0);
      const totalPercentage = examResults.reduce((sum, r) => sum + r.percentage, 0);
      const avgMarks = examResults.length > 0 ? Math.round(totalPercentage / examResults.length) : 0;
      const passRate = examResults.length > 0 ? Math.round(examResults.filter((r) => isPassPercentage(r.percentage)).length / examResults.length * 100) : 0;
      return {
        month: examLabels[examType],
        avgMarks,
        passRate
      };
    });
    return trendData.map((data, index) => {
      if (index === 0) return { ...data, improvement: "stable" };
      const prevData = trendData[index - 1];
      const avgDiff = data.avgMarks - prevData.avgMarks;
      const passDiff = data.passRate - prevData.passRate;
      let improvement = "stable";
      if (avgDiff > 2 || passDiff > 3) improvement = "up";
      else if (avgDiff < -2 || passDiff < -3) improvement = "down";
      return { ...data, improvement };
    });
  }
  async getAnalyticsSummary(options) {
    try {
      const results = await this.getAllResults(options);
      return {
        gradeDistribution: this.calculateGradeDistribution(results),
        performanceTrend: this.calculatePerformanceTrend(results),
        totalStudents: Array.from(new Set(results.map((r) => r.studentId))).length,
        averagePercentage: results.length > 0 ? Math.round(
          results.filter((r) => r.percentage >= 0).reduce((sum, r) => sum + r.percentage, 0) / Math.max(results.filter((r) => r.percentage >= 0).length, 1)
        ) : 0,
        passRate: results.length > 0 ? Math.round(
          results.filter((r) => isPassPercentage(r.percentage)).length / Math.max(results.filter((r) => r.percentage >= 0).length, 1) * 100
        ) : 0
      };
    } catch (error) {
      console.error("Error getting analytics summary:", error);
      throw error;
    }
  }
  // ==================== HELPER METHODS ====================
  async getClassData(classId) {
    try {
      const classDoc = await getDoc(doc(this.classesCollection, classId));
      return classDoc.exists() ? classDoc.data() : null;
    } catch (error) {
      console.error("Error getting class data:", error);
      return null;
    }
  }
  async debugCheckStudentData(studentId, term, year) {
    console.log(`🔍 DEBUG: Checking data for student ${studentId}, ${term} ${year}`);
    const studentDoc = await this.resolveStudentDocument(studentId);
    if (!studentDoc) {
      console.log(`❌ Student not found`);
      return;
    }
    console.log(`✅ Student found:`, {
      name: studentDoc.data.name,
      customId: studentDoc.customId,
      documentId: studentDoc.documentId,
      classId: studentDoc.data.classId
    });
    const results = await this.getStudentResults(studentDoc.documentId, { term, year });
    console.log(`📊 Found ${results.length} results:`);
    results.forEach((r) => {
      console.log(`   - ${r.subjectName} (${r.examType}): ${r.marks === -2 ? "N/A" : r.marks === -1 ? "ABS" : r.percentage + "%"}`);
    });
  }
  // ==================== SMS COMPOSITION METHODS ====================
  /** SMS payload from a report card — the same numbers the card prints. */
  smsPayloadFromCard(card) {
    return {
      studentName: card.studentName,
      studentId: card.studentId,
      className: card.className,
      term: card.term,
      year: card.year,
      subjects: card.subjects.map((s) => ({ subjectName: s.subjectName, percentage: s.average })),
      overallPercentage: card.percentage,
      overallGrade: card.grade,
      provisional: card.isProvisional
    };
  }
  /**
   * Build the SMS body for a single student from their report card, so the
   * guardian receives exactly the average and grade on the report card.
   */
  async formatStudentResultsSMSAsync(inputStudentId, term, year, options = {}) {
    try {
      const card = await this.generateReportCard(inputStudentId, term, year, { includeIncomplete: true });
      if (!card) {
        console.warn(`⚠️ No report data for ${inputStudentId} — cannot format SMS.`);
        return null;
      }
      const payload = this.smsPayloadFromCard(card);
      const body = formatStudentResultsSMS(payload, options);
      return { body, segments: getSmsSegments(body), payload };
    } catch (error) {
      console.error("Error formatting SMS from DB:", error);
      return null;
    }
  }
  /**
   * SMS bodies for every learner in a class with results, from ONE grid load.
   * `studentId` is the same id the SMS backend has always received
   * (the custom id, or the document id when a learner has none).
   */
  async formatClassResultsSMSAsync(classId, term, year, options = {}) {
    const [bulk, legacyIds, loaded] = await Promise.all([
      this.generateClassReportCards(classId, term, year, { includeIncomplete: true }),
      this.getLearnersInClass(classId),
      this.loadGrid(classId, term, year)
    ]);
    const smsIdByDoc = new Map(legacyIds.map((l) => [l.documentId, l.id]));
    const messages = bulk.reportCards.map((card) => {
      const payload = this.smsPayloadFromCard(card);
      const body = formatStudentResultsSMS(payload, options);
      return {
        studentId: smsIdByDoc.get(card.documentId) ?? card.studentId,
        documentId: card.documentId,
        studentName: card.studentName,
        body,
        segments: getSmsSegments(body),
        payload
      };
    });
    return { rosterSize: loaded.grid.learners.length, messages };
  }
  // ==================== PRIVATE HELPERS ====================
  generateResultId(studentDocumentId, subjectId, examType, term, year) {
    const cleanTerm = term.replace(/\s+/g, "");
    return `${studentDocumentId}_${subjectId}_${examType}_${cleanTerm}_${year}`;
  }
  async calculateImprovement(studentDocumentId, currentTerm2, currentYear) {
    try {
      const termMap = { "Term 1": "Term 3", "Term 2": "Term 1", "Term 3": "Term 2" };
      const previousTerm = termMap[currentTerm2];
      const previousYear = currentTerm2 === "Term 1" ? currentYear - 1 : currentYear;
      const currentResults = await this.getStudentResults(studentDocumentId, {
        term: currentTerm2,
        year: currentYear
      });
      const previousResults = await this.getStudentResults(studentDocumentId, {
        term: previousTerm,
        year: previousYear
      });
      const currentSubjectAverages = this.calculateSubjectAverages(currentResults);
      const currentOverall = currentSubjectAverages.length > 0 ? currentSubjectAverages.reduce((a, b) => a + b, 0) / currentSubjectAverages.length : 0;
      const previousSubjectAverages = this.calculateSubjectAverages(previousResults);
      const previousOverall = previousSubjectAverages.length > 0 ? previousSubjectAverages.reduce((a, b) => a + b, 0) / previousSubjectAverages.length : 0;
      if (previousOverall === 0) return "stable";
      const difference = currentOverall - previousOverall;
      if (difference > 3) return "improved";
      if (difference < -3) return "declined";
      return "stable";
    } catch (error) {
      console.error("Error calculating improvement:", error);
      return "stable";
    }
  }
  calculateSubjectAverages(results) {
    const subjectGroups = /* @__PURE__ */ new Map();
    results.filter((r) => r.percentage >= 0).forEach((result) => {
      if (!subjectGroups.has(result.subjectId)) {
        subjectGroups.set(result.subjectId, []);
      }
      subjectGroups.get(result.subjectId).push(result.percentage);
    });
    const averages = [];
    subjectGroups.forEach((percentages) => {
      const avg = percentages.reduce((a, b) => a + b, 0) / percentages.length;
      averages.push(avg);
    });
    return averages;
  }
}
const resultsService = new ResultsService();
const resultsService$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  GRADE_SYSTEM,
  SUBJECT_SMS_ABBREVIATIONS,
  calculateGrade,
  formatStudentResultsSMS,
  getGradeDescription,
  getGradeShortCode,
  getSmsSegments,
  getSubjectSmsCode,
  isGsm7,
  isKnownSubject,
  normalizeSubjectName,
  resultsService
}, Symbol.toStringTag, { value: "Module" }));
async function getSchoolYear() {
  try {
    const snap = await getDoc(doc(db, "system", "academicYear"));
    const y = snap.exists() ? Number(snap.data()?.currentYear) : NaN;
    if (Number.isFinite(y) && y > 2e3) return y;
  } catch {
  }
  return getCurrentAcademicTerm().year;
}
async function admissionYearFor(dateOfFirstEntry) {
  const school = await getSchoolYear();
  const y = Number((dateOfFirstEntry || "").slice(0, 4));
  return Number.isFinite(y) && y > school ? y : school;
}
const toDate$1 = (timestamp) => {
  if (!timestamp) return void 0;
  if (timestamp instanceof Date) return timestamp;
  if (timestamp.toDate && typeof timestamp.toDate === "function") {
    return timestamp.toDate();
  }
  if (timestamp.seconds) {
    return new Date(timestamp.seconds * 1e3);
  }
  return void 0;
};
const formatLocalYMD = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const buildValidYMD = (y, m, d) => {
  const date = new Date(y, m - 1, d);
  if (isNaN(date.getTime()) || date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return formatLocalYMD(date);
};
const normalizeDateOfBirth = (value) => {
  if (value === null || value === void 0 || value === "") return null;
  if (value instanceof Date && !isNaN(value.getTime())) {
    return formatLocalYMD(value);
  }
  if (typeof value === "object" && value !== null && "toDate" in value) {
    try {
      const d = value.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) {
        return formatLocalYMD(d);
      }
    } catch {
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const y = Math.trunc(value);
    if (y >= 1900 && y <= 2200) return `${y}-01-01`;
    return null;
  }
  const str = String(value).trim();
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return buildValidYMD(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const dmy = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    return buildValidYMD(Number(yyyy), Number(mm), Number(dd));
  }
  const ymd = str.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (ymd) {
    const [, yyyy, mm, dd] = ymd;
    return buildValidYMD(Number(yyyy), Number(mm), Number(dd));
  }
  if (/^\d{4}$/.test(str)) {
    return `${str}-01-01`;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return formatLocalYMD(parsed);
  }
  return null;
};
const deriveBirthYearAndAge = (dateOfBirth) => {
  if (!dateOfBirth) return { birthYear: 0, age: 0 };
  const dob = /* @__PURE__ */ new Date(dateOfBirth + (dateOfBirth.length === 10 ? "T00:00:00" : ""));
  if (isNaN(dob.getTime())) return { birthYear: 0, age: 0 };
  const birthYear = dob.getFullYear();
  const today = /* @__PURE__ */ new Date();
  let age = today.getFullYear() - birthYear;
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || m === 0 && today.getDate() < dob.getDate()) {
    age--;
  }
  if (age < 0) age = 0;
  return { birthYear, age };
};
const calculateAge = (birthYear, dateOfBirth) => {
  if (dateOfBirth) {
    const derived = deriveBirthYearAndAge(dateOfBirth);
    if (derived.age > 0) return derived.age;
  }
  if (!birthYear) return 0;
  return Math.max(0, (/* @__PURE__ */ new Date()).getFullYear() - birthYear);
};
const generateClassPrefix = (classType, level, section) => {
  const typePrefix = classType === "grade" ? "G" : "F";
  return `${typePrefix}${level}${section}`.toUpperCase();
};
const generateSequentialStudentId = async (classId, classType, level, section) => {
  try {
    const learnersRef = collection(db, "learners");
    const q = query(
      learnersRef,
      where("classId", "==", classId),
      orderBy("studentIndex", "desc"),
      limit(1)
    );
    const [snapshot, classSnap] = await Promise.all([getDocs(q), getDoc(doc(db, "classes", classId))]);
    let nextIndex = 1;
    if (!snapshot.empty) {
      const lastLearner = snapshot.docs[0].data();
      nextIndex = (lastLearner.studentIndex || 0) + 1;
    }
    const counter = classSnap.exists() ? Number(classSnap.data()?.nextStudentIndex) || 0 : 0;
    nextIndex = Math.max(nextIndex, counter);
    const prefix = generateClassPrefix(classType, level, section);
    const indexStr = nextIndex.toString().padStart(3, "0");
    const studentId = `${prefix}_${indexStr}`;
    return { studentId, nextIndex };
  } catch (error) {
    console.error("Error generating sequential student ID:", error);
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return {
      studentId: `TMP${timestamp}${random}`,
      nextIndex: 0
    };
  }
};
const calculateGenderStats = (learners) => {
  const boys = learners.filter((l) => l.gender === "male").length;
  const girls = learners.filter((l) => l.gender === "female").length;
  const unspecified = learners.filter((l) => !l.gender).length;
  const total = learners.length;
  return {
    boys,
    girls,
    unspecified,
    total,
    boysPercentage: total > 0 ? Math.round(boys / total * 100) : 0,
    girlsPercentage: total > 0 ? Math.round(girls / total * 100) : 0
  };
};
const mapLearnerDoc = (id, data) => {
  let resolvedDob = normalizeDateOfBirth(data.dateOfBirth);
  if (!resolvedDob && data.birthYear) {
    resolvedDob = normalizeDateOfBirth(data.birthYear);
  }
  const derived = deriveBirthYearAndAge(resolvedDob);
  const birthYear = data.birthYear || derived.birthYear || 0;
  const age = typeof data.age === "number" && data.age > 0 ? data.age : derived.age || calculateAge(birthYear, resolvedDob || void 0);
  return {
    id,
    studentId: data.studentId || "",
    studentIndex: data.studentIndex || 0,
    classPrefix: data.classPrefix || "",
    fullName: data.fullName || data.name || "",
    preferredName: data.preferredName ?? void 0,
    dateOfBirth: resolvedDob || "",
    birthYear,
    age,
    gender: data.gender,
    address: data.address || "",
    guardian: data.guardian || "",
    guardianPhone: data.guardianPhone || data.parentPhone || "",
    alternativeGuardian: data.alternativeGuardian,
    alternativeGuardianPhone: data.alternativeGuardianPhone,
    sponsor: data.sponsor || "",
    classId: data.classId || "",
    className: data.className || "",
    classType: data.classType,
    classLevel: data.classLevel,
    classSection: data.classSection,
    dateOfFirstEntry: data.dateOfFirstEntry || "",
    enrollmentDate: toDate$1(data.enrollmentDate) || /* @__PURE__ */ new Date(),
    previousSchool: data.previousSchool,
    previousGrade: data.previousGrade,
    medicalNotes: data.medicalNotes,
    allergies: data.allergies || [],
    status: data.status || "active",
    createdBy: data.createdBy,
    createdAt: toDate$1(data.createdAt),
    updatedAt: toDate$1(data.updatedAt),
    graduationYear: data.graduationYear,
    transferredAt: toDate$1(data.transferredAt),
    transferredToClass: data.transferredToClass,
    archivedAt: toDate$1(data.archivedAt),
    academicYear: typeof data.academicYear === "number" ? data.academicYear : void 0,
    admissionYear: typeof data.admissionYear === "number" ? data.admissionYear : void 0,
    previousStudentIds: Array.isArray(data.previousStudentIds) ? data.previousStudentIds : [],
    exitYear: typeof data.exitYear === "number" ? data.exitYear : void 0,
    exitReason: data.exitReason ?? void 0,
    lastPromotionRunId: data.lastPromotionRunId ?? null,
    name: data.fullName || data.name || "",
    parentPhone: data.guardianPhone || data.parentPhone || ""
  };
};
const learnerService = {
  getLearnersByClass: async (classId) => {
    try {
      const learnersRef = collection(db, "learners");
      const q = query(
        learnersRef,
        where("classId", "==", classId),
        where("status", "==", "active"),
        orderBy("studentIndex", "asc")
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(
        (docSnapshot) => mapLearnerDoc(docSnapshot.id, docSnapshot.data())
      );
    } catch (error) {
      console.error("Error fetching learners:", error);
      throw error;
    }
  },
  getAllLearners: async () => {
    try {
      const learnersRef = collection(db, "learners");
      const q = query(
        learnersRef,
        where("status", "==", "active"),
        orderBy("fullName", "asc")
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(
        (docSnapshot) => mapLearnerDoc(docSnapshot.id, docSnapshot.data())
      );
    } catch (error) {
      console.error("Error fetching all learners:", error);
      throw error;
    }
  },
  searchLearnersInClass: async (classId, searchTerm) => {
    try {
      const learners = await learnerService.getLearnersByClass(classId);
      const searchLower = searchTerm.toLowerCase();
      return learners.filter(
        (learner) => learner.fullName.toLowerCase().includes(searchLower) || learner.studentId.toLowerCase().includes(searchLower) || learner.guardianPhone.includes(searchTerm) || learner.guardian.toLowerCase().includes(searchLower) || learner.sponsor.toLowerCase().includes(searchLower)
      );
    } catch (error) {
      console.error("Error searching learners:", error);
      throw error;
    }
  },
  getFilteredLearners: async (filters) => {
    try {
      let learners = [];
      if (filters.classId) {
        learners = await learnerService.getLearnersByClass(filters.classId);
      } else {
        learners = await learnerService.getAllLearners();
      }
      return learners.filter((learner) => {
        if (filters.gender && learner.gender !== filters.gender) return false;
        if (filters.sponsor && !learner.sponsor.toLowerCase().includes(filters.sponsor.toLowerCase())) return false;
        if (filters.status && learner.status !== filters.status) return false;
        if (filters.dateOfBirthFrom && learner.dateOfBirth < filters.dateOfBirthFrom) return false;
        if (filters.dateOfBirthTo && learner.dateOfBirth > filters.dateOfBirthTo) return false;
        if (filters.birthYearFrom && learner.birthYear < filters.birthYearFrom) return false;
        if (filters.birthYearTo && learner.birthYear > filters.birthYearTo) return false;
        if (filters.searchTerm) {
          const searchLower = filters.searchTerm.toLowerCase();
          return learner.fullName.toLowerCase().includes(searchLower) || learner.studentId.toLowerCase().includes(searchLower) || learner.guardian.toLowerCase().includes(searchLower) || learner.guardianPhone.includes(filters.searchTerm) || learner.sponsor.toLowerCase().includes(searchLower);
        }
        return true;
      });
    } catch (error) {
      console.error("Error filtering learners:", error);
      throw error;
    }
  },
  addLearner: async (data) => {
    const batch = writeBatch(db);
    try {
      const classDoc = await getDoc(doc(db, "classes", data.classId));
      if (!classDoc.exists()) {
        throw new Error("Class not found");
      }
      const classData = classDoc.data();
      const normalizedDob = normalizeDateOfBirth(data.dateOfBirth) || (data.birthYear ? normalizeDateOfBirth(data.birthYear) : null);
      if (!normalizedDob) {
        throw new Error("A valid date of birth (or birth year) is required");
      }
      const { birthYear, age } = deriveBirthYearAndAge(normalizedDob);
      const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
      if (birthYear < 1990 || birthYear > currentYear) {
        throw new Error(`Date of birth year must be between 1990 and ${currentYear}`);
      }
      const { studentId, nextIndex } = await generateSequentialStudentId(
        data.classId,
        classData.type,
        classData.level,
        classData.section
      );
      const admissionYear = await admissionYearFor(data.dateOfFirstEntry);
      const learnerRef = doc(collection(db, "learners"));
      batch.set(learnerRef, {
        academicYear: admissionYear,
        admissionYear,
        studentId,
        studentIndex: nextIndex,
        classPrefix: generateClassPrefix(classData.type, classData.level, classData.section),
        fullName: data.fullName.trim(),
        dateOfBirth: normalizedDob,
        birthYear,
        age,
        gender: data.gender,
        preferredName: data.preferredName || null,
        address: data.address.trim(),
        guardian: data.guardian.trim(),
        guardianPhone: data.guardianPhone,
        alternativeGuardian: data.alternativeGuardian || null,
        alternativeGuardianPhone: data.alternativeGuardianPhone || null,
        sponsor: data.sponsor.trim(),
        classId: data.classId,
        className: classData.name,
        classType: classData.type,
        classLevel: classData.level,
        classSection: classData.section,
        dateOfFirstEntry: data.dateOfFirstEntry,
        enrollmentDate: serverTimestamp(),
        previousSchool: data.previousSchool || null,
        medicalNotes: data.medicalNotes || null,
        allergies: data.allergies || [],
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        name: data.fullName.trim(),
        parentPhone: data.guardianPhone
      });
      const classRef = doc(db, "classes", data.classId);
      batch.update(classRef, {
        students: increment(1),
        nextStudentIndex: nextIndex + 1,
        updatedAt: serverTimestamp()
      });
      await batch.commit();
      console.log(`✅ Added learner ${data.fullName} (DOB ${normalizedDob}) with ID ${studentId}`);
      return {
        learnerId: learnerRef.id,
        studentId
      };
    } catch (error) {
      console.error("Error adding learner:", error);
      throw error;
    }
  },
  bulkImportLearners: async (classId, learnersData) => {
    const batch = writeBatch(db);
    let success = 0;
    let failed = 0;
    const errors = [];
    const generatedStudentIds = [];
    try {
      const classDoc = await getDoc(doc(db, "classes", classId));
      if (!classDoc.exists()) {
        throw new Error("Class not found");
      }
      const classData = classDoc.data();
      const learnersRef = collection(db, "learners");
      const q = query(
        learnersRef,
        where("classId", "==", classId),
        orderBy("studentIndex", "desc"),
        limit(1)
      );
      const snapshot = await getDocs(q);
      let nextIndex = snapshot.empty ? 1 : (snapshot.docs[0].data().studentIndex || 0) + 1;
      nextIndex = Math.max(nextIndex, Number(classData.nextStudentIndex) || 0);
      const classPrefix = generateClassPrefix(classData.type, classData.level, classData.section);
      const schoolYear = await getSchoolYear();
      for (const [index, learner] of learnersData.entries()) {
        try {
          const requiredFields = [
            "fullName",
            "gender",
            "address",
            "guardian",
            "guardianPhone",
            "sponsor",
            "dateOfFirstEntry"
          ];
          for (const field of requiredFields) {
            if (!learner[field]) {
              throw new Error(`Missing required field: ${field}`);
            }
          }
          if (learner.gender !== "male" && learner.gender !== "female") {
            throw new Error(`Invalid gender "${learner.gender}". Must be "male" or "female"`);
          }
          let normalizedDob = normalizeDateOfBirth(learner.dateOfBirth);
          if (!normalizedDob && learner.birthYear) {
            normalizedDob = normalizeDateOfBirth(learner.birthYear);
          }
          if (!normalizedDob) {
            throw new Error("Missing or invalid date of birth");
          }
          const { birthYear, age } = deriveBirthYearAndAge(normalizedDob);
          const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
          if (birthYear < 1990 || birthYear > currentYear) {
            throw new Error(`Invalid date of birth. Year must be between 1990 and ${currentYear}`);
          }
          const studentId = `${classPrefix}_${nextIndex.toString().padStart(3, "0")}`;
          generatedStudentIds.push(studentId);
          const allergies = learner.allergies ? learner.allergies.split(",").map((a) => a.trim()).filter((a) => a) : [];
          const entryYear = Number(String(learner.dateOfFirstEntry || "").slice(0, 4));
          const admissionYear = Number.isFinite(entryYear) && entryYear > schoolYear ? entryYear : schoolYear;
          const learnerRef = doc(collection(db, "learners"));
          batch.set(learnerRef, {
            academicYear: admissionYear,
            admissionYear,
            studentId,
            studentIndex: nextIndex,
            classPrefix,
            fullName: learner.fullName.trim(),
            dateOfBirth: normalizedDob,
            birthYear,
            age,
            gender: learner.gender,
            preferredName: learner.preferredName || null,
            address: learner.address.trim(),
            guardian: learner.guardian.trim(),
            guardianPhone: learner.guardianPhone,
            alternativeGuardian: learner.alternativeGuardian || null,
            alternativeGuardianPhone: learner.alternativeGuardianPhone || null,
            sponsor: learner.sponsor.trim(),
            classId,
            className: classData.name,
            classType: classData.type,
            classLevel: classData.level,
            classSection: classData.section,
            dateOfFirstEntry: learner.dateOfFirstEntry,
            enrollmentDate: serverTimestamp(),
            previousSchool: learner.previousSchool || null,
            medicalNotes: learner.medicalNotes || null,
            allergies,
            status: "active",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            name: learner.fullName.trim(),
            parentPhone: learner.guardianPhone
          });
          nextIndex++;
          success++;
        } catch (error) {
          console.error(`Error processing learner at row ${index + 2}:`, learner, error);
          failed++;
          errors.push(`Row ${index + 2}: ${error.message}`);
        }
      }
      if (success > 0) {
        const classRef = doc(db, "classes", classId);
        batch.update(classRef, {
          students: increment(success),
          nextStudentIndex: nextIndex,
          updatedAt: serverTimestamp()
        });
      }
      await batch.commit();
      console.log(`✅ Bulk import completed: ${success} succeeded, ${failed} failed`);
      console.log("Generated student IDs:", generatedStudentIds);
      return { success, failed, errors, studentIds: generatedStudentIds };
    } catch (error) {
      console.error("Error in bulk import:", error);
      throw error;
    }
  },
  transferLearner: async (learnerId, fromClassId, toClassId) => {
    const batch = writeBatch(db);
    try {
      const learnerRef = doc(db, "learners", learnerId);
      const learnerDoc = await getDoc(learnerRef);
      if (!learnerDoc.exists()) {
        throw new Error("Learner not found");
      }
      const toClassDoc = await getDoc(doc(db, "classes", toClassId));
      if (!toClassDoc.exists()) {
        throw new Error("Target class not found");
      }
      const toClassData = toClassDoc.data();
      const { studentId: newStudentId, nextIndex } = await generateSequentialStudentId(
        toClassId,
        toClassData.type,
        toClassData.level,
        toClassData.section
      );
      const oldStudentId = learnerDoc.data().studentId;
      batch.update(learnerRef, {
        ...oldStudentId && oldStudentId !== newStudentId ? { previousStudentIds: arrayUnion(oldStudentId) } : {},
        classId: toClassId,
        className: toClassData.name,
        classType: toClassData.type,
        classLevel: toClassData.level,
        classSection: toClassData.section,
        studentId: newStudentId,
        studentIndex: nextIndex,
        classPrefix: generateClassPrefix(toClassData.type, toClassData.level, toClassData.section),
        status: "active",
        transferredAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      const fromClassRef = doc(db, "classes", fromClassId);
      batch.update(fromClassRef, {
        students: increment(-1),
        updatedAt: serverTimestamp()
      });
      const toClassRef = doc(db, "classes", toClassId);
      batch.update(toClassRef, {
        students: increment(1),
        ...nextIndex > 0 ? { nextStudentIndex: nextIndex + 1 } : {},
        updatedAt: serverTimestamp()
      });
      await batch.commit();
      console.log(`✅ Transferred learner ${learnerId} to class ${toClassData.name} with new ID ${newStudentId}`);
      return newStudentId;
    } catch (error) {
      console.error("Error transferring learner:", error);
      throw error;
    }
  },
  removeLearner: async (learnerId, classId) => {
    const batch = writeBatch(db);
    try {
      const learnerRef = doc(db, "learners", learnerId);
      batch.update(learnerRef, {
        status: "archived",
        archivedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      const classRef = doc(db, "classes", classId);
      batch.update(classRef, {
        students: increment(-1),
        updatedAt: serverTimestamp()
      });
      await batch.commit();
      console.log(`✅ Removed (archived) learner ${learnerId} from class ${classId}`);
    } catch (error) {
      console.error("Error removing learner:", error);
      throw error;
    }
  },
  hardDeleteLearner: async (learnerId, classId) => {
    const batch = writeBatch(db);
    try {
      const classRef = doc(db, "classes", classId);
      batch.update(classRef, {
        students: increment(-1),
        updatedAt: serverTimestamp()
      });
      const learnerRef = doc(db, "learners", learnerId);
      batch.delete(learnerRef);
      await batch.commit();
      console.log(`✅ Learner ${learnerId} permanently deleted from class ${classId}`);
    } catch (error) {
      console.error("Error hard deleting learner:", error);
      throw error;
    }
  },
  getLearnersBySponsor: async (sponsorName) => {
    try {
      const learnersRef = collection(db, "learners");
      const q = query(
        learnersRef,
        where("sponsor", ">=", sponsorName),
        where("sponsor", "<=", sponsorName + ""),
        where("status", "==", "active"),
        orderBy("sponsor"),
        orderBy("fullName")
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(
        (docSnapshot) => mapLearnerDoc(docSnapshot.id, docSnapshot.data())
      );
    } catch (error) {
      console.error("Error fetching learners by sponsor:", error);
      throw error;
    }
  },
  updateLearnerGender: async (learnerId, gender) => {
    try {
      const learnerRef = doc(db, "learners", learnerId);
      await updateDoc(learnerRef, {
        gender,
        updatedAt: serverTimestamp()
      });
      console.log(`✅ Updated gender for learner ${learnerId} to ${gender}`);
    } catch (error) {
      console.error("Error updating learner gender:", error);
      throw error;
    }
  },
  updateLearner: async (learnerId, updates) => {
    try {
      const learnerRef = doc(db, "learners", learnerId);
      const cleanUpdates = Object.entries(updates).reduce((acc, [key, value]) => {
        if (value !== void 0) {
          acc[key] = value;
        }
        return acc;
      }, {});
      cleanUpdates.updatedAt = serverTimestamp();
      if (updates.dateOfBirth) {
        const normalizedDob = normalizeDateOfBirth(updates.dateOfBirth);
        if (!normalizedDob) {
          throw new Error("Invalid date of birth");
        }
        const { birthYear, age } = deriveBirthYearAndAge(normalizedDob);
        cleanUpdates.dateOfBirth = normalizedDob;
        cleanUpdates.birthYear = birthYear;
        cleanUpdates.age = age;
      } else if (updates.birthYear) {
        const derivedDob = normalizeDateOfBirth(updates.birthYear);
        if (derivedDob) {
          const { birthYear, age } = deriveBirthYearAndAge(derivedDob);
          cleanUpdates.dateOfBirth = derivedDob;
          cleanUpdates.birthYear = birthYear;
          cleanUpdates.age = age;
        } else {
          cleanUpdates.birthYear = updates.birthYear;
          cleanUpdates.age = calculateAge(updates.birthYear);
        }
      }
      if (updates.fullName) {
        cleanUpdates.name = updates.fullName;
      }
      if (updates.guardianPhone) {
        cleanUpdates.parentPhone = updates.guardianPhone;
      }
      if (updates.allergies) {
        cleanUpdates.allergies = updates.allergies;
      }
      await updateDoc(learnerRef, cleanUpdates);
      console.log(`✅ Updated learner ${learnerId}`);
    } catch (error) {
      console.error("Error updating learner:", error);
      throw error;
    }
  },
  bulkUpdateGenders: async (updates) => {
    const batch = writeBatch(db);
    updates.forEach(({ learnerId, newGender }) => {
      const learnerRef = doc(db, "learners", learnerId);
      batch.update(learnerRef, {
        gender: newGender,
        updatedAt: serverTimestamp()
      });
    });
    await batch.commit();
    console.log(`✅ Bulk updated ${updates.length} learner genders`);
  },
  getGenderStats: async (classId) => {
    try {
      const learners = await learnerService.getLearnersByClass(classId);
      return calculateGenderStats(learners);
    } catch (error) {
      console.error("Error getting gender stats:", error);
      return { boys: 0, girls: 0, unspecified: 0, total: 0, boysPercentage: 0, girlsPercentage: 0 };
    }
  },
  getLearnersMissingGender: async (classId) => {
    try {
      let q;
      const learnersRef = collection(db, "learners");
      if (classId) {
        q = query(
          learnersRef,
          where("classId", "==", classId),
          where("gender", "==", null),
          where("status", "==", "active")
        );
      } else {
        q = query(
          learnersRef,
          where("gender", "==", null),
          where("status", "==", "active")
        );
      }
      const snapshot = await getDocs(q);
      return snapshot.docs.map(
        (docSnapshot) => mapLearnerDoc(docSnapshot.id, docSnapshot.data())
      );
    } catch (error) {
      console.error("Error fetching learners missing gender:", error);
      return [];
    }
  },
  getLearnerByStudentId: async (studentId) => {
    try {
      const learnersRef = collection(db, "learners");
      const q = query(learnersRef, where("studentId", "==", studentId));
      let snapshot = await getDocs(q);
      if (snapshot.empty) {
        snapshot = await getDocs(query(learnersRef, where("previousStudentIds", "array-contains", studentId)));
      }
      if (snapshot.empty) {
        return null;
      }
      const docSnapshot = snapshot.docs.find((d) => (d.data().status ?? "active") === "active") ?? snapshot.docs[0];
      return mapLearnerDoc(docSnapshot.id, docSnapshot.data());
    } catch (error) {
      console.error("Error fetching learner by student ID:", error);
      throw error;
    }
  },
  getLearnersByGuardianPhone: async (phoneNumber) => {
    try {
      const validated = validateZambianNumber(phoneNumber);
      if (!validated) return [];
      const target9 = validated.national9;
      const learnersRef = collection(db, "learners");
      const allSnapshot = await getDocs(
        query(learnersRef, where("status", "==", "active"))
      );
      const matched = allSnapshot.docs.filter((docSnap) => {
        const data = docSnap.data();
        const candidates = [
          data.guardianPhone,
          data.parentPhone,
          data.alternativeGuardianPhone
        ].filter(Boolean);
        return candidates.some((raw) => {
          const candidate = validateZambianNumber(String(raw));
          return candidate !== null && candidate.national9 === target9;
        });
      });
      return matched.map(
        (docSnap) => mapLearnerDoc(docSnap.id, docSnap.data())
      );
    } catch (error) {
      console.error("Error fetching learners by guardian phone:", error);
      return [];
    }
  },
  backfillDateOfBirth: async () => {
    try {
      const learnersRef = collection(db, "learners");
      const snapshot = await getDocs(learnersRef);
      let updated = 0;
      let skipped = 0;
      const CHUNK = 400;
      let batch = writeBatch(db);
      let opsInBatch = 0;
      const flushBatch = async () => {
        if (opsInBatch > 0) {
          await batch.commit();
          batch = writeBatch(db);
          opsInBatch = 0;
        }
      };
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        if (data.dateOfBirth) {
          skipped++;
          continue;
        }
        const derivedDob = data.birthYear ? normalizeDateOfBirth(data.birthYear) : null;
        if (!derivedDob) {
          skipped++;
          continue;
        }
        const { birthYear, age } = deriveBirthYearAndAge(derivedDob);
        batch.update(docSnap.ref, {
          dateOfBirth: derivedDob,
          birthYear,
          age,
          updatedAt: serverTimestamp()
        });
        updated++;
        opsInBatch++;
        if (opsInBatch >= CHUNK) {
          await flushBatch();
        }
      }
      await flushBatch();
      console.log(`✅ Backfill complete: ${updated} updated, ${skipped} skipped, ${snapshot.size} total`);
      return { updated, skipped, total: snapshot.size };
    } catch (error) {
      console.error("Error backfilling date of birth:", error);
      throw error;
    }
  }
};
const schoolService = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  calculateAge,
  calculateGenderStats,
  deriveBirthYearAndAge,
  formatLocalYMD,
  generateClassPrefix,
  generateSequentialStudentId,
  learnerService,
  normalizeDateOfBirth,
  normalizeSubjectName,
  toDate: toDate$1
}, Symbol.toStringTag, { value: "Module" }));
const SPONSOR_CODES = "sponsor_codes";
const toDate = (v) => !v ? void 0 : v instanceof Date ? v : typeof v.toDate === "function" ? v.toDate() : typeof v === "string" ? new Date(v) : v.seconds ? new Date(v.seconds * 1e3) : void 0;
function mapCode(id, d) {
  return {
    code: id,
    sponsorName: d.sponsorName || "",
    sponsorKeys: Array.isArray(d.sponsorKeys) ? d.sponsorKeys : [],
    learnerIds: Array.isArray(d.learnerIds) ? d.learnerIds : [],
    learnerCount: typeof d.learnerCount === "number" ? d.learnerCount : d.learnerIds?.length ?? 0,
    term: d.term || "",
    year: Number(d.year) || 0,
    status: d.status === "used" || d.status === "revoked" ? d.status : "active",
    createdAt: toDate(d.createdAt),
    createdBy: d.createdBy || "",
    createdByName: d.createdByName || "",
    expiresAt: toDate(d.expiresAt),
    usedAt: toDate(d.usedAt) ?? null,
    revokedAt: toDate(d.revokedAt) ?? null,
    revokedByName: d.revokedByName ?? null
  };
}
async function checkSponsorCode(typed) {
  const code = normalizeCodeInput(typed);
  if (!code) throw new Error("A sponsor code looks like SP-7KQ3-M9XP. Please check what you typed.");
  const snap = await getDoc(doc(db, SPONSOR_CODES, code));
  const found = snap.exists() ? mapCode(snap.id, snap.data()) : null;
  const problem = codeProblem(found);
  if (problem) throw new Error(problem);
  return found;
}
async function redeemSponsorCode(code) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, SPONSOR_CODES, code);
    const snap = await tx.get(ref);
    const problem = codeProblem(snap.exists() ? mapCode(snap.id, snap.data()) : null);
    if (problem) throw new Error(problem);
    tx.update(ref, { status: "used", usedAt: serverTimestamp() });
  });
}
async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
async function buildSponsorReports(learnerIds, term, year, opts = {}) {
  const ids = Array.from(new Set(learnerIds));
  let done = 0;
  const results = await pool(ids, 4, async (id) => {
    const [card, learnerSnap] = await Promise.all([
      resultsService.generateReportCard(id, term, year, { includeIncomplete: true, markMissing: true, publicView: opts.publicView }).catch(() => null),
      getDoc(doc(db, "learners", id)).catch(() => null)
    ]);
    done++;
    opts.onProgress?.(done, ids.length);
    const d = learnerSnap?.exists() ? learnerSnap.data() : null;
    const lite = {
      id,
      fullName: d?.fullName || d?.name || "Unknown learner",
      studentId: d?.studentId || "",
      className: d?.className || ""
    };
    return { card, lite };
  });
  return {
    cards: sortCardsByForm(results.filter((r) => r.card).map((r) => r.card)),
    noResults: results.filter((r) => !r.card).map((r) => r.lite).sort((a, b) => a.className.localeCompare(b.className, void 0, { numeric: true }) || a.fullName.localeCompare(b.fullName))
  };
}
const guidanceService = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  buildSponsorReports,
  checkSponsorCode,
  redeemSponsorCode
}, Symbol.toStringTag, { value: "Module" }));
exports.ResultsNotReleasedError = ResultsNotReleasedError;
exports.clearReleaseCache = clearReleaseCache;
exports.isTermReleased = isTermReleased;
exports.normalizeCodeInput = normalizeCodeInput;
exports.portalDirect = portalDirect;
exports.validateZambianNumber = validateZambianNumber;
