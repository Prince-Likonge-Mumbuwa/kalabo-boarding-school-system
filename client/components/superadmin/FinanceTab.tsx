// @/components/superadmin/FinanceTab.tsx — the pilot's books, in ZMW.
// Money in: granting a teacher access counts as their term fee (recorded by
// the AI server, once per teacher per term); payments can also be entered by
// hand. Money out: what was paid to the services the system runs on.
// Nothing is deleted: a wrong entry is voided with a reason and stays listed.
import { useState, type FormEvent } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Download, Receipt, Scale, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardTitle, EmptyState, Field, Pill, Stat, TextInput } from '@/components/ai/ui';
import { superAdminApi } from '@/services/aiApi';
import type { FeePayment, FinanceView, ServicePayment } from '@/types/ai';
import { cn } from '@/lib/utils';
import { useOverviewAction } from './useOverviewAction';

const zmw = (n: number) => `ZMW ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const PROVIDERS = ['DeepInfra', 'NVIDIA', 'Hostinger', 'Cloudflare', 'Domain registration', 'Firebase (Google Cloud)', 'Electricity / internet'];

/** Every entry as one spreadsheet, for the treasurer or an accountant later. */
function exportCsv(finance: FinanceView) {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows: (string | number)[][] = [['Date', 'Type', 'Who', 'Details', 'Term', 'Money in (ZMW)', 'Money out (ZMW)', 'Reference', 'Status']];
  const entries = [
    ...finance.payments.map((p) => ({ date: p.receivedOn, row: [p.receivedOn, 'Teacher fee', p.teacherName, `${p.teacherEmail}${p.source === 'grant' ? ' · recorded on access grant' : ''}${p.note ? ` · ${p.note}` : ''}`, `${p.term} ${p.year}`, p.amount.toFixed(2), '', p.reference ?? '', p.voided ? `VOIDED: ${p.voided.reason}` : 'OK'] })),
    ...finance.expenses.map((e) => ({ date: e.paidOn, row: [e.paidOn, 'Paid to provider', e.provider, e.description, '', '', e.amount.toFixed(2), e.reference ?? '', e.voided ? `VOIDED: ${e.voided.reason}` : 'OK'] })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  rows.push(...entries.map((e) => e.row));
  const blob = new Blob([`﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kalabo-ai-finances-${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** "Void" opens a reason box; the entry stays in the books, out of the totals. */
function VoidControl({ busy, onVoid }: { busy: boolean; onVoid: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-gray-500 underline-offset-2 hover:text-red-700 hover:underline">Void</button>;
  return (
    <form className="flex w-full items-center gap-2 sm:w-auto" onSubmit={(e) => { e.preventDefault(); if (reason.trim().length >= 3) onVoid(reason.trim()); }}>
      <TextInput autoFocus aria-label="Reason for voiding" placeholder="Reason, e.g. entered twice" value={reason} onChange={(e) => setReason(e.target.value)} className="h-8 min-w-0 flex-1 text-xs sm:w-52" />
      <Button type="submit" size="sm" variant="destructive" disabled={busy || reason.trim().length < 3} className="h-8 rounded-lg">Void</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => { setOpen(false); setReason(''); }} className="h-8 rounded-lg">Cancel</Button>
    </form>
  );
}

function VoidedNote({ entry }: { entry: { voided?: { at: string; reason: string } } }) {
  if (!entry.voided) return null;
  return <p className="mt-0.5 text-xs text-red-700">Voided {new Date(entry.voided.at).toLocaleDateString()}: {entry.voided.reason}</p>;
}

export function FinanceTab({ finance }: { finance?: FinanceView }) {
  const { run, busy, error } = useOverviewAction();
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [expense, setExpense] = useState({ paidOn: today(), provider: '', description: '', amount: '', reference: '' });
  const [fee, setFee] = useState('');

  if (!finance)
    return <EmptyState icon={<Wallet size={22} />} title="Finances need the updated AI server">Restart the AI server on the PC so it loads the new version, then reload this page.</EmptyState>;

  const { summary } = finance;
  const current = `${summary.currentTerm.term} ${summary.currentTerm.year}`;
  const thisTerm = summary.byTerm.find((t) => t.term === summary.currentTerm.term && t.year === summary.currentTerm.year);

  const recordFee = (uid: string) => void run(() => superAdminApi.recordFee({
    teacherUid: uid, term: summary.currentTerm.term, year: summary.currentTerm.year, reference: refs[uid]?.trim() || undefined,
  }));
  const addExpense = async (e: FormEvent) => {
    e.preventDefault();
    const amount = Number(expense.amount);
    if (!(amount > 0)) return;
    const done = await run(() => superAdminApi.recordExpense({ ...expense, amount, reference: expense.reference.trim() || undefined }));
    if (done) setExpense({ paidOn: today(), provider: '', description: '', amount: '', reference: '' });
  };
  const saveFee = async (e: FormEvent) => {
    e.preventDefault();
    const amount = Number(fee);
    if (amount > 0 && (await run(() => superAdminApi.setTermFee(amount)))) setFee('');
  };

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</p>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">
          Pilot bookkeeping in ZMW. Granting a teacher access records the term fee of <span className="font-semibold text-gray-900">{zmw(finance.termFee)}</span> for {current}.
        </p>
        <Button variant="outline" onClick={() => exportCsv(finance)} className="h-9 shrink-0 gap-2 rounded-lg"><Download size={16} /> Export CSV</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat icon={<ArrowDownCircle size={20} />} label="Received, all time" value={zmw(summary.received)} hint="Teacher fees" />
        <Stat icon={<ArrowUpCircle size={20} />} label="Paid to providers" value={zmw(summary.paidOut)} hint="All time" />
        <Stat icon={<Scale size={20} />} label="Balance on hand" value={<span className={cn(summary.balance < 0 && 'text-red-700')}>{zmw(summary.balance)}</span>} hint="Received minus paid" />
        <Stat icon={<Wallet size={20} />} label={`Received, ${current}`} value={zmw(thisTerm?.received ?? 0)} hint={`${thisTerm?.teachers ?? 0} teacher${thisTerm?.teachers === 1 ? '' : 's'} paid`} />
      </div>

      {summary.unpaid.length > 0 && (
        <Card padded={false}>
          <div className="p-5 pb-3 sm:p-6 sm:pb-3">
            <CardTitle title={`Not paid for ${current}`} hint="These teachers have access but no fee recorded for this term. Record the payment when you receive it, or withdraw their access." right={<Pill tone="amber">{summary.unpaid.length}</Pill>} />
          </div>
          <ul className="divide-y divide-gray-100 border-t border-gray-200">
            {summary.unpaid.map((t) => (
              <li key={t.uid} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{t.name}</p>
                  <p className="truncate text-xs text-gray-500">{t.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <TextInput aria-label={`Payment reference for ${t.name}`} placeholder="Reference (optional)" value={refs[t.uid] ?? ''} onChange={(e) => setRefs((r) => ({ ...r, [t.uid]: e.target.value }))} className="h-8 min-w-0 flex-1 text-xs sm:w-44" />
                  <Button size="sm" disabled={busy} onClick={() => recordFee(t.uid)} className="h-8 shrink-0 rounded-lg bg-blue-600 hover:bg-blue-700">Record {zmw(finance.termFee)}</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
        <Card padded={false}>
          <div className="p-5 pb-3 sm:p-6 sm:pb-3"><CardTitle title="Fees received" hint="Newest first. Voided entries are struck through and left out of the totals." /></div>
          {finance.payments.length === 0 ? (
            <EmptyState icon={<ArrowDownCircle size={22} />} title="No fees yet">Granting a teacher access in the Access section records their fee here.</EmptyState>
          ) : (
            <ul className="divide-y divide-gray-100 border-t border-gray-200">
              {finance.payments.map((p: FeePayment) => (
                <li key={p.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-start sm:px-6">
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm font-medium text-gray-900', p.voided && 'text-gray-400 line-through')}>{p.teacherName}</p>
                    <p className="truncate text-xs text-gray-500">
                      {day(p.receivedOn)} · {p.term} {p.year} · {p.source === 'grant' ? 'on access grant' : 'entered by hand'}{p.reference ? ` · ref ${p.reference}` : ''}
                    </p>
                    <VoidedNote entry={p} />
                  </div>
                  <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                    <span className={cn('text-sm font-semibold tabular-nums text-green-700', p.voided && 'text-gray-400 line-through')}>{zmw(p.amount)}</span>
                    {!p.voided && <VoidControl busy={busy} onVoid={(reason) => void run(() => superAdminApi.voidFinanceEntry('payment', p.id, reason))} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padded={false}>
          <div className="p-5 pb-4 sm:p-6 sm:pb-4">
            <CardTitle title="Paid to service providers" hint="DeepInfra, Hostinger, the domain… Enter the amount in ZMW as it left your account." />
            <form onSubmit={addExpense} className="grid gap-3 sm:grid-cols-2">
              <Field label="Date" htmlFor="exp-date"><TextInput id="exp-date" type="date" required value={expense.paidOn} max={today()} onChange={(e) => setExpense((x) => ({ ...x, paidOn: e.target.value }))} /></Field>
              <Field label="Paid to" htmlFor="exp-provider">
                <TextInput id="exp-provider" list="finance-providers" required placeholder="e.g. DeepInfra" value={expense.provider} onChange={(e) => setExpense((x) => ({ ...x, provider: e.target.value }))} />
                <datalist id="finance-providers">{PROVIDERS.map((p) => <option key={p} value={p} />)}</datalist>
              </Field>
              <Field label="What for" htmlFor="exp-desc" className="sm:col-span-2"><TextInput id="exp-desc" required placeholder="e.g. API credit top-up, VPS for December" value={expense.description} onChange={(e) => setExpense((x) => ({ ...x, description: e.target.value }))} /></Field>
              <Field label="Amount (ZMW)" htmlFor="exp-amount"><TextInput id="exp-amount" type="number" inputMode="decimal" min="0.01" step="0.01" required value={expense.amount} onChange={(e) => setExpense((x) => ({ ...x, amount: e.target.value }))} /></Field>
              <Field label="Reference" htmlFor="exp-ref" hint="Receipt or invoice number"><TextInput id="exp-ref" value={expense.reference} onChange={(e) => setExpense((x) => ({ ...x, reference: e.target.value }))} /></Field>
              <div className="sm:col-span-2"><Button type="submit" disabled={busy} className="h-9 gap-2 rounded-lg bg-blue-600 hover:bg-blue-700"><Receipt size={16} /> Record payment</Button></div>
            </form>
          </div>
          {finance.expenses.length === 0 ? (
            <EmptyState icon={<ArrowUpCircle size={22} />} title="No provider payments yet" />
          ) : (
            <ul className="divide-y divide-gray-100 border-t border-gray-200">
              {finance.expenses.map((e: ServicePayment) => (
                <li key={e.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-start sm:px-6">
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm font-medium text-gray-900', e.voided && 'text-gray-400 line-through')}>{e.provider}</p>
                    <p className="text-xs text-gray-500">{day(e.paidOn)} · {e.description}{e.reference ? ` · ref ${e.reference}` : ''}</p>
                    <VoidedNote entry={e} />
                  </div>
                  <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                    <span className={cn('text-sm font-semibold tabular-nums text-gray-900', e.voided && 'text-gray-400 line-through')}>{zmw(e.amount)}</span>
                    {!e.voided && <VoidControl busy={busy} onVoid={(reason) => void run(() => superAdminApi.voidFinanceEntry('expense', e.id, reason))} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardTitle title="By term" hint="Provider payments count in the term of the day they were paid." />
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3 font-medium">Term</th>
                  <th className="py-2 pr-3 text-right font-medium">Teachers</th>
                  <th className="py-2 pr-3 text-right font-medium">Received</th>
                  <th className="py-2 pr-3 text-right font-medium">Paid out</th>
                  <th className="py-2 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summary.byTerm.map((t) => {
                  const net = t.received - t.paidOut;
                  return (
                    <tr key={`${t.year}-${t.term}`}>
                      <td className="py-2.5 pr-3 font-medium text-gray-900">{t.term} {t.year}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-gray-600">{t.teachers}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-green-700">{zmw(t.received)}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-gray-700">{zmw(t.paidOut)}</td>
                      <td className={cn('py-2.5 text-right font-semibold tabular-nums', net < 0 ? 'text-red-700' : 'text-gray-900')}>{zmw(net)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardTitle title="Term fee" hint="What one teacher pays per term. Changing it affects new entries only." />
          <form onSubmit={saveFee} className="flex items-end gap-2">
            <Field label="Fee (ZMW)" htmlFor="term-fee" className="flex-1">
              <TextInput id="term-fee" type="number" inputMode="decimal" min="1" step="0.01" placeholder={String(finance.termFee)} value={fee} onChange={(e) => setFee(e.target.value)} />
            </Field>
            <Button type="submit" variant="outline" disabled={busy || !(Number(fee) > 0)} className="h-10 rounded-lg">Save</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
