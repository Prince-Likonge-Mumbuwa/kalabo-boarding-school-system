// @/hooks/useResultsPublication.ts — publishing a term's results to
// guardians and sponsors (admin dashboard). See RESULTS_PUBLICATION.md.
//
// The term's completion comes from the Results Entry Monitor's own load
// (same grids, same numbers); for the current term it is the very same cached
// query the dashboard already runs.

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useResultsEntryMonitor } from '@/hooks/useResultsEntryMonitor';
import {
  getPublication,
  isReleased,
  publishBlocker,
  publishResults,
  unpublishResults,
  type PublishActor,
} from '@/services/resultsPublication';
import type { TermName } from '@/utils/academicTerm';

export const PUBLICATION_KEY = 'results_publication';

export function useResultsPublication(term: TermName, year: number, actor: PublishActor | null) {
  const qc = useQueryClient();
  const monitor = useResultsEntryMonitor({ term, year });

  const record = useQuery({
    queryKey: [PUBLICATION_KEY, term, year],
    queryFn: () => getPublication(term, year),
    staleTime: 0,
  });

  const recordLoaded = record.data !== undefined;
  /** Open to guardians and sponsors right now (null while loading). */
  const released = recordLoaded ? isReleased(record.data ?? null, term, year) : null;
  const blocker = publishBlocker(monitor.completion, monitor.failedClasses.length, term, year);

  const done = () => qc.invalidateQueries({ queryKey: [PUBLICATION_KEY, term, year] });

  const publish = useMutation({
    mutationFn: async () => {
      if (!actor) throw new Error('Please sign in again to publish results.');
      // Count again at the moment of publishing, not from a screen that may be minutes old.
      const fresh = (await monitor.refetch()).data;
      const why = publishBlocker(fresh?.completion ?? null, fresh?.failedClasses.length ?? 0, term, year);
      if (why || !fresh) throw new Error(why || 'Could not check how many results are entered. Please try again.');
      await publishResults(term, year, fresh.completion, actor);
    },
    onSuccess: done,
  });

  const unpublish = useMutation({
    mutationFn: async () => {
      if (!actor) throw new Error('Please sign in again to change this.');
      await unpublishResults(term, year, actor);
    },
    onSuccess: done,
  });

  return {
    record: record.data ?? null,
    released,
    completion: monitor.completion,
    failedClasses: monitor.failedClasses,
    blocker,
    canPublish: released === false && blocker === null,
    isLoading: record.isLoading || monitor.isLoading,
    error: record.error || monitor.error,
    refresh: () => {
      void record.refetch();
      void monitor.refetch();
    },
    publish,
    unpublish,
  };
}
