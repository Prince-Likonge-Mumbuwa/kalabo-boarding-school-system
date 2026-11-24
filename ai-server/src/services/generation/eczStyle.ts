/**
 * How ECZ (Examinations Council of Zambia) sets and marks questions, written
 * as instructions for the assessment generator.
 *
 * Drawn from Computer Studies Paper 1 of 2017, 2020 (specimen) and 2024.
 * Across 2017 and 2024 (126 question parts):
 *   - "Give" / "State" / "Name" / "Mention" / "Identify" = most of the paper,
 *     almost always 1 mark per point asked for;
 *   - "Explain" / "Describe" = 2 marks (a point and its reason or effect);
 *   - "Write" / "Rewrite" / "Convert" (binary, algorithms, flowcharts, HTML) = 2 to 6 marks;
 *   - nearly every question opens with a short scenario set in Zambia (a
 *     school library, an enterprise automating its office, a hospital), and
 *     its parts (a), (b), (c) are all about that scenario;
 *   - Section A: about twelve short structured questions; Section B: one
 *     compulsory longer question on a case study, then a choice between two.
 *
 * To refine it, edit the wording below and restart the server. Past papers
 * uploaded with the type "Past paper" are also given to the model as live
 * examples (RetrievalService, `styleExamples`).
 */
export const ECZ_STYLE = `Set the questions the way the Examinations Council of Zambia (ECZ) does:
- Open each structured question with a short, realistic scenario set in Zambia (a school, shop, clinic, farm, company or government office, with a local name), then ask parts (a), (b), (c) about that scenario. Parts go from recall, to understanding, to applying the idea to the scenario.
- Use ECZ command words with ECZ mark values:
  - Give / State / Name / Mention / Identify / List: 1 mark per point; say how many points are wanted ("Give two advantages ... [2]").
  - What is meant by / Define: 1 mark, or 2 when a precise definition needs a detail or an example.
  - Explain / Describe: 2 marks per point (the point, then its reason or effect).
  - Differentiate / Distinguish between: 2 marks (one feature of each).
  - Calculate / Convert / Work out: marks for the method and for the answer; ask learners to show their working.
  - Write / Draw / Rewrite / Complete (a formula, algorithm, flowchart, table, code): 2 to 6 marks, one per correct element.
- Put the marks for each part in square brackets at the end of the line, and "[Total: n marks]" after each question.
- Use plain, exact wording a Form learner reads once and understands. One idea per part. No trick questions, no negatives like "Which is NOT ..." unless essential.
- Marking key in ECZ style: list every acceptable answer; write "any two of:" where a choice of points is allowed; give alternatives with "/" or "accept ..."; note common wrong answers with "do not accept ..."; award 1 mark per correct point and say where marks are split (e.g. "1 mark for the formula, 1 mark for the answer").`;

/** Rules every subject shares: marks in brackets, plain wording, an ECZ-style key. */
const COMMON = `- Put the marks for each part in square brackets at the end of its line, and "[Total: n marks]" after each question.
- Use plain, exact wording a Form learner reads once and understands. One idea per part. No trick questions, no negatives like "Which is NOT ..." unless essential.`;

/**
 * Biology (5090) and Agricultural Science, from nine ECZ Biology papers and
 * their marking schemes (2022–2026): figure-led structured questions, essays
 * without figures, a genetics question every year.
 */
const BIOLOGY = `Set the questions the way the Examinations Council of Zambia (ECZ) sets Biology (5090):
- Do NOT open questions with a business or office scenario. A structured question opens with its figure ("Figure 3 shows a section through the human heart.") or a short experiment ("A learner set up the apparatus shown in Figure 2 to investigate transpiration. The bubble moved 30 mm in 10 minutes."). Use Zambian examples where an example is needed (maize, beans, cassava, kapenta, cattle, goats; malaria, cholera, bilharzia, TB, HIV and AIDS).
- Command words and marks:
  - Identify / Name the parts labelled P, Q, R: [1] each, one word or short phrase.
  - State: 1 mark per point; say how many are wanted ("State two functions of …").
  - Explain / Suggest a reason: [2] (the point and why), or [1] for a short reason.
  - Describe (a process, an experiment, a change): 1 mark per correct step or observation.
  - Calculate (magnification = image size ÷ actual size, percentage change, rate): [2]–[3], with the formula, working and units.
  - Use a genetic diagram to show …: [4]–[6] (parents' phenotypes and genotypes, gametes, offspring genotypes, phenotypes, ratio).
  - Essay parts (Section B): "Describe …", "Explain …", "Compare and contrast …", "With named examples, …"; 12 marks per essay split as e.g. (a) [6] (b) [4] (c) [2]; tell candidates how many essays to answer.
- Each structured question moves from identifying parts, to a function, to explaining a process, to applying it (a control, a disorder, an adaptation, an observation at the end of the experiment).
${COMMON}
- Marking key in ECZ Biology style: for each lettered part the one correct name (accept common alternatives, e.g. "bicuspid / mitral valve"); "any two of:" lists for functions and adaptations; for experiments the observation AND its explanation; for calculations the formula, the substituted values and the answer with units; for genetics the full genetic diagram; for essays numbered marking points ("1 mark each, max 6") covering more points than the marks so any correct ones score. Write "Do not accept …" for common confusions (e.g. "do not accept 'vein' for 'artery'").`;

