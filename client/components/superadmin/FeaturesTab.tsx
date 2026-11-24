// @/components/superadmin/FeaturesTab.tsx — one card per AI tool with its
// on/off switch, and the daily limit on documents per teacher (each one is
// a paid NVIDIA call). A tool that is off shows as "Coming soon" to teachers.
import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { AI_FEATURES } from '@/components/ai/aiFeatures';
import { Card, CardTitle, Pill } from '@/components/ai/ui';
import { superAdminApi } from '@/services/aiApi';
import type { AiSettings } from '@/types/ai';
import { cn } from '@/lib/utils';
import { useOverviewAction } from './useOverviewAction';

export function FeaturesTab({ settings }: { settings: AiSettings }) {
  const { run, busy, error } = useOverviewAction();
  const [limit, setLimit] = useState(settings.dailyLimit);
  const changed = limit !== settings.dailyLimit;
  const step = (by: number) => setLimit((l) => Math.min(1000, Math.max(0, l + by)));

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {AI_FEATURES.map((feature) => {
          const Icon = feature.icon;
          const on = settings.features[feature.key]?.enabled ?? false;
          const id = `sa-feature-${feature.key}`;
          return (
            <Card key={feature.key} className={cn('flex flex-col transition', on && 'ring-1 ring-blue-100')}>
              <div className="flex items-start justify-between gap-3">
                <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', feature.tone.icon)}><Icon size={22} /></span>
                <Switch id={id} disabled={busy} checked={on} aria-label={`${feature.label} on or off`}
                  onCheckedChange={(enabled) => void run(() => superAdminApi.updateSettings({ features: { [feature.key]: enabled } }))} />
              </div>
              <label htmlFor={id} className="mt-4 cursor-pointer font-semibold text-gray-900">{feature.label}</label>
              <p className="mt-1 flex-1 text-sm text-gray-600">{feature.description}</p>
              <div className="mt-4">{on ? <Pill tone="green">On for teachers</Pill> : <Pill>Off · shows “Coming soon”</Pill>}</div>
            </Card>
          );
        })}
      </div>

      <Card as="section">
        <CardTitle title="Daily limit" hint="The most documents one teacher can generate in a day. 0 means no limit." />
        <form className="flex flex-wrap items-center gap-3" onSubmit={(e) => { e.preventDefault(); void run(() => superAdminApi.updateSettings({ dailyLimit: limit })); }}>
          <div className="flex h-11 items-center rounded-xl border border-gray-300 bg-white shadow-sm">
            <button type="button" aria-label="Fewer" onClick={() => step(-1)} className="flex h-full w-11 items-center justify-center text-gray-600 hover:bg-gray-50"><Minus size={16} /></button>
            <label htmlFor="sa-daily-limit" className="sr-only">Documents per teacher per day</label>
            <input id="sa-daily-limit" type="number" min={0} max={1000} value={limit} onChange={(e) => setLimit(Math.max(0, Math.min(1000, Number(e.target.value) || 0)))}
              className="h-full w-16 border-x border-gray-200 text-center text-sm font-semibold tabular-nums focus:outline-none" />
            <button type="button" aria-label="More" onClick={() => step(1)} className="flex h-full w-11 items-center justify-center text-gray-600 hover:bg-gray-50"><Plus size={16} /></button>
          </div>
          <span className="text-sm text-gray-600">documents per teacher per day</span>
          <Button type="submit" disabled={busy || !changed} className="ml-auto h-11 rounded-xl bg-blue-600 px-5 hover:bg-blue-700">Save</Button>
        </form>
      </Card>
    </div>
  );
}
