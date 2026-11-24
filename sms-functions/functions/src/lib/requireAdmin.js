// requireAdmin(req, res) — for the SMS functions (they spend the school's SMS credit).
//
// The app sends the signed-in user's Firebase token with every SMS request
// (client/lib/authHeaders.ts → "Authorization: Bearer <token>"). This checks:
//   1. the token is genuine and not expired (Firebase Auth), and
//   2. users/{uid} is an administrator whose account is not pending or rejected
//      (the same test as isAdmin() in firestore.rules).
//
// Returns the user ({ uid, name }) when allowed. Otherwise it has already
// answered the request (401 / 403, JSON in the shape the app expects) and
// returns null, so the caller just does:   if (!(await requireAdmin(req, res))) return;

const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

function bearer(req) {
  const h = String(req.get?.('authorization') || req.headers?.authorization || '');
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : '';
}

async function requireAdmin(req, res, { auth = getAuth(), db = getFirestore() } = {}) {
  const token = bearer(req);
  if (!token) {
    res.status(401).json({ success: false, error: 'Please sign in again to send SMS.' });
    return null;
  }

  let decoded;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch (e) {
    res.status(401).json({ success: false, error: 'Your sign-in has expired. Please refresh the page and sign in again.' });
    return null;
  }

  const snap = await db.collection('users').doc(decoded.uid).get();
  const user = snap.exists ? snap.data() : null;
  const approved = user && !['pending', 'rejected'].includes(user.status);
  if (!user || user.userType !== 'admin' || !approved) {
    res.status(403).json({ success: false, error: 'Only an administrator can send SMS.' });
    return null;
  }

  return { uid: decoded.uid, name: user.fullName || user.name || user.email || 'Administrator' };
}

module.exports = { requireAdmin, bearer };
