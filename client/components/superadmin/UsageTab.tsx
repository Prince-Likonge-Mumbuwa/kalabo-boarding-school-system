// @/components/superadmin/UsageTab.tsx — how much the AI tools are used.
// A "use" is a teacher opening a tool or generating a document; generated
// documents are counted separately because each one is a paid NVIDIA call.
import { Activity, BarChart3, Sparkles, Users } from 'lucide-react';
import { AI_FEATURES } from '@/components/ai/aiFeatures';
import { Card, CardTitle, EmptyState, Stat } from '@/components/ai/ui';
import type { AiTeacher, UsageSummary } from '@/types/ai';
import { cn } from '@/lib/utils';

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div className={cn('h-full rounded-full', className)} style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} />
    </div>
  );
}

export function UsageTab({ usage, teachers }: { usage: UsageSummary; teachers: AiTeacher[] }) {
  const nameOf = (uid: string) => teachers.find((t) => t.uid === uid)?.name ?? uid;
  const maxTool = Math.max(1, ...AI_FEATURES.map((f) => usage.byFeature[f.key] ?? 0));
  const maxTeacher = Math.max(1, ...usage.byTeacher.map((t) => t.count));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat icon={<Sparkles size={20} />} label="Generated, 30 days" value={usage.generatedLast30Days.toLocaleString()} />
        <Stat icon={<BarChart3 size={20} />} label="Generated, all time" value={usage.generated.toLocaleString()} />
        <Stat icon={<Users size={20} />} label="Active teachers" value={usage.byTeacher.length} hint="Used a tool at least once" />
        <Stat icon={<Activity size={20} />} label="All activity, 30 days" value={usage.last30Days.toLocaleString()} hint="Opening and generating" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle title="By tool" hint="Opening and generating, all time." />
          <ul className="space-y-4">
            {AI_FEATURES.map((f) => {
              const Icon = f.icon;
              const n = usage.byFeature[f.key] ?? 0;
              return (
                <li key={f.key} className="flex items-center gap-3">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', f.tone.icon)}><Icon size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-center justify-between text-sm"><span className="font-medium text-gray-900">{f.label}</span><span className="tabular-nums text-gray-600">{n.toLocaleString()}</span></div>
                    <Bar value={n} max={maxTool} className={f.tone.dot} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <CardTitle title="By teacher" />
          {usage.byTeacher.length === 0 ? (
            <EmptyState icon={<Users size={22} />} title="No use recorded yet" />
          ) : (
            <ul className="space-y-4">
              {usage.byTeacher.slice(0, 12).map((row) => (
                <li key={row.uid}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium text-gray-900">{nameOf(row.uid)}</span>
                    <span className="shrink-0 text-xs text-gray-500"><span className="font-semibold tabular-nums text-gray-700">{row.count}</span> · last {new Date(row.lastAt).toLocaleDateString()}</span>
                  </div>
                  <Bar value={row.count} max={maxTeacher} className="bg-blue-500" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
