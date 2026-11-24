/**
 * The two door checks. Every /api/superadmin route (except login) passes
 * through `requireSuperAdmin`; every /api/teacher route passes through
 * `requireTeacher`. Both read the "Authorization: Bearer <token>" header.
 */
import type { Request, RequestHandler } from "express";
import type { SuperAdminService } from "../services/SuperAdminService.js";
import type { TeacherVerifier, VerifiedTeacher } from "../services/TeacherVerifier.js";
import { AppError } from "../utils/errors.js";

function bearer(req: Request): string {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "");
  if (!match) throw new AppError(401, "Sign in first.", "no_token");
  return match[1];
}

export function requireSuperAdmin(superAdmin: SuperAdminService): RequestHandler {
  return async (req, _res, next) => {
    if (!(await superAdmin.verify(bearer(req))))
      throw new AppError(401, "Your superAdmin session has ended. Sign in again.", "session_expired");
    next();
  };
}

export function requireTeacher(verifier: TeacherVerifier): RequestHandler {
  return async (req, res, next) => {
    res.locals.teacher = await verifier.verify(bearer(req));
    next();
  };
}

/** The teacher `requireTeacher` identified for this request. */
export const teacherOf = (res: { locals: Record<string, unknown> }) => res.locals.teacher as VerifiedTeacher;
