// @/components/ai/figures/Figure.tsx — one figure in a document: the drawing,
// then "Figure n" and its title underneath (as on ECZ papers).
//
// What the AI server found when it checked the figure (problems, and the
// answers it worked out) shows under the drawing on screen only: the
// `data-screen-only` box is removed before printing and from the Word file.
import { useEffect, useState } from 'react';
import type { FigureSpec } from './spec';
import { renderFigure, type Rendered } from './render';

const WIDTH = { small: '48%', medium: '68%', large: '100%' } as const;

export function Figure({ spec, number }: { spec: FigureSpec; number: number }) {
  const [out, setOut] = useState<Rendered | null>(null);
  const key = JSON.stringify(spec);
  useEffect(() => {
    let live = true;
    setOut(null);
    renderFigure(spec).then((r) => live && setOut(r));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const size = spec.size ?? (spec.type === 'map' || spec.type === 'diagram' || spec.type === 'scene' ? 'large' : spec.type === 'molecule' || spec.type === 'solid' ? 'small' : 'medium');
  const problems = [...(spec._check?.problems ?? []), ...(out?.problems ?? [])];
  const answers = Object.entries(spec._check?.answers ?? {});
  return (
    <figure className="doc-figure">
      <div className="doc-figure-art" data-figure style={{ width: WIDTH[size] }}
        // The SVG is built by our own drawers from escaped text (or by MathJax/Mermaid in strict mode).
        dangerouslySetInnerHTML={{ __html: out?.svg ?? '' }} />
      {!out && <div className="doc-figure-wait">Drawing figure {number}…</div>}
      <figcaption className="doc-figure-cap">Figure {number}{spec.title ? `: ${spec.title}` : ''}</figcaption>
      {(problems.length > 0 || answers.length > 0) && (
        <div data-screen-only className="doc-figure-check">
          {problems.length > 0 && (
            <p><strong>Check this figure:</strong> {[...new Set(problems)].join(' ')}</p>
          )}
          {answers.length > 0 && (
            <p><strong>Worked out from the figure:</strong> {answers.map(([k, v]) => `${k} = ${v}`).join('; ')}</p>
          )}
          <p className="doc-figure-note">Shown here only. Not printed or exported.</p>
        </div>
      )}
    </figure>
  );
}
