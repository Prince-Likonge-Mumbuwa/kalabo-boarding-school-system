/**
 * Proves who a teacher is WITHOUT reading Firebase data.
 *
 * When a teacher signs in to the school app, Google gives their browser a
 * signed token. The browser sends that token here. We check Google's
 * signature on it using Google's public keys (a plain HTTPS download, cached
 * by `jose`). No service account, no Firestore, no Blaze plan.
 *
 * The token tells us the teacher's uid and email, nothing more.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";
import { AppError } from "../utils/errors.js";

export interface VerifiedTeacher {
  uid: string;
  email: string;
}

export interface TeacherVerifier {
  verify(token: string): Promise<VerifiedTeacher>;
}

const GOOGLE_KEYS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export class FirebaseTokenVerifier implements TeacherVerifier {
  private keys = createRemoteJWKSet(new URL(GOOGLE_KEYS));

  constructor(private projectId: string) {}

  async verify(token: string): Promise<VerifiedTeacher> {
    if (!this.projectId)
      throw new AppError(500, "FIREBASE_PROJECT_ID is not set in ai-server/.env.", "not_configured");
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: `https://securetoken.google.com/${this.projectId}`,
        audience: this.projectId,
      });
      if (!payload.sub) throw new AppError(401, "This sign-in token has no user.", "invalid_token");
      return { uid: payload.sub, email: typeof payload.email === "string" ? payload.email : "" };
    } catch (err) {
      if (err instanceof AppError) throw err;
      const code = String((err as { code?: string }).code ?? "");
      // jose marks a bad or expired token with ERR_JWT... / ERR_JWS... codes.
      if (/^ERR_(JWT|JWS)/.test(code))
        throw new AppError(401, "Your sign-in has expired. Sign in to the school system again.", "invalid_token");
      throw new AppError(503, "Could not reach Google to check your sign-in. Check the internet connection.", "verifier_unavailable");
    }
  }
}
