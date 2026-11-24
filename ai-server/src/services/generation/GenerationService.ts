/**
 * The conductor of one generation. For a tool and the teacher's form it:
 *
 *   1. looks up the class's curriculum (an approved syllabus map, or a CDC
 *      teaching module standing in for one: resolveCurriculum) for the exact
 *      topic, competences and standards (syllabusContext.ts);
 *   2. finds the teaching module's pages on those sub-topics (activities,
 *      methods, how to conduct, rubrics: moduleContext.ts) and searches the
 *      curriculum for that subject + level (RetrievalService);
 *   3. builds the prompt: rules + official syllabus + teaching module +
 *      numbered excerpts + the tool's layout (prompts.ts);
 *   4. streams Nemotron's document back as it is written;
 *   5. builds the source list from the retrieved chunks' real metadata.
 *
 * If the search fails, steps 1 and 2's syllabus and module material are
 * enough to write from: the document is written anyway, with a notice.
 *
 * Saving the finished document to the teacher's eFile is done by the route,
 * once the whole document has arrived.
 */
import type { RetrievedChunk, Source } from "../../types.js";
import { AppError, isAbortError, logError } from "../../utils/errors.js";
import type { GenerateRequest, Writer } from "../ai/NemotronProvider.js";
import type { CurriculumMapService } from "../curriculum/CurriculumMapService.js";
import { type ModuleGuide, type TeachingModuleService, resolveCurriculum } from "../curriculum/TeachingModuleService.js";
import { labelKey } from "../rag/DocumentChunker.js";
import type { RetrievalFocus, RetrievalService } from "../rag/RetrievalService.js";
import { assessmentModuleBlock, chosenActivities, lessonModuleBlock, moduleReference, notesModuleBlock, schemeModuleBlock } from "./moduleContext.js";
import { buildSyllabusContext, parseSections } from "./syllabusContext.js";
import type { FigureExtras } from "./figures.js";
import { GENERATORS, type GeneratorKey, type Inputs, SYSTEM_PROMPT, buildUserMessage, cbcKindOf } from "./prompts.js";

export interface PreparedGeneration {
  request: GenerateRequest;
  sources: Source[];
  title: string;
  /** Something the teacher should know about how the document was made (e.g. search was down). */
  notice?: string;
}

export function toSources(chunks: RetrievedChunk[]): Source[] {
  return chunks.map((chunk, i) => ({
    index: i + 1,
    documentName: chunk.metadata.documentName,
    docType: chunk.metadata.docType,
    pageNumber: chunk.metadata.pageNumber,
    excerpt: chunk.text.length > 300 ? `${chunk.text.slice(0, 300)}…` : chunk.text,
  }));
}

const NO_RETRY = new Set(["missing_api_key", "invalid_api_key", "unsupported_model", "rate_limited", "insufficient_balance"]);

export class GenerationService {
  constructor(
    private retrieval: RetrievalService,
    readonly writer: Writer,
    private maps?: CurriculumMapService,
    private modules?: TeachingModuleService,
  ) {}

