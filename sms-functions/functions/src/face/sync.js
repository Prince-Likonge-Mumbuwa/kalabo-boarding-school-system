// Keeps face data consistent with the learner record it belongs to.
//
// (A Firestore trigger would do this instantly, but this project's Firestore
// database is in asia-southeast3, where Google does not offer Firestore
// triggers. So a scheduled job does it instead, every 3 hours, and an admin
// can run it at once through faceAdmin {action: 'sync'}.)
//
// Face data is keyed by the learner's document id, which never changes:
//
//   • learner deleted, or no longer counted (archived / graduated /
//     transferred out of the school)  →  the learner's face templates and
//     face status are deleted. Biometric data is not kept for people who
//     have left. (Matching already ignores them straight away: it only uses
//     learners who are active in the class at that moment.)
//   • learner moved class, given a new student number (transfer, year
//     transition) or renamed  →  the readable snapshot (classId, className,
//     studentId, fullName) on face_templates and face_status is refreshed.
//
// Only the face collections are written — never the learner records.

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const lib = require('./lib');

async function reconcileFaces(db) {
  const [statusSnap, tplSnap] = await Promise.all([db.collection('face_status').get(), db.collection('face_templates').get()]);
  const status = new Map(statusSnap.docs.map((d) => [d.id, d.data()]));
  const tpl = new Map(tplSnap.docs.map((d) => [d.id, d.data()]));
  const ids = [...new Set([...status.keys(), ...tpl.keys()])];

  const learners = new Map();
  for (let i = 0; i < ids.length; i += 300) {
    const snaps = await db.getAll(...ids.slice(i, i + 300).map((id) => db.collection('learners').doc(id)));
    for (const s of snaps) learners.set(s.id, s.exists ? s.data() : null);
  }

  const { remove, refresh } = lib.planReconcile(ids, learners, status, tpl);
  const ops = [];
  for (const r of remove) {
    ops.push((b) => b.delete(db.collection('face_templates').doc(r.learnerId)));
    ops.push((b) => b.delete(db.collection('face_status').doc(r.learnerId)));
    ops.push((b) => b.set(db.collection('face_audit').doc(), {
      action: 'face.deletedLearnerLeft', learnerId: r.learnerId, reason: r.reason,
      userId: 'system', userName: 'System', at: FieldValue.serverTimestamp(),
    }));
  }
  for (const r of refresh) {
    const data = { ...r.snapshot, updatedAt: FieldValue.serverTimestamp() };
    if (status.has(r.learnerId)) ops.push((b) => b.set(db.collection('face_status').doc(r.learnerId), data, { merge: true }));
    if (tpl.has(r.learnerId)) ops.push((b) => b.set(db.collection('face_templates').doc(r.learnerId), data, { merge: true }));
  }
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
  return { checked: ids.length, removed: remove.length, refreshed: refresh.length };
}

exports.reconcileFaces = reconcileFaces;

exports.faceSyncScheduled = onSchedule({ schedule: 'every 3 hours', timeZone: 'Africa/Lusaka' }, async () => {
  const r = await reconcileFaces(getFirestore());
  console.log(`face sync: checked ${r.checked}, removed ${r.removed}, refreshed ${r.refreshed}`);
});
