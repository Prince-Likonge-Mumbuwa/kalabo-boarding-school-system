/**
 * RAG step 3: turn text into embeddings (long lists of numbers that capture
 * meaning; similar meanings give similar lists), using the Nemotron search
 * model on NVIDIA Build or DeepInfra (hosts.ts, SEARCH_HOSTS in .env).
 *
 * NVIDIA's retrieval models are "asymmetric": text being stored is embedded
 * as a "passage" and a search is embedded as a "query". Mixing them up
 * makes search noticeably worse, so the two have separate methods.
 *
 * Documents and searches must use the SAME model to be comparable. If you
 * change the embedding model, re-index every curriculum document.
 *
 * createEmbedder() builds the embedder the server uses. With more than one
 * search host, a SEARCH falls back to the next host when one fails, but
 * INDEXING always uses the first host, so the index is never a mix.
 */
import type { AppConfig } from "../../config/env.js";
import { AppError, describeProviderError, logError } from "../../utils/errors.js";
import { type Host, HostHealth, allHosts, hostsInOrder } from "../ai/hosts.js";

export interface Embedder {
  readonly model: string;
  readonly available: boolean;
  /**
   * One vector per text, in order. A text NVIDIA's content safety screening
   * refuses comes back as `null` instead of failing the whole document.
   */
  embedDocuments(texts: string[]): Promise<(number[] | null)[]>;
  embedQuery(text: string): Promise<number[]>;
}

const isContentRejected = (err: unknown) => err instanceof AppError && err.code === "content_rejected";

const BATCH_SIZE = 32;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class NvidiaEmbeddingService implements Embedder {
  readonly model: string;
  readonly hostId: string;
  private host: Host;

  /**
   * `host` defaults to NVIDIA (the class keeps its original name). `retries`:
   * how many times a busy or failing host is asked again (3 when it is the
   * only host; 1 when another host can take over).
   */
  constructor(config: AppConfig, host?: Host, private retries = 3) {
    this.host = host ?? allHosts(config).nvidia;
    this.hostId = this.host.id;
    this.model = this.host.embedModel;
  }

  get available(): boolean {
    return Boolean(this.host.apiKey);
  }

  private get label() {
    return `${this.host.label} embeddings`;
  }

  async embedDocuments(texts: string[]): Promise<(number[] | null)[]> {
    const vectors: (number[] | null)[] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE)
      vectors.push(...(await this.embedPassagesSkippingRejected(texts.slice(i, i + BATCH_SIZE))));
    return vectors;
  }

  /**
   * NVIDIA rejects a whole batch if even one of its 32 chunks is flagged.
   * To find the culprit, split the batch in half and try each half again,
   * repeating until the flagged chunk is on its own; that chunk gets `null`
   * and every other chunk is still embedded. (A few extra requests, only
   * when something was flagged.)
   */
  private async embedPassagesSkippingRejected(texts: string[]): Promise<(number[] | null)[]> {
    try {
      return await this.embedBatch(texts, "passage");
    } catch (err) {
      if (!isContentRejected(err)) throw err;
      if (texts.length === 1) return [null];
      const mid = Math.ceil(texts.length / 2);
      return [
        ...(await this.embedPassagesSkippingRejected(texts.slice(0, mid))),
        ...(await this.embedPassagesSkippingRejected(texts.slice(mid))),
      ];
    }
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embedBatch([text], "query");
    return vector;
  }

  private async embedBatch(texts: string[], inputType: "passage" | "query"): Promise<number[][]> {
    if (!this.available)
      throw new AppError(400, `Search needs ${this.host.keyName}. Add it to ai-server/.env and restart the AI server.`, "missing_api_key");
    const url = `${this.host.baseUrl.replace(/\/+$/, "")}/embeddings`;
    const kind = this.host.embedStyle === "task"
      ? { task: inputType === "query" ? "search_query" : "document" }
      : { input_type: inputType };

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.host.apiKey}` },
          body: JSON.stringify({ model: this.model, input: texts, ...kind, encoding_format: "float" }),
          signal: AbortSignal.timeout(120_000),
        });
      } catch (err) {
        if (attempt < this.retries) { await sleep(1500 * 2 ** attempt); continue; }
        throw describeProviderError(this.label, this.model, err, this.host.keyName);
      }
      const body = (await response.json().catch(() => null)) as
        | { data?: { index: number; embedding: number[] }[]; detail?: string; error?: unknown; message?: string }
        | null;
      // Back off and retry on rate limits and outages, but not on a safety
      // refusal: the same text would just be refused again.
      const safetyRefusal = /content safety|safety screening|input rejected/i.test(JSON.stringify(body ?? ""));
      if ((response.status === 429 || response.status >= 500) && !safetyRefusal && attempt < this.retries) {
        await sleep(1500 * 2 ** attempt);
        continue;
      }
      if (!response.ok) {
        // `describeProviderError` turns a content-safety refusal into code "content_rejected".
        const detail = typeof body?.detail === "string" ? body.detail : JSON.stringify(body?.error ?? body?.message ?? "");
        throw describeProviderError(this.label, this.model, { status: response.status, message: detail }, this.host.keyName);
      }
      const vectors = [...(body?.data ?? [])].sort((a, b) => a.index - b.index).map((d) => d.embedding);
      if (vectors.length !== texts.length || vectors.some((v) => !Array.isArray(v) || v.length === 0))
        throw new AppError(502, `${this.host.label} returned incomplete embeddings. Try again.`, "embedding_failed");
      return vectors;
    }
  }
}

/**
 * Several search hosts. A search tries them in order (a failed host is tried
 * last for 2 minutes); indexing uses the first host only, so documents in
 * the index all come from one host.
 */
export class FallbackEmbedder implements Embedder {
  constructor(
    readonly embedders: NvidiaEmbeddingService[],
    private health = new HostHealth(),
  ) {
    if (embedders.length === 0) throw new Error("FallbackEmbedder needs at least one embedder");
  }

  get model(): string {
    return this.embedders[0].model;
  }

  get available(): boolean {
    return this.embedders[0].available;
  }

  embedDocuments(texts: string[]): Promise<(number[] | null)[]> {
    return this.embedders[0].embedDocuments(texts);
  }

  async embedQuery(text: string): Promise<number[]> {
    let last: unknown;
    for (const embedder of this.health.order(this.embedders)) {
      try {
        const vector = await embedder.embedQuery(text);
        this.health.ok(embedder.hostId);
        return vector;
      } catch (err) {
        this.health.fail(embedder.hostId);
        logError(`search:${embedder.hostId}`, err);
        last = err;
      }
    }
    throw last;
  }
}

/** The embedder for SEARCH_HOSTS: one host, or a FallbackEmbedder over several. */
export function createEmbedder(config: AppConfig): Embedder {
  const hosts = hostsInOrder(config, config.searchHosts);
  const embedders = hosts.map((host) => new NvidiaEmbeddingService(config, host, hosts.length > 1 ? 1 : 3));
  if (embedders.length === 0) return new NvidiaEmbeddingService(config); // no key at all: explains what is missing
  return embedders.length === 1 ? embedders[0] : new FallbackEmbedder(embedders);
}
