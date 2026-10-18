// Enrol faces for a whole class, one learner after another.
// Used by form teachers (My Class, Attendance Tracking) and admins (Attendance → Face recognition,
// Classes → a class's learners).
//
// The learner list is the class's existing learners (active / no status —
// the same rule as the register). Face status is looked up by learner
// document id, so names and student numbers always show as they are now.
import React, { useMemo, useState } from 'react';
import { Loader2, ScanFace, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLearnersFaceStatus, useInvalidateFaceStatus } from '@/hooks/useFaceRecognition';
import { faceBadge, type FaceBadge } from '@/types/face';
import { FaceEnrolDialog, type EnrolLearner } from './FaceEnrolDialog';

export interface ClassLearner {
  id: string;
  studentId: string;
  fullName: string;
  status?: string;
}

const countedLearner = (l: ClassLearner) => !l.status || l.status === 'active';

export function FaceBadgeChip({ badge, compact }: { badge: FaceBadge; compact?: boolean }) {
  const map: Record<FaceBadge, [string, string]> = {
    'enrolled': ['Face added', 'bg-green-100 text-green-800'],
    'needs-photo': ['Needs photo', 'bg-amber-100 text-amber-800'],
    'no-consent': ['No consent', 'bg-gray-100 text-gray-600'],
  };
  const [label, cls] = map[badge];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${cls}`} title={`Face recognition: ${label}`}>
      <ScanFace size={12} />{!compact && label}
    </span>
  );
}

export function ClassFaceEnrolment({ open, onOpenChange, classId, className, learners }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  className: string;
  learners: ClassLearner[];
}) {
  const ids = useMemo(() => learners.filter(countedLearner).map(l => l.id), [learners]);
  const statusQ = useLearnersFaceStatus(ids, { enabled: open });
  const invalidate = useInvalidateFaceStatus();
  const [filter, setFilter] = useState<'all' | FaceBadge>('all');
  const [search, setSearch] = useState('');
  const [current, setCurrent] = useState<string | null>(null);

  const rows = useMemo(() => learners
    .filter(countedLearner)
    .map(l => ({ ...l, badge: faceBadge(statusQ.data?.get(l.id)) }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName)), [learners, statusQ.data]);

  const counts = useMemo(() => {
    const c = { enrolled: 0, 'needs-photo': 0, 'no-consent': 0 } as Record<FaceBadge, number>;
    for (const r of rows) c[r.badge]++;
    return c;
  }, [rows]);

  const visible = rows.filter(r =>
    (filter === 'all' || r.badge === filter) &&
    (!search || r.fullName.toLowerCase().includes(search.toLowerCase()) || r.studentId.toLowerCase().includes(search.toLowerCase())));

  const learner: EnrolLearner | null = useMemo(() => {
    const l = rows.find(r => r.id === current);
    return l ? { id: l.id, studentId: l.studentId, name: l.fullName, className } : null;
  }, [rows, current, className]);

  // Next learner after the current one who has no face yet (consent or not).
  const next = () => {
    const i = rows.findIndex(r => r.id === current);
    const after = [...rows.slice(i + 1), ...rows.slice(0, Math.max(i, 0))];
    const n = after.find(r => r.badge !== 'enrolled');
    setCurrent(n ? n.id : null);
  };

  return (
    <>
      <Dialog open={open && !current} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ScanFace size={20} /> Face recognition — {className}</DialogTitle>
            <DialogDescription>
              {counts.enrolled} of {rows.length} learners have a face saved.
              {counts['no-consent'] > 0 && ` ${counts['no-consent']} without guardian consent are marked by hand.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 text-sm">
            {([['all', `All (${rows.length})`], ['needs-photo', `Needs photo (${counts['needs-photo']})`], ['no-consent', `No consent (${counts['no-consent']})`], ['enrolled', `Face added (${counts.enrolled})`]] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`rounded-full px-3 py-1 ${filter === k ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >{label}</button>
            ))}
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or student number"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm"
            />
          </div>

          {statusQ.isLoading ? (
            <p className="flex items-center gap-2 py-6 text-sm text-gray-600"><Loader2 size={16} className="animate-spin" /> Loading…</p>
          ) : statusQ.isError ? (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Couldn't load face status. Check the connection and try again.</p>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
              {visible.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setCurrent(r.id)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-blue-50"
                >
                  <span className="w-24 shrink-0 font-mono text-xs text-gray-500">{r.studentId}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{r.fullName}</span>
                  <FaceBadgeChip badge={r.badge} />
                </button>
              ))}
              {visible.length === 0 && <p className="p-4 text-sm text-gray-500">No learners here.</p>}
            </div>
          )}

          {rows.some(r => r.badge !== 'enrolled') && (
            <button
              type="button"
              onClick={() => { const n = rows.find(r => r.badge !== 'enrolled'); if (n) setCurrent(n.id); }}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <ScanFace size={16} /> Start with the first learner who needs a face
            </button>
          )}
        </DialogContent>
      </Dialog>

      <FaceEnrolDialog
        open={open && !!current}
        onOpenChange={o => { if (!o) setCurrent(null); }}
        learner={learner}
        status={current ? statusQ.data?.get(current) : undefined}
        onChanged={invalidate}
        onNext={next}
      />
    </>
  );
}
