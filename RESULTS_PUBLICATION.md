# Publishing results to guardians and sponsors

Guardians (Parent Portal) and sponsors (Sponsor side of the Parent Portal)
only see a term's results after the **admin publishes them**. A term can be
published only when **at least 98% of the results the school expects are
entered**.

Before this, any term could be opened as soon as one mark existed, so a
guardian could mistake an unfinished Term 3 report card for Term 2's.

## For the admin

Admin → **Dashboard** → **This term** column → **Publish results**
(under *Results entry*).

1. Choose the **term** (the current term and the five before it).
2. The panel shows whether it is **Published** or **Not published**, and how
   much is entered, e.g. `985 of 1000 · 98.5%`, with a mark at 98%.
3. **Publish results** switches on at 98% or more. It asks you to confirm.
4. **Withdraw results** (on a published term) closes it again. Publish it
   again later when ready.

What counts as "expected": every active learner × every subject of their
class × every test set up for the term (Week 4 / Week 8 / End of Term). A
mark, *absent* and *test not conducted* all count as entered. This is the
same grid as the Results Entry Monitor, so the number matches it; subjects
with no teacher that already have marks count too.

Publishing is refused, with the reason shown, when:

- less than 98% is entered (it says how many more results are needed). The
  check is exact: 97.9% is not 98%;
- a class could not be loaded (the total is then unknown);
- no tests are set up for the term (nothing to publish).

The count is repeated at the moment you press *Yes, publish*, so a screen
left open for a while cannot publish on old numbers.

Every publish and withdrawal is in the **Audit Trail** (who, which term,
when).

## What guardians and sponsors see

- A published term: the report card, as before.
- A term that is not published: *"Term 3 2026 results have not been released
  yet. They will be available here once the school has published them."*
  A sponsor sees this when they type the code, **before the code is used**.

Admins, teachers, form teachers and guidance officers are **not affected**:
they see every term in the app as before (publishing only controls the
signed-out Parent Portal and Sponsor Portal).

## Terms before Term 3 2026

Terms **before Term 3 2026** were already open to guardians when this was
introduced, so they stay open (no one loses Term 1 / Term 2 results). From
**Term 3 2026 onwards** every term starts closed and needs publishing. The
admin can still withdraw or re-publish an older term from the same panel.
The cut-off is `FIRST_PUBLISHED_TERM` in `client/services/resultsPublication.ts`.

## How it works

One document per term: `results_publication/{year}_{Term}` (e.g.
`2026_Term3`):

```
term, year, published,
requiredEntries, doneEntries, completionPercent      (when published)
publishedAt, publishedBy, publishedByName            (when published)
unpublishedAt, unpublishedBy, unpublishedByName      (when withdrawn)
updatedAt, updatedBy
```

- **Rules** (`firestore.rules`, *RESULTS PUBLICATION*): anyone may read (the
  portals are signed out; it holds no learner data); only an **admin** may
  write, in their own name and with the server's time; publishing needs
  `doneEntries ≥ 98%` of `requiredEntries`; records are never deleted.
- **The gate**: `resultsService.generateReportCard(..., { publicView: true })`
  refuses an unpublished term. `portalApi` checks the same thing before
  asking the portal function, when a sponsor code is checked, and on the
  returned sponsor reports. `portalDirect` checks sponsor codes up front.
- **Before the rules are deployed** a signed-out visitor cannot read the
  record; that counts as "no record", so the default above applies (older
  terms open, newer closed) instead of locking everyone out.

## Deploying

1. **Deploy the Firestore rules first**: run `deploy-firestore-rules.bat`.
2. Then publish the app (push to GitHub / Netlify as usual).
3. **Redeploy the `portal` Cloud Function.** Its source is not in this
   repository (`sms-functions/functions/src/portal` is missing). The app now
   refuses an unpublished term before and after calling it, so guardians
   using the website are covered, but the function itself answers anyone who
   calls it directly. To enforce the rule on the server too, add the same
   check to the function: read `results_publication/{year}_{Term}` and, unless
   it is `published: true` (or the term is before Term 3 2026 with no record),
   answer with the "not released" message instead of a report card.

## Files

| File | What |
|---|---|
| `client/services/resultsPublication.ts` | The 98% rule, which terms are open, reading and writing the record (`resultsPublication.spec.ts`) |
| `client/services/resultsMonitor.ts` | `completion`: exact required / entered results for the whole school |
| `client/hooks/useResultsPublication.ts` | The panel's data and publish / withdraw |
| `client/components/results/PublishResultsPanel.tsx` | The dashboard panel (`PublishResultsPanel.spec.tsx`) |
| `client/services/resultsPublicationFlow.spec.ts` | End to end on a sample school |
| `firestore-tests/publication.rules.emulator.ts` | The rules, on the emulator (`pnpm test:rules`) |
