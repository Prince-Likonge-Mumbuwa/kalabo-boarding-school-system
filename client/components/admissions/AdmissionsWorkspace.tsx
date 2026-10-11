// @/components/admissions/AdmissionsWorkspace.tsx
//
// Shared by the admin page and the admissions officer's page:
//   Admit learner   the enrolment form → automatic class → student id → slip
//   Class progress  how the intake classes are filling (refreshes itself)
//   Admitted        this intake's admissions; reprint a slip; admin cancels
//   Settings        admin only: open/close, levels, places per class, officers

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle,
  ClipboardList,
  Loader2,
  Lock,
  Printer,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  UserPlus,
  XCircle,
} from 'lucide-react';
import type { AdmissionInput, AdmissionRecord, IntakeClass, IntakeLevel, IntakeSettings } from '@/types/admissions';
import {
  chooseClass,
  findPossibleDuplicates,
  isFull,
  levelKey,
  levelLabel,
  levelProgress,
  validateAdmission,
  type ExistingLearnerLite,
} from '@/services/admissionsPlan';
import {
  admitLearner,
  assignAdmissionsOfficer,
  cancelAdmission,
  defaultIntakeYear,
  endAdmissionsOfficer,
  findExistingLearners,
  getIntakeSettings,
  listAdmissions,
  listAdmissionsOfficers,
  loadIntakeClasses,
  recountClasses,
  saveIntakeSettings,
} from '@/services/admissionsService';
import { teacherService } from '@/services/schoolService';
import { printAdmissionSlip } from './admissionSlip';
import { useEmbedded } from '@/components/workspace/embedded';

type Tab = 'admit' | 'progress' | 'admitted' | 'settings';

export interface WorkspaceUser {
  uid: string;
  name: string;
  isAdmin: boolean;
}

const todayYMD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const emptyForm = (level: IntakeLevel, year: number): AdmissionInput => ({
  fullName: '',
  preferredName: '',
  gender: '' as any,
  dateOfBirth: '',
  address: '',
  guardian: '',
  guardianPhone: '',
  guardianRelationship: '',
  alternativeGuardian: '',
  alternativeGuardianPhone: '',
  sponsor: 'Self',
  dateOfFirstEntry: new Date().getFullYear() >= year ? todayYMD() : `${year}-01-01`,
  previousSchool: '',
  previousGrade: '',
  examNumber: '',
  medicalNotes: '',
  allergies: [],
  admissionType: 'new_intake',
  level,
});

