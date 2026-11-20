// @/components/ai/figures/spec.ts — the figure descriptions ("specs") the AI
// writes inside a document, one per figure, as a fenced block:
//
//   ```figure
//   { "type": "graph", "title": "...", ... }
//   ```
//
// The AI never draws: it describes. The school app draws the description
// (figures/render/*.ts) and the AI server checks it first and works out the
// answers from it (ai-server/src/services/figures/). Same shapes as the
// server's zod schemas in ai-server/src/services/figures/spec.ts.

import type { CirclePoint, PlanePoint, SolidDims, SolidShape, Transform } from './figureMath';

/** Added by the AI server after checking. Never written by the AI. */
export interface FigureCheck {
  /** What could not be checked or drawn; shown to the teacher on screen only. */
  problems?: string[];
  /** Answers worked out from the figure (letter -> what it marks, values, intersections). */
  answers?: Record<string, string>;
}

interface Base {
  title?: string;
  /** small = half width, medium (default) = two thirds, large = full width. */
  size?: 'small' | 'medium' | 'large';
  _check?: FigureCheck;
}

export interface GraphSpec extends Base {
  type: 'graph';
  x: { min: number; max: number; label?: string; step?: number };
  y: { min: number; max: number; label?: string; step?: number };
  /** y as a function of x, in mathjs syntax: "x^2 - 4", "sqrt(x)", "2*sin(x)". */
  functions: { expr: string; label?: string; from?: number; to?: number; dashed?: boolean }[];
  points?: { x: number; y: number; label?: string }[];
  /** Shade between two functions (by index; null = the x-axis) from x = from to x = to. */
  shade?: { top: number | null; bottom: number | null; from: number; to: number };
  /**
   * A hatched region with straight sides, given by its corners in order:
   * the feasible region of inequalities / linear programming (triangle ABC…).
   */
  region?: { points: { x: number; y: number }[] };
  /** Vertical (x = …) or horizontal (y = …) lines; dashed unless "dashed": false (a solid ≤ / ≥ boundary). */
  lines?: { x?: number; y?: number; label?: string; dashed?: boolean }[];
  grid?: boolean;
  /**
   * A table of values worked out from the first function and printed above
   * the graph, as in ECZ cubic questions. `blanks` hides some y values behind
   * letters: { "-1": "p" }. `decimals`: rounding (default 1).
   */
  table?: { x: number[]; blanks?: Record<string, string>; decimals?: number };
  /** Draw the axes and grid only: the learner draws the curve (answer grid). */
  hideCurves?: boolean;
  /**
   * Inequalities ("x >= 10", "y <= 2x", "x + y <= 60", "0.2x + 0.3y <= 60").
   * The app draws each boundary (dashed for < and >), shades the UNWANTED
   * side as ECZ does and leaves the region R clear; the server works out R's
   * corners exactly.
   */
  inequalities?: string[];
  /** "band" (default): a strip of hatching along each line on the unwanted side; "full": all of the unwanted area. */
  shadeStyle?: 'band' | 'full';
  /** The region's name (default "R"; "" for none). */
  regionLabel?: string;
  /** Print each boundary's equation beside it (marking-key figures; not when learners must find them). */
  labelLines?: boolean;
  /** Letters for R's corners, anticlockwise from the bottom-left corner. */
  corners?: string[];
  /** Linear programming: the objective, e.g. { "expr": "15x + 20y", "goal": "max" } (marking key only). */
  objective?: { expr: string; goal: 'max' | 'min' };
}

export interface ChartSpec extends Base {
  type: 'chart';
  kind: 'bar' | 'line' | 'histogram';
  x?: { label?: string };
  y?: { label?: string; min?: number; max?: number; step?: number };
  categories: string[];
  series: { name?: string; values: number[] }[];
  /** Print each value on its bar or point (ECZ charts usually do). */
  showValues?: boolean;
}

export interface DiagramSpec extends Base {
  type: 'diagram';
  /** Mermaid text: flowcharts, structures, cycles, topologies, ERDs. */
  mermaid: string;
  /** Boxes shown as a letter instead of their name: { "A": "Summit" }. The letter is written in the Mermaid text. */
  blanks?: Record<string, string>;
}

export interface TimelineSpec extends Base {
  type: 'timeline';
  orientation?: 'horizontal' | 'vertical';
  events: { date: string; label: string; side?: 'left' | 'right'; blank?: string }[];
}

