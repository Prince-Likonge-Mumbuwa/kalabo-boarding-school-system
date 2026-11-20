/**
 * /api/teacher — what the school app's AI Tools pages call. Every request
 * carries the teacher's sign-in token (checked by `requireTeacher`).
 *
 *   POST   /session      "I have opened AI Tools": which tools are on, may I use them,
 *                        which subjects/levels have material, how many generations are left today
 *   POST   /usage        "I opened this tool" (for the superAdmin's usage view)
 *   POST   /generate     write a document; the reply is a stream of JSON lines (see below)
 *   GET    /curriculum-map?subject=&level=   the topics and sub-topics for one class (for dropdowns), from an
 *                        approved syllabus map or a teaching module, plus each sub-topic's module activities
 *   (POST /generate with a lesson plan's inputs.followUpOf + followUpKind writes a remedial or continuation lesson)
 *   POST   /efile/:id/evaluation/draft   after the lesson: the teacher's answers -> an evaluation statement (not saved)
 *   PUT    /efile/:id/evaluation         save the (edited) statement into the lesson plan
 *   GET    /efile        the teacher's saved documents (without their text)
 *   GET    /efile/:id    one saved document
 *   DELETE /efile/:id    remove a saved document
 *   GET    /efile-file                  the rest of the Teacher's File: Teacher's Details and the teacher's own entries
 *   PUT    /efile-file/profile          save the Teacher's Details
 *   POST   /efile-file/entries          add an entry to a section (CPD record, observation report…)
 *   PUT    /efile-file/entries/:id      change an entry;  DELETE /efile-file/entries/:id  remove it
 *   POST   /efile-file/scans            a scanned paper (multipart: "pages" pictures + "details" JSON): a marked
 *                                       script (highest/average/lowest) or the teacher's own question paper
 *   GET    /efile-file/scans/:id/pages/:n   one page (JPEG);  DELETE /efile-file/scans/:id  remove the scan
 *   GET    /figures?subject=&level=   the teacher's diagram library (own pictures and shared ones)
 *   POST   /figures      upload a picture (multipart: "image" + "details" JSON); it is cleaned up and saved
 *   GET    /figures/:id  one picture's details;  GET /figures/:id/image  the cleaned picture (PNG)
 *   PUT    /figures/:id  change its details (owner only);  DELETE /figures/:id  remove it (owner only)
 *   POST   /figures/:id/suggest   the vision model suggests a title, tags and labels (nothing saved)
 *
 * /generate replies with one JSON object per line, in this order:
 *   { "type": "meta", "title", "sources", "model" }   the curriculum search finished
 *   { "type": "text", "text" }                        a piece of the document (many)
 *   { "type": "status", "message" }                   assessments with figures: "Checking diagrams…"
 *                                                     (the saved document then has the checked figures)
 *   { "type": "done", "document" }                    saved to the eFile
 *   { "type": "error", "message", "code" }            something failed (instead of "done")
 */
import { Router, type Response } from "express";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import type { Services } from "../container.js";
import { requireTeacher, teacherOf } from "../middleware/auth.js";
import { toClientError } from "../middleware/errorHandler.js";
import { hasAccess } from "../services/AccessService.js";
import { followUpContext, followUpTitle, type FollowUpKind } from "../services/generation/followUp.js";
import { resolveCurriculum } from "../services/curriculum/TeachingModuleService.js";
import { EVALUATION_SYSTEM, GENERATORS, type EvaluationAnswers, type GeneratorKey, buildEvaluationMessage } from "../services/generation/prompts.js";
import { parseSections } from "../services/generation/syllabusContext.js";
import { loadGeoNames } from "../services/figures/geoNames.js";
import { hasFigures, processFigures } from "../services/figures/process.js";
import type { FigureDetails } from "../services/figures/FigureLibrary.js";
import { EFILE_AI_SECTIONS, EFILE_SECTION_IDS, FEATURE_KEYS, type FeatureKey } from "../types.js";
import { AppError, isAbortError, logError } from "../utils/errors.js";

