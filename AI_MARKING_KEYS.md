# Marking keys and the writing animation (21 November 2026)

## Why JSON appeared in marking keys
Sometimes the large Nemotron model "thought out loud" inside the document. It wrote a first draft, then notes to itself ("Wait: angle ADC = 55° … Let's recalc … We'll change the JSON …"), then the whole paper again. The teacher saw two copies, the notes, and the figure JSON quoted inside them.
- **AI server**: `ai-server/src/services/generation/cleanup.ts` (`cleanDocument`). Before a document is saved, it keeps the last complete copy and drops the lines where the model talks to itself. This runs for every tool, in `routes/teacher.ts`.
- **School app**: `client/components/ai/cleanStream.ts`. This is the same code (keep the two in step). It is used:
  - in the live view while a document arrives, so teachers never see a first draft or notes;
  - when older documents are shown;
  - in the eFile PDF (`services/pdf/efileParts.ts`).
- **Prompt** (`prompts.ts`, rule 12): plan silently and write the document once, with no notes and no second version.

## Worked marking keys (Mathematics, Physics)
- **Layout** (`WORKED_KEY_FORMAT` in `eczStyle.ts`). For each part, **(a)** on its own line, then one equation per line with its mark (M1 / A1 / B1). A short reason in brackets is allowed for geometry steps. Each part ends with **Answer:** and its total marks. No paragraphs of explanation. Physics has its own style (`PHYSICS`): formula in symbols, then substitution, then the answer with units.
- **On screen** (`Markdown.tsx`, `WorkingBlock`):
  - such a paragraph shows as a column of full-size equations;
  - the marks are badges on the right;
  - the answer sits in a green box.
  - It is a table, so Print and Word keep the layout. The styles are `.doc-work*` and `.doc-mark` in `DocumentPaper.tsx`.
- **Chief-examiner check** (`keyCheck.ts`). After a Mathematics or Physics test is written, a second AI call solves every question again from the question paper alone. It corrects wrong answers, writes the key in the layout above, and adds a complete figure to every construction, locus, graph, region, transformation or Venn diagram the learner must draw. The server then draws and measures those figures as before (`figures/process.ts`). If the check fails, the first key is kept.
  - It costs one extra AI call per Mathematics or Physics test. Set `KEY_CHECK=off` in `ai-server/.env` to skip it.
- **Diagrams set to "None"**: Mathematics and Physics questions then have no figures, but the marking key still draws the answers (`figureGuide`, `figures.ts`).

## The writing animation (`client/components/ai/GenerationStage.tsx`)
- **Reading**: pages with a scanning light, and what is being looked up (syllabus, competences, teaching module, ECZ style).
- **Planning**: the document's sections are pencilled in one by one, with what the AI is planning.
- **Writing**:
  - the text flows on at an even pace (`useSmoothText`) and never stops in the middle of a piece of maths;
  - each new paragraph, table or figure fades and rises into place;
  - a glowing pen marks where the writing is;
  - the page follows the writing until the teacher scrolls up.
- **Steps along the top**: Reading → Planning → Writing → Checking → Saved. While writing, they also show the section being written and how far the document has got.
- Movement is turned off for people who ask their device for reduced motion.

