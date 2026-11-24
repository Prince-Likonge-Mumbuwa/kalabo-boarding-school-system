// @/pages/superadmin/SuperAdminSignIn.tsx — sign-in for the one superAdmin
// account. It is checked by the AI server (ai-server/), not by Firebase, and
// the page is not linked from anywhere: you open /superadmin yourself.
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { Field, TextInput } from '@/components/ai/ui';
import { SCHOOL_LOGO_URL, SCHOOL_MOTTO, SCHOOL_NAME } from '@/components/ai/brand';
import { Button } from '@/components/ui/button';
import { aiConfigured, superAdminApi, superAdminSession } from '@/services/aiApi';

export default function SuperAdminSignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (superAdminSession.isSignedIn()) return <Navigate to="/superadmin/console" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await superAdminApi.login(email.trim(), password);
      navigate('/superadmin/console', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-gray-50 lg:grid-cols-2">
      {/* Brand panel (large screens) */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-gray-900 via-[#16325c] to-blue-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <img src={SCHOOL_LOGO_URL} alt="" aria-hidden className="pointer-events-none absolute -bottom-24 -right-24 h-[28rem] w-[28rem] opacity-10" />
        <div className="relative flex items-center gap-3">
          <img src={SCHOOL_LOGO_URL} alt="" className="h-12 w-12 rounded-xl bg-white p-1" />
          <div>
            <p className="font-semibold">{SCHOOL_NAME}</p>
            <p className="text-sm italic text-blue-100">{SCHOOL_MOTTO}</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white">AI administration</h1>
          <p className="mt-4 text-lg leading-relaxed text-blue-100">
            Manage the curriculum library, switch AI tools on and off, decide who may use them and follow how they are used.
          </p>
        </div>
        <p className="relative text-sm text-blue-200">Restricted area. Every sign-in attempt is limited.</p>
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src={SCHOOL_LOGO_URL} alt="" className="h-11 w-11" />
            <div>
              <p className="text-sm font-semibold text-gray-900">{SCHOOL_NAME}</p>
              <p className="text-xs text-gray-500">AI administration</p>
            </div>
          </div>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100"><ShieldCheck size={24} /></span>
          <h2 className="mt-5 text-2xl font-bold tracking-tight text-gray-900">SuperAdmin sign in</h2>
          <p className="mt-1.5 text-sm text-gray-600">Use the account created for the AI server.</p>

          {!aiConfigured ? (
            <p className="mt-8 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">The AI service has not been set up for this site yet.</p>
          ) : (
            <form onSubmit={submit} className="mt-8 space-y-5">
              <Field label="Email" htmlFor="sa-email">
                <TextInput id="sa-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Password" htmlFor="sa-password">
                <div className="relative">
                  <TextInput id="sa-password" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password}
                    onChange={(e) => setPassword(e.target.value)} className="pr-11" />
                  <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}
                    className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700">
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>
              {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</p>}
              <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl bg-blue-600 text-base font-semibold hover:bg-blue-700">
                {busy && <Loader2 size={18} className="mr-2 animate-spin" />} Sign in
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
