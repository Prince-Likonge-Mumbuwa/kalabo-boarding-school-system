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

## Pass rule (one rule everywhere)

**The only fail is grade 9 (0–39%).** Grades 1–8 (40–100%) are passes.

| Category | Grades | Marks |
|---|---|---|
| Distinction | 1–2 | 70–100% |
| Merit | 3–4 | 60–69% |
| Credit | 5–6 | 50–59% |
| Pass (Satisfactory) | 7–8 | 40–49% |
| **Fail** | **9** | **0–39%** |

Quality pass = grades 1–2; quantity pass = grades 3–8. Averages are rounded
before grading (39.6% → 40% → grade 8), on report cards and in the analysis
alike. Pass rates on the dashboards count marks of 40% and above.

The helpers are in `resultsGrid.ts` (`isPassGrade`, `isFailGrade`,
`isPassPercentage`, `isQualityGrade`, `isQuantityGrade`, `gradeCategory`,
`gradeForAverage`) and used by the results analysis pages, their PDFs, the
class results PDF, report cards, the dashboards and the analytics services.
Tests: `client/services/passRule.spec.ts`.

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

## Classes that do not write a test

Some classes skip a test in a term — e.g. in Term 3 the Grade 12 classes sit
the ECZ final examinations instead of the school's End of Term exam.
Exam Management → New / Edit configuration → a test → **Classes that do not
write this test**: tap "All Grade 12" (or single classes) and give the
reason. Stored on the exam config as `notWrittenBy` (`{ endOfTerm: [classId…] }`)
and `notWrittenReason`; not copied to another term.

For those classes the test is left out of the class's grid
(`activeExamsForClass` / `isExamWrittenBy` in `types/exam.ts`), so it is
not required anywhere and every screen agrees:

- Results Entry doesn't offer it and says why ("Grade 12A does not write the
  End of Term test this term (ECZ final examinations)").
- Never missing on the monitor, the HoD view or the teacher dashboard, and
  no deadline countdown for it.
- Report cards (screen, PDF, Parent Portal, SMS) average the other tests and
  have no column for it; a card is not provisional because of it.
- The mark schedule progress pages leave it out for that term.

## Mark schedule PDF (Results Entry → Download)

1. **Mark schedule** (portrait): the selected test's marks, %, grade.
2. **Performance progress** (landscape, as many pages as the class needs):
   every learner, every test of the year so far — Term 1 W4, W8, EOT, term
   average, Term 2 … up to the term shown — then the year average, grade,
   position and change (latest mark minus first). Marks are shown as % so
   tests with different totals compare; the "out of" row gives each total.
   ABS absent · N/C not conducted · — not entered yet. Last row: class
   average.
3. **Class progress chart**: class average and pass rate test by test with
   the 40% pass line, grades on the year average, a test-by-test table
   (entered, absent, not yet, class average, highest, lowest, pass rate,
   quality), most improved (+10 points or more) and learners who need
   attention (latest below 40% or down 10 points).

Built from the same grids as the report cards
(`services/markScheduleProgress.ts`, loaded by
`markScheduleProgressLoader.ts`): a learner's term average here is the
subject average on their report card. A past term that can't be loaded is
named on the chart page; if the year can't be loaded at all, the schedule
still downloads and the progress page says why. (The old summary page looked
marks up by admission number, but results are saved by learner record, so it
came out empty; it also used one test's total for all three tests.)

## Results deadlines

The admin sets, per term, the last day for entering each test's marks:
Exam Management → New / Edit configuration → **Results due by** next to each
test (Week 4, Week 8, End of Term). Stored on the exam config as
`week4Deadline`, `week8Deadline`, `endOfTermDeadline` (`YYYY-MM-DD`; marks
are on time until the end of that day). Logic: `services/resultsDeadlines.ts`.

- A deadline can't be before its test's date or the start of the term, and
  the three must be in order (Week 4 ≤ Week 8 ≤ End of Term). A test that is
  switched off has no deadline.
- **Copy from Previous** never carries deadlines over to the new term.
- **Teachers** see a **live countdown** to the second (days : hours :
  minutes : seconds) to the end of the deadline day — blue with more than 3
  days left, amber within 3 days, red in the last 24 hours, and after the
  deadline it counts up as "overdue by" (`components/results/DeadlineCountdown.tsx`).
  - Dashboard → **Results to enter**: the nearest deadline as a big clock
    with "Enter now", other deadlines as one line each, then one short list
    per test (class · subject · how many still to enter · Enter), deadline
    order first; earlier terms with gaps are one collapsed line each.
  - Results Entry: each test button shows its deadline, and the selected
    test shows the countdown and how many learners still need marks.
- **Admin**: the Results Entry Monitor shows the three deadlines with the
  school's progress and how many teachers are overdue; a teacher with marks
  missing after a deadline gets an "N overdue" badge, and **Status → overdue**
  lists only them. **HoDs** see the deadlines and the same badge on My
  Department → Results.
- Status: *Due 20 Nov* → *Due in 3 days* (3 days or less) → *Due today* →
  *N days overdue*; *Complete* once every learner has a mark (or the test
  was recorded as not conducted).
- Deadlines don't lock Results Entry: marks can still be entered late, and
  they stay "overdue" until complete.

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

## One spelling per subject

The same subject typed differently ("PRINCIPLES OF ACCOUNTS", "Priciples of
Accounts", "Principle of Account", "P.O.A") used to show as two subjects, each
with its own marks. Now:

- `normalizeSubjectName` (`client/services/subjectMatch.ts`) forgives case,
  spaces, punctuation, "&"/"and" and small typos (1 letter for names up to 8
  letters, 2 for longer; only when exactly one subject is that close). Unknown
  subjects in ALL CAPS or all lower case go to Title Case. Every name in the
  subject list gives the same result as before. The SMS server keeps a copy
  (`sms-functions/functions/src/lib/subjectMatch.js`); a test checks they agree.
- Marks are read under that one spelling (grid, report cards, monitor, admin
  dashboard, analysis), and two subject assignments of one class for the same
  subject show as one subject (the one with a teacher).
- **Results Data Check → Same subject, different spellings (all terms)**
  lists the spellings and saves every mark under the one spelling. If a
  learner has a mark for the same test under both spellings, the newer is
  kept.
- **Remove extra assignments** (same section): a class with two assignments
  for one subject ("Food & Nutrition" and "food and nutrition") keeps the one
  with a teacher — or, when both have the same teacher, the correctly spelt
  one. Marks (their rules key), attendance registers and live timetable
  periods of the extra assignment move to the one kept; its open teacher row
  is closed ("removed"); then it is deleted. A subject assigned to two
  DIFFERENT teachers is left for the admin (remove the wrong teacher in
  Teacher Management, then check again). Removing a teacher alone never
  deletes an assignment — it only leaves it without a teacher.
