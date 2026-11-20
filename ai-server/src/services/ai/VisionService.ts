/**
 * Looks at a picture from the diagram library and suggests its details: a
 * title, a one-line description, tags, and any letters already printed on it
 * (with what each one seems to mark and roughly where). Only a suggestion:
 * the teacher checks and corrects everything before saving.
 *
 * Uses an NVIDIA vision-language model (NVIDIA_VISION_MODEL, default
 * nvidia/nemotron-nano-12b-v2-vl) through the same OpenAI-style API.
 */
import OpenAI from "openai";
import sharp from "sharp";
import type { AppConfig } from "../../config/env.js";
import { AppError, describeProviderError } from "../../utils/errors.js";

export interface PictureSuggestion {
  title: string;
  description: string;
  tags: string[];
  labels: { letter: string; meaning: string; x?: number; y?: number }[];
}

const PROMPT = (subject: string, level: string) => `This picture is a diagram a Zambian secondary school teacher (${subject || "any subject"}, ${level || "any form"}) wants to use in a test.
Reply with JSON only:
{"title": "...", "description": "...", "tags": ["..."], "labels": [{"letter": "A", "meaning": "...", "x": 0.0, "y": 0.0}]}
- title: what the diagram shows, under 8 words (e.g. "Apparatus for preparing oxygen").
- description: one sentence a teacher would use to describe it to the AI writing questions.
- tags: 3 to 6 short topic words.
- labels: only letters or numbers already printed on the picture as labels; meaning = the part each one most likely points to; x and y = where the letter is, as fractions of the width and height (0 to 1). Empty list if there are none.
Do not guess beyond what is visible.`;

export class VisionService {
  readonly model: string;
  private client: OpenAI | null;

  constructor(config: AppConfig) {
    this.model = config.nvidia.visionModel;
    this.client = config.nvidia.apiKey ? new OpenAI({ apiKey: config.nvidia.apiKey, baseURL: config.nvidia.baseUrl, maxRetries: 1, timeout: 120_000 }) : null;
  }

  async suggest(picture: Buffer, hint: { subject?: string; level?: string }): Promise<PictureSuggestion> {
    if (!this.client) throw new AppError(400, "Suggestions need NVIDIA_API_KEY in ai-server/.env.", "missing_api_key");
    const small = await sharp(picture).resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    let reply = "";
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: PROMPT(hint.subject ?? "", hint.level ?? "") },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${small.toString("base64")}` } },
          ],
        }],
      });
      reply = response.choices[0]?.message?.content ?? "";
    } catch (err) {
      throw describeProviderError("NVIDIA vision", this.model, err);
    }
    const json = /\{[\s\S]*\}/.exec(reply.replace(/<think>[\s\S]*?<\/think>/g, ""))?.[0];
    try {
      const data = JSON.parse(json ?? "{}") as Partial<PictureSuggestion>;
      const unit = (v: unknown) => (typeof v === "number" && v >= 0 && v <= 1 ? v : undefined);
      return {
        title: String(data.title ?? "").slice(0, 120),
        description: String(data.description ?? "").slice(0, 400),
        tags: (Array.isArray(data.tags) ? data.tags : []).map(String).slice(0, 8),
        labels: (Array.isArray(data.labels) ? data.labels : []).slice(0, 26).map((l) => ({ letter: String(l.letter ?? "").slice(0, 3), meaning: String(l.meaning ?? "").slice(0, 120), x: unit(l.x), y: unit(l.y) })).filter((l) => l.letter),
      };
    } catch {
      throw new AppError(502, "The picture could not be read by the AI. Fill in the details yourself.", "vision_unreadable");
    }
  }
}
