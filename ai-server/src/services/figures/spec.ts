/**
 * The figure descriptions the AI writes inside an assessment, one per
 * ```figure block (JSON). Same shapes as the school app's
 * client/components/ai/figures/spec.ts, which draws them. Checked here with
 * zod before the document is saved; `_check` is added by the server only.
 */
import { z } from "zod";

const label = z.string().trim().min(1).max(40);
const num = z.number().finite();
const base = {
  title: z.string().trim().max(200).optional(),
  size: z.enum(["small", "medium", "large"]).optional(),
};

export const graphSchema = z.object({
  ...base,
  type: z.literal("graph"),
  x: z.object({ min: num, max: num, label: z.string().max(60).optional(), step: num.positive().optional() }),
  y: z.object({ min: num, max: num, label: z.string().max(60).optional(), step: num.positive().optional() }),
  functions: z.array(z.object({ expr: z.string().trim().min(1).max(200), label: z.string().max(60).optional(), from: num.optional(), to: num.optional(), dashed: z.boolean().optional() })).max(6).default([]),
  points: z.array(z.object({ x: num, y: num, label: z.string().max(20).optional() })).max(20).optional(),
  shade: z.object({ top: z.number().int().nullable(), bottom: z.number().int().nullable(), from: num, to: num }).optional(),
  region: z.object({ points: z.array(z.object({ x: num, y: num })).min(3).max(12) }).optional(),
  lines: z.array(z.object({ x: num.optional(), y: num.optional(), label: z.string().max(30).optional(), dashed: z.boolean().optional() })).max(8).optional(),
  grid: z.boolean().optional(),
  table: z.object({ x: z.array(num).min(2).max(14), blanks: z.record(z.string(), z.string().max(3)).optional(), decimals: z.number().int().min(0).max(3).optional() }).optional(),
  hideCurves: z.boolean().optional(),
  inequalities: z.array(z.string().trim().min(3).max(60)).max(8).optional(),
  shadeStyle: z.enum(["band", "full"]).optional(),
  regionLabel: z.string().max(4).optional(),
  labelLines: z.boolean().optional(),
  corners: z.array(z.string().max(3)).max(8).optional(),
  objective: z.object({ expr: z.string().trim().min(1).max(60), goal: z.enum(["max", "min"]) }).optional(),
});

export const chartSchema = z.object({
  ...base,
  type: z.literal("chart"),
  kind: z.enum(["bar", "line", "histogram"]),
  x: z.object({ label: z.string().max(60).optional() }).optional(),
  y: z.object({ label: z.string().max(60).optional(), min: num.optional(), max: num.optional(), step: num.positive().optional() }).optional(),
  categories: z.array(z.string().max(40)).min(1).max(24),
  series: z.array(z.object({ name: z.string().max(40).optional(), values: z.array(num) })).min(1).max(4),
  showValues: z.boolean().optional(),
});

export const diagramSchema = z.object({
  ...base,
  type: z.literal("diagram"),
  mermaid: z.string().trim().min(5).max(4000),
  blanks: z.record(label, z.string().max(120)).optional(),
});

export const timelineSchema = z.object({
  ...base,
  type: z.literal("timeline"),
  orientation: z.enum(["horizontal", "vertical"]).optional(),
  events: z.array(z.object({ date: z.string().trim().min(1).max(30), label: z.string().max(120), side: z.enum(["left", "right"]).optional(), blank: label.optional() })).min(2).max(16),
});

export const treeSchema = z.object({
  ...base,
  type: z.literal("tree"),
  people: z.boolean().optional(),
  nodes: z.array(z.object({ id: z.string().trim().min(1).max(40), label: z.string().max(80), parent: z.string().max(40).optional(), partner: z.string().max(40).optional(), blank: label.optional(), note: z.string().max(80).optional() })).min(1).max(30),
});

