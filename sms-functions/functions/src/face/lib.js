// Face recognition — pure helpers shared by the face Cloud Functions.
//
// Ported from Tick (server/lib.js). The encryption format is identical
// (base64(iv).base64(tag).base64(ciphertext), AES-256-GCM, key = SHA-256 of
// the secret), so templates exported from Tick decrypt here with the same key.
//
// IDENTITY RULE: a learner's face data is always keyed by the learner's
// Firestore document id (learners/{id}). That id never changes. The
// learner's studentId DOES change (transfers, year transition: F1A_007 →
// F2A_007), and so do className and fullName, so those are only stored as
// a readable snapshot and refreshed by the scheduled clean-up (sync.js).

const MODEL_VERSION = 'yunet-2023mar+sface-2021dec';

/** At most this many face templates (angles) per learner. */
const MAX_TEMPLATES = 5;

/** Defaults; an admin can change them in system/faceRecognition. */
const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  // SFace cosine similarity. 0.363 is the model's published cut-off;
  // at or above matchThreshold a learner is pre-ticked, in between "check".
  reviewThreshold: 0.363,
  matchThreshold: 0.45,
});

function normalizeSettings(data) {
  const d = data || {};
  const num = (v, dflt, lo, hi) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : dflt;
  };
  const reviewThreshold = num(d.reviewThreshold, DEFAULT_SETTINGS.reviewThreshold, 0.2, 0.9);
  const matchThreshold = Math.max(
    reviewThreshold,
    num(d.matchThreshold, DEFAULT_SETTINGS.matchThreshold, 0.2, 0.95),
  );
  return { enabled: d.enabled === true, reviewThreshold, matchThreshold };
}

/** Same rule as the app's results / attendance screens (resultsGrid.isCountedLearner). */
const isCountedLearner = (l) =>
  !!l && (l.status === undefined || l.status === null || l.status === '' || l.status === 'active');

/** Readable snapshot of who a face belongs to. Never used to identify anyone. */
function learnerSnapshot(id, d) {
  return {
    learnerId: id,
    classId: d.classId || '',
    className: d.className || '',
    studentId: d.studentId || '',
    fullName: d.fullName || d.name || '',
  };
}

/** True when the stored snapshot no longer matches the learner record. */
function snapshotChanged(stored, snap) {
  if (!stored) return false;
  return ['classId', 'className', 'studentId', 'fullName'].some((k) => (stored[k] || '') !== (snap[k] || ''));
}

/* ---------- encryption (AES-256-GCM, Web Crypto — built into Node 22) ---------- */

const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const unb64 = (text) => new Uint8Array(Buffer.from(text, 'base64'));

const keys = new Map();
function aesKey(secret) {
  if (!secret) throw new Error('FACE_TEMPLATE_KEY is not set');
  if (!keys.has(secret)) {
    keys.set(secret, (async () => {
      const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
      return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    })());
  }
  return keys.get(secret);
}

async function encryptTemplate(secret, embedding) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new Uint8Array(new Float32Array(embedding).buffer);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), plain));
  const body = sealed.subarray(0, sealed.length - 16);
  const tag = sealed.subarray(sealed.length - 16);
  return [iv, tag, body].map(b64).join('.');
}

async function decryptTemplate(secret, text) {
  const [iv, tag, body] = String(text).split('.').map(unb64);
  const sealed = new Uint8Array(body.length + tag.length);
  sealed.set(body);
  sealed.set(tag, body.length);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await aesKey(secret), sealed);
  return new Float32Array(plain);
}

/* ---------- validation ---------- */

class FaceInputError extends Error {}

/** An embedding from the browser: 128 finite numbers of unit length. */
function checkEmbedding(v) {
  if (!Array.isArray(v) || v.length !== 128 || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new FaceInputError('Invalid face data — reload the page and try again');
  }
  const n = Math.hypot(...v);
  if (n < 0.95 || n > 1.05) throw new FaceInputError('Invalid face data — reload the page and try again');
  return v;
}

