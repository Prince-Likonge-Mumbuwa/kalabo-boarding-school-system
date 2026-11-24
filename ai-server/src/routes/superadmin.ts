/**
 * /api/superadmin — everything the superAdmin console does.
 *
 *   POST   /login                 email + password -> session token
 *   GET    /overview              settings, teachers, curriculum, usage and system status in one reply
 *   PUT    /settings              switch tools on/off, access mode, daily limit
 *   PUT    /teachers/:uid         grant or revoke a teacher's access
 *   POST   /curriculum            upload PDFs with their subject, class levels and type (indexing starts at once)
 *   PATCH  /curriculum/:id        correct a document's subject, levels or type (it is re-indexed)
 *   POST   /curriculum/:id/reindex  index one document again
 *   POST   /curriculum/reindex-all  index every document again (after changing the embedding model)
 *   DELETE /curriculum/:id        remove a document and its search entries
 *   GET    /curriculum/:id/file   open the PDF
 *   POST   /curriculum/:id/map    read a syllabus into a curriculum map (draft)
 *   GET    /maps/:id              one curriculum map, the whole tree
 *   PUT    /maps/:id              save corrections to a map's topics
 *   POST   /maps/:id/approve      { approved: true|false } — only approved maps reach teachers
 *   DELETE /maps/:id              remove a map (the syllabus document stays)
 *   POST   /curriculum/:id/module read a CDC teaching module again (also done automatically when it is indexed)
 *   GET    /modules/:id           one teaching module, everything that was read from it
 *   PUT    /modules/:id/active    { active: true|false } — switch a teaching module on or off
 *
 * Finances (see FinanceService; the books are also in GET /overview):
 *   POST   /finance/payments              record a teacher's term fee by hand
 *   POST   /finance/payments/:id/void     { reason } — take a payment out of the totals (it stays listed)
 *   POST   /finance/expenses              record a payment to a service provider
 *   POST   /finance/expenses/:id/void     { reason }
 *   PUT    /finance/fee                   { amount } — the fee for one term (ZMW)
 */
import fs from "node:fs";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { Services } from "../container.js";
import { requireSuperAdmin } from "../middleware/auth.js";
import { looksLikePdf, sanitizeFilename } from "../services/CurriculumService.js";
import { type CurriculumDocument, DOC_TYPES, FEATURE_KEYS, LEVELS } from "../types.js";
import { AppError, logError } from "../utils/errors.js";

const label = z.string().trim().min(1).max(80);
/**
 * The levels a document covers. From the upload form they arrive as JSON text
 * ('["Form 1","Form 2"]', because a file upload can only carry text fields);
 * from the edit request they arrive as a real list. Both are accepted.
 */
const levelsSchema = z.preprocess(
  (v) => (typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return v; } })() : v),
  z.array(z.enum(LEVELS)).min(1, "choose at least one class level").max(LEVELS.length),
);
const labelsSchema = z.object({ subject: label, levels: levelsSchema, docType: z.enum(DOC_TYPES) });
const loginSchema = z.object({ email: z.string().trim().min(3).max(200), password: z.string().min(1).max(200) });
const settingsSchema = z.object({
  features: z.partialRecord(z.enum(FEATURE_KEYS), z.boolean()).optional(),
  accessMode: z.enum(["selected", "all"]).optional(),
  dailyLimit: z.number().int().min(0).max(1000).optional(),
});
const accessSchema = z.object({ access: z.enum(["pending", "granted", "revoked"]) });
const idSchema = z.uuid();

// A curriculum map as the reviewer saves it. Limits keep a bad request from
// storing something huge; real syllabi are far below them.
const line = z.string().trim().max(2000);
const competenceSchema = z.object({
  code: z.string().trim().regex(/^\d{1,2}(\.\d{1,2}){3}$/, "competence codes look like 1.1.1.1"),
  text: line,
  activities: z.array(line).max(60),
  standards: z.array(line).max(30),
  page: z.number().int().min(0).max(5000).default(0),
});
const subTopicSchema = z.object({
  code: z.string().trim().regex(/^\d{1,2}(\.\d{1,2}){2}$/, "sub-topic codes look like 1.1.1"),
  name: z.string().trim().min(1, "every sub-topic needs a name").max(300),
  competences: z.array(competenceSchema).max(60),
});
const topicSchema = z.object({
  code: z.string().trim().regex(/^\d{1,2}\.\d{1,2}$/, "topic codes look like 1.1"),
  name: z.string().trim().min(1, "every topic needs a name").max(300),
  form: z.number().int().min(1).max(6),
  subTopics: z.array(subTopicSchema).max(60),
});
const mapTopicsSchema = z.object({ topics: z.array(topicSchema).max(200) });
const approveSchema = z.object({ approved: z.boolean() });

