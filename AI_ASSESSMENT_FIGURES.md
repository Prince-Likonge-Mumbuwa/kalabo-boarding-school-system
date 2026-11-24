# Assessment figures: maps, graphs, charts, diagrams, structures and maths

The Assessment tool can now set questions on figures, the way ECZ papers do:
"Study the map below and answer the questions that follow." This file says
how it works and where each part lives.

## The idea in one paragraph

The AI never draws. It **describes** each figure as a small block of JSON
inside the test (a "figure spec"). The AI server **checks** every
description (do these places exist? does this graph cross where the
marking key says?) and **works out the answers** itself. The school app
then **draws** the figure accurately in black and white: real map outlines
from open map data, exact graphs computed by mathjs, real chemical
structures, and Mermaid diagrams. The drawing is always accurate because
no AI guesses at shapes.

```
 Teacher's form ──► AI server writes the test ──► server checks figures ──► app draws them
 (Diagrams: some)    (```figure JSON blocks,       (fixes once with the AI,   (SVG on screen and
                      $maths$ in TeX)               adds worked answers)       in print, PNG in Word)
```

## What a teacher sees

1. **Assessment form → Diagrams**: No diagrams / Some questions with diagrams
   / Mostly diagram-based questions.
2. **Pictures from your diagram library** (optional): open the library, then
   **Upload a picture** or **Take a photo** of a diagram from a book or the
   board. Drag a box around the diagram, tick *Pure black and white* for line
   drawings, and upload. The server straightens, crops and cleans the picture.
   Then click on the picture to place letters A, B, C… and type what each one
   marks. **Suggest with AI** fills in the title, description, tags and any
   letters already printed on the picture. Tick up to six pictures for the test.
3. While the test is written, the progress line shows **Checking diagrams…**
   (and **Fixing n figures…** if something needed correcting).
4. Under each figure, on screen only, a yellow box shows what the server
   worked out (e.g. *Intersection of y = sqrt(x) and y = x/2: (0, 0); (4, 2)*,
   *A = Kasama*) and anything it could not confirm. **This box never prints
   and never goes into the Word file.** Use it to check the marking key.
5. Print / PDF keeps the figures as sharp vector drawings. **Word** gets each
   figure and each piece of maths as a picture inside the .doc file.

## Kinds of figure

| Type | Used for | Drawn with |
|---|---|---|
| `graph` | functions, roots, intersections, shaded regions, travel graphs | mathjs + our SVG drawer |
| `chart` | bar charts, line graphs, histograms (values on bars) | our SVG drawer |
| `map` | sketch maps: places, countries, Zambian provinces/districts, lakes, rivers, seas, deserts/mountains, historical kingdoms, migration/trade routes, with letters, shading, key, scale and north arrow | d3-geo + Natural Earth + geoBoundaries, Rough.js for the hand-drawn look |
| `timeline` | dated events, some blanked with letters | our SVG drawer |
| `tree` | succession and family trees (stick figures), organisation charts | our SVG drawer |
| `diagram` | flowcharts, cycles, structures of government, network topologies, food webs | Mermaid |
| `molecule` | structural formulae (name or SMILES; the real structure comes from PubChem) | smiles-drawer |
| `image` | a picture from the teacher's diagram library with its letters | the cleaned picture + our letters |
| `circle` | circle theorems: points on a circle, chords, diameters, tangents, chords crossing, angle marks | our SVG drawer + `figureMath` |
| `globe` | Earth geometry: N/S, equator, circles of latitude, meridians, places | our SVG drawer + `figureMath` |
| `venn` | 2- or 3-set Venn diagrams: numbers in regions, shading from a set expression, word problems from totals | our SVG drawer + `figureMath` |
| `plane` | coordinate geometry (points, lines, segments on axes) and transformations (shapes and exact images on graph paper) | our SVG drawer + `figureMath` |
| `geometry` | bearings (north lines, bearing arcs) and trigonometry (triangles/quadrilaterals with lengths and angles), to scale | our SVG drawer + `figureMath` |
| `solid` | mensuration: cuboid, cube, prism, cylinder, cone, frustum/bucket, pyramid, pyramid frustum, sphere, hemisphere | our SVG drawer + `figureMath` |

`graph` also takes a `table` (an ECZ table of values worked out from the first
function, with blanks like *q*) and `hideCurves` (an empty answer grid).

### Shaded regions (inequalities, linear programming, sets, sectors)

Compared with ECZ papers 2025–2026:

- **ECZ shades the UNWANTED side** of every boundary and leaves the region
  **R clear**. A `graph` with `"inequalities": ["x >= 10", "y <= 2x", …]` now
  does exactly that: the app works out R itself (`feasibleRegion` in
  `figureMath.ts`), draws each boundary (dashed for < and >), puts a strip of
  hatching on the unwanted side (`"shadeStyle": "full"` hatches the whole
  unwanted area instead) and writes R. The AI no longer draws R's corners, so
  it cannot get them wrong.
- The server lists R's corners and, with `"objective": {"expr": "15x + 20y",
  "goal": "max"}`, the value at every corner and the best one (and the best
  whole-number point when a corner is not whole). It flags an empty R, an R
  that runs off the axes, a condition that never touches R, and lettered
  points that are not corners.
- Question styles: Paper 1 "Write the inequalities that define the unshaded
  region R" (figure without equations, with readable points); Paper 2 linear
  programming has **no finished graph in the question** (learners draw it);
  the finished figure (`labelLines`, `corners`, `objective`) goes in the
  Marking Key.
- Venn: "Shade … on the diagram" → the question figure is unshaded, the key's
  is shaded. "Use set notation to describe the shaded region" → the server
  writes the notation (`setNotation`, e.g. A ∩ (B ∪ C)′).
- Sectors: `circle` with `sector` (its label is the angle) and `lengths`
  ("14 cm" on the radius); the frame fits the sector only.
- Every label on a graph, circle or bearings figure is placed by
  `placeLabel` (`render/svg.ts`): it tries several spots and takes the first
  that touches no line, arc or other label.

## Exact maths figures (circle, globe, venn, plane, geometry, solid)

These were added after comparing generated papers with ECZ Mathematics papers
2025–2026 (Earth geometry was being drawn as a map of Zambia, circle theorems
as flowcharts). The rule for all six: **the AI describes, the app draws, the
server measures.**

- The AI places points from real numbers (a point's position on the circle,
  a bearing and distance, a latitude/longitude, a shape's corners).
- `figureMath.ts` turns that into exact positions. The **same file** is used by
  the app (to draw) and the AI server (to check), so the drawing and the
  marking key cannot disagree. There are two copies:
  `client/components/ai/figures/figureMath.ts` and
  `ai-server/src/services/figures/figureMath.ts` — **keep them identical**
  (edit one, copy it over the other).
- The server (`ai-server/src/services/figures/checkMaths.ts`) measures the
  figure and:
  - puts the answers in the yellow box (angles asked for, bearings, distances
    on the Earth, image coordinates, "describe fully" answers, Venn region
    counts, volumes and surface areas, table blanks);
  - reports any number the question states that the figure contradicts
    (e.g. "angle EFG = 52°" when EG is a diameter, so it must be 90°; a
    tangent that would meet "OQ extended" behind O; a frustum labelled 24 cm
    whose dims say otherwise). Those go to the AI once for a fix, and anything
    left shows in the yellow box.
- It reads the question text around the figure (`questionAround` in
  `process.ts`) for "angle ABC = 52°" and "the bearing of M from L is 110°".
- Earth-geometry globes are sketches like ECZ's: lines are spread out evenly
  (in the right order) so 13°S and 15°S stay readable; the key uses the true
  values with π = 3.142, R = 6370 km = 3437 nm.

| File | What it does |
|---|---|
| `client/components/ai/figures/figureMath.ts` | The maths: circle layout and angles, Earth distances and times, Venn regions and set expressions, transformations and "describe fully", lines and gradients, bearings, solids. |
| `client/components/ai/figures/render/circle.ts` | Circle-theorem drawer. |
| `…/render/globe.ts` | Earth-geometry globe drawer. |
| `…/render/venn.ts` | Venn drawer (hatching with clip paths and masks). |
| `…/render/plane.ts` | Coordinate geometry and transformations drawer. |
| `…/render/geometry.ts` | Bearings and trigonometry drawer. |
| `…/render/solid.ts` | Solids drawer (hidden edges worked out from which faces face us). |
| `…/render/svg.ts` | Now also: angle arcs, right-angle squares, equal-side ticks, letters placed in the widest gap between lines. |
| `…/render/mermaid.ts` | Now drops `style`/`classDef` colour lines the AI sometimes writes. |
| `ai-server/src/services/figures/checkMaths.ts` | Checks and answers for the six maths figures. |
| `ai-server/src/services/generation/figures.ts` | `MATHS_FIGURES`: the new types with examples, and how ECZ sets each topic (only sent for Mathematics). |

Maths anywhere in a test is written in TeX: `$x^2 + 3x - 4 = 0$` inline,
`$$ … $$` on its own line, chemistry with `$\ce{2H2 + O2 -> 2H2O}$`. It is
drawn by MathJax. Dollar amounts like "$5 and $10" stay plain text, and the
AI is told to write money in kwacha (K250).

## Geography and science diagrams (scene, climate, population, better maps)

ECZ Geography papers draw the Earth's tilt and the Sun's rays, folds, rift
valleys, intrusive volcanic features, drainage patterns, soil creep, sketch
maps with railways and regions, and ask for "a well labelled diagram" of a
settlement pattern or an urban model. Mermaid flowcharts cannot draw any of
these, so the app now draws them itself as clean black-and-white textbook
diagrams.

**scene** — one of 36 diagrams (61 with their variants), listed in
`sceneCatalog.ts`:

| Topic | Scenes (variants) |
|---|---|
| Earth and space | earth-layers, solar-system, earth-sun-rays (june, december, equinox), seasons, eclipse (solar, lunar), day-night |
| Earth movements | fold (simple, overfold, recumbent), rift-valley (tension, compression), block-mountain, volcanic-features, volcano, soil-creep, landslide |
| Water and rivers | water-cycle, river-profile, waterfall, meander, oxbow-lake, floodplain, v-valley, delta (arcuate, birds-foot, cuspate), drainage-pattern (dendritic, trellis, radial, parallel, rectangular, centripetal) |
| Rainfall | rainfall-relief, rainfall-convectional, rainfall-frontal |
| Cycles and ecology | rock-cycle, carbon-cycle, nitrogen-cycle, ecological-pyramid (numbers, biomass, energy), food-chain |
| Settlement | settlement-patterns (all, nucleated, linear, dispersed, isolated, cruciform), settlement-sites, urban-model (concentric, sector, multiple-nuclei) |
| Economy | irrigation (furrow, sprinkler, drip, centre-pivot, basin, canal-layout, canal-section), hep (dam, waterfall), mining (open-cast, underground) |

```figure
{"type":"scene","scene":"waterfall","labels":{"plunge-pool":"X","hard-rock":"Y"}}
```

Each scene has named **parts**. `labels` gives a part a letter (the server
writes "X = plunge pool" in the marking key) or words. No `labels` = fully
labelled (for the marking key or "Study the diagram…"); `{}` = bare (for "Label
the diagram"). Words go in tidy columns with leader lines; letters sit beside
the part with a short pointer. Pyramids and food chains take `items` (the
organisms).

**climate** — rainfall bars (mm, left axis) and a temperature line (°C, right
axis). The server works out the total rainfall, the wettest and driest months
(all of them when months tie), the mean temperature and the annual range.

**population** — a population pyramid; the server works out totals, the share
aged 0–14 and 65+, and the dependency ratio.

**map** additions: `"region":"auto"` zooms in around the features; `railway`
(line with cross ticks) and `road` features through real towns, with letters
such as R1; `"layers":{"agroRegions":true}` shades Zambia's agro-ecological
regions I, IIa, IIb and III (by district, approximate, as the map's credit
line says) and `agroLabels` letters them. The licence credit now sits under
the frame. If a question mentions a letter ("the railway marked R2") that is
not on the figure, the teacher sees a problem note.

| File | What it does |
|---|---|
| `client/components/ai/figures/sceneCatalog.ts` | The list of scenes, variants and parts. **Identical copy** in `ai-server/src/services/figures/sceneCatalog.ts`. Add a part in both. |
| `…/render/scene.ts` | Entry for scenes: picks the drawer, arranges the labels. |
| `…/render/scenes/kit.ts` | Shared pieces: rock and water patterns, arrows, trees, houses, clouds, label columns (`withLabels`). |
| `…/render/scenes/earth.ts` | Earth layers, solar system, Sun's rays, seasons, eclipses, day and night. |
| `…/render/scenes/landforms.ts` | Folds, faults, volcanoes, soil creep, landslides. |
| `…/render/scenes/water.ts` | Water cycle, river features, deltas, drainage patterns, rainfall types. |
| `…/render/scenes/cycles.ts` | Rock, carbon and nitrogen cycles, pyramids, food chains. |
| `…/render/scenes/settlement.ts` | Settlement patterns and sites, urban models. |
| `…/render/scenes/economy.ts` | Irrigation methods, HEP stations, mining. |
| `…/render/stats.ts` | Climate graphs and population pyramids. |
| `ai-server/src/services/figures/check.ts` | `checkScene`, `checkClimate`, `checkPopulation`, railway/road/agro answers, and the "letter asked but not drawn" check. |
| `ai-server/src/services/generation/figures.ts` | Tells Geography and Science papers about scenes (built from the catalog, so the AI only uses names that exist) and how ECZ asks with them. |

## Biology diagrams (cells, plants, the human body, experiments, graphs, genetics)

Built from the O Level Biology syllabus (CDC 2024) and the ECZ 5090 papers
(see `BIOLOGY_FIGURES_STUDY.md`; free reference images in
`BIOLOGY_FIGURE_SOURCES.md`). Every drawing is computed as SVG: nothing is
copied from a book or website.

**41 Biology scenes** (71 with their variants), in the same `scene` figure type as Geography:

| Topic | Scenes (variants) |
|---|---|
| Cells | plant-cell (light, electron), animal-cell (light, electron), bacterial-cell, specialised-cell (root-hair, palisade, guard-cells, xylem, phloem, red-blood-cell, white-blood-cell, sperm, ciliated), mitosis (all, interphase … telophase), osmosis-cells (plant, animal) |
| Plants | flower (insect, wind), leaf-section, root-section (dicot, monocot), stem-section (dicot, monocot), seed (bean, maize), germination (epigeal, hypogeal), root-tip |
| Human body | heart, circulation, digestive-system, tooth (molar, incisor), respiratory-system, alveolus, kidney (section, urinary-system), nephron, eye, ear, brain, skin, endocrine-glands (female, male), female-reproductive, male-reproductive, foetus, vertebra (cervical, thoracic, lumbar), arm-muscles, synovial-joint, reflex-arc, neurone (motor, sensory) |
| Experiments | osmometer (thistle-funnel, potato-cylinders), potometer, respiration-apparatus (animal, seeds), germination-flasks, choice-chamber (light, moisture), soil-drainage, menstrual-cycle |

Biology scenes put their letters (P, Q, R) or numbers (1, 2, 3) at the
side with long pointer lines, as ECZ papers do (`edge: true` in the drawer).

**Three new figure types:**

- `curve` draws smooth experimental curves from points, with dashed marks
  and letters at chosen x values. It is used for enzymes against
  temperature or pH, population growth and body temperature. The server
  reports each optimum and plateau.
- `food-web` takes [food, eater] links and places organisms in rows by
  trophic level. The server lists producers, herbivores, top consumers,
  the number of food chains and the longest chain.
- `genetic-cross` draws the ECZ genetic diagram or a Punnett square for
  simple, sex-linked (X^H X^h × X^h Y) and ABO (I^A I^O) crosses.
  `geneticsMath.ts` works the cross out on both sides, so the marking key
  always gives the right genotypes, phenotypes, ratio and probabilities.

| File | What it does |
|---|---|
| `…/render/scenes/biokit.ts` | Smooth outlines, tubes (vessels, ducts), organelles (chloroplast, mitochondrion, nucleus, ER, Golgi). |
| `…/render/scenes/cells.ts` | Cells, specialised cells, mitosis, osmosis in cells. |
| `…/render/scenes/plants.ts` | Flower, leaf, root and stem sections, seeds, germination, root tip. |
| `…/render/scenes/human1.ts` | Heart, circulation, digestive system, tooth, respiratory system, alveolus, kidney, nephron. |
| `…/render/scenes/human2.ts` | Eye, ear, brain, skin, endocrine glands, reproductive systems, foetus, vertebra, arm, joint, reflex arc, neurones. |
| `…/render/scenes/apparatus.ts` | Experiment set-ups and the menstrual cycle. |
| `…/render/bio.ts` | `curve`, `food-web`, `genetic-cross`. |
| `client/components/ai/figures/geneticsMath.ts` | The genetic cross. **Identical copy** in `ai-server/src/services/figures/`. |
| `ai-server/src/services/figures/check.ts` | `checkCurve`, `checkFoodWeb`, `checkGeneticCross` (answers for the key). |
| `ai-server/src/services/generation/figures.ts` | Biology / Agricultural Science papers get the Biology scenes and the ECZ 5090 rules (Paper 1 numbers and option tables, Paper 2 letters, essays without figures, a genetics question every year). |

## Where the files are

### School app (client/)

| File | What it does |
|---|---|
| `client/components/ai/figures/spec.ts` | The figure description format (TypeScript types). Same shapes as the server's zod schemas. |
| `client/components/ai/figures/render/index.ts` | One entry point: a spec in, SVG out. Loads the heavy libraries only when needed. |
| `client/components/ai/figures/render/svg.ts` | Shared drawing helpers: Times-like font, black ink, hatching and dot fills (they photocopy; colours do not). |
| `…/render/graph.ts`, `chart.ts`, `timeline.ts`, `tree.ts` | The four hand-written drawers. |
| `…/render/geo.ts` | Map data loading and name lookup (country aliases such as DRC, Northern Rhodesia). |
| `…/render/map.ts` | The map drawer (projection, provinces, lakes, rivers, letters, routes, key, scale bar, credits). |
| `…/render/math.ts` | TeX → SVG with MathJax (+ mhchem for chemistry). |
| `…/render/mermaid.ts` | Mermaid diagrams in black and white, with no HTML inside (so they export). |
| `…/render/molecule.ts` | Structural formulae with smiles-drawer. |
| `…/render/image.ts` | Library pictures with their letters on top. |
| `client/components/ai/figures/Figure.tsx` | One figure in a document: drawing, "Figure n: title", and the screen-only check box. |
| `client/components/ai/figures/MathText.tsx` | One piece of maths (shows the TeX until MathJax has loaded). |
| `client/components/ai/figures/FigureLibraryDialog.tsx` | The diagram library window and the picker on the Assessment form. |
| `client/components/ai/Markdown.tsx` | Now also reads ```` ```figure ```` blocks, code blocks, `$maths$` and `$$maths$$`. |
| `client/components/ai/DocumentPaper.tsx` | Figure styles; Word export turns figures and maths into PNG pictures; screen-only notes are removed from print and Word. |
| `public/geo/world.json` | Countries, lakes, rivers, deserts/mountains, seas (Natural Earth, public domain). |
| `public/geo/zambia.json` | Zambia's provinces and districts (Zambia Data Hub / geoBoundaries, **CC BY 4.0**: the credit is printed on maps that show them), rivers and lakes. |
| `public/geo/places.json` | Towns and capitals (Natural Earth). |
| `public/geo/history-places.json` | Our own list of historical places: kingdoms, mission stations, battles, heritage sites (approximate positions). Add places here when a History question needs one. |

