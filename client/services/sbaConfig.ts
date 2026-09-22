// @/services/sbaConfig.ts
// Seeded config for all ECSEOL subjects with SBA
// Source: ECZ Assessment Schemes 2026 (Appendix p.313) + Kalabo CPD (pages 6–33)

import type { SbaConfig, SbaForm, SbaCategory } from '@/types/sba';

// ==================== SEED DATA ====================

type SeedInput = {
  subjectCode: string;
  subjectName: string;
  aliases: string[];
  category: SbaCategory;
  sbaWeightPercent: 30 | 40 | 50;
  sbaForms: SbaForm[];
  tasksPerForm: { form1: number | null; form2: number | null; form3: number | null };
  marksPerForm: { form1: number | null; form2: number | null; form3: number | null };
  hasProject?: boolean;
  projectForm?: 'form2' | 'form3';
  projectMarks?: number;
  finalExamDuration: string;
  notes?: string;
};

const SEED_INPUTS: SeedInput[] = [
  // ==================== LANGUAGES & LITERATURE ====================
  {
    subjectCode: '1021',
    subjectName: 'English Language',
    aliases: ['English', 'Eng', 'Eng Lang'],
    category: 'languages',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 6, form2: 6, form3: 6 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
    notes: 'SBA total 18 tasks across Forms 1–3.',
  },
  {
    subjectCode: '1025',
    subjectName: 'Literature in English',
    aliases: ['Lit in Eng', 'Literature'],
    category: 'languages',
    sbaWeightPercent: 30,
    sbaForms: ['form2', 'form3'],
    tasksPerForm: { form1: null, form2: 8, form3: 7 },
    marksPerForm: { form1: null, form2: 100, form3: 100 },
    finalExamDuration: '2h 45min',
    notes: 'SBA begins in Form 2 (8 tasks), continues in Form 3 (7 tasks).',
  },
  {
    subjectCode: '1211',
    subjectName: 'Zambian Language - Lunda',
    aliases: ['Lunda'],
    category: 'languages',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 5, form2: 5, form3: 5 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
  },
  {
    subjectCode: '1212',
    subjectName: 'Zambian Language - Luvale',
    aliases: ['Luvale'],
    category: 'languages',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 5, form2: 5, form3: 5 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
  },
  {
    subjectCode: '1213',
    subjectName: 'Zambian Language - Kiikaonde',
    aliases: ['Kiikaonde', 'Kaonde'],
    category: 'languages',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 5, form2: 5, form3: 5 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
  },
  {
    subjectCode: '1214',
    subjectName: 'Zambian Language - Icibemba',
    aliases: ['Icibemba', 'Bemba'],
    category: 'languages',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 5, form2: 5, form3: 5 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
  },
  {
    subjectCode: '1215',
    subjectName: 'Zambian Language - Chitonga',
    aliases: ['Chitonga', 'Tonga'],
    category: 'languages',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 5, form2: 5, form3: 5 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
  },
  {
    subjectCode: '1216',
    subjectName: 'Zambian Language - Cinyanja',
    aliases: ['Cinyanja', 'Nyanja'],
    category: 'languages',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 5, form2: 5, form3: 5 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
  },
  {
    subjectCode: '1217',
    subjectName: 'Zambian Language - Silozi',
    aliases: ['Silozi', 'Lozi'],
    category: 'languages',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 5, form2: 5, form3: 5 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
  },
  {
    subjectCode: '1321',
    subjectName: 'Literature in Zambian Languages - Lunda',
    aliases: ['Lit Lunda'],
    category: 'languages',
    sbaWeightPercent: 40,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 6, form2: 6, form3: 6 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
    notes: 'Higher weighting 40% SBA / 60% Exam.',
  },
  {
    subjectCode: '1327',
    subjectName: 'Literature in Zambian Languages - Silozi',
    aliases: ['Lit Silozi'],
    category: 'languages',
    sbaWeightPercent: 40,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 6, form2: 6, form3: 6 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
    notes: 'Higher weighting 40% SBA / 60% Exam.',
  },
  {
    subjectCode: '1120',
    subjectName: 'French Language',
    aliases: ['French'],
    category: 'languages',
    sbaWeightPercent: 40,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 5, form2: 5, form3: 5 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
  },
  {
    subjectCode: '1125',
    subjectName: 'Chinese Language',
    aliases: ['Chinese', 'Mandarin'],
    category: 'languages',
    sbaWeightPercent: 40,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 5, form2: 5, form3: 5 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
  },

  // ==================== SOCIAL SCIENCES ====================
  {
    subjectCode: '3011',
    subjectName: 'Civic Education',
    aliases: ['Civic', 'Civics'],
    category: 'social',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 5, form2: 5, form3: 5 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
  },
  {
    subjectCode: '3012',
    subjectName: 'Religious Education',
    aliases: ['RE', 'R.E.', 'Rel Ed'],
    category: 'social',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 5, form2: 5, form3: 5 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
    notes: 'CPD shows 15 tasks total at 300 marks — Form 1 row omitted in slide. Seeded as F1/F2/F3 = 5/5/5.',
  },
  {
    subjectCode: '3013',
    subjectName: 'History',
    aliases: ['Hist'],
    category: 'social',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 5, form2: 5, form3: 5 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
    notes: 'CPD task-count typo. Marks 100/F1–F3 = 300. Seeded 5 tasks per form.',
  },
  {
    subjectCode: '3014',
    subjectName: 'Geography',
    aliases: ['Geog'],
    category: 'social',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 5, form2: 5, form3: 5 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h',
  },

  // ==================== MATHEMATICS & NATURAL SCIENCES ====================
  {
    subjectCode: '2021',
    subjectName: 'Mathematics I',
    aliases: ['Maths I', 'Math I'],
    category: 'maths-sciences',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 6, form2: 6, form3: 6 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
  },
  {
    subjectCode: '2025',
    subjectName: 'Mathematics II',
    aliases: ['Maths II', 'Math II'],
    category: 'maths-sciences',
    sbaWeightPercent: 30,
    sbaForms: ['form2', 'form3'],
    tasksPerForm: { form1: null, form2: 6, form3: 6 },
    marksPerForm: { form1: null, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
    notes: 'SBA begins in Form 2.',
  },
  {
    subjectCode: '4018',
    subjectName: 'Agricultural Science',
    aliases: ['Agric', 'Agri Sci'],
    category: 'maths-sciences',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 6, form2: 6, form3: 6 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    hasProject: true,
    projectForm: 'form3',
    projectMarks: 20,
    finalExamDuration: '2h',
    notes: 'Form 2 non-comparative Field Project + Form 3 Comparative Research (20 marks each, inside form totals).',
  },
  {
    subjectCode: '4016',
    subjectName: 'Physics',
    aliases: ['Phys'],
    category: 'maths-sciences',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 6, form2: 6, form3: 3 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    hasProject: true,
    projectForm: 'form3',
    projectMarks: 50,
    finalExamDuration: '2h 30min',
    notes: 'Form 3 = 3 tests + Research Project (50 marks). Total 15 tasks across F1–F3.',
  },
  {
    subjectCode: '4014',
    subjectName: 'Chemistry',
    aliases: ['Chem'],
    category: 'maths-sciences',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 6, form2: 6, form3: 3 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    hasProject: true,
    projectForm: 'form3',
    projectMarks: 50,
    finalExamDuration: '2h 30min',
    notes: 'Same SBA architecture as Physics. Form 3 = 3 tests + Research Project.',
  },
  {
    subjectCode: '4012',
    subjectName: 'Biology',
    aliases: ['Bio'],
    category: 'maths-sciences',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 5, form2: 5, form3: 6 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    hasProject: true,
    projectForm: 'form3',
    projectMarks: 50,
    finalExamDuration: '1h 30min',
    notes: 'Compulsory Research Project in Form 3 Terms 1–2 (50 marks inside form total).',
  },

  // ==================== CREATIVE, TECHNICAL & PRACTICAL ====================
  {
    subjectCode: '5012',
    subjectName: 'Art and Design',
    aliases: ['Art', 'Art & Design'],
    category: 'creative',
    sbaWeightPercent: 50,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: null, form2: null, form3: null },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    hasProject: true,
    projectForm: 'form3',
    projectMarks: 50,
    finalExamDuration: '2h 45min',
    notes: 'Continuous assessment (19 tasks across F1–F3) + Coursework Project (50). Form marks entered as aggregates. Equal 50:50 weighting.',
  },
  {
    subjectCode: '5014',
    subjectName: 'Musical Arts',
    aliases: ['Music', 'Musical'],
    category: 'creative',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 10, form2: 10, form3: 10 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '1h 30min',
    notes: '30 tasks total (10 per form). Composition Project embedded within each form total.',
  },
  {
    subjectCode: '8015',
    subjectName: 'Design and Technology',
    aliases: ['D&T', 'DT', 'Design Tech'],
    category: 'creative',
    sbaWeightPercent: 50,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 10, form2: 10, form3: 13 },
    marksPerForm: { form1: 45, form2: 45, form3: 45 },
    hasProject: true,
    projectForm: 'form3',
    projectMarks: 110,
    finalExamDuration: '2h 45min',
    notes: 'CPD header says 300 SBA; arithmetic sum is 245 (45+45+45+110). Seeded at 245. Admin may override. Equal 50:50 weighting.',
  },
  {
    subjectCode: '6012',
    subjectName: 'Fashion and Fabrics',
    aliases: ['Fashion', 'F&F'],
    category: 'creative',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 7, form2: 7, form3: 7 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
  },
  {
    subjectCode: '6014',
    subjectName: 'Food and Nutrition',
    aliases: ['Food', 'Nutrition', 'F&N'],
    category: 'creative',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 7, form2: 7, form3: 7 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
  },
  {
    subjectCode: '9010',
    subjectName: 'Physical Education and Sport',
    aliases: ['PE', 'PE & Sport', 'Physical Ed'],
    category: 'creative',
    sbaWeightPercent: 40,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 7, form2: 7, form3: 7 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
    notes: 'Higher weighting 40% SBA / 60% Exam.',
  },

  // ==================== COMPUTING ====================
  {
    subjectCode: '8010',
    subjectName: 'Computer Science',
    aliases: ['Comp Sci', 'CS'],
    category: 'computing',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 9, form2: 9, form3: 7 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
  },
  {
    subjectCode: '8011',
    subjectName: 'Information and Communications Technology',
    aliases: ['ICT', 'IT'],
    category: 'computing',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 9, form2: 9, form3: 7 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
  },

  // ==================== BUSINESS ====================
  {
    subjectCode: '7015',
    subjectName: 'Commerce',
    aliases: ['Comm'],
    category: 'business',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 6, form2: 6, form3: 6 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
    notes: '2 tasks per term, every term.',
  },
  {
    subjectCode: '7020',
    subjectName: 'Principles of Accounts',
    aliases: ['Accounts', 'PoA', 'Accounts'],
    category: 'business',
    sbaWeightPercent: 30,
    sbaForms: ['form1', 'form2', 'form3'],
    tasksPerForm: { form1: 6, form2: 6, form3: 6 },
    marksPerForm: { form1: 100, form2: 100, form3: 100 },
    finalExamDuration: '2h 30min',
    notes: '2 tasks per term, every term.',
  },
];

