/**
 * Looks up a compound by name on PubChem (the US National Library of
 * Medicine's free chemistry database): its structure as SMILES, its
 * molecular formula and mass. Used when the AI names a molecule in a figure,
 * so the drawing is the real structure, never one the AI made up.
 * Answers are kept in memory while the server runs.
 */
export interface Compound { smiles: string; formula: string; weight: string; iupac?: string }

const cache = new Map<string, Promise<Compound | null | "offline">>();
const PROPS = "SMILES,ConnectivitySMILES,IsomericSMILES,CanonicalSMILES,MolecularFormula,MolecularWeight,IUPACName";

/** The compound, null when PubChem does not know the name, or "offline" when PubChem could not be reached. */
export function lookupCompound(name: string): Promise<Compound | null | "offline"> {
  const key = name.trim().toLowerCase();
  if (!key) return Promise.resolve(null);
  let hit = cache.get(key);
  if (!hit) {
    hit = (async () => {
      try {
        const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(key)}/property/${PROPS}/JSON`;
        let response: Response;
        try { response = await fetch(url, { signal: AbortSignal.timeout(8000) }); } catch { return "offline" as const; }
        if (response.status === 404 || response.status === 400) return null;
        if (!response.ok) return "offline" as const;
        const body = (await response.json()) as { PropertyTable?: { Properties?: Record<string, string | number>[] } };
        const p = body.PropertyTable?.Properties?.[0];
        const smiles = String(p?.SMILES ?? p?.IsomericSMILES ?? p?.CanonicalSMILES ?? p?.ConnectivitySMILES ?? "");
        if (!p || !smiles) return null;
        return { smiles, formula: String(p.MolecularFormula ?? ""), weight: String(p.MolecularWeight ?? ""), iupac: p.IUPACName ? String(p.IUPACName) : undefined };
      } catch {
        return null;
      }
    })();
    cache.set(key, hit);
    hit.then((v) => { if (!v || v === "offline") setTimeout(() => cache.delete(key), 60_000); }); // a failed lookup may be retried later
  }
  return hit;
}
