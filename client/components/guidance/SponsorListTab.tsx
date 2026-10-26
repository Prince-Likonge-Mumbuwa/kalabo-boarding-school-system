// Guidance & Counselling → Sponsor list.
//
//   Sponsors              KGS 34 · CAMFED 21 · CDF 12 · AP 3 · WISE 0   [+ Add sponsor]
//   Other names typed     "Mrs Mwale" (2) · "Plan International" (1) …
//   (counted as           → [Add as sponsor]  [Same as: CAMFED ▾]
//    self-sponsored)
//   Tidy learner records  58 learners: "Parent" → Self-sponsored, "Camfed" → CAMFED … [Update records]
//
// The guidance teacher (or admin) keeps the list. A learner whose Sponsor is
// not on it is self-sponsored.

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Loader2, Plus, Sparkles, X } from 'lucide-react';
import {
  SELF_SPONSORED,
  addAlias,
  addSponsor,
  groupLearnersBySponsor,
  newSponsorProblem,
  removeSponsor,
  selfSponsoredCount,
  sponsorRecordFixes,
  unlistedSponsorNames,
  type SponsorList,
} from '@/services/guidancePlan';
import { applySponsorFixes, saveSponsorList } from '@/services/sponsorListService';
import { SPONSOR_LIST_KEY } from '@/hooks/useSponsorList';
import type { Learner } from '@/types/school';

type Actor = { uid: string; name: string };

