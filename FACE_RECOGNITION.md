# Face recognition attendance

Teachers can tick learners **present** by recognising their faces — live
through the camera, or from one photo of the class. It is an addition to the
existing registers, not a replacement:

- **Scan faces** only fills in the draft register. The teacher checks it and
  presses **Save** as before, so daily registers, lesson registers, doubles,
  cover rules, rollups, risk analysis and reports all work unchanged.
- The camera never marks anyone absent, late or excused.
- Learners without guardian consent (or without a saved face) are marked by
  hand, exactly as today.

The recognition engine is Tick's (YuNet + SFace, running in the browser).
Photos and video never leave the device; only 128 numbers per face are sent.

## Identity: how faces stay tied to the right learner

Every learner already has a record in `learners/{id}` with a name and a
student number. Face data is stored under **that record's document id**:

| | |
|---|---|
| `face_templates/{learnerId}` | the encrypted faces. No app user can read it — only the Cloud Functions. |
| `face_status/{learnerId}` | consent, how many faces are saved, and a copy of name / student number / class for display. Staff can read it. |
| `face_audit/{id}` | who enrolled, removed or scanned, and when. Admins can read it. |
| `system/faceRecognition` | on/off switch and thresholds (Settings). |
| `attendance_sessions/*.faceMatches` | on a saved register: which learners were ticked by face (learner id → match score). |

Why the document id: student numbers **change** (transfers and year
transition: `F1A_007` → `F2A_007`, the old one goes to `previousStudentIds`).
The document id never changes, so a learner's faces follow them through
promotions and class transfers automatically.

Matching always starts from the learner records: `faceMatch` takes the
learners who are active in the class **right now** and looks up their faces
by document id. A learner who moved class is recognised in the new class at
once.

A scheduled job, `faceSyncScheduled` (every 3 hours), tidies the face records:

- learner **moved, promoted or renamed** → the copy of name / student number /
  class on their face records is refreshed, and the faces stay;
- learner **archived, graduated, transferred out or deleted** → their face
  data is deleted (biometric data is not kept for people who have left).

(A Firestore trigger would do this instantly, but this project's Firestore
database is in `asia-southeast3`, where Google does not offer Firestore
triggers. That is also why a Firestore-triggered function such as the
attendance `onSessionWritten` cannot be deployed in this project.)

Names and student numbers shown on the scan screen always come from the
register's own learner list, never from the face data. A face can only be
suggested for a learner who is on that register (same class, active).

## Turning it on

Do these once, in order.

