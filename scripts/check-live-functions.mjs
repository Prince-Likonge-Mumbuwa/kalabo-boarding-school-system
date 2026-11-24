// node scripts/check-live-functions.mjs
//
// Checks the LIVE Cloud Functions the way the browser uses them, without
// sending any SMS or reading anyone's data:
//   • SMS functions: the CORS "preflight" a browser sends first, then a request
//     WITHOUT a sign-in token — a working function answers 401 "Please sign in"
//     (proof the code runs and the admin check is on). Nothing is sent.
//   • portal: asks for the children of an incomplete number ("097"), which by
//     design matches nobody → { children: [] }.
// Prints one line per function and exits 1 if any check fails.
const PROJECT = 'catalyst-f1b1a';
// FUNCTIONS_BASE lets the same checks run against the local emulator.
const BASE = process.env.FUNCTIONS_BASE || `https://us-central1-${PROJECT}.cloudfunctions.net`;
const ORIGIN = 'http://localhost:8080'; // the browser's origin in development

const smsFunctions = ['sendSingleSms', 'bulkSendSms', 'sendAnnouncement', 'getSmsHistory', 'retrySms'];

function explain(status, text) {
  if (status === 404) return 'NOT DEPLOYED (404)';
  if (status === 403) return 'BLOCKED (403): the function is not public — redeploy it, or check its "allUsers" invoker in Google Cloud';
  if (status >= 500 && /<html|Server Error/i.test(text)) return `CRASHING (${status} from Google, before our code runs) — see the function logs`;
  return `unexpected ${status}: ${text.replace(/\s+/g, ' ').slice(0, 160)}`;
}

let failed = 0;
const line = (ok, name, msg) => { if (!ok) failed++; console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name.padEnd(17)} ${msg}`); };

for (const name of smsFunctions) {
  try {
    const pre = await fetch(`${BASE}/${name}`, {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
    });
    const allow = pre.headers.get('access-control-allow-origin');
    if (!(pre.status < 300 && allow)) { line(false, name, `preflight: ${explain(pre.status, await pre.text())}`); continue; }

    const r = await fetch(`${BASE}/${name}`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: '{}' });
    const text = await r.text();
    if (r.status === 401 && /sign in/i.test(text)) line(true, name, 'running; CORS ok; refuses requests without an admin sign-in');
    else if (r.status === 400) line(false, name, 'running, but it did NOT ask for a sign-in — the old code is still live');
    else line(false, name, explain(r.status, text));
  } catch (e) {
    line(false, name, `no answer: ${e.message}`);
  }
}

try {
  const r = await fetch(`${BASE}/portal`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { action: 'parentChildren', phone: '097' } }),
  });
  const text = await r.text();
  let body = null; try { body = JSON.parse(text); } catch {}
  if (r.status === 200 && Array.isArray(body?.result?.children)) line(true, 'portal', 'running; answers the Parent Portal');
  else line(false, 'portal', body?.error?.message ? `answered with an error: ${body.error.message}` : explain(r.status, text));
} catch (e) {
  line(false, 'portal', `no answer: ${e.message}`);
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll live checks passed.');
process.exit(failed ? 1 : 0);
