/**
 * Nemotron, the model that writes the documents, through any host that
 * speaks the OpenAI "chat completions" format: NVIDIA Build or DeepInfra
 * (hosts.ts). (Adapted from Company Knowledge AI's OpenAICompatibleProvider
 * + NVIDIAProvider.)
 *
 * Nemotron is a reasoning model: it may "think" first and then write the
 * answer. Hosts send the thinking separately (reasoning_content) or inside
 * <think>…</think> at the start of the answer; either way only the answer is
 * passed on. NVIDIA_MAX_TOKENS must leave room for both.
 *
 * createWriter() builds the writer the server uses: one host, or several
 * tried in order (FallbackWriter) when WRITER_HOSTS names more than one,
 * behind a queue (QueuedWriter) so only WRITER_CONCURRENCY documents are
 * written at once and every other teacher waits their turn, in order.
 *
 * Speed (21 Nov 2026): every request says which job it is (`job`). The job
 * decides how much the model thinks first (config.jobs: off / low / full,
 * sent as chat_template_kwargs; a host that refuses that option is asked
 * again without it, and never sent it again), how long the answer may be,
 * and whether the smaller NVIDIA_FAST_MODEL may write it. A busy host
 * (429, 5xx, network) is asked again up to twice before the next host is
 * tried, and a stream that goes silent for STALL_MS is given up.
 */
import OpenAI from "openai";
import type { AppConfig, Job } from "../../config/env.js";
import { AppError, describeProviderError, isAbortError, logError } from "../../utils/errors.js";
import { type Host, HostHealth, allHosts, hostsInOrder } from "./hosts.js";

export interface GenerateRequest {
  system: string;
  user: string;
  /** Lets the caller cancel the request (Stop button, closed tab). */
  signal?: AbortSignal;
  /** Which job this is: sets the thinking, the length and the model (config.jobs). */
  job?: Job;
  /** Called while waiting in the queue with how many requests are ahead (0 = starting now). */
  onQueue?: (ahead: number) => void;
}

export interface Writer {
  readonly model: string;
  readonly available: boolean;
  generate(request: GenerateRequest): Promise<string>;
  /** Yields the document piece by piece as the model writes it. */
  stream(request: GenerateRequest): AsyncIterable<string>;
}

const THINK = /<think>[\s\S]*?<\/think>\s*/g;
/** A stream that sends nothing for this long is given up (the host has stalled). */
const STALL_MS = 120_000;
const RETRIES = 2;
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); reject(Object.assign(new Error("aborted"), { name: "AbortError" })); }, { once: true });
});
/** Busy, overloaded or unreachable: worth asking the same host again. */
const isRetryable = (err: unknown) => {
  const e = err as { status?: number; message?: string; code?: string };
  return e?.status === 429 || (typeof e?.status === "number" && e.status >= 500) || /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|Connection error|stalled/i.test(`${e?.message ?? ""} ${e?.code ?? ""}`);
};
/** The host refused the thinking option (an unknown request field). */
const refusedKwargs = (err: unknown) => {
  const e = err as { status?: number; message?: string };
  return e?.status === 400 && /chat_template_kwargs|enable_thinking|low_effort|reasoning_effort|extra (fields|inputs)|unrecognized|unexpected/i.test(e?.message ?? "");
};

/** The model is retired, unknown or not enabled for this key: worth trying the next model in the list. */
const isModelGone = (err: unknown) => {
  const e = err as { status?: number; message?: string };
  return e?.status === 404 || e?.status === 410
    || /end of life|end-of-life|deprecated|retired|no longer (available|supported|served)|model.*not (found|exist|available)|unknown model|does not exist/i.test(e?.message ?? "");
};

/** Nemotron 3.5 takes "reasoning_effort"; Nemotron 3 takes chat_template_kwargs. */
const isNemotron35 = (model: string) => /nemotron-3\.5/i.test(model);

export class NemotronProvider implements Writer {
  /**
   * The models to write with, in order (NVIDIA_MODEL may list several,
   * separated by commas). When NVIDIA retires one, the next is used, the
   * switch is logged, and the server keeps working.
   */
  private models: string[];
  private current = 0;
  get model(): string { return this.models[this.current]; }
  readonly hostId: string;
  private host: Host;
  private client: Pick<OpenAI, "chat"> | null;

  /** Tests pass a fake client so no real network call is made. `host` defaults to NVIDIA. */
  constructor(private config: AppConfig, client?: Pick<OpenAI, "chat">, host?: Host) {
    this.host = host ?? allHosts(config).nvidia;
    this.hostId = this.host.id;
    this.models = this.host.writeModel.split(",").map((m) => m.trim()).filter(Boolean);
    if (!this.models.length) this.models = [this.host.writeModel];
    this.client =
      client ?? (this.host.apiKey ? new OpenAI({ apiKey: this.host.apiKey, baseURL: this.host.baseUrl, maxRetries: 1, timeout: 600_000 }) : null);
  }

