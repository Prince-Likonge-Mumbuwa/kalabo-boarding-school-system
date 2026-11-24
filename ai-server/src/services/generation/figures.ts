/**
 * What the assessment writer is told about figures: how to describe one
 * (a ```figure JSON block that the school app draws), how to write maths,
 * and how each subject uses figures in ECZ papers. The app draws; the AI
 * only describes, so drawings are always accurate (real map outlines, exact
 * graphs, real chemical structures). The server then checks every block
 * (services/figures) and works out the answers.
 */

import { SCENES } from "../figures/sceneCatalog.js";

export interface LibraryPicture { id: string; title: string; description: string; labels: { letter: string; meaning: string }[] }
export interface FigureExtras {
  library?: LibraryPicture[];
  /** Names in the app's history places list (kingdoms, missions, battles, heritage sites). */
  historyPlaces?: string[];
}

type Family = "history" | "geography" | "maths" | "biology" | "science" | "cs" | "general";
const familyOf = (subject: string): Family => {
  const s = subject.toLowerCase();
  if (/history|civic|social studies|religious/.test(s)) return "history";
  if (/geograph/.test(s)) return "geography";
  if (/math/.test(s)) return "maths";
  if (/biolog|agric|integrated science|life science/.test(s)) return "biology";
  if (/chem|physic|science/.test(s)) return "science";
  if (/computer|ict|information/.test(s)) return "cs";
  return "general";
};