1. **Secret key** for the face templates (keep a copy somewhere safe, apart
   from backups — without it saved faces can't be read):
   ```
   cd sms-functions
   firebase functions:secrets:set FACE_TEMPLATE_KEY
   ```
   Moving faces over from Tick? Enter **Tick's `TEMPLATE_KEY`** here
   (from `tick-v4/.env` or `tick-v4/data/secrets.json`).

2. **Deploy the functions** (or double-click `deploy-face-functions.bat`,
   which also sets the key from Tick). `src/attendance/triggers.js` is not in this
   folder, so deploy the new functions by name (a plain deploy would offer to
   delete the live attendance triggers — answer **No** if asked):
   ```
   cd sms-functions
   firebase deploy --only functions:faceSetConsent,functions:faceEnrol,functions:faceRevoke,functions:faceMatch,functions:faceAdmin,functions:faceSyncScheduled
   ```
   Firebase may ask to enable Secret Manager — say yes.

3. **Test and deploy the Firestore rules:**
   ```
   pnpm test:rules
   firebase deploy --only firestore:rules --project catalyst-f1b1a
   ```

4. **Deploy the website** as usual (push to main). The build downloads the
   38 MB face model once (`scripts/fetch-models.mjs`); to skip the download,
   copy `tick-v4/web/public/models/sface.onnx` into `public/models/`.

5. **Pilot.** While the switch is off, only **admins** see the face features:
   Settings → Face recognition → a class → *Enrol faces*. Try it in real
   classroom light.

6. **Switch on** in Settings → Face recognition → *On for all teachers*.
   Form teachers then see **Enrol faces** in My Class, and every teacher sees
   **Scan faces** on Attendance Tracking.

## Daily use

**Enrol (form teacher, once per learner):** My Class → *Enrol faces* → pick a
learner (or *Start with the first learner who needs a face*) → confirm the
guardian's consent form is on file → *Start camera*. The camera saves a face
by itself when exactly one face is close, clear and still. Add 3 angles.
*Next learner →* moves down the class.

**Take a register:** Attendance Tracking → choose the class and lesson as now
→ *Scan faces* → *Start camera* (or *Photo*). Green = clear match, amber =
check, red = not known. *Tick N present*, review the list, then **Save**.
Learners ticked by face show a small "face" tag until saved.

**Withdraw consent:** open the learner in *Enrol faces* → *Withdraw consent*.
All their saved faces are deleted at once.

## Moving faces from Tick

`tick-v4/scripts/export-faces-to-kalabo.mjs` copies faces enrolled in Tick
onto the matching **existing** learners — it never creates or renames anyone.
A Tick learner is matched by student number (current, or a previous one) and
the name must agree; a number that matches someone with a different name is
skipped and listed for you to check. It runs as a dry run first and writes a
report (`kalabo-face-import.csv`). Instructions are at the top of the script.

## Settings

| | Default | |
|---|---|---|
| Clear match at | 0.45 | at or above: pre-ticked |
| Possible match at | 0.363 | between the two: "check" (teacher decides); below: not recognised |

## Before going live

- [ ] Signed guardian consent forms on file, and school / DEBS approval
- [ ] `FACE_TEMPLATE_KEY` stored safely, separate from backups
- [ ] Face data is processed by Firebase in `us-central1` (outside Zambia).
      Record this in your data-handling notes against the Data Protection
      Act, 2021
- [ ] Accuracy checked in your classrooms' light, across all learner groups
- [ ] Teachers know: the camera only ticks present; they still check and Save

## Troubleshooting

| Message | Fix |
|---|---|
| "The camera needs … https" | Open the school system through its https address. |
| "Face recognition is switched off" | An admin switches it on in Settings (admins can always use it). |
| "Record guardian consent before adding a face" | Tick the consent button first. |
| "Face recognition is not set up on the server yet" | Deploy the functions (step 2). |
| Scan finds faces but names nobody | Learners of that class need faces enrolled; or lower "Clear match" slightly. |
| First scan is slow | The 38 MB model downloads once per device; do it on Wi-Fi. |

## Files

- `client/lib/face/` — engine from Tick (`core.ts`, `index.ts`, `live.ts`),
  `faceApi.ts` (calls to the functions), `register.ts` (suggestions)
- `client/components/face/` — `FaceScanDialog`, `FaceEnrolDialog`,
  `ClassFaceEnrolment`, `FaceRecognitionSettingsCard`, `camera`
- `client/hooks/useFaceRecognition.ts`, `client/types/face.ts`
- Changed: `AttendanceTracking.tsx`, `MyClass.tsx`, `Settings.tsx`,
  `useAttendanceSession.ts`, `attendanceService.ts`, `types/attendance.ts`,
  `lib/firebase.ts`, `firestore.rules`, `vite.config.ts`, `package.json`,
  `public/.htaccess`, `public/sw.js`
- `sms-functions/functions/src/face/` — `functions.js`, `sync.js` (scheduled clean-up), `lib.js`
- Tests: `client/lib/face/register.spec.ts`,
  `client/hooks/useAttendanceSession.face.spec.tsx`,
  `client/pages/teacher/AttendanceTracking.face.spec.tsx`,
  `client/services/attendanceService.spec.ts`,
  `firestore-tests/face.rules.emulator.ts`,
  `sms-functions/functions/src/face/lib.selftest.js` (`npm test` there)