### AI server (ai-server/)

| File | What it does |
|---|---|
| `src/services/generation/figures.ts` | What the AI is told about figures: the JSON format with examples, the maths rules, and how each subject uses figures (History, Geography, Maths, Sciences, Computer Studies). |
| `src/services/figures/spec.ts` | zod schemas: a figure description that does not fit is caught. |
| `src/services/figures/check.ts` | Checks each figure and works out answers (graph intersections and shaded areas, chart highest/lowest/total, map letters, timeline order, tree links, molecule formula and mass). |
| `src/services/figures/geoNames.ts` | Reads the names in `public/geo` so map names can be checked ("Did you mean Kasama?"). |
| `src/services/figures/pubchem.ts` | Looks compounds up on PubChem (free; needs internet on the server). |
| `src/services/figures/process.ts` | Runs after the test is written: check, ask the AI once for small fixes, check again, save the worked answers into each figure. |
| `src/services/figures/FigureLibrary.ts` | The diagram library: cleans uploads with sharp, keeps `storage/figures/<id>.png` and `storage/figures.json`. |
| `src/services/ai/VisionService.ts` | "Suggest with AI" for library pictures (NVIDIA vision model). |
| `src/routes/teacher.ts` | `/figures` endpoints; `/generate` sends the "Checking diagrams…" status and saves the checked test. |

