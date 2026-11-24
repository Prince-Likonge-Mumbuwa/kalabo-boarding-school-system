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

## Vision and mission, AI work plan, syllabus, records of work, term filter (21 November 2026)
- **1 Vision, 2 Mission Statement** come from the administrator: Settings →
  *Vision & mission (Teacher's File)* (`client/components/efile/SchoolStatementsCard.tsx`).
  - It holds the Ministry's, the school's and (optionally) each department's statements.
  - They are stored in Firestore `system/school_statements` (`client/services/schoolStatementsService.ts`).
    The existing rules already let everyone signed in read `system/*` and only admins write it.
  - Each teacher sees the Ministry, the school and their own departments' statements.
- **3 Individual Work Plan, written by the AI.** In section 3 the teacher ticks the
  term's schemes of work (the newest per class is ticked already) and clicks
  *Write work plan with AI*.
  - The AI server reads those schemes and each class's official curriculum
    (`ai-server/src/services/generation/workPlan.ts`).
  - It writes the plan in the school's columns: key result area, objective, activities,
    time frame, resources, indicator of success and remarks.
  - The plan is saved as an entry the teacher can edit.
  - API: `POST /api/teacher/efile-file/work-plan { schemeIds, term }`. It counts towards the daily limit under the eFile tool.
- **6 Syllabus**: for each subject and class level taught, the superAdmin's curriculum
  (an approved syllabus map or a teaching module, `GET /curriculum-map`).
  - It shows topics, sub-topics, specific competences, learning activities and expected standards.
  - Only the chosen term's topics are shown when the module says which term each topic belongs to.
  - Document names are never printed.
- **Lesson plans now have a "Remedial Work" section** (prompt in `prompts.ts`): who it is
  for, the area of difficulty, a simpler step-by-step activity, when, and a check question.
- The eFile list sends short **extracts** of each lesson plan: goal, homework and remedial work
  (`EFileService.lessonExtracts`). They feed:
  - **9 Records of Work**: one table per class and subject, made of every lesson plan *evaluated*
    after teaching. It shows the date, topic and sub-topic, work covered (from the goal), homework,
    how it went (from the evaluation) and any follow-up. Plans that are not evaluated yet are counted
    and the teacher is reminded to evaluate them. The AI record-of-work documents remain as before.
  - **10 (i) Homework**: the homework of each lesson plan, with columns for date marked and remarks.
  - **10 (vii) Remedial Work Plan**: the planned remedial work, and whether the evaluation showed it
    was needed. This is in addition to the failed learners and the follow-up lessons.
- **Year and term picker** at the top of the eFile, also in the address as `?year=&term=`.
  - Sections 6, 9 and 10 (progress chart, analysis, remedial) show the chosen term, and the PDF uses the same term.
  - The terms listed are those the teacher has real results or documents in.
  - Marks come from the classes taught now plus every result the teacher entered
    (`resultsService.getTeacherResults`, one query on `teacherId`). So earlier years' classes
    appear even after learners were promoted. Learners no longer in those classes are looked up by id
    to get their names and sex.
  - The timetable, class lists and registers are always the current term's.
- **Analysis sheet**: learners whose sex is not recorded have their own row instead of being counted as boys.
- **Search model** changed to `nvidia/nemotron-3-embed-1b` (the 3.5 preview returned 503).
  Set it in `ai-server/.env` and run *Re-index all*.

## Individual Work Plan in the Ministry format, and the Syllabus Analysis Grid (22 November 2026)
Built from the school's own samples: the Kalabo Secondary work plans, a 2026 work plan, and the 2026 Term 1 ICT Form One Syllabus Analysis Grid.
- **3 Individual Work Plan** (`ai-server/src/services/generation/workPlan.ts`). The plan has:
  - the teacher's details (name, TS number, job title, department / section, classes, period, school);
  - the job purpose;
  - the table **Key result area | Principal accountability | Schedule of activities | Target**, with rows for planning, teaching, continuous assessment, class management, co-curricular activities and professional development;
  - the assumptions;
  - signatures for the job holder, the Head of Department and the head teacher.

  It prints landscape. The teacher chooses this term or the whole year.
- **Targets are counted, not guessed.** The classes and lessons a week come from the teacher's timetable (`useTeachingLoad` in `client/services/efileSystem.ts`; consecutive periods count as one lesson, and the teacher can correct the number). The weeks come from the school calendar (`weeksInTerm`). From these the server works out (`workPlanTargets`):
  - schemes of work: one per class per term;
  - lesson plans: one per lesson;
  - records of work: one per week;
  - tests: Week 4, Week 8 and end of term, per class per term;
  - homework: one a week per class.

  The AI must use those numbers. Topics come from the ticked schemes of work or the official curriculum. Co-curricular work is only what the teacher types; it is remembered in the Teacher's Details as `coCurricular`.
- **6 Syllabus Analysis Grid** (`ai-server/src/services/generation/syllabusGrid.ts`): one row per teaching week, in the school's twelve columns: WK, TOPIC, SUB-TOPIC, CURRICULUM PHILOSOPHY AND GOALS, PRESCRIBED COMPETENCE, KEY CONCEPTS AND CONTENT, LEARNING STRATEGIES, ASSESSMENT, LEARNING ENVIRONMENT, MATERIAL DEVELOPMENT, TEACHER STATUS, REFERENCES.
  - It is written from the superAdmin's official curriculum (codes and competences copied exactly; only the term's topics when the module says which).
  - When the teacher has a scheme of work for the same class and term, the grid follows its weeks.
  - Week 4 and Week 8 tests and end-of-term revision are placed.
  - References are generic titles, never document names.
  - API: `POST /api/teacher/efile-file/syllabus-grid { subject, className, level, termLabel, weeks }`, saved as a section 6 entry (job `syllabusGrid`: no thinking, 12 000 tokens).
