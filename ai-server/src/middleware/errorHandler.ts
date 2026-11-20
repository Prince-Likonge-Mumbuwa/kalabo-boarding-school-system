/**
 * The last stop for every error thrown in a route. It converts errors into a
 * consistent JSON reply: { error: { message, code } }.
 */
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { AppError, logError } from "../utils/errors.js";

export function toClientError(err: unknown): { status: number; message: string; code: string } {
  if (err instanceof AppError) return { status: err.status, message: err.message, code: err.code };
  if (err instanceof ZodError)
    return { status: 400, message: `Invalid request: ${err.issues.map((i) => `${i.path.join(".") || "body"} ${i.message}`).join("; ")}`, code: "invalid_request" };
  if (err instanceof multer.MulterError)
    return err.code === "LIMIT_FILE_SIZE"
      ? { status: 413, message: "A file is larger than the allowed upload size.", code: "file_too_large" }
      : { status: 400, message: `Upload rejected: ${err.message}`, code: "upload_error" };
  if ((err as { type?: string })?.type === "entity.parse.failed")
    return { status: 400, message: "The request body is not valid JSON.", code: "invalid_json" };
  return { status: 500, message: "Something went wrong on the AI server. Check its log.", code: "internal_error" };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const { status, message, code } = toClientError(err);
  if (status >= 500) logError("request", err);
  if (res.headersSent) return void res.end();
  res.status(status).json({ error: { message, code } });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: { message: "Not found.", code: "not_found" } });
}
