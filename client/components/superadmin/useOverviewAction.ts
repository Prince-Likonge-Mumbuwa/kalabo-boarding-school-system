// @/components/superadmin/useOverviewAction.ts — runs one superAdmin change
// (flip a switch, grant access, upload, delete), then reloads the console's
// data so every tab shows the new state. Returns the error text, if any.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useOverviewAction() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError('');
    try {
      return await action();
    } catch (err) {
      setError((err as Error).message);
      return undefined;
    } finally {
      setBusy(false);
      // Same key as OVERVIEW_KEY in @/pages/superadmin/SuperAdminConsole.
      await queryClient.invalidateQueries({ queryKey: ['superadmin-overview'] });
    }
  };

  return { run, busy, error };
}
