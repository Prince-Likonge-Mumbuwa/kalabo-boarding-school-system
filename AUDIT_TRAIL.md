# Audit trail

Admin → **Audit Trail** (`/dashboard/admin/audit-trail`): every change made
in the system — **who** did it, **what** they changed, **which record**, and
**when** — plus sign-in, sign-out and session expiry, and the face
recognition actions done on the server.

## What is recorded

- **Every change to the database** made in the app: adding, editing,
  archiving or deleting learners; results and SBA marks; registers;
  classes; teachers, class allocations, HoD and admissions officer roles;
  admissions; exam settings; timetable; year transition; settings; SMS
  records… Each change lists the record (e.g. `learners/abc123`), its name
  when known ("Amy Banda"), the fields written and their short values
  (text, numbers, yes/no; lists and maps by name only).
- **Sign-in, sign-out** and **"Session ended after 2 hours"**.
- **Face recognition** (from `face_audit`, written by the server): consent
  recorded or withdrawn, faces added or removed, scans, and clean-ups.
- Changes made within about a second by the same person (one save) form
  **one entry**, written as a sentence that names the person and what the
  change was for, e.g. "Muhau Nakwebwa saved Week 4 marks for 38 learners —
  Form 2A · Mathematics · Term 3 2026", "… took the register (2 periods) —
  Form 1B · Biology · Mon 19 Oct 2026 · periods 3, 4". The class, subject,
  exam (Week 4 / Week 8 / End of Term), term and year are kept with every
  change; for older entries and deletions they are read from the record ID.

Only changes that **succeeded** are recorded. Recording happens after the
save and can never slow down or stop it.

## Reading it

Choose the dates (the last 7 days by default), then filter by **person**,
**area** (Learners, Results, Attendance, Face recognition…) or search for a
name, student ID, field or value. Click an entry for the details: date and
time, the page it was done on, and every record changed. **Export CSV**
downloads the filtered entries, one line per change.

## Protection

`audit_log` entries can be **added only in the writer's own name, with the
server's time**, and can **never be changed or deleted** — not even by an
admin. Only admins can read them (Firestore rules, `firestore.rules`;
tests in `firestore-tests/audit.rules.emulator.ts`).

## How it works

The app's services import Firestore from `client/lib/auditedFirestore.ts`
instead of `firebase/firestore`. It is the same Firestore API; its write
calls (`setDoc`, `updateDoc`, `addDoc`, `deleteDoc`, batches and
transactions) record each successful change and save the entry about a
second later (or when the page is hidden / the user signs out). **New code
that writes to Firestore must import from `@/lib/auditedFirestore`** so its
changes are recorded too.

Files: `client/lib/auditedFirestore.ts`, `client/services/auditService.ts`,
`client/pages/admin/AuditTrail.tsx`; tests `client/lib/auditedFirestore.spec.ts`,
`client/pages/admin/AuditTrail.spec.tsx`.
