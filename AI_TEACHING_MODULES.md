# AI tools: CDC teaching modules and lesson evaluation

This explains how the AI tools use the Ministry's **Computer Science Teaching
Module – Form 2** (Terms 1–2 and Term 3, CDC 2026), and any other CDC teaching
module you upload, to write lesson plans, schemes of work and assessments in
the national format. It also explains the new **Lesson Evaluation** step.

## 1. What a teaching module adds

A syllabus says **what** to teach: topic, sub-topic, specific competence and
expected standard. A teaching module says **how**. For every sub-topic it gives:

| From the module | Used for |
|---|---|
| Overview, general competences, hook, key terms (per topic) | Lesson plan: General Competences, Introduction stage, key terms on the board |
| Numbered learning activities (60 in Form 2) | Lesson plan activities, scheme of work weeks, assessment objectives |
| Learning environment (natural / artificial / technological) | Lesson plan: Learning Environment |
| Teaching and learning materials, suggested teaching methods | Lesson plan and scheme of work |
| "How to Conduct" steps and the content tip | Lesson Progression table (teacher's and learners' roles) |
| Expected standard | Lesson plan, scheme, assessments |
| Formative and summative CBC assessment examples with 4-level rubrics | Style and level guide for the new CBC assessment types |
| "TERM ONE / TERM TWO / Term 3" separators | Scheme of work picks the term's topics automatically |
| The appendix lesson plan (2.4 Networking) | The layout of the lesson plan prompt |

## 2. Where the code is

```
ai-server/src/services/
  rag/textRepair.ts, rag/PDFProcessor.ts
      Fixed: Word-made PDFs (the modules) were being "un-scrambled" as if they
      were CorelDRAW syllabi, so "real-life" became "realJlife" and "How"
      became "eow". Now only documents that really are scrambled are repaired.
  curriculum/ModuleParser.ts          reads a module PDF into topics → sub-topics → activities,
                                      using text positions (rubrics are tables)
  curriculum/TeachingModuleService.ts stores modules (storage/teaching-modules.json),
                                      matches a class's sub-topic to the module's pages,
                                      and lets a module stand in for a syllabus map
  generation/moduleContext.ts         turns a module guide into the "TEACHING MODULE"
                                      block of a prompt
  generation/prompts.ts               the layouts: Ministry CBC lesson plan, CBC scheme of work,
                                      test paper + specification grid, CBC scenario + rubric,
                                      and the lesson evaluation writer
  generation/GenerationService.ts     puts it together
  routes/teacher.ts                   /curriculum-map (now with module activities),
                                      /efile/:id/evaluation/draft and /efile/:id/evaluation
  routes/superadmin.ts                /curriculum/:id/module, /modules/:id/active
ai-server/scripts/read-module.ts      npm run read-module -- "path\to\module.pdf"

client/components/ai/CurriculumFields.tsx      activity checklist, "Lesson n of N", rubric size
client/components/ai/LessonEvaluationDialog.tsx the after-lesson questions and statement
client/pages/teacher/ai/EFileDocument.tsx      "Evaluate lesson" on a saved lesson plan
client/components/superadmin/SyllabusTab.tsx   "Teaching modules" list (switch off, read again)
```

## 3. How a class gets its topics

`resolveCurriculum` (TeachingModuleService.ts) picks, in this order:

1. an approved syllabus map of the class's own subject;
2. a teaching module of the class's own subject;
3. an approved map of a subject that shares material (ICT / Computer Studies / Computer Science);
4. a module of such a subject.

So a **Computer Science** Form 2 class gets the module's topics 2.1–2.11 in its
dropdowns even without a Computer Science syllabus map. An **ICT** class keeps
the ICT syllabus numbering, and the module is still used where a sub-topic has
the same name (ICT 2.2.2 Spreadsheets ↔ module 2.1.1 Spreadsheets).

Topic numbers are never mixed between subjects. This also fixes a bug: the
search used to put any document's "2.2" first, so an ICT Form 2 lesson on
Productivity Tools (ICT 2.2) could be fed the module's 2.2 Data Representation pages.

## 4. Lesson plans

The plan now follows the module's appendix: Lesson Details, General
Competences, Specific Competence, Lesson Goal, Rationale ("This is Lesson 1 of 5
under sub-topic 2.4.1"), Prior Knowledge, References (module, CDC, MoE, year,
pages), Learning Environment, Teaching and Learning Materials, Expected
Standard, Lesson Progression (Stage | Teacher's Role | Learners' Role |
Assessment Criteria: Introduction, Lesson Development, Activity rows, Exercise,
Conclusion), Homework and Lesson Evaluation.