const sessionSchema = z.object({ name: z.string().trim().max(120).optional() });
const usageSchema = z.object({ feature: z.enum(FEATURE_KEYS) });
const generateSchema = z.object({
  feature: z.enum(Object.keys(GENERATORS) as [GeneratorKey, ...GeneratorKey[]]),
  inputs: z.record(z.string(), z.string().trim().max(4000)),
});
const idSchema = z.uuid();
const mapQuerySchema = z.object({ subject: z.string().trim().min(1).max(80), level: z.string().trim().min(1).max(40) });
const note = z.string().trim().max(1500).default("");
const choices = z.array(z.string().trim().min(1).max(200)).max(20).default([]);
const answersSchema = z.object({
  achieved: z.enum(["fully", "mostly", "partly", "not"]),
  reached: z.enum(["all", "most", "half", "few"]),
  evidence: note,
  engaging: choices,
  engagingNote: note,
  coverage: z.enum(["all", "most", "part"]),
  notCovered: note,
  challenges: choices,
  challengesNote: note,
  support: note,
  nextSteps: choices,
  nextNote: note,
});
const labelSchema = z.object({ letter: z.string().trim().min(1).max(3), x: z.number().min(0).max(1), y: z.number().min(0).max(1), meaning: z.string().trim().max(160).optional() });
const figureDetailsSchema = z.object({
  title: z.string().trim().min(1, "Give the picture a title.").max(120),
  description: z.string().trim().max(400).default(""),
  subject: z.string().trim().max(80).default(""),
  level: z.string().trim().max(40).default(""),
  topic: z.string().trim().max(160).default(""),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  labels: z.array(labelSchema).max(26).default([]),
  shared: z.boolean().default(false),
});
const uploadSchema = z.object({
  details: figureDetailsSchema,
  crop: z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() }).optional(),
  threshold: z.boolean().optional(),
});
const figureQuerySchema = z.object({ subject: z.string().trim().max(80).optional(), level: z.string().trim().max(40).optional() });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1 } });
// Scanned papers: up to 12 pages, each already made small in the browser (~150–300 KB).
const scanUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 12 } });

const saveEvaluationSchema = z.object({ answers: answersSchema, statement: z.string().trim().min(20, "The evaluation is too short.").max(4000) });

