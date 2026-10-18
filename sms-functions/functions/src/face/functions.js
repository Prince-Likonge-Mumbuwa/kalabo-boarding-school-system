// Face recognition — callable Cloud Functions.
//
//   faceSetConsent   record / withdraw guardian consent (withdraw deletes faces)
//   faceEnrol        add one face template (an angle) for a learner
//   faceRevoke       remove one template, or all of a learner's templates
//   faceMatch        propose which learners of a class are in a camera frame
//   faceAdmin        admin tools: 'sync' (run the clean-up now), 'purgeAll'
//
// Photos and video never reach the server: the browser sends 128 numbers per
// face. Templates are encrypted with the FACE_TEMPLATE_KEY secret and stored
// in face_templates/{learnerId}, which no app user can read (Firestore rules).
// face_status/{learnerId} holds what the app may show: consent, how many
// angles are saved, and a readable snapshot (name, student number, class).
//
// Every function is onCall: Firebase checks the caller's sign-in token, and we
// check their users/{uid} record is an admin or teacher.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const lib = require('./lib');
const { reconcileFaces } = require('./sync');

const FACE_TEMPLATE_KEY = defineSecret('FACE_TEMPLATE_KEY');

const TEMPLATES = 'face_templates';
const STATUS = 'face_status';
const AUDIT = 'face_audit';

const db = () => getFirestore();

/* ---------- who is calling ---------- */

// Live scanning calls faceMatch several times a second; remember who the
// caller is for a short while instead of reading users/{uid} every time.
const staffCache = new Map(); // uid -> { at, staff }
const STAFF_TTL = 60_000;

async function requireStaff(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in again to use face recognition.');
  const hit = staffCache.get(uid);
  if (hit && Date.now() - hit.at < STAFF_TTL) return hit.staff;
  const snap = await db().collection('users').doc(uid).get();
  const u = snap.exists ? snap.data() : null;
  if (!u || (u.userType !== 'admin' && u.userType !== 'teacher')) {
    throw new HttpsError('permission-denied', 'Only school staff can use face recognition.');
  }
  if (u.status === 'inactive' || u.status === 'transferred') {
    throw new HttpsError('permission-denied', 'Your account is not active.');
  }
  const staff = { uid, isAdmin: u.userType === 'admin', name: u.fullName || u.name || 'Staff' };
  if (staffCache.size > 500) staffCache.clear();
  staffCache.set(uid, { at: Date.now(), staff });
  return staff;
}

/* ---------- settings (system/faceRecognition), cached briefly ---------- */

let settingsCache = { at: 0, value: null };
async function getSettings() {
  if (settingsCache.value && Date.now() - settingsCache.at < 30_000) return settingsCache.value;
  const snap = await db().collection('system').doc('faceRecognition').get();
  const value = lib.normalizeSettings(snap.exists ? snap.data() : null);
  settingsCache = { at: Date.now(), value };
  return value;
}

/** While the feature is switched off, only admins can use it (for a pilot). */
async function requireEnabled(staff) {
  const settings = await getSettings();
  if (!settings.enabled && !staff.isAdmin) {
    throw new HttpsError('failed-precondition', 'Face recognition is switched off. An administrator can switch it on in Settings.');
  }
  return settings;
}


/**
 * Consent, adding and removing faces: admins, the learner's form teacher, or
 * an admissions officer for learners admitted through Admissions.
 */
const FORM_TEACHER_SLOT = 'form-teacher';
async function requireFaceManager(staff, learnerData) {
  if (staff.isAdmin) return;
  const classId = learnerData && learnerData.classId;
  const [slot, cls, officer] = await Promise.all([
    classId ? db().collection('class_slots').doc(`${classId}__${FORM_TEACHER_SLOT}`).get() : null,
    classId ? db().collection('classes').doc(classId).get() : null,
    db().collection('staff_roles').doc(`${staff.uid}__admissions-officer`).get(),
  ]);
  const ctx = {
    ftSlot: slot && slot.exists ? slot.data() : null,
    classDoc: cls && cls.exists ? cls.data() : null,
    officerRole: officer && officer.exists ? officer.data() : null,
  };
  if (!lib.canManageFaces(staff, learnerData, ctx)) {
    throw new HttpsError('permission-denied', "Only an administrator, this learner's form teacher, or an admissions officer (for admitted learners) can do this.");
  }
}

