// @/hooks/useSponsorList.ts — the school's sponsor list (system/sponsors).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSponsorList } from '@/services/sponsorListService';
import { defaultSponsorList, type SponsorList } from '@/services/guidancePlan';

export const SPONSOR_LIST_KEY = ['sponsor-list'] as const;

export function useSponsorList(): { list: SponsorList; isLoading: boolean; refresh: () => void } {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: SPONSOR_LIST_KEY, queryFn: getSponsorList, staleTime: 5 * 60_000 });
  return {
    list: q.data ?? defaultSponsorList(),
    isLoading: q.isLoading,
    refresh: () => qc.invalidateQueries({ queryKey: SPONSOR_LIST_KEY }),
  };
}
