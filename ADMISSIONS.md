# Admissions

Admin → **Admissions** (`/dashboard/admin/admissions`). Admissions officers
see **Admissions** in their teacher menu (`/dashboard/teacher/admissions`).

## Who does what

| | Admin | Admissions officer | Other teachers |
|---|---|---|---|
| Make a teacher an admissions officer | ✓ | | |
| Set up the intake (open/close, levels, places per class) | ✓ | | |
| Enrol learners, print slips | ✓ (even when closed) | ✓ (when open) | |
| Choose the class by hand | ✓ | | |
| Watch classes fill up; reprint slips | ✓ | ✓ | |
| Cancel an admission | ✓ | | |

**Making a teacher an officer:** Teachers → open the teacher → **School
Roles** → *Make admissions officer*. You can also do it in Admissions →
Settings → Admissions officers. Removing the role takes the menu item away.
The role is stored in `staff_roles/{teacherId}__admissions-officer`, with its
history.

## The process

1. The learner goes through the school's physical admission process.
2. The officer opens **Admit learner** and enters the details: learner,
   guardian, sponsor and health. Before saving, the page shows which class the
   learner will go to.
3. **Save and generate student ID**:
   - The learner is checked against the system first (same name, or same date
     of birth and guardian phone). A possible match is shown before anything
     is saved.
   - The learner is placed in the class with the most room.
   - The student ID is generated, for example `F1B_012`.
   - An admission number is given, for example `ADM-2027-0001`.
4. **Print admission slip**: one A4 sheet with a guardian's copy and a
   school's copy. Each copy shows the student ID, the class, the admission
   number, the learner and guardian details, the form teacher, and signature
   lines. Slips can be reprinted from **Admitted**.

## Placement (no class over-enrolled)

- Only classes that are open for the intake and not full are used.
- The learner goes to the **least full** class (learners ÷ places).
- If classes are equally full, the learner goes to the class with fewer
  learners of the same gender. This keeps boys and girls balanced.
- With equal places, classes fill one learner at a time in turn. They never
  differ by more than one learner, and never go over their places.
- When every class is full, saving is refused. The admin then adds places or
  a class.

Two officers can save at the same moment safely. Each admission moves the
intake's counter (`admission_settings/{year}.seq`) forward inside a
transaction. If someone else saved in the meantime, the learner is placed
again with that admission counted. So no class is overfilled and no student
ID is given twice.

## Progress

**Class progress** shows, per level and per class:

- places taken out of places, as a boys/girls bar;
- full classes;
- the gap between the fullest and emptiest class;
- admissions today and admissions per officer.

It updates every 20 seconds.

Counts cover the intake year only. Last year's learners still in Form 1
before the year transition are not counted, so the next year's intake can be
admitted early.

## Data

| Collection | Content |
|---|---|
| `learners` | The new learner. Same fields as other learners, plus `academicYear` / `admissionYear` (intake year), `admissionNumber`, `admissionType`, `examNumber`, `guardianRelationship` and `admittedBy` |
| `admissions/{year}-{seq}` | The admission record behind each slip; `status` is `admitted` or `cancelled` |
| `admission_settings/{year}` | `isOpen`, `levels`, `defaultCapacity`, `capacities`, `excludedClassIds`, `seq` |
| `classes` | `students` and `nextStudentIndex` (the class's student-number counter) |

- Student numbers continue after the highest number ever used in the class.
- Add learner and CSV import in Class Management now use the same counter,
  so numbers never repeat between the two ways of adding learners.
- **Cancelling** an admission archives the learner (it is not deleted) and
  frees the place. The admission number is not used again.
- Learners admitted for the new year are left in place by the year
  transition, because they already belong to that year.

## Firestore rules

New rules:

- `staff_roles`: admin writes.
- `admission_settings`: admin writes. An officer may only move `seq` on by
  one, and only while the intake is open.
- `admissions`: officers create their own records; the admin changes or
  cancels them.

Officers already may create learners and update class counts.

```
firebase deploy --only firestore:rules --project catalyst-f1b1a
```

## Tests

`pnpm test`:

- `admissionsPlan.spec.ts`: placement, gender balance, capacity, validation,
  duplicates.
- `admissionsService.spec.ts`: roles, intake counting, filling to capacity,
  unique continuing IDs, the old Add learner path using the same counter,
  closed intakes, admin-only class choice, two officers at once, and
  cancelling.
- `AdmissionsWorkspace.spec.tsx`: an officer enrolling and printing; the
  duplicate warning; the slip.