  get available(): boolean {
    return this.client !== null;
  }

  private get label() {
    return `${this.host.label} Nemotron`;
  }

  private requireClient() {
    if (!this.client)
      throw new AppError(400, `Writing needs ${this.host.keyName}. Add it to ai-server/.env and restart the AI server.`, "missing_api_key");
    return this.client;
  }

  /** False once this host has refused the thinking option. */
  private sendsThinking = true;
  /** False once the fast model turned out not to be available on this account. */
  private usesFastModel = true;

  private body(request: GenerateRequest) {
    const job = request.job ? this.config.jobs[request.job] : null;
    const model = job?.fast && this.usesFastModel && this.config.fastModel && this.host.id === "nvidia" ? this.config.fastModel : this.model;
    const effort = job?.effort ?? "full";
    return {
      model,
      temperature: this.config.nvidia.temperature,
      max_tokens: Math.min(this.config.nvidia.maxTokens, job?.maxTokens ?? this.config.nvidia.maxTokens),
      messages: [
        { role: "system" as const, content: request.system },
        { role: "user" as const, content: request.user },
      ],
      // Thinking off, short or full: Nemotron 3.5 as "reasoning_effort", Nemotron 3 as chat_template_kwargs.
      ...(this.sendsThinking && job
        ? isNemotron35(model)
          ? { reasoning_effort: effort === "off" ? "none" : effort === "low" ? "low" : "high" }
          : { chat_template_kwargs: effort === "off" ? { enable_thinking: false } : effort === "low" ? { enable_thinking: true, low_effort: true } : { enable_thinking: true } }
        : {}),
    };
  }

  /** Starts a request, asking again when the host is busy or refuses the thinking option. */
  private async open<T>(request: GenerateRequest, start: (body: ReturnType<NemotronProvider["body"]>) => Promise<T>): Promise<T> {
    for (let attempt = 0; ;) {
      try {
        return await start(this.body(request));
      } catch (err) {
        if (isAbortError(err)) throw err;
        const status = (err as { status?: number })?.status;
        const usedFast = !!(request.job && this.config.jobs[request.job].fast && this.usesFastModel && this.config.fastModel && this.host.id === "nvidia");
        if (usedFast && (status === 404 || isModelGone(err))) {
          this.usesFastModel = false;
          logError(`writer:${this.hostId}`, `fast model ${this.config.fastModel} is not available; using ${this.model}`);
          continue;
        }
        if (!usedFast && isModelGone(err) && this.current + 1 < this.models.length) {
          logError(`writer:${this.hostId}`, `model ${this.model} is not available (${(err as Error)?.message ?? err}); switching to ${this.models[this.current + 1]}`);
          this.current++;
          continue;
        }
        if (this.sendsThinking && refusedKwargs(err)) { this.sendsThinking = false; logError(`writer:${this.hostId}`, "host refused chat_template_kwargs; sending without"); continue; }
        if (attempt < RETRIES && isRetryable(err)) { await sleep(1500 * 3 ** attempt++, request.signal); continue; }
        throw describeProviderError(this.label, this.model, err, this.host.keyName);
      }
    }
  }

  async generate(request: GenerateRequest): Promise<string> {
    const client = this.requireClient();
    const response = await this.open(request, (body) => client.chat.completions.create({ ...body, stream: false } as never, { signal: request.signal }) as unknown as Promise<OpenAI.Chat.Completions.ChatCompletion>);
    return (response.choices[0]?.message?.content ?? "").replace(THINK, "");
  }

  async *stream(request: GenerateRequest): AsyncIterable<string> {
    const client = this.requireClient();
    // Leaves out a <think>…</think> block at the start of the answer, for hosts
    // that send the thinking that way instead of as reasoning_content.
    let mode: "start" | "think" | "answer" = "start";
    let held = "";
    // Cancelled by the teacher, or by the watchdog when the host goes silent.
    const watchdog = new AbortController();
    const cancel = () => watchdog.abort();
    request.signal?.addEventListener("abort", cancel, { once: true });
    let timer: NodeJS.Timeout | undefined;
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => watchdog.abort(new Error("stalled")), STALL_MS); };
    try {
      arm();
      const stream = await this.open({ ...request, signal: watchdog.signal }, (body) =>
        client.chat.completions.create({ ...body, stream: true } as never, { signal: watchdog.signal }) as unknown as Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>>);
      for await (const part of stream) {
        arm(); // thinking also counts as "still working"
        const text = part.choices[0]?.delta?.content; // the answer only, not reasoning_content
        if (!text) continue;
        if (mode === "answer") { yield text; continue; }
        held += text;
        if (mode === "start") {
          const begin = held.trimStart();
          if (begin.length < 7 && "<think>".startsWith(begin)) continue; // not sure yet
          if (!begin.startsWith("<think>")) { mode = "answer"; yield held; held = ""; continue; }
          mode = "think";
        }
        const end = held.indexOf("</think>");
        if (end < 0) continue;
        const rest = held.slice(end + "</think>".length).replace(/^\s+/, "");
        mode = "answer";
        held = "";
        if (rest) yield rest;
      }
      if (mode === "start" && held) yield held; // a very short answer
    } catch (err) {
      if (request.signal?.aborted) throw err;
      if (watchdog.signal.aborted) throw new AppError(502, `${this.label} stopped sending text for ${STALL_MS / 1000} seconds. Try again.`, "provider_unavailable");
      if (isAbortError(err)) throw err;
      throw describeProviderError(this.label, this.model, err, this.host.keyName);
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", cancel);
    }
  }
}