export function AdmissionsWorkspace({ user }: { user: WorkspaceUser }) {
  // As a tab of "Admissions & Classes" the workspace shows the title.
  const embedded = useEmbedded();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('admit');
  const yearQ = useQuery({ queryKey: ['admissions', 'defaultYear'], queryFn: defaultIntakeYear });
  const [year, setYear] = useState<number | null>(null);
  useEffect(() => {
    if (year === null && yearQ.data) setYear(yearQ.data);
  }, [yearQ.data, year]);

  const settingsQ = useQuery({
    queryKey: ['admissions', 'settings', year],
    queryFn: () => getIntakeSettings(year!),
    enabled: year !== null,
  });
  const classesQ = useQuery({
    queryKey: ['admissions', 'classes', year, settingsQ.dataUpdatedAt],
    queryFn: () => loadIntakeClasses(settingsQ.data!),
    enabled: !!settingsQ.data,
    refetchInterval: 20_000,
  });
  const admissionsQ = useQuery({
    queryKey: ['admissions', 'list', year],
    queryFn: () => listAdmissions(year!),
    enabled: year !== null,
    refetchInterval: 30_000,
  });

  const refreshAll = () => queryClient.invalidateQueries({ queryKey: ['admissions'] });

  const settings = settingsQ.data;
  const classes = classesQ.data ?? [];

  const tabs: Array<[Tab, string, any]> = [
    ['admit', 'Admit learner', UserPlus],
    ['progress', 'Class progress', BarChart3],
    ['admitted', 'Admitted', ClipboardList],
    ...(user.isAdmin ? [['settings', 'Settings', SettingsIcon] as [Tab, string, any]] : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {!embedded && <h1 className="text-2xl font-bold text-gray-900">Admissions</h1>}
          <p className="text-sm text-gray-600">
            Enrol learners after the physical admission process. Each learner is placed in the class with the most room and gets a student id and a slip.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user.isAdmin ? (
            <label className="text-sm text-gray-700 flex items-center gap-2">
              Intake
              <input
                type="number"
                value={year ?? ''}
                onChange={e => setYear(parseInt(e.target.value) || year)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-24"
              />
            </label>
          ) : (
            year && <span className="text-sm text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-1.5">Intake {year}</span>
          )}
          {settings && (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${settings.isOpen ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>
              {settings.exists ? (settings.isOpen ? 'Open' : 'Closed') : 'Not set up'}
            </span>
          )}
        </div>
      </div>

      {/* Sections of Admissions (a segmented control, so it reads as a
          second level under the workspace's own tabs). */}
      <div className="overflow-x-auto">
        <div role="tablist" aria-label="Admissions sections" className="inline-flex gap-1 rounded-xl bg-gray-100 p-1 min-w-max">
          {tabs.map(([id, label, Icon], i) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              onKeyDown={e => {
                const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
                if (!step) return;
                e.preventDefault();
                const next = tabs[(i + step + tabs.length) % tabs.length][0];
                setTab(next);
                (e.currentTarget.parentElement?.children[(i + step + tabs.length) % tabs.length] as HTMLElement | undefined)?.focus();
              }}
              className={`inline-flex items-center gap-2 min-h-[40px] px-3 sm:px-4 rounded-lg text-sm font-medium whitespace-nowrap
                focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                tab === id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon size={15} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      </div>

      {(yearQ.isLoading || settingsQ.isLoading) && <Loading text="Loading the intake…" />}
      {settingsQ.error && <Banner tone="error">{(settingsQ.error as Error).message}</Banner>}

      {settings && year !== null && (
        <>
          {tab === 'admit' && (
            <AdmitForm
              user={user}
              year={year}
              settings={settings}
              classes={classes}
              classesLoading={classesQ.isLoading}
              onAdmitted={refreshAll}
              goToSettings={() => setTab('settings')}
            />
          )}
          {tab === 'progress' && <Progress settings={settings} classes={classes} loading={classesQ.isLoading} admissions={admissionsQ.data ?? []} />}
          {tab === 'admitted' && <AdmittedList user={user} records={admissionsQ.data ?? []} loading={admissionsQ.isLoading} onChanged={refreshAll} />}
          {tab === 'settings' && user.isAdmin && (
            <IntakeSettingsPanel key={year} user={user} settings={settings} classes={classes} onSaved={refreshAll} />
          )}
        </>
      )}
    </div>
  );
}

// ==================== ADMIT ====================

function AdmitForm(props: {
  user: WorkspaceUser;
  year: number;
  settings: IntakeSettings & { exists: boolean };
  classes: IntakeClass[];
  classesLoading: boolean;
  onAdmitted: () => void;
  goToSettings: () => void;
}) {
  const { user, year, settings, classes } = props;
  const [form, setForm] = useState<AdmissionInput>(() => emptyForm(settings.levels[0], year));
  const [allergiesText, setAllergiesText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dupes, setDupes] = useState<ExistingLearnerLite[] | null>(null);
  const [done, setDone] = useState<{ record: AdmissionRecord; reason: string } | null>(null);

  useEffect(() => {
    if (!settings.levels.some(l => levelKey(l) === levelKey(form.level))) {
      setForm(f => ({ ...f, level: settings.levels[0] }));
    }
  }, [settings.levels, form.level]);

  const set = <K extends keyof AdmissionInput>(k: K, v: AdmissionInput[K]) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => {
      const n = { ...e };
      delete n[k as string];
      return n;
    });
  };

  const preview = useMemo(
    () => (form.gender ? chooseClass(classes, form.level, form.gender) : null),
    [classes, form.level, form.gender]
  );
  const levelClasses = classes.filter(c => c.type === form.level.type && c.level === form.level.level && !c.excluded);
  const allFull = levelClasses.length > 0 && levelClasses.every(isFull);

  if (!settings.exists) {
    return (
      <Card title="Admissions are not set up">
        <p className="text-sm text-gray-700">
          {user.isAdmin
            ? `Set up the ${year} intake first: choose the levels and places per class.`
            : `The admin has not set up admissions for ${year} yet.`}
        </p>
        {user.isAdmin && <button onClick={props.goToSettings} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Open settings</button>}
      </Card>
    );
  }
  if (!settings.isOpen && !user.isAdmin) {
    return (
      <Card title="Admissions are closed">
        <p className="text-sm text-gray-700 flex items-center gap-2"><Lock size={15} /> The admin has closed admissions for {year}.</p>
      </Card>
    );
  }

  if (done) {
    const r = done.record;
    return (
      <Card title="Learner admitted">
        <div className="flex items-start gap-3">
          <CheckCircle className="text-green-600 shrink-0" size={28} />
          <div className="space-y-1 text-sm">
            <p className="text-lg font-semibold text-gray-900">{r.fullName}</p>
            <p>Class: <b>{r.className}</b> · Student ID: <b className="font-mono">{r.studentId}</b> · Admission No.: <b>{r.admissionNumber}</b></p>
            <p className="text-gray-600">{done.reason}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-5">
          <button onClick={() => printAdmissionSlip(r)} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
            <Printer size={15} /> Print admission slip
          </button>
          <button
            onClick={() => {
              setDone(null);
              setForm(emptyForm(form.level, year));
              setAllergiesText('');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <UserPlus size={15} /> Admit next learner
          </button>
        </div>
      </Card>
    );
  }

  const save = async (skipDuplicateCheck = false) => {
    setError('');
    const input: AdmissionInput = {
      ...form,
      allergies: allergiesText.split(',').map(a => a.trim()).filter(Boolean),
    };
    const v = validateAdmission(input);
    setErrors(v);
    if (Object.keys(v).length) {
      setError('Please correct the highlighted fields.');
      return;
    }
    setSaving(true);
    try {
      if (!skipDuplicateCheck) {
        const existing = await findExistingLearners(input);
        const matches = findPossibleDuplicates(input, existing);
        if (matches.length > 0) {
          setDupes(matches);
          setSaving(false);
          return;
        }
      }
      setDupes(null);
      const out = await admitLearner(input, year, { uid: user.uid, name: user.name }, { isAdmin: user.isAdmin });
      setDone({ record: out.record, reason: out.placementReason });
      props.onAdmitted();
    } catch (e: any) {
      setError(e?.message || 'Could not save the admission.');
    } finally {
      setSaving(false);
    }
  };

  const input = (k: keyof AdmissionInput, label: string, opts: { type?: string; required?: boolean; placeholder?: string } = {}) => (
    <Field label={label} required={opts.required} error={errors[k as string]}>
      <input
        type={opts.type ?? 'text'}
        value={(form[k] as any) ?? ''}
        placeholder={opts.placeholder}
        onChange={e => set(k, e.target.value as any)}
        className={`w-full border rounded-lg px-3 py-2 text-sm ${errors[k as string] ? 'border-red-400' : 'border-gray-300'}`}
      />
    </Field>
  );

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        {!settings.isOpen && <Banner tone="warn">Admissions are closed for officers. As admin you can still admit.</Banner>}

        <Card title="Learner">
          <div className="grid sm:grid-cols-2 gap-4">
            {input('fullName', 'Full name', { required: true, placeholder: 'First name and surname' })}
            {input('preferredName', 'Preferred name')}
            <Field label="Gender" required error={errors.gender}>
              <div className="flex gap-2">
                {(['male', 'female'] as const).map(g => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => set('gender', g)}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm ${form.gender === g ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 bg-white'}`}
                  >
                    {g === 'male' ? 'Male' : 'Female'}
                  </button>
                ))}
              </div>
            </Field>
            {input('dateOfBirth', 'Date of birth', { type: 'date', required: true })}
            {input('address', 'Home address', { required: true })}
            {input('examNumber', 'ECZ exam number', { placeholder: 'Last national exam' })}
            {input('previousSchool', 'Previous school')}
            {input('previousGrade', 'Last grade/form completed')}
          </div>
        </Card>

        <Card title="Guardian and sponsor">
          <div className="grid sm:grid-cols-2 gap-4">
            {input('guardian', 'Guardian name', { required: true })}
            {input('guardianRelationship', 'Relationship', { placeholder: 'e.g. Mother, Uncle' })}
            {input('guardianPhone', 'Guardian phone', { required: true, type: 'tel', placeholder: '097…' })}
            {input('sponsor', 'Sponsor', { required: true, placeholder: 'Self, Government Bursary, NGO…' })}
            {input('alternativeGuardian', 'Second guardian')}
            {input('alternativeGuardianPhone', 'Second guardian phone', { type: 'tel' })}
          </div>
        </Card>

        <Card title="Health">
          <div className="grid sm:grid-cols-2 gap-4">
            {input('medicalNotes', 'Medical notes')}
            <Field label="Allergies (comma separated)">
              <input value={allergiesText} onChange={e => setAllergiesText(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </Field>
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card title="Placement">
          <div className="space-y-4">
            <Field label="Admitting into" required>
              <select
                value={levelKey(form.level)}
                onChange={e => set('level', settings.levels.find(l => levelKey(l) === e.target.value)!)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {settings.levels.map(l => <option key={levelKey(l)} value={levelKey(l)}>{levelLabel(l)}</option>)}
              </select>
            </Field>
            <Field label="Admission type">
              <select value={form.admissionType} onChange={e => set('admissionType', e.target.value as any)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="new_intake">New intake</option>
                <option value="transfer_in">Transfer from another school</option>
              </select>
            </Field>
            {input('dateOfFirstEntry', 'First day at school', { type: 'date', required: true })}

            {user.isAdmin && (
              <Field label="Class (admin)">
                <select
                  value={form.classIdOverride ?? ''}
                  onChange={e => set('classIdOverride', e.target.value || undefined)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Automatic (most room)</option>
                  {levelClasses.map(c => (
                    <option key={c.id} value={c.id} disabled={isFull(c)}>
                      {c.name} — {c.total}/{c.capacity}{isFull(c) ? ' (full)' : ''}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm">
              {props.classesLoading ? (
                <span className="flex items-center gap-2 text-blue-800"><Loader2 size={14} className="animate-spin" /> Checking classes…</span>
              ) : levelClasses.length === 0 ? (
                <span className="text-red-700">No active {levelLabel(form.level)} classes. {user.isAdmin ? 'Create them in Class Management.' : 'Tell the admin.'}</span>
              ) : allFull ? (
                <span className="text-red-700">All {levelLabel(form.level)} classes are full.</span>
              ) : form.classIdOverride ? (
                <span className="text-blue-900">Will be placed in <b>{levelClasses.find(c => c.id === form.classIdOverride)?.name}</b> (chosen by admin).</span>
              ) : preview ? (
                <span className="text-blue-900">Will be placed in <b>{classes.find(c => c.id === preview.classId)?.name}</b>. {preview.reason}</span>
              ) : (
                <span className="text-blue-900">Choose the gender to see the class.</span>
              )}
              <p className="text-xs text-blue-800 mt-1">The class and student id are confirmed when you save.</p>
            </div>
          </div>
        </Card>

        {dupes && (
          <Card title="Already on the system?">
            <p className="text-sm text-amber-900 flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> These learners look similar:</p>
            <ul className="text-sm mt-2 space-y-1">
              {dupes.map(d => (
                <li key={d.id} className="text-gray-800">
                  <b>{d.fullName}</b> · {d.className || 'no class'} · <span className="font-mono">{d.studentId || '—'}</span>
                  {d.dateOfBirth ? ` · born ${d.dateOfBirth}` : ''}{d.status && d.status !== 'active' ? ` · ${d.status}` : ''}
                </li>
              ))}
            </ul>
            <div className="flex gap-2 mt-3">
              <button onClick={() => save(true)} disabled={saving} className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm">It's a different learner — admit</button>
              <button onClick={() => setDupes(null)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm">Go back</button>
            </div>
          </Card>
        )}

        {error && <Banner tone="error">{error}</Banner>}
        <button
          onClick={() => save(false)}
          disabled={saving || allFull || levelClasses.length === 0 || !!dupes}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Save and generate student ID
        </button>
      </div>
    </div>
  );
}

// ==================== PROGRESS ====================

function Progress({ settings, classes, loading, admissions }: { settings: IntakeSettings; classes: IntakeClass[]; loading: boolean; admissions: AdmissionRecord[] }) {
  const levels = levelProgress(classes, settings.levels);
  const live = admissions.filter(a => a.status === 'admitted');
  const today = new Date().toDateString();
  const todayCount = live.filter(a => a.admittedAt && new Date(a.admittedAt).toDateString() === today).length;
  const byOfficer = new Map<string, number>();
  for (const a of live) byOfficer.set(a.admittedByName || '—', (byOfficer.get(a.admittedByName || '—') ?? 0) + 1);

  if (loading) return <Loading text="Counting learners…" />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Admitted this intake" value={live.length} />
        <Stat label="Admitted today" value={todayCount} />
        <Stat label="Places left" value={levels.reduce((n, l) => n + l.remaining, 0)} />
        <Stat label="Cancelled" value={admissions.length - live.length} />
      </div>

      {levels.map(lp => (
        <Card key={levelKey(lp.level)} title={`${lp.label}: ${lp.total} of ${lp.capacity} places`} subtitle={`${lp.male} boys · ${lp.female} girls · difference between fullest and emptiest class: ${lp.spread}`}>
          {lp.classes.length === 0 ? (
            <p className="text-sm text-gray-600">No active {lp.label} classes.</p>
          ) : (
            <div className="space-y-3">
              {lp.classes.map(c => {
                const pct = c.capacity ? Math.min(100, Math.round((c.total / c.capacity) * 100)) : 0;
                const boys = c.capacity ? (c.male / c.capacity) * 100 : 0;
                const girls = c.capacity ? (c.female / c.capacity) * 100 : 0;
                return (
                  <div key={c.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-900">
                        {c.name}
                        {c.excluded && <span className="ml-2 text-xs text-gray-500">(not used for placement)</span>}
                        {isFull(c) && !c.excluded && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">full</span>}
                      </span>
                      <span className="text-gray-700">{c.total}/{c.capacity} · {pct}% · {c.male}B {c.female}G</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex" title={`${c.male} boys, ${c.female} girls`}>
                      <div className="h-full bg-blue-500" style={{ width: `${boys}%` }} />
                      <div className="h-full bg-pink-400" style={{ width: `${girls}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-4 text-xs text-gray-600 pt-1">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" /> Boys</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-pink-400 inline-block" /> Girls</span>
              </div>
            </div>
          )}
        </Card>
      ))}

      {byOfficer.size > 0 && (
        <Card title="Admissions by officer">
          <ul className="text-sm space-y-1">
            {[...byOfficer.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => (
              <li key={name} className="flex justify-between max-w-sm"><span>{name}</span><b>{n}</b></li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-xs text-gray-500">Updates every 20 seconds.</p>
    </div>
  );
}

// ==================== ADMITTED ====================

function AdmittedList({ user, records, loading, onChanged }: { user: WorkspaceUser; records: AdmissionRecord[]; loading: boolean; onChanged: () => void }) {
  const [search, setSearch] = useState('');
  const [cancelling, setCancelling] = useState<AdmissionRecord | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const s = search.trim().toLowerCase();
  const shown = records.filter(r =>
    !s || r.fullName.toLowerCase().includes(s) || r.studentId.toLowerCase().includes(s) ||
    r.admissionNumber.toLowerCase().includes(s) || r.className.toLowerCase().includes(s)
  );

  const doCancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    setError('');
    try {
      await cancelAdmission(cancelling.id, reason.trim(), { uid: user.uid, name: user.name });
      setCancelling(null);
      setReason('');
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Could not cancel.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={`Admitted (${records.filter(r => r.status === 'admitted').length})`}>
      <div className="relative mb-4 w-72 max-w-full">
        <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, student id, admission no., class" className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-full" />
      </div>
      {error && <Banner tone="error">{error}</Banner>}
      {loading ? <Loading text="Loading…" /> : shown.length === 0 ? (
        <p className="text-sm text-gray-600">No admissions{s ? ' match' : ' yet'}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">Adm. No.</th>
                <th className="py-2 pr-3">Learner</th>
                <th className="py-2 pr-3">Student ID</th>
                <th className="py-2 pr-3">Class</th>
                <th className="py-2 pr-3">Officer</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.id} className={`border-b last:border-0 ${r.status === 'cancelled' ? 'text-gray-400' : ''}`}>
                  <td className="py-1.5 pr-3 font-mono text-xs">{r.admissionNumber}</td>
                  <td className="py-1.5 pr-3">
                    {r.fullName}
                    {r.status === 'cancelled' && <span className="ml-2 text-xs text-red-600">cancelled</span>}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-xs">{r.studentId}</td>
                  <td className="py-1.5 pr-3">{r.className}</td>
                  <td className="py-1.5 pr-3">{r.admittedByName}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{r.admittedAt ? new Date(r.admittedAt).toLocaleDateString('en-GB') : ''}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap text-right">
                    <button onClick={() => printAdmissionSlip(r)} className="inline-flex items-center gap-1 text-blue-600 text-xs mr-3"><Printer size={13} /> Slip</button>
                    {user.isAdmin && r.status === 'admitted' && (
                      <button onClick={() => setCancelling(r)} className="inline-flex items-center gap-1 text-red-600 text-xs"><XCircle size={13} /> Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cancelling && (
        <div className="mt-4 border border-red-200 bg-red-50 rounded-lg p-3 text-sm space-y-2">
          <p className="font-medium text-red-900">Cancel the admission of {cancelling.fullName} ({cancelling.studentId})?</p>
          <p className="text-red-900">The learner is archived, the place in {cancelling.className} is freed, and the admission number is not used again.</p>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (e.g. entered twice)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" />
          <div className="flex gap-2">
            <button onClick={doCancel} disabled={busy} className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm disabled:opacity-50">
              {busy && <Loader2 size={14} className="animate-spin" />} Cancel admission
            </button>
            <button onClick={() => setCancelling(null)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">Keep</button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ==================== SETTINGS ====================

function IntakeSettingsPanel({ user, settings, classes, onSaved }: { user: WorkspaceUser; settings: IntakeSettings & { exists: boolean }; classes: IntakeClass[]; onSaved: () => void }) {
  const [draft, setDraft] = useState(() => ({
    isOpen: settings.isOpen,
    levels: settings.levels,
    defaultCapacity: settings.defaultCapacity,
    capacities: { ...settings.capacities },
    excludedClassIds: [...settings.excludedClassIds],
  }));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const allLevels: IntakeLevel[] = [
    ...[1, 2, 3, 4, 5].map(level => ({ type: 'form' as const, level })),
    ...[8, 9, 10, 11, 12].map(level => ({ type: 'grade' as const, level })),
  ];
  const hasLevel = (l: IntakeLevel) => draft.levels.some(x => levelKey(x) === levelKey(l));

  // Classes of the chosen levels (loaded for the saved levels; newly ticked
  // levels show their classes after saving).
  const shownClasses = classes.filter(c => hasLevel({ type: c.type, level: c.level }));

  const save = async () => {
    setSaving(true);
    setError('');
    setMsg('');
    try {
      await saveIntakeSettings({ year: settings.year, ...draft }, { uid: user.uid, name: user.name });
      setMsg('Saved.');
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card title={`${settings.year} intake`}>
        <div className="space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={draft.isOpen} onChange={e => setDraft(d => ({ ...d, isOpen: e.target.checked }))} />
            <span><b>Admissions open</b> — officers can admit learners</span>
          </label>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Levels officers admit into</p>
            <div className="flex flex-wrap gap-2">
              {allLevels.map(l => (
                <label key={levelKey(l)} className={`text-sm px-3 py-1.5 border rounded-lg cursor-pointer ${hasLevel(l) ? 'bg-blue-50 border-blue-300 text-blue-800' : 'border-gray-300'}`}>
                  <input
                    type="checkbox"
                    className="mr-1.5"
                    checked={hasLevel(l)}
                    onChange={e => setDraft(d => ({
                      ...d,
                      levels: e.target.checked ? [...d.levels, l] : d.levels.filter(x => levelKey(x) !== levelKey(l)),
                    }))}
                  />
                  {levelLabel(l)}
                </label>
              ))}
            </div>
          </div>
          <Field label="Places per class">
            <input
              type="number"
              min={1}
              value={draft.defaultCapacity}
              onChange={e => setDraft(d => ({ ...d, defaultCapacity: parseInt(e.target.value) || 0 }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28"
            />
          </Field>
        </div>
      </Card>

      <Card title="Classes" subtitle="Change the places of a class, or leave a class out of automatic placement.">
        {shownClasses.length === 0 ? (
          <p className="text-sm text-gray-600">No active classes at these levels. Save the levels, or create classes in Class Management.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">Class</th>
                <th className="py-2 pr-3">Learners</th>
                <th className="py-2 pr-3">Places</th>
                <th className="py-2 pr-3">Use for placement</th>
              </tr>
            </thead>
            <tbody>
              {shownClasses.map(c => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-3 font-medium">{c.name}</td>
                  <td className="py-1.5 pr-3">{c.total}</td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="number"
                      min={1}
                      placeholder={String(draft.defaultCapacity)}
                      value={draft.capacities[c.id] ?? ''}
                      onChange={e => {
                        const v = parseInt(e.target.value);
                        setDraft(d => {
                          const caps = { ...d.capacities };
                          if (v > 0) caps[c.id] = v;
                          else delete caps[c.id];
                          return { ...d, capacities: caps };
                        });
                      }}
                      className="border border-gray-300 rounded px-2 py-1 text-sm w-20"
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="checkbox"
                      checked={!draft.excludedClassIds.includes(c.id)}
                      onChange={e => setDraft(d => ({
                        ...d,
                        excludedClassIds: e.target.checked ? d.excludedClassIds.filter(x => x !== c.id) : [...d.excludedClassIds, c.id],
                      }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button
          onClick={async () => { await recountClasses(shownClasses.map(c => c.id)); onSaved(); setMsg('Class counts refreshed.'); }}
          className="mt-3 inline-flex items-center gap-2 text-sm text-gray-600 underline"
        >
          <RefreshCw size={13} /> Refresh stored class counts
        </button>
      </Card>

      {error && <Banner tone="error">{error}</Banner>}
      {msg && <Banner tone="ok">{msg}</Banner>}
      <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
        {saving && <Loader2 size={14} className="animate-spin" />} Save settings
      </button>

      <OfficersPanel user={user} />
    </div>
  );
}

export function OfficersPanel({ user }: { user: WorkspaceUser }) {
  const queryClient = useQueryClient();
  const officersQ = useQuery({ queryKey: ['admissions', 'officers'], queryFn: listAdmissionsOfficers });
  const teachersQ = useQuery({ queryKey: ['admissions', 'teachers'], queryFn: () => teacherService.getTeachers() });
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const active = (officersQ.data ?? []).filter(o => o.status === 'active');
  const activeIds = new Set(active.map(o => o.teacherId));
  const candidates = (teachersQ.data ?? [])
    .filter(t => !activeIds.has(t.id) && (t.status ?? 'active') === 'active')
    .sort((a, b) => a.name.localeCompare(b.name));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ['admissions', 'officers'] });
      await queryClient.invalidateQueries({ queryKey: ['staffRoles'] });
    } catch (e: any) {
      setError(e?.message || 'Could not update.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Admissions officers" subtitle="Teachers who may enrol learners. They see Admissions in their menu.">
      {error && <Banner tone="error">{error}</Banner>}
      {active.length === 0 ? <p className="text-sm text-gray-600">No admissions officers yet.</p> : (
        <ul className="divide-y divide-gray-100 text-sm">
          {active.map(o => (
            <li key={o.id} className="flex items-center justify-between py-2">
              <span>
                <b>{o.teacherName}</b>
                <span className="text-gray-500"> · since {o.startDate ? o.startDate.toLocaleDateString('en-GB') : '—'}</span>
              </span>
              <button
                disabled={busy}
                onClick={() => run(() => endAdmissionsOfficer(o.teacherId, { uid: user.uid, name: user.name }))}
                className="text-xs text-red-600 underline disabled:opacity-50"
              >
                Remove role
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 mt-4">
        <select value={pick} onChange={e => setPick(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[14rem]">
          <option value="">Choose a teacher…</option>
          {candidates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button
          disabled={!pick || busy}
          onClick={() => {
            const t = candidates.find(x => x.id === pick)!;
            run(async () => {
              await assignAdmissionsOfficer({ id: t.id, name: t.name, email: t.email }, { uid: user.uid, name: user.name });
              setPick('');
            });
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Make admissions officer
        </button>
      </div>
    </Card>
  );
}

// ==================== SMALL UI ====================

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {subtitle && <p className="text-sm text-gray-600 mt-0.5">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}{required && <span className="text-red-500"> *</span>}</span>
      {children}
      {error && <span className="block text-xs text-red-600 mt-1">{error}</span>}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
      <div className="text-xs text-gray-600">{label}</div>
      <div className="text-xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function Banner({ tone, children }: { tone: 'ok' | 'warn' | 'error'; children: React.ReactNode }) {
  const cls = tone === 'ok' ? 'bg-green-50 border-green-200 text-green-800'
    : tone === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-900'
      : 'bg-red-50 border-red-200 text-red-800';
  return <div className={`border text-sm rounded-lg p-3 ${cls}`}>{children}</div>;
}

function Loading({ text }: { text: string }) {
  return <div className="flex items-center gap-2 text-gray-600 text-sm"><Loader2 size={16} className="animate-spin" /> {text}</div>;
}