function checkBox(b) {
  if (!Array.isArray(b) || b.length !== 4 || !b.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new FaceInputError('Invalid face data');
  }
  return b.map(Math.round);
}

/* ---------- matching ---------- */

const cosine = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // both vectors are unit length
};

/**
 * A "clear match" must also be clearly better than the next most similar
 * learner for the same face; when two learners score almost the same (look-
 * alikes, siblings, a poor picture) the teacher is asked to check instead.
 */
const AMBIGUITY_MARGIN = 0.05;

/**
 * Match each detected face to at most one learner, and each learner to at most one face.
 * faces: [{box, embedding}]; templates: [{learnerId, vector}]
 * Returns one result per face: {box, learnerId|null, similarity|null, verdict}.
 */
function matchFaces(faces, templates, { reviewThreshold, matchThreshold }) {
  const pairs = [];
  const runnerUp = faces.map(() => new Map()); // face -> learnerId -> best similarity of any OTHER learner
  faces.forEach((face, f) => {
    const best = new Map(); // learnerId -> best similarity for this face
    for (const t of templates) {
      const s = cosine(face.embedding, t.vector);
      if (s > (best.get(t.learnerId) ?? -1)) best.set(t.learnerId, s);
    }
    const ranked = [...best.entries()].sort((a, b) => b[1] - a[1]);
    for (const [learnerId] of ranked) {
      const other = ranked.find(([id]) => id !== learnerId);
      runnerUp[f].set(learnerId, other ? other[1] : -1);
    }
    for (const [learnerId, s] of best) if (s >= reviewThreshold) pairs.push({ f, learnerId, s });
  });

  pairs.sort((a, b) => b.s - a.s);
  const usedFaces = new Set();
  const usedLearners = new Set();
  const results = faces.map((face) => ({ box: face.box, learnerId: null, similarity: null, verdict: 'unknown' }));
  for (const p of pairs) {
    if (usedFaces.has(p.f) || usedLearners.has(p.learnerId)) continue;
    usedFaces.add(p.f);
    usedLearners.add(p.learnerId);
    const clear = p.s >= matchThreshold && p.s - (runnerUp[p.f].get(p.learnerId) ?? -1) >= AMBIGUITY_MARGIN;
    results[p.f] = {
      ...results[p.f],
      learnerId: p.learnerId,
      similarity: Number(p.s.toFixed(3)),
      verdict: clear ? 'match' : 'review',
    };
  }
  return results;
}

/**
 * What the scheduled clean-up should do. learners: Map(id → learner data or
 * null when deleted); status / templates: Map(id → stored face doc).
 */
function planReconcile(ids, learners, status, templates) {
  const remove = [];
  const refresh = [];
  for (const id of ids) {
    const l = learners.get(id);
    if (!l) { remove.push({ learnerId: id, reason: 'learner deleted' }); continue; }
    if (!isCountedLearner(l)) { remove.push({ learnerId: id, reason: `status ${l.status}` }); continue; }
    const snap = learnerSnapshot(id, l);
    if (snapshotChanged(status.get(id), snap) || snapshotChanged(templates.get(id), snap)) refresh.push({ learnerId: id, snapshot: snap });
  }
  return { remove, refresh };
}

/** A short random id for one template (so a single angle can be removed). */
const templateId = () => b64(crypto.getRandomValues(new Uint8Array(9))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));

module.exports = {
  MODEL_VERSION,
  MAX_TEMPLATES,
  AMBIGUITY_MARGIN,
  DEFAULT_SETTINGS,
  normalizeSettings,
  isCountedLearner,
  learnerSnapshot,
  snapshotChanged,
  encryptTemplate,
  decryptTemplate,
  FaceInputError,
  checkEmbedding,
  checkBox,
  matchFaces,
  templateId,
  planReconcile,
};
