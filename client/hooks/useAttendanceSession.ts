// @/hooks/useAttendanceSession.ts
//
// React glue for the session model. Wraps attendanceService's session methods
// in React Query and provides a local draft state (useSessionDraft) that owns
// the "unsaved changes" concept for the teacher page.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { attendanceService } from '@/services/attendanceService';
import type {
  AttendanceSession,
  SessionKind,
  AttendanceStatus,
} from '@/types/attendance';

// ==================== CACHE KEYS ====================

export function sessionKey(
  classId: string,
  date: string,
  kind: SessionKind,
  period?: number,
  subject?: string,
) {
  return [
    'attendance_session',
    classId,
    date,
    kind,
    period ?? null,
    subject ?? null,
  ] as const;
}

export function recentSessionsKey(
  classId: string,
  kind: SessionKind,
  beforeDate: string,
  limitN: number,
) {
  return ['attendance_recent', classId, kind, beforeDate, limitN] as const;
}

export function sessionsForDateKey(classId: string, date: string) {
  return ['attendance_sessions_for_date', classId, date] as const;
}

// ==================== QUERIES ====================

export function useAttendanceSession(
  classId: string | undefined,
  date: string | undefined,
  kind: SessionKind,
  period?: number,
  subject?: string,
) {
  const enabled =
    !!classId &&
    !!date &&
    (kind === 'daily' || (!!period && !!subject));

  return useQuery({
    queryKey: sessionKey(classId ?? '', date ?? '', kind, period, subject),
    queryFn: () => attendanceService.getSession(classId!, date!, kind, period, subject),
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export function useRecentSessions(
  classId: string | undefined,
  kind: SessionKind,
  beforeDate: string | undefined,
  limitN = 5,
) {
  return useQuery({
    queryKey: recentSessionsKey(classId ?? '', kind, beforeDate ?? '', limitN),
    queryFn: () => attendanceService.getRecentSessions(classId!, kind, beforeDate!, limitN),
    enabled: !!classId && !!beforeDate,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
}

export function useSessionsForDate(
  classId: string | undefined,
  date: string | undefined,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled !== false && !!classId && !!date;

  return useQuery({
    queryKey: sessionsForDateKey(classId ?? '', date ?? ''),
    queryFn: () => attendanceService.getSessionsForClassDate(classId!, date!),
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

// ==================== MUTATIONS ====================

/**
 * Delete a session ("unmark" a roll call).
 *
 * On success, refetches the session query (which will return null) and
 * invalidates the recent-sessions and sessions-for-date caches.
 *
 * Usage:
 *   const deleteSession = useDeleteSession();
 *   await deleteSession.mutateAsync({ classId, date, kind, subject, period });
 *
 * `mutateAsync` resolves to `true` if a doc was deleted, `false` if it was
 * already gone. Errors propagate and land in `deleteSession.error`.
 */
export function useDeleteSession() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      classId: string;
      date: string;
      kind: SessionKind;
      subject?: string;
      period?: number;
    }) => attendanceService.deleteSession(params),

    onSuccess: async (_deleted, params) => {
      const { classId, date, kind, subject, period } = params;

      await Promise.all([
        qc.refetchQueries({
          queryKey: sessionKey(classId, date, kind, period, subject),
          type: 'active',
        }),
        qc.invalidateQueries({
          queryKey: ['attendance_recent', classId, kind],
        }),
        qc.invalidateQueries({
          queryKey: ['attendance_sessions_for_date', classId, date],
        }),
      ]);
    },
  });
}

// ==================== DRAFT STATE ====================

export interface SessionDraft {
  draft: Record<string, AttendanceStatus>;
  reasons: Record<string, string>;
  dirty: boolean;
  setStatus: (studentId: string, status: AttendanceStatus, reason?: string) => void;
  bulkSet: (studentIds: string[], status: AttendanceStatus, reason?: string) => void;
  clearReason: (studentId: string) => void;
  discard: () => void;
  markClean: () => void;
  getReason: (studentId: string) => string | undefined;
  hasEntries: boolean;
}

export function useSessionDraft(loaded: AttendanceSession | null | undefined): SessionDraft {
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  // Reset when the session identity changes. Keyed on loaded?.id so a
  // background refetch of the same session doesn't wipe in-flight edits.
  // When a session is deleted, loaded becomes null and loadedId becomes
  // null, which also triggers a reset.
  const loadedId = loaded?.id ?? null;
  useEffect(() => {
    setDraft(loaded?.roster ?? {});
    setReasons(loaded?.excuseReasons ?? {});
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedId]);

  const setStatus = useCallback(
    (studentId: string, status: AttendanceStatus, reason?: string) => {
      setDraft(prev => ({ ...prev, [studentId]: status }));
      if (status === 'excused' && reason && reason.trim()) {
        setReasons(prev => ({ ...prev, [studentId]: reason.trim() }));
      }
      if (status !== 'excused') {
        setReasons(prev => {
          if (!(studentId in prev)) return prev;
          const next = { ...prev };
          delete next[studentId];
          return next;
        });
      }
      setDirty(true);
    },
    [],
  );

  const bulkSet = useCallback(
    (studentIds: string[], status: AttendanceStatus, reason?: string) => {
      if (studentIds.length === 0) return;
      setDraft(prev => {
        const next = { ...prev };
        for (const id of studentIds) next[id] = status;
        return next;
      });

      if (status === 'excused' && reason && reason.trim()) {
        setReasons(prev => {
          const next = { ...prev };
          for (const id of studentIds) next[id] = reason.trim();
          return next;
        });
      } else if (status !== 'excused') {
        setReasons(prev => {
          const next = { ...prev };
          for (const id of studentIds) delete next[id];
          return next;
        });
      }
      setDirty(true);
    },
    [],
  );

  const clearReason = useCallback((studentId: string) => {
    setReasons(prev => {
      if (!(studentId in prev)) return prev;
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    setDirty(true);
  }, []);

  const discard = useCallback(() => {
    setDraft(loaded?.roster ?? {});
    setReasons(loaded?.excuseReasons ?? {});
    setDirty(false);
  }, [loaded]);

  const markClean = useCallback(() => setDirty(false), []);

  const getReason = useCallback(
    (studentId: string) => reasons[studentId],
    [reasons],
  );

  const hasEntries = useMemo(() => Object.keys(draft).length > 0, [draft]);

  return {
    draft,
    reasons,
    dirty,
    setStatus,
    bulkSet,
    clearReason,
    discard,
    markClean,
    getReason,
    hasEntries,
  };
}

// ==================== HELPERS ====================

export function buildLastStatusMap(sessions: AttendanceSession[]) {
  const map = new Map<string, { status: AttendanceStatus; date: string }>();
  for (const session of sessions) {
    for (const [studentId, status] of Object.entries(session.roster)) {
      if (!map.has(studentId)) {
        map.set(studentId, { status, date: session.date });
      }
    }
  }
  return map;
}

/**
 * Invalidate caches touched by a save.
 *
 * The session cache is refetched (not just invalidated) so callers that
 * `await` this can rely on the fresh data being in place — that's what makes
 * `draft.markClean()` consistent with the newly-loaded session.
 *
 * The other two targets only need invalidation: they'll refetch on next use.
 */
export function useInvalidateSessionCaches() {
  const qc = useQueryClient();

  return useCallback(
    async (params: {
      classId: string;
      date: string;
      kind: SessionKind;
      period?: number;
      subject?: string;
    }) => {
      const { classId, date, kind, period, subject } = params;

      await Promise.all([
        qc.refetchQueries({
          queryKey: sessionKey(classId, date, kind, period, subject),
          type: 'active',
        }),
        qc.invalidateQueries({
          queryKey: ['attendance_recent', classId, kind],
        }),
        qc.invalidateQueries({
          queryKey: ['attendance_sessions_for_date', classId, date],
        }),
        // Dashboards, admin rollups and timetable coverage read these.
        qc.invalidateQueries({ queryKey: ['attendance_sessions'] }),
        qc.invalidateQueries({ queryKey: ['timetable', 'day-board'] }),
        qc.invalidateQueries({ queryKey: ['timetable', 'coverage'] }),
        qc.invalidateQueries({ queryKey: ['timetable', 'coverage-teachers'] }),
      ]);
    },
    [qc],
  );
}