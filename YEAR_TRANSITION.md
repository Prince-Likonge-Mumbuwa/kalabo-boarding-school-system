# Year transition (promotion, graduation, admissions)

Admin → **Year Transition** (`/dashboard/admin/year-transition`).

## How it works

- **Classes are streams.** "Form 2A" keeps its document from year to year,
  so its subjects, teachers and timetable carry over. Learners move between
  streams when the new year begins.
- **A learner's document id never changes.** Results, attendance registers
  and SBA records use that id, so nothing is lost or re-filed when they move.
- **Closing a year saves who was in each class that year**, in
  `enrollments/{learnerId}_{year}`. Anything that looks at a past year uses
  that list instead of the class's current learners. This covers report cards
  (admin, PDF, SMS, Parent Portal), Results Entry for a late Term 3, the
  Results data check, and a learner's class history.
- **The school year** is stored in `system/academicYear`. The transition moves
  it forward. SBA Entry uses it to work out each class's exam year.

## The wizard

1. **Year.** Pick the closing year and the final Form (4, or 5). The final
   Grade is 12. Checks before you start: it is the new year, Term 3 marks are
   in, and every learner is in a class.
2. **Classes.** Each class goes to the same stream one level up (Form 1A →
   Form 2A, Grade 11B → Grade 12B). Final-year classes graduate. A next class
   that does not exist is created. An archived class with that name is
   re-used. You can change any destination, for example to merge two streams.
3. **Learners.** Exceptions only. Choose **Repeat**, **Leaves school** (with a
   reason), **Graduate**, a different stream, or **New-year admission (stays)**.
   A learner whose date of first entry is in the new year is treated as a
   new-year admission automatically.
4. **Review & run.** Shows learner numbers per class before and after, new
   classes, and which empty classes to archive. Form 1 is kept for the
   intake. Also shows id changes (download as CSV) and any problems. Type the
   new year, then run.

## What a run changes

| Data | Change |
|---|---|
| Learners promoted or repeating | New class fields and student id. `academicYear` becomes the new year. The old id goes into `previousStudentIds`. |
| Graduates | `status: graduated`, `graduationYear`, `exitYear`, and id `G12A_007-2026` |
| Leavers | `status: transferred`, `exitYear`, `exitReason`, and id `F3B_010-2026` |
| New-year admissions | Stamped with the new year, otherwise unchanged |
| `enrollments` | One closed record per learner for the closing year: class, id, outcome and next class |
| `sba_results` | A promoted learner's SBA record moves to their new class. A repeater's moves to their new exam year. |
| `classes` | Missing next classes are created and chosen empty classes archived. `year` and learner counts are updated. |
| `system/academicYear` | `currentYear` becomes the new year |
| `promotion_runs`, `promotion_run_items` | The stored plan, progress and undo information |

**Not changed:** results, attendance registers, teacher assignments, class
subjects and timetables.

## Student ids

- Learners keep their number in the new class: `F1A_007` → `F2A_007`.
- If that id is taken (for example by a repeater), the learner gets the next
  free number in the class.
- Graduates and leavers keep their id with the year added. This frees
  `G12A_007` for next year's Grade 12, and ids stay unique for ever.
- Searching by an old id still finds the learner.

## Safety

- Nothing is written until **Run**.
- A run that stops part-way can be **resumed** with the same plan. Learners
  already moved are skipped.
- The latest run can be **undone** (History tab). Learners, ids, statuses and
  SBA records go back. Classes the run created are removed if unused, and
  archived classes come back. Marks already entered for the new year are kept.
- The same year cannot be run twice. Undo it first.

## Teachers and the new year

- Teachers stay with their streams. Check assignments after the run.
- New classes start with no subjects. Assign them in Teachers.
- Run the transition once Term 3 marks are complete. Marks entered later
  still go to the right learners. However, a class archived by the run no
  longer appears in teachers' Results Entry class list.

## Firestore rules

- New `enrollments`: public read, admin write. The Parent Portal shows a past
  term's card from the child's class in that year.
- New `promotion_runs` and `promotion_run_items`: admin only.

Deploy:

```
firebase deploy --only firestore:rules,firestore:indexes --project catalyst-f1b1a
```

This deploys the rules and the new `enrollments` (classId, year) index. Until
then, the run still works for admins. Past-year screens fall back to current
class lists for signed-out Parent Portal visitors.

## Tests

`pnpm test` covers:

- `promotionPlan.spec.ts`: next levels, the class map, decisions, id rules and
  class totals;
- `promotionService.spec.ts`: a full run on the in-memory Firestore. It checks
  learners, enrollments, SBA, classes, past-year report cards, the data check,
  old-id lookup, chunked plans, resume and undo, and that no write contains
  `undefined`;
- `YearTransition.spec.tsx`: walking the wizard, running, undo and the former
  learners list.