export interface TreeSpec extends Base {
  type: 'tree';
  /** Draw people as small figures (succession and family charts). */
  people?: boolean;
  nodes: { id: string; label: string; parent?: string; partner?: string; blank?: string; note?: string }[];
}

export type MapFeatureKind = 'place' | 'country' | 'province' | 'district' | 'lake' | 'river' | 'sea' | 'region' | 'kingdom' | 'route' | 'railway' | 'road';

export interface MapFeature {
  kind: MapFeatureKind;
  /** The feature's name as in the map data (or the history places list). For a route: optional. */
  name?: string;
  /** A letter shown on the map instead of the name (the question asks what it is). */
  label?: string;
  /** Text to print at the feature (its name, or any short text). */
  text?: string;
  shade?: 'hatch' | 'dots' | 'grey' | 'none';
  /** Routes, railways and roads: from and to (place names), optional stops on the way. */
  from?: string;
  to?: string;
  via?: string[];
  /** Kingdoms: the area drawn as an oval of this radius around the place. */
  radiusKm?: number;
}

export interface MapSpec extends Base {
  type: 'map';
  /** A named region ("Africa", "Southern Africa", "Central Africa", "East Africa", "West Africa", "Zambia", "Europe", "Middle East", "World", "Asia-Pacific", "North America"), [west, south, east, north], or "auto" (zoomed in around the features). */
  region: string | [number, number, number, number];
  layers?: {
    provinces?: boolean; // Zambia's provinces
    districts?: boolean; // Zambia's districts
    rivers?: 'none' | 'major' | string[];
    lakes?: 'none' | 'major' | string[];
    countryNames?: boolean;
    /** Zambia's agro-ecological regions I, IIa, IIb, III (by district; approximate). */
    agroRegions?: boolean;
    /** Letters (or words) for the agro regions instead of their names: { "I": "P", "III": "Q" }. */
    agroLabels?: Partial<Record<'I' | 'IIa' | 'IIb' | 'III', string>>;
  };
  /** sketch = hand-drawn look like ECZ sketch maps (default); clean = atlas lines. */
  style?: 'sketch' | 'clean';
  features: MapFeature[];
  key?: boolean;
  scale?: boolean;
  north?: boolean;
}

export interface MoleculeSpec extends Base {
  type: 'molecule';
  /** A chemical name ("ethanoic acid"); the AI server looks up its structure. */
  name?: string;
  /** Or the structure as SMILES ("CC(=O)O"). */
  smiles?: string;
  /** A letter shown under the structure instead of its name. */
  label?: string;
}

export interface ImageSpec extends Base {
  type: 'image';
  /** A picture from the teacher's diagram library. */
  id: string;
  /** Which of its stored letters to show (default: all). */
  showLabels?: string[];
}

// ── Exact maths figures (the maths behind them is in figureMath.ts) ──

/** An angle mark: at vertex `at`, between the arms towards two points. "north" as an arm = the north line (bearings); "N" also works when no point is called N. */
export interface AngleMark { at: string; arms: [string, string]; label?: string; right?: boolean }

/** Circle theorems: points on (or around) a circle of radius 1, centre O. */
export interface CircleSpec extends Base {
  type: 'circle';
  /** The centre's letter (default "O"); false hides the centre. */
  centre?: string | false;
  points: CirclePoint[];
  /** Straight lines between points: chords, radii, diameters, tangent pieces. */
  lines?: [string, string][];
  /** Diameters (drawn, and checked to go through the centre). */
  diameters?: [string, string][];
  /** Tangents drawn through a point of contact when no named points lie on them. */
  tangents?: string[];
  angles?: AngleMark[];
  /** Equal sides, marked with a small tick each: [["B","C"],["C","D"]]. */
  equal?: [string, string][];
  /** Lengths written beside lines: [{ "from": "O", "to": "A", "label": "14 cm" }]. */
  lengths?: { from: string; to: string; label: string }[];
  /** Draw only this sector (anticlockwise from → to) instead of the whole circle. */
  sector?: { from: string; to: string; label?: string };
  /** Angles the questions ask for ("ABT"); never drawn, the server works them out. */
  find?: string[];
}

/** Earth geometry: the globe with parallels, meridians and places. */
export interface GlobeSpec extends Base {
  type: 'globe';
  /** Latitudes to draw: 52 or "52°N", -78 or "78°S". The equator is always drawn. */
  parallels?: (number | string)[];
  /** Longitudes to draw: -43 or "43°W", 76 or "76°E", 0 for Greenwich. */
  meridians?: (number | string)[];
  points: { id: string; lat: number | string; long: number | string }[];
  /** Pairs to work out distances and time differences for (marking key). */
  find?: [string, string][];
}

