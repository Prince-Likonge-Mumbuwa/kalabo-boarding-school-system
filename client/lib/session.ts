// Sign-in sessions last 2 hours.
//
// The clock starts at the last real sign-in (Firebase's lastSignInTime,
// the same in every tab and unaffected by token refreshes). Ten minutes
// before the end a banner asks the teacher to save; at the end the app
// signs out, clears every cached query (so the next person on the device
// never sees the previous person's data) and returns to Sign in.
// Unsaved registers and marks are kept on the device per user, and come
// back after signing in again (see useSessionDraft / ResultsEntry drafts).

export const SESSION_MAX_MS = 2 * 60 * 60 * 1000;
export const SESSION_WARN_MS = 10 * 60 * 1000;
/** Fired just before the app signs out at the end of a session. */
export const SESSION_ENDING_EVENT = 'kbs:session-ending';

export interface SessionState {
  remainingMs: number;
  expired: boolean;
  warn: boolean;
}

/** startMs: when the user signed in. Unknown start → treat as just started. */
export function sessionState(startMs: number | null, now = Date.now(), maxMs = SESSION_MAX_MS, warnMs = SESSION_WARN_MS): SessionState {
  if (startMs === null || !Number.isFinite(startMs)) return { remainingMs: maxMs, expired: false, warn: false };
  const remainingMs = Math.max(0, startMs + maxMs - now);
  return { remainingMs, expired: remainingMs <= 0, warn: remainingMs > 0 && remainingMs <= warnMs };
}

/** When the signed-in user last signed in (ms), from Firebase's user metadata. */
export function signInTime(user: { metadata?: { lastSignInTime?: string | null } } | null | undefined): number | null {
  const t = user?.metadata?.lastSignInTime ? Date.parse(user.metadata.lastSignInTime) : NaN;
  return Number.isFinite(t) ? t : null;
}

export const minutesLeft = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));
