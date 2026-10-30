// Headers for calls to our Cloud Functions that require sign-in (the SMS
// functions): JSON + the signed-in user's Firebase token. The function checks
// the token and that the user is an administrator.
// Firebase is loaded on first use (pages and tests that only import the SMS
// service never start it).
export async function authJsonHeaders(): Promise<Record<string, string>> {
  const { auth } = await import('@/lib/firebase');
  const token = await auth.currentUser?.getIdToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
