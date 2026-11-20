// @/components/ai/figures/render/geo.ts — the map data and name lookup shared
// by the map drawer (and mirrored by the AI server's check, so a letter is
// only placed on a feature that really exists in the data).
//
// Data (public/geo/, built from open data):
//   world.json           countries, lakes, rivers, physical regions, seas (Natural Earth, public domain)
//   zambia.json          provinces and districts (Zambia Data Hub via geoBoundaries, CC BY 4.0),
//                        rivers and lakes in and around Zambia (Natural Earth)
//   places.json          towns and capitals (Natural Earth)
//   history-places.json  heritage sites, mission stations, kingdoms, battles… (our own list; approximate)
import type { FeatureCollection, Feature, Geometry } from 'geojson';
import { feature, merge } from 'topojson-client';
import type { MapFeatureKind } from '../spec';

export interface Place { name: string; lat: number; lon: number; kind?: string; country?: string; aka?: string[]; pop?: number; capital?: boolean }

export interface GeoData {
  layers: Record<'countries' | 'lakes' | 'rivers' | 'regions' | 'seas' | 'provinces' | 'districts' | 'zrivers' | 'zlakes' | 'agro', FeatureCollection>;
  places: Place[];
}

/** Built-in regions: [west, south, east, north] in degrees. */
export const REGIONS: Record<string, [number, number, number, number]> = {
  world: [-170, -58, 180, 80],
  africa: [-19, -36, 53, 38],
  'southern africa': [10, -35.5, 41.5, -7],
  'central africa': [11, -19, 36, 6],
  'east africa': [27, -12, 52, 13],
  'west africa': [-18, 3, 16, 26],
  'north africa': [-18, 15, 38, 38],
  zambia: [21.6, -18.4, 33.9, -7.8],
  europe: [-12, 34, 50, 63],
  'middle east': [25, 12, 63, 43],
  'asia-pacific': [90, -12, 180, 52],
  asia: [25, -12, 150, 60],
  'north america': [-130, 10, -55, 60],
  'south america': [-85, -56, -33, 14],
};

export function regionBox(region: string | [number, number, number, number]): [number, number, number, number] {
  if (Array.isArray(region) && region.length === 4 && region.every(Number.isFinite)) return region;
  // "auto" is worked out by the map drawer from the features; Zambia if it cannot.
  return REGIONS[String(region).trim().toLowerCase()] ?? REGIONS.africa;
}

/** Other names for countries (Natural Earth abbreviates some). */
export const COUNTRY_ALIASES: Record<string, string> = {
  'drc': 'Dem. Rep. Congo', 'dr congo': 'Dem. Rep. Congo', 'democratic republic of the congo': 'Dem. Rep. Congo', 'democratic republic of congo': 'Dem. Rep. Congo', 'congo drc': 'Dem. Rep. Congo', 'zaire': 'Dem. Rep. Congo', 'congo dr': 'Dem. Rep. Congo',
  'republic of the congo': 'Congo', 'congo brazzaville': 'Congo', 'congo republic': 'Congo',
  'swaziland': 'eSwatini', 'eswatini': 'eSwatini', 'ivory coast': "Côte d'Ivoire", "cote d'ivoire": "Côte d'Ivoire",
  'central african republic': 'Central African Rep.', 'car': 'Central African Rep.', 'south sudan': 'S. Sudan', 'western sahara': 'W. Sahara',
  'equatorial guinea': 'Eq. Guinea', 'usa': 'United States of America', 'united states': 'United States of America', 'america': 'United States of America',
  'uk': 'United Kingdom', 'britain': 'United Kingdom', 'great britain': 'United Kingdom', 'england': 'United Kingdom',
  'czech republic': 'Czechia', 'bosnia': 'Bosnia and Herz.', 'bosnia and herzegovina': 'Bosnia and Herz.', 'ussr': 'Russia', 'soviet union': 'Russia',
  'macedonia': 'North Macedonia', 'burma': 'Myanmar', 'dominican republic': 'Dominican Rep.',
  'northern rhodesia': 'Zambia', 'southern rhodesia': 'Zimbabwe', 'rhodesia': 'Zimbabwe', 'nyasaland': 'Malawi', 'bechuanaland': 'Botswana', 'basutoland': 'Lesotho',
  'tanganyika': 'Tanzania', 'south west africa': 'Namibia', 'gold coast': 'Ghana', 'abyssinia': 'Ethiopia', 'persia': 'Iran', 'siam': 'Thailand',
};

/** Compare names loosely: case, accents, "Lake", "River", "Mountains"… do not matter. */
export const nameKey = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\b(lake|river|the|mountains?|mts?|range|desert|province|district|ocean)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Zambia's agro-ecological regions by district, APPROXIMATE: the real
 * boundaries follow rainfall lines, not district borders, so a district is
 * put in the region that covers most of it. Region IIa is every district not
 * listed. Good enough for a sketch map question; say "approximate" on it.
 */