`storage/figures/` is in `.gitignore`, like the rest of `storage/`: teachers'
pictures never go to GitHub. Back the `storage` folder up with the rest of
the AI server's data.

## Settings (ai-server/.env)

| Setting | Default | Meaning |
|---|---|---|
| `NVIDIA_VISION_MODEL` | `nvidia/nemotron-nano-12b-v2-vl` | Model for "Suggest with AI" on library pictures. |
| `GEO_DIR` | `../public/geo` | Where the server finds the map data to check map names. Change only if the AI server runs away from the website folder. |

Nothing has to be added to `.env` for figures to work.

## Testing it

1. Run `push-assessment-figures.bat` once (it installs the new packages
   and pushes everything; see below).
2. Start the AI server (`cd ai-server`, `npm run dev`) and the website (`pnpm dev`).
3. Assessment → choose a class and subject → Diagrams: *Mostly diagram-based
   questions* → Generate. Try History (maps, timelines, succession trees),
   Geography (sketch maps, charts), Mathematics (graphs, TeX), Chemistry
   (structures, `\ce`), Computer Studies (flowcharts, topologies, code).
4. Check the yellow boxes under figures against the marking key, then
   Print / PDF and Word.

## Libraries added

School app (root `package.json`): `mathjax-full`, `mermaid`, `smiles-drawer`,
`mathjs`, `d3-geo`, `topojson-client`, `roughjs` (+ types). `vite.config.ts`
keeps them out of the start-up file, so they download only when a teacher
opens a document with figures or maths.

AI server (`ai-server/package.json`): `mathjs` (solving graphs) and `sharp`
(cleaning pictures).

## Licences and credits

- Natural Earth: public domain.
- Zambia province and district boundaries: Zambia Data Hub via geoBoundaries,
  CC BY 4.0. The map drawer prints "Boundaries: Zambia Data Hub /
  geoBoundaries (CC BY 4.0)" on maps that show them. Keep that line.
- PubChem: public data from the US National Library of Medicine.
- MathJax, Mermaid, smiles-drawer, mathjs, d3, Rough.js: open-source (Apache/MIT/ISC).
- Diagrams cropped from ECZ papers are for use inside the school only.
