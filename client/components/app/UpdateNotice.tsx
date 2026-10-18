// Keeps every device on the newest version without clearing the cache.
//
//  - Checks /version.json every 5 minutes, when the app comes back to the
//    screen, and on every page change.
//  - When a new version is published: the next page change loads it (a full
//    load of the page being opened), and a banner offers "Update now".
//  - Also asks the service worker to update itself.
// Unsaved registers and marks are kept on the device, so a reload loses nothing.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { fetchPublishedVersion, isOutdated } from '@/lib/appVersion';

const CHECK_EVERY_MS = 5 * 60_000;

export function UpdateNotice() {
  const [outdated, setOutdated] = useState(false);
  const location = useLocation();
  const first = useRef(true);
  const outdatedRef = useRef(false);

  const check = useCallback(async () => {
    try { (await navigator.serviceWorker?.getRegistration?.())?.update?.(); } catch { /* no service worker */ }
    const published = await fetchPublishedVersion();
    if (isOutdated(published)) { outdatedRef.current = true; setOutdated(true); }
  }, []);

  useEffect(() => {
    check();
    const id = window.setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', check);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', check); };
  }, [check]);

  // Page change: if a new version is waiting, load the page fresh.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (outdatedRef.current) { window.location.reload(); return; }
    check();
  }, [location.pathname, check]);

  if (!outdated) return null;
  return (
    <div role="status" className="fixed inset-x-2 top-2 z-[60] mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900 shadow-lg">
      <RefreshCw size={16} className="flex-shrink-0" />
      <span className="flex-1">A new version of the app is ready.</span>
      <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
        Update now
      </button>
    </div>
  );
}