export const MAP_FEATURE_KINDS = ["place", "country", "province", "district", "lake", "river", "sea", "region", "kingdom", "route", "railway", "road"] as const;
export const mapSchema = z.object({
  ...base,
  type: z.literal("map"),
  region: z.union([z.string().trim().min(2).max(40), z.tuple([num, num, num, num])]),
  layers: z.object({
    provinces: z.boolean().optional(),
    districts: z.boolean().optional(),
    rivers: z.union([z.enum(["none", "major"]), z.array(z.string().max(60))]).optional(),
    lakes: z.union([z.enum(["none", "major"]), z.array(z.string().max(60))]).optional(),
    countryNames: z.boolean().optional(),
    agroRegions: z.boolean().optional(),
    agroLabels: z.object({ I: label.optional(), IIa: label.optional(), IIb: label.optional(), III: label.optional() }).optional(),
  }).optional(),
  style: z.enum(["sketch", "clean"]).optional(),
  features: z.array(z.object({
    kind: z.enum(MAP_FEATURE_KINDS),
    name: z.string().trim().max(80).optional(),
    label: label.optional(),
    text: z.string().max(60).optional(),
    shade: z.enum(["hatch", "dots", "grey", "none"]).optional(),
    from: z.string().max(80).optional(),
    to: z.string().max(80).optional(),
    via: z.array(z.string().max(80)).max(6).optional(),
    radiusKm: num.positive().max(1500).optional(),
  })).max(30),
  key: z.boolean().optional(),
  scale: z.boolean().optional(),
  north: z.boolean().optional(),
});

export const moleculeSchema = z.object({
  ...base,
  type: z.literal("molecule"),
  name: z.string().trim().max(120).optional(),
  smiles: z.string().trim().max(400).optional(),
  label: label.optional(),
}).refine((m) => m.name || m.smiles, "A molecule needs a name or a SMILES structure.");

export const imageSchema = z.object({
  ...base,
  type: z.literal("image"),
  id: z.string().trim().min(1).max(60),
  showLabels: z.array(label).max(26).optional(),
});

// ── Exact maths figures (the maths is in figureMath.ts, shared with the app) ──

const pid = z.string().trim().min(1).max(6); // a point's letter: A, T', A1
const lineRef = z.union([z.string().trim().max(20), z.tuple([pid, pid])]);
const angleMark = z.object({ at: pid, arms: z.tuple([z.string().trim().max(6), z.string().trim().max(6)]), label: z.string().max(20).optional(), right: z.boolean().optional() });
const latLong = z.union([num, z.string().trim().max(12)]);
const coord = z.tuple([num, num]);

export const circleSchema = z.object({
  ...base,
  type: z.literal("circle"),
  centre: z.union([pid, z.literal(false)]).optional(),
  points: z.array(z.object({ id: pid, at: num.optional(), x: num.optional(), y: num.optional(), meet: z.tuple([lineRef, lineRef]).optional(), along: lineRef.optional(), distance: num.optional() })).min(1).max(16),
  lines: z.array(z.tuple([pid, pid])).max(30).optional(),
  diameters: z.array(z.tuple([pid, pid])).max(4).optional(),
  tangents: z.array(pid).max(4).optional(),
  angles: z.array(angleMark).max(12).optional(),
  equal: z.array(z.tuple([pid, pid])).max(8).optional(),
  lengths: z.array(z.object({ from: pid, to: pid, label: z.string().max(20) })).max(8).optional(),
  sector: z.object({ from: pid, to: pid, label: z.string().max(20).optional() }).optional(),
  find: z.array(z.string().trim().max(14)).max(10).optional(),
});

export const globeSchema = z.object({
  ...base,
  type: z.literal("globe"),
  parallels: z.array(latLong).max(6).optional(),
  meridians: z.array(latLong).max(6).optional(),
  points: z.array(z.object({ id: pid, lat: latLong, long: latLong })).min(1).max(8),
  find: z.array(z.tuple([pid, pid])).max(8).optional(),
});

const setId = z.string().regex(/^[A-Za-z]$/, "Set letters are single letters");
export const vennSchema = z.object({
  ...base,
  type: z.literal("venn"),
  sets: z.array(z.union([setId, z.object({ id: setId, label: z.string().trim().max(30).optional() })])).min(2).max(3),
  universal: z.string().max(3).optional(),
  counts: z.record(z.string().max(12), z.union([num, z.string().max(12)])).optional(),
  shade: z.union([z.string().max(80), z.array(z.string().max(12))]).optional(),
  totals: z.record(z.string().max(12), num).optional(),
});

