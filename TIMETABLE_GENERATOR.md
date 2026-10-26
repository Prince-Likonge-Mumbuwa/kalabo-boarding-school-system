# Timetable generator

The school timetable is now **generated from the HoDs' allocations and
published by the administration**. Teachers no longer tick and submit their
own timetables: they receive the published one (My Timetable), which is the
timetable they must follow.

The week is the school's fixed day: Monday–Friday, P1–P8, with the break
between P4 and P5. Timetables are shown and printed with the **days as rows
and the periods as columns**.

## Who does what

| Who | What |
|---|---|
| **HoD** | My Department → Allocations: puts the right teacher on every class subject, then **Mark allocations complete** for the term (Reopen to change them). |
| **Admin** | Attendance & Timetable → **Timetable**: everything below, including **Publish**, **Withdraw** and deleting. Can mark a department complete on its behalf (for example one with no HoD), and chooses which HoDs may generate. |
| **Timetabler** (a HoD the admin switched on in Readiness) | Menu → **Timetable Builder**: the curriculum, generating and editing **drafts**. Cannot publish or change the published timetable. |
| **Teacher** | My Timetable: their week, the timetable of each class they teach (form class first), and branded PDFs. Read-only. |

## Steps

1. **Readiness** — the timetable can only be generated when every
   department whose subjects are in the curriculum has marked its
   allocations complete, and every level has its subjects. Subjects still
   without a teacher are listed; they are timetabled without one (when a
   teacher is allocated later they take over those periods).
2. **Curriculum** — per level (Form 1, Grade 10 …), each subject's:
   - **Fewest / Most** periods a week. The fewest are always placed; extra
     periods up to the most are placed where they fit.
   - **Doubles** and **Triples** (how many of the periods are taught 2 or 3
     together). The rest are singles.
   - **Time of day**: any time, *prefer mornings*, or *mornings only*
     (P1–P4; e.g. Additional Mathematics).
   - **Not P8** (avoid the last period).
   - **Room**: a special room only one class at a time can use (lab,
     computer room…).

   Also: **class exceptions** (a class that does not take a subject, or
   takes it for a different number of periods), **special rooms**, **fixed
   school events** (periods kept free every week, e.g. Monday P1 assembly,
   for the whole school or some levels), and the most periods a teacher
   should teach in a day.

   **Bulk import class allocation** (top of the Curriculum tab): load the
   whole curriculum from a CSV file or rows pasted from Excel — one row per
   class or level and subject: `Class / Level, Subject, Periods, Most,
   Doubles, Triples, Time of day, Not P8, Room, Taken` (only the first three
   are needed). *Download template* gives the current classes and subjects
   to fill in.
   - A level row (*Form 1*) is taken by every class of the level; a class
     row (*Form 1B*) with other numbers or *Taken = No* becomes a class
     exception.
   - A subject listed only for some classes is taken only by those classes;
     the level gets the setting most of them have.
   - *Replace* (default) replaces the subjects and exceptions of the levels
     in the file; *Only add or update* keeps their other subjects. Levels not
     in the file are never touched. A new room name adds a special room.
   - **Check rows** lists every row with a problem (line number and why);
     those rows are skipped. **Apply** puts the result in the tab as unsaved
     changes: review it, then **Save curriculum** (or Undo).
3. **Generate** — first a plain-language check that the set-up can work at
   all (a class, teacher or room needing more periods than the week has,
   too many mornings-only periods, too many triples …). Then the generator
   runs in the background (Quick / Standard / Thorough) and saves a
   **draft**. *Start from the timetable in use now* keeps what still fits,
   so teachers' weeks change less.
4. **Timetables** — review a draft by **class, teacher or room**. On a
   class, tap a lesson, then a green place (or a lesson marked *Swap*):
   moves that would clash are never offered, and hovering says why. **Lock**
   lessons you want to keep and **Regenerate unlocked** to re-solve the
   rest. PDFs: the shown class / teacher / room, all classes (master), all
   teachers.
5. **Publish** (admin) — the draft becomes the timetable of every teacher
   and class **from today**: My Timetable, Attendance Tracking, Now & Next,
   Who's Teaching and coverage all use it at once. Teachers see a "new
   timetable from …" notice. Publishing again later replaces it the same
   way; **Withdraw** removes it from today.

## The rules the generator never breaks

- A class, a teacher (the owner **and** any live cover / TP teacher) and a
  special room are in one place at a time.
- Every subject gets its periods and its shape; a double or triple never
  crosses the break.
- Mornings-only subjects stay in P1–P4; school events stay free.
- A subject has at most one lesson a day (two when it has more than five
  lessons a week), and two lessons of a subject on one day are never side
  by side (they would read as one longer lesson).

What it tries for (scored, the lower the better): prefer-mornings subjects
in the morning, P8 avoided where asked, a subject's lessons spread over the
week and not always at the same period, teachers not over their daily
limit nor four periods in a row and with few gaps, a class's free periods at
the end of the day, extra periods where they fit. The review lists the
preferences it could not fully meet.

How: the hardest lessons first (triples, doubles, mornings only, rooms,
busy teachers); a lesson with nowhere to go moves one or two others to free
places, or takes the place that displaces the fewest (with a memory so
lessons don't swap back and forth); then thousands of moves and swaps
improve the score without ever breaking a rule. The same settings and seed
give the same timetable. A 30-class school takes a second or two.

## History is kept by date

Published rows carry `effectiveFrom`; the rows they replace get
`effectiveTo` (the publish day). A past date — a register taken late,
Who's Teaching or coverage for last week — uses the timetable that was in
force that day.

## Data

| | |
|---|---|
| `timetable_config/school` | curriculum, class exceptions, rooms, events, daily limit |
| `timetable_signoffs/{year}_{term}_{department}` | allocations complete (HoD or admin) |
| `timetable_versions/{id}` | a generated timetable: lessons, per-subject names/rooms, what could not be placed, preferences not met; `draft` → `published` → `archived` |
| `staff_roles/{uid}__timetabler` | a HoD the admin allows to generate |
| `timetable_entries` | the published timetable, one row per period (`versionId`, `effectiveFrom`, `effectiveTo`) — the same rows every screen already read |

Firestore rules: only the admin writes `timetable_entries` and
`timetable_submissions` (teachers no longer can); the curriculum is written
by the admin or a Timetabler; a Timetabler may only create, edit and delete
**drafts**; a HoD signs off only their own department.

## Files

- `client/services/timetableGenerator/` — `types.ts`, `problem.ts`
  (curriculum → problem, the arithmetic check, readiness),
  `curriculumImport.ts` (bulk import / template of the class allocation), `solver.ts`
  (+ `solver.worker.ts`, `runSolver.ts`), `editor.ts` (hand moves/swaps),
  `documents.ts` (PDF pages), `service.ts` (Firestore, publishing)
- `client/services/pdf/timetablePDF.ts` — branded PDF (A4 landscape)
- `client/pages/admin/TimetableBuilder.tsx`,
  `client/components/timetable/builder/*` (incl. `CurriculumImportCard.tsx`),
  `client/pages/teacher/TimetableBuilderPage.tsx`
- `client/components/timetable/DayRowsGrid.tsx` — days × periods grid
- `client/pages/teacher/MyTimetable.tsx` — read-only, PDFs
- `client/components/departments/hod/HodSignoffCard.tsx`
- Tests: `client/services/timetableGenerator/*.spec.ts`,
  `client/pages/admin/TimetableBuilder.spec.tsx`,
  `client/pages/teacher/MyTimetable.spec.tsx`,
  `firestore-tests/timetable.rules.emulator.ts` (`pnpm test:rules`)