const activeSchema = z.object({ active: z.boolean() });

// Finances. Amounts are ZMW, at most 2 decimals; dates are YYYY-MM-DD.
const amountSchema = z.number().positive().max(10_000_000).transform((n) => Math.round(n * 100) / 100);
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dates look like 2026-11-24");
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);
const paymentSchema = z.object({
  teacherUid: z.string().trim().min(1).max(200),
  term: z.enum(["Term 1", "Term 2", "Term 3"]),
  year: z.number().int().min(2020).max(2100),
  amount: amountSchema.optional(),
  receivedOn: daySchema.optional(),
  reference: optionalText(120),
  note: optionalText(500),
});
const expenseSchema = z.object({
  paidOn: daySchema,
  provider: z.string().trim().min(1, "who was paid?").max(120),
  description: z.string().trim().min(1, "what was it for?").max(300),
  amount: amountSchema,
  reference: optionalText(120),
});
const voidSchema = z.object({ reason: z.string().trim().min(3, "give a short reason").max(300) });
const feeSchema = z.object({ amount: amountSchema });

export function superAdminRoutes({ config, superAdmin, settings, access, curriculum, maps, modules, pdf, usage, indexing, store, embedder, generation, finance }: Services): Router {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(), // held in memory just long enough to be checked
    limits: { fileSize: config.maxFileSizeMb * 1024 * 1024, files: 20 },
  });

  /** Reads the document's PDF into a draft curriculum map. */
  const readMap = async (document: CurriculumDocument) =>
    maps.buildFromDocument(document, await pdf.extractItems(await fs.promises.readFile(curriculum.filePath(document.id))));

  router.post("/login", async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    res.json(await superAdmin.login(email, password, req.ip ?? "unknown"));
  });

  // Everything below this line needs a valid superAdmin session.
  router.use(requireSuperAdmin(superAdmin));

  router.get("/overview", async (_req, res) => {
    const teachers = await access.list();
    res.json({
      settings: await settings.get(),
      teachers,
      finance: await finance.view(teachers),
      documents: await curriculum.list(),
      maps: await maps.list(),
      modules: await modules.list(),
      usage: await usage.summary(),
      system: {
        nvidiaConfigured: embedder.available && generation.writer.available,
        chatModel: generation.writer.model,
        embeddingModel: embedder.model,
        chroma: await store.health(),
      },
    });
  });

  router.put("/settings", async (req, res) => {
    res.json(await settings.update(settingsSchema.parse(req.body)));
  });

  // Granting access counts as the teacher paying the term fee (once per term; see FinanceService).
  router.put("/teachers/:uid", async (req, res) => {
    const uid = String(req.params.uid);
    const wanted = accessSchema.parse(req.body).access;
    const before = (await access.list()).find((t) => t.uid === uid)?.access;
    const teacher = await access.setAccess(uid, wanted);
    if (wanted === "granted" && before !== "granted") await finance.recordGrant(teacher);
    res.json(teacher);
  });

  router.post("/finance/payments", async (req, res) => {
    const input = paymentSchema.parse(req.body);
    const teacher = (await access.list()).find((t) => t.uid === input.teacherUid);
    if (!teacher) throw new AppError(404, "Teacher not found.", "not_found");
    res.json(await finance.addPayment({ ...input, teacher }));
  });

  router.post("/finance/payments/:id/void", async (req, res) => {
    res.json(await finance.void("payment", idSchema.parse(req.params.id), voidSchema.parse(req.body).reason));
  });

  router.post("/finance/expenses", async (req, res) => {
    res.json(await finance.addExpense(expenseSchema.parse(req.body)));
  });

  router.post("/finance/expenses/:id/void", async (req, res) => {
    res.json(await finance.void("expense", idSchema.parse(req.params.id), voidSchema.parse(req.body).reason));
  });

  router.put("/finance/fee", async (req, res) => {
    res.json({ termFee: await finance.setTermFee(feeSchema.parse(req.body).amount) });
  });

  router.post("/curriculum", upload.array("files"), async (req, res) => {
    const labels = labelsSchema.parse(req.body);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw new AppError(400, "No files were uploaded.", "no_files");

    const accepted = [];
    const rejected: { name: string; reason: string }[] = [];
    for (const file of files) {
      const name = sanitizeFilename(file.originalname);
      if (!name.toLowerCase().endsWith(".pdf") && file.mimetype !== "application/pdf")
        rejected.push({ name, reason: "Only PDF files are supported." });
      else if (file.size === 0 || !looksLikePdf(file.buffer))
        rejected.push({ name, reason: "This file is empty or is not a real PDF." });
      else {
        const document = await curriculum.add({ name, buffer: file.buffer }, labels);
        await indexing.enqueue(document.id); // runs in the background; the console shows progress
        // A syllabus is also read into a curriculum map for the teacher dropdowns (also in the background).
        if (document.docType === "syllabus")
          void readMap(document).catch((err) => {
            if (!(err instanceof AppError && err.code === "no_syllabus_table")) logError(`map:${document.id}`, err);
          });
        accepted.push(await curriculum.get(document.id));
      }
    }
    res.status(accepted.length ? 201 : 400).json({ accepted, rejected });
  });

  const idOf = (raw: unknown): string => {
    const id = idSchema.safeParse(raw);
    if (!id.success) throw new AppError(404, "Document not found.", "not_found");
    return id.data;
  };

  router.patch("/curriculum/:id", async (req, res) => {
    const id = idOf(req.params.id);
    const labels = labelsSchema.partial().parse(req.body);
    await curriculum.update(id, {
      ...(labels.subject ? { subject: labels.subject } : {}),
      ...(labels.levels ? { levels: labels.levels } : {}),
      ...(labels.docType ? { docType: labels.docType } : {}),
    });
    // The labels are stored on every chunk, so the chunks are rebuilt with the new ones.
    await indexing.enqueue(id);
    if (labels.subject) {
      await maps.relabel(id, labels.subject);
      await modules.relabel(id, labels.subject);
    }
    res.json(await curriculum.get(id));
  });

  // Registered before "/curriculum/:id/..." so "reindex-all" is not read as an ID.
  router.post("/curriculum/reindex-all", async (_req, res) => {
    const documents = await curriculum.list();
    for (const document of documents) await indexing.enqueue(document.id);
    res.status(202).json({ queued: documents.length });
  });

  router.post("/curriculum/:id/reindex", async (req, res) => {
    const id = idOf(req.params.id);
    await indexing.enqueue(id);
    res.status(202).json(await curriculum.get(id));
  });

  router.delete("/curriculum/:id", async (req, res) => {
    const id = idOf(req.params.id);
    await store.deleteDocument(id);
    await curriculum.remove(id);
    await maps.removeForDocument(id);
    await modules.removeForDocument(id);
    res.status(204).end();
  });

  router.get("/curriculum/:id/file", async (req, res) => {
    const document = await curriculum.get(idOf(req.params.id));
    const file = curriculum.filePath(document.id);
    if (!fs.existsSync(file)) throw new AppError(404, "The PDF file is missing from storage.", "file_missing");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(document.name)}`);
    fs.createReadStream(file).pipe(res);
  });

  router.post("/curriculum/:id/map", async (req, res) => {
    const document = await curriculum.get(idOf(req.params.id));
    if (!fs.existsSync(curriculum.filePath(document.id))) throw new AppError(404, "The PDF file is missing from storage.", "file_missing");
    res.status(201).json(await readMap(document));
  });

  router.post("/curriculum/:id/module", async (req, res) => {
    const document = await curriculum.get(idOf(req.params.id));
    if (!fs.existsSync(curriculum.filePath(document.id))) throw new AppError(404, "The PDF file is missing from storage.", "file_missing");
    const module = await modules.buildFromDocument(document, await pdf.extractItems(await fs.promises.readFile(curriculum.filePath(document.id))));
    if (!module)
      throw new AppError(422, "This PDF is not a CDC teaching module (no sub-topics with numbered learning activities were found).", "not_a_module");
    res.status(201).json(module);
  });

  const moduleIdOf = (raw: unknown): string => {
    const id = idSchema.safeParse(raw);
    if (!id.success) throw new AppError(404, "Teaching module not found.", "not_found");
    return id.data;
  };

  router.get("/modules/:id", async (req, res) => {
    res.json(await modules.get(moduleIdOf(req.params.id)));
  });

  router.put("/modules/:id/active", async (req, res) => {
    res.json(await modules.setActive(moduleIdOf(req.params.id), activeSchema.parse(req.body).active));
  });

  const mapIdOf = (raw: unknown): string => {
    const id = idSchema.safeParse(raw);
    if (!id.success) throw new AppError(404, "Curriculum map not found.", "not_found");
    return id.data;
  };

  router.get("/maps/:id", async (req, res) => {
    res.json(await maps.get(mapIdOf(req.params.id)));
  });

  router.put("/maps/:id", async (req, res) => {
    const { topics } = mapTopicsSchema.parse(req.body);
    res.json(await maps.saveTopics(mapIdOf(req.params.id), topics));
  });

  router.post("/maps/:id/approve", async (req, res) => {
    res.json(await maps.setApproved(mapIdOf(req.params.id), approveSchema.parse(req.body).approved));
  });

  router.delete("/maps/:id", async (req, res) => {
    await maps.remove(mapIdOf(req.params.id));
    res.status(204).end();
  });

  return router;
}
