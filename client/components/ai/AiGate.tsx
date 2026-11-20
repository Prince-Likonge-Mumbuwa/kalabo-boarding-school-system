// @/components/ai/AiGate.tsx — stands in front of every AI Tools page. It
// shows the page only when the AI server is reachable, the teacher has been
// given access and (if a tool is named) that tool is switched on. Otherwise
// it explains, in one sentence, why not.
import type { ReactNode } from 'react';
import { Clock3, PlugZap, PowerOff, ShieldX } from 'lucide-react';
import { useAiSession } from '@/hooks/useAiSession';
import { aiConfigured } from '@/services/aiApi';
import type { FeatureKey, TeacherAiSession } from '@/types/ai';
import { Card, EmptyState, Skeleton } from './ui';

interface AiGateProps {
  /** When given, the page also needs this tool to be switched on. */
  feature?: FeatureKey;
  children: (session: TeacherAiSession) => ReactNode;
}

export function AiGate({ feature, children }: AiGateProps) {
  const { data, isLoading, error, refetch } = useAiSession();
  const notice = (icon: ReactNode, title: string, text: ReactNode, action?: ReactNode) => (
    <Card padded={false} className="mt-6"><EmptyState icon={icon} title={title} action={action}>{text}</EmptyState></Card>
  );

  if (!aiConfigured) return notice(<PlugZap size={22} />, 'AI tools are not connected', 'The AI service has not been set up for this site yet.');
  if (isLoading)
    return (
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading">
        {[0, 1, 2].map((i) => <Card key={i}><Skeleton className="h-10 w-10" /><Skeleton className="mt-4 h-4 w-1/2" /><Skeleton className="mt-2 h-3 w-4/5" /></Card>)}
      </div>
    );
  if (error || !data)
    return notice(<PlugZap size={22} />, 'AI service unavailable',
      <>{(error as Error)?.message ?? 'The AI service is not reachable right now.'} Try again in a moment.</>,
      <button type="button" onClick={() => refetch()} className="h-10 rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50">Try again</button>);
  if (!data.hasAccess)
    return data.accessState === 'revoked'
      ? notice(<ShieldX size={22} />, 'Access withdrawn', 'Your access to the AI tools has been withdrawn. Contact the system administrator.')
      : notice(<Clock3 size={22} />, 'Waiting for access', 'Your request has been recorded. You can use the AI tools as soon as the system administrator grants access.');
  if (feature && !data.features[feature]?.enabled)
    return notice(<PowerOff size={22} />, 'Not switched on yet', 'This tool will open here as soon as it is switched on.');
  return <>{children(data)}</>;
}

