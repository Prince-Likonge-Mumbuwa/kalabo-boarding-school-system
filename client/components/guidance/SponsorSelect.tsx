// The Sponsor field on learner forms: one of the school's sponsors, or
// Self-sponsored. A sponsor that is not listed is added by the guidance
// teacher (Guidance & Counselling → Sponsor list).
import { useSponsorList } from '@/hooks/useSponsorList';
import { SELF_SPONSORED, sponsorLabel } from '@/services/guidancePlan';
import { cn } from '@/lib/utils';

export function SponsorSelect({
  value,
  onChange,
  id,
  className,
  invalid,
}: {
  value: string;
  onChange: (sponsor: string) => void;
  id?: string;
  className?: string;
  invalid?: boolean;
}) {
  const { list } = useSponsorList();
  // An old free-text value shows as what it counts as.
  const current = sponsorLabel(value, list);
  return (
    <div>
      <select
        id={id}
        aria-label="Sponsor"
        value={current}
        onChange={e => onChange(e.target.value)}
        className={cn('w-full rounded-lg border px-3 py-2 text-sm bg-white', invalid ? 'border-red-300' : 'border-gray-300', className)}
      >
        <option value={SELF_SPONSORED}>{SELF_SPONSORED}</option>
        {list.names.map(n => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-500">
        Sponsor not listed? The guidance teacher adds sponsors in Guidance &amp; Counselling.
        {value && value !== current && <span className="block text-amber-700">Was typed as “{value}” — counts as {current}.</span>}
      </p>
    </div>
  );
}
