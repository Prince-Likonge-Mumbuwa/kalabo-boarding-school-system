# eFile, Biology and Mathematics assessments (18 November 2026)

## Assessments
- **ECZ style per subject** (`ai-server/src/services/generation/eczStyle.ts`):
  Biology, Mathematics, the sciences and the humanities each get their own
  question and marking style. Computer Studies keeps the original style.
  - **Biology:** questions open with the figure or the experiment, not a
    business scenario.
  - **Mathematics:** marking keys are worked mathematics. Each step is an
    equation in TeX ending with M1, A1 or B1, and each part ends with
    "Answer: …".
- **Marking keys agree with the diagrams** (`figures/process.ts`,
  `alignKeyWithFigures`). Where a key names a lettered part differently from
  the drawing, the server corrects the key and tells the teacher.
- **Constructions and loci** (new figure type `construction`):
  - It builds the triangle from SSS, SAS, SSA or ASA.
  - It draws five kinds of locus: circle, parallel line, angle bisector,
    perpendicular bisector and perpendicular.
  - The required region is hatched, and all the compass arcs are drawn.
  - The geometry is in `figureMath.ts` (both copies identical). The drawing is
    `client/.../render/construction.ts`. The checker (`checkConstruction`)
    gives the marking key the measured lengths and angles with their
    tolerances and describes the region.
- **Line breaks.** Sub-parts "(a)" and "(ii)", "Answer:" lines and lines after
  marks or M1/A1 stay on their own lines, on screen and in the PDF.

## eFile (the Teacher's File)
- **Layout:** the Ministry of Education Teacher's File as Kalabo Boarding keeps
  it (`EFILE_SECTIONS` in `client/types/ai.ts`; the ids are also in
  `ai-server/src/types.ts`).
  - A cover, then **Teacher's Details** (name, TS number, TCZ number,
    department, phone, term, year), then the contents.
  - Sections 1–6: Vision, Mission Statement, Individual Work Plan, Time Table,
    Class List / Register, Syllabus. These are the teacher's own entries, each
    starting from a ready page.
  - Sections 7–9: Schemes of Work, Lesson Plan, Records of Work. These are
    filled by the AI documents.
  - Section 10, Assessment Records, has eight parts:
    - i. Homework
    - ii. Progress Chart
    - iii. Question Samples: the AI tests, questions only
    - iv. Marking Keys: the same tests' marking key, rubric and specification
      grid
    - v. Scripts Samples
    - vi. Analysis Sheet
    - vii. Remedial Work Plan
    - viii. Miscellaneous (circulars, CPD, observation reports)
  - Stored in `storage/efile/<uid>.meta.json` beside the documents. Entries
    filed under section names from before this layout are moved to the
    matching new section when read.
- **PDF with pdf-lib** (`client/services/pdf/efilePDF.ts`, glue in
  `efileExport.ts`):
  - You can download the whole Teacher's File (cover, contents with page
    numbers, a divider per section), one section, one document or one entry.
  - Each document has the letterhead and details strip, real text, tables
    that continue across pages with their header repeated, figures and maths
    as on screen, and page numbers.
  - Schemes of work print landscape.
  - Fonts: DejaVu Serif in `client/assets/fonts`.
- **API:**
  - `GET /api/teacher/efile-file`
  - `PUT /efile-file/profile`
  - `POST /efile-file/entries`
  - `PUT` and `DELETE /efile-file/entries/:id`

To change the sections, edit `EFILE_SECTIONS` and `EFILE_SECTION_IDS`
together.

## From the school system, remedial work and scanned scripts (19 November 2026)
- **Imported live from the school system** (`client/services/efileSystem.ts`
  fetches; `efileSystemTables.ts` makes the tables). Nothing is copied to the
  AI server, so it is always current and works when the AI server is off:
  - Teacher's Details: name, TS number and the current term fill empty boxes.
  - 4 Time Table: the teacher's timetable this term.
  - 5 Class List / Register: a list per class taught, and a subject register
    built from the attendance taken in that subject's lessons (it grows as
    soon as attendance is taken).
  - 10 (ii) Progress Chart: Week 4, Week 8 and End of Term marks with trend.
  - 10 (vi) Analysis Sheet: grades 1–9 by sex, pass rate (grade 9 the only
    fail), mean, highest, lowest, quality (grades 1–4).
  - 10 (vii) Remedial Work Plan: learners who failed, and lessons whose
    evaluation called for follow-up.
- **Remedial and continuation lessons** (`ai-server/.../generation/followUp.ts`,
  `client/components/ai/FollowUpPanel.tsx`). After a lesson is evaluated:
  - remedial when the goal was partly or not achieved, or only half or few
    learners met the standard;
  - continuation when part of the plan was not covered;
  - revision (a recap, no plan) when it was mostly achieved.
  The teacher picks the date (the class's next lesson on the timetable is
  offered) and the AI writes the plan from the original plan and its
  evaluation. `POST /generate` with `followUpOf` and `followUpKind`; the
  original is linked (`followUp`) and both appear in 10 (vii).
- **Scanned papers** (`client/components/ai/ScanCapture.tsx`):
  - 10 (v) Scripts Samples: the highest, average and lowest marked script of
    each assessment (AI tests or the teacher's own papers). Learners are
    suggested from Results.
  - 10 (iii) Question Samples also take the teacher's own papers, scanned or
    typed.
  - Pages are cleaned in the browser (whitened, at most 1600 px, JPEG) and
    stored on the AI server in `storage/efile/scans/<uid>/`, ready to move to
    Firebase Storage later. API: `POST /efile-file/scans`,
    `GET /efile-file/scans/:id/pages/:n`, `DELETE /efile-file/scans/:id`.
  - In the PDF each scanned page prints on its own page after its record.