- **Work plan API**: `POST /api/teacher/efile-file/work-plan { periodLabel, terms, weeksPerTerm, classes[], schemeIds[], coCurricular, department, teacherName, school }` (job `workPlan`, fast model).

## Lesson Grid and remedial work (22 November 2026)
- **Lesson Grid is its own section.** Section 7 holds the Lesson Grid (Syllabus Analysis Grid) the AI writes for each class and term; Section 6 (Syllabus) keeps only the official syllabus. The sections after it move down one: 8 Schemes of Work, 9 Lesson Plan, 10 Records of Work, 11 Assessment Records with its parts 11 (i)–(viii).
  - `client/types/ai.ts` (`EFILE_SECTIONS`) and `ai-server/src/types.ts` (`EFILE_SECTION_IDS`): the new `lessonGrid` section.
  - `ai-server/src/routes/teacher.ts` (`POST /efile-file/syllabus-grid`) files new grids there. Grids written earlier under Syllabus are shown in the Lesson Grid by themselves (`sectionOf` in `services/EFileService.ts`); nothing is rewritten on disk.
  - `client/pages/teacher/ai/EFile.tsx` (`LessonGridWriter`): the "Write the lesson grid" card is in Section 7.
- **Remedial work only after a lesson that did not go well.** Lesson plans no longer have a Remedial Work section (`prompts.ts`). When the teacher saves a lesson's evaluation (`PUT /efile/:id/evaluation`) and it shows the lesson did not go well, the AI writes that lesson's remedial work and files it in 11 (vii) Remedial Work Plan. "Did not go well" is the same rule as the follow-up lesson (`followUpFor` in `followUp.ts`): the competence partly or not achieved, only half or a few learners reaching the standard, or only most or part of the plan covered.
  - `ai-server/src/services/generation/remedialWork.ts` (new): the prompt and the message (the lesson plan plus the teacher's evaluation). The entry has the reason, the learners, the area of difficulty, when, the remedial activities (worked example, guided practice, independent practice), materials, a check, and an Outcome table to fill in.
  - One entry per lesson (`lessonId` on the entry): evaluating again rewrites it, and an evaluation that shows the lesson went well removes it.
  - `client/components/ai/LessonEvaluationDialog.tsx`: tells the teacher the remedial work will be written, shows "Saving and writing the remedial work…", and if the AI fails, says so (the evaluation is still saved; saving again retries).
  - `client/services/efileSystem.ts`: the "Remedial work in lesson plans" table is gone from 11 (vii).
