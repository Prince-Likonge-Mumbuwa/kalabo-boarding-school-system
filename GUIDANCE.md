# Guidance & Counselling: sponsored learners and sponsor codes

Admin → **Guidance & Sponsors** (`/dashboard/admin/guidance`). Guidance
officers see **Guidance & Counselling** in their teacher menu
(`/dashboard/teacher/guidance`). Sponsors use the **Parent Portal → Sponsor**
(`/parent-portal?mode=sponsor`).

## Who does what

| | Admin | Guidance officer | Sponsor (signed out) |
|---|---|---|---|
| Make a teacher a guidance officer | ✓ | | |
| See sponsored learners and their results | ✓ | ✓ | |
| Download all of a sponsor's report cards (one PDF) | ✓ | ✓ | |
| Generate a sponsor code | ✓ | ✓ | |
| Cancel an unused code | ✓ | ✓ | |
| Download their learners' report cards with a code | | | ✓ (once per code) |

**Making a teacher a guidance officer:** Teachers → open the teacher →
**School Roles** → *Make guidance officer*. Removing the role takes the menu
item away. The role is stored in `staff_roles/{teacherId}__guidance-officer`,
with its history (same as admissions officers).

## Sponsors

The school keeps **one sponsor list**: KGS, CAMFED, CDF, AP and WISE to
start with (`system/sponsors`). A learner is sponsored only by a sponsor on
the list; **anyone else is Self-sponsored** — a parent's or guardian's name,
`Self`, `N/A`, blank…

- Matching ignores case, spaces and punctuation: `Camfed`, `CAMFED.` and
  `C.D.F` count as CAMFED and CDF.
- Only active learners are counted. Every listed sponsor is shown, even with
  no learners.

**Sponsor list** tab (guidance officer or admin):

- **Add sponsor** when a real one is missing (e.g. Plan International);
  remove one (its learners become self-sponsored).
- **Other names typed as sponsor** lists what was typed but is not on the
  list, with how many learners — counted as self-sponsored. For each: **Add
  as sponsor**, or **Same as…** a listed sponsor (that spelling then counts
  as it, e.g. "Campaign for Female Education" → CAMFED).
- **Tidy learner records** writes the result into the learners' Sponsor
  field: a listed sponsor's spelling becomes its name, everything else
  becomes `Self-sponsored`. Shown first, with counts; asks before changing;
  past learners are not changed. Add any real sponsor first — the old text is
  replaced.

On the learner forms (add learner, edit learner, admissions) the Sponsor is
a list: Self-sponsored or a listed sponsor. CSV imports are matched the same
way (anything not on the list is imported as Self-sponsored).

Choose a sponsor to see its learners under Form/Grade headings. **Show
results** adds each learner's average, grade, position and pass/fail for the
chosen term. **Download all (PDF)** gives one PDF (see below).

## Sponsor codes

1. The officer chooses the sponsor and the term/year, then **Generate sponsor
   code**. If the same organisation was typed in different ways, the officer
   ticks the other names so those learners are included too.
2. The code looks like `SP-7KQ3-M9XP` (no 0/O or 1/I/L, so it can be read out
   over the phone). The officer copies it, copies a ready message, or sends it
   on WhatsApp. The message links straight to the Sponsor side of the Parent
   Portal.
3. The sponsor opens the Parent Portal, chooses **Sponsor**, types the code
   and presses **Get Report Cards**. One PDF downloads.
4. The code is then **used** and can never work again. For the next download
   (e.g. next term), the officer generates a new code.

What a code fixes when it is made: the sponsor name, the **list of learners**
and the **term/year**. A learner given this sponsor later needs a new code.

An unused code also stops working after the number of days the officer chose
(7, 14, 30 or 90; 30 by default), and the officer can cancel it. **Sponsor
codes** lists every code with its status: active, used (with the date),
expired or cancelled.

### A code is never wasted

The Parent Portal:

1. checks the code (exists, not used, not cancelled, not expired) — nothing
   is spent;
2. collects every learner's report card and builds the PDF;
3. only then spends the code, in a transaction. If someone else used it in
   the meantime, nothing is given;
4. downloads the PDF. The sponsor can **Save the PDF again** until they leave
   the page.

If none of the learners has results for that term yet, the code is **not**
used and the sponsor is told to try again later.

## The PDF

- **Cover page(s):** school, sponsor, term/year, and every learner in order
  of form/grade with student ID, class, average, grade and position;
  provisional cards are marked `*`; learners with no results that term are
  listed separately.
- **Report cards:** the same card the admin and parents download (built by
  the shared results grid), one per learner, in the same order: Form 1
  first, then by class, then by name.

## Data

| Collection | Content |
|---|---|
| `staff_roles/{teacherId}__guidance-officer` | `role: 'guidance-officer'`, `status`, `history` |
| `system/sponsors` | `names` (the sponsor list), `aliases` (other spelling → name), `updatedBy`, `updatedByName`, `updatedAt` |
| `sponsor_codes/{code}` | `sponsorName`, `sponsorKeys`, `learnerIds`, `learnerCount`, `term`, `year`, `status` (`active` / `used` / `revoked`), `createdBy`, `createdByName`, `createdAt`, `expiresAt`, `usedAt`, `revokedAt`, `revokedByName` |

## Security rules (`firestore.rules`)

- Anyone may **read one code they already know**; listing codes is only for
  guidance officers and the admin. Codes are random (31⁸ possibilities), so
  they cannot be guessed.
- Anyone may **spend** an active, unexpired code once: only `status` → `used`
  and `usedAt` = server time may change.
- Officers and the admin create codes (as themselves, `active`, with at least
  one learner and a future expiry) and may cancel an active code.
- Only the admin may delete a code.
- `system/sponsors`: every signed-in user reads it (learner forms); the
  admin or a guidance officer saves it (only its fields, in their own name).

After changing the rules, deploy them (`deploy-firestore-rules.bat`).

## Code

| File | What |
|---|---|
| `client/services/guidancePlan.ts` | The sponsor list and matching, form order, code format and checks (tested in `guidancePlan.spec.ts`) |
| `client/services/sponsorListService.ts`, `client/hooks/useSponsorList.ts` | Loading/saving the sponsor list; tidying learner records |
| `client/components/guidance/SponsorListTab.tsx`, `SponsorSelect.tsx` | The Sponsor list tab; the Sponsor field on learner forms |
| `client/services/guidanceService.ts` | Role, codes (create, list, cancel, check, spend), building the report cards |
| `client/services/pdf/sponsorReportsPDF.ts` | Cover page + report cards in one PDF |
| `client/components/guidance/GuidanceWorkspace.tsx` | The officer/admin page |
| `client/components/guidance/SponsorPortalPanel.tsx` | The Sponsor side of the Parent Portal (tested in `SponsorPortalPanel.spec.tsx`) |
| `client/components/admissions/TeacherRolesSection.tsx` | School Roles on the teacher's page |
