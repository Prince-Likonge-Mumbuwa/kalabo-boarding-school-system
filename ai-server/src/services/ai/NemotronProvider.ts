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
 * tried in order (FallbackWriter) when WRITER_HOSTS names more than one.
 */
import OpenAI from "openai";
import type { AppConfig } from "../../config/env.js";
import { AppError, describeProviderError, isAbortError, logError } from "../../utils/errors.js";
import { type Host, HostHealth, allHosts, hostsInOrder } from "./hosts.js";

export interface GenerateRequest {
  system: string;
  user: string;
  /** Lets the caller cancel the request (Stop button, closed tab). */
  signal?: AbortSignal;
}

export interface Writer {
  readonly model: string;
  readonly available: boolean;
  generate(request: GenerateRequest): Promise<string>;
  /** Yields the document piece by piece as the model writes it. */
  stream(request: GenerateRequest): AsyncIterable<string>;
}

const THINK = /<think>[\s\S]*?<\/think>\s*/g;

export class NemotronProvider implements Writer {
  readonly model: string;
  readonly hostId: string;
  private host: Host;
  private client: Pick<OpenAI, "chat"> | null;

  /** Tests pass a fake client so no real network call is made. `host` defaults to NVIDIA. */
  constructor(private config: AppConfig, client?: Pick<OpenAI, "chat">, host?: Host) {
    this.host = host ?? allHosts(config).nvidia;
    this.hostId = this.host.id;
    this.model = this.host.writeModel;
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

  private body(request: GenerateRequest) {
    return {
      model: this.model,
      temperature: this.config.nvidia.temperature,
      max_tokens: this.config.nvidia.maxTokens,
      messages: [
        { role: "system" as const, content: request.system },
        { role: "user" as const, content: request.user },
      ],
    };
  }

  async generate(request: GenerateRequest): Promise<string> {
    const client = this.requireClient();
    try {
      const response = await client.chat.completions.create({ ...this.body(request), stream: false }, { signal: request.signal });
      return (response.choices[0]?.message?.content ?? "").replace(THINK, "");
    } catch (err) {
      if (isAbortError(err)) throw err;
      throw describeProviderError(this.label, this.model, err, this.host.keyName);
    }
  }

  async *stream(request: GenerateRequest): AsyncIterable<string> {
    const client = this.requireClient();
    // Leaves out a <think>…</think> block at the start of the answer, for hosts
    // that send the thinking that way instead of as reasoning_content.
    let mode: "start" | "think" | "answer" = "start";
    let held = "";
    try {
      const stream = await client.chat.completions.create({ ...this.body(request), stream: true }, { signal: request.signal });
      for await (const part of stream) {
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
      if (isAbortError(err)) throw err;
      throw describeProviderError(this.label, this.model, err, this.host.keyName);
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

/** The writer for WRITER_HOSTS: one host, or a FallbackWriter over several. */
export function createWriter(config: AppConfig): Writer {
  const writers = hostsInOrder(config, config.writerHosts).map((host) => new NemotronProvider(config, undefined, host));
  if (writers.length === 0) return new NemotronProvider(config); // no key at all: explains what is missing
  return writers.length === 1 ? writers[0] : new FallbackWriter(writers);
}
