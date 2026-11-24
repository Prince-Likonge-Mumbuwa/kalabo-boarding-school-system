/**
 * Loads ai-server/.env and turns it into one typed `config` object. Every
 * setting the AI server uses is read here and nowhere else.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
/** The ai-server/ folder (two levels up from src/config). */
export const AI_SERVER_ROOT = path.resolve(here, "../..");

dotenv.config({ path: path.join(AI_SERVER_ROOT, ".env"), quiet: true });

const str = (name: string, fallback = "") => (process.env[name] ?? "").trim() || fallback;
const list = (name: string, fallback: string) => str(name, fallback).split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
const num = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && process.env[name]?.trim() ? value : fallback;
};

/** The jobs the writer does, and how much thinking and text each needs. */
export const JOBS = ["lessonPlan", "schemeOfWork", "assessment", "recordOfWork", "keyCheck", "evaluation", "workPlan", "syllabusGrid", "figureRepair", "remedialWork"] as const;
export type Job = (typeof JOBS)[number];
export type Effort = "off" | "low" | "full";
const JOB_DEFAULTS: Record<Job, { effort: Effort; maxTokens: number; fast: boolean }> = {
  // Assessments think a little; their key is then re-solved with full thinking (keyCheck).
  assessment: { effort: "low", maxTokens: 14000, fast: false },
  keyCheck: { effort: "full", maxTokens: 14000, fast: false },
  lessonPlan: { effort: "off", maxTokens: 6000, fast: false },
  schemeOfWork: { effort: "off", maxTokens: 9000, fast: false },
  recordOfWork: { effort: "off", maxTokens: 4000, fast: true },
  evaluation: { effort: "off", maxTokens: 1200, fast: true },
  remedialWork: { effort: "off", maxTokens: 1800, fast: true },
  workPlan: { effort: "off", maxTokens: 5000, fast: true },
  syllabusGrid: { effort: "off", maxTokens: 12000, fast: false },
  figureRepair: { effort: "low", maxTokens: 4000, fast: false },
};
function jobSettings(effort: string, tokens: string): Record<Job, { effort: Effort; maxTokens: number; fast: boolean }> {
  const out = structuredClone(JOB_DEFAULTS);
  const pairs = (text: string) => text.split(",").map((p) => p.split("=").map((x) => x.trim())).filter(([k, v]) => k && v && k in out) as [Job, string][];
  for (const [job, v] of pairs(effort)) if (v === "off" || v === "low" || v === "full") out[job].effort = v;
  for (const [job, v] of pairs(tokens)) if (Number(v) > 0) out[job].maxTokens = Math.round(Number(v));
  return out;
}

export const config = {
  port: num("PORT", 5050),
  /** Web addresses allowed to call this server from a browser. */
  clientOrigins: str("CLIENT_ORIGIN", "http://localhost:8080").split(",").map((o) => o.trim()).filter(Boolean),
  firebaseProjectId: str("FIREBASE_PROJECT_ID"),
  dataDir: path.resolve(AI_SERVER_ROOT, str("DATA_DIR", "./storage")),
  maxFileSizeMb: num("MAX_FILE_SIZE_MB", 25),
  sessionHours: num("SESSION_HOURS", 8),

  nvidia: {
    apiKey: str("NVIDIA_API_KEY"),
    baseUrl: str("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"),
    /**
     * The model that writes the documents. Several may be listed, separated by
     * commas: when NVIDIA retires one, the next is used automatically.
     */
    model: str("NVIDIA_MODEL", "nvidia/nemotron-3.5-super-vl-120b-a12b,nvidia/nemotron-3-super-120b-a12b"),
    /** The model that turns text into embeddings for search. */
    embeddingModel: str("NVIDIA_EMBEDDING_MODEL", "nvidia/nemotron-3-embed-1b"),
    /** The model that looks at uploaded diagrams and suggests their details. */
    visionModel: str("NVIDIA_VISION_MODEL", "nvidia/nemotron-nano-12b-v2-vl"),
    maxTokens: num("NVIDIA_MAX_TOKENS", 16000),
    temperature: num("GENERATION_TEMPERATURE", 0.3),
  },

  /**
   * DeepInfra: a paid host for the same Nemotron models (cheaper than the
   * median, keeps no prompts). Used when DEEPINFRA_API_KEY is set.
   */
  deepinfra: {
    apiKey: str("DEEPINFRA_API_KEY"),
    baseUrl: str("DEEPINFRA_BASE_URL", "https://api.deepinfra.com/v1/openai"),
    /** Several may be listed, separated by commas: the next is used if DeepInfra retires one. */
    model: str("DEEPINFRA_MODEL", "nvidia/NVIDIA-Nemotron-3.5-Super-VL,nvidia/NVIDIA-Nemotron-3-Super-120B-A12B"),
    embeddingModel: str("DEEPINFRA_EMBEDDING_MODEL", "nvidia/Nemotron-3.5-Embed-1B-BF16"),
  },

  /**
   * Which hosts to try, in order. A host without a key is skipped; when one
   * fails (busy, out of credit, down) the next is tried.
   * Search stays on NVIDIA until "npm run check-deepinfra" shows DeepInfra's
   * search model gives the same results as the index was built with.
   */
  writerHosts: list("WRITER_HOSTS", "deepinfra,nvidia"),
  searchHosts: list("SEARCH_HOSTS", "nvidia"),

  /**
   * Speed. Each job the AI does gets its own amount of "thinking" (off, low,
   * full) and its own word limit, so quick jobs are quick:
   *   AI_EFFORT=assessment=low,keyCheck=full,lessonPlan=off   (override any of them)
   *   AI_MAX_TOKENS=assessment=14000,lessonPlan=6000
   * NVIDIA_FAST_MODEL (optional): a smaller model for the light jobs
   * (evaluations, records of work, work plans, figure repairs).
   * WRITER_CONCURRENCY: documents written at the same time; more teachers
   * wait in a queue and see their place in it (NVIDIA's free tier allows few).
   */
  jobs: jobSettings(str("AI_EFFORT"), str("AI_MAX_TOKENS")),
  fastModel: str("NVIDIA_FAST_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b"),
  writerConcurrency: Math.max(1, num("WRITER_CONCURRENCY", 4)),

  chromaUrl: str("CHROMA_URL", "http://localhost:8100"),
  chromaCollection: str("CHROMA_COLLECTION", "kalabo_curriculum"),

  /** The school app's map data (public/geo), used to check maps in assessments. */
  geoDir: path.resolve(AI_SERVER_ROOT, str("GEO_DIR", "../public/geo")),

  chunkSize: num("CHUNK_SIZE", 1000),
  chunkOverlap: num("CHUNK_OVERLAP", 200),
};

export type AppConfig = typeof config;
