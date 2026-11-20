/**
 * RAG step 5: find the curriculum passages that best match a request.
 *
 *   search text -> embedding -> nearest chunks for THIS subject and level -> trim to budget
 *
 * With a focus (from the approved syllabus or a teaching module), passages
 * tagged with those topics are searched first, so a lesson on 2.1.1 gets the
 * teaching module's pages on 2.1.1 before anything else; the ordinary search
 * fills the rest.
 *
 * Topic codes are only compared inside documents that use the same
 * numbering: the ICT syllabus's 2.2 is Productivity Tools, the Computer
 * Science module's 2.2 is Data Representation. So a focus by code names the
 * subject (or the documents) whose numbering it follows.
 * For assessments, a few past-paper passages of the same subject group are
 * added at any level: they show how ECZ asks questions (see eczStyle.ts).
 *
 * There is no similarity cut-off: the search is already limited to one
 * subject and class level, so the best matches there are always relevant
 * material, and a cut-off would only make good passages disappear when the
 * embedding model scores everything low.
 */
import type { RetrievedChunk } from "../../types.js";
import { levelFlag } from "./DocumentChunker.js";
import { subjectKeysFor } from "./subjectGroups.js";
import type { Embedder } from "./EmbeddingService.js";
import type { VectorStore } from "./VectorStoreService.js";

export interface RetrievalRequest {
  query: string;
  subject: string;
  level: string;
  topK: number;
  /** Upper limit on passage text sent to the model, in characters. */
  maxChars: number;
  /** Passages to search first. */
  focus?: RetrievalFocus[];
  /** How many past-paper passages to add as examples of ECZ questioning (any level). */
  styleExamples?: number;
}

/** One "search these first" group: topic or sub-topic codes, inside one numbering. */
export interface RetrievalFocus {
  /** Documents of this subject only (whose numbering the codes follow)... */
  subjectKey?: string;
  /** ...or these documents only. */
  documentIds?: string[];
  topicCodes?: string[];
  subTopicCodes?: string[];
}

export class RetrievalService {
  constructor(
    private embedder: Embedder,
    private store: VectorStore,
  ) {}

  async retrieve(request: RetrievalRequest): Promise<RetrievedChunk[]> {
    const embedding = await this.embedder.embedQuery(request.query);
    const subjectKeys = subjectKeysFor(request.subject); // ICT also finds Computer Studies and Computer Science
    const flag = levelFlag(request.level);
    const focused: RetrievedChunk[] = [];
    const groups = (request.focus ?? []).filter((f) => f.topicCodes?.length || f.subTopicCodes?.length);
    for (const f of groups)
      focused.push(
        ...(await this.store.query(embedding, Math.max(2, Math.ceil(request.topK / 2 / groups.length)), {
          subjectKeys: f.subjectKey ? [f.subjectKey] : subjectKeys,
          levelFlag: flag,
          topicCodes: f.topicCodes,
          subTopicCodes: f.subTopicCodes,
          documentIds: f.documentIds,
        })),
      );
    const general = await this.store.query(embedding, request.topK, { subjectKeys, levelFlag: flag });
    const style = request.styleExamples
      ? await this.store.query(embedding, request.styleExamples, { subjectKeys, docType: "past_paper" })
      : [];
    // Past-paper examples have their own small allowance, so they never push out syllabus material.
    const matches = [...focused, ...general.filter((m) => m.metadata.docType !== "past_paper" || !request.styleExamples)];

    const seen = new Set<string>();
    const chunks: RetrievedChunk[] = [];
    let used = 0;
    // Matches arrive best-first, so the most relevant chunks claim the budget first.
    for (const match of matches) {
      if (seen.has(match.text)) continue; // the same passage uploaded twice
      if (chunks.length > 0 && used + match.text.length > request.maxChars) break;
      seen.add(match.text);
      used += match.text.length;
      chunks.push(match);
    }
    for (const match of style) {
      if (seen.has(match.text)) continue;
      seen.add(match.text);
      chunks.push(match);
    }
    // Present the passages in syllabus order (document, then page), which reads
    // more naturally than "most similar first" when planning a sequence of lessons.
    return chunks.sort((a, b) =>
      a.metadata.documentName.localeCompare(b.metadata.documentName) || a.metadata.chunkIndex - b.metadata.chunkIndex);
  }
}