  /** Steps 1-3 and 5: everything before the model starts writing. */
  async prepare(feature: GeneratorKey, inputs: Inputs, signal?: AbortSignal, figures: FigureExtras = {}, followUp = ""): Promise<PreparedGeneration> {
    const spec = GENERATORS[feature];
    const sections = feature === "assessment" && !cbcKindOf(inputs) ? parseSections(inputs) : null;
    const curriculum =
      this.maps && this.modules
        ? await resolveCurriculum(this.maps, this.modules, inputs.subject, inputs.level)
        : this.maps
          ? await this.maps.topicsFor(inputs.subject, inputs.level)
          : null;
    const syllabus = buildSyllabusContext(feature, inputs, curriculum);
    // The subject whose numbering the chosen codes follow.
    const numbering = curriculum?.subject ?? inputs.subject;

    // The teaching module's pages on the chosen sub-topics.
    let guides: ModuleGuide[] = [];
    if (this.modules && feature === "lessonPlan") {
      const target = syllabus?.topics[0]?.subTopics[0] ?? { code: inputs.subTopicCode, name: inputs.subTopic };
      const guide = await this.modules.guideFor(inputs.subject, inputs.level, { code: target.code, name: target.name || inputs.subTopic }, numbering);
      if (guide) guides = [guide];
    } else if (this.modules && (feature === "assessment" || feature === "schemeOfWork" || feature === "learnerNotes") && syllabus?.topics.length)
      guides = await this.modules.guidesForTopics(inputs.subject, inputs.level, syllabus.topics, numbering);

    let module: { block: string; reference?: string; activities?: string[]; termPicked?: number } | null = null;
    if (feature === "lessonPlan" && guides[0]) {
      const activities = chosenActivities(guides[0], inputs.activities, inputs.lessonNumber);
      module = {
        block: lessonModuleBlock(guides[0], activities),
        reference: moduleReference(guides[0]),
        activities: activities.map((a) => `Activity ${a.number}: ${a.title}`),
      };
    } else if (feature === "assessment" && guides.length) module = { block: assessmentModuleBlock(guides, cbcKindOf(inputs)) };
    else if (feature === "schemeOfWork" && guides.length) module = { block: schemeModuleBlock(guides), termPicked: syllabus?.termPicked };
    else if (feature === "learnerNotes" && guides.length) module = { block: notesModuleBlock(guides) };
    else if (feature === "schemeOfWork" && syllabus?.termPicked) module = { block: "", termPicked: syllabus.termPicked };

    // Search first: the module's own pages on these sub-topics, then passages tagged
    // with the syllabus topics (only in documents that share the syllabus's numbering).
    const focus: RetrievalFocus[] = guides.map((g) => ({ documentIds: [g.documentId], subTopicCodes: [g.sub.code] }));
    if (syllabus?.topicCodes.length) focus.push({ subjectKey: labelKey(numbering), topicCodes: syllabus.topicCodes });

    // If the search itself fails (the host is down or busy), the document can
    // still be written from the syllabus and the teaching module, which need no
    // search. Without either, there is nothing to write from: the error stands.
    let notice: string | undefined;
    const chunks = await this.retrieval.retrieve({
      query: syllabus?.searchHint ? `${spec.searchQuery(inputs)} ${syllabus.searchHint}`.slice(0, 1500) : spec.searchQuery(inputs),
      subject: inputs.subject,
      level: inputs.level,
      topK: spec.topK,
      // With the module's material already in the prompt, fewer loose passages are needed.
      maxChars: module?.block ? Math.round(spec.maxChars * 0.6) : spec.maxChars,
      focus,
      // Assessments also see a few past-paper passages, as examples of how ECZ asks questions.
      styleExamples: feature === "assessment" && !cbcKindOf(inputs) ? 4 : 0,
    }).catch((err: unknown): RetrievedChunk[] => {
      if (isAbortError(err) || (!syllabus && !module?.block)) throw err;
      logError("search-skipped", err);
      notice = "The curriculum search was not available, so this document was written from the syllabus and teaching module only. Check it carefully, or generate it again later.";
      return [];
    });
    if (chunks.length === 0 && !syllabus && !module?.block)
      throw new AppError(422, `There is no curriculum material for ${inputs.subject}, ${inputs.level} yet. Ask the system administrator to add the syllabus.`, "no_material");
    return {
      request: { system: SYSTEM_PROMPT, user: buildUserMessage(feature, inputs, chunks, syllabus?.block ?? null, sections, module, figures, followUp), signal },
      sources: toSources(chunks),
      title: spec.title(inputs),
      notice,
    };
  }

  /**
   * Step 4. If Nemotron fails before sending any text, try once more without
   * streaming, so a streaming hiccup still produces a document.
   */
  async *stream(request: GenerateRequest): AsyncIterable<string> {
    let sentAnything = false;
    try {
      for await (const text of this.writer.stream(request)) {
        sentAnything = true;
        yield text;
      }
    } catch (err) {
      if (sentAnything || isAbortError(err)) throw err;
      if (err instanceof AppError && NO_RETRY.has(err.code)) throw err;
      logError("stream-fallback", err);
      yield await this.writer.generate(request);
    }
  }
}
