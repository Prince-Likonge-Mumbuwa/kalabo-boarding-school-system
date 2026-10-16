// Calls to the face recognition Cloud Functions (sms-functions/functions/src/face).
//
// Identity: every call names a learner by their Firestore document id
// (learners/{id}) — the same id the attendance roster uses. Student numbers
// change when learners are promoted or transferred; the document id does not.
//
// Firebase Functions is loaded only when a face feature is used, so the rest
// of the app (and its tests) never loads it.
import type { Functions } from 'firebase/functions';
import type { Box } from './live';

export const FACE_REGION = 'us-central1'; // same region as the SMS functions

let functionsP: Promise<{ fns: Functions; httpsCallable: typeof import('firebase/functions').httpsCallable }> | null = null;

function loadFunctions() {
  functionsP ??= Promise.all([import('firebase/functions'), import('@/lib/firebase')]).then(([m, fb]) => ({
    fns: m.getFunctions(fb.app, FACE_REGION),
    httpsCallable: m.httpsCallable,
  }));
  return functionsP;
}

/** Turn a Firebase error into a sentence a teacher can act on. */
export function faceErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const code = (err?.code || '').replace(/^functions\//, '');
  switch (code) {
    case 'unavailable':
    case 'deadline-exceeded':
      return 'No connection to the server. Check the internet and try again.';
    case 'unauthenticated':
      return 'Your sign-in has expired. Sign in again.';
    case 'not-found':
      return err.message && !/^not[- ]found$/i.test(err.message) ? err.message : 'Face recognition is not set up on the server yet.';
    case 'internal':
      return err.message && err.message !== 'internal' ? err.message : 'Face recognition failed on the server. Try again.';
    default:
      return err?.message || 'Face recognition failed. Try again.';
  }
}

async function call<Req, Res>(name: string, data: Req): Promise<Res> {
  const { fns, httpsCallable } = await loadFunctions();
  try {
    const res = await httpsCallable<Req, Res>(fns, name, { timeout: 30_000 })(data);
    return res.data;
  } catch (e) {
    throw new Error(faceErrorMessage(e));
  }
}

export type Verdict = 'match' | 'review' | 'unknown';
export interface FaceMatch {
  box: Box;
  /** Learner document id, or null when the face is not one of this class. */
  learnerId: string | null;
  similarity: number | null;
  verdict: Verdict;
}
export interface MatchResult {
  width: number;
  height: number;
  /** How many learners of the class have faces saved. */
  enrolledInClass: number;
  faces: FaceMatch[];
}

export const faceApi = {
  setConsent: (learnerId: string, consent: boolean) =>
    call<{ learnerId: string; consent: boolean }, { ok: true; consent: boolean }>('faceSetConsent', { learnerId, consent }),

  enrol: (learnerId: string, embedding: number[], modelVersion: string) =>
    call<{ learnerId: string; embedding: number[]; modelVersion: string }, { ok: true; templateId: string; templateCount: number }>(
      'faceEnrol', { learnerId, embedding, modelVersion },
    ),

  revoke: (learnerId: string, templateId?: string) =>
    call<{ learnerId: string; templateId?: string }, { ok: true; removed: number; templateCount: number }>(
      'faceRevoke', templateId ? { learnerId, templateId } : { learnerId },
    ),

  match: (body: { classId: string; width: number; height: number; live?: boolean; faces: Array<{ box: Box; embedding: number[] }> }) =>
    call<typeof body, MatchResult>('faceMatch', body),

  purgeAll: () => call<{ action: 'purgeAll' }, { ok: true; learners: number }>('faceAdmin', { action: 'purgeAll' }),
};
