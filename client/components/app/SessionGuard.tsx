// Ends a sign-in session after 2 hours (see lib/session.ts) and clears
// cached data whenever the signed-in person changes.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { SESSION_ENDING_EVENT, minutesLeft, sessionState, signInTime } from '@/lib/session';

export function SessionGuard() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [remaining, setRemaining] = useState<number | null>(null);
  const ending = useRef(false);
  const lastUid = useRef<string | null>(null);
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  // A different person (or nobody) now: never show the previous person's cached data.
  const uid = user?.uid ?? null;
  useEffect(() => {
    if (lastUid.current !== uid) {
      if (lastUid.current !== null) qc.clear();
      lastUid.current = uid;
    }
  }, [uid, qc]);

  useEffect(() => {
    if (!uid) { setRemaining(null); ending.current = false; return; }
    const check = async () => {
      const s = sessionState(signInTime(auth.currentUser));
      setRemaining(s.warn ? s.remainingMs : null);
      if (!s.expired || ending.current) return;
      ending.current = true;
      // Pages save what is unsaved to this device (registers, marks) now.
      window.dispatchEvent(new Event(SESSION_ENDING_EVENT));
      qc.clear();
      try { await logoutRef.current(); } catch { /* signed out anyway */ }
      navigate('/signin', {
        replace: true,
        state: { message: 'Your session ended after 2 hours. Please sign in again — unsaved registers and marks on this device are kept for you.' },
      });
    };
    check();
    const id = window.setInterval(check, 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [uid, qc, navigate]);

  if (remaining === null) return null;
  return (
    <div role="status" className="fixed inset-x-2 bottom-2 z-[60] mx-auto flex max-w-lg items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg sm:bottom-4">
      <Clock size={18} className="mt-0.5 flex-shrink-0" />
      <span>
        Your session ends in <b>{minutesLeft(remaining)} minute{minutesLeft(remaining) === 1 ? '' : 's'}</b>. Save your work — you will need to sign in again.
      </span>
    </div>
  );
}