const HOW = `FIGURES. A figure is written as a fenced block whose language is "figure" and whose content is ONE JSON object, placed where the figure should appear (after the stimulus sentence such as "Study Figure 1 below and answer the questions that follow."). The school app draws it in black and white, numbers it "Figure 1, 2, …" and prints its title under it, so refer to figures by number and never draw with characters. Use valid JSON: double quotes, no comments, no trailing commas. Never write a "_check" key. Letters (A, B, C…) on a figure mark what the question asks about; put what each letter is in the Marking Key.
Figure types (pick the one that fits; every type also takes "title" and "size": "small" | "medium" | "large"):
- graph — exact graphs of functions (mathjs syntax: x^2 - 4, sqrt(x), 2*sin(x), abs(x), exp(x)); for straight-line pieces (distance–time, velocity–time) use several functions with "from"/"to":
  {"type":"graph","title":"Graphs of y = x² − 4 and y = x + 2","x":{"min":-4,"max":5,"label":"x"},"y":{"min":-5,"max":10,"label":"y"},"functions":[{"expr":"x^2 - 4"},{"expr":"x + 2","dashed":true}],"points":[{"x":3,"y":5,"label":"P"}],"shade":{"top":1,"bottom":0,"from":-2,"to":3},"grid":true}
  ("shade" fills between functions by index, null = the x-axis.)
  "functions" are always y = f(x): the expr "20" is the HORIZONTAL line y = 20. A vertical line x = c goes in "lines": {"x":10,"label":"x = 10"}; "lines" also take {"y":20,"label":"y = 20"}, and are dashed unless "dashed": false (use false for ≤ / ≥ boundaries).
  Inequalities and linear programming: give "inequalities" and the app draws every boundary, shades the UNWANTED side (as ECZ does) and leaves R clear.
- chart — bar, line or histogram from data, values usually printed on bars:
  {"type":"chart","kind":"bar","title":"Copper production, 2019–2023","x":{"label":"Year"},"y":{"label":"Tonnes (thousands)"},"categories":["2019","2020","2021","2022","2023"],"series":[{"values":[797,861,800,763,698]}],"showValues":true}
- diagram — box-and-arrow diagrams in Mermaid (flowcharts, cycles, structures of government, network topologies, food webs). Put a letter in a box to blank it and give the answers in "blanks". Plain text labels only (no HTML, no quotes inside labels):
  {"type":"diagram","title":"Structure of local government","mermaid":"flowchart TD\\n  M[Ministry of Local Government] --> C[A]\\n  C --> W[Ward Development Committee]","blanks":{"A":"City/Municipal/Town Council"}}
- timeline — dated events, optionally blanked:
  {"type":"timeline","title":"Road to independence","events":[{"date":"1953","label":"Federation formed"},{"date":"1963","label":"Federation dissolved","blank":"A"},{"date":"1964","label":"Independence"}]}
- tree — family, succession or organisation charts ("people": true draws small figures):
  {"type":"tree","people":true,"title":"Succession of rulers","nodes":[{"id":"a","label":"Mulambwa"},{"id":"b","label":"Silumelume","parent":"a"},{"id":"c","label":"Mubukwanu","parent":"a","blank":"X"}]}
- map — a real map drawn from open map data; ECZ-style sketch look by default:
  {"type":"map","title":"Sketch map of Zambia","region":"Zambia","layers":{"provinces":true,"rivers":"major","lakes":"major"},"features":[{"kind":"place","name":"Kasama","label":"A"},{"kind":"lake","name":"Lake Kariba","label":"B"},{"kind":"province","name":"Western","shade":"hatch"},{"kind":"river","name":"Zambezi","text":"Zambezi"}]}
  region: World, Africa, Southern Africa, Central Africa, East Africa, West Africa, North Africa, Zambia, Europe, Middle East, Asia, Asia-Pacific, North America, South America, [west, south, east, north] in degrees, or "auto" (zoomed in around the features — use it for a map of one part of Zambia, e.g. the line of rail from Lusaka to Ndola).
  feature kinds: place (a town or historical site: a dot), country, province / district (Zambia), lake, river, sea (oceans too), region (deserts, mountains, basins: e.g. Sahara, Kalahari, Drakensberg, Congo Basin), kingdom (an oval around a historical kingdom's place), route ("from", "to", optional "via" — an arrow for migrations, trade routes, invasions, journeys), railway and road ("from", "to", optional "via" through real towns — drawn with the map symbols, a railway with cross ticks; give "label" such as "R1" when the question asks about them).
  Zambia's agro-ecological regions: "layers":{"agroRegions":true} shades regions I, IIa, IIb and III (by district, approximate); "agroLabels":{"I":"P","III":"Q"} puts letters on them instead of their names.
  Every letter the question mentions ("the railway marked R1", "the region labelled P") MUST be on the figure. Each takes "label" (a letter) and/or "text" (words printed on the map) and countries/provinces/regions may take "shade": "hatch" | "dots" | "grey". Use real, well-known names; modern country names are safest (historical names like Northern Rhodesia are accepted).
- scene — a clean textbook diagram the app draws (landforms, rivers, rainfall, the water/rock/carbon/nitrogen cycles, ecological pyramids, food chains, the Earth and the Sun, settlement patterns and sites, urban models, irrigation, HEP, mining). See the list of scenes below. "labels" gives a part a letter (to identify) or words; leave "labels" out for a fully labelled diagram (for "Study the diagram…" questions), give {} for an unlabelled one:
  {"type":"scene","scene":"waterfall","title":"A waterfall","labels":{"plunge-pool":"X","hard-rock":"Y","gorge":"Z"}}
  {"type":"scene","scene":"ecological-pyramid","variant":"numbers","items":["Grass","Grasshoppers","Frogs","Snakes"]}
- climate — a climate graph: twelve monthly rainfall values (mm, bars) and temperatures (°C, line), January first:
  {"type":"climate","station":"Mongu","rainfall":[210,190,140,40,4,0,0,0,2,25,95,205],"temperature":[24.5,24.4,24.3,23.2,20.4,17.8,17.8,20.6,24.6,27.1,26,24.6]}
- population — a population pyramid (males left, females right, youngest group at the bottom; unit "percent" (default), "thousands" or "millions"):
  {"type":"population","place":"Zambia","year":2022,"groups":["0-14","15-29","30-44","45-59","60-74","75+"],"male":[22.7,14.8,7.2,3.4,1.4,0.4],"female":[22.5,15.3,7.6,3.6,1.6,0.6]}
- molecule — a structural formula; give the compound's name (the server finds the real structure) or SMILES:
  {"type":"molecule","name":"ethanoic acid","label":"Q"}
- image — a picture from the teacher's diagram library (only the ids listed below, if any): {"type":"image","id":"…","showLabels":["A","B"]}
MATHS AND SYMBOLS. Write mathematics in TeX between single dollar signs inline ($x^2 + 3x - 4 = 0$, $\\frac{3}{4}$, $\\sqrt{2}$, $25\\,\\text{cm}^3$, $90^\\circ$, $\\angle ABC$) and between double dollar signs on a line of its own for a displayed equation. Chemical formulae and equations use \\ce: $\\ce{H2SO4}$, $\\ce{2H2 + O2 -> 2H2O}$, $\\ce{Cu^2+}$. Never use the dollar sign for money (write K for kwacha, e.g. K250). Inside a table cell, write | in maths as \\lvert. Always leave a space between closing maths and the next word ("$B$ and $C$ of").
SUB-PARTS. Put each sub-part — (a), (b) and (i), (ii), (iii) — on a line of its own, with its marks in square brackets at the end of that line.`;

/**
 * The textbook diagrams ("scenes") the app draws, listed from the shared
 * catalog so the AI only names scenes, variants and parts that exist.
 */
