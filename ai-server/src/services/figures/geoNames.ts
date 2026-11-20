/**
 * Names on the school app's map data (client public/geo/*.json), so the
 * server can tell whether a map in an assessment names things that really
 * exist before the document is saved. Mirrors the lookup rules of the app's
 * figures/render/geo.ts (loose names for shapes, strict names for places,
 * the same country aliases). Only names are read; nothing is drawn here.
 */
import fs from "node:fs/promises";
import path from "node:path";

type Kind = "country" | "province" | "district" | "lake" | "river" | "sea" | "region" | "place";

export const COUNTRY_ALIASES: Record<string, string> = {
  drc: "Dem. Rep. Congo", "dr congo": "Dem. Rep. Congo", "democratic republic of the congo": "Dem. Rep. Congo", "democratic republic of congo": "Dem. Rep. Congo", "congo drc": "Dem. Rep. Congo", zaire: "Dem. Rep. Congo", "congo dr": "Dem. Rep. Congo",
  "republic of the congo": "Congo", "congo brazzaville": "Congo", "congo republic": "Congo",
  swaziland: "eSwatini", eswatini: "eSwatini", "ivory coast": "Côte d'Ivoire", "cote d'ivoire": "Côte d'Ivoire",
  "central african republic": "Central African Rep.", car: "Central African Rep.", "south sudan": "S. Sudan", "western sahara": "W. Sahara",
  "equatorial guinea": "Eq. Guinea", usa: "United States of America", "united states": "United States of America", america: "United States of America",
  uk: "United Kingdom", britain: "United Kingdom", "great britain": "United Kingdom", england: "United Kingdom",
  "czech republic": "Czechia", bosnia: "Bosnia and Herz.", "bosnia and herzegovina": "Bosnia and Herz.", ussr: "Russia", "soviet union": "Russia",
  macedonia: "North Macedonia", burma: "Myanmar", "dominican republic": "Dominican Rep.",
  "northern rhodesia": "Zambia", "southern rhodesia": "Zimbabwe", rhodesia: "Zimbabwe", nyasaland: "Malawi", bechuanaland: "Botswana", basutoland: "Lesotho",
  tanganyika: "Tanzania", "south west africa": "Namibia", "gold coast": "Ghana", abyssinia: "Ethiopia", persia: "Iran", siam: "Thailand",
};

export const REGIONS = ["World", "Africa", "Southern Africa", "Central Africa", "East Africa", "West Africa", "North Africa", "Zambia", "Europe", "Middle East", "Asia-Pacific", "Asia", "North America", "South America", "auto"];

export const nameKey = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(lake|river|the|mountains?|mts?|range|desert|province|district|ocean)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
export const placeKey = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

interface Topo { objects: Record<string, { geometries?: { properties?: { name?: string } }[] }> }
interface Place { name: string; aka?: string[]; kind?: string; country?: string }

export interface GeoNames {
  /** The name as written in the data, or null. */
  find(kind: Kind, name: string): string | null;
  /** A route end: a place, or a lake, country, province, region or sea of that name. */
  findPoint(name: string): string | null;
  /** Up to three close names, for "did you mean". */
  suggest(kind: Kind, name: string): string[];
  /** History/heritage places, for the prompt's list of usable places. */
  historyPlaces: Place[];
}

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

let cache: Promise<GeoNames | null> | null = null;

/** Reads the map data once. Null (and maps are not checked) when the files are missing. */
export function loadGeoNames(dir: string): Promise<GeoNames | null> {
  cache ??= (async () => {
    try {
      const read = async <T>(f: string) => JSON.parse(await fs.readFile(path.join(dir, f), "utf8")) as T;
      const [world, zambia, places, history] = await Promise.all([read<Topo>("world.json"), read<Topo>("zambia.json"), read<Place[]>("places.json"), read<{ places: Place[] }>("history-places.json")]);
      const names = (t: Topo, key: string) => (t.objects[key]?.geometries ?? []).map((g) => g.properties?.name).filter((n): n is string => Boolean(n));
      const shapes: Record<Exclude<Kind, "place">, string[]> = {
        country: names(world, "countries"), province: names(zambia, "provinces"), district: names(zambia, "districts"),
        lake: [...names(zambia, "lakes"), ...names(world, "lakes")], river: [...names(zambia, "rivers"), ...names(world, "rivers")],
        sea: names(world, "seas"), region: names(world, "regions"),
      };
      const allPlaces = [...history.places, ...places];
      const find = (kind: Kind, name: string): string | null => {
        if (!name.trim()) return null;
        if (kind === "place") {
          const k = placeKey(name);
          return allPlaces.find((p) => placeKey(p.name) === k || (p.aka ?? []).some((a) => placeKey(a) === k))?.name ?? null;
        }
        const wanted = kind === "country" ? nameKey(COUNTRY_ALIASES[name.trim().toLowerCase()] ?? name) : nameKey(name);
        return shapes[kind].find((n) => nameKey(n) === wanted) ?? null;
      };
      return {
        find,
        findPoint: (name) => find("place", name) ?? (["lake", "country", "province", "region", "sea"] as const).map((k) => find(k, name)).find(Boolean) ?? null,
        suggest: (kind, name) => {
          const pool = kind === "place" ? allPlaces.map((p) => p.name) : shapes[kind];
          const k = kind === "place" ? placeKey(name) : nameKey(name);
          const key = (n: string) => (kind === "place" ? placeKey(n) : nameKey(n));
          return [...new Set(pool)]
            .map((n) => ({ n, d: key(n).includes(k) || k.includes(key(n)) ? 0.5 : lev(key(n), k) }))
            .filter((x) => x.d <= Math.max(2, Math.floor(k.length / 4)))
            .sort((a, b) => a.d - b.d).slice(0, 3).map((x) => x.n);
        },
        historyPlaces: history.places,
      };
    } catch {
      return null;
    }
  })();
  return cache;
}
