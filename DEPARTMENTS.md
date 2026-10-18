# Departments and Heads of Department (HoD)

## Who belongs where

A teacher can belong to one or more departments. **Teachers cannot add
themselves** — Settings only shows their departments.

- **Head of Department:** My Department → **Teachers**: add a teacher, or
  remove one. A HoD can only change membership of their own department.
- **Admin:** Teacher Management → a teacher → **Departments** (any department).

Stored on `users/{id}.departments` (a list). The old single `department`
text is kept in step (names joined with commas), so every older screen,
filter and PDF still shows it. Teachers whose record only has the old text
are read as members of that department.

The school's list is `system/departments.names`. Until an admin adds a
department, the default list is used: Mathematics, Natural Sciences,
Languages, Social Sciences, Business Studies, Expressive Arts, Design &
Technology, Home Economics, Agricultural Science.

## Department subjects

Teacher Management → **Departments** (admin): choose the subjects each
department is responsible for (`system/departments.subjects`). A subject
belongs to one department. This decides what a HoD may allocate.

## Head of Department

Teacher Management → a teacher → Departments → **Head of Department**:
choose one of the teacher's departments → *Make Head of Department*.

- One HoD per department: appointing another teacher ends the current HoD's
  role (the screen says who will step down first).
- A teacher heads one department; *Move to Head of …* changes it.
- *End HoD role* ends it. Every change is kept in the role's history.
- A HoD stays a member of the department they head (the admin ends the
  role first).

Stored like the admissions officer role: `staff_roles/{teacherId}__hod`
(`role: 'hod'`, `department`, `status`, history). Only admins can write
`staff_roles` (existing Firestore rules), so a teacher cannot make
themselves HoD.

## What a HoD gets — My Department

- **Results:** each department teacher's results entry this term — the same
  numbers as the admin's Results Entry Monitor.
- **Roll call:** for any school day, each teacher's lessons (from the
  approved timetable, covers included) against the registers saved, with
  missed lessons listed and the daily register of form teachers. Same data
  as the admin's "Who's Teaching".
- **Allocations:** for each department subject, which teacher teaches it in
  each class. Changing a teacher, or making a class vacant, uses exactly the
  same assignment engine calls as Teacher Management (class slots + history
  rows), so the admin's Teacher Management, Results Entry, the Results Entry
  Monitor, registers, report cards and the timetable all see the change at
  once. A change starts now and stays until changed (term after term); the
  history keeps who taught what before. These allocations are what a future
  timetable generator will use. Covers / Teaching Practice and Form Teachers
  stay with the admin.
- **Teachers:** add / remove department teachers.

## Security (Firestore rules)

- A teacher cannot change `departments` / `department` on their own record.
- An active HoD may change another teacher's departments only by adding or
  removing their own department.
- An active HoD may write the assignment engine's documents only for their
  department's subjects, only with teachers of their department, never Form
  Teacher slots or covers / TP. The membership caches the engine rebuilds
  (`classes.teachers`, `users.assignedClasses`) are allowed; Form Teacher
  pointers can never be changed by a HoD.
- **Deploy the rules** (double-click `deploy-firestore-rules.bat`, or
  `firebase deploy --only firestore:rules --project catalyst-f1b1a`). Until
  then a HoD's changes are refused. Test them first: `pnpm test:rules`
  (`firestore-tests/departments.rules.emulator.ts`, which also runs a real
  allocation through the assignment engine as a HoD).

## Files

- `client/services/departmentService.ts`, `client/hooks/useDepartments.ts`
- `client/components/departments/` — `DepartmentPicker`,
  `TeacherDepartmentsSection` (Teacher Management), `DepartmentSubjectsDialog`
  (Teacher Management → Departments), `MyDepartmentsCard` (Settings, read
  only), `hod/` (the four My Department tabs)
- `client/pages/teacher/MyDepartment.tsx` (route
  `/dashboard/teacher/department`)
- Tests: `client/services/departmentService.spec.ts`,
  `client/pages/teacher/MyDepartment.spec.tsx`,
  `firestore-tests/departments.rules.emulator.ts`,
  `client/components/departments/departments.spec.tsx`,
  `client/components/DashboardLayout.spec.tsx`