/** Scenes for Biology / Agricultural / Integrated Science; Geography gets the rest (the cycles and ecology go to both). */
const BIOLOGY_SCENES = new Set(["plant-cell", "animal-cell", "bacterial-cell", "specialised-cell", "mitosis", "osmosis-cells", "flower", "leaf-section", "root-section", "stem-section", "seed", "germination", "root-tip",
  "heart", "circulation", "digestive-system", "tooth", "respiratory-system", "alveolus", "kidney", "nephron", "eye", "ear", "brain", "skin", "endocrine-glands", "female-reproductive", "male-reproductive", "foetus",
  "vertebra", "arm-muscles", "synovial-joint", "reflex-arc", "neurone", "osmometer", "potometer", "respiration-apparatus", "germination-flasks", "choice-chamber", "soil-drainage", "menstrual-cycle",
  "microscope", "photosynthesis", "food-test", "villus", "blood-vessels", "tissue-fluid", "insect"]);
const SHARED_SCENES = new Set(["water-cycle", "carbon-cycle", "nitrogen-cycle", "rock-cycle", "food-chain", "ecological-pyramid", "irrigation"]);
const sceneList = (fam: Family) => Object.entries(SCENES).filter(([key]) => (fam === "biology" ? BIOLOGY_SCENES.has(key) || SHARED_SCENES.has(key) : !BIOLOGY_SCENES.has(key)))
  .map(([key, s]) => `- ${key} (${s.title})${s.variants ? ` variants: ${s.variants.join(", ")}` : ""}${s.items ? `; items: ${s.items}` : ""}; parts: ${Object.keys(s.parts).join(", ")}`)
  .join("\n");

const SCENE_FIGURES = (fam: Family) => `SCENES (textbook diagrams; use these, NEVER a Mermaid "diagram", for anything that has a shape: landforms, rivers, the solar system, settlements, irrigation; cells, organs, plant structures, experiment set-ups, cycles, food chains). Use only these scene names, variants and part keys:
${sceneList(fam)}
How ECZ asks with them: "Study the diagram/Figure 2 which shows … and answer the questions that follow." then (i) name the features/parts marked A, B, C [3]; (ii) describe how the feature marked X is formed [3]; (iii) state two uses/problems/economic importance [2]; or "Draw a well labelled diagram of … " (then put no figure in the question and a fully labelled scene in the marking key). Questions about ONE part give that part a letter and leave the others unlabelled or in words; never letter more than six parts. A question that asks the learner to label a diagram gives {} labels in the question and the full labels in the key.
Climate graphs: questions ask for the total annual rainfall, the wettest/driest month, the mean annual temperature and the annual range (the server works these out), the hemisphere (hottest months December–February → southern) and the climate type (e.g. tropical continental/savanna: summer rain, dry winter). Population pyramids: ask to describe the shape (wide base = high birth rate), the dependency ratio, and problems and solutions. Settlement questions: patterns (nucleated, linear, dispersed, isolated) with reasons; sites (wet point, dry point, gap town, bridging point, confluence, defence); functions; urban models (concentric, sector, multiple nuclei) and land-use zones.`;

const BIOLOGY_FIGURES = `HOW ECZ SETS BIOLOGY (5090), from the past papers:
- Paper 1 (40 multiple-choice): about half the questions have a figure. Label parts with NUMBERS ("labels":{"aorta":"1","left-ventricle":"2","septum":"3"}) and ask "Identify the parts numbered 1, 2 and 3", giving the four options as a table (| | 1 | 2 | 3 | with rows A–D). Other items read a graph (curve), a food web, a table of results or an experiment set-up.
- Paper 2 Section A (5 compulsory structured questions, about 9 marks each): almost every question opens "Figure n shows …" and then asks, in order: identify the parts labelled P, Q, R [1 each]; state the function or a property of one labelled part; explain a process ("At the end of the experiment explain how … would have changed"); apply it (a control experiment, a disorder, an adaptation, a named example). Label parts with capital LETTERS (P, Q, R, S…); give each question 3–5 letters at most and leave the other parts unlabelled ({} for the rest).
- Paper 2 Section B (answer any 3 of 5 essays, 12 marks each): no figures; "Describe…", "Explain…", "Compare and contrast…", "With named examples…", "Describe how you would demonstrate…". Often ends with a health or society part.
- Genetics comes up every year: give the cross in words or as a family tree (tree) and ask for genotypes and "Use a genetic diagram to show…" [4–6]. Put the worked cross in the MARKING KEY as a genetic-cross figure (the server works it out, so it is always right); never draw the answer in the question.
- "Draw a well labelled diagram of …": no figure in the question; the fully labelled scene (no "labels" key) goes in the marking key.
OTHER BIOLOGY FIGURE TYPES:
- curve — experimental curves from points: {"type":"curve","title":"Effect of pH on the activity of two enzymes","x":{"label":"pH","min":0,"max":14,"step":1},"y":{"label":"Rate of reaction","min":0,"max":10,"step":2},"series":[{"name":"N","points":[[1,0.5],[2,4],[3,7.5],[4,8.6],[5,7],[6,4],[7,1.5]]},{"name":"O","points":[[7,1],[8,4],[9,7.8],[10,8.8],[11,7],[12,3.5],[13,1]]}],"marks":[{"x":4,"label":"X"},{"x":10,"label":"Y"}]} — use for enzymes (temperature, pH), S-shaped population growth ("grid":true for graph paper), body temperature, rate of photosynthesis. The server reports each optimum and plateau.
- food-web — [food, eater] links, arrows point to the eater: {"type":"food-web","links":[["Grass","Grasshopper"],["Grass","Rabbit"],["Grasshopper","Frog"],["Frog","Snake"],["Rabbit","Snake"],["Snake","Hawk"]],"labels":{"Frog":"P"}}. The server lists producers, herbivores, top consumers, the number of food chains and the longest chain.
- genetic-cross — {"type":"genetic-cross","parents":["Tt","tt"],"traits":{"T":"tall","t":"short"}}; sex-linked: ["X^H X^h","X^h Y"] with {"H":"normal","h":"haemophiliac"}; blood groups: ["I^A I^O","I^B I^O"]; "style":"punnett" for a Punnett square; "hide":["offspring","phenotypes"] leaves blanks for the learner to complete.
- Experiment set-ups are scenes (osmometer, potometer, respiration-apparatus, germination-flasks, choice-chamber, soil-drainage, photosynthesis: pondweed / variegated-leaf / foil-leaf, food-test, microscope); ask what each part is for, what is observed, the control, and the conclusion.
- Use the Zambian context: maize, beans, cassava, groundnuts, kapenta, cattle, goats, Kafue lechwe; local diseases (malaria, bilharzia, cholera, TB, HIV and AIDS).`;

