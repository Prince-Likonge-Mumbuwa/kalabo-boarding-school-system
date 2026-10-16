// @/types/face.ts — face recognition data the app can see.
//
// face_status/{learnerId} — written only by the Cloud Functions. Keyed by the
// learner's document id (never by studentId, which changes on promotion).
// classId / className / studentId / fullName are a readable snapshot that a
// trigger keeps in step with the learner record.

export interface FaceTemplateMeta {
  id: string;
  /** Epoch milliseconds. */
  createdAt: number;
}

export interface FaceStatus {
  learnerId: string;
  classId: string;
  className: string;
  studentId: string;
  fullName: string;
  /** Guardian consent recorded. Without it the learner is marked by hand. */
  consent: boolean;
  consentByName?: string;
  templates: FaceTemplateMeta[];
  templateCount: number;
}

/** system/faceRecognition — set by an admin in Settings. */
export interface FaceSettings {
  /** Off: only admins can enrol or scan (pilot). On: all teachers. */
  enabled: boolean;
  reviewThreshold: number;
  matchThreshold: number;
}

export const DEFAULT_FACE_SETTINGS: FaceSettings = {
  enabled: false,
  reviewThreshold: 0.363,
  matchThreshold: 0.45,
};

/** How many angles the enrolment screen asks for (the server allows up to 5). */
export const FACE_TARGET_ANGLES = 3;
export const FACE_MAX_ANGLES = 5;

export type FaceBadge = 'enrolled' | 'needs-photo' | 'no-consent';

export function faceBadge(s: FaceStatus | undefined): FaceBadge {
  if (!s || !s.consent) return 'no-consent';
  return s.templateCount > 0 ? 'enrolled' : 'needs-photo';
}
