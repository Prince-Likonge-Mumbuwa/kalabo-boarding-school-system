// @/components/ai/figures/render/math.ts — turns TeX written by the AI into
// SVG, with MathJax: fractions, powers and subscripts, roots, Greek letters,
// vectors and matrices, and chemical equations with \ce{...} (mhchem).
//
//   inline:  $x^2 + 3x - 4 = 0$        display:  $$\frac{a}{b}$$
//   chemistry: $\ce{2H2 + O2 -> 2H2O}$
//
// The output is plain SVG (no web fonts: fontCache 'none' puts every glyph
// in the picture), so it prints, and the Word export can turn it into a PNG.
// MathJax is large, so it is loaded the first time a document has maths.
//
// Safety: only the base, AMS, mhchem and colour-free packages are loaded,
// so TeX cannot make links or run anything (\href, \html are not available).

type Converter = (tex: string, display: boolean) => string;
let loading: Promise<Converter> | null = null;

async function load(): Promise<Converter> {
  const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }] = await Promise.all([
    import('mathjax-full/js/mathjax.js'),
    import('mathjax-full/js/input/tex.js'),
    import('mathjax-full/js/output/svg.js'),
    import('mathjax-full/js/adaptors/liteAdaptor.js'),
    import('mathjax-full/js/handlers/html.js'),
  ]);
  await Promise.all([
    import('mathjax-full/js/input/tex/ams/AmsConfiguration.js'),
    import('mathjax-full/js/input/tex/mhchem/MhchemConfiguration.js'),
    import('mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js'),
    import('mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js'),
  ]);
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const doc = mathjax.document('', {
    InputJax: new TeX({ packages: ['base', 'ams', 'mhchem', 'newcommand', 'boldsymbol'] }),
    OutputJax: new SVG({ fontCache: 'none' }),
  });
  return (tex, display) => {
    const node = doc.convert(tex, { display, em: 16, ex: 8, containerWidth: 800 });
    // <mjx-container><svg …/></mjx-container> -> just the svg.
    const html = adaptor.innerHTML(node);
    return html;
  };
}

/** TeX -> an SVG string. Throws on TeX MathJax cannot read (the caller shows the TeX as text). */
export async function texToSvg(tex: string, display = false): Promise<string> {
  loading ??= load();
  const convert = await loading;
  const svg = convert(tex, display);
  // MathJax reports TeX errors inside the picture (a red merror box): treat that as a failure.
  if (/data-mjx-error|<merror|fill="red"/.test(svg)) throw new Error(`Cannot read the maths: ${tex}`);
  return svg;
}