export const transformSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("translate"), vector: coord }),
  z.object({ type: z.literal("reflect"), line: z.string().trim().min(1).max(30) }),
  z.object({ type: z.literal("rotate"), angle: num, centre: coord.optional() }),
  z.object({ type: z.literal("enlarge"), factor: num, centre: coord.optional() }),
  z.object({ type: z.literal("stretch"), factor: num, invariant: z.enum(["x-axis", "y-axis"]) }),
  z.object({ type: z.literal("shear"), factor: num, invariant: z.enum(["x-axis", "y-axis"]) }),
  z.object({ type: z.literal("matrix"), matrix: z.tuple([coord, coord]) }),
]);
const pointRef = z.union([pid, coord]);
export const planeSchema = z.object({
  ...base,
  type: z.literal("plane"),
  x: z.object({ min: num, max: num, label: z.string().max(60).optional(), step: num.positive().optional() }),
  y: z.object({ min: num, max: num, label: z.string().max(60).optional(), step: num.positive().optional() }),
  grid: z.enum(["paper", "none"]).optional(),
  points: z.array(z.object({ id: pid.optional(), x: num, y: num, label: z.string().max(20).optional(), coords: z.boolean().optional() })).max(20).optional(),
  segments: z.array(z.object({ from: pointRef, to: pointRef, dashed: z.boolean().optional() })).max(20).optional(),
  lines: z.array(z.object({ through: z.tuple([pointRef, pointRef]).optional(), equation: z.string().max(40).optional(), label: z.string().max(30).optional(), dashed: z.boolean().optional() })).max(8).optional(),
  shapes: z.array(z.object({ name: z.string().trim().min(1).max(20), vertices: z.array(coord).min(1).max(12), shade: z.enum(["hatch", "dots", "grey", "none"]).optional() })).max(8).optional(),
  images: z.array(z.object({ of: z.string().trim().max(20), name: z.string().trim().min(1).max(20), transform: transformSchema, hidden: z.boolean().optional() })).max(8).optional(),
  describe: z.array(z.tuple([z.string().max(20), z.string().max(20)])).max(6).optional(),
});

export const geometrySchema = z.object({
  ...base,
  type: z.literal("geometry"),
  points: z.array(z.object({ id: pid, x: num.optional(), y: num.optional(), from: pid.optional(), bearing: num.optional(), angle: num.optional(), distance: num.positive().optional() })).min(2).max(12),
  sides: z.array(z.object({ from: pid, to: pid, label: z.string().max(20).optional(), dashed: z.boolean().optional() })).max(20).optional(),
  angles: z.array(angleMark).max(12).optional(),
  north: z.array(pid).max(6).optional(),
  equal: z.array(z.tuple([pid, pid])).max(8).optional(),
  find: z.array(z.string().trim().max(60)).max(10).optional(),
});

const len = num.positive().optional();
export const solidSchema = z.object({
  ...base,
  type: z.literal("solid"),
  shape: z.enum(["cuboid", "cube", "cylinder", "cone", "frustum", "pyramid", "pyramid-frustum", "prism", "sphere", "hemisphere"]),
  dims: z.object({ length: len, width: len, height: len, radius: len, topRadius: len, topLength: len, topWidth: len, base: len, triangleHeight: len }),
  labels: z.record(z.string().max(20), z.string().max(30)).optional(),
  showCut: z.boolean().optional(),
  letters: z.array(z.string().max(4)).max(10).optional(),
  pi: num.positive().optional(),
});

/** A textbook diagram from sceneCatalog.ts (landforms, cycles, settlements, irrigation…). */
export const sceneSchema = z.object({
  ...base,
  type: z.literal("scene"),
  scene: z.string().trim().min(2).max(40),
  variant: z.string().trim().max(30).optional(),
  labels: z.record(z.string().max(30), z.string().max(40)).optional(),
  items: z.array(z.string().trim().min(1).max(30)).max(6).optional(),
});

/** Climate graph: 12 monthly rainfall bars (mm) and temperatures (°C). */
export const climateSchema = z.object({
  ...base,
  type: z.literal("climate"),
  station: z.string().trim().max(60).optional(),
  rainfall: z.array(num.min(0).max(2000)).length(12),
  temperature: z.array(num.min(-60).max(50)).length(12).optional(),
  months: z.array(z.string().max(4)).length(12).optional(),
});

/** Population pyramid. */
export const populationSchema = z.object({
  ...base,
  type: z.literal("population"),
  place: z.string().trim().max(60).optional(),
  year: z.number().int().min(1800).max(2200).optional(),
  groups: z.array(z.string().trim().min(1).max(10)).min(3).max(21).optional(),
  male: z.array(num.min(0)).min(3).max(21),
  female: z.array(num.min(0)).min(3).max(21),
  unit: z.enum(["percent", "thousands", "millions"]).optional(),
});