/** Mathematics (Paper 1 short answers, Paper 2 longer structured questions). */
const MATHS = `Set the questions the way the Examinations Council of Zambia (ECZ) sets Mathematics:
- Pure questions are stated directly ("Solve the equation $3x^2 - 11x - 1 = 0$, giving your answers correct to 2 decimal places."). Use a real-life setting only where ECZ does: money and percentages, rates, mensuration, travel graphs, linear programming, probability, statistics. No business scenarios elsewhere.
- Paper 1 style questions are short, [1]–[5] marks per part; Paper 2 style questions have parts (a), (b), (c) worth [2]–[12] in total, building up to a final answer.
- Say exactly what is wanted: the accuracy ("correct to 3 significant figures", "in its simplest form", "in standard form"), the value of π to use, the units, and "Show your working" where method marks are given.
- Constructions: "Using a ruler and a pair of compasses only, construct …" then loci ("Within triangle PQR, construct the locus of points which are (i) 6 cm from Q, (ii) equidistant from PR and PQ") and a region to shade; the construction figure goes in the MARKING KEY only.
${COMMON}
- MARKING KEY FOR MATHEMATICS: a full worked solution for every part, set out as in "HOW TO SET OUT A WORKED MARKING KEY": one equation per line with its M1/A1/B1 mark, a geometry reason in brackets where a step needs one, and "**Answer:**" at the end of each part. Never explain a method in a paragraph. Graphs, regions, transformations, Venn diagrams and constructions the learner draws are answered with a complete figure of the correct answer.`;

/** Physics (5054): calculations from a formula, graphs from experiments, ray and circuit diagrams. */
const PHYSICS = `Set the questions the way the Examinations Council of Zambia (ECZ) sets Physics:
- Open structured questions with an experiment, a set of readings, a figure or a real Zambian context (Kariba and Kafue Gorge hydro-electric power, solar water heaters, a minibus accelerating on the Great East Road, a copper smelter). No business scenarios.
- Command words: State / Name [1 per point]; Define [1]–[2]; Explain [2]; Describe an experiment [3]–[5] (apparatus, readings, how the result is found); Calculate [2]–[4] (formula, substitution, answer with units); Draw / Complete a ray diagram, circuit diagram or graph [2]–[4]; Plot a graph from a table of readings, then use it [4]–[6].
- Give every quantity a value and a unit; state g = 10 N/kg (or m/s²) and other constants where needed; keep numbers that work out to sensible answers.
${COMMON}
- MARKING KEY FOR PHYSICS: a worked solution for every calculation, set out as in "HOW TO SET OUT A WORKED MARKING KEY": the equation in symbols, the substitution, each step and the answer with its unit, one per line with its M1/A1/B1 mark; "**Answer:**" at the end. Definitions and explanations as marking points ("1 mark each, any two of"). A graph the learner plots is answered by the complete graph as a figure (axes with labels and units, the plotted points, the best-fit line or curve) with the values read from it; a ray or circuit diagram by a complete labelled figure where one can be drawn, otherwise by its marking points.`;

/** Chemistry and Integrated Science. */
const SCIENCE = `Set the questions the way the Examinations Council of Zambia (ECZ) sets the sciences:
- Open structured questions with an experiment, a set of results, a figure or a real Zambian context where it fits (copper mining on the Copperbelt, water treatment, fertilisers, solar power). No business scenarios.
- Command words: State / Name [1 per point]; Explain [2]; Describe [1 per step]; Calculate (show the formula, substitution and answer with units) [2]–[4]; Write a balanced equation (with state symbols where asked) [2]; Draw / Complete a diagram or table [2]–[3].
${COMMON}
- Marking key: every acceptable answer, "any two of:" lists, balanced equations in \\ce, calculations line by line (formula, substitution, answer with units) with M1/A1 marks, observations with their explanations.`;

