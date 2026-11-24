// @/components/ai/figures/render/index.ts — one entry point: a figure spec in,
// SVG text out (plus anything that went wrong, for the teacher's eyes only).
// The heavy libraries (map data, Mermaid, smiles-drawer) load only when a
// document actually has that kind of figure.
import type { FigureSpec } from '../spec';
import { placeholder } from './svg';
import type { GeoData } from './geo';
import type { LibraryPicture } from './image';

export interface Rendered { svg: string; problems: string[] }

/** Where the map files live (copied into the site's public/geo folder). */
const GEO_BASE = '/geo/';
let geo: Promise<GeoData> | null = null;
function loadGeo(): Promise<GeoData> {
  geo ??= (async () => {
    const get = async (f: string) => {
      const r = await fetch(GEO_BASE + f);
      if (!r.ok) throw new Error(`Map data ${f} is missing (${r.status}).`);
      return r.json();
    };
    const [{ toGeoData }, world, zambia, places, history] = await Promise.all([import('./geo'), get('world.json'), get('zambia.json'), get('places.json'), get('history-places.json')]);
    return toGeoData(world, zambia, places, history);
  })();
  geo.catch(() => { geo = null; }); // try again next time
  return geo;
}

/** Fetches a library picture (with the teacher's sign-in). Set by the app; tests can replace it. */
export let loadPicture: (id: string) => Promise<LibraryPicture | null> = async (id) => {
  const { teacherAi } = await import('@/services/aiApi');
  return teacherAi.figurePicture(id);
};
export const setPictureLoader = (fn: typeof loadPicture) => { loadPicture = fn; };

const orPlaceholder = (r: Rendered, what: string): Rendered => (r.svg ? r : { svg: placeholder(`This ${what} could not be drawn.`), problems: r.problems });

export async function renderFigure(spec: FigureSpec): Promise<Rendered> {
  try {
    switch (spec.type) {
      case 'graph': return { svg: (await import('./graph')).renderGraph(spec), problems: [] };
      case 'chart': return { svg: (await import('./chart')).renderChart(spec), problems: [] };
      case 'timeline': return { svg: (await import('./timeline')).renderTimeline(spec), problems: [] };
      case 'tree': return { svg: (await import('./tree')).renderTree(spec), problems: [] };
      case 'map': {
        const [{ renderMap }, data] = await Promise.all([import('./map'), loadGeo()]);
        return renderMap(spec, data);
      }
      case 'diagram': {
        const { renderDiagram } = await import('./mermaid');
        const r = await renderDiagram(spec);
        return r.svg ? r : { svg: placeholder('This diagram could not be drawn.'), problems: r.problems };
      }
      case 'molecule': {
        const { renderMolecule } = await import('./molecule');
        const r = await renderMolecule(spec);
        return r.svg ? r : { svg: placeholder(`Structure of ${spec.name ?? 'the compound'}`), problems: r.problems };
      }
      case 'circle': return (await import('./circle')).renderCircle(spec);
      case 'globe': return (await import('./globe')).renderGlobe(spec);
      case 'venn': return orPlaceholder((await import('./venn')).renderVenn(spec), 'Venn diagram');
      case 'plane': return (await import('./plane')).renderPlane(spec);
      case 'geometry': return orPlaceholder((await import('./geometry')).renderGeometry(spec), 'diagram');
      case 'solid': return orPlaceholder((await import('./solid')).renderSolid(spec), spec.shape);
      case 'scene': return orPlaceholder((await import('./scene')).renderScene(spec), 'diagram');
      case 'climate': return { svg: (await import('./stats')).renderClimate(spec), problems: [] };
      case 'population': return { svg: (await import('./stats')).renderPopulation(spec), problems: [] };
      case 'curve': return { svg: (await import('./bio')).renderCurve(spec), problems: [] };
      case 'food-web': return { svg: (await import('./bio')).renderFoodWeb(spec), problems: [] };
      case 'construction': return orPlaceholder((await import('./construction')).renderConstruction(spec), 'construction');
      case 'genetic-cross': return { svg: (await import('./bio')).renderGeneticCross(spec), problems: [] };
      case 'image': {
        const pic = await loadPicture(spec.id);
        if (!pic) return { svg: placeholder('This picture is no longer in the diagram library.'), problems: [`Library picture ${spec.id} was not found.`] };
        const { renderImage } = await import('./image');
        return renderImage(spec, pic);
      }
    }
  } catch (err) {
    return { svg: placeholder('This figure could not be drawn.'), problems: [String((err as Error)?.message ?? err)] };
  }
  return { svg: placeholder('Unknown kind of figure.'), problems: [] };
}
