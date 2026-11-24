// @/hooks/useClassCurriculum.ts — the approved syllabus topics for one class
// (subject + level), from the AI server's curriculum maps. Fills the topic and
// sub-topic dropdowns and the assessment topic checklist. `data` is null when
// no map has been approved for that subject and Form yet; the forms then fall
// back to typing.
import { useQuery } from '@tanstack/react-query';
import { teacherAi } from '@/services/aiApi';

export function useClassCurriculum(subject: string, level: string | null | undefined) {
  return useQuery({
    queryKey: ['ai-curriculum-map', subject, level],
    queryFn: () => teacherAi.curriculumMap(subject, level!),
    enabled: !!subject && !!level,
    staleTime: 10 * 60_000, // maps change rarely (only when the superAdmin approves one)
  });
}