/** Venn diagrams with 2 or 3 sets inside the universal set. */
export interface VennSpec extends Base {
  type: 'venn';
  /** Set letters, with an optional name printed beside the circle. */
  sets: (string | { id: string; label?: string })[];
  universal?: string;
  /** What is written in each region: "A", "AB", "ABC"…; "" is outside every circle. */
  counts?: Record<string, number | string>;
  /** Shade: a set expression ("A′ ∩ (B ∩ C)") or a list of region names. */
  shade?: string | string[];
  /** Totals the question gives ("A": 33, "AB": 15, "ξ": 40); the server checks or works out the counts. */
  totals?: Record<string, number>;
}

/** A shape on the Cartesian plane, by its corners. Its name gives its corner letters ("ABC", "A1B1C1"). */
export interface PlaneShape { name: string; vertices: [number, number][]; shade?: 'hatch' | 'dots' | 'grey' | 'none' }

/** Coordinate geometry and transformations on axes or graph paper. */
export interface PlaneSpec extends Base {
  type: 'plane';
  x: { min: number; max: number; step?: number; label?: string };
  y: { min: number; max: number; step?: number; label?: string };
  /** "paper": a 1-unit grid (transformations); "none": axes only (coordinate geometry sketches). */
  grid?: 'paper' | 'none';
  points?: { id?: string; x: number; y: number; label?: string; coords?: boolean }[];
  /** Line segments between point ids or coordinates. */
  segments?: { from: string | [number, number]; to: string | [number, number]; dashed?: boolean }[];
  /** Straight lines across the whole grid: through two points, or an equation ("y = 2x - 1", "x = 3"). */
  lines?: { through?: [string | [number, number], string | [number, number]]; equation?: string; label?: string; dashed?: boolean }[];
  shapes?: PlaneShape[];
  /** Images of shapes, worked out exactly. hidden: the learner draws it (still in the marking key). */
  images?: { of: string; name: string; transform: Transform; hidden?: boolean }[];
  /** Pairs of shape names whose transformation the question asks to describe. */
  describe?: [string, string][];
}

/** Bearings and trigonometry: points on level ground or in a triangle, roughly to scale. */
export interface GeometrySpec extends Base {
  type: 'geometry';
  points: PlanePoint[];
  /** Sides with optional length labels ("23.7 m"). */
  sides?: { from: string; to: string; label?: string; dashed?: boolean }[];
  angles?: AngleMark[];
  /** Points with a north line drawn through them. */
  north?: string[];
  equal?: [string, string][];
  /** What the questions ask: "bearing of K from M", "angle LKM", "length LN", "area of LMN". */
  find?: string[];
}

/** Solids for mensuration, drawn in the usual textbook view with hidden edges dashed. */
export interface SolidSpec extends Base {
  type: 'solid';
  shape: SolidShape;
  dims: SolidDims;
  /** Text printed on a measurement: { "height": "15 cm", "radius": "12 cm", "topRadius": "3 cm" }. */
  labels?: Record<string, string>;
  /** Frustum/cone made by cutting a cone: draw the removed top part dashed (the bucket question). */
  showCut?: boolean;
  /**
   * Letters on the corners, in this order ("" skips one):
   *   cuboid, cube: bottom face front-left, front-right, back-right, back-left, then the top face the same way (8)
   *   pyramid: the base as above (4), then the apex
   *   pyramid-frustum: bottom face (4), then top face (4)
   *   prism: front triangle bottom-left, bottom-right, top; then the back triangle the same way (6)
   *   cone: apex, left of the base, right of the base, centre of the base
   *   cylinder, frustum: top-left, top-right, bottom-left, bottom-right, top centre, bottom centre (frustum: then the apex of the cut)
   *   sphere, hemisphere: centre
   */
  letters?: string[];
  /** Value of π the question gives (3.142 or 22/7). */
  pi?: number;
}

/**
 * A textbook diagram from sceneCatalog.ts (landforms, the water cycle,
 * settlement patterns, irrigation, the solar system…). `labels` puts words
 * or a letter on its parts: { "plunge-pool": "X", "hard-rock": "hard rock" }.
 */