/** Geography, History, Civic Education, Religious Education. */
const HUMANITIES = `Set the questions the way the Examinations Council of Zambia (ECZ) sets the humanities:
- Structured questions open with a stimulus where it fits ("Study Figure 2 which shows …", a map, a photograph description, a table of data, a short source); otherwise ask directly. Use real Zambian places, people and events.
- Command words: Name / State / Identify / Give [1 per point]; Describe [1–2 per point]; Explain / Account for [2 per point: the point and its development]; Discuss / Assess [2 per point, both sides]; Calculate from data (show working) [2]; essays [10]–[15] marked by points.
${COMMON}
- Marking key: numbered marking points ("any four of: …, 2 marks each: 1 for the point, 1 for the explanation"), more points than the marks so any correct ones score; figures read from data worked out with the values.`;

type StyleFamily = "biology" | "maths" | "physics" | "science" | "humanities" | "cs";
const familyFor = (subject: string): StyleFamily => {
  const s = subject.toLowerCase();
  if (/biolog|agric|life science/.test(s)) return "biology";
  if (/math/.test(s)) return "maths";
  if (/physic/.test(s)) return "physics";
  if (/chem|science/.test(s)) return "science";
  if (/geograph|history|civic|social studies|religious/.test(s)) return "humanities";
  return "cs";
};

/** The ECZ question and marking style for a subject (Computer Studies' style for the rest). */
export function eczStyleFor(subject: string): string {
  switch (familyFor(subject)) {
    case "biology": return BIOLOGY;
    case "maths": return MATHS;
    case "physics": return PHYSICS;
    case "science": return SCIENCE;
    case "humanities": return HUMANITIES;
    default: return ECZ_STYLE;
  }
}

/** Subjects whose marking keys are worked solutions. */
export const isWorkedSubject = (subject: string) => /math|physic/i.test(subject);

/** How a worked marking key is laid out (used when the paper is written, prompts.ts, and by the key check, keyCheck.ts). */
export const WORKED_KEY_FORMAT = `HOW TO SET OUT A WORKED MARKING KEY (Mathematics and Physics):
- One "### Question n" heading per question, then each part on its own line in bold: **(a)**, **(b)**, **(i)**.
- Under each part, the solution as a column of steps, ONE step per line, each line one TeX expression between single dollar signs, then its marks: M1 (method), A1 (accurate value that follows), B1 (independent mark). Nothing else on the line except, where a geometry step needs it, a short reason in brackets after the maths: "(angles in the same segment)".
- Start from the formula or the rule, then the substitution, then each simplification, then the value: never skip from the question to the answer.
- Keep the units inside the maths: $v = 12\\ \\text{m s}^{-1}$, $A = 41.4\\ \\text{cm}^2$.
- End each part with a line "**Answer:** $…$ " and its total marks in brackets, e.g. **Answer:** $x = 3.76$ or $x = -0.09$ [3]
- No sentences that explain the method: show the method as maths. Words only for a geometry reason, an "accept …" alternative (at the end, in italics: *accept 9.3*), or "ft" (follow through).
- Physics: write the equation in symbols first ($P = \\dfrac{W}{t}$), then the numbers ($P = \\dfrac{1800}{60}$), then the answer with units ($P = 30\\ \\text{W}$). State the quantity being found.
- A construction, locus, graph, region (inequalities, linear programming), transformation or Venn diagram that the learner must draw is answered by a FIGURE of the complete, correct answer (a \`\`\`figure block), with every construction arc, every locus labelled, the required region hatched and labelled, the plotted curve and the values read from it. Under the figure, the marks as short lines: "B1 base $PQ = 10\\ \\text{cm}$", "B1 locus (i): arc centre $Q$, radius $6\\ \\text{cm}$", "B1 region $T$ shaded"; and any measured value as maths with its tolerance: $PR = 8.9\\ \\text{cm} \\pm 0.2$ B1.
- Example:
### Question 3
**(a)**
$PR^2 = PQ^2 + QR^2 - 2(PQ)(QR)\\cos Q$ M1
$PR^2 = 12^2 + 9^2 - 2(12)(9)\\cos 50^\\circ$ M1
$PR^2 = 225 - 138.84 = 86.16$
$PR = \\sqrt{86.16} = 9.28\\ \\text{cm}$ A1
**Answer:** $PR = 9.28\\ \\text{cm}$ [3]`;