export function teacherRoutes({ config, teacherVerifier, settings, access, usage, curriculum, maps, modules, generation, efile, figures, vision }: Services): Router {
  const router = Router();
  router.use(requireTeacher(teacherVerifier));
  // Only one document at a time per teacher, so a double click cannot be billed twice.
  const busy = new Set<string>();

  /** Refuses unless the tool is on, the teacher has access and (for generation) is under the daily limit. */
  const check = async (res: Response, feature: FeatureKey, generating: boolean) => {
    const teacher = teacherOf(res);
    const current = await settings.get();
    const record = await access.touch(teacher, "");
    if (!current.features[feature].enabled || !hasAccess(record.access, current.accessMode))
      throw new AppError(403, "This AI tool is not available to you.", "forbidden");
    if (generating && current.dailyLimit > 0 && (await usage.generatedToday(teacher.uid)) >= current.dailyLimit)
      throw new AppError(429, `You have reached today's limit of ${current.dailyLimit} documents. Try again tomorrow.`, "daily_limit");
    return teacher;
  };

  /**
   * A lesson plan with followUpOf / followUpKind is a remedial or continuation
   * lesson: the earlier plan must be the teacher's own, evaluated, and not
   * already followed up.
   */
  const checkFollowUp = async (uid: string, feature: GeneratorKey, inputs: Record<string, string>): Promise<FollowUpKind | null> => {
    if (!inputs.followUpOf && !inputs.followUpKind) return null;
    const kind = inputs.followUpKind;
    if (feature !== "lessonPlan" || (kind !== "remedial" && kind !== "continuation") || !idSchema.safeParse(inputs.followUpOf).success)
      throw new AppError(400, "A follow-up lesson needs the earlier lesson plan and whether it is remedial or a continuation.", "bad_follow_up");
    const original = await efile.get(uid, inputs.followUpOf!);
    if (original.feature !== "lessonPlan" || !original.evaluation)
      throw new AppError(400, "Evaluate the lesson first: the follow-up lesson is written from its evaluation.", "not_evaluated");
    if (original.followUp) throw new AppError(409, "A follow-up lesson has already been written for this lesson. Open it from the eFile.", "already_followed_up");
    return kind;
  };

  router.post("/session", async (req, res) => {
    const { name } = sessionSchema.parse(req.body ?? {});
    const teacher = teacherOf(res);
    const record = await access.touch(teacher, name ?? "");
    const current = await settings.get();
    const used = await usage.generatedToday(teacher.uid);
    res.json({
      features: current.features,
      accessState: record.access,
      hasAccess: hasAccess(record.access, current.accessMode),
      catalog: await curriculum.catalog(),
      // Subjects with topic dropdowns: an approved syllabus map or a teaching module.
      maps: mergeCoverage([...(await maps.approvedCoverage()), ...(await modules.coverage())]),
      dailyLimit: current.dailyLimit,
      remainingToday: current.dailyLimit > 0 ? Math.max(0, current.dailyLimit - used) : null,
    });
  });

  router.post("/usage", async (req, res) => {
    const { feature } = usageSchema.parse(req.body);
    const teacher = await check(res, feature, false);
    await usage.record(teacher.uid, feature, "opened");
    res.status(204).end();
  });

  router.post("/generate", async (req, res) => {
    // Anything that fails up to the first line is an ordinary JSON error reply.
    const { feature, inputs } = generateSchema.parse(req.body);
    for (const field of ["subject", "level", ...GENERATORS[feature].fields])
      if (!inputs[field]) throw new AppError(400, `Fill in every box before generating (missing: ${field}).`, "missing_field");
    if (feature === "assessment") parseSections(inputs); // a wrong section plan is refused before anything starts
    const teacher = await check(res, feature, true);
    const followUpKind = await checkFollowUp(teacher.uid, feature, inputs);
    if (busy.has(teacher.uid)) throw new AppError(409, "Your previous document is still being written. Wait for it to finish.", "busy");
    busy.add(teacher.uid);

    res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
    const send = (data: unknown) => {
      if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(data)}\n`);
    };

    // If the browser disconnects (Stop button, closed tab), cancel the NVIDIA call.
    const controller = new AbortController();
    let finished = false;
    res.on("close", () => {
      if (!finished) controller.abort();
    });

    try {
      // Pictures the teacher picked from the diagram library, described for the AI.
      const picked = feature === "assessment" && inputs.figureIds
        ? (await Promise.all(inputs.figureIds.split(",").map((id) => figures.find(teacher.uid, id.trim())))).filter((f) => f !== null)
        : [];
      const geo = feature === "assessment" && inputs.diagrams && inputs.diagrams !== "none" ? await loadGeoNames(config.geoDir) : null;
      // A remedial or continuation lesson is written from the earlier plan and its evaluation.
      const original = followUpKind ? await efile.get(teacher.uid, inputs.followUpOf!) : null;
      const prepared = await generation.prepare(feature, inputs, controller.signal, {
        library: picked.map((f) => ({ id: f.id, title: f.title, description: f.description, labels: f.labels.map((l) => ({ letter: l.letter, meaning: l.meaning ?? "" })) })),
        historyPlaces: geo?.historyPlaces.map((p) => p.name) ?? [],
      }, original ? followUpContext(original) : "");
      if (original && followUpKind) prepared.title = followUpTitle(followUpKind, original.title);
      send({ type: "meta", title: prepared.title, sources: prepared.sources, model: generation.writer.model });
      if (prepared.notice) send({ type: "notice", message: prepared.notice });

      let content = "";
      for await (const text of generation.stream(prepared.request)) {
        if (controller.signal.aborted) break;
        content += text;
        send({ type: "text", text });
      }
      if (controller.signal.aborted) return; // stopped: nothing is saved or counted

      content = content.trim();
      if (!content) throw new AppError(502, "NVIDIA Nemotron returned an empty document. Try again.", "empty_answer");
      if (feature === "assessment" && hasFigures(content)) {
        send({ type: "status", message: "Checking diagrams…" });
        const report = await processFigures(content, {
          geo: await loadGeoNames(config.geoDir),
          picture: async (id) => figures.find(teacher.uid, id),
          pubchem: true,
        }, { writer: generation.writer, signal: controller.signal, onStatus: (message) => send({ type: "status", message }) });
        if (controller.signal.aborted) return;
        content = report.content;
        if (report.keyFixes?.length) send({ type: "status", message: `Corrected ${report.keyFixes.length} marking-key answer${report.keyFixes.length === 1 ? "" : "s"} to match the diagrams.` });
      }
      const document = await efile.add(teacher.uid, {
        feature,
        title: prepared.title,
        inputs,
        content,
        sources: prepared.sources,
        model: generation.writer.model,
      });
      if (original && followUpKind) await efile.setFollowUp(teacher.uid, original.id, { id: document.id, kind: followUpKind, createdAt: document.createdAt });
      await usage.record(teacher.uid, feature, "generated");
      send({ type: "done", document });
    } catch (err) {
      if (!(isAbortError(err) || controller.signal.aborted)) {
        const { message, code, status } = toClientError(err);
        if (status >= 500) logError("generate", err);
        send({ type: "error", message, code });
      }
    } finally {
      finished = true;
      busy.delete(teacher.uid);
      res.end();
    }
  });

  // The eFile needs only access, not the eFile switch: a teacher must always
  // be able to see documents they generated.
  const requireAccess = async (res: Response) => {
    const teacher = teacherOf(res);
    const record = await access.touch(teacher, "");
    if (!hasAccess(record.access, (await settings.get()).accessMode))
      throw new AppError(403, "The AI tools are not available to you.", "forbidden");
    return teacher;
  };
  const idOf = (raw: unknown) => {
    const id = idSchema.safeParse(raw);
    if (!id.success) throw new AppError(404, "Document not found in your eFile.", "not_found");
    return id.data;
  };

  router.get("/curriculum-map", async (req, res) => {
    await requireAccess(res);
    const { subject, level } = mapQuerySchema.parse(req.query);
    const map = await resolveCurriculum(maps, modules, subject, level);
    // For each sub-topic, the teaching module's activities (the lesson plan's activity checklist).
    const guides: Record<string, { documentName: string; subTopic: string; activities: { number: number; title: string; page: number }[] }> = {};
    if (map)
      for (const topic of map.topics)
        for (const sub of topic.subTopics) {
          const guide = await modules.guideFor(subject, level, sub, map.subject);
          if (guide)
            guides[sub.code] = {
              documentName: guide.documentName,
              subTopic: `${guide.sub.code} ${guide.sub.name}`,
              activities: guide.sub.activities.map((a) => ({ number: a.number, title: a.title, page: a.page })),
            };
        }
    res.json({ map: map ? { ...map, guides } : null });
  });

  // ── Lesson evaluation (after the lesson) ──
  const lessonPlanOf = async (res: Response, id: string) => {
    const teacher = await requireAccess(res);
    const current = await settings.get();
    if (!current.features.lessonPlan.enabled) throw new AppError(403, "The lesson plan tool is switched off.", "forbidden");
    const document = await efile.get(teacher.uid, id);
    if (document.feature !== "lessonPlan") throw new AppError(400, "Only lesson plans are evaluated.", "not_a_lesson_plan");
    return { teacher, document };
  };

  router.post("/efile/:id/evaluation/draft", async (req, res) => {
    const answers = answersSchema.parse(req.body?.answers) as EvaluationAnswers;
    const { teacher, document } = await lessonPlanOf(res, idOf(req.params.id));
    if (busy.has(teacher.uid)) throw new AppError(409, "Your previous document is still being written. Wait for it to finish.", "busy");
    busy.add(teacher.uid);
    try {
      const statement = (await generation.writer.generate({ system: EVALUATION_SYSTEM, user: buildEvaluationMessage(document, answers) })).trim();
      if (!statement) throw new AppError(502, "NVIDIA Nemotron returned an empty evaluation. Try again.", "empty_answer");
      res.json({ statement });
    } finally {
      busy.delete(teacher.uid);
    }
  });

  router.put("/efile/:id/evaluation", async (req, res) => {
    const { answers, statement } = saveEvaluationSchema.parse(req.body);
    const { teacher, document } = await lessonPlanOf(res, idOf(req.params.id));
    res.json(await efile.setEvaluation(teacher.uid, document.id, { answers, statement, evaluatedAt: new Date().toISOString() }));
  });

  // ── Diagram library ─────────────────────────────────────────────────────
  router.get("/figures", async (req, res) => {
    const teacher = await check(res, "assessment", false);
    const list = await figures.list(teacher.uid, figureQuerySchema.parse(req.query));
    res.json({ figures: list.map((f) => ({ ...f, mine: f.ownerUid === teacher.uid })) });
  });

  router.post("/figures", upload.single("image"), async (req, res) => {
    const teacher = await check(res, "assessment", false);
    if (!req.file) throw new AppError(400, "Choose a picture to upload.", "missing_file");
    let raw: unknown;
    try { raw = JSON.parse(String(req.body?.details ?? "{}")); } catch { throw new AppError(400, "The picture's details could not be read.", "bad_details"); }
    const { details, crop, threshold } = uploadSchema.parse(raw);
    const record = await access.touch(teacher, "");
    res.status(201).json({ ...(await figures.add({ uid: teacher.uid, name: record.name }, req.file.buffer, details as FigureDetails, { crop, threshold })), mine: true });
  });

  router.get("/figures/:id", async (req, res) => {
    const teacher = await check(res, "assessment", false);
    res.json(await figures.get(teacher.uid, idSchema.parse(req.params.id)));
  });

  router.get("/figures/:id/image", async (req, res) => {
    const teacher = await check(res, "assessment", false);
    const image = await figures.image(teacher.uid, idSchema.parse(req.params.id));
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.end(image);
  });

  router.put("/figures/:id", async (req, res) => {
    const teacher = await check(res, "assessment", false);
    res.json({ ...(await figures.update(teacher.uid, idSchema.parse(req.params.id), figureDetailsSchema.partial().parse(req.body) as Partial<FigureDetails>)), mine: true });
  });

  router.delete("/figures/:id", async (req, res) => {
    const teacher = await check(res, "assessment", false);
    await figures.remove(teacher.uid, idSchema.parse(req.params.id));
    res.status(204).end();
  });

  router.post("/figures/:id/suggest", async (req, res) => {
    const teacher = await check(res, "assessment", false);
    const f = await figures.get(teacher.uid, idSchema.parse(req.params.id));
    res.json(await vision.suggest(await figures.image(teacher.uid, f.id), { subject: f.subject, level: f.level }));
  });

  // ── The rest of the Teacher's File: personal record and the teacher's own entries ──
  router.get("/efile-file", async (_req, res) => {
    res.json(await efile.meta((await requireAccess(res)).uid));
  });

  router.put("/efile-file/profile", async (req, res) => {
    const profile = profileSchema.parse(req.body?.profile ?? {});
    res.json({ profile: await efile.setProfile((await requireAccess(res)).uid, profile) });
  });

  router.post("/efile-file/entries", async (req, res) => {
    const entry = entrySchema.parse(req.body);
    res.status(201).json(await efile.addEntry((await requireAccess(res)).uid, entry));
  });

  router.put("/efile-file/entries/:id", async (req, res) => {
    const change = entrySchema.partial().parse(req.body);
    res.json(await efile.updateEntry((await requireAccess(res)).uid, idOf(req.params.id), change));
  });

  router.delete("/efile-file/entries/:id", async (req, res) => {
    await efile.removeEntry((await requireAccess(res)).uid, idOf(req.params.id));
    res.status(204).end();
  });

  // ── Scanned papers: marked scripts (highest, average, lowest) and own question papers ──
  router.post("/efile-file/scans", scanUpload.array("pages", 12), async (req, res) => {
    const teacher = await requireAccess(res);
    let raw: unknown;
    try { raw = JSON.parse(String(req.body?.details ?? "{}")); } catch { throw new AppError(400, "The scan's details could not be read.", "bad_details"); }
    const details = scanSchema.parse(raw);
    if (details.assessmentId) {
      const a = await efile.get(teacher.uid, details.assessmentId);
      if (a.feature !== "assessment") throw new AppError(400, "Scripts belong to an assessment.", "not_an_assessment");
    }
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    // Each page: turned upright, at most 1600 px, JPEG (keeps the red marking ink).
    const pages = await Promise.all(files.map(async (f) => {
      try { return await sharp(f.buffer).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toBuffer(); }
      catch { throw new AppError(400, `"${f.originalname}" is not a picture that can be read.`, "bad_image"); }
    }));
    res.status(201).json(await efile.addScan(teacher.uid, details, pages));
  });

  router.get("/efile-file/scans/:id/pages/:n", async (req, res) => {
    const teacher = await requireAccess(res);
    const page = await efile.scanPage(teacher.uid, idOf(req.params.id), Number(req.params.n));
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.end(page);
  });

  router.delete("/efile-file/scans/:id", async (req, res) => {
    await efile.removeScan((await requireAccess(res)).uid, idOf(req.params.id));
    res.status(204).end();
  });

  router.get("/efile", async (_req, res) => {
    res.json({ documents: await efile.list((await requireAccess(res)).uid) });
  });

  router.get("/efile/:id", async (req, res) => {
    res.json(await efile.get((await requireAccess(res)).uid, idOf(req.params.id)));
  });

  router.delete("/efile/:id", async (req, res) => {
    await efile.remove((await requireAccess(res)).uid, idOf(req.params.id));
    res.status(204).end();
  });

  return router;
}

const profileSchema = z.record(z.string().max(40), z.string().max(400)).refine((p) => Object.keys(p).length <= 40, "Too many fields.");
const entrySchema = z.object({
  section: z.enum(EFILE_SECTION_IDS).refine((s) => !EFILE_AI_SECTIONS.includes(s), "That section is filled by your AI documents."),
  title: z.string().trim().min(1).max(200),
  content: z.string().max(60000),
  date: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
});

const scanSchema = z.object({
  section: z.enum(["scriptSamples", "questionSamples"]),
  assessmentId: z.uuid().optional(),
  title: z.string().trim().min(1).max(200),
  slot: z.enum(["highest", "average", "lowest"]).optional(),
  learner: z.string().trim().max(120).optional(),
  mark: z.number().min(0).max(1000).optional(),
  outOf: z.number().positive().max(1000).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine((s) => s.section !== "scriptSamples" || (s.slot && s.learner), "A marked script needs the learner and whether it is the highest, average or lowest mark.");

/** One entry per subject, with every Form any source covers. */
function mergeCoverage(entries: { subject: string; forms: number[] }[]): { subject: string; forms: number[] }[] {
  const bySubject = new Map<string, Set<number>>();
  for (const e of entries) {
    const set = bySubject.get(e.subject) ?? new Set<number>();
    for (const f of e.forms) set.add(f);
    bySubject.set(e.subject, set);
  }
  return [...bySubject].map(([subject, forms]) => ({ subject, forms: [...forms].sort((a, b) => a - b) }));
}