/**
 * The exact maths figures (drawn and measured with figureMath.ts) and how ECZ
 * sets each topic. Only Mathematics papers get this part.
 */
const MATHS_FIGURES = `MATHS FIGURES. Geometry is NEVER a "diagram" (Mermaid draws boxes and arrows, not circles or triangles). Use these types; the server measures every figure, works out the marking key from it, and rejects a question whose numbers the figure contradicts, so build the figure first and take every given angle, length and bearing FROM it.
- circle — circle theorems (ECZ Paper 1 style). Circle radius 1, centre O. Points on the circle by "at" (degrees anticlockwise from the right); other points by "meet" (where two lines cross: ["A","C"] is line AC, "tangent:B" the tangent at B) or "along" a line with "distance" (in radii, negative = the other way). An inscribed angle is half the arc it stands on; a diameter joins points 180° apart.
  {"type":"circle","title":"Circle centre O","points":[{"id":"A","at":210},{"id":"B","at":-70},{"id":"C","at":30},{"id":"D","at":146},{"id":"T","along":"tangent:B","distance":-1.1},{"id":"R","along":"tangent:B","distance":0.9},{"id":"X","meet":[["A","C"],["B","D"]]}],"lines":[["A","B"],["B","C"],["C","D"],["D","A"],["B","D"],["O","B"],["T","R"]],"diameters":[["A","C"]],"angles":[{"at":"B","arms":["O","C"],"label":"40°"},{"at":"C","arms":["D","A"],"label":"32°"}],"find":["ABT","OAB","CXD"]}
  Mark every given angle on the figure ("angles") and state it in the question; list every angle the question asks for in "find". "equal": [["B","C"],["C","D"]] ticks equal chords; "sector": {"from":"A","to":"B","label":"63°"} draws only a sector (arc length and sector area questions).
- globe — Earth geometry. {"type":"globe","parallels":["52°N","78°S"],"meridians":["43°W","76°E"],"points":[{"id":"A","lat":"52°N","long":"43°W"},{"id":"C","lat":"78°S","long":"76°E"}],"find":[["A","C"]]}. Every place must lie on a drawn parallel (or the equator) and a drawn meridian. List the pairs the question asks about in "find".
- venn — {"type":"venn","sets":[{"id":"F","label":"French"},{"id":"C","label":"Chinese"},{"id":"J","label":"Japanese"}],"counts":{"F":23,"FC":20,"FCJ":3,"":15}} (region names list the sets they are inside, "" = outside every circle; values may be letters like "x" or "2x"). To shade: "shade":"A′ ∩ (B ∩ C)". For a word problem give the question's totals instead of counts: "totals":{"ξ":40,"M":25,"B":20,"G":15,"MB":9,"MG":10,"BG":7,"MBG":4} and the server works out every region. Set letters are single capital letters.
- plane — coordinate geometry and transformations. "grid":"paper" (1-unit graph paper, for transformations) or "none" (axes only, for coordinate-geometry sketches). Shapes by corners; their name gives the corner letters in order ("ABC", "A1B1C1"). Images are worked out exactly from "transform": translate {"vector":[a,b]}, reflect {"line":"y = x" | "x = 2" | "y-axis"}, rotate {"angle":90 (anticlockwise; -90 = clockwise),"centre":[0,0]}, enlarge {"factor":-2,"centre":[0,0]}, stretch/shear {"factor":2,"invariant":"x-axis"}, matrix {"matrix":[[a,b],[c,d]]}. "hidden": true when the learner must draw it. "describe" lists pairs whose transformation the learner must describe fully.
  {"type":"plane","x":{"min":-9,"max":6},"y":{"min":-9,"max":6},"grid":"paper","shapes":[{"name":"ABCD","vertices":[[1,1],[1,3],[3,3],[4,1]]},{"name":"A1B1C1D1","vertices":[[1,-2],[1,-6],[3,-6],[4,-2]]}],"images":[{"of":"ABCD","name":"A2B2C2D2","transform":{"type":"rotate","angle":90},"hidden":true}],"describe":[["ABCD","A1B1C1D1"]]}
  {"type":"plane","grid":"none","x":{"min":-2,"max":16},"y":{"min":-3,"max":11},"points":[{"id":"A","x":5,"y":0,"coords":true},{"id":"B","x":14,"y":6,"coords":true},{"id":"C","x":2,"y":9,"coords":true}],"lines":[{"through":["A","B"]}],"segments":[{"from":"A","to":"B"}]}
- geometry — bearings and trigonometry, drawn to scale. Points by "x","y", or "from" another point with "bearing" (clockwise from north) or "angle" (anticlockwise from the right) and "distance". "north" lists the points that get a north line; an angle arm "north" is the north line (bearing arcs). Side labels and marked angles must equal the real lengths and angles.
  {"type":"geometry","points":[{"id":"L","x":0,"y":0},{"id":"M","from":"L","bearing":110,"distance":6},{"id":"K","from":"L","bearing":143,"distance":5.3}],"sides":[{"from":"L","to":"M"},{"from":"M","to":"K"},{"from":"K","to":"L"}],"north":["L"],"angles":[{"at":"L","arms":["north","M"],"label":"110°"},{"at":"M","arms":["L","K"],"label":"62°"}],"find":["bearing of K from M","angle LKM"]}
  {"type":"geometry","points":[{"id":"M","x":0,"y":0},{"id":"L","from":"M","angle":75,"distance":23.7},{"id":"N","from":"M","angle":-31,"distance":16.6}],"sides":[{"from":"L","to":"M","label":"23.7 m"},{"from":"M","to":"N","label":"16.6 m"},{"from":"L","to":"N"}],"angles":[{"at":"M","arms":["L","N"],"label":"106°"}],"find":["length LN","area of LMN"]}
- solid — mensuration: "shape" cuboid | cube | cylinder | cone | frustum | pyramid | pyramid-frustum | prism | sphere | hemisphere; "dims" in the question's units (length, width, height, radius, topRadius, topLength, topWidth; prism: base, triangleHeight, length); "labels" print measurements ({"height":"15 cm","diameter":"24 cm","topDiameter":"6 cm","radius":…,"slant":…}); "showCut": true draws the cone a frustum (bucket) was cut from; "letters" name corners; "pi": 3.142 or 22/7 as the question says.
  {"type":"solid","shape":"frustum","dims":{"radius":12,"topRadius":3,"height":15},"labels":{"diameter":"24 cm","topDiameter":"6 cm","height":"15 cm"},"pi":3.142}
- graph with "inequalities" — inequalities and linear programming. {"type":"graph","x":{"min":0,"max":70,"step":10,"label":"x (scones P)"},"y":{"min":0,"max":70,"step":10,"label":"y (scones Q)"},"functions":[],"inequalities":["x >= 10","y >= 20","y <= 2x","x + y <= 60"],"labelLines":true,"corners":["A","B","C"],"objective":{"expr":"15x + 20y","goal":"max"}}. The app works out R exactly, shades the unwanted side of every line (dashed lines for < and >) and writes R; the server lists R's corners and the objective at each. Choose numbers so every inequality touches R and R is closed inside the axes. Never draw R yourself with "region" or "points". "labelLines" and "objective" are for Marking Key figures only.
- construction — ruler-and-compasses constructions and loci (Paper 2). Give the triangle exactly as the question states it ("sides" in cm, "angles" in degrees, keyed "PQ" / "PQR" or "Q"); the first two letters are the base. "loci" (at most 4), numbered from 0 for "region": {"kind":"circle","centre":"Q","radius":6} (points 6 cm from Q), {"kind":"parallel","to":"QR","distance":2} (points 2 cm from QR), {"kind":"angle-bisector","at":"P"} (equidistant from the two sides at P), {"kind":"perpendicular-bisector","of":"PQ"} (equidistant from P and Q), {"kind":"perpendicular","from":"R","to":"PQ"}. "region" keeps one side of each locus: circle "inside"/"outside", parallel "near"/"far", angle-bisector the side nearer an arm ("PR"), perpendicular-bisector the point it is nearer ("P"). The app draws it to scale with every construction arc and hatches the region; the server measures the lengths and angles for the key and rejects an empty region.
  {"type":"construction","title":"Triangle PQR and the loci","triangle":{"name":"PQR","sides":{"PQ":10,"QR":7},"angles":{"PQR":50}},"loci":[{"kind":"circle","centre":"Q","radius":6,"label":"(i)"},{"kind":"parallel","to":"QR","distance":2,"label":"(ii)"},{"kind":"angle-bisector","at":"P","label":"(iii)"}],"region":[{"locus":0,"keep":"inside"},{"locus":1,"keep":"far"},{"locus":2,"keep":"PR"}],"regionLabel":"T"}
  It goes in the MARKING KEY only (the learner constructs it). Use angles a learner can construct with compasses (30°, 45°, 60°, 75°, 90°, 105°, 120°, 135°) unless the question says to use a protractor.
- graph extras for cubic (and quadratic) graphs: "table":{"x":[-2,-1,0,1,2,3,4,5],"blanks":{"4":"q"}} prints the table of values worked out from the FIRST function, with q where the learner calculates; "hideCurves": true gives an empty answer grid when the learner draws the graph. Add the line of a "use your graph to solve" equation as a second function so the key has the intersections.

HOW ECZ SETS THESE TOPICS (follow this style):
- Circle theorems: "A, B, C and D are points on the circumference of a circle centre O. Angle OBC = 40°… TR is a tangent at B." then "Find (a) angle ABT, (b) angle OAB, (c) angle CXD" worth [1] [1] [2]. Pure geometry, no real-life story. Each answer takes 2 or 3 theorems (isosceles triangle of radii, angle at centre, same segment, semicircle, cyclic quadrilateral, alternate segment, tangent ⟂ radius). The marking key gives the reason for each step. A tangent "meets AC extended at T" only where the lines really meet beyond C.
- Earth geometry: a globe figure; the question states "[Take π as 3.142 and R = 6370 km]" (or R = 3437 nm). 1° of latitude (and of longitude on the equator) = 60 nm; along a parallel: 60 × difference in longitude × cos(latitude) nm; time: 4 minutes per degree, east is ahead. Real towns use their real positions (Lusaka 15°S 28°E, Livingstone 18°S 26°E, Chipata 14°S 33°E, Kasama 10°S 31°E); "north of" means a smaller southern latitude.
- Sets: a Venn diagram in a rectangle labelled ξ. Three styles: (1) "Shade A′ ∩ (B ∩ C) on the diagram in the answer space." [2]: the question figure is UNSHADED; the Marking Key repeats the figure with "shade". (2) "Use set notation to describe the shaded region." [2]: the question figure has "shade"; the server writes the set notation for the key. (3) A word problem with totals ("In a class of 40 …, 25 study Mathematics …, 4 study all three"): (i) "Illustrate this information in a Venn diagram" — no figure in the question; the completed venn (with "totals") goes in the Marking Key; (ii) "How many … only / exactly two / none / at least one?" [1] each; probability questions use these numbers.
- Inequalities, Paper 1 (about Q21, [3]–[5]): "Write down the three (or four) inequalities that define the unshaded region R." The question figure has "inequalities" (no labelLines) and marks the points learners need to find each line: axis intercepts readable from the grid, or a labelled point such as {"x":4,"y":5,"label":"(4, 5)"}. Never write the inequalities in the question.
- Linear programming, Paper 2 ([10]–[12]): a story ("A man makes two types of bricks …") with 4 conditions; (a) "Write down four inequalities …" (b) "Using a scale of 2 cm to represent 10 units on each axis, draw the graphs … and shade the unwanted region" (c) "… how many of each should be made to maximise profit?" (d) "Calculate the maximum profit." The question has NO completed graph (learners draw it); at most an answer grid: the same graph with "hideCurves": true. The completed figure ("labelLines", "corners", "objective") goes in the Marking Key, which tests the objective at every corner. Use whole-number corners where possible.
- Sectors and arcs: a circle figure with "sector" (its label is the angle; do not mark that angle again) and "lengths" for the radius: {"type":"circle","points":[{"id":"A","at":0},{"id":"B","at":60}],"sector":{"from":"A","to":"B","label":"60°"},"lengths":[{"from":"O","to":"A","label":"14 cm"}]}. State π (22/7 or 3.142) in the question.
- Transformations (Paper 2, 10–12 marks): give the corners, "Using a scale of 1 cm to represent 1 unit on each axis for −9 ≤ x ≤ 6 …, draw and label ABCD", then describe fully, find matrices, centre and scale factor of an enlargement, shear factor.
- Coordinate geometry: length, midpoint, gradient, equation of a line, perpendicular line through a point, on a "none" grid sketch with labelled coordinates.
- Constructions and loci (Paper 2, 8–10 marks): "(a) Using a ruler and a pair of compasses only, construct triangle PQR in which PQ = 10 cm, QR = 7 cm and angle PQR = 60°. [3] (b) Measure and write down the length of PR. [1] (c) On your diagram, construct the locus of points within the triangle which are (i) 6 cm from Q, (ii) 2 cm from QR, (iii) equidistant from PR and PQ. [4] (d) A point T inside the triangle is less than or equal to 6 cm from Q, more than 2 cm from QR and nearer to PR than to PQ. Indicate clearly, by shading, the region in which T must lie. [2]" The question has NO figure. The Marking Key has the complete construction figure (with "region" and "regionLabel") and, as maths, the measured values the server gives (e.g. $PR = 8.9 \\text{ cm} \\pm 0.2$ for this triangle) with B1/M1 marks for the construction, each locus and the region.
- Bearings: points on level ground, three-figure bearings, north line at each point a bearing is taken from.
- Trigonometry: triangle or quadrilateral with lengths and angles marked; cosine rule, sine rule, area ½ab sin C, shortest distance.
- Mensuration: cones, frustums (buckets), cylinders, pyramids and pyramid frustums, prisms, spheres; state the value of π to use; volumes, surface areas, similar solids.
- Cubic graphs (Paper 2): "The variables x and y are connected by the equation y = x³ − 5x² − x + 5 as shown in the table" (graph with table and hideCurves), "(i) Calculate the value of q, (ii) Using a scale of 2 cm to represent 1 unit on the x-axis…, draw the graph, (iii) Use your graph to solve …"; or "The diagram shows the graph of y = …" with the curve drawn.
A figure in the question must never show what the learner is asked to draw, shade, complete or find; that version belongs in the Marking Key. Never colour anything; never write "In the diagram" unless there is a figure right there.`;

