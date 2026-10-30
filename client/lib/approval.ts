// Teachers who sign up on the website wait for an administrator.
// users/{uid}.status: 'pending' → 'active' (approved) or 'rejected' (declined).
export const WAITING_STATUSES: readonly string[] = ['pending', 'rejected'];

/** Is this account still waiting for (or refused) approval? */
export const isAwaitingApproval = (status: string | null | undefined) => WAITING_STATUSES.includes(status ?? '');
