// @/hooks/useFaceRecognition.ts — face settings and learners' face status.
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, doc, documentId, getDoc, getDocs, query, setDoc, where } from '@/lib/auditedFirestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { DEFAULT_FACE_SETTINGS, type FaceSettings, type FaceStatus } from '@/types/face';

const SETTINGS_DOC = ['system', 'faceRecognition'] as const;

export function normalizeFaceSettings(d: any): FaceSettings {
  const num = (v: unknown, dflt: number, lo: number, hi: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : dflt;
  };
  const reviewThreshold = num(d?.reviewThreshold, DEFAULT_FACE_SETTINGS.reviewThreshold, 0.2, 0.9);
  const matchThreshold = Math.max(reviewThreshold, num(d?.matchThreshold, DEFAULT_FACE_SETTINGS.matchThreshold, 0.2, 0.95));
  return { enabled: d?.enabled === true, reviewThreshold, matchThreshold };
}

export function mapFaceStatus(id: string, d: any): FaceStatus {
  const templates = Array.isArray(d?.templates)
    ? d.templates.filter((t: any) => t && typeof t.id === 'string').map((t: any) => ({ id: t.id, createdAt: Number(t.createdAt) || 0 }))
    : [];
  return {
    learnerId: id,
    classId: d?.classId || '',
    className: d?.className || '',
    studentId: d?.studentId || '',
    fullName: d?.fullName || '',
    consent: d?.consent === true,
    consentByName: d?.consentByName,
    templates,
    templateCount: typeof d?.templateCount === 'number' ? d.templateCount : templates.length,
  };
}

/** School-wide switch and thresholds. Falls back to "off" if unreadable. */
export function useFaceSettings() {
  return useQuery({
    queryKey: ['face_settings'],
    queryFn: async () => {
      try {
        const snap = await getDoc(doc(db, ...SETTINGS_DOC));
        return normalizeFaceSettings(snap.exists() ? snap.data() : null);
      } catch {
        return { ...DEFAULT_FACE_SETTINGS };
      }
    },
    staleTime: 5 * 60_000,
  });
}

export async function saveFaceSettings(s: FaceSettings, by: string) {
  await setDoc(doc(db, ...SETTINGS_DOC), { ...normalizeFaceSettings(s), updatedBy: by, updatedAt: new Date() }, { merge: true });
}

/** Settings → the on/off switch only (thresholds are left as they are). */
export async function saveFaceSwitch(enabled: boolean, by: string) {
  await setDoc(doc(db, ...SETTINGS_DOC), { enabled: enabled === true, updatedBy: by, updatedAt: new Date() }, { merge: true });
}

/** Attendance → Face recognition: thresholds only (the switch is left as it is). */
export async function saveFaceThresholds(t: Pick<FaceSettings, 'reviewThreshold' | 'matchThreshold'>, by: string) {
  const { reviewThreshold, matchThreshold } = normalizeFaceSettings({ ...t, enabled: false });
  await setDoc(doc(db, ...SETTINGS_DOC), { reviewThreshold, matchThreshold, updatedBy: by, updatedAt: new Date() }, { merge: true });
}

/** Can this user use face features now? Admins always (pilot); teachers when switched on. */
export function useFaceAccess() {
  const { user } = useAuth();
  const settings = useFaceSettings();
  const isAdmin = user?.userType === 'admin';
  return {
    settings: settings.data ?? DEFAULT_FACE_SETTINGS,
    loading: settings.isLoading,
    canUse: !!user && (isAdmin || settings.data?.enabled === true),
    isAdmin,
  };
}

/**
 * face_status of these learners, keyed by learner document id. Looked up by
 * id (not by the class stored on the face record), so a learner who was just
 * promoted, transferred or admitted shows correctly at once.
 */
export async function fetchFaceStatus(learnerIds: string[]): Promise<Map<string, FaceStatus>> {
  const ids = Array.from(new Set(learnerIds.filter(Boolean)));
  const map = new Map<string, FaceStatus>();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
  const snaps = await Promise.all(chunks.map(c => getDocs(query(collection(db, 'face_status'), where(documentId(), 'in', c)))));
  for (const snap of snaps) for (const d of snap.docs) map.set(d.id, mapFaceStatus(d.id, d.data()));
  return map;
}

export function useLearnersFaceStatus(learnerIds: string[] | undefined, opts: { enabled?: boolean } = {}) {
  const ids = useMemo(() => Array.from(new Set(learnerIds ?? [])).sort(), [learnerIds]);
  return useQuery({
    queryKey: ['face_status', 'learners', ids.join(',')],
    queryFn: () => fetchFaceStatus(ids),
    enabled: ids.length > 0 && opts.enabled !== false,
    staleTime: 60_000,
  });
}

/** Every face_status record (admin overview). */
export function useAllFaceStatus(enabled: boolean) {
  return useQuery({
    queryKey: ['face_status', '*'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'face_status'));
      return snap.docs.map(d => mapFaceStatus(d.id, d.data()));
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useInvalidateFaceStatus() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: ['face_status'] }), [qc]);
}