// ==================== BUILT SEED ====================

const now = new Date().toISOString();

export const SBA_CONFIG_SEED: SbaConfig[] = SEED_INPUTS.map(input => {
  const sbaRawMax =
    (input.marksPerForm.form1 ?? 0) +
    (input.marksPerForm.form2 ?? 0) +
    (input.marksPerForm.form3 ?? 0);

  return {
    id: input.subjectCode,
    subjectCode: input.subjectCode,
    subjectName: input.subjectName,
    aliases: input.aliases,
    category: input.category,
    sbaWeightPercent: input.sbaWeightPercent,
    examWeightPercent: (100 - input.sbaWeightPercent) as 70 | 60 | 50,
    sbaForms: input.sbaForms,
    tasksPerForm: input.tasksPerForm,
    marksPerForm: input.marksPerForm,
    hasProject: input.hasProject ?? false,
    projectForm: input.projectForm,
    projectMarks: input.projectMarks,
    sbaRawMax,
    finalExamMarks: 100,
    finalExamDuration: input.finalExamDuration,
    notes: input.notes,
    seeded: true,
    createdAt: now,
    updatedAt: now,
  };
});

// ==================== FALLBACK LOOKUP ====================

const SEED_BY_CODE = new Map(SBA_CONFIG_SEED.map(c => [c.subjectCode, c]));
const SEED_BY_ALIAS = new Map<string, SbaConfig>();
SBA_CONFIG_SEED.forEach(c => {
  SEED_BY_ALIAS.set(c.subjectName.toLowerCase(), c);
  c.aliases.forEach(a => SEED_BY_ALIAS.set(a.toLowerCase(), c));
});

