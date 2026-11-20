/**
 * RAG step 4: store embeddings in ChromaDB and search them.
 * (Adapted from Company Knowledge AI.)
 *
 * ChromaDB runs as its own small server (started by `npm run dev`) and keeps
 * its files in storage/chroma, so the index survives restarts. We give it
 * ready-made embeddings, so Chroma never calls an embedding model itself.
 *
 * Searches are FILTERED by subject and class level before ranking, so a
 * Form 2 ICT lesson plan only ever sees ICT material that covers Form 2
 * (a Form 2 syllabus or a Form 1-4 one), however similar other passages are.
 */
import { ChromaClient, type Collection } from "chromadb";
import type { AppConfig } from "../../config/env.js";
import type { Chunk, ChunkMetadata, DocType, RetrievedChunk } from "../../types.js";
import { AppError } from "../../utils/errors.js";

export interface SearchFilter {
  /** The subject and any subjects grouped with it (see subjectGroups.ts). */
  subjectKeys: string[];
  /** The level's flag field, e.g. "lv_form_2" (see levelFlag in DocumentChunker). Left out: every level. */
  levelFlag?: string;
  /** Only passages from teaching modules etc. marked with one of these topics ("2.1"). */
  topicCodes?: string[];
  /** Only passages under these sub-topic headings ("2.1.1"). */
  subTopicCodes?: string[];
  /** Only passages of these documents (a teaching module's own pages). */
  documentIds?: string[];
  /** Only one kind of document, e.g. past papers. */
  docType?: DocType;
}

/** The filter as ChromaDB wants it ($and needs two or more conditions). */
function whereOf(filter: SearchFilter): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [{ subjectKey: { $in: filter.subjectKeys } }];
  if (filter.levelFlag) conditions.push({ [filter.levelFlag]: true });
  if (filter.topicCodes?.length) conditions.push({ topicCode: { $in: filter.topicCodes } });
  if (filter.subTopicCodes?.length) conditions.push({ subTopicCode: { $in: filter.subTopicCodes } });
  if (filter.documentIds?.length) conditions.push({ documentId: { $in: filter.documentIds } });
  if (filter.docType) conditions.push({ docType: filter.docType });
  return conditions.length === 1 ? conditions[0] : { $and: conditions };
}

export interface VectorStore {
  addChunks(chunks: Chunk[], embeddings: number[][]): Promise<void>;
  query(embedding: number[], topK: number, filter: SearchFilter): Promise<RetrievedChunk[]>;
  deleteDocument(documentId: string): Promise<void>;
  clear(): Promise<void>;
  health(): Promise<{ ok: boolean; error?: string }>;
}

const BATCH_SIZE = 100;

export class VectorStoreService implements VectorStore {
  private client: ChromaClient;
  private collection: Collection | null = null;

  constructor(private config: AppConfig) {
    const url = new URL(config.chromaUrl);
    this.client = new ChromaClient({
      // "localhost" can mean two addresses on Windows (IPv4 and IPv6) and a connection
      // can go to the one the server is not listening on. Use IPv4 explicitly.
      host: url.hostname === "localhost" ? "127.0.0.1" : url.hostname,
      port: Number(url.port) || (url.protocol === "https:" ? 443 : 8100),
      ssl: url.protocol === "https:",
    });
  }

  private unavailable(err: unknown): AppError {
    if (err instanceof AppError) return err;
    const message = String((err as Error)?.message ?? err);
    if (/dimension/i.test(message))
      return new AppError(
        500,
        "The stored embeddings have a different size from the current embedding model. Use \"Re-index all\" in the curriculum library.",
        "embedding_dimension_mismatch",
      );
    const name = String((err as Error)?.name ?? "");
    if (/connection/i.test(name) || /fetch failed|ECONNREFUSED|failed to connect/i.test(message))
      return new AppError(
        503,
        `The vector database (ChromaDB) is not reachable at ${this.config.chromaUrl}. Start the AI server with "npm run dev".`,
        "chroma_unavailable",
      );
    return new AppError(500, `The vector database reported an error: ${message.slice(0, 200)}`, "chroma_error");
  }

  private async getCollection(): Promise<Collection> {
    if (!this.collection) {
      this.collection = await this.client.getOrCreateCollection({
        name: this.config.chromaCollection,
        embeddingFunction: null, // we supply embeddings ourselves
        configuration: { hnsw: { space: "cosine" } },
      });
    }
    return this.collection;
  }

  /** Runs an operation; if it fails, forgets the cached collection and reports a clear error. */
  private async run<T>(operation: (collection: Collection) => Promise<T>): Promise<T> {
    try {
      return await operation(await this.getCollection());
    } catch (err) {
      this.collection = null;
      throw this.unavailable(err);
    }
  }

  async addChunks(chunks: Chunk[], embeddings: number[][]): Promise<void> {
    await this.run(async (collection) => {
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        await collection.add({
          ids: batch.map((c) => c.id),
          embeddings: embeddings.slice(i, i + BATCH_SIZE),
          documents: batch.map((c) => c.text),
          metadatas: batch.map((c) => ({ ...c.metadata })),
        });
      }
    });
  }

  async query(embedding: number[], topK: number, filter: SearchFilter): Promise<RetrievedChunk[]> {
    return this.run(async (collection) => {
      const result = await collection.query({
        queryEmbeddings: [embedding],
        nResults: topK,
        where: whereOf(filter) as never,
        include: ["documents", "metadatas", "distances"],
      });
      const matches: RetrievedChunk[] = [];
      result.ids[0]?.forEach((id, i) => {
        const text = result.documents[0]?.[i];
        const metadata = result.metadatas[0]?.[i] as unknown as ChunkMetadata | null;
        const distance = result.distances[0]?.[i];
        if (text && metadata && typeof distance === "number") matches.push({ id, text, metadata, distance });
      });
      return matches;
    });
  }

  async deleteDocument(documentId: string): Promise<void> {
    await this.run((collection) => collection.delete({ where: { documentId } }));
  }

  async clear(): Promise<void> {
    try {
      await this.client.deleteCollection({ name: this.config.chromaCollection });
    } catch (err) {
      // Clearing an index that was never created is fine.
      const missing = (err as Error)?.name === "ChromaNotFoundError" || /not .*(found|exist)/i.test(String((err as Error)?.message ?? err));
      if (!missing) throw this.unavailable(err);
    } finally {
      this.collection = null;
    }
  }

  async health(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.heartbeat();
      return { ok: true };
    } catch {
      return { ok: false, error: `ChromaDB is not reachable at ${this.config.chromaUrl}. Start the AI server with "npm run dev".` };
    }
  }
}
