// sceneCatalog.ts — the list of textbook diagrams ("scenes") the app can
// draw for Geography, Biology (ecology) and Integrated Science, and the parts
// of each one that a question can label: with words ("plunge pool") or with a
// letter for "Identify the feature marked X".
//
// Used twice, like figureMath.ts:
//   client/components/ai/figures/sceneCatalog.ts     (the drawers check against it)
//   ai-server/src/services/figures/sceneCatalog.ts   (the server checks specs and
//                                                     writes "X = plunge pool" in the key;
//                                                     the AI is told this list)
// KEEP THE TWO COPIES IDENTICAL.

export interface SceneInfo {
  /** What the diagram shows. */
  title: string;
  /** Kinds of the same diagram ("solar" or "lunar" eclipse…). The first is the default. */
  variants?: string[];
  /** Part key -> what it is (the answer when the part carries a letter). */
  parts: Record<string, string>;
  /** What "items" means for this scene, when it takes a list (pyramid levels…). */
  items?: string;
}

export const SCENES: Record<string, SceneInfo> = {
  // ── The Earth and the solar system ──
  'earth-layers': { title: 'Internal structure of the Earth', parts: { crust: 'crust (lithosphere)', mantle: 'mantle', 'outer-core': 'outer core (liquid)', 'inner-core': 'inner core (solid)' } },
  'solar-system': {
    title: 'The solar system', parts: {
      sun: 'the Sun', mercury: 'Mercury', venus: 'Venus', earth: 'Earth', mars: 'Mars', 'asteroid-belt': 'asteroid belt',
      jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', 'inner-planets': 'inner (terrestrial) planets', 'outer-planets': 'outer (gas giant) planets',
    },
  },
  'earth-sun-rays': {
    title: "The Earth's position and the Sun's rays", variants: ['june', 'december', 'equinox'], parts: {
      'north-pole': 'North Pole', 'south-pole': 'South Pole', 'arctic-circle': 'Arctic Circle (66½°N)', 'tropic-cancer': 'Tropic of Cancer (23½°N)', equator: 'Equator (0°)',
      'tropic-capricorn': 'Tropic of Capricorn (23½°S)', 'antarctic-circle': 'Antarctic Circle (66½°S)', axis: "Earth's axis", 'sun-rays': "Sun's rays", 'overhead-sun': 'where the midday sun is overhead',
    },
  },
  seasons: {
    title: 'Revolution of the Earth and the seasons', parts: {
      sun: 'the Sun', march: '21 March (equinox)', june: '21 June (summer solstice in the north)', september: '23 September (equinox)', december: '22 December (winter solstice in the north)', orbit: 'orbit of the Earth',
    },
  },
  eclipse: { title: 'An eclipse', variants: ['solar', 'lunar'], parts: { sun: 'the Sun', moon: 'the Moon', earth: 'the Earth', umbra: 'umbra (total shadow)', penumbra: 'penumbra (partial shadow)' } },
  'day-night': { title: 'Rotation of the Earth: day and night', parts: { day: 'day (side facing the Sun)', night: 'night', axis: "Earth's axis", rotation: 'rotation from west to east', 'sun-rays': "Sun's rays" } },

  // ── Internal earth movements ──
  fold: { title: 'Folding', variants: ['simple', 'overfold', 'recumbent'], parts: { anticline: 'anticline (upfold)', syncline: 'syncline (downfold)', limb: 'limb', crest: 'crest', trough: 'trough', compression: 'compression (forces pushing together)' } },
  'rift-valley': { title: 'Formation of a rift valley', variants: ['tension', 'compression'], parts: { 'rift-valley': 'rift valley (graben)', fault: 'fault', escarpment: 'escarpment (fault scarp)', block: 'sunken block', tension: 'tension forces pulling apart', compression: 'compression forces pushing together' } },
  'block-mountain': { title: 'Formation of a block mountain (horst)', parts: { 'block-mountain': 'block mountain (horst)', fault: 'fault', escarpment: 'fault scarp', force: 'compression forces' } },
  'volcanic-features': {
    title: 'Intrusive and extrusive volcanic features', parts: {
      batholith: 'batholith', dyke: 'dyke', sill: 'sill', laccolith: 'laccolith', lopolith: 'lopolith', 'volcanic-plug': 'volcanic plug',
      vent: 'vent (pipe)', crater: 'crater', volcano: 'volcanic cone', 'lava-flow': 'lava flow', 'ash-cloud': 'ash and gas cloud',
    },
  },
  volcano: {
    title: 'A composite volcano', parts: {
      crater: 'crater', 'main-vent': 'main vent', 'side-vent': 'side vent', 'parasitic-cone': 'parasitic (secondary) cone',
      'magma-chamber': 'magma chamber', 'lava-layer': 'layer of lava', 'ash-layer': 'layer of ash', 'lava-flow': 'lava flow', 'ash-cloud': 'ash cloud',
    },
  },

  // ── Weathering and mass movement ──
  'soil-creep': { title: 'Soil creep', parts: { 'bent-tree': 'bent tree trunks', 'tilted-post': 'tilted posts / poles', wall: 'bulging wall', terracettes: 'terracettes', 'soil-movement': 'slow downslope movement of soil', 'parent-rock': 'parent rock' } },
  landslide: { title: 'A landslide (rotational slump)', parts: { scar: 'scar (scarp)', 'slip-plane': 'slip plane', 'slumped-mass': 'slumped material', 'original-slope': 'original slope', toe: 'toe' } },

  // ── Rivers ──
  'water-cycle': {
    title: 'The hydrological (water) cycle', parts: {
      sun: 'the Sun', sea: 'sea / ocean', evaporation: 'evaporation', transpiration: 'transpiration', condensation: 'condensation (cloud formation)',
      precipitation: 'precipitation (rain)', 'surface-runoff': 'surface run-off', infiltration: 'infiltration', percolation: 'percolation',
      'groundwater-flow': 'groundwater flow', river: 'river', lake: 'lake',
    },
  },
  'river-profile': { title: 'Long profile of a river', parts: { source: 'source', 'upper-course': 'upper course (youthful stage)', 'middle-course': 'middle course (mature stage)', 'lower-course': 'lower course (old stage)', mouth: 'mouth', 'sea-level': 'sea level (base level)' } },
  waterfall: { title: 'A waterfall', parts: { 'hard-rock': 'hard (resistant) rock', 'soft-rock': 'soft (less resistant) rock', overhang: 'overhang', 'plunge-pool': 'plunge pool', gorge: 'gorge (retreat of the waterfall)', waterfall: 'waterfall' } },
  meander: { title: 'A meander', parts: { 'river-cliff': 'river cliff (erosion on the outer bend)', 'slip-off-slope': 'slip-off slope (deposition on the inner bend)', 'fastest-flow': 'line of fastest flow', 'point-bar': 'point bar (deposits)', 'outer-bend': 'outer bend', 'inner-bend': 'inner bend' } },
  'oxbow-lake': { title: 'Formation of an ox-bow lake', parts: { neck: 'meander neck', 'new-course': 'new straight course', 'oxbow-lake': 'ox-bow lake', deposits: 'deposits sealing off the meander', erosion: 'erosion on the outer bends' } },
  floodplain: { title: 'A flood plain with levees', parts: { levee: 'levee', floodplain: 'flood plain', channel: 'river channel', alluvium: 'alluvium (deposited silt)', bluff: 'bluff (valley side)' } },
  'v-valley': { title: 'A V-shaped valley with interlocking spurs', parts: { 'v-valley': 'V-shaped valley', spur: 'interlocking spur', river: 'river', 'steep-side': 'steep valley side' } },
  delta: { title: 'A delta', variants: ['arcuate', 'birds-foot', 'cuspate'], parts: { 'main-river': 'main river', distributary: 'distributary', delta: 'delta (deposits)', sea: 'sea', lagoon: 'lagoon', sandbar: 'sand bar' } },
  'drainage-pattern': { title: 'A drainage pattern', variants: ['dendritic', 'trellis', 'radial', 'parallel', 'rectangular', 'centripetal'], parts: { 'main-river': 'main river', tributary: 'tributary', confluence: 'confluence', pattern: 'the drainage pattern' } },

  // ── Weather and climate ──
  'rainfall-relief': { title: 'Relief (orographic) rainfall', parts: { sea: 'sea', 'moist-wind': 'warm moist wind from the sea', windward: 'windward side (wet)', leeward: 'leeward side (rain shadow, dry)', cloud: 'cloud (condensation)', rain: 'heavy rain', mountain: 'mountain', 'descending-air': 'descending, warming dry air' } },
  'rainfall-convectional': { title: 'Convectional rainfall', parts: { sun: 'the Sun', 'heated-ground': 'heated ground', 'rising-air': 'warm air rising', condensation: 'condensation level', cloud: 'cumulonimbus cloud', rain: 'heavy rain (often with thunder)' } },
  'rainfall-frontal': { title: 'Frontal (cyclonic) rainfall', parts: { 'warm-air': 'warm (lighter) air', 'cold-air': 'cold (heavier) air', front: 'front', cloud: 'cloud', rain: 'rain' } },

  // ── Biology: cells ──
  'plant-cell': {
    title: 'A plant cell', variants: ['light', 'electron'], parts: {
      'cell-wall': 'cell wall', 'cell-membrane': 'cell membrane', cytoplasm: 'cytoplasm', vacuole: 'vacuole (cell sap)', nucleus: 'nucleus', chloroplast: 'chloroplast',
      mitochondrion: 'mitochondrion', nucleolus: 'nucleolus', 'nuclear-membrane': 'nuclear membrane (envelope)', 'rough-er': 'rough endoplasmic reticulum',
      golgi: 'Golgi body (apparatus)', ribosome: 'ribosomes', plasmodesma: 'plasmodesma',
    },
  },
  'animal-cell': {
    title: 'An animal cell', variants: ['light', 'electron'], parts: {
      'cell-membrane': 'cell membrane', cytoplasm: 'cytoplasm', nucleus: 'nucleus', mitochondrion: 'mitochondrion', vacuole: 'small (temporary) vacuole',
      nucleolus: 'nucleolus', 'nuclear-membrane': 'nuclear membrane (envelope)', 'rough-er': 'rough endoplasmic reticulum', golgi: 'Golgi body (apparatus)',
      centriole: 'centrioles', lysosome: 'lysosome', ribosome: 'ribosomes',
    },
  },
  'bacterial-cell': {
    title: 'A bacterial cell', parts: {
      capsule: 'capsule (slime layer)', 'cell-wall': 'cell wall', 'cell-membrane': 'cell membrane', cytoplasm: 'cytoplasm', dna: 'circular DNA (nucleoid, no nucleus)',
      plasmid: 'plasmid', ribosome: 'ribosomes', flagellum: 'flagellum', pilus: 'pili',
    },
  },
  'specialised-cell': {
    title: 'A specialised cell', variants: ['root-hair', 'palisade', 'guard-cells', 'xylem', 'phloem', 'red-blood-cell', 'white-blood-cell', 'sperm', 'ciliated'], parts: {
      'root-hair': 'root hair (increases surface area for absorption)', 'cell-wall': 'cell wall', 'cell-membrane': 'cell membrane', cytoplasm: 'cytoplasm',
      vacuole: 'vacuole', nucleus: 'nucleus', 'soil-particle': 'soil particle', chloroplast: 'chloroplasts', 'guard-cell': 'guard cell', stoma: 'stoma',
      'thick-inner-wall': 'thick inner cell wall', 'epidermal-cell': 'epidermal cell', lignin: 'lignin thickening', lumen: 'hollow lumen (no cytoplasm)',
      'vessel-wall': 'vessel wall', 'end-wall-remains': 'remains of end wall', 'sieve-tube': 'sieve tube element', 'sieve-plate': 'sieve plate',
      'companion-cell': 'companion cell', haemoglobin: 'cytoplasm full of haemoglobin', 'no-nucleus': 'no nucleus', biconcave: 'biconcave shape',
      'lobed-nucleus': 'lobed nucleus', 'large-nucleus': 'large round nucleus', 'thin-cytoplasm': 'thin layer of cytoplasm', acrosome: 'acrosome (enzymes)',
      head: 'head', 'middle-piece': 'middle piece', mitochondria: 'mitochondria', tail: 'tail (flagellum)', cilia: 'cilia', mitochondrion: 'mitochondrion',
    },
  },
  mitosis: {
    title: 'Mitosis', variants: ['all', 'interphase', 'prophase', 'metaphase', 'anaphase', 'telophase'], parts: {
      'cell-membrane': 'cell membrane', 'nuclear-membrane': 'nuclear membrane', chromatin: 'chromatin', nucleolus: 'nucleolus', centriole: 'centriole',
      chromosome: 'chromosome (two chromatids)', 'spindle-fibre': 'spindle fibre', equator: 'equator', centromere: 'centromere', chromatid: 'chromatid',
    },
  },
  'osmosis-cells': {
    title: 'Osmosis in cells', variants: ['plant', 'animal'], parts: {
      'cell-wall': 'cell wall', 'cell-membrane': 'cell membrane', vacuole: 'vacuole', cytoplasm: 'cytoplasm', space: 'space filled with the outside solution',
    },
  },

  // ── Biology: plants ──
  flower: {
    title: 'Half flower', variants: ['insect', 'wind'], parts: {
      petal: 'petal', sepal: 'sepal', anther: 'anther', filament: 'filament', stigma: 'stigma', style: 'style', ovary: 'ovary', ovule: 'ovule',
      receptacle: 'receptacle', nectary: 'nectary', pedicel: 'flower stalk (pedicel)', bract: 'bract',
    },
  },
  'leaf-section': {
    title: 'Transverse section through a leaf', parts: {
      cuticle: 'waxy cuticle', 'upper-epidermis': 'upper epidermis', palisade: 'palisade mesophyll', 'spongy-mesophyll': 'spongy mesophyll', 'air-space': 'air space',
      'lower-epidermis': 'lower epidermis', xylem: 'xylem', phloem: 'phloem', 'vascular-bundle': 'vascular bundle (vein)', stoma: 'stoma', 'guard-cell': 'guard cell', chloroplast: 'chloroplasts',
    },
  },
  'root-section': {
    title: 'Transverse section of a root', variants: ['dicot', 'monocot'], parts: {
      epidermis: 'epidermis (piliferous layer)', 'root-hair': 'root hair', cortex: 'cortex', endodermis: 'endodermis', pericycle: 'pericycle', xylem: 'xylem', phloem: 'phloem', pith: 'pith',
    },
  },
  'stem-section': {
    title: 'Transverse section of a stem', variants: ['dicot', 'monocot'], parts: {
      epidermis: 'epidermis', cortex: 'cortex', 'vascular-bundle': 'vascular bundle', xylem: 'xylem', phloem: 'phloem', cambium: 'cambium', pith: 'pith', 'ground-tissue': 'ground tissue',
    },
  },
  seed: {
    title: 'Structure of a seed', variants: ['bean', 'maize'], parts: {
      testa: 'testa (seed coat)', cotyledon: 'cotyledon', plumule: 'plumule', radicle: 'radicle', hilum: 'hilum', micropyle: 'micropyle',
      endosperm: 'endosperm', 'fruit-wall': 'fruit wall (pericarp) fused with testa',
    },
  },
  germination: {
    title: 'Stages of germination', variants: ['epigeal', 'hypogeal'], parts: {
      'soil-level': 'soil level', cotyledon: 'cotyledon', hypocotyl: 'hypocotyl', epicotyl: 'epicotyl', plumule: 'plumule', radicle: 'radicle',
      'foliage-leaves': 'first foliage leaves', 'root-hairs': 'lateral roots', testa: 'testa',
    },
  },
  'root-tip': {
    title: 'Longitudinal section of a root tip', parts: {
      'root-cap': 'root cap', 'cell-division': 'region of cell division', elongation: 'region of cell elongation', differentiation: 'region of differentiation (maturation)',
      'root-hairs': 'root hairs', 'xylem-forming': 'developing xylem',
    },
  },

  // ── Biology: the human body ──
  heart: {
    title: 'Longitudinal section through the human heart', parts: {
      'right-atrium': 'right atrium', 'left-atrium': 'left atrium', 'right-ventricle': 'right ventricle', 'left-ventricle': 'left ventricle',
      septum: 'septum', 'tricuspid-valve': 'tricuspid valve', 'bicuspid-valve': 'bicuspid (mitral) valve', 'semilunar-valve': 'semilunar valve',
      tendons: 'tendons (chordae tendineae)', aorta: 'aorta', 'pulmonary-artery': 'pulmonary artery', 'pulmonary-vein': 'pulmonary vein',
      'vena-cava': 'vena cava (superior)', 'inferior-vena-cava': 'inferior vena cava', 'muscle-wall': 'thick muscular wall of the left ventricle',
    },
  },
  circulation: {
    title: 'Double circulation in a mammal', parts: {
      'pulmonary-artery': 'pulmonary artery', 'pulmonary-vein': 'pulmonary vein', aorta: 'aorta', 'vena-cava': 'vena cava', 'hepatic-artery': 'hepatic artery',
      'hepatic-portal-vein': 'hepatic portal vein', 'hepatic-vein': 'hepatic vein', 'renal-artery': 'renal artery', 'renal-vein': 'renal vein',
    },
  },
  'digestive-system': {
    title: 'The human digestive system', parts: {
      mouth: 'mouth', 'salivary-gland': 'salivary gland', oesophagus: 'oesophagus (gullet)', stomach: 'stomach', liver: 'liver', 'gall-bladder': 'gall bladder',
      'bile-duct': 'bile duct', duodenum: 'duodenum', pancreas: 'pancreas', 'small-intestine': 'small intestine (ileum)', 'large-intestine': 'large intestine (colon)',
      appendix: 'appendix', rectum: 'rectum', anus: 'anus',
    },
  },
  tooth: {
    title: 'Longitudinal section of a tooth', variants: ['molar', 'incisor'], parts: {
      enamel: 'enamel', dentine: 'dentine', 'pulp-cavity': 'pulp cavity', cement: 'cement', gum: 'gum', 'jaw-bone': 'jaw bone',
      'nerves-blood-vessels': 'nerves and blood vessels', crown: 'crown', root: 'root',
    },
  },
  'respiratory-system': {
    title: 'The human respiratory system', parts: {
      larynx: 'larynx', trachea: 'trachea (windpipe)', 'cartilage-ring': 'ring of cartilage', bronchus: 'bronchus', bronchiole: 'bronchiole', lung: 'lung',
      'pleural-membrane': 'pleural membranes', rib: 'rib', 'intercostal-muscle': 'intercostal muscles', diaphragm: 'diaphragm',
    },
  },
  alveolus: {
    title: 'Gaseous exchange in an alveolus', parts: {
      alveolus: 'alveolus (air sac)', 'alveolar-wall': 'thin alveolar wall', 'moisture-film': 'film of moisture', capillary: 'blood capillary',
      'red-blood-cell': 'red blood cell', oxygen: 'oxygen diffusing into the blood', 'carbon-dioxide': 'carbon dioxide diffusing into the alveolus',
    },
  },
  kidney: {
    title: 'The kidney', variants: ['section', 'urinary-system'], parts: {
      cortex: 'cortex', medulla: 'medulla', pyramid: 'pyramid', pelvis: 'pelvis', 'renal-artery': 'renal artery', 'renal-vein': 'renal vein', ureter: 'ureter',
      capsule: 'capsule', kidney: 'kidney', bladder: 'urinary bladder', urethra: 'urethra', aorta: 'aorta', 'vena-cava': 'vena cava',
    },
  },
  nephron: {
    title: 'A nephron (kidney tubule)', parts: {
      'afferent-arteriole': 'afferent arteriole', glomerulus: 'glomerulus', 'bowmans-capsule': "Bowman's capsule", 'efferent-arteriole': 'efferent arteriole',
      'proximal-tubule': 'proximal convoluted tubule', 'loop-of-henle': 'loop of Henle', 'distal-tubule': 'distal convoluted tubule',
      'collecting-duct': 'collecting duct', capillary: 'blood capillaries',
    },
  },
  eye: {
    title: 'Horizontal section through the human eye', parts: {
      conjunctiva: 'conjunctiva', cornea: 'cornea', 'aqueous-humour': 'aqueous humour', iris: 'iris', pupil: 'pupil', 'ciliary-muscle': 'ciliary muscle (body)',
      'suspensory-ligament': 'suspensory ligaments', lens: 'lens', 'vitreous-humour': 'vitreous humour', retina: 'retina', choroid: 'choroid', sclera: 'sclera',
      fovea: 'fovea (yellow spot)', 'blind-spot': 'blind spot', 'optic-nerve': 'optic nerve',
    },
  },
  ear: {
    title: 'The human ear', parts: {
      pinna: 'pinna', 'auditory-canal': 'auditory canal', eardrum: 'eardrum (tympanic membrane)', malleus: 'malleus', incus: 'incus', stapes: 'stapes',
      'oval-window': 'oval window', 'round-window': 'round window', 'semicircular-canals': 'semicircular canals', cochlea: 'cochlea',
      'auditory-nerve': 'auditory nerve', 'eustachian-tube': 'Eustachian tube',
    },
  },
  brain: {
    title: 'Median section through the human brain', parts: {
      cerebrum: 'cerebrum (cerebral hemisphere)', 'corpus-callosum': 'corpus callosum', thalamus: 'thalamus', hypothalamus: 'hypothalamus',
      'pituitary-gland': 'pituitary gland', cerebellum: 'cerebellum', pons: 'pons', 'medulla-oblongata': 'medulla oblongata', 'spinal-cord': 'spinal cord',
    },
  },
  skin: {
    title: 'Section through human skin', parts: {
      hair: 'hair', 'cornified-layer': 'cornified (dead) layer', 'granular-layer': 'granular layer', epidermis: 'epidermis', 'nerve-ending': 'nerve ending (sense receptor)',
      'hair-follicle': 'hair follicle', dermis: 'dermis', 'fat-layer': 'subcutaneous fat', 'sebaceous-gland': 'sebaceous gland', 'erector-muscle': 'erector (hair) muscle',
      'blood-capillary': 'blood capillary', 'sweat-pore': 'sweat pore', 'sweat-duct': 'sweat duct', 'sweat-gland': 'sweat gland',
    },
  },
  'endocrine-glands': {
    title: 'Positions of the endocrine glands', variants: ['female', 'male'], parts: {
      'pituitary-gland': 'pituitary gland', 'thyroid-gland': 'thyroid gland', 'adrenal-gland': 'adrenal gland', pancreas: 'pancreas', ovary: 'ovary', testis: 'testis',
    },
  },
  'female-reproductive': {
    title: 'The female reproductive system', parts: {
      ovary: 'ovary', funnel: 'funnel of the oviduct', oviduct: 'oviduct (fallopian tube)', uterus: 'uterus', endometrium: 'endometrium (uterus lining)',
      'uterus-wall': 'muscular wall of the uterus', cervix: 'cervix', vagina: 'vagina',
    },
  },
  'male-reproductive': {
    title: 'The male reproductive system', parts: {
      ureter: 'ureter', bladder: 'bladder', 'seminal-vesicle': 'seminal vesicle', prostate: 'prostate gland', 'sperm-duct': 'sperm duct',
      epididymis: 'epididymis', testis: 'testis', scrotum: 'scrotum', urethra: 'urethra', penis: 'penis',
    },
  },
  foetus: {
    title: 'A foetus in the uterus', parts: {
      placenta: 'placenta', 'umbilical-cord': 'umbilical cord', amnion: 'amnion', 'amniotic-fluid': 'amniotic fluid', 'uterus-wall': 'uterus wall',
      foetus: 'foetus', cervix: 'cervix', vagina: 'vagina',
    },
  },
  vertebra: {
    title: 'A vertebra (front view)', variants: ['cervical', 'thoracic', 'lumbar'], parts: {
      centrum: 'centrum', 'neural-canal': 'neural canal (spinal cord passes)', 'neural-spine': 'neural spine', 'transverse-process': 'transverse process',
      facet: 'articulating facet', 'vertebrarterial-canal': 'vertebrarterial canal', 'rib-facet': 'facet for the rib',
    },
  },
  'arm-muscles': {
    title: 'Bones and muscles of the arm', parts: {
      scapula: 'scapula', humerus: 'humerus', radius: 'radius', ulna: 'ulna', biceps: 'biceps', triceps: 'triceps', tendon: 'tendon', 'elbow-joint': 'elbow (hinge) joint',
    },
  },
  'synovial-joint': {
    title: 'A synovial joint', parts: {
      bone: 'bone', cartilage: 'cartilage', ligament: 'ligament', capsule: 'capsule', 'synovial-membrane': 'synovial membrane', 'synovial-fluid': 'synovial fluid',
    },
  },
  'reflex-arc': {
    title: 'A reflex arc', parts: {
      receptor: 'receptor', 'sensory-neurone': 'sensory neurone', 'relay-neurone': 'relay neurone', 'motor-neurone': 'motor neurone', effector: 'effector (muscle)',
      'dorsal-root-ganglion': 'dorsal root ganglion', 'grey-matter': 'grey matter', 'white-matter': 'white matter', 'central-canal': 'central canal', 'ventral-root': 'ventral root',
    },
  },
  neurone: {
    title: 'A neurone', variants: ['motor', 'sensory'], parts: {
      dendrite: 'dendrites', 'cell-body': 'cell body', nucleus: 'nucleus', axon: 'axon', 'myelin-sheath': 'myelin sheath', 'node-of-ranvier': 'node of Ranvier',
      'motor-end-plate': 'motor end plate', muscle: 'muscle fibre', receptor: 'receptor', dendron: 'dendron', 'axon-terminals': 'axon terminals',
    },
  },

  // ── Biology: experiments ──
  osmometer: {
    title: 'An experiment on osmosis', variants: ['thistle-funnel', 'potato-cylinders'], parts: {
      'capillary-tube': 'capillary (glass) tube', 'sugar-solution': 'sugar solution', membrane: 'partially permeable membrane (Visking tubing)', water: 'distilled water',
      beaker: 'beaker', clamp: 'clamp', 'distilled-water': 'distilled water', 'potato-cylinder': 'potato cylinder',
    },
  },
  potometer: {
    title: 'A potometer (rate of water uptake / transpiration)', parts: {
      'leafy-shoot': 'leafy shoot', 'rubber-bung': 'rubber bung (airtight)', reservoir: 'water reservoir', tap: 'tap (to reset the bubble)',
      'air-bubble': 'air bubble', 'capillary-tube': 'capillary tube', scale: 'scale', beaker: 'beaker of water',
    },
  },
  'respiration-apparatus': {
    title: 'Carbon dioxide is produced in respiration', variants: ['animal', 'seeds'], parts: {
      'sodium-hydroxide': 'sodium hydroxide solution (absorbs carbon dioxide from the air)', 'limewater-check': 'limewater (shows the air entering has no carbon dioxide)',
      organism: 'living organism (respiring)', 'bell-jar': 'bell jar', limewater: 'limewater (turns milky)',
    },
  },
  'germination-flasks': {
    title: 'Oxygen is needed for germination', parts: {
      seeds: 'soaked seeds', 'cotton-wool': 'cotton wool', 'alkaline-pyrogallol': 'alkaline pyrogallol (absorbs oxygen)', water: 'water (control)', 'rubber-bung': 'rubber bung',
    },
  },
  'choice-chamber': {
    title: 'A choice chamber', variants: ['light', 'moisture'], parts: {
      'dark-side': 'dark side (covered)', 'light-side': 'light side', 'humid-side': 'humid side (water below)', 'dry-side': 'dry side (drying agent below)',
      gauze: 'gauze platform', organism: 'woodlice (small animals)',
    },
  },
  'soil-drainage': {
    title: 'Drainage (water retention) of soils', items: 'the names of the three soils, e.g. ["X","Y","Z"] or ["clay","loam","sand"]; the most water collects under the last one', parts: {
      funnel: 'funnel', soil: 'soil sample', 'cotton-wool': 'cotton wool (filter)', 'measuring-cylinder': 'measuring cylinder', water: 'water that drained through',
    },
  },
  'menstrual-cycle': {
    title: 'The menstrual cycle (28 days)', parts: {
      menstruation: 'menstruation (days 1–5)', 'fertile-period': 'fertile period', ovulation: 'ovulation (about day 14)', 'day-1': 'day 1 of the cycle',
    },
  },

  microscope: {
    title: 'The compound light microscope', variants: ['mirror', 'lamp'], parts: {
      eyepiece: 'eyepiece (ocular lens)', 'body-tube': 'body tube', nosepiece: 'revolving nosepiece', objective: 'objective lens', clip: 'stage clip',
      slide: 'slide (with the specimen)', stage: 'stage', condenser: 'condenser (focuses light on the specimen)', diaphragm: 'iris diaphragm (controls the amount of light)',
      mirror: 'mirror (reflects light up through the specimen)', lamp: 'lamp (light source)', base: 'base', arm: 'arm',
      'coarse-focus': 'coarse focus (adjustment) knob', 'fine-focus': 'fine focus (adjustment) knob',
    },
  },
  photosynthesis: {
    title: 'Experiments on photosynthesis', variants: ['pondweed', 'variegated-leaf', 'foil-leaf'], parts: {
      lamp: 'lamp (light source)', beaker: 'beaker', water: 'water with sodium hydrogencarbonate (supplies carbon dioxide)', funnel: 'inverted funnel',
      'test-tube': 'test tube (full of water at the start)', oxygen: 'oxygen collected', bubbles: 'bubbles of oxygen', pondweed: 'pondweed (Elodea)',
      'green-part': 'green part (has chlorophyll)', 'white-part': 'white part (no chlorophyll)', 'blue-black': 'blue-black (starch present)', brown: 'brown / orange (no starch)',
      foil: 'aluminium foil (keeps out light)', 'uncovered-part': 'uncovered part (received light)',
    },
  },
  'food-test': {
    title: "A food test in a water bath (Benedict's test)", parts: {
      'test-tube': 'test tube', 'food-solution': "food solution with Benedict's solution", 'water-bath': 'boiling water bath', thermometer: 'thermometer',
      beaker: 'beaker', tripod: 'tripod stand', gauze: 'wire gauze', 'bunsen-burner': 'Bunsen burner',
    },
  },

  villus: {
    title: 'A villus (longitudinal section)', parts: {
      microvilli: 'microvilli (increase the surface area)', epithelium: 'epithelium (one cell thick)', 'goblet-cell': 'goblet cell (makes mucus)',
      capillary: 'blood capillary (absorbs glucose and amino acids)', lacteal: 'lacteal (absorbs fatty acids and glycerol)', arteriole: 'arteriole', venule: 'venule (to the hepatic portal vein)',
    },
  },
  'blood-vessels': {
    title: 'Blood vessels', variants: ['transverse-sections', 'vein-valves'], parts: {
      'outer-coat': 'outer coat (fibrous)', 'thick-wall': 'thick wall of muscle and elastic fibres', 'narrow-lumen': 'narrow lumen', endothelium: 'endothelium (lining)',
      'thin-wall': 'thin wall (little muscle)', 'wide-lumen': 'wide lumen', 'one-cell-wall': 'wall one cell thick', 'red-blood-cell': 'red blood cell',
      valve: 'valve (prevents backflow)', wall: 'wall of the vein', lumen: 'lumen',
    },
  },
  'tissue-fluid': {
    title: 'Formation of tissue fluid and lymph', parts: {
      'body-cell': 'body cell', 'tissue-fluid': 'tissue fluid', capillary: 'blood capillary', 'red-blood-cell': 'red blood cell (too large to leave)',
      'fluid-out': 'fluid forced out at the arterial end (high pressure)', 'fluid-in': 'fluid returns at the venous end', 'lymph-vessel': 'lymph vessel (blind-ended)', lymph: 'lymph',
    },
  },
  insect: {
    title: 'An insect: the housefly', parts: {
      head: 'head', thorax: 'thorax', abdomen: 'abdomen', 'compound-eye': 'compound eye', antenna: 'antenna', proboscis: 'proboscis (sucking/sponging mouthparts)',
      wing: 'wing (one pair)', haltere: 'haltere (balancer)', leg: 'jointed leg (three pairs, on the thorax)', spiracle: 'spiracle (breathing pore)',
    },
  },

  // ── Ecology (Biology, Geography) ──
  'rock-cycle': {
    title: 'The rock cycle', parts: {
      igneous: 'igneous rock', sedimentary: 'sedimentary rock', metamorphic: 'metamorphic rock', magma: 'magma',
      weathering: 'weathering and erosion', deposition: 'deposition, compaction and cementation', 'heat-pressure': 'heat and pressure', melting: 'melting', cooling: 'cooling and solidification',
    },
  },
  'carbon-cycle': {
    title: 'The carbon cycle', parts: {
      atmosphere: 'carbon dioxide in the air', photosynthesis: 'photosynthesis', 'plant-respiration': 'respiration (plants)', 'animal-respiration': 'respiration (animals)', feeding: 'feeding (carbon passes to animals)',
      decomposition: 'decomposition by decomposers', combustion: 'combustion (burning fuels)', 'fossil-fuels': 'fossil fuels', death: 'death and waste',
    },
  },
  'nitrogen-cycle': {
    title: 'The nitrogen cycle', parts: {
      atmosphere: 'nitrogen gas in the air', lightning: 'lightning (fixation)', 'nitrogen-fixing': 'nitrogen-fixing bacteria (root nodules of legumes)', nitrification: 'nitrifying bacteria (nitrification)',
      nitrates: 'nitrates in the soil', absorption: 'absorption by plant roots', feeding: 'feeding (animals eat plants)', decomposition: 'decomposers (ammonification)', denitrification: 'denitrifying bacteria', ammonium: 'ammonium compounds', death: 'death and excretion',
    },
  },
  'ecological-pyramid': {
    title: 'An ecological pyramid', variants: ['numbers', 'biomass', 'energy'], items: 'the organisms from the producer at the bottom to the top consumer, e.g. ["Grass","Grasshopper","Frog","Snake"]',
    parts: { producer: 'producers (first trophic level)', 'primary-consumer': 'primary consumers (herbivores)', 'secondary-consumer': 'secondary consumers', 'tertiary-consumer': 'tertiary consumers' },
  },
  'food-chain': {
    title: 'A food chain', items: 'the organisms in order, e.g. ["Grass","Grasshopper","Frog","Snake","Eagle"]',
    parts: { producer: 'producer', 'primary-consumer': 'primary consumer', 'secondary-consumer': 'secondary consumer', 'tertiary-consumer': 'tertiary consumer', 'energy-flow': 'direction of energy flow' },
  },

  // ── Population and settlement ──
  'settlement-patterns': {
    title: 'Settlement patterns', variants: ['all', 'nucleated', 'linear', 'dispersed', 'isolated', 'cruciform'], parts: {
      nucleated: 'nucleated (clustered) settlement', linear: 'linear (ribbon) settlement', dispersed: 'dispersed (scattered) settlement', isolated: 'isolated settlement',
      cruciform: 'cruciform (cross-shaped) settlement', road: 'road', river: 'river', centre: 'central feature (market, school, crossroads)',
    },
  },
  'settlement-sites': {
    title: 'Sites of settlements', parts: {
      'wet-point': 'wet-point site (by a spring or river)', 'dry-point': 'dry-point site (raised ground above a flood plain)', 'bridging-point': 'bridging point',
      'gap-town': 'gap town (in a gap between hills)', confluence: 'confluence town / route centre', defensive: 'defensive site (in a meander loop or on a hill)', marsh: 'marsh / flood plain', hills: 'hills',
    },
  },
  'urban-model': {
    title: 'Models of urban land use', variants: ['concentric', 'sector', 'multiple-nuclei'], parts: {
      cbd: 'Central Business District (CBD)', industry: 'wholesale and light industry', transition: 'zone of transition', 'low-class': 'low-class (high-density) housing',
      'middle-class': 'medium-class housing', 'high-class': 'high-class (low-density) housing', commuter: 'commuter zone', 'heavy-industry': 'heavy industry', 'outlying-business': 'outlying business district', suburb: 'residential suburb',
    },
  },

  // ── Economic activities ──
  irrigation: {
    title: 'Irrigation', variants: ['furrow', 'sprinkler', 'drip', 'centre-pivot', 'basin', 'canal-layout', 'canal-section'], parts: {
      source: 'water source (river or dam)', pump: 'pump / pumping station', 'main-canal': 'main canal', 'field-canal': 'field canal (ditch)', furrow: 'furrow', ridge: 'ridge with crops',
      crops: 'crops', sprinkler: 'sprinkler head', pipe: 'pipe', emitter: 'dripper (emitter)', 'pivot-arm': 'rotating pivot arm', basin: 'basin', bund: 'bund (earth bank)', drain: 'drainage channel',
      siphon: 'siphon', 'water-level': 'water level', freeboard: 'freeboard', bank: 'canal bank',
    },
  },
  hep: {
    title: 'A hydro-electric power station', variants: ['dam', 'waterfall'], parts: {
      reservoir: 'reservoir (lake behind the dam)', dam: 'dam wall', intake: 'intake', penstock: 'penstock', 'power-station': 'power station', turbine: 'turbine',
      generator: 'generator', tailrace: 'tailrace (outlet)', river: 'river', 'power-lines': 'transmission lines', head: 'head of water',
    },
  },
  mining: {
    title: 'Methods of mining', variants: ['open-cast', 'underground'], parts: {
      overburden: 'overburden (waste rock and soil)', 'ore-body': 'ore body', benches: 'benches (terraces)', 'waste-dump': 'waste dump', shaft: 'vertical shaft',
      headframe: 'headframe (winding gear)', level: 'level (gallery)', adit: 'adit (horizontal entrance)', truck: 'haul truck',
    },
  },
};

/** All scene names, for prompts and checks. */
export const SCENE_NAMES = Object.keys(SCENES);
