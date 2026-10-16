// @/hooks/useOnCoverTeachers.ts
//
// School-wide "who is currently on cover" — the authoritative, slot-based
// answer used by the Teacher Management "On Cover" card and header.
//
// A teacher is "on cover" when they are the DELEGATE of a class_slots slot
// whose delegation is LIVE right now (delegateStart ≤ now ≤ delegateEnd).
// This is the exact same source of truth the Results Entry Monitor uses to
// decide who currently holds a class (assignmentEngine.resolveAuthority /
// delegationState), so the two screens always agree.
//
// Why not derive this from teacher_assignments rows? A cover row keeps
// status 'active' until a cleanup job closes it, so a cover whose end date
// has already passed — or one whose start date is still in the future —
// would be miscounted. The slot's live window is the only correct signal,
// and it flips automatically at the start/end dates with no admin action.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import * as engine from '@/services/assignmentEngine';

export interface OnCoverInfo {
  /** Teachers currently covering at least one slot (live delegates). */
  onCoverTeacherIds: Set<string>;
  /** Count of those teachers. */
  onCoverCount: number;
  /** Owners whose slot is being covered live right now (cover OR TP). */
  coveredOwnerIds: Set<string>;
  /**
   * Owners whose slot is under a LIVE leave-cover right now — i.e. teachers
   * who are operationally on leave because someone is covering for them.
   * (TP cover is excluded: the owner is present, supervising a trainee.)
   */
  onLeaveOwnerIds: Set<string>;
  isLoading: boolean;
  isFetching: boolean;
}

export const useOnCoverTeachers = (opts: { enabled?: boolean } = {}): OnCoverInfo => {
  const query = useQuery({
    queryKey: ['on_cover_teachers'],
    enabled: opts.enabled !== false,
    // Covers start/expire by date — re-evaluate periodically so the count
    // flips on its own at the start/end of a cover.
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'class_slots'));
      const now = new Date();
      const onCover = new Set<string>();
      const coveredOwners = new Set<string>();
      const onLeaveOwners = new Set<string>();
      for (const d of snap.docs) {
        const slot = engine.mapSlot(d.id, d.data());
        if (!slot.delegateTeacherId) continue;
        if (engine.delegationState(slot, now) !== 'live') continue;
        onCover.add(slot.delegateTeacherId);
        if (slot.ownerTeacherId) {
          coveredOwners.add(slot.ownerTeacherId);
          // Only a leave-cover means the owner is away; a TP placement does not.
          if (slot.delegateRole === 'leave-cover') onLeaveOwners.add(slot.ownerTeacherId);
        }
      }
      return {
        onCoverTeacherIds: [...onCover],
        coveredOwnerIds: [...coveredOwners],
        onLeaveOwnerIds: [...onLeaveOwners],
      };
    },
  });

  return useMemo(() => {
    const ids = query.data?.onCoverTeacherIds ?? [];
    const covered = query.data?.coveredOwnerIds ?? [];
    const onLeave = query.data?.onLeaveOwnerIds ?? [];
    return {
      onCoverTeacherIds: new Set(ids),
      onCoverCount: ids.length,
      coveredOwnerIds: new Set(covered),
      onLeaveOwnerIds: new Set(onLeave),
      isLoading: query.isLoading,
      isFetching: query.isFetching,
    };
  }, [query.data, query.isLoading, query.isFetching]);
};