export const AGRO_ZONES: Record<'I' | 'IIb' | 'III', string[]> = {
  I: ['Gwembe', 'Sinazongwe', 'Siavonga', 'Chirundu', 'Kazungula', 'Livingstone', 'Zimba', 'Mwandi', 'Sesheke', 'Shangombo', 'Sioma', 'Mulobezi', 'Luangwa', 'Mambwe', 'Chama'],
  IIb: ['Kalabo', 'Mongu', 'Limulunga', 'Senanga', 'Nalolo', 'Sikongo', 'Lukulu', 'Mitete', 'Kaoma', 'Luampa', 'Nkeyema'],
  III: [
    'Chililabombwe', 'Chingola', 'Kalulushi', 'Kitwe', 'Luanshya', 'Lufwanyama', 'Masaiti', 'Mpongwe', 'Mufulira', 'Ndola', // Copperbelt
    'Chembe', 'Chiengi', 'Chifunabuli', 'Chipili', 'Kawambwa', 'Lunga', 'Mansa', 'Milengi', 'Mwansabombwe', 'Mwense', 'Nchelenge', 'Samfya', // Luapula
    'Chilubi', 'Kaputa', 'Kasama', 'Lunte', 'Lupososhi', 'Luwingu', 'Mbala', 'Mporokoso', 'Mpulungu', 'Mungwi', 'Nsama', 'Senga Hill', // Northern
    'Chavuma', 'Ikelenge', 'Kabompo', 'Kalumbila', 'Kasempa', 'Manyinga', 'Mufumbwe', 'Mushindano', 'Mwinilunga', 'Solwezi', 'Zambezi', // North-Western
    'Chinsali', 'Isoka', 'Kanchibiya', 'Lavushimanda', 'Mafinga', 'Mpika', 'Nakonde', "Shiwang'Andu", // Muchinga (not Chama)
    'Serenje', 'Chitambo', // Central, high rainfall
  ],
};
export const agroZoneOf = (district: string): 'I' | 'IIa' | 'IIb' | 'III' => {
  for (const z of ['I', 'IIb', 'III'] as const) if (AGRO_ZONES[z].includes(district)) return z;
  return 'IIa';
};

export function toGeoData(world: unknown, zambia: unknown, places: Place[], history: { places: Place[] }): GeoData {
  const w = world as { objects: Record<string, unknown> } & Parameters<typeof feature>[0];
  const z = zambia as { objects: Record<string, unknown> } & Parameters<typeof feature>[0];
  const fc = (topo: Parameters<typeof feature>[0], key: string) =>
    (topo.objects as Record<string, unknown>)[key] ? (feature(topo, (topo.objects as Record<string, never>)[key]) as unknown as FeatureCollection) : { type: 'FeatureCollection' as const, features: [] };
  return {
    layers: {
      countries: fc(w, 'countries'), lakes: fc(w, 'lakes'), rivers: fc(w, 'rivers'), regions: fc(w, 'regions'), seas: fc(w, 'seas'),
      provinces: fc(z, 'provinces'), districts: fc(z, 'districts'), zrivers: fc(z, 'rivers'), zlakes: fc(z, 'lakes'),
      agro: agroLayer(z),
    },
    places: [...history.places, ...places],
  };
}

/** The districts merged into one shape per agro-ecological region. */
function agroLayer(z: Parameters<typeof feature>[0]): FeatureCollection {
  const obj = (z.objects as Record<string, { geometries?: { properties?: { name?: string } }[] }>).districts;
  if (!obj?.geometries) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: (['I', 'IIa', 'IIb', 'III'] as const).map((zone) => ({
      type: 'Feature' as const,
      properties: { name: zone },
      geometry: merge(z as never, obj.geometries!.filter((g) => agroZoneOf(String(g.properties?.name ?? '')) === zone) as never),
    })),
  };
}

const LAYERS_FOR: Partial<Record<MapFeatureKind, (keyof GeoData['layers'])[]>> = {
  country: ['countries'], province: ['provinces'], district: ['districts'], lake: ['zlakes', 'lakes'], river: ['zrivers', 'rivers'], sea: ['seas'], region: ['regions'],
};

/** All features of one name (a river comes in several pieces). */
export function findShapes(data: GeoData, kind: MapFeatureKind, name: string): Feature<Geometry>[] {
  const layers = LAYERS_FOR[kind];
  if (!layers) return [];
  const wanted = kind === 'country' ? nameKey(COUNTRY_ALIASES[name.trim().toLowerCase()] ?? name) : nameKey(name);
  for (const layer of layers) {
    const hits = data.layers[layer].features.filter((f) => f.properties?.name && nameKey(String(f.properties.name)) === wanted);
    if (hits.length) return hits as Feature<Geometry>[];
  }
  return [];
}

/** Strict comparison for place names: only case, accents and punctuation are ignored ("Lake Victoria" is not "Victoria"). */
export const placeKey = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function findPlace(data: GeoData, name: string): Place | null {
  const key = placeKey(name);
  return data.places.find((p) => placeKey(p.name) === key || (p.aka ?? []).some((a) => placeKey(a) === key)) ?? null;
}

/**
 * A point for a name used as a route end or a place: a place first, else the
 * middle of a lake, country, province or region of that name.
 */
export function findPoint(data: GeoData, name: string, centroid: (f: Feature<Geometry>) => [number, number]): [number, number] | null {
  const pl = findPlace(data, name);
  if (pl) return [pl.lon, pl.lat];
  for (const kind of ['lake', 'country', 'province', 'region', 'sea'] as const) {
    const shapes = findShapes(data, kind, name);
    if (shapes.length) return centroid(shapes[0]);
  }
  return null;
}