On the form the teacher ticks the module activities for the lesson (one or two
fit a double period), and can give Lesson n of N, the date and the time.

## 5. Lesson evaluation

After teaching, open the plan in the eFile and press **Evaluate lesson**. The
questions follow the module's four evaluation criteria: were the competences
achieved (with evidence), which activities engaged learners, which learners
need support and in what, and what changes next lesson, plus coverage and
challenges. The AI writes the evaluation **only** from the answers. The teacher
edits it and saves it, and it replaces the questions under "Lesson Evaluation"
in the plan, so it prints and downloads with it. The eFile shows
"To evaluate after teaching" or "Evaluated" on every lesson plan.

## 6. Assessments

- **Test papers** (Week 4, Week 8, End of Term …): every question must test one
  of the learning objectives of the chosen topics (the syllabus learning
  activities and the module activities). The paper ends with a **Specification
  Grid** (question, marks, competence code, objective tested, level).
- **CBC tasks**: two new types, *Formative task (CBC scenario + rubric)* and
  *Summative project (CBC + rubric)*, laid out like the module's examples: a
  Zambian scenario, tasks, a rubric (Exceeding 4, Meeting 3, Approaching 2,
  Beginning 1), scoring and feedback, and competence coverage. The module's own
  scenarios are given as examples of style only and are never copied.

## 7. Schemes of work

Columns: Week | Topic / Sub-topic | Specific Competence | Learning Activities |
Expected Standard | Teaching Methods | Teaching and Learning Materials |
References | Remarks, and nothing else. It prints and downloads for Word in
landscape (A4 across). If no topics are ticked, the
term's topics come from the module (Term 1: 2.1–2.4, Term 2: 2.5–2.8,
Term 3: 2.9–2.11), and the module's activities are spread over the weeks.

## 8. Records of work

A record of work lists what was taught, and every lesson taught has a lesson
plan in the eFile. So when the teacher picks the class, subject and week
ending, the form lists that class's lesson plans and ticks the ones dated in
that week (Monday to the week-ending day). The "What you taught this week" box
is filled from them by itself: one line per lesson with the date, topic and
sub-topic, Lesson n of N, the activities, the homework and the evaluation.
The teacher can untick or add plans, edit the box, then clicks Generate. The
evaluation becomes the Remarks column ("________" if not yet evaluated).
Lesson plans need a date for this: give one on the lesson plan form.

Code: `client/components/ai/LessonImport.tsx` (reads the eFile only; no AI),
and the record-of-work layout in `ai-server/src/services/generation/prompts.ts`.

## 9. Curriculum sources

The documents themselves never show which curriculum passages the AI used:
no "[2]" numbers in the text and no source list at the bottom, on screen, in
print or in Word (`client/components/ai/DocumentPaper.tsx`). The sources are
still saved with each document and are listed under the sheet on screen, in
a closed "Curriculum sources used" panel, for the teacher to check. Older
documents that still have "[2]" numbers in their text have them hidden when
shown (assessments are left alone, because there "[2]" means 2 marks).

## 10. Setting it up

1. Push the code and restart the AI server (`npm run dev` in `ai-server`).
2. In the superAdmin console → Curriculum, upload both module PDFs with
   subject **Computer Science** (the subject name your Form 2 classes use),
   level **Form 2**, type **Teacher's guide / teaching module**.
3. After indexing, check **Syllabus & modules → Teaching modules**: you should
   see 8 topics / 47 activities (Terms 1–2) and 3 topics / 13 activities (Term 3).
4. Re-index the ICT syllabus too (Curriculum → Re-index all), because the
   embedding model changed today.

To check a module without uploading it: `npm run read-module -- "C:\path\module.pdf"`.

## 11. Two things noticed in the module itself

- Term 3, Activity 2.9.1/1 (AI models) opens with a paragraph about "creating an
  IoT system": the CDC copied it from the IoT topic by mistake. The AI is told to
  follow the activity's own steps, but you may want to tell the CDC.
- The appendix lesson plan cites "pp. 27–31" for Topic 2.4 Networking, but in
  the module Networking is on pp. 42–51. The generator prints the real pages.
