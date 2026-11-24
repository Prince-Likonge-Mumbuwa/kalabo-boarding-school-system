/**
 * Builds every service once and hands them to the routes as one bundle.
 * Tests can swap in fakes for the parts that call the outside world: the
 * Google sign-in check, the AI hosts (embeddings and writing) and ChromaDB.
 */
import type { AppConfig } from "./config/env.js";
import { AccessService } from "./services/AccessService.js";
import { type Writer, createWriter } from "./services/ai/NemotronProvider.js";
import { CurriculumService } from "./services/CurriculumService.js";
import { CurriculumMapService } from "./services/curriculum/CurriculumMapService.js";
import { looksLikeModule } from "./services/curriculum/ModuleParser.js";
import { TeachingModuleService } from "./services/curriculum/TeachingModuleService.js";
import { EFileService } from "./services/EFileService.js";
import { FinanceService } from "./services/FinanceService.js";
import { FigureLibrary } from "./services/figures/FigureLibrary.js";
import { VisionService } from "./services/ai/VisionService.js";
import { GenerationService } from "./services/generation/GenerationService.js";
import { DocumentChunker } from "./services/rag/DocumentChunker.js";
import { type Embedder, createEmbedder } from "./services/rag/EmbeddingService.js";
import { IndexingService } from "./services/rag/IndexingService.js";
import { PDFProcessor } from "./services/rag/PDFProcessor.js";
import { RetrievalService } from "./services/rag/RetrievalService.js";
import { type VectorStore, VectorStoreService } from "./services/rag/VectorStoreService.js";
import { SettingsService } from "./services/SettingsService.js";
import { SuperAdminService } from "./services/SuperAdminService.js";
import { FirebaseTokenVerifier, type TeacherVerifier } from "./services/TeacherVerifier.js";
import { UsageService } from "./services/UsageService.js";

export interface Services {
  config: AppConfig;
  superAdmin: SuperAdminService;
  teacherVerifier: TeacherVerifier;
  settings: SettingsService;
  access: AccessService;
  curriculum: CurriculumService;
  maps: CurriculumMapService;
  modules: TeachingModuleService;
  pdf: PDFProcessor;
  usage: UsageService;
  embedder: Embedder;
  store: VectorStore;
  indexing: IndexingService;
  generation: GenerationService;
  efile: EFileService;
  finance: FinanceService;
  figures: FigureLibrary;
  vision: VisionService;
}

export interface Overrides {
  teacherVerifier?: TeacherVerifier;
  embedder?: Embedder;
  store?: VectorStore;
  writer?: Writer;
}

export function createServices(config: AppConfig, overrides: Overrides = {}): Services {
  const curriculum = new CurriculumService(config.dataDir);
  const maps = new CurriculumMapService(config.dataDir);
  const modules = new TeachingModuleService(config.dataDir);
  const pdf = new PDFProcessor();
  const embedder = overrides.embedder ?? createEmbedder(config);
  const store = overrides.store ?? new VectorStoreService(config);
  const indexing = new IndexingService(
    curriculum,
    pdf,
    new DocumentChunker(config.chunkSize, config.chunkOverlap),
    embedder,
    store,
    // A CDC teaching module (any type but a syllabus or past paper) is also read into a structured guide.
    async (documentId, buffer) => {
      const document = await curriculum.get(documentId);
      if (document.docType === "syllabus" || document.docType === "past_paper") return modules.removeForDocument(documentId);
      const pages = await pdf.extractItems(buffer);
      if (looksLikeModule(pages)) await modules.buildFromDocument(document, pages);
      else await modules.removeForDocument(documentId);
    },
  );
  const generation = new GenerationService(new RetrievalService(embedder, store), overrides.writer ?? createWriter(config), maps, modules);
  return {
    config,
    superAdmin: new SuperAdminService(config.dataDir, config.sessionHours),
    teacherVerifier: overrides.teacherVerifier ?? new FirebaseTokenVerifier(config.firebaseProjectId),
    settings: new SettingsService(config.dataDir),
    access: new AccessService(config.dataDir),
    curriculum,
    maps,
    modules,
    pdf,
    usage: new UsageService(config.dataDir),
    embedder,
    store,
    indexing,
    generation,
    efile: new EFileService(config.dataDir),
    finance: new FinanceService(config.dataDir),
    figures: new FigureLibrary(config.dataDir),
    vision: new VisionService(config),
  };
}
