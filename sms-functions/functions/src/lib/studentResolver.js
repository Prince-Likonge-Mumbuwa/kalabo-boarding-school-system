// Resolves any student identifier → { documentId, customId, data }
// Accepts: custom studentId (e.g. "G10B_001") OR Firestore document ID

const { getFirestore } = require('firebase-admin/firestore');
const db = getFirestore();

async function resolveStudent(studentId) {
  // Try custom studentId field first (e.g. "G10B_001")
  const q = await db.collection('learners')
    .where('studentId', '==', studentId).limit(1).get();

  if (!q.empty) {
    const doc = q.docs[0];
    return { documentId: doc.id, customId: studentId, data: doc.data() };
  }

  // Fall back to document ID
  const snap = await db.collection('learners').doc(studentId).get();
  if (snap.exists) {
    const data = snap.data();
    return { documentId: snap.id, customId: data.studentId || studentId, data };
  }

  return null;
}

module.exports = { resolveStudent };