export interface SceneSpec extends Base {
  type: 'scene';
  scene: string;
  variant?: string;
  labels?: Record<string, string>;
  /** Lists some scenes take (the organisms of a pyramid or food chain). */
  items?: string[];
}

/**
 * A climate graph: monthly rainfall bars (mm, left axis) and a temperature
 * line (°C, right axis). Twelve values each, January first.
 */
export interface ClimateSpec extends Base {
  type: 'climate';
  station?: string;
  rainfall: number[];
  temperature?: number[];
  months?: string[];
}

/** A population pyramid: males left, females right, youngest group at the bottom. */
export interface PopulationSpec extends Base {
  type: 'population';
  place?: string;
  year?: number;
  /** Age groups from the youngest, e.g. ["0-4","5-9",…,"80+"]. */
  groups?: string[];
  male: number[];
  female: number[];
  unit?: 'percent' | 'thousands' | 'millions';
}

/**
 * A smooth curve from experimental points (enzyme activity against
 * temperature or pH, population growth, body temperature). `marks` draw a
 * dashed line at an x value with a letter (the optimum "X").
 */
export interface CurveSpec extends Base {
  type: 'curve';
  x?: { label?: string; min?: number; max?: number; step?: number };
  y?: { label?: string; min?: number; max?: number; step?: number };
  series: { name?: string; points: [number, number][]; dashed?: boolean }[];
  marks?: { x?: number; y?: number; label: string }[];
  smooth?: boolean;
  /** Graph paper (as ECZ prints for "draw a graph" questions). */
  grid?: boolean;
}

/** A food web: each link is [food, eater]; the arrow points to the eater. `labels` replace names with letters. */
export interface FoodWebSpec extends Base {
  type: 'food-web';
  links: [string, string][];
  labels?: Record<string, string>;
}

/**
 * A monohybrid cross worked out by geneticsMath.ts: "Tt", "X^H X^h" / "X^h Y",
 * "I^A I^O". `traits` names alleles ({"T":"tall","t":"short"}). `hide` blanks
 * parts for learners to complete.
 */
export interface GeneticCrossSpec extends Base {
  type: 'genetic-cross';
  parents: [string, string];
  traits?: Record<string, string>;
  style?: 'diagram' | 'punnett';
  hide?: ('gametes' | 'offspring' | 'phenotypes' | 'ratio')[];
}

/**
 * A ruler-and-compasses construction (Mathematics Paper 2): a triangle from
 * its given sides (cm) and angles (°), loci inside it, and the region that
 * satisfies chosen conditions, hatched. Drawn with the construction arcs, as
 * a marking key shows it. Loci are numbered from 0 in "region".
 */
export interface ConstructionSpec extends Base {
  type: 'construction';
  triangle: { name: string; sides?: Record<string, number>; angles?: Record<string, number> };
  loci?: { kind: 'circle' | 'parallel' | 'angle-bisector' | 'perpendicular-bisector' | 'perpendicular'; centre?: string; radius?: number; to?: string; distance?: number; side?: string; at?: string; of?: string; from?: string; label?: string }[];
  region?: { locus: number; keep: string }[];
  regionLabel?: string;
  /** Draw the compass arcs (default true). */
  showConstruction?: boolean;
  /** Print the given side lengths (default true). */
  labelSides?: boolean;
}

export type FigureSpec = GraphSpec | ChartSpec | DiagramSpec | TimelineSpec | TreeSpec | MapSpec | MoleculeSpec | ImageSpec
  | CircleSpec | GlobeSpec | VennSpec | PlaneSpec | GeometrySpec | SolidSpec | SceneSpec | ClimateSpec | PopulationSpec | CurveSpec | FoodWebSpec | GeneticCrossSpec | ConstructionSpec;
export const FIGURE_TYPES = ['graph', 'chart', 'diagram', 'timeline', 'tree', 'map', 'molecule', 'image', 'circle', 'globe', 'venn', 'plane', 'geometry', 'solid', 'scene', 'climate', 'population', 'curve', 'food-web', 'genetic-cross', 'construction'] as const;

/** Reads a figure block's text. Returns null for anything that is not a figure description. */
export function parseFigure(text: string): FigureSpec | null {
  try {
    const spec = JSON.parse(text);
    return spec && typeof spec === 'object' && (FIGURE_TYPES as readonly string[]).includes(spec.type) ? (spec as FigureSpec) : null;
  } catch {
    return null;
  }
}