const SUBJECT: Record<Family, string> = {
  history: `HOW HISTORY / CIVIC EDUCATION PAPERS USE FIGURES: a "stimulus" question opens with a map, picture, chart, timeline or family tree ("Study the map below and answer the questions that follow."), then 6 to 9 short parts that go from reading the figure (identify the kingdom marked X; name the route marked W) to explaining causes, effects and significance. Typical figures: a sketch map with lettered kingdoms, mission stations, battle sites or migration routes; a succession tree of rulers; a timeline with blanks; a chart of a structure of government (Mermaid diagram with lettered blanks); a bar chart of election or population figures.`,
  geography: `HOW GEOGRAPHY PAPERS USE FIGURES (from ECZ papers): a sketch map with letters on towns, rivers, lakes, provinces, railways, roads or agro-ecological regions to identify, then their characteristics, uses and problems (map; use "auto" or "Zambia" for Zambian maps, Africa/World maps with lettered countries, deserts, ocean currents' seas); textbook diagrams of landforms and processes with lettered parts (scene: the Earth's tilt and the Sun's rays, folds, rift valleys, intrusive volcanic features, soil creep, drainage patterns, waterfalls, meanders, rainfall types, settlement patterns, irrigation methods, HEP stations, mining); climate graphs (climate, never a chart); population pyramids (population, never a chart); bar or line charts of production or population data to read, compare and calculate from (chart). Never use a Mermaid "diagram" for anything that has a shape in real life.`,
  maths: `HOW MATHEMATICS PAPERS USE FIGURES: graphs of functions to read values, roots, turning points, intersections and gradients from, regions defined by inequalities (graph "inequalities") and areas under curves (graph "shade"), travel graphs from straight-line pieces, statistical charts and histograms, and the exact geometry figures below. Every number a learner must read from a graph must be readable from the drawing (choose axis ranges and steps so it is). Write all maths with TeX as described.`,
  biology: `HOW BIOLOGY / AGRICULTURAL SCIENCE PAPERS USE FIGURES: a labelled textbook diagram (scene) of a cell, tissue, organ, plant structure or experiment set-up with lettered (Paper 2) or numbered (Paper 1) parts; graphs from experiments (curve); food webs (food-web); tables of results and nutrients (markdown tables); family trees (tree) and genetic diagrams (genetic-cross, in the marking key). Never use a Mermaid "diagram" for anything that has a shape.`,
  science: `HOW SCIENCE PAPERS USE FIGURES: graphs from experiments (heating curves, velocity–time, rate of reaction: graph with straight pieces or a smooth function), bar charts of results, structural formulae of organic compounds (molecule) to name or classify, textbook diagrams (scene) for the water, carbon, nitrogen and rock cycles, food chains and ecological pyramids with lettered parts, Mermaid diagrams only for food webs and abstract processes, and apparatus or organ diagrams from the teacher's library (image) with lettered parts. Chemical formulae and equations always with \\ce.`,
  cs: `HOW COMPUTER STUDIES PAPERS USE FIGURES: flowcharts to trace, complete or correct (Mermaid flowchart with lettered blank boxes), network topologies to identify (Mermaid graph), system or data-flow diagrams, tables of data, and code or pseudocode in an ordinary fenced code block (language left empty) for tracing and correcting.`,
  general: `Use a figure where reading or interpreting it is the skill being tested: a chart of data, a diagram of a process, a timeline or a map.`,
};

