// @/components/results/PublishResultsPanel.tsx
//
// Admin dashboard → "Publish results". Guardians and sponsors only see a
// term's results after the admin publishes them, and a term can only be
// published once 98% of the expected results are entered.
//
//   term picker · status (published / not published) · how much is entered
//   with the 98% mark · [Publish results] / [Withdraw results]
//
// Rules and calculations: services/resultsPublication.ts (tested).
// Data: hooks/useResultsPublication.ts. Guide: RESULTS_PUBLICATION.md.

import { useMemo, useState } from 'react';
import { CheckCircle2, Lock, RefreshCw, Send } from 'lucide-react';
import { Panel } from '@/components/nerve/NervePanels';
import { useResultsPublication } from '@/hooks/useResultsPublication';
import { completionPercent, PUBLISH_THRESHOLD_PERCENT } from '@/services/resultsPublication';
import { formatTermLabel, getCurrentAcademicTerm, getPreviousAcademicTerm, type TermName } from '@/utils/academicTerm';
import { cn } from '@/lib/utils';

const TERMS_OFFERED = 6;

interface Props {
  /** The signed-in admin. */
  actor: { uid: string; name: string } | null;
}

const when = (d: Date | null) =>
  d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Something went wrong. Please try again.');

export function PublishResultsPanel({ actor }: Props) {
  // The current term and the five before it.
  const options = useMemo(() => {
    const list = [getCurrentAcademicTerm()];
    while (list.length < TERMS_OFFERED) list.push(getPreviousAcademicTerm(list[list.length - 1]));
    return list;
  }, []);

  const [choice, setChoice] = useState(0);
  const picked = options[choice];
  const term = picked.term as TermName;
  const year = picked.year;
  const label = formatTermLabel(term, year);

  const p = useResultsPublication(term, year, actor);
  const [confirm, setConfirm] = useState<null | 'publish' | 'withdraw'>(null);
  const [notice, setNotice] = useState<null | { ok: boolean; text: string }>(null);

  const busy = p.publish.isPending || p.unpublish.isPending;
  const pct = p.completion ? completionPercent(p.completion) : null;

  const pick = (i: number) => {
    setChoice(i);
    setConfirm(null);
    setNotice(null);
  };

  const run = async (kind: 'publish' | 'withdraw') => {
    setNotice(null);
    try {
      if (kind === 'publish') await p.publish.mutateAsync();
      else await p.unpublish.mutateAsync();
      setNotice({
        ok: true,
        text:
          kind === 'publish'
            ? `${label} results are published. Guardians and sponsors can now open them.`
            : `${label} results are withdrawn. Guardians and sponsors can no longer open them.`,
      });
    } catch (e) {
      setNotice({ ok: false, text: messageOf(e) });
    } finally {
      setConfirm(null);
    }
  };

  const status =
    p.released === null ? null : p.released ? (
      <p className="flex items-start gap-1.5 text-sm font-medium text-emerald-700">
        <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Published — guardians and sponsors can open {label}.
          {p.record?.publishedAt && (
            <span className="block text-xs font-normal text-slate-500">
              {when(p.record.publishedAt)}
              {p.record.publishedByName ? ` by ${p.record.publishedByName}` : ''}
              {p.record.completionPercent ? ` · ${p.record.completionPercent}% entered at the time` : ''}
            </span>
          )}
          {!p.record && (
            <span className="block text-xs font-normal text-slate-500">
              Open since before publishing was introduced.
            </span>
          )}
        </span>
      </p>
    ) : (
      <p className="flex items-start gap-1.5 text-sm font-medium text-amber-700">
        <Lock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Not published — guardians and sponsors cannot see {label}.
          {p.record?.unpublishedAt && (
            <span className="block text-xs font-normal text-slate-500">
              Withdrawn {when(p.record.unpublishedAt)}
              {p.record.unpublishedByName ? ` by ${p.record.unpublishedByName}` : ''}
            </span>
          )}
        </span>
      </p>
    );

  return (
    <Panel
      title="Publish results"
      icon={<Send size={16} className="text-emerald-600" />}
      loading={p.isLoading && !p.completion && p.released === null}
      error={p.error}
      right={
        <button
          type="button"
          onClick={p.refresh}
          aria-label="Recount results"
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
        >
          <RefreshCw size={14} />
        </button>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <label htmlFor="publish-term" className="text-xs font-medium text-slate-600">
            Term
          </label>
          <select
            id="publish-term"
            value={choice}
            onChange={e => pick(Number(e.target.value))}
            disabled={busy}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            {options.map((o, i) => (
              <option key={o.label} value={i}>
                {o.label}
                {i === 0 ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </div>

        {status}

        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-slate-700">Results entered</span>
            <span className="tabular-nums text-xs text-slate-600">
              {p.completion
                ? `${p.completion.doneEntries} of ${p.completion.requiredEntries} · `
                : ''}
              <strong className="text-slate-900">{pct !== null ? `${pct}%` : '…'}</strong>
            </span>
          </div>
          <div
            className="relative mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-label={`${label} results entered`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct ?? 0}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct ?? 0}%`,
                background: p.completion && !p.blocker ? '#059669' : '#2a78d6',
              }}
            />
            <div
              className="absolute inset-y-0 w-0.5 bg-slate-700"
              style={{ left: `${PUBLISH_THRESHOLD_PERCENT}%` }}
              aria-hidden="true"
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            A term can be published once {PUBLISH_THRESHOLD_PERCENT}% of its results are entered.
          </p>
        </div>

        {p.released === false && p.blocker && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700" role="status">
            {p.blocker}
          </p>
        )}

        {notice && (
          <p
            role={notice.ok ? 'status' : 'alert'}
            className={cn(
              'rounded-lg px-3 py-2 text-xs',
              notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
            )}
          >
            {notice.text}
          </p>
        )}

        {confirm ? (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3" role="group" aria-label="Confirm">
            <p className="text-sm text-slate-800">
              {confirm === 'publish'
                ? `Publish ${label} results? Guardians and sponsors will be able to open them.`
                : `Withdraw ${label} results? Guardians and sponsors will no longer be able to open them.`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => run(confirm)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60',
                  confirm === 'publish' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                )}
              >
                {busy ? 'Working…' : confirm === 'publish' ? 'Yes, publish' : 'Yes, withdraw'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : p.released ? (
          <button
            type="button"
            disabled={busy || !actor}
            onClick={() => setConfirm('withdraw')}
            className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
          >
            Withdraw results
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !actor || !p.canPublish}
            onClick={() => setConfirm('publish')}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Publish results
          </button>
        )}
      </div>
    </Panel>
  );
}
