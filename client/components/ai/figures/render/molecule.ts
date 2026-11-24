// @/components/ai/figures/render/molecule.ts — a structural formula drawn
// from SMILES with smiles-drawer, in black and white. The AI may give only a
// name; the AI server then looks the structure up (PubChem) and adds the
// SMILES before the document reaches the page.
import type { MoleculeSpec } from '../spec';
import { esc, FONT, INK } from './svg';

type SD = typeof import('smiles-drawer').default;
let loading: Promise<SD> | null = null;

export async function renderMolecule(spec: MoleculeSpec): Promise<{ svg: string; problems: string[] }> {
  if (!spec.smiles) return { svg: '', problems: [`No structure was found for ${spec.name ?? 'this molecule'}.`] };
  loading ??= import('smiles-drawer').then((m) => (m.default ?? m) as SD);
  const SmilesDrawer = await loading;
  const W = 340, H = 240;
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('width', String(W));
  el.setAttribute('height', String(H));
  el.style.cssText = 'position:absolute;left:-9999px;top:0';
  document.body.appendChild(el);
  try {
    const drawer = new SmilesDrawer.SvgDrawer({ width: W, height: H, bondThickness: 1.2, fontFamily: FONT, fontSizeLarge: 13, fontSizeSmall: 9, padding: 18, explicitHydrogens: false, terminalCarbons: true, compactDrawing: false,
      themes: { bw: { C: INK, O: INK, N: INK, F: INK, CL: INK, BR: INK, I: INK, P: INK, S: INK, B: INK, SI: INK, H: INK, BACKGROUND: '#fff' } } } as never);
    await new Promise<void>((resolve, reject) =>
      SmilesDrawer.parse(spec.smiles!, (tree) => { try { drawer.draw(tree, el as never, 'bw' as never); resolve(); } catch (e) { reject(e); } }, (e) => reject(e)));
    if (!el.getAttribute('viewBox')) el.setAttribute('viewBox', `0 0 ${W} ${H}`);
    el.removeAttribute('style');
    el.setAttribute('x', '0');
    el.setAttribute('y', '0');
    const inner = new XMLSerializer().serializeToString(el);
    // The drawing, with the letter (if any) underneath it.
    const extra = spec.label ? 26 : 0;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H + extra}" width="${W}" height="${H + extra}"><rect width="100%" height="100%" fill="#fff"/>${inner}${
      spec.label ? `<text x="${W / 2}" y="${H + 18}" text-anchor="middle" font-family="${esc(FONT)}" font-size="16" font-weight="bold" fill="${INK}">${esc(spec.label)}</text>` : ''}</svg>`;
    return { svg, problems: [] };
  } catch (err) {
    return { svg: '', problems: [`The structure could not be drawn: ${(err as Error)?.message ?? err}`] };
  } finally {
    el.remove();
  }
}
