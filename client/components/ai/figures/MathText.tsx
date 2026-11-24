// @/components/ai/figures/MathText.tsx — a piece of TeX shown as maths.
// Until MathJax has loaded (or if the TeX has a mistake) the TeX itself is
// shown, so nothing is ever lost.
import { useEffect, useState } from 'react';
import { texToSvg } from './render/math';

export function MathText({ tex, display = false }: { tex: string; display?: boolean }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setFailed(false);
    texToSvg(tex, display).then((s) => live && setSvg(s), () => live && setFailed(true));
    return () => { live = false; };
  }, [tex, display]);
  if (svg && !failed)
    return display
      ? <div className="doc-math-display" data-math dangerouslySetInnerHTML={{ __html: svg }} />
      : <span className="doc-math" data-math dangerouslySetInnerHTML={{ __html: svg }} />;
  const raw = tex.replace(/^\\displaystyle\s*/, '');
  return display ? <div className="doc-math-display doc-math-raw">{raw}</div> : <span className="doc-math-raw">{raw}</span>;
}
