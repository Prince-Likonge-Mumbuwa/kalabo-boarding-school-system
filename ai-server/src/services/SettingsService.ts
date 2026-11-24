/**
 * The superAdmin's switches (storage/settings.json): which AI tools are on,
 * whether access is by selection or open to all teachers, and the daily
 * generation limit per teacher.
 */
import path from "node:path";
import { type AiSettings, FEATURE_KEYS, type FeatureKey } from "../types.js";
import { JsonStore } from "../utils/JsonStore.js";

const defaults = (): AiSettings => ({
  // Everything starts OFF: a tool appears for teachers only when the superAdmin turns it on.
  features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, { enabled: false }])) as AiSettings["features"],
  accessMode: "selected",
  dailyLimit: 20,
});

export class SettingsService {
  private store: JsonStore<AiSettings>;

  constructor(dataDir: string) {
    this.store = new JsonStore(path.join(dataDir, "settings.json"), defaults);
  }

  async get(): Promise<AiSettings> {
    const saved = await this.store.read();
    // Fill in any tool added after the file was first saved.
    return { ...defaults(), ...saved, features: { ...defaults().features, ...saved.features } };
  }

  async update(patch: {
    features?: Partial<Record<FeatureKey, boolean>>;
    accessMode?: AiSettings["accessMode"];
    dailyLimit?: number;
  }): Promise<AiSettings> {
    await this.store.update((settings) => {
      for (const [key, enabled] of Object.entries(patch.features ?? {}))
        settings.features[key as FeatureKey] = { enabled: Boolean(enabled) };
      if (patch.accessMode) settings.accessMode = patch.accessMode;
      if (patch.dailyLimit !== undefined) settings.dailyLimit = Math.max(0, Math.floor(patch.dailyLimit));
    });
    return this.get();
  }
}
