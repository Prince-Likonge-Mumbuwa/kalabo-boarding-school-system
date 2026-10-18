// Is a newer version of the app published?
//
// Each build writes /version.json with its build id and bakes the same id
// into the code (__APP_VERSION__). An open tab compares the two: when the
// server has a different id, a new version was published since this tab
// loaded. (Dev server: no version.json — never "outdated".)

declare const __APP_VERSION__: string;

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export async function fetchPublishedVersion(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetcher(`/version.json?t=${Date.now()}`, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
    if (!res.ok) return null;
    if (!(res.headers.get('content-type') || '').includes('json')) return null; // the app page answered: no version file
    const d = await res.json();
    return typeof d?.version === 'string' && d.version ? d.version : null;
  } catch {
    return null;
  }
}

export function isOutdated(published: string | null, running = APP_VERSION): boolean {
  return !!published && running !== 'dev' && published !== running;
}
