// Cloud Function `portal` — the Parent Portal and the Sponsor Portal.
//
// Called from the browser by client/services/portalApi.ts with
// httpsCallable(functions, 'portal')({ action, ... }).
//
// Parents and sponsors never sign in, and the Firestore rules are closed to
// signed-out visitors. This function does the lookups with admin rights and
// returns ONLY what the portal needs: a guardian's own children, a published
// report card, or a sponsor code's learners.
//
// The work itself is the app's own code (client/services/portalDirect.ts and
// the report card builder), bundled into ./portalCore.cjs by
//   npm run build:portal        (see vite.config.portal.ts)
// so a card built here is exactly the card the school sees.
//
// Actions                                          Returns
//   parentChildren { phone }                       { children: [...] }
//   parentReport   { phone, learnerId, term, year }{ reportCard | null }
//   sponsorCheck   { code }                        { code: {...} }
//   sponsorReports { code }                        { reports: {...} }
//   sponsorRedeem  { code }                        { ok: true }
//
// Every error is an HttpsError whose message is a full sentence ending in a
// full stop: portalApi treats a bare word ("internal") as "the function is
// unreachable" and would fall back to reading Firestore from the browser.

const { onCall, HttpsError } = require('firebase-functions/v2/https');

// Loaded on first call, not at deploy-time analysis (keeps cold starts and the
// deploy's code scan fast).
let core = null;
const loadCore = () => (core ??= require('./portalCore.cjs'));

// ───────────── input checks ─────────────
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function needPhone(data) {
  const phone = str(data.phone, 20);
  if (!phone) throw new HttpsError('invalid-argument', 'Please enter the phone number the school has on file.');
  return phone;
}
function needCode(data) {
  const code = str(data.code, 40);
  if (!code) throw new HttpsError('invalid-argument', 'Please enter a sponsor code.');
  return code;
}
function needTerm(data) {
  const term = str(data.term, 40);
  const year = Number(data.year);
  if (!term || !Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new HttpsError('invalid-argument', 'Please choose a term and year.');
  }
  return { term, year };
}

// ───────────── a light brake on guessing phone numbers / codes ─────────────
// Per server instance (not global), but enough to stop a script hammering one
// instance. A real parent never comes close.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40;
const hits = new Map();
function throttle(req) {
  const ip = String(req.rawRequest?.headers?.['x-forwarded-for'] || req.rawRequest?.ip || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.start > WINDOW_MS) {
    hits.set(ip, { start: now, n: 1 });
  } else if (++h.n > MAX_PER_WINDOW) {
    throw new HttpsError('resource-exhausted', 'Too many requests. Please wait a minute and try again.');
  }
  if (hits.size > 5000) hits.clear();
}

// ───────────── errors from the app code → sentences for the visitor ─────────────
function toHttpsError(err) {
  if (err instanceof HttpsError) return err;
  const message = String(err?.message || '');
  if (err?.code === 'results-not-published' || err?.name === 'ResultsNotReleasedError') {
    return new HttpsError('failed-precondition', message || 'These results have not been released yet.');
  }
  // The app code throws plain sentences meant for the visitor ("That code has
  // already been used. ..."). Database and network errors always carry a
  // `code`, and are never shown as they are.
  if (err instanceof Error && err.code === undefined && /[.!?]$/.test(message) && message.length <= 300) {
    return new HttpsError('failed-precondition', message);
  }
  console.error('[portal] unexpected error', err);
  return new HttpsError('internal', 'The school records service had a problem. Please try again in a moment.');
}

// ───────────── actions ─────────────
const actions = {
  async parentChildren(data) {
    const children = await loadCore().portalDirect.parentChildren(needPhone(data));
    return { children };
  },

  async parentReport(data) {
    const phone = needPhone(data);
    const learnerId = str(data.learnerId, 128);
    if (!learnerId) throw new HttpsError('invalid-argument', 'Please choose a learner.');
    const { term, year } = needTerm(data);
    const c = loadCore();
    // Only a PUBLISHED term, before any card is built.
    if (!(await c.isTermReleased(term, year))) throw new c.ResultsNotReleasedError(term, year);
    // portalDirect also checks that the learner belongs to this phone number.
    const reportCard = await c.portalDirect.parentReport(phone, learnerId, term, year);
    return { reportCard: reportCard ?? null };
  },

  async sponsorCheck(data) {
    return { code: await loadCore().portalDirect.sponsorCheck(needCode(data)) };
  },

  async sponsorReports(data) {
    return { reports: await loadCore().portalDirect.sponsorReports(needCode(data)) };
  },

  async sponsorRedeem(data) {
    await loadCore().portalDirect.sponsorRedeem(needCode(data));
    return { ok: true };
  },
};

async function handle(req) {
  const data = req.data && typeof req.data === 'object' ? req.data : {};
  const action = actions[data.action];
  if (!action) throw new HttpsError('invalid-argument', 'Unknown request. Please refresh the page and try again.');
  throttle(req);
  try {
    return await action(data);
  } catch (err) {
    throw toHttpsError(err);
  }
}

exports.handle = handle; // for the self-test

exports.portal = onCall(
  {
    cors: true,
    invoker: 'public',
    // Sponsor reports for a big class can take a while (the browser waits 5 minutes).
    timeoutSeconds: 300,
    memory: '1GiB',
    maxInstances: 10,
  },
  handle
);