const pair = z.tuple([num, num]);
/** Smooth experimental curves (enzymes, population growth, body temperature). */
export const curveSchema = z.object({
  ...base,
  type: z.literal("curve"),
  x: z.object({ label: z.string().max(60).optional(), min: num.optional(), max: num.optional(), step: num.positive().optional() }).optional(),
  y: z.object({ label: z.string().max(60).optional(), min: num.optional(), max: num.optional(), step: num.positive().optional() }).optional(),
  series: z.array(z.object({ name: z.string().max(30).optional(), points: z.array(pair).min(2).max(40), dashed: z.boolean().optional() })).min(1).max(4),
  marks: z.array(z.object({ x: num.optional(), y: num.optional(), label: label })).max(6).optional(),
  smooth: z.boolean().optional(),
  grid: z.boolean().optional(),
});

/** Food web: [food, eater] links. */
export const foodWebSchema = z.object({
  ...base,
  type: z.literal("food-web"),
  links: z.array(z.tuple([z.string().trim().min(1).max(30), z.string().trim().min(1).max(30)])).min(2).max(30),
  labels: z.record(z.string().max(30), label).optional(),
});

/** Monohybrid cross. */
export const geneticCrossSchema = z.object({
  ...base,
  type: z.literal("genetic-cross"),
  parents: z.tuple([z.string().trim().min(2).max(20), z.string().trim().min(2).max(20)]),
  traits: z.record(z.string().max(4), z.string().max(30)).optional(),
  style: z.enum(["diagram", "punnett"]).optional(),
  hide: z.array(z.enum(["gametes", "offspring", "phenotypes", "ratio"])).max(4).optional(),
});

const vertex = z.string().trim().min(1).max(4);
export const constructionSchema = z.object({
  ...base,
  type: z.literal("construction"),
  triangle: z.object({
    name: z.string().trim().min(3).max(8),
    sides: z.record(z.string().max(8), num.positive().max(30)).optional(),
    angles: z.record(z.string().max(12), num.positive().max(179)).optional(),
  }),
  loci: z.array(z.object({
    kind: z.enum(["circle", "parallel", "angle-bisector", "perpendicular-bisector", "perpendicular"]),
    centre: vertex.optional(), radius: num.positive().max(30).optional(), to: z.string().max(8).optional(), distance: num.positive().max(30).optional(),
    side: vertex.optional(), at: vertex.optional(), of: z.string().max(8).optional(), from: vertex.optional(), label: z.string().max(40).optional(),
  })).max(5).optional(),
  region: z.array(z.object({ locus: z.number().int().min(0).max(4), keep: z.string().trim().min(1).max(10) })).max(5).optional(),
  regionLabel: z.string().max(3).optional(),
  showConstruction: z.boolean().optional(),
  labelSides: z.boolean().optional(),
});

export const figureSchema = z.union([graphSchema, chartSchema, diagramSchema, timelineSchema, treeSchema, mapSchema, moleculeSchema, imageSchema, circleSchema, globeSchema, vennSchema, planeSchema, geometrySchema, solidSchema, sceneSchema, climateSchema, populationSchema, curveSchema, foodWebSchema, geneticCrossSchema, constructionSchema]);
export type FigureSpec = z.infer<typeof figureSchema>;
export type CircleSpec = z.infer<typeof circleSchema>;
export type GlobeSpec = z.infer<typeof globeSchema>;
export type VennSpec = z.infer<typeof vennSchema>;
export type PlaneSpec = z.infer<typeof planeSchema>;
export type GeometrySpec = z.infer<typeof geometrySchema>;
export type ConstructionSpec = z.infer<typeof constructionSchema>;
export type SolidSpec = z.infer<typeof solidSchema>;
export type MapSpec = z.infer<typeof mapSchema>;
export type GraphSpec = z.infer<typeof graphSchema>;
export type SceneSpec = z.infer<typeof sceneSchema>;
export type ClimateSpec = z.infer<typeof climateSchema>;
export type PopulationSpec = z.infer<typeof populationSchema>;
export type CurveSpec = z.infer<typeof curveSchema>;
export type FoodWebSpec = z.infer<typeof foodWebSchema>;
export type GeneticCrossSpec = z.infer<typeof geneticCrossSchema>;

export interface FigureCheck {
  problems?: string[];
  answers?: Record<string, string>;
}
