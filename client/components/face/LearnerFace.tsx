// One learner's face, wherever the learner record is created or edited:
// Add Learner (after saving), Edit Learner, and Admissions (after admitting).
//
// Faces are stored under the learner's document id, so they stay with the
// learner through promotions, transfers and year transitions; learners who
// leave (graduated / transferred out / archived) have their faces deleted by
// the server's face sync. Nothing here is shown when face recognition is
// not available to this user.
import { Suspense, lazy } from 'react';
import { ScanFace } from 'lucide-react';
import { useFaceAccess, useInvalidateFaceStatus, useLearnersFaceStatus } from '@/hooks/useFaceRecognition';
import { faceBadge } from '@/types/face';
import { FaceBadgeChip } from './ClassFaceEnrolment';

// The camera and face models load only when a face is captured.
const FaceEnrolDialog = lazy(() => import('./FaceEnrolDialog').then(m => ({ default: m.FaceEnrolDialog })));

export interface FaceLearner {
  /** learners/{id} */
  id: string;
  studentId: string;
  fullName: string;
  className: string;
}

/** Capture / manage one learner's face. Open while `learner` is set. */
export function LearnerFaceDialog({ learner, onClose }: { learner: FaceLearner | null; onClose: () => void }) {
  const statusQ = useLearnersFaceStatus(learner ? [learner.id] : [], { enabled: !!learner });
  const invalidate = useInvalidateFaceStatus();
  if (!learner) return null;
  return (
    <Suspense fallback={null}>
      <FaceEnrolDialog
        open
        onOpenChange={o => { if (!o) onClose(); }}
        learner={{ id: learner.id, studentId: learner.studentId, name: learner.fullName, className: learner.className }}
        status={statusQ.data?.get(learner.id)}
        onChanged={invalidate}
      />
    </Suspense>
  );
}

/** Edit Learner: the learner's face status and a button to capture or manage it. */
export function LearnerFaceRow({ learner, onOpen }: { learner: FaceLearner; onOpen: () => void }) {
  const { canUse } = useFaceAccess();
  const statusQ = useLearnersFaceStatus([learner.id], { enabled: canUse });
  if (!canUse) return null;
  const badge = statusQ.data ? faceBadge(statusQ.data.get(learner.id)) : null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <span className="text-sm font-medium text-gray-800">Face recognition</span>
      {badge && <FaceBadgeChip badge={badge} />}
      <button
        type="button"
        onClick={onOpen}
        className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
      >
        <ScanFace size={15} /> {badge === 'enrolled' ? 'Manage face' : 'Capture face'}
      </button>
    </div>
  );
}

/** After a learner is created: offer to capture the face straight away. */
export function CaptureFaceNowButton({ onClick }: { onClick: () => void }) {
  const { canUse } = useFaceAccess();
  if (!canUse) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 sm:w-auto"
    >
      <ScanFace size={16} /> Capture face now
    </button>
  );
}
