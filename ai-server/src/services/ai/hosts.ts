/**
 * The AI hosts the server can use, and which of them are healthy.
 *
 * Every host speaks the same OpenAI-style API, so the only differences are
 * the address, the key, the model names and one detail of the search
 * (embedding) request. WRITER_HOSTS and SEARCH_HOSTS in .env give the order
 * to try them in; a host without a key is left out.
 *
 *   nvidia     NVIDIA Build: free trial, unpublished limits (the original host)
 *   deepinfra  DeepInfra: paid, the same Nemotron models, keeps no prompts
 */
import type { AppConfig } from "../../config/env.js";

export type HostId = "nvidia" | "deepinfra";

export interface Host {
  id: HostId;
  /** How the host is named in messages to the teacher and in the logs. */
  label: string;
  apiKey: string;
  baseUrl: string;
  /** The .env setting that holds the key (named in error messages). */
  keyName: string;
  writeModel: string;
  embedModel: string;
  /**
   * How a search request says whether its text is a question or a passage:
   * NVIDIA uses input_type "query"/"passage", DeepInfra uses task
   * "search_query"/"document". The resulting vectors are meant to be the same.
   */
  embedStyle: "input_type" | "task";
}

export function allHosts(config: AppConfig): Record<HostId, Host> {
  return {
    nvidia: {
      id: "nvidia", label: "NVIDIA", apiKey: config.nvidia.apiKey, baseUrl: config.nvidia.baseUrl, keyName: "NVIDIA_API_KEY",
      writeModel: config.nvidia.model, embedModel: config.nvidia.embeddingModel, embedStyle: "input_type",
    },
    deepinfra: {
      id: "deepinfra", label: "DeepInfra", apiKey: config.deepinfra.apiKey, baseUrl: config.deepinfra.baseUrl, keyName: "DEEPINFRA_API_KEY",
      writeModel: config.deepinfra.model, embedModel: config.deepinfra.embeddingModel, embedStyle: "task",
    },
  };
}

/** The hosts named in `order` (e.g. ["deepinfra", "nvidia"]) that have a key, in that order. */
export function hostsInOrder(config: AppConfig, order: string[]): Host[] {
  const hosts = allHosts(config);
  const seen = new Set<string>();
  return order
    .filter((id): id is HostId => id in hosts && !seen.has(id) && Boolean(seen.add(id)))
    .map((id) => hosts[id])
    .filter((h) => h.apiKey);
}

/**
 * Remembers which hosts failed recently. A host that fails is tried last for
 * the next 2 minutes, so one outage does not slow every teacher's request
 * down with a doomed first attempt. It is still tried if all others fail.
 */
export class HostHealth {
  private failedUntil = new Map<string, number>();

  constructor(private coolDownMs = 120_000, private now: () => number = Date.now) {}

  fail(id: string): void {
    this.failedUntil.set(id, this.now() + this.coolDownMs);
  }

  ok(id: string): void {
    this.failedUntil.delete(id);
  }

  isCooling(id: string): boolean {
    return (this.failedUntil.get(id) ?? 0) > this.now();
  }

  /** Healthy hosts first (in their configured order), then the cooling ones. */
  order<T extends { hostId: string }>(items: T[]): T[] {
    return [...items.filter((i) => !this.isCooling(i.hostId)), ...items.filter((i) => this.isCooling(i.hostId))];
  }
}
