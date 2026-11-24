// @/services/schoolStatementsService.ts — the Vision and Mission statements
// that open every teacher's eFile (sections 1 and 2), written once by an
// admin in Settings and read by every teacher.
//
// Firestore: system/school_statements
//   { ministry:    { vision, mission },
//     school:      { vision, mission },
//     departments: { 'Mathematics': { vision, mission }, … },   // optional, per department
//     updatedBy, updatedByName, updatedAt }
//
// firestore.rules already lets any signed-in user read system/* and only an
// admin write it, so no rules change is needed.
import { doc, getDoc, serverTimestamp, setDoc } from '@/lib/auditedFirestore';
import { db } from '@/lib/firebase';

export const STATEMENTS_DOC = ['system', 'school_statements'] as const;

export interface Statement { vision: string; mission: string }

export interface SchoolStatements {
  ministry: Statement;
  school: Statement;
  /** Department name -> its own statements (only departments that have them). */
  departments: Record<string, Statement>;
  updatedByName?: string;
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const statementOf = (v: any): Statement => ({ vision: text(v?.vision), mission: text(v?.mission) });

export function emptyStatements(): SchoolStatements {
  return { ministry: { vision: '', mission: '' }, school: { vision: '', mission: '' }, departments: {} };
}

export function toStatements(d: any): SchoolStatements {
  if (!d || typeof d !== 'object') return emptyStatements();
  const departments: Record<string, Statement> = {};
  if (d.departments && typeof d.departments === 'object')
    for (const [name, s] of Object.entries(d.departments)) {
      const st = statementOf(s);
      if (st.vision || st.mission) departments[name] = st;
    }
  return { ministry: statementOf(d.ministry), school: statementOf(d.school), departments, updatedByName: text(d.updatedByName) || undefined };
}

export async function getSchoolStatements(): Promise<SchoolStatements> {
  const snap = await getDoc(doc(db, ...STATEMENTS_DOC));
  return toStatements(snap.exists() ? snap.data() : null);
}

export async function saveSchoolStatements(s: SchoolStatements, by: { uid: string; name: string }): Promise<void> {
  const clean = toStatements(s);
  await setDoc(doc(db, ...STATEMENTS_DOC), {
    ministry: clean.ministry,
    school: clean.school,
    departments: clean.departments,
    updatedBy: by.uid,
    updatedByName: by.name,
    updatedAt: serverTimestamp(),
  });
}
