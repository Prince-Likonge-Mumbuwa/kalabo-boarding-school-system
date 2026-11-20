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
    /** The model that writes the documents. */
    model: str("NVIDIA_MODEL", "nvidia/nemotron-3-super-120b-a12b"),
    /** The model that turns text into embeddings for search. */
    embeddingModel: str("NVIDIA_EMBEDDING_MODEL", "nvidia/nemotron-3.5-embed-1b"),
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
    model: str("DEEPINFRA_MODEL", "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B"),
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

  chromaUrl: str("CHROMA_URL", "http://localhost:8100"),
  chromaCollection: str("CHROMA_COLLECTION", "kalabo_curriculum"),

  /** The school app's map data (public/geo), used to check maps in assessments. */
  geoDir: path.resolve(AI_SERVER_ROOT, str("GEO_DIR", "../public/geo")),

  chunkSize: num("CHUNK_SIZE", 1000),
  chunkOverlap: num("CHUNK_OVERLAP", 200),
};

export type AppConfig = typeof config;
