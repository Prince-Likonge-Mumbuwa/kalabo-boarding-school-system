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

After a **year transition** (run, resumed or undone) the app asks the server
to do this clean-up at once, so leavers' faces are deleted and promoted
learners show in their new class straight away. (Undoing a transition after
that brings the leavers back without faces; capture them again.) Face badges
in the app are looked up by learner id, so they are right even before the
clean-up.

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
   Attendance → **Face recognition** tab → a class → *Enrol faces*. Try it in
   real classroom light.

6. **Switch on** in Settings → Face recognition (the switch is the only face
   setting left in Settings). Form teachers then see **Enrol faces** in My
   Class and on Attendance Tracking, and every teacher sees **Scan faces** on
   Attendance Tracking.

7. **Redeploy `faceMatch`** after updating (Oct 2026): it adds the
   "clearly one learner" rule, the warm-up call and a faster sign-in check.
   The app works with the old function too, just without those.
   ```
   cd sms-functions
   firebase deploy --only functions:faceMatch
   ```

## Daily use

**Capture at enrolment:** after **Add Learner** (Classes, My Class) and after
**Admissions** → *Save and generate student ID*, press *Capture face now*.
**Edit Learner** shows the learner's face status with *Capture face* /
*Manage face*. The face is saved under the new learner's record, so it follows
them from then on.

**Learners already in the system without a face:** Classes → a class's
learners → **Faces** (admins), My Class → *Enrol faces* (form teachers), or
Attendance → Face recognition → a class. Filter *Needs photo* / *No consent*
and work down the list.

**Enrol (form teacher, once per learner):** My Class → *Enrol faces* → pick a
learner (or *Start with the first learner who needs a face*) → confirm the
guardian's consent form is on file → *Start camera*. The camera saves a face
by itself when exactly one face is close, clear and still. Add 3 angles.
*Next learner →* moves down the class.

**Take a register:** Attendance Tracking → choose the class and lesson as now
→ *Scan faces* (the button shows how many learners of the class have a face
saved) → *Start camera* (or *Photo*). Green = clear match, amber = check (or
"Name…" while a borderline match is being confirmed), red = not known.
*Tick N present*, review the list, then **Save**. Learners ticked by face
show a small "face" tag until saved.

**Fast roll call:**
- Tick *Tick clear matches automatically*; with *Sound on* each tick beeps
  (and buzzes on phones), so you needn't watch the screen.
- **Zoom** on the back rows: pinch, mouse wheel, double-tap, the slider or
  1× 2× 3× 4×; drag to look around (the small map shows where you are).
  Phones whose camera supports zoom use the camera's own zoom first (full
  sensor quality), then a crop. Without zoom, faces smaller than about 80
  camera pixels are not even found; zoomed, faces of 30–60 px are.
- The bar at the top counts *N of M present*; *Not yet* lists who is left.
- On a phone the scanner fills the screen; the light button appears when the
  camera has a torch.

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
| Clear match at | 0.45 | at or above (and clearly above every other learner, by 0.05): pre-ticked |
| Possible match at | 0.363 | between the two: "check" (teacher decides); below: not recognised |

Settings holds only the on/off switch. Match levels, class progress,
*Enrol faces* for any class and *Delete all faces* are in Attendance →
Face recognition (admins).

## How live recognition stays fast and accurate

- Frames are taken as the camera delivers them (never the same one twice);
  the camera is opened at full HD so zooming has pixels to use.
- Only the zoomed part is analysed; a zoomed crop is enlarged so distant
  faces pass the size check (anything under 28 camera pixels is ignored).
- Only the pixels around each face are read for recognition.
- Each sighting gets a quality score (size in camera pixels, sharpness,
  head turn). A new face waits up to 0.65 s for a good sighting; the best 3
  sightings of a face are combined before asking the server (in tests,
  combining lifted similarity from 0.83–0.89 to 0.93).
- A match close to the threshold is confirmed by a second answer (~0.2 s
  later); a strong match counts at once. One learner can only be one face.
- Up to 6 faces per request and 3 requests on the way; the server is woken
  and the class's faces loaded as soon as the scanner opens.
- Enrolment refuses blurred or turned-away pictures (for up to 2.5 s), so
  saved faces are good ones.

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
| Back rows not recognised | Zoom in on them (pinch / wheel / 2×–4×). |
| "Record guardian consent before adding a face" | Tick the consent button first. |
| "Face recognition is not set up on the server yet" | Deploy the functions (step 2). |
| Scan finds faces but names nobody | Learners of that class need faces enrolled; or lower "Clear match" slightly. |
| First scan is slow | The 38 MB model downloads once per device; do it on Wi-Fi. |

## Files

- `client/lib/face/` — engine from Tick (`core.ts`, `index.ts`, `live.ts`),
  `quality.ts` (sighting quality, combining), `zoom.ts` (zoom maths),
  `faceApi.ts` (calls to the functions), `register.ts` (suggestions)
- `client/components/face/` — `FaceScanDialog`, `FaceEnrolDialog`,
  `ClassFaceEnrolment`, `LearnerFace` (Add / Edit Learner, Admissions), `FaceRecognitionPanel` (Attendance tab),
  `FaceRecognitionToggleCard` (Settings switch), `camera` (camera, zoom)
- `client/hooks/useFaceRecognition.ts`, `client/types/face.ts`
- Changed: `AttendanceTracking.tsx`, `MyClass.tsx`, `Settings.tsx`,
  `useAttendanceSession.ts`, `attendanceService.ts`, `types/attendance.ts`,
  `lib/firebase.ts`, `firestore.rules`, `vite.config.ts`, `package.json`,
  `public/.htaccess`, `public/sw.js`
- `sms-functions/functions/src/face/` — `functions.js`, `sync.js` (scheduled clean-up), `lib.js`
- Tests: `client/lib/face/register.spec.ts`, `client/lib/face/live.spec.ts`,
  `client/components/face/faceSettings.spec.tsx`,
  `client/hooks/useAttendanceSession.face.spec.tsx`,
  `client/pages/teacher/AttendanceTracking.face.spec.tsx`,
  `client/services/attendanceService.spec.ts`,
  `firestore-tests/face.rules.emulator.ts`,
  `sms-functions/functions/src/face/lib.selftest.js` (`npm test` there)