/* ---------- helpers ---------- */

const str = (v, what) => {
  if (typeof v !== 'string' || !v.trim() || v.length > 200 || v.includes('/')) {
    throw new HttpsError('invalid-argument', `Missing or invalid ${what}.`);
  }
  return v.trim();
};

async function loadLearner(learnerId) {
  const snap = await db().collection('learners').doc(learnerId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Learner not found.');
  return { id: snap.id, data: snap.data() };
}

async function audit(staff, action, details) {
  try {
    await db().collection(AUDIT).add({
      action,
      userId: staff.uid,
      userName: staff.name,
      ...details,
      at: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error('face audit write failed', e);
  }
}

/** Decrypted templates per class, kept briefly so live matching stays fast. */
const classCache = new Map(); // classId -> { at, templates: [{learnerId, vector}] }
const CLASS_TTL = 30_000;
const forgetClass = (classId) => { if (classId) classCache.delete(classId); };

async function classTemplates(classId, secret) {
  const hit = classCache.get(classId);
  if (hit && Date.now() - hit.at < CLASS_TTL) return hit.templates;
  // The learner record is the source of truth: the learners who are in this
  // class RIGHT NOW and counted (active / no status). Their faces are looked
  // up by learner document id, so a learner who moved class is recognised in
  // the new class at once, whatever the face record's stored snapshot says.
  const learners = await db().collection('learners').where('classId', '==', classId).get();
  const ids = learners.docs.filter((d) => lib.isCountedLearner(d.data())).map((d) => d.id);
  const templates = [];
  for (let i = 0; i < ids.length; i += 100) {
    const refs = ids.slice(i, i + 100).map((id) => db().collection(TEMPLATES).doc(id));
    const snaps = await db().getAll(...refs);
    for (const d of snaps) {
      if (!d.exists) continue;
      for (const t of d.data().templates || []) {
        try {
          templates.push({ learnerId: d.id, vector: await lib.decryptTemplate(secret, t.data) });
        } catch (e) {
          console.error(`face template ${d.id}/${t.id} could not be decrypted (wrong FACE_TEMPLATE_KEY?)`);
        }
      }
    }
  }
  classCache.set(classId, { at: Date.now(), templates });
  return templates;
}

const wrap = (fn) => async (request) => {
  try {
    return await fn(request);
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    if (e instanceof lib.FaceInputError) throw new HttpsError('invalid-argument', e.message);
    console.error(e);
    throw new HttpsError('internal', 'Face recognition failed on the server. Try again.');
  }
};

const OPTS = { cors: true, secrets: [FACE_TEMPLATE_KEY], memory: '512MiB', timeoutSeconds: 60 };

/* ---------- consent ---------- */

exports.faceSetConsent = onCall(OPTS, wrap(async (request) => {
  const staff = await requireStaff(request);
  await requireEnabled(staff);
  const learnerId = str(request.data && request.data.learnerId, 'learner');
  const consent = !!(request.data && request.data.consent);
  const learner = await loadLearner(learnerId);
  await requireFaceManager(staff, learner.data);
  const snap = lib.learnerSnapshot(learner.id, learner.data);

  const statusRef = db().collection(STATUS).doc(learnerId);
  if (consent) {
    if (!lib.isCountedLearner(learner.data)) {
      throw new HttpsError('failed-precondition', 'This learner is not active, so face recognition cannot be used.');
    }
    await statusRef.set({
      ...snap,
      consent: true,
      consentAt: FieldValue.serverTimestamp(),
      consentBy: staff.uid,
      consentByName: staff.name,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } else {
    // Withdrawing consent deletes every face saved for the learner.
    const batch = db().batch();
    batch.delete(db().collection(TEMPLATES).doc(learnerId));
    batch.set(statusRef, {
      ...snap,
      consent: false,
      consentWithdrawnAt: FieldValue.serverTimestamp(),
      consentWithdrawnBy: staff.uid,
      templates: [],
      templateCount: 0,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
  }
  forgetClass(snap.classId);
  await audit(staff, consent ? 'consent.granted' : 'consent.withdrawn', { learnerId, studentId: snap.studentId, classId: snap.classId });
  return { ok: true, consent };
}));

/* ---------- enrolment ---------- */

exports.faceEnrol = onCall(OPTS, wrap(async (request) => {
  const staff = await requireStaff(request);
  await requireEnabled(staff);
  const d = request.data || {};
  const learnerId = str(d.learnerId, 'learner');
  const embedding = lib.checkEmbedding(d.embedding);
  if (d.modelVersion !== lib.MODEL_VERSION) {
    throw new HttpsError('failed-precondition', 'The app is out of date. Reload the page and try again.');
  }
  await requireFaceManager(staff, (await loadLearner(learnerId)).data);
  const data = await lib.encryptTemplate(FACE_TEMPLATE_KEY.value(), embedding);
  const id = lib.templateId();
  const now = Date.now();

  const result = await db().runTransaction(async (tx) => {
    const learnerRef = db().collection('learners').doc(learnerId);
    const statusRef = db().collection(STATUS).doc(learnerId);
    const tplRef = db().collection(TEMPLATES).doc(learnerId);
    const [learnerSnap, statusSnap, tplSnap] = await Promise.all([tx.get(learnerRef), tx.get(statusRef), tx.get(tplRef)]);
    if (!learnerSnap.exists) throw new HttpsError('not-found', 'Learner not found.');
    const ld = learnerSnap.data();
    if (!lib.isCountedLearner(ld)) throw new HttpsError('failed-precondition', 'This learner is not active.');
    if (!statusSnap.exists || statusSnap.data().consent !== true) {
      throw new HttpsError('failed-precondition', 'Record guardian consent before adding a face.');
    }
    const snap = lib.learnerSnapshot(learnerId, ld);
    const existing = tplSnap.exists ? (tplSnap.data().templates || []) : [];
    if (existing.length >= lib.MAX_TEMPLATES) {
      throw new HttpsError('resource-exhausted', `This learner already has ${lib.MAX_TEMPLATES} faces saved. Remove one first.`);
    }
    const templates = [...existing, { id, data, modelVersion: lib.MODEL_VERSION, createdAt: now, createdBy: staff.uid }];
    tx.set(tplRef, { ...snap, templates, updatedAt: FieldValue.serverTimestamp() });
    const meta = templates.map((t) => ({ id: t.id, createdAt: t.createdAt }));
    tx.set(statusRef, { ...snap, templates: meta, templateCount: meta.length, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { classId: snap.classId, studentId: snap.studentId, templateCount: meta.length };
  });

  forgetClass(result.classId);
  await audit(staff, 'face.enrolled', { learnerId, studentId: result.studentId, classId: result.classId, templateId: id });
  return { ok: true, templateId: id, templateCount: result.templateCount };
}));

/* ---------- removal ---------- */

exports.faceRevoke = onCall(OPTS, wrap(async (request) => {
  const staff = await requireStaff(request);
  const d = request.data || {};
  const learnerId = str(d.learnerId, 'learner');
  const only = typeof d.templateId === 'string' && d.templateId ? d.templateId : null;
  // A learner record that no longer exists: only an admin may clear its faces.
  const lsnap = await db().collection('learners').doc(learnerId).get();
  await requireFaceManager(staff, lsnap.exists ? lsnap.data() : null);

  const result = await db().runTransaction(async (tx) => {
    const statusRef = db().collection(STATUS).doc(learnerId);
    const tplRef = db().collection(TEMPLATES).doc(learnerId);
    const [statusSnap, tplSnap] = await Promise.all([tx.get(statusRef), tx.get(tplRef)]);
    const existing = tplSnap.exists ? (tplSnap.data().templates || []) : [];
    const keep = only ? existing.filter((t) => t.id !== only) : [];
    if (keep.length) tx.set(tplRef, { templates: keep, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    else tx.delete(tplRef);
    const meta = keep.map((t) => ({ id: t.id, createdAt: t.createdAt }));
    if (statusSnap.exists) tx.set(statusRef, { templates: meta, templateCount: meta.length, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { classId: (statusSnap.exists && statusSnap.data().classId) || (tplSnap.exists && tplSnap.data().classId) || '', removed: existing.length - keep.length, templateCount: meta.length };
  });

  forgetClass(result.classId);
  await audit(staff, only ? 'face.removed' : 'face.removedAll', { learnerId, classId: result.classId, removed: result.removed });
  return { ok: true, ...result };
}));

/* ---------- matching ---------- */

exports.faceMatch = onCall(OPTS, wrap(async (request) => {
  const staff = await requireStaff(request);
  const settings = await requireEnabled(staff);
  const d = request.data || {};
  const classId = str(d.classId, 'class');
  if (!Array.isArray(d.faces) || d.faces.length === 0 || d.faces.length > 60) {
    throw new HttpsError('invalid-argument', 'Invalid face data.');
  }
  const faces = d.faces.map((f) => ({ box: lib.checkBox(f && f.box), embedding: lib.checkEmbedding(f && f.embedding) }));
  const templates = await classTemplates(classId, FACE_TEMPLATE_KEY.value());
  // Warm-up from the scan screen opening: server and class faces are now
  // loaded; nothing is matched or logged.
  if (d.warm === true) {
    return { width: 0, height: 0, enrolledInClass: new Set(templates.map((t) => t.learnerId)).size, faces: [] };
  }
  const results = lib.matchFaces(faces, templates, settings);

  // Live camera asks often; only log the moments someone was recognised.
  const proposed = results.filter((r) => r.learnerId).map((r) => ({ learnerId: r.learnerId, similarity: r.similarity }));
  if (!d.live || proposed.length) {
    await audit(staff, d.live ? 'match.live' : 'match.photo', { classId, faces: results.length, proposed });
  }
  return {
    width: Number(d.width) || 0,
    height: Number(d.height) || 0,
    enrolledInClass: new Set(templates.map((t) => t.learnerId)).size,
    faces: results,
  };
}));

/* ---------- admin ---------- */

exports.faceAdmin = onCall(OPTS, wrap(async (request) => {
  const staff = await requireStaff(request);
  if (!staff.isAdmin) throw new HttpsError('permission-denied', 'Only an administrator can do this.');
  const action = request.data && request.data.action;
  if (action === 'sync') {
    const result = await reconcileFaces(db());
    classCache.clear();
    await audit(staff, 'admin.sync', result);
    return { ok: true, ...result };
  }
  if (action !== 'purgeAll') throw new HttpsError('invalid-argument', 'Unknown action.');

  // Delete every face template; keep consent records (with no faces).
  let removed = 0;
  for (;;) {
    const page = await db().collection(TEMPLATES).limit(300).get();
    if (page.empty) break;
    const batch = db().batch();
    for (const doc of page.docs) {
      batch.delete(doc.ref);
      batch.set(db().collection(STATUS).doc(doc.id), { templates: [], templateCount: 0, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      removed++;
    }
    await batch.commit();
  }
  classCache.clear();
  await audit(staff, 'admin.purgeAll', { learners: removed });
  return { ok: true, learners: removed };
}));
