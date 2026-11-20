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
- MARKING KEY FOR MATHEMATICS: write the full worked solution in MATHEMATICS, not sentences. One step per line, each step an equation, substitution or expression in TeX, with the mark at the end of the line: M1 for a correct method, A1 for the correct answer that follows it, B1 for an independent correct value. End each part with "Answer: …". Words only where a step needs a reason (a geometry reason such as "(angle at centre = 2 × angle at circumference)", "(alternate segment theorem)") or for a construction ("see Figure n"). Never explain a method in a paragraph. Example:
  (a) $x = \\dfrac{11 \\pm \\sqrt{(-11)^2 - 4(3)(-1)}}{2(3)}$ M1
  $x = \\dfrac{11 \\pm \\sqrt{133}}{6}$ M1
  Answer: $x = 3.76$ or $x = -0.09$ A1 A1
  Graphs, regions, transformations, Venn diagrams and constructions the learner draws go in the key as complete figures.`;

/** Chemistry, Physics and Integrated Science. */
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

type StyleFamily = "biology" | "maths" | "science" | "humanities" | "cs";
const familyFor = (subject: string): StyleFamily => {
  const s = subject.toLowerCase();
  if (/biolog|agric|life science/.test(s)) return "biology";
  if (/math/.test(s)) return "maths";
  if (/chem|physic|science/.test(s)) return "science";
  if (/geograph|history|civic|social studies|religious/.test(s)) return "humanities";
  return "cs";
};

/** The ECZ question and marking style for a subject (Computer Studies' style for the rest). */
export function eczStyleFor(subject: string): string {
  switch (familyFor(subject)) {
    case "biology": return BIOLOGY;
    case "maths": return MATHS;
    case "science": return SCIENCE;
    case "humanities": return HUMANITIES;
    default: return ECZ_STYLE;
  }
}
