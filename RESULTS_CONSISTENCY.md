# Results consistency

Every screen that shows results now reads ONE calculation, so for the same
data they show the same numbers:

| Screen | Uses |
|---|---|
| Results Entry (teacher) | `resultsService.getSubjectCompletionStatus` → grid |
| Results Entry Monitor (admin) + teacher dashboard warning | `services/resultsMonitor.ts` → grid |
| Report Cards list, progress bars, report card, PDFs, class matrix | `resultsService.getStudentProgress` / `generateClassReportCards` → grid |
| Results SMS | `resultsService.formatClassResultsSMSAsync` → report card → grid |
| Parent Portal (screen + PDF) | `resultsService.generateReportCard` → grid |

## The grid (`client/services/resultsGrid.ts`)

One grid per class + term + year:

**active learners × subjects × active exams**

- **Term**: every results screen opens on the current academic term.
- **Active exams**: `isExamActive()` — box ticked AND total marks > 0.
- **Learners**: status `active` or no status. Archived/withdrawn/moved
  learners don't count; their old marks are ignored.
- **Subjects**: class slots (`class_slots`), never the Form Teacher role.
  Vacant slots count only if they already have marks this term.
- **Cells**: `entered`, `absent` (-1), `not_conducted` (-2), `pending`.
  An exam is "not conducted" for a subject when it has -2 rows and no real
  marks; then every learner's cell is done.
- **Averages**: subject = mean of entered percentages over active exams;
  overall = mean of subject averages; ECZ grades 1–9. Positions rank the same
  overall averages (ties share a place).
- On report cards a pending mark is `-3` and prints `—` (never `ABS`).
  Cards with pending marks say **PROVISIONAL** (screen, PDF and SMS).

Loading: `client/services/resultsGridLoader.ts`. Errors are thrown, never
shown as 0% or 100%.

## Saving marks

`resultsService.saveClassResults` saves by learner **document id**, only the
rows passed in (Results Entry sends only marks you changed), rejects marks
outside 0..total, reports skipped learners, and writes `normalizedSubject`
(slot key), `enteredBy` (once) and `lastEditedBy` for the Firestore rules.
The subject's owner (even while the subject is covered) and a cover/TP
teacher whose cover is live may save, edit, overwrite and delete marks.

Subjects are matched however they are spelled. Some class subjects were
set up under an older name (e.g. "Computer Studies", which is now "ICT").
They are still recognised as the teacher's own subject, so entry boxes and
Save are never locked by a spelling difference. Marks are saved under the
current name, against the subject's real record, so the rules allow them.
Save stays clickable and says so when there is nothing to save.

Results Entry: drafts are auto-saved for any unsaved change (also when marks
are already saved) and can be loaded at any time from the drafts list; marks
can be entered over an exam recorded as "not conducted".

## Firestore rules (`firestore.rules`)

Changes from the deployed version:
- `results`: teacher writes must have a valid shape (marks −1, −2 or
  0..totalMarks; valid term; integer year). Teachers may now delete results
  (own rows; or, when authority is enforced, the slot's owner or live cover).
- When authority is enforced, results may be written by the slot's owner
  (even while covered) or its live cover/TP teacher (`canEnterMarks`).
- `examConfigs`: readable by anyone (Parent Portal); writable by admins only.
- `class_slots`: readable by anyone (Parent Portal subject list).

Deploy: `firebase deploy --only firestore:rules --project catalyst-f1b1a`
(from this folder; `firebase.json` points at `firestore.rules`).

Test against the emulator first: `pnpm test:rules`
(needs the Firebase CLI and Java).

## Rollout

1. Deploy the app and the rules.
2. Admin → Results Monitor → **Data check**: fix learners without status /
   index, add the subject key to old result rows, review marks filed under
   the wrong term.
3. When every teacher has refreshed to the new app, use **Switch on** in the
   data check to set `system/assignmentEngine.enforceAuthority = true`.

## Tests

`pnpm test` — grid rules, end-to-end consistency (service + loader + monitor
on an in-memory Firestore, every write checked against a model of the
rules), data check, and Results Entry page render tests.
