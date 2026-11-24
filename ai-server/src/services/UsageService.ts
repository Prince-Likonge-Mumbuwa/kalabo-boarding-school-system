/**
 * A simple log of who used which AI tool and when (storage/usage.json).
 * It records each tool being opened and each document generated. The daily
 * limit (and later the paywall) counts the "generated" entries.
 */
import path from "node:path";
import { FEATURE_KEYS, type FeatureKey, type UsageEvent } from "../types.js";
import { JsonStore } from "../utils/JsonStore.js";

const MAX_EVENTS = 20_000; // oldest entries are dropped beyond this

export interface UsageSummary {
  total: number;
  last30Days: number;
  /** Documents generated (each one is a paid NVIDIA call). */
  generated: number;
  generatedLast30Days: number;
  byFeature: Record<FeatureKey, number>;
  byTeacher: { uid: string; count: number; lastAt: string }[];
}

export class UsageService {
  private store: JsonStore<UsageEvent[]>;

  constructor(dataDir: string) {
    this.store = new JsonStore(path.join(dataDir, "usage.json"), () => [], { pretty: false });
  }

  record(uid: string, feature: FeatureKey, action: UsageEvent["action"]): Promise<void> {
    return this.store.update((events) => {
      events.push({ at: new Date().toISOString(), uid, feature, action });
      if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    });
  }

  /** How many documents this teacher has generated since midnight (server time). */
  async generatedToday(uid: string): Promise<number> {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const since = midnight.toISOString();
    return (await this.store.read()).filter((e) => e.uid === uid && e.action === "generated" && e.at >= since).length;
  }

  async summary(): Promise<UsageSummary> {
    const events = await this.store.read();
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const byFeature = Object.fromEntries(FEATURE_KEYS.map((k) => [k, 0])) as Record<FeatureKey, number>;
    const teachers = new Map<string, { uid: string; count: number; lastAt: string }>();
    for (const event of events) {
      byFeature[event.feature] = (byFeature[event.feature] ?? 0) + 1;
      const row = teachers.get(event.uid) ?? { uid: event.uid, count: 0, lastAt: event.at };
      row.count += 1;
      if (event.at > row.lastAt) row.lastAt = event.at;
      teachers.set(event.uid, row);
    }
    const generated = events.filter((e) => e.action === "generated");
    return {
      total: events.length,
      last30Days: events.filter((e) => e.at >= since).length,
      generated: generated.length,
      generatedLast30Days: generated.filter((e) => e.at >= since).length,
      byFeature,
      byTeacher: [...teachers.values()].sort((a, b) => b.count - a.count),
    };
  }
}