/**
 * Figures in learner notes: the same drawing types as assessments, used to
 * teach rather than to test (parts named in words, not blanked with letters).
 */
export function notesFigureGuide(subject: string): string {
  const fam = familyOf(subject);
  const extra = fam === "maths" ? `\n\n${MATHS_FIGURES}` : fam === "geography" || fam === "science" || fam === "biology" ? `\n\n${SCENE_FIGURES(fam)}` : "";
  return `${HOW}${extra}

FIGURES IN LEARNER NOTES (these rules come first; the text above is written for test papers, so where it speaks of questions, letters and the Marking Key, apply it only to the Practice Exercise and its answers):
- Use 1 to 4 figures where a picture makes the idea clearer: a labelled structure, a process or cycle, a graph, a chart of data, a map, a timeline, a structural formula. Use none if the content is purely verbal. Never draw with characters.
- Figures in the notes teach: name every part in words (scene "labels" with words, or leave "labels" out for a fully labelled scene); no letters standing for hidden answers and no "blanks".
- Introduce each figure in the sentence before it ("Figure 1 shows the parts of a flowering plant.") and explain it after.
- Never write a caption line such as "Figure 1: …" under a figure: the app prints the number and title itself.`;
}

/** The part of the assessment task about figures. */
export function figureGuide(subject: string, mode: string | undefined, extras: FigureExtras = {}): string {
  const m = (mode ?? "none").toLowerCase();
  if (m === "none" || m === "") {
    const none = "FIGURES IN THE QUESTIONS: none. Do not put any figure in the questions, and never write \"in the diagram\" or \"study the figure\": give every length, angle and coordinate in words. You may still write maths in TeX between $…$.";
    // Mathematics and Physics: what the learner draws is still shown, complete, in the marking key.
    const fam = familyOf(subject);
    if (fam === "maths" || /physic/i.test(subject))
      return `${none}\nFIGURES IN THE MARKING KEY: yes. Every construction, locus, graph, region, transformation or Venn diagram the learner must draw is answered in the Marking Key with a figure of the complete correct answer, written as below.\n\n${HOW}${fam === "maths" ? `\n\n${MATHS_FIGURES}` : ""}`;
    return `FIGURES: do not include any figures or \`\`\`figure blocks in this assessment, and never write "in the diagram" or "study the figure": give every length, angle and coordinate in words. You may still write maths in TeX between $…$.`;
  }
  const amount = m === "many"
    ? "Build most structured questions (and some multiple-choice questions) around a figure: about 4 to 6 figures in the paper."
    : "Include 1 to 3 figures, on the questions where reading a figure is the skill being tested.";
  const lib = extras.library?.length
    ? `\nTHE TEACHER'S DIAGRAM LIBRARY (use each of these pictures in a question, with {"type":"image","id":…}; their letters and what they mark are given):\n${extras.library
        .map((p) => `- id "${p.id}": ${p.title}${p.description ? ` — ${p.description}` : ""}${p.labels.length ? `. Letters: ${p.labels.map((l) => `${l.letter} = ${l.meaning || "?"}`).join(", ")}` : ""}`)
        .join("\n")}`
    : "";
  const places = familyOf(subject) === "history" && extras.historyPlaces?.length
    ? `\nHistorical places the map data knows (use these names exactly for places and kingdoms): ${extras.historyPlaces.join("; ")}.`
    : "";
  const fam = familyOf(subject);
  const maths = fam === "maths" ? `\n\n${MATHS_FIGURES}` : fam === "geography" || fam === "science" || fam === "biology" ? `\n\n${SCENE_FIGURES(fam)}${fam === "biology" ? `\n\n${BIOLOGY_FIGURES}` : ""}` : "";
  return `${HOW}${maths}\n\n${SUBJECT[familyOf(subject)]}\n\n${amount} Every figure must be accurate and fully support the questions on it; never ask about something the figure does not show.${lib}${places}`;
}
