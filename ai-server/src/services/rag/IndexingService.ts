/**
 * Runs the whole "indexing" half of RAG for one curriculum PDF:
 *
 *   read the stored PDF -> extract text -> chunk -> embed -> save in ChromaDB
 *
 * The document's status in the library (stored -> indexing -> indexed or
 * failed) is what the superAdmin console shows. Documents are indexed one
 * at a time, in the order they were queued, so a big upload never sends
 * hundreds of embedding requests at once.
 */
import fs from "node:fs/promises";
import type { CurriculumService } from "../CurriculumService.js";
import { AppError, logError } from "../../utils/errors.js";
import type { DocumentChunker } from "./DocumentChunker.js";
import type { Embedder } from "./EmbeddingService.js";
import type { PDFProcessor } from "./PDFProcessor.js";
import type { VectorStore } from "./VectorStoreService.js";

export class IndexingService {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private curriculum: CurriculumService,
    private pdf: PDFProcessor,
    private chunker: DocumentChunker,
    private embedder: Embedder,
    private store: VectorStore,
    /** Runs after a document is indexed, with its PDF (reads teaching modules). Failures here never fail the indexing. */
    private afterIndex?: (documentId: string, buffer: Buffer) => Promise<void>,
  ) {}

  /** Marks the document "indexing" now and processes it when its turn comes. */
  async enqueue(documentId: string): Promise<void> {
    await this.curriculum.update(documentId, { status: "indexing", error: undefined });
    this.queue = this.queue.then(() => this.index(documentId)).catch(() => {});
  }

  /** Waits until everything queued so far has finished (used by tests). */
  idle(): Promise<void> {
    return this.queue;
  }

  private async index(documentId: string): Promise<void> {
    try {
      const document = await this.curriculum.get(documentId); // labels may have changed since queueing
      // Start clean: a re-index replaces any chunks from an earlier run.
      await this.store.deleteDocument(documentId);

      const buffer = await fs.readFile(this.curriculum.filePath(documentId));
      const extracted = await this.pdf.extract(buffer);
      const chunks = this.chunker.chunk(extracted.pages, document);
      if (chunks.length === 0) throw new AppError(422, "This document contains no text to index.", "empty_document");

      const embeddings = await this.embedder.embedDocuments(chunks.map((c) => c.text));

      // Drop any chunk NVIDIA's safety screening refused (embedding is null);
      // the rest of the document stays searchable.
      const kept = chunks.flatMap((chunk, i) => {
        const embedding = embeddings[i];
        return embedding ? [{ chunk, embedding }] : [];
      });
      const skipped = chunks.length - kept.length;
      if (kept.length === 0)
        throw new AppError(422, "NVIDIA's content safety screening refused every part of this document, so none of it could be indexed.", "content_rejected");
      if (skipped > 0)
        console.warn(`[index:${documentId}] skipped ${skipped} of ${chunks.length} chunks flagged by NVIDIA content safety screening`);

      await this.store.addChunks(kept.map((k) => k.chunk), kept.map((k) => k.embedding));
      await this.curriculum.update(documentId, {
        status: "indexed",
        pages: extracted.pageCount,
        chunks: kept.length,
        skippedChunks: skipped || undefined,
        error: undefined,
      });
      if (this.afterIndex) await this.afterIndex(documentId, buffer).catch((err) => logError(`after-index:${documentId}`, err));
    } catch (err) {
      if (err instanceof AppError && err.code === "not_found") return; // deleted while waiting
      logError(`index:${documentId}`, err);
      await this.store.deleteDocument(documentId).catch(() => {}); // leave nothing half-indexed
      const message = err instanceof AppError ? err.message : "Indexing failed unexpectedly. Check the AI server log.";
      await this.curriculum.update(documentId, { status: "failed", chunks: 0, error: message }).catch(() => {});
    }
  }
}
