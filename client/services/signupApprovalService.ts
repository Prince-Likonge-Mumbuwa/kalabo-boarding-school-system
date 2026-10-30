// Teachers who sign up on the website wait for an administrator.
// users/{uid}.status: 'pending' → 'active' (approved) or 'rejected' (declined).
// Firestore rules treat a pending / declined account as not signed in:
// it sees only its own profile until approved.
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from '@/lib/auditedFirestore';
import { db } from '@/lib/firebase';

export type ApprovalStatus = 'pending' | 'rejected';
export { WAITING_STATUSES, isAwaitingApproval } from '@/lib/approval';

export interface PendingSignup {
  id: string;
  fullName: string;
  email: string;
  tsNumber: string;
  employeeNumber: string;
  nrc: string;
  subjects: string[];
  createdAt: Date | null;
}

const toDate = (v: any): Date | null => (v?.toDate ? v.toDate() : v instanceof Date ? v : typeof v === 'string' ? new Date(v) : null);

/** Teachers waiting for approval, newest first. */
export async function listPendingSignups(): Promise<PendingSignup[]> {
  const snap = await getDocs(query(collection(db, 'users'), where('status', '==', 'pending')));
  return snap.docs
    .map(d => {
      const x = d.data() as Record<string, any>;
      return {
        id: d.id,
        fullName: x.fullName || 'Unknown',
        email: x.email || '',
        tsNumber: x.tsNumber || '',
        employeeNumber: x.employeeNumber || '',
        nrc: x.nrc || '',
        subjects: Array.isArray(x.subjects) ? x.subjects : [],
        createdAt: toDate(x.createdAt),
        userType: x.userType,
      };
    })
    .filter(x => x.userType === 'teacher')
    .map(({ userType: _u, ...rest }) => rest)
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

export async function approveSignup(uid: string, byName: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { status: 'active', approvedAt: serverTimestamp(), approvedByName: byName, updatedAt: serverTimestamp() });
}

export async function declineSignup(uid: string, byName: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { status: 'rejected', rejectedAt: serverTimestamp(), rejectedByName: byName, updatedAt: serverTimestamp() });
}
