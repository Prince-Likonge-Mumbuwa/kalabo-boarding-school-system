// @/components/ai/figures/render/mermaid.ts — flowcharts, cycles, network
// topologies, structures and other box-and-arrow diagrams, from Mermaid text
// the AI writes. Black and white, Times-like font, no HTML inside labels
// (htmlLabels: false), so the picture is pure SVG that prints and exports.
// Blank boxes are just letters in the Mermaid text ("A[A]"); the answers
// sit in the spec's `blanks`, not in the picture.
import type { DiagramSpec } from '../spec';
import { FONT } from './svg';

type MermaidApi = typeof import('mermaid').default;
let loading: Promise<MermaidApi> | null = null;
let count = 0;

async function load(): Promise<MermaidApi> {
  const mermaid = (await import('mermaid')).default;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    htmlLabels: false,
    flowchart: { htmlLabels: false, curve: 'basis' },
    fontFamily: FONT,
    themeVariables: {
      fontFamily: FONT, fontSize: '15px',
      primaryColor: '#ffffff', primaryTextColor: '#000000', primaryBorderColor: '#000000',
      lineColor: '#000000', secondaryColor: '#ffffff', tertiaryColor: '#ffffff',
      clusterBkg: '#ffffff', clusterBorder: '#000000', edgeLabelBackground: '#ffffff', textColor: '#000000',
      noteBkgColor: '#ffffff', noteBorderColor: '#000000', actorBkg: '#ffffff', actorBorder: '#000000',
    },
  });
  return mermaid;
}

export async function renderDiagram(spec: DiagramSpec): Promise<{ svg: string; problems: string[] }> {
  loading ??= load();
  const mermaid = await loading;
  const problems: string[] = [];
  // The AI sometimes colours boxes ("style A fill:#f9f", classDef …): papers are
  // black and white, so those lines are dropped before drawing.
  const text = withoutColour(spec.mermaid);
  try {
    await mermaid.parse(text);
  } catch (err) {
    return { svg: '', problems: [`The diagram description has a mistake: ${(err as Error).message.split('\n')[0]}`] };
  }
  const { svg } = await mermaid.render(`kbs-mmd-${++count}`, text);
  for (const letter of Object.keys(spec.blanks ?? {}))
    if (!new RegExp(`>\\s*${letter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<`).test(svg)) problems.push(`Letter ${letter} is not shown in the diagram.`);
  return { svg, problems };
}

/** Removes Mermaid styling lines (style, classDef, class, linkStyle) and ":::name" class tags. */
export function withoutColour(mermaid: string): string {
  return mermaid
    .split('\n')
    .filter((line) => !/^\s*(style|classDef|class|linkStyle)\s/.test(line))
    .join('\n')
    .replace(/:::[\w-]+/g, '')
    .trim();
}
