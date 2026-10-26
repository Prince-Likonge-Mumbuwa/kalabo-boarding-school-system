// @/services/sponsorListService.ts
//
// The school's sponsor list on Firestore: system/sponsors
//   { names: ['KGS', 'CAMFED', 'CDF', 'AP', 'WISE', …],
//     aliases: { camfedzambia: 'CAMFED', … },   // other spellings → name
//     updatedBy, updatedByName, updatedAt }
// Until it is first saved, the default list is used. Written by the admin or
// a guidance officer (firestore.rules). The matching rules are in
// guidancePlan.ts (resolveSponsor, sponsorRecordFixes…).

import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from '@/lib/auditedFirestore';
import { db } from '@/lib/firebase';
import { defaultSponsorList, type SponsorFix, type SponsorList } from './guidancePlan';

export const SPONSORS_DOC = ['system', 'sponsors'] as const;

export function toSponsorList(d: any): SponsorList {
  if (!d || !Array.isArray(d.names)) return defaultSponsorList();
  const names = Array.from(new Set(d.names.filter((n: unknown) => typeof n === 'string' && n.trim()).map((n: string) => n.trim())));
  const aliases: Record<string, string> = {};
  if (d.aliases && typeof d.aliases === 'object') {
    for (const [k, v] of Object.entries(d.aliases)) if (typeof v === 'string' && names.includes(v)) aliases[k] = v;
  }
  return { names: names as string[], aliases };
}

export async function getSponsorList(): Promise<SponsorList> {
  const snap = await getDoc(doc(db, ...SPONSORS_DOC));
  return toSponsorList(snap.exists() ? snap.data() : null);
}

export async function saveSponsorList(list: SponsorList, by: { uid: string; name: string }): Promise<void> {
  await setDoc(doc(db, ...SPONSORS_DOC), {
    names: list.names,
    aliases: list.aliases,
    updatedBy: by.uid,
    updatedByName: by.name,
    updatedAt: serverTimestamp(),
  });
}

/** Write the tidied Sponsor field to the learners (batches of 400). Returns how many changed. */
export async function applySponsorFixes(fixes: SponsorFix[]): Promise<number> {
  for (let i = 0; i < fixes.length; i += 400) {
    const batch = writeBatch(db);
    for (const f of fixes.slice(i, i + 400)) batch.update(doc(db, 'learners', f.id), { sponsor: f.to });
    await batch.commit();
  }
  return fixes.length;
}
