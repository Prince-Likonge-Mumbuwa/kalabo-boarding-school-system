// @/pages/superadmin/SuperAdminSignIn.tsx — sign-in for the one superAdmin
// account. It is checked by the AI server (ai-server/), not by Firebase, and
// the page is not linked from anywhere: you open /superadmin yourself.
//
// The look matches the console: the school's navy and sky blue, the crest as
// a large watermark behind everything, slowly drifting light, and a frosted
// sign-in card. Motion stops for anyone who asks their device to reduce it.
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { BarChart3, Eye, EyeOff, Library, Loader2, Lock, ShieldCheck, Sparkles, Users, Wallet } from 'lucide-react';
import { Field, TextInput } from '@/components/ai/ui';
import { SCHOOL_LOGO_URL, SCHOOL_MOTTO, SCHOOL_NAME } from '@/components/ai/brand';
import { Button } from '@/components/ui/button';
import { TiltCard } from '@/components/superadmin/fx';
import { aiConfigured, superAdminApi, superAdminSession } from '@/services/aiApi';

const HIGHLIGHTS = [
  { icon: Library, title: 'Curriculum library', text: 'Syllabi, teaching modules and textbooks the AI writes from.' },
  { icon: Sparkles, title: 'AI tools', text: 'Lesson plans, schemes, assessments, records and learner notes.' },
  { icon: Users, title: 'Access', text: 'Decide which teachers may use the tools.' },
  { icon: Wallet, title: 'Finances', text: 'Term fees received and what the services cost.' },
  { icon: BarChart3, title: 'Usage', text: 'See which tools teachers use, and how much.' },
];

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
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#081427] via-[#16325c] to-[#2a6fa8] text-white">
      {/* Background: the crest as a big watermark, drifting light, a fine dot grid */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <img src={SCHOOL_LOGO_URL} alt=""
          // The crest picture has a white background: "multiply" makes the white vanish, so only its lines show, as a deep imprint.
          className="absolute left-1/2 top-1/2 h-[115vmin] w-[115vmin] max-w-none -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.35] mix-blend-multiply [filter:grayscale(1)_contrast(1.2)] lg:left-[30%]" />
        <span className="absolute -left-24 -top-24 h-[26rem] w-[26rem] rounded-full bg-[#5bb4dd]/25 blur-3xl motion-safe:animate-float" />
        <span className="absolute -bottom-32 right-[-6rem] h-[30rem] w-[30rem] rounded-full bg-indigo-400/20 blur-3xl motion-safe:animate-float-slow" />
        <span className="absolute right-1/3 top-1/4 h-40 w-40 rounded-full bg-sky-300/10 blur-2xl motion-safe:animate-float-slow" />
        <span className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:24px_24px]" />
        <span className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#081427]/60 to-transparent" />
      </div>

      <div className="relative mx-auto grid min-h-screen max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16">
        {/* Welcome */}
        <section className="motion-safe:animate-rise">
          <div className="flex items-center gap-3.5">
            <span className="relative">
              <span aria-hidden className="absolute -inset-2 rounded-2xl bg-[#5bb4dd]/40 blur-lg" />
              <img src={SCHOOL_LOGO_URL} alt="" className="relative h-14 w-14 rounded-2xl bg-white p-1 shadow-xl" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{SCHOOL_NAME}</p>
              <p className="truncate text-sm italic text-[#9fd6ef]">{SCHOOL_MOTTO}</p>
            </div>
          </div>

          <p className="mt-10 text-xs font-semibold uppercase tracking-[0.25em] text-[#9fd6ef]">AI command centre</p>
          <h1 className="mt-3 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
            Teaching <span className="bg-gradient-to-r from-[#9fd6ef] to-white bg-clip-text text-transparent">powered by AI</span>, run from one place.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-blue-100/80 sm:text-lg">
            Manage the curriculum library, switch AI tools on and off, decide who may use them, and keep the books for the pilot.
          </p>

          <ul className="mt-8 hidden max-w-xl grid-cols-2 gap-3 sm:grid">
            {HIGHLIGHTS.map((h, i) => {
              const Icon = h.icon;
              return (
                <li key={h.title} style={{ animationDelay: `${150 + i * 70}ms` }}
                  className={`${i === HIGHLIGHTS.length - 1 && HIGHLIGHTS.length % 2 ? 'col-span-2 ' : ''}flex gap-3 rounded-2xl bg-white/[0.06] p-3.5 ring-1 ring-inset ring-white/10 backdrop-blur-sm transition hover:bg-white/[0.1] motion-safe:animate-rise`}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#5bb4dd] to-[#2a6fa8] shadow-lg shadow-black/20"><Icon size={17} /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{h.title}</span>
                    <span className="block text-xs leading-snug text-blue-100/70">{h.text}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Sign-in card */}
        <section className="mx-auto w-full max-w-md motion-safe:animate-rise [animation-delay:120ms]">
          <TiltCard max={4}>
            <div className="relative overflow-hidden rounded-3xl bg-white/95 p-7 text-gray-900 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)] ring-1 ring-white/60 backdrop-blur-xl sm:p-9">
              <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#5bb4dd]/20 blur-2xl" />
              <div className="relative" style={{ transform: 'translateZ(24px)' }}>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2a6fa8] to-[#16325c] text-white shadow-lg shadow-[#16325c]/30"><ShieldCheck size={24} /></span>
                <h2 className="mt-5 text-2xl font-bold tracking-tight text-[#16325c]">Sign in</h2>
                <p className="mt-1.5 text-sm text-gray-600">SuperAdmin only. Use the account created for the AI server.</p>

                {!aiConfigured ? (
                  <p className="mt-8 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">The AI service has not been set up for this site yet.</p>
                ) : (
                  <form onSubmit={submit} className="mt-7 space-y-5">
                    <Field label="Email" htmlFor="sa-email">
                      <TextInput id="sa-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
                    </Field>
                    <Field label="Password" htmlFor="sa-password">
                      <div className="relative">
                        <TextInput id="sa-password" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password}
                          onChange={(e) => setPassword(e.target.value)} className="h-11 pr-11" />
                        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}
                          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700">
                          {show ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </Field>
                    {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</p>}
                    <Button type="submit" disabled={busy}
                      className="group h-12 w-full rounded-xl bg-gradient-to-r from-[#16325c] via-[#1f4f8a] to-[#2a6fa8] text-base font-semibold shadow-lg shadow-[#16325c]/30 transition hover:brightness-110 hover:shadow-xl">
                      {busy ? <Loader2 size={18} className="mr-2 animate-spin" /> : <Lock size={16} className="mr-2 transition group-hover:scale-110" />} Sign in
                    </Button>
                  </form>
                )}
                <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-gray-500">
                  <ShieldCheck size={13} className="text-emerald-600" /> Restricted area. Every sign-in attempt is limited.
                </p>
              </div>
            </div>
          </TiltCard>
        </section>
      </div>
    </div>
  );
}
