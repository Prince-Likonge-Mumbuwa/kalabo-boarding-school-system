// geneticsMath.ts — works out a monohybrid genetic cross, the way O Level
// Biology sets it: simple dominance ("Tt"), sex-linked genes ("X^H X^h",
// "X^h Y") and the ABO blood groups ("I^A I^O"), with or without phenotype
// names for the alleles.
//
// Used twice, like figureMath.ts:
//   client/components/ai/figures/geneticsMath.ts   (draws the cross)
//   ai-server/src/services/figures/geneticsMath.ts (writes the answers into the key)
// KEEP THE TWO COPIES IDENTICAL.

export interface Cross {
  parents: [string[], string[]];
  gametes: [string[], string[]];
  /** Four offspring, one per pair of gametes (first parent's gamete first). */
  offspring: string[][];
  kind: 'simple' | 'sex-linked' | 'abo';
}

/** "Tt" → ["T","t"]; "X^H X^h" → ["X^H","X^h"]; "XhY" → ["X^h","Y"]; "IAIO" → ["I^A","I^O"]. */
export function parseGenotype(g: string): string[] {
  const s = g.replace(/\s+/g, '');
  const out: string[] = [];
  for (let i = 0; i < s.length;) {
    if ((s[i] === 'X' || s[i] === 'I') && (s[i + 1] === '^' || (s[i] === 'X' && /[A-Za-z]/.test(s[i + 1] ?? '') && s[i + 1] !== 'X' && s[i + 1] !== 'Y') || (s[i] === 'I' && /[ABO]/.test(s[i + 1] ?? '')))) {
      const j = s[i + 1] === '^' ? i + 2 : i + 1;
      out.push(`${s[i]}^${s[j]}`);
      i = j + 1;
    } else if (s[i] === 'Y') { out.push('Y'); i++; } else { out.push(s[i]); i++; }
  }
  return out;
}

const kindOf = (alleles: string[]): Cross['kind'] => (alleles.some((a) => a.startsWith('X^') || a === 'Y') ? 'sex-linked' : alleles.some((a) => a.startsWith('I^')) ? 'abo' : 'simple');

/** Dominant first, as genotypes are written (Tt, not tT; X^H X^h; X before Y; I^A before I^O). */
export function sortAlleles(a: string[]): string[] {
  const rank = (x: string) => (x === 'Y' ? 3 : x.startsWith('I^O') ? 2 : x.startsWith('X^') || x.startsWith('I^') ? (x.slice(2) === x.slice(2).toUpperCase() ? 0 : 1) : x === x.toUpperCase() ? 0 : 1);
  return [...a].sort((p, q) => rank(p) - rank(q) || p.localeCompare(q));
}

export function cross(p1: string, p2: string): Cross {
  const a = parseGenotype(p1), b = parseGenotype(p2);
  const offspring: string[][] = [];
  for (const x of a) for (const y of b) offspring.push(sortAlleles([x, y]));
  return { parents: [a, b], gametes: [a, b], offspring, kind: kindOf([...a, ...b]) };
}

export const show = (alleles: string[]) => alleles.join(alleles.some((x) => x.length > 1) ? ' ' : '');

/** The phenotype of one genotype. `traits` names alleles: { "T": "tall", "t": "short" } or { "H": "normal", "h": "haemophilia" }. */
export function phenotype(g: string[], traits: Record<string, string> = {}): string {
  const k = kindOf(g);
  if (k === 'abo') {
    const s = new Set(g.map((x) => x.slice(2).toUpperCase()));
    return `blood group ${s.has('A') && s.has('B') ? 'AB' : s.has('A') ? 'A' : s.has('B') ? 'B' : 'O'}`;
  }
  const name = (allele: string) => traits[allele] ?? traits[allele.toUpperCase()] ?? allele;
  if (k === 'sex-linked') {
    const xs = g.filter((x) => x.startsWith('X^')).map((x) => x.slice(2));
    const male = g.includes('Y');
    const dom = xs.find((x) => x === x.toUpperCase());
    if (male) return `${traits[xs[0]] ?? (xs[0] === xs[0].toUpperCase() ? 'normal' : 'affected')} male`;
    if (dom && xs.some((x) => x !== x.toUpperCase())) return `${traits[dom] ?? 'normal'} female (carrier)`;
    return `${traits[dom ?? xs[0]] ?? (dom ? 'normal' : 'affected')} female`;
  }
  const dom = g.find((x) => x === x.toUpperCase());
  return name(dom ?? g[0]);
}

/** "3 tall : 1 short" style ratios, in order of first appearance. */
export function ratio(items: string[]): string {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  const all = [...counts.values()];
  const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);
  const g = all.reduce(gcd);
  return [...counts.entries()].map(([k, v]) => `${v / g} ${k}`).join(' : ');
}