## Drawing the answers in the key (`ai-server/src/services/generation/answerFigures.ts`)
The model often forgot to draw the answer, for example a "shade (F ∪ N) ∩ B′" question with no shaded Venn diagram in the key. The server now draws these answers itself, after the chief-examiner check, for every Mathematics or Physics test (`routes/teacher.ts`, inside `/generate`):
- **Venn shading**: the set expression is read from the question (∪, ∩, ′, and the words union, intersection, complement) and the key gets the Venn diagram with that region shaded, placed just under the answer line.
- **Venn surveys** ("30 learners take Maths, 20 take Science…"): the region counts are solved and written into each region of the diagram, with the number outside all sets.
- **Constructions and loci**: the triangle (sides and angles), each locus asked for in (i), (ii)…, and the region to shade ("less than 4 cm from P", "nearer to XY than to YZ"…), at the question's scale.
- **Graphs** ("draw / plot the graph of y = … for −2 ≤ x ≤ 4"): the curve is drawn from the equation with its table points, and any other line asked for "on the same axes" too, so the solutions show where they cross. If the paper gave a graph with the curve or table hidden, the key gets the same graph complete.
- **Sketches** ("sketch y = x³ − 4x", "sketch y = (x − 1)(x + 2)(x − 3)"): with no range given, the curve is drawn around where it crosses the axes and turns, and those points are labelled with their coordinates, as the learner must show them.
- **Inequalities and linear programming**: every boundary line drawn and labelled, the unwanted side shaded (ECZ style), R left clear with its corners lettered. The inequalities come from the question or, for a word problem, from the key's answer to "write down the inequalities". When the question gives a profit or cost ("Maximise P = 3x + 2y", "K40 on a chair…"), the checker writes the value at every corner, the best one, and the best whole-number choice when the best corner is not whole.
- **Anything it cannot read**: one extra AI call draws only those answers (`drawMissingFigures`).
- **Transformations** (`answerReaders.ts`, `transformationFrom`): the shape from its coordinates ("A(1, 1), B(4, 1), C(1, 3)") and every image the question asks for: reflection in a line, rotation (clockwise or anticlockwise, about any centre), enlargement (any centre and scale factor, also negative), translation by a column vector, stretch, shear and matrix transformations. Each image keeps the question's name (A₁B₁C₁…), and the checker writes the image's coordinates in the key. If the question already shows a grid with the images hidden, the key shows the same grid with them drawn.
- **Statistics** (`statsFrom`), from the question's frequency table (read across or down):
  - histogram (equal classes as bars; unequal classes drawn as wide as the class and as tall as the frequency density);
  - bar chart and line graph;
  - frequency polygon at the mid-points;
  - cumulative frequency curve at the upper class boundaries (19.5, 29.5…), with the median and quartiles marked;
  - pie chart with each sector's angle.
- **Probability tree diagrams** (`treeFrom`): a bag of coloured items drawn with or without replacement (two or three draws), or two events with given probabilities ("passes Maths is 0.7 … Science is 0.6"). Every branch has its probability, and every outcome its product.
- **Arrow (mapping) diagrams** (`arrowFrom`): a function on a domain (f: x → 2x + 1, {1, 2, 3, 4}) or a relation between two sets ("is a factor of", "is less than", "is the square of"…).
- **Bearings and scale drawing** (`bearingsFrom`): each leg of the journey with its north line and bearing arc. The checker writes the distance and the bearings between the start and the end.
- **Travel graphs** (`travelFrom`): velocity–time from the story ("accelerates uniformly to 20 m/s in 10 s, … at this speed for 30 s, … to rest in 15 s"), with the distance (the area under the graph) in the title; distance–time from a story ("travels 30 km in 2 hours, rests 30 minutes, returns at 20 km/h") or from a table.
- **Solving graphically** (`linesFrom`): both lines (2x + y = 7, x − y = 2) and where they meet.
- **Trigonometric, exponential and log graphs**: y = 2 sin x for 0° ≤ x ≤ 360° (in degrees), y = 2ˣ, y = log x.
- **Plotting points** (`pointsFrom`): the points on a grid, joined when the question says so.
All of these figures go through the usual checks and drawing (`figures/process.ts`), so they are measured and correct before the teacher sees them. Because they come from the question's own numbers, the AI figure repair never rewrites them (the `keep` list).

## HTML spaces ("&nbsp;") in papers and keys
The AI sometimes laid out sub-parts and conditions with HTML spaces ("&nbsp;&nbsp;&nbsp;&nbsp;(i) …", "&nbsp;• T is at most 6 cm from Y"), which showed as raw text.
- `plainSpacing` in `ai-server/src/services/generation/cleanup.ts` (run before every document is saved) and in `client/components/ai/cleanStream.ts` (for documents already saved, on screen and in the PDF): a run of such spaces in the middle of a line becomes a new line (in a table cell, `<br>`); at the start of a line it is dropped; a single one becomes a plain space.
- `client/components/ai/Markdown.tsx` and `client/services/pdf/efilePDF.ts` (`joinLines`): a "•" condition, and any line after a line break, stay on their own line.
- Prompt rule 13 (`prompts.ts`): no HTML, each part and sub-part on its own line.

## Questions headed "### 16. Constructions and loci"
The AI writes question headings as "### Question 16" or "### 16. Title". The answer figures (`answerFigures.ts`) now read both. One question can also get more than one answer figure, for example a distance–time graph in (a) and a tree diagram in (b), in the order of its parts. The shaded region of a construction reads all the conditions listed before "shade", one per line. The distance–time graph's title gives the average speed.
