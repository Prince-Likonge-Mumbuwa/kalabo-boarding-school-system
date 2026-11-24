# SMS and Parent Portal — how the pieces fit

Both features run as **Cloud Functions** (project `catalyst-f1b1a`, region `us-central1`).
The website (Netlify) only calls them; if the functions are down, these features stop.

## The Parent Portal and Sponsor Portal

Parents and sponsors never sign in, and the database rules are closed to signed-out
visitors. So the portal page asks the **`portal`** function, which reads with admin rights
and returns only what the visitor is allowed to see.

| File | What it does |
|---|---|
| `client/services/portalApi.ts` | Browser side: calls `portal` with an `action` (`parentChildren`, `parentReport`, `sponsorCheck`, `sponsorReports`, `sponsorRedeem`). |
| `sms-functions/functions/src/portal/portal.js` | The function: checks the input, slows down address-guessing, turns errors into sentences, and calls the core. |
| `sms-functions/functions/src/portal/portalCore.cjs` | **Built file — commit it.** The app's own code (`portalDirect.ts`, report card builder) compiled for the server, so a parent sees exactly the card the school sees. |
| `sms-functions/portal/adminFirestore.ts` | Makes the app's Firestore calls (`getDocs`, `query`, `where` …) work on the server's Admin SDK. |
| `sms-functions/portal/shims.ts` | Replaces browser-only modules (sign-in, web app) on the server. |
| `vite.config.portal.ts` | The build recipe for `portalCore.cjs`. |
| `sms-functions/portal/portal.spec.ts` | Test: the card from the function must equal the card from the app. |

**When you change results / report-card / learner / sponsor code**, rebuild the core and deploy:

```bat
npm run build:portal
npx vitest run sms-functions/portal
deploy-sms-and-portal.bat
```

## The SMS functions

| Function | Used by |
|---|---|
| `sendSingleSms` | Report Cards → send one learner's results |
| `bulkSendSms` | Report Cards → send a class |
| `sendAnnouncement` | Admin dashboard → announcements and parent summons |
| `getSmsHistory`, `retrySms` | Report Cards → SMS history panel |
| `atDeliveryReportWebhook` | Africa's Talking delivery reports (stays open, no sign-in) |
| `retryFailedSMSWorker` | Scheduled retries |

Every SMS function except the webhook checks the caller with
`sms-functions/functions/src/lib/requireAdmin.js`: a valid sign-in token from an approved
**admin** (the same test as `isAdmin()` in `firestore.rules`). Without it, the function
answers 401 and sends nothing, so nobody outside the school can spend the SMS credit.

## Deploying and checking

* `deploy-sms-and-portal.bat` — checks the live functions, saves Google's logs, runs the
  self-tests, deploys only the listed functions, then checks again. Log:
  `deploy-sms-and-portal.log`.
* `node scripts/check-live-functions.mjs` — any time: one line per function, live.
  It sends no SMS and reads no parent data.

What the checker's answers mean:

| Answer | Meaning |
|---|---|
| `NOT DEPLOYED (404)` | The function does not exist on Google — deploy it. |
| `CRASHING (500 from Google …)` | It exists but fails before our code runs — read the logs (`firebase functions:log`); often billing or a broken deploy. |
| `BLOCKED (403)` | It is not public — redeploy it. |
| In the browser, "blocked by CORS policy" | Usually one of the three above; the browser just reports it as CORS. |

**Never run a plain `firebase deploy --only functions`**: the attendance triggers'
source (`src/attendance/triggers.js`) is missing, and it would offer to delete them.
