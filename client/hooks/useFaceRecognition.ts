// @/hooks/useFaceRecognition.ts — face settings and per-class face status.
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
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

/** face_status of every learner in a class, keyed by learner document id. */
export function useClassFaceStatus(classId: string | undefined, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['face_status', classId],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'face_status'), where('classId', '==', classId)));
      const map = new Map<string, FaceStatus>();
      for (const d of snap.docs) map.set(d.id, mapFaceStatus(d.id, d.data()));
      return map;
    },
    enabled: !!classId && opts.enabled !== false,
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
