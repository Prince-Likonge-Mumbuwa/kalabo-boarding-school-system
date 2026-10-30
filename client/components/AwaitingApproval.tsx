// Shown instead of the dashboard to a teacher whose sign-up an administrator
// has not approved yet (or declined). The database is closed to them.
import { Clock, LogOut, RefreshCw, XCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export function AwaitingApproval({ status }: { status: string }) {
  const { user, logout } = useAuth();
  const declined = status === 'rejected';
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <div className={`mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full ${declined ? 'bg-red-100' : 'bg-amber-100'}`}>
          {declined ? <XCircle size={28} className="text-red-600" /> : <Clock size={28} className="text-amber-600" />}
        </div>
        <h1 className="text-lg font-bold text-gray-900">{declined ? 'Sign-up not approved' : 'Waiting for approval'}</h1>
        <p className="mt-2 text-sm text-gray-600">
          {declined
            ? 'The school administrator did not approve this account. If you teach at this school, please speak to the administration office.'
            : `Thank you${user?.fullName ? `, ${user.fullName}` : ''}. Your account has been created. An administrator must approve it before you can use the system. Please let the administration office know.`}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {!declined && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
            >
              <RefreshCw size={16} /> Check again
            </button>
          )}
          <button
            type="button"
            onClick={() => logout()}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