/**
 * Several hosts, tried in order. If one fails before it has written
 * anything (busy, out of credit, down, a bad key), the next one writes the
 * document instead, and the failed host is tried last for the next 2 minutes.
 * Once text has reached the teacher a failure is not retried elsewhere: the
 * document would start again from the beginning.
 */
export class FallbackWriter implements Writer {
  constructor(
    readonly writers: NemotronProvider[],
    private health = new HostHealth(),
  ) {
    if (writers.length === 0) throw new Error("FallbackWriter needs at least one writer");
  }

  /** The first host's model (what the documents record). */
  get model(): string {
    return this.writers[0].model;
  }

  get available(): boolean {
    return this.writers.some((w) => w.available);
  }

  async generate(request: GenerateRequest): Promise<string> {
    let last: unknown;
    for (const writer of this.health.order(this.writers)) {
      try {
        const text = await writer.generate(request);
        this.health.ok(writer.hostId);
        return text;
      } catch (err) {
        if (isAbortError(err)) throw err;
        this.health.fail(writer.hostId);
        logError(`writer:${writer.hostId}`, err);
        last = err;
      }
    }
    throw last;
  }

  async *stream(request: GenerateRequest): AsyncIterable<string> {
    let last: unknown;
    for (const writer of this.health.order(this.writers)) {
      let wrote = false;
      try {
        for await (const text of writer.stream(request)) {
          wrote = true;
          yield text;
        }
        this.health.ok(writer.hostId);
        return;
      } catch (err) {
        if (wrote || isAbortError(err)) throw err;
        this.health.fail(writer.hostId);
        logError(`writer:${writer.hostId}`, err);
        last = err;
      }
    }
    throw last;
  }
}

/**
 * Lets at most `limit` requests run at once; the others wait in a queue, in
 * the order they came, and are told how many are ahead of them. A request
 * cancelled while waiting leaves the queue. This keeps a crowd of teachers
 * from overloading the host (and being refused with 429s) and shares the
 * writer fairly. Short jobs (evaluations…) share the same queue: they are
 * quick, so they never wait long.
 */
export class QueuedWriter implements Writer {
  private running = 0;
  private waiting: { start: () => void; notify: () => void; cancelled: boolean }[] = [];

  constructor(private inner: Writer, private limit: number) {}

  get model(): string { return this.inner.model; }
  get available(): boolean { return this.inner.available; }
  /** For the health check: how busy the writer is. */
  get load() { return { running: this.running, waiting: this.waiting.filter((w) => !w.cancelled).length, limit: this.limit }; }

  private async acquire(request: GenerateRequest): Promise<() => void> {
    const release = () => {
      this.running--;
      this.waiting = this.waiting.filter((w) => !w.cancelled);
      const next = this.waiting.shift();
      if (next) next.start();
      this.waiting.forEach((w) => w.notify());
    };
    if (this.running < this.limit && this.waiting.length === 0) {
      this.running++;
      request.onQueue?.(0);
      return release;
    }
    return new Promise((resolve, reject) => {
      const entry = {
        cancelled: false,
        start: () => { this.running++; request.onQueue?.(0); resolve(release); },
        notify: () => request.onQueue?.(this.waiting.filter((w) => !w.cancelled).indexOf(entry) + 1),
      };
      this.waiting.push(entry);
      entry.notify();
      request.signal?.addEventListener("abort", () => {
        entry.cancelled = true;
        this.waiting = this.waiting.filter((w) => w !== entry);
        this.waiting.forEach((w) => w.notify());
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      }, { once: true });
    });
  }

  async generate(request: GenerateRequest): Promise<string> {
    const release = await this.acquire(request);
    try { return await this.inner.generate(request); } finally { release(); }
  }

  async *stream(request: GenerateRequest): AsyncIterable<string> {
    const release = await this.acquire(request);
    try { yield* this.inner.stream(request); } finally { release(); }
  }
}

/** The writer for WRITER_HOSTS: one host, or a FallbackWriter over several, behind the queue. */
export function createWriter(config: AppConfig): Writer {
  const writers = hostsInOrder(config, config.writerHosts).map((host) => new NemotronProvider(config, undefined, host));
  if (writers.length === 0) return new NemotronProvider(config); // no key at all: explains what is missing
  return new QueuedWriter(writers.length === 1 ? writers[0] : new FallbackWriter(writers), config.writerConcurrency);
}
