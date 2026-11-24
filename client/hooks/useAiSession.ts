// @/hooks/useAiSession.ts — asks the AI server which AI tools are switched on
// and whether the signed-in teacher may use them. Used by every AI Tools page.
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { aiConfigured, teacherAi } from '@/services/aiApi';

export function useAiSession() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['ai-session', user?.uid],
    queryFn: () => teacherAi.session(user?.fullName ?? ''),
    enabled: aiConfigured && !!user,
    retry: false,
  });
}
