# Admin dashboard — the nerve centre

`/dashboard/admin`. What needs the admin now, then how today, the term and the
school are doing. Every number opens the page behind it.

## Layout

1. **Command band** (dark): school, greeting, term and week, days to the end
   of term, a live clock, and five vital signs:
   - **Present today** (% in school, ▲▼ vs the same day last week)
   - **Daily registers** taken / classes
   - **Lessons**: registers taken / lessons started; lessons with no teacher
   - **Results** of the test with the nearest open deadline: % entered and a
     live countdown
   - **Pass rate** of the latest test, vs the same test last term

   Buttons: new class, announce, **copy the daily brief** or **send it on
   WhatsApp**, the **Head teacher / Operations** focus (which column comes
   first; remembered in the browser), when the data was updated, Refresh.
2. **Needs attention** — only what is wrong, worst first (Urgent / Soon /
   Note, each with an icon and words), each linking to where it is fixed.
   "All clear" when nothing is wrong. The first 8 show; *Show all* for more.
3. **Today** — attendance (%, trend over the last 10 school days, by form,
   lowest class, registers not taken), lessons by period (taken / missed / no
   teacher, the period running now), staff (on leave, covers, subjects with
   no teacher).
4. **This term** — timeline (week N, test dates, results deadlines,
   holidays, today, what's next), results entry per test with the deadline
   countdown and overdue teachers, performance (pass rate test by test this
   term beside last term, quality, average, by form, strongest / weakest
   subjects).
5. **Learners & school** — learners at risk, enrolment by form (boys / girls),
   admitted this term, sponsors, data quality, recent activity (audit trail).

## Needs attention — the rules

| Item | When | Level |
|---|---|---|
| Daily registers not taken | school day, from 08:00 | Soon; Urgent from 10:00 |
| Lesson running now with no teacher | — | Urgent |
| Lesson later today with no teacher; lesson registers missed | — | Soon |
| No published timetable | school day | Soon |
| Results overdue (deadline passed, marks missing) | — | Urgent → Monitor, *Overdue* filter |
| Results due within 3 days, teachers not finished | — | Soon |
| Exam set-up: no configuration / several for the term / a test without a deadline | — | Urgent / Soon |
| Class subjects with no teacher; classes without a form teacher | — | Soon |
| SMS failed in the last 7 days | — | Soon |
| Learners at risk; sponsor names not on the list; sponsor codes expiring in 3 days; learners with no guardian phone | — | Note |

**Learners at risk**: term average below 40% (grade 9) in 3 or more
subjects, or attendance below 80% over at least 5 daily registers (last 60
days of the term). **Pass rate**: marks of 40% and above (grades 1–8);
**quality**: 70% and above.

## Refreshing

Lessons every minute, registers every 2 minutes, results entry every 3
minutes, activity every minute; the rest every 5–10 minutes, or press
Refresh. Each panel loads on its own: one that fails says so; the others
still show.

## Code

| File | What |
|---|---|
| `client/services/nerveCentre.ts` | All calculations (pure; `nerveCentre.spec.ts`) |
| `client/services/nerveCentreLoader.ts` | Firestore reads (classes, learners, daily registers per class, results this / last term, exam configs, teachers, class slots, holidays, failed SMS, audit log, sponsor codes) |
| `client/hooks/useNerveCentre.ts` | One query per panel, refresh intervals |
| `client/components/nerve/NervePanels.tsx` | Panel, vital, attention strip, charts, timeline |
| `client/pages/AdminDashboard.tsx` | The page (`AdminDashboard.spec.tsx`, sample school in `client/test/nerveFixture.ts`) |

Also: the Results Entry Monitor opens pre-filtered from a link
(`/dashboard/admin/results-monitor?status=overdue`).

Not included: the SMS provider's credit balance (not recorded in the app),
and a brief sent automatically each morning (needs a scheduled Cloud
Function; the brief can be copied or sent on WhatsApp from the dashboard).
