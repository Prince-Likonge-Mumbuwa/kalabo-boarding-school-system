// @/pages/admin/TimetableBuilder.tsx
//
// The school timetable generator. Used by admins (Attendance & Timetable →
// Timetable) and by the HoDs an admin allows to generate (their menu →
// Timetable Builder). Tabs:
//   Readiness    departments' allocations complete? levels set up?
//   Curriculum   subjects per level, class exceptions, rooms, events
//   Generate     capacity check, then generate a draft
//   Timetables   drafts and the published timetable: review, edit, PDFs;
//                admins publish (teachers then see it at once)
// Generating never changes what teachers see; only publishing does.

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarRange, ClipboardCheck, ListChecks, Loader2, RefreshCw, Table2, Wand2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useGeneratorInputs, useInvalidateBuilder } from '@/hooks/useTimetableBuilder';
import { formatTermLabel, getCurrentAcademicTerm, getNextAcademicTerm, type TermName } from '@/utils/academicTerm';
import { BuilderContext, Notice } from '@/components/timetable/builder/shared';
import { ReadinessPanel } from '@/components/timetable/builder/ReadinessPanel';
import { CurriculumPanel } from '@/components/timetable/builder/CurriculumPanel';
import { GeneratePanel } from '@/components/timetable/builder/GeneratePanel';
import { VersionsPanel } from '@/components/timetable/builder/VersionsPanel';

const TABS = [
  { id: 'readiness', label: 'Readiness', icon: ClipboardCheck },
  { id: 'curriculum', label: 'Curriculum', icon: ListChecks },
  { id: 'generate', label: 'Generate', icon: Wand2 },
  { id: 'timetables', label: 'Timetables', icon: Table2 },
] as const;
type TabId = typeof TABS[number]['id'];

export default function TimetableBuilder() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: TabId = (TABS.find(t => t.id === params.get('tt'))?.id ?? 'readiness') as TabId;
  const openId = params.get('v');
  const setTab = (id: TabId, v?: string | null) => {
    const next = new URLSearchParams(params);
    next.set('tt', id);
    if (v) next.set('v', v);
    else next.delete('v');
    setParams(next, { replace: false });
  };

  const now = getCurrentAcademicTerm();
  const next = getNextAcademicTerm(now);
  const terms = [now, next];
  const [termKey, setTermKey] = useState(`${now.term}|${now.year}`);
  const [term, yearStr] = termKey.split('|');
  const year = Number(yearStr);

  const inputsQ = useGeneratorInputs();
  const invalidate = useInvalidateBuilder();
  const isAdmin = user?.userType === 'admin';
  const actor = useMemo(() => ({ uid: user?.uid ?? '', name: user?.fullName ?? 'Admin' }), [user]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-700"><CalendarRange size={14} /> School timetable</p>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Timetable generator</h1>
          <p className="text-sm text-gray-600">Built from the HoDs' allocations. Teachers receive the published timetable; they no longer submit their own.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Term"
            value={termKey}
            onChange={e => { setTermKey(e.target.value); setTab(tab === 'timetables' ? 'timetables' : tab, null); }}
            className="min-h-[40px] rounded-lg border border-gray-300 bg-white px-2 text-sm"
          >
            {terms.map(t => <option key={`${t.term}|${t.year}`} value={`${t.term}|${t.year}`}>{formatTermLabel(t.term, t.year)}</option>)}
          </select>
          <button type="button" onClick={invalidate} aria-label="Refresh" className="min-h-[40px] rounded-lg border border-gray-300 bg-white px-2.5 text-gray-600 hover:bg-gray-50">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-flex min-w-max gap-1 rounded-xl border border-gray-200 bg-white p-1" role="tablist" aria-label="Timetable generator">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium ${tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {inputsQ.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Loading classes, allocations and the curriculum…</p>
      ) : inputsQ.error || !inputsQ.data ? (
        <Notice tone="error">Could not load: {(inputsQ.error as Error)?.message ?? 'unknown error'}</Notice>
      ) : (
        <BuilderContext.Provider value={{ term: term as TermName, year, isAdmin, actor, inputs: inputsQ.data, refresh: invalidate }}>
          {tab === 'readiness' && <ReadinessPanel onOpenCurriculum={() => setTab('curriculum')} />}
          {tab === 'curriculum' && <CurriculumPanel />}
          {tab === 'generate' && <GeneratePanel onOpenVersion={id => setTab('timetables', id)} onOpenReadiness={() => setTab('readiness')} />}
          {tab === 'timetables' && <VersionsPanel openId={openId} onOpen={id => setTab('timetables', id)} />}
        </BuilderContext.Provider>
      )}
    </div>
  );
}
