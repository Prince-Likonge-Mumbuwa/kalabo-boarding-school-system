// @/components/ai/figures/render/scene.ts — draws a "scene": one of the
// textbook diagrams listed in sceneCatalog.ts (Geography, ecology, science),
// with its parts labelled in words or letters. Each scene's drawing lives
// in render/scenes/*.ts; this file picks it and adds the labels.
import type { SceneSpec } from '../spec';
import { SCENES } from '../sceneCatalog';
import { placeholder, uid } from './svg';
import { sceneDefs, withLabels, type Drawer } from './scenes/kit';
import { dayNight, earthLayers, earthSunRays, eclipse, seasons, solarSystem } from './scenes/earth';
import { blockMountain, fold, landslide, riftValley, soilCreep, volcanicFeatures, volcano } from './scenes/landforms';
import { hep, irrigation, mining } from './scenes/economy';
import { flower, germination, leafSection, rootSection, rootTip, seed, stemSection } from './scenes/plants';
import { alveolus, circulation, digestiveSystem, heart, kidney, nephron, respiratorySystem, tooth } from './scenes/human1';
import { armMuscles, brain, ear, endocrineGlands, eye, femaleReproductive, foetus, maleReproductive, neurone, reflexArc, skin, synovialJoint, vertebra } from './scenes/human2';
import { choiceChamber, germinationFlasks, menstrualCycle, osmometer, potometer, respirationApparatus, soilDrainage } from './scenes/apparatus';
import { foodTest, microscope, photosynthesis } from './scenes/practicals';
import { bloodVessels, insect, tissueFluid, villus } from './scenes/structures';
import { animalCell, bacterialCell, mitosis, osmosisCells, plantCell, specialisedCell } from './scenes/cells';
import { carbonCycle, ecologicalPyramid, foodChain, nitrogenCycle, rockCycle } from './scenes/cycles';
import { settlementPatterns, settlementSites, urbanModel } from './scenes/settlement';
import { delta, drainagePattern, floodplain, meander, oxbowLake, rainfallConvectional, rainfallFrontal, rainfallRelief, riverProfile, vValley, waterCycle, waterfall } from './scenes/water';

const DRAWERS: Record<string, Drawer> = {
  'earth-layers': earthLayers, 'solar-system': solarSystem, 'earth-sun-rays': earthSunRays, seasons, eclipse, 'day-night': dayNight,
  fold, 'rift-valley': riftValley, 'block-mountain': blockMountain, 'volcanic-features': volcanicFeatures, volcano, 'soil-creep': soilCreep, landslide,
  'water-cycle': waterCycle, 'river-profile': riverProfile, waterfall, meander, 'oxbow-lake': oxbowLake, floodplain, 'v-valley': vValley, delta, 'drainage-pattern': drainagePattern,
  irrigation, hep, mining, 'rock-cycle': rockCycle, 'carbon-cycle': carbonCycle, 'nitrogen-cycle': nitrogenCycle, 'ecological-pyramid': ecologicalPyramid, 'food-chain': foodChain,
  'settlement-patterns': settlementPatterns, 'settlement-sites': settlementSites, 'urban-model': urbanModel,
  'plant-cell': plantCell, 'animal-cell': animalCell, 'bacterial-cell': bacterialCell, 'specialised-cell': specialisedCell, mitosis, 'osmosis-cells': osmosisCells,
  flower, 'leaf-section': leafSection, 'root-section': rootSection, 'stem-section': stemSection, seed, germination, 'root-tip': rootTip,
  heart, circulation, 'digestive-system': digestiveSystem, tooth, 'respiratory-system': respiratorySystem, alveolus, kidney, nephron,
  eye, ear, brain, skin, 'endocrine-glands': endocrineGlands, 'female-reproductive': femaleReproductive, 'male-reproductive': maleReproductive, foetus,
  vertebra, 'arm-muscles': armMuscles, 'synovial-joint': synovialJoint, 'reflex-arc': reflexArc, neurone,
  osmometer, potometer, 'respiration-apparatus': respirationApparatus, 'germination-flasks': germinationFlasks, 'choice-chamber': choiceChamber, 'soil-drainage': soilDrainage, 'menstrual-cycle': menstrualCycle,
  microscope, photosynthesis, 'food-test': foodTest, villus, 'blood-vessels': bloodVessels, 'tissue-fluid': tissueFluid, insect,
  'rainfall-relief': rainfallRelief, 'rainfall-convectional': rainfallConvectional, 'rainfall-frontal': rainfallFrontal,
};

export function renderScene(spec: SceneSpec): { svg: string; problems: string[] } {
  const info = SCENES[spec.scene];
  const draw = DRAWERS[spec.scene];
  if (!info || !draw) return { svg: placeholder(`No drawing for "${spec.scene}".`), problems: [`Unknown scene "${spec.scene}".`] };
  const variant = spec.variant && info.variants?.includes(spec.variant) ? spec.variant : info.variants?.[0] ?? '';
  const problems: string[] = [];
  if (spec.variant && !info.variants?.includes(spec.variant)) problems.push(`"${spec.variant}" is not a kind of ${spec.scene}; drawn as ${variant || 'the usual kind'}.`);
  const id = uid('sc');
  // No "labels" at all: a fully labelled textbook diagram (every part named).
  // An empty "labels": {} gives the bare diagram (for "Draw and label…" keys or learners to label).
  const allNames = Object.fromEntries(Object.entries(info.parts).map(([k, v]) => [k, nice(v)]));
  const drawn = draw({ variant, items: spec.items ?? [], id, labels: spec.labels ?? allNames });
  const labels = spec.labels ?? Object.fromEntries(Object.keys(drawn.anchors).filter((k) => info.parts[k]).map((k) => [k, allNames[k]]));
  const out = withLabels(drawn, labels, spec.title ?? info.title, sceneDefs(id));
  for (const k of Object.keys(spec.labels ?? {})) if (drawn.inline?.includes(k) && !drawn.anchors[k]) out.problems.push(`This diagram has no part "${k}".`);
  return { svg: out.svg, problems: [...problems, ...out.problems] };
}

/** "river cliff (erosion on the outer bend)" -> "River cliff": the short name for a label. */
const nice = (s: string) => { const short = s.replace(/\s*\(.*\)\s*$/, ''); return short[0].toUpperCase() + short.slice(1); };

/** The scenes this app can draw (for tests: every catalog entry needs a drawer). */
export const DRAWN_SCENES = Object.keys(DRAWERS);