export function SponsorListTab({ list, learners, user, onLearnersChanged }: {
  list: SponsorList;
  learners: Learner[];
  user: Actor;
  onLearnersChanged: () => void;
}) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmFix, setConfirmFix] = useState(false);

  const groups = useMemo(() => groupLearnersBySponsor(learners, list), [learners, list]);
  const countOf = (name: string) => groups.find(g => g.name === name)?.count ?? 0;
  const unlisted = useMemo(() => unlistedSponsorNames(learners, list), [learners, list]);
  const selfCount = useMemo(() => selfSponsoredCount(learners, list), [learners, list]);
  const fixes = useMemo(() => sponsorRecordFixes(learners, list), [learners, list]);
  const toSelf = fixes.filter(f => f.to === SELF_SPONSORED).length;
  const addProblem = newName.trim() ? newSponsorProblem(newName, list) : null;

  const save = async (next: SponsorList, done: string, key: string) => {
    setBusy(key);
    setMsg(null);
    try {
      await saveSponsorList(next, user);
      qc.setQueryData(SPONSOR_LIST_KEY, next);
      setMsg({ ok: true, text: done });
      return true;
    } catch (e: any) {
      setMsg({ ok: false, text: e?.code === 'permission-denied' ? 'Only the admin or a guidance officer can change the sponsor list.' : e?.message || 'Could not save.' });
      return false;
    } finally {
      setBusy('');
    }
  };

  const add = async (name: string, key = 'add') => {
    try {
      const next = addSponsor(list, name);
      if (await save(next, `${name.trim()} added to the sponsor list.`, key)) setNewName('');
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    }
  };

  const fixRecords = async () => {
    setBusy('fix');
    setMsg(null);
    try {
      const n = await applySponsorFixes(fixes);
      onLearnersChanged();
      setMsg({ ok: true, text: `${n} learner record${n === 1 ? '' : 's'} updated.` });
      setConfirmFix(false);
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'Could not update the learner records.' });
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-4">
      {msg && (
        <div role="status" className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${msg.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {msg.ok ? <Check size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />} {msg.text}
        </div>
      )}

      {/* ---- The list ---- */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5" aria-label="Sponsors">
        <h2 className="text-base font-semibold text-gray-900">Sponsors</h2>
        <p className="mt-0.5 text-sm text-gray-600">
          Learners count as sponsored only by a sponsor on this list. Anyone else — a parent's name, "Self", blank — is <strong>{SELF_SPONSORED}</strong> ({selfCount} learners now).
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {list.names.map(n => (
            <li key={n} className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 py-1 pl-3 pr-1 text-sm">
              <span className="font-semibold text-gray-900">{n}</span>
              <span className="rounded-full bg-white px-2 text-xs text-gray-600">{countOf(n)}</span>
              {confirmRemove === n ? (
                <span className="flex items-center gap-1 text-xs">
                  <button type="button" onClick={() => save(removeSponsor(list, n), `${n} removed; its learners now count as self-sponsored.`, `rm-${n}`).then(() => setConfirmRemove(null))} className="rounded bg-red-600 px-2 py-0.5 font-medium text-white">
                    {busy === `rm-${n}` ? '…' : 'Remove'}
                  </button>
                  <button type="button" onClick={() => setConfirmRemove(null)} className="rounded px-1.5 py-0.5 text-gray-600 hover:bg-gray-200">Keep</button>
                </span>
              ) : (
                <button type="button" aria-label={`Remove ${n}`} onClick={() => setConfirmRemove(n)} className="rounded-full p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                  <X size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {confirmRemove && countOf(confirmRemove) > 0 && (
          <p className="mt-2 text-xs text-red-700">Removing {confirmRemove} makes its {countOf(confirmRemove)} learners self-sponsored.</p>
        )}
        <form
          className="mt-4 flex flex-wrap items-start gap-2"
          onSubmit={e => {
            e.preventDefault();
            if (!addProblem && newName.trim()) add(newName);
          }}
        >
          <div className="min-w-[220px] flex-1 sm:flex-none">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="New sponsor name"
              aria-label="New sponsor name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            {addProblem && <p className="mt-1 text-xs text-red-600">{addProblem}</p>}
          </div>
          <button type="submit" disabled={!newName.trim() || !!addProblem || busy === 'add'} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
            {busy === 'add' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add sponsor
          </button>
        </form>
      </section>

      {/* ---- Names not on the list ---- */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5" aria-label="Other names typed as sponsor">
        <h2 className="text-base font-semibold text-gray-900">Other names typed as sponsor</h2>
        <p className="mt-0.5 text-sm text-gray-600">
          These are not on the list, so these learners count as self-sponsored. If one is really a sponsor, add it, or mark it as another spelling of a listed sponsor.
        </p>
        {unlisted.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">None — every sponsor typed is on the list.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {unlisted.map(u => (
              <UnlistedRow key={u.key} u={u} list={list} busy={busy} onAdd={() => add(u.name, `add-${u.key}`)} onSame={name => save(addAlias(list, u.name, name), `"${u.name}" now counts as ${name}.`, `alias-${u.key}`)} />
            ))}
          </ul>
        )}
      </section>

      {/* ---- Tidy the records ---- */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5" aria-label="Tidy learner records">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900"><Sparkles size={16} className="text-amber-500" /> Tidy learner records</h2>
        {fixes.length === 0 ? (
          <p className="mt-1 text-sm text-gray-600">Every current learner's Sponsor field already says a listed sponsor or {SELF_SPONSORED}.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-gray-600">
              Write the result into the learners' Sponsor field, so their details, lists and admissions show the same: <strong>{fixes.length}</strong> current learner{fixes.length === 1 ? '' : 's'} —{' '}
              {toSelf} to {SELF_SPONSORED}, {fixes.length - toSelf} to the listed sponsor's name. Past learners are not changed.
            </p>
            <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs text-gray-700">
              {summarise(fixes).map(([from, to, n]) => (
                <li key={`${from}|${to}`} className="py-0.5">
                  {from ? `“${from}”` : <em className="text-gray-500">empty</em>} → <strong>{to}</strong> <span className="text-gray-500">({n})</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {confirmFix ? (
                <>
                  <span className="text-sm text-gray-700">Change {fixes.length} records?</span>
                  <button type="button" onClick={fixRecords} disabled={busy === 'fix'} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                    {busy === 'fix' && <Loader2 size={14} className="animate-spin" />} Yes, update records
                  </button>
                  <button type="button" onClick={() => setConfirmFix(false)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Cancel</button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmFix(true)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50">
                  Update {fixes.length} learner records
                </button>
              )}
            </div>
            {unlisted.length > 0 && (
              <p className="mt-2 text-xs text-amber-700">Add any real sponsor above first — once a record says {SELF_SPONSORED}, the name typed before is gone.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function UnlistedRow({ u, list, busy, onAdd, onSame }: {
  u: ReturnType<typeof unlistedSponsorNames>[number];
  list: SponsorList;
  busy: string;
  onAdd: () => void;
  onSame: (name: string) => void;
}) {
  const canAdd = !newSponsorProblem(u.name, list);
  return (
    <li className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{u.name}</p>
        <p className="text-xs text-gray-500">
          {u.count} learner{u.count === 1 ? '' : 's'}
          {u.spellings.length > 1 && ` · also written ${u.spellings.slice(1).join(', ')}`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canAdd && (
          <button type="button" onClick={onAdd} disabled={!!busy} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50">
            {busy === `add-${u.key}` ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add as sponsor
          </button>
        )}
        <select
          aria-label={`${u.name} is the same as`}
          value=""
          disabled={!!busy}
          onChange={e => e.target.value && onSame(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs"
        >
          <option value="">Same as…</option>
          {list.names.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    </li>
  );
}

/** [from, to, count] for the preview, most common first. */
function summarise(fixes: Array<{ from: string; to: string }>): Array<[string, string, number]> {
  const m = new Map<string, [string, string, number]>();
  for (const f of fixes) {
    const from = f.from.trim().replace(/\s+/g, ' ');
    const k = `${from.toLowerCase()}|${f.to}`;
    const e = m.get(k);
    if (e) e[2]++;
    else m.set(k, [from, f.to, 1]);
  }
  return [...m.values()].sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0]));
}
