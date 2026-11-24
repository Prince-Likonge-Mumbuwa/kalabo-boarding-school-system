// sms-functions/portal/portalCore.ts — entry of the portal bundle.
//
// `npm run build:portal` (vite.config.portal.ts) compiles this file, together
// with the app code it imports, into
//   sms-functions/functions/src/portal/portalCore.cjs
// which the `portal` Cloud Function (src/portal/portal.js) loads.
//
// It is the browser fallback `portalDirect` — the same lookups and the same
// report card builder as the app — running with admin rights on the server.
// Run the build again after changing results, report card, learner or
// guidance code, or the Parent Portal will build cards with the old rules.
export { portalDirect } from '@/services/portalDirect';
export { isTermReleased, ResultsNotReleasedError, clearReleaseCache } from '@/services/resultsPublication';
export { normalizeCodeInput } from '@/services/guidancePlan';
export { validateZambianNumber } from '@/lib/phone';