/**
 * Runtime fallback when Firestore read fails or config not yet seeded.
 * Also used to normalize a subject name/alias to its canonical code.
 */
export function getFallbackConfig(subjectOrCode: string): SbaConfig | null {
  if (!subjectOrCode) return null;
  const trimmed = subjectOrCode.trim();
  if (SEED_BY_CODE.has(trimmed)) return SEED_BY_CODE.get(trimmed)!;
  const byAlias = SEED_BY_ALIAS.get(trimmed.toLowerCase());
  return byAlias ?? null;
}

/**
 * Resolve a subject name (possibly abbreviated, e.g. "Eng", "RE") to its
 * canonical subject code. Returns null if not found.
 */
export function resolveSubjectCode(subjectOrAlias: string): string | null {
  const cfg = getFallbackConfig(subjectOrAlias);
  return cfg?.subjectCode ?? null;
}

/**
 * Get all seeded configs.
 */
export function getAllSeedConfigs(): SbaConfig[] {
  return SBA_CONFIG_SEED.map(c => ({ ...c }));
}

/**
 * Extract the subject code prefix from a full code (e.g. "1211" from "1211").
 * Present for future multi-language subjects if needed.
 */
export function getSubjectPrefix(subjectCode: string): string {
  return subjectCode.split('-')[0];
}