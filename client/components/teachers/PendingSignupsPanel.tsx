// Teacher Management → teachers who signed up and wait for an administrator.
// Until approved they can sign in but see only a "waiting for approval" page.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, UserPlus, X } from 'lucide-react';
import { approveSignup, declineSignup, listPendingSignups, type PendingSignup } from '@/services/signupApprovalService';

export const PENDING_SIGNUPS_KEY = ['users', 'pending-signups'];

export function PendingSignupsPanel({ adminName, onDone }: { adminName: string; onDone?: (msg: string, ok: boolean) => void }) {
  const qc = useQueryClient();
  const { data = [], isLoading, isError, refetch } = useQuery({ queryKey: PENDING_SIGNUPS_KEY, queryFn: listPendingSignups, staleTime: 60_000 });
  const [busy, setBusy] = useState<string | null>(null);

  const act = useMutation({
    mutationFn: async ({ s, approve }: { s: PendingSignup; approve: boolean }) => {
      setBusy(s.id);
      if (approve) await approveSignup(s.id, adminName);
      else await declineSignup(s.id, adminName);
    },
    onSuccess: (_r, { s, approve }) => {
      qc.invalidateQueries({ queryKey: PENDING_SIGNUPS_KEY });
      qc.invalidateQueries({ queryKey: ['teachers'] });
      onDone?.(approve ? `${s.fullName} can now use the system.` : `${s.fullName}'s sign-up was declined.`, true);
    },
    onError: (e: any) => onDone?.(e?.message || 'Could not save. Try again.', false),
    onSettled: () => setBusy(null),
  });

  if (isLoading || (!isError && data.length === 0)) return null;

  return (
    <section className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4" aria-label="Sign-ups waiting for approval">
      <div className="mb-3 flex items-center gap-2">
        <UserPlus size={18} className="text-blue-700" />
        <h2 className="text-sm font-semibold text-blue-900">
          {isError ? 'Sign-ups waiting for approval' : `${data.length} teacher sign-up${data.length === 1 ? '' : 's'} waiting for approval`}
        </h2>
      </div>
      {isError ? (
        <p className="text-sm text-red-700">
          Could not load sign-ups. <button className="underline" onClick={() => refetch()}>Try again</button>
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-blue-900">
            Approve only people you know are teachers at this school. Until approved, they can see nothing in the system.
          </p>
          <ul className="space-y-2">
            {data.map(s => (
              <li key={s.id} className="flex flex-col gap-2 rounded-lg border border-blue-100 bg-white p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-gray-900">{s.fullName}</p>
                  <p className="truncate text-xs text-gray-600">
                    {[s.email, s.tsNumber && `TS ${s.tsNumber}`, s.employeeNumber && `Emp. ${s.employeeNumber}`].filter(Boolean).join(' · ')}
                  </p>
                  {(s.subjects.length > 0 || s.createdAt) && (
                    <p className="text-xs text-gray-500">
                      {s.subjects.join(', ')}
                      {s.subjects.length > 0 && s.createdAt ? ' · ' : ''}
                      {s.createdAt && `signed up ${s.createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => act.mutate({ s, approve: false })}
                    disabled={busy !== null}
                    aria-label={`Decline ${s.fullName}`}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <X size={14} /> Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => act.mutate({ s, approve: true })}
                    disabled={busy !== null}
                    aria-label={`Approve ${s.fullName}`}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {busy === s.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
