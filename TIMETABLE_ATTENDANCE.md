# Timetable and attendance

## How the timetable works

- **One record per period.** Each record is one subject (class slot) in one
  period on one day. A subject can have several lessons on one day.
- **Doubles and triples are worked out automatically.** Ticked periods of the
  same subject that follow each other form one lesson (a block). A break or
  lunch between them splits them. Nothing called "double" is stored any more.
  Old double records are read correctly, and the Timetable data check turns
  them into one record per period.
- **The school day is fixed:** P1 07:20–08:00, P2 08:00–08:40, P3 08:40–09:20,
  P4 09:20–10:00, **Break 10:00–10:20**, P5 10:20–11:00, P6 11:00–11:40,
  P7 11:40–12:20, P8 12:20–13:00.
  - The break is not a period and has no number.
  - There are no lessons before 07:20 or after 13:00.
  - Lessons are numbered P1–P8.
- **Who teaches** a lesson is never stored on the timetable. It is worked out
  from the class subject's owner and cover dates, at the moment the period
  starts on that date. A cover teacher gets the lessons only on the days the
  cover runs.

## Teachers: My Timetable

1. Pick a subject, tick its periods, optionally type a room.
2. A locked box says why it is locked:
   - another subject of the class is on then, or
   - you (or your cover) are in another class then.
3. **Submit changes** sends only the subjects that changed. The submission
   replaces the whole timetable of those subjects once an admin approves it:
   moved or unticked periods disappear, and a subject with nothing ticked is
   cleared. Until approval, the current live timetable stays in force.
4. Submitting is refused when there is a clash or a period is a break.

## Admin

- **Approvals.** You see each subject before and after. **Approve** is
  disabled while a clash exists. Clashes are checked again at the moment of
  approval, against the live timetable at that time. **Approve all with no
  clashes** approves submissions one by one.
- **Who's Teaching** (`/dashboard/admin/timetable-live`, also in the side
  menu):
  - Shows every class for the current or a chosen period, or the whole day.
  - For each lesson it shows the teacher (marked as cover where relevant),
    the room and the register status: taken, not yet marked, missed,
    uncovered, or later.
  - It also shows whether each class took its daily register, lets you look
    up "where is" a teacher by name, and gives a summary by teacher.
  - The admin dashboard has a "Lessons today" panel that links here.
- **Coverage** figures use the same calculation as the board, so they always
  agree. Only lessons that have started are counted. Registers are matched
  by subject and period.
- **Bell schedule.**
  - **Apply school bell schedule** (Periods tab, also in the Data check) sets
    the year's schedule to the times above. Lessons are matched in time
    order, and their timetable rows and registers move with them. Extra rows
    such as a lunch period or a 9th lesson are switched off.
  - Periods outside 07:20–13:00 are refused.
  - You cannot renumber a period, or turn it into a break, while lessons are
    timetabled in it. You can change its times or name.
- **Timetable data check** (Attendance Overview → Data check):
  - applies the school bell schedule when the saved one differs. It moves
    every timetable row and lesson register of that year to the new numbers,
    and it runs before anything else;
  - splits old doubles;
  - retires duplicates, records on breaks and records of deleted subjects;
  - lists clashes that are already live.

## Attendance

- **Attendance Tracking** lists the lessons you teach on the **selected
  date**. A double or triple appears once and is saved for each of its
  periods.
- Links from the dashboard open the right class, date and lesson.
- The learner list is the same as in Results Entry: learners with status
  `active` or no status.
- Every register now records `slotId` and `normalizedSubject`. The subject's
  owner and its live cover can edit each other's registers. The form teacher
  (or their cover) can edit the daily register. Older registers stay
  editable by whoever saved them.
- If a save fails, the page now says so; before, failures were silent.
- **Teacher dashboard:**
  - The **Now & Next** card shows the current lesson (including the second
    half of a double), the room, minutes left, the next lesson, cover notes,
    and today's list with taken or missed registers.
  - Attendance rates use the daily register only. Adding up lesson registers
    used to give rates over 100%.

## Firestore rules changes

- `attendance_sessions`:
  - period must be 1–8 (breaks are not periods);
  - edits are allowed by the marker or by the subject's owner or live cover;
  - when authority is enforced, a teacher may only create registers for a
    subject or form class they own or cover.
- `timetable_entries`:
  - status `archived` is allowed;
  - when authority is enforced, teachers may only create records for
    subjects they own or cover.
- New `timetable_submissions` collection: teachers create their own and may
  shrink or supersede them while pending; admins approve or reject.

Deploy: `firebase deploy --only firestore:rules --project catalyst-f1b1a`.
Test against the emulator first: `pnpm test:rules`. This runs
`firestore-tests/timetable.rules.emulator.ts` and the results tests.

## Rollout

1. Deploy the app.
2. Admin: check the bell schedule (Periods tab).
3. Run the **Timetable data check**: first **Apply the school bell schedule** if it is offered,
   then split doubles and retire bad records. Do this **before** deploying
   the rules, because the rules accept periods 1–8 only.
4. Deploy the rules.
5. Teachers tick their timetables; the admin approves them.
6. "Switch on" authority (Results data check) once every teacher has
   refreshed the app. It now covers timetables and registers too.

## Tests

`pnpm test` covers:

- the timetable model (blocks, now and next, clashes, locked boxes);
- the service on an in-memory Firestore (submit, approve, replace, clear,
  supersede, re-check, cover by date, board and coverage, bell-schedule
  guard), with teacher writes checked against a model of the rules;
- the data check;
- attendance registers against a rules model;
- attendance maths;
- page tests for My Timetable, Attendance Tracking, Now & Next and Who's
  Teaching.
