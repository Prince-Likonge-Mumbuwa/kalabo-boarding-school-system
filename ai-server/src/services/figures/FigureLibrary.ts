/**
 * The teachers' diagram library: photos or scans of diagrams (apparatus, a
 * cell, a map from a book, a circuit) that a teacher uploads to use in tests.
 *
 * Each picture is cleaned up on upload (turned upright, cropped to the part
 * the teacher chose, grey, contrast stretched, white edges trimmed, at most
 * 1400 px wide; optionally pure black and white for a clean photocopy) and
 * kept as storage/figures/<id>.png. Its details live in storage/figures.json:
 * title, subject, level, topic, tags, and the letters the teacher placed on
 * it (A, B, C… with what each marks), which become the answers.
 *
 * A teacher sees their own pictures and the ones other teachers share.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { JsonStore } from "../../utils/JsonStore.js";
import { AppError } from "../../utils/errors.js";

export interface FigureLabel { letter: string; x: number; y: number; meaning?: string }

export interface LibraryFigure {
  id: string;
  ownerUid: string;
  ownerName: string;
  title: string;
  description: string;
  subject: string;
  level: string;
  topic: string;
  tags: string[];
  labels: FigureLabel[];
  width: number;
  height: number;
  shared: boolean;
  createdAt: string;
  updatedAt: string;
}

export type FigureDetails = Pick<LibraryFigure, "title" | "description" | "subject" | "level" | "topic" | "tags" | "labels" | "shared">;

export interface CleanOptions {
  /** The part to keep, as fractions (0–1) of the upright picture. */
  crop?: { x: number; y: number; w: number; h: number };
  /** Pure black and white (best for line drawings). */
  threshold?: boolean;
}

export class FigureLibrary {
  private store: JsonStore<{ figures: LibraryFigure[] }>;
  private dir: string;

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, "figures");
    this.store = new JsonStore(path.join(dataDir, "figures.json"), () => ({ figures: [] }));
  }

  private visible = (uid: string) => (f: LibraryFigure) => f.ownerUid === uid || f.shared;

  async list(uid: string, filter: { subject?: string; level?: string } = {}): Promise<LibraryFigure[]> {
    const same = (a: string, b?: string) => !b || a.trim().toLowerCase() === b.trim().toLowerCase();
    return (await this.store.read()).figures
      .filter(this.visible(uid))
      .filter((f) => same(f.subject, filter.subject) && (same(f.level, filter.level) || !f.level))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(uid: string, id: string): Promise<LibraryFigure> {
    const f = (await this.store.read()).figures.find((x) => x.id === id);
    if (!f || !this.visible(uid)(f)) throw new AppError(404, "That picture is not in your diagram library.", "not_found");
    return f;
  }

  /** For the figure checker: null instead of an error. */
  async find(uid: string, id: string): Promise<LibraryFigure | null> {
    try { return await this.get(uid, id); } catch { return null; }
  }

  imagePath(f: LibraryFigure): string {
    return path.join(this.dir, `${f.id}.png`);
  }

  async image(uid: string, id: string): Promise<Buffer> {
    return fs.readFile(this.imagePath(await this.get(uid, id)));
  }

  /** Cleans the picture and saves it with its details. */
  async add(owner: { uid: string; name: string }, upload: Buffer, details: FigureDetails, options: CleanOptions = {}): Promise<LibraryFigure> {
    const { data, info } = await clean(upload, options);
    const now = new Date().toISOString();
    const figure: LibraryFigure = {
      id: randomUUID(), ownerUid: owner.uid, ownerName: owner.name,
      ...details, labels: tidyLabels(details.labels),
      width: info.width, height: info.height, createdAt: now, updatedAt: now,
    };
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.imagePath(figure), data);
    await this.store.update((s) => { s.figures.push(figure); });
    return figure;
  }

  async update(uid: string, id: string, details: Partial<FigureDetails>): Promise<LibraryFigure> {
    return this.store.update((s) => {
      const f = s.figures.find((x) => x.id === id);
      if (!f || f.ownerUid !== uid) throw new AppError(404, "Only the teacher who uploaded a picture can change it.", "not_found");
      Object.assign(f, details, details.labels ? { labels: tidyLabels(details.labels) } : {}, { updatedAt: new Date().toISOString() });
      return { ...f };
    });
  }

  async remove(uid: string, id: string): Promise<void> {
    const removed = await this.store.update((s) => {
      const i = s.figures.findIndex((x) => x.id === id && x.ownerUid === uid);
      if (i < 0) throw new AppError(404, "Only the teacher who uploaded a picture can delete it.", "not_found");
      return s.figures.splice(i, 1)[0];
    });
    await fs.rm(this.imagePath(removed), { force: true });
  }
}

/** One letter once, upper case, positions kept inside the picture. */
function tidyLabels(labels: FigureLabel[]): FigureLabel[] {
  const seen = new Set<string>();
  const clamp = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  return labels
    .map((l) => ({ ...l, letter: l.letter.trim().toUpperCase().slice(0, 3), x: clamp(l.x), y: clamp(l.y), meaning: l.meaning?.trim() || undefined }))
    .filter((l) => l.letter && !seen.has(l.letter) && seen.add(l.letter));
}

/** Upright, cropped, grey, stretched contrast, trimmed, ≤1400 px wide, PNG. */
export async function clean(upload: Buffer, options: CleanOptions) {
  let upright: Buffer;
  try {
    upright = await sharp(upload).rotate().toBuffer();
  } catch {
    throw new AppError(400, "That file is not a picture this server can read (use JPG, PNG or WEBP).", "bad_image");
  }
  let pipeline = sharp(upright);
  const meta = await pipeline.metadata();
  const W = meta.width ?? 0, H = meta.height ?? 0;
  if (options.crop && W && H) {
    const c = options.crop;
    const left = Math.round(Math.max(0, Math.min(1, c.x)) * W), top = Math.round(Math.max(0, Math.min(1, c.y)) * H);
    const width = Math.max(8, Math.min(W - left, Math.round(c.w * W))), height = Math.max(8, Math.min(H - top, Math.round(c.h * H)));
    pipeline = pipeline.extract({ left, top, width, height });
  }
  pipeline = pipeline.flatten({ background: "#ffffff" }).grayscale().normalise();
  // Trim plain white margins; skip if the picture is all one colour.
  let trimmed = await pipeline.toBuffer();
  try { trimmed = await sharp(trimmed).trim({ background: "#ffffff", threshold: 25 }).toBuffer(); } catch { /* nothing to trim */ }
  let out = sharp(trimmed).resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true }).sharpen();
  if (options.threshold) out = out.threshold(165);
  return out.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
}
