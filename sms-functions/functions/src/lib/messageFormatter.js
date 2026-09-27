// functions/src/formatSMSMessage.js
// Builds the SMS body for a student's results
// Reads examConfigs to know which exams are active this term
// Reads results collection to gather subject scores
//
// v3.0.0 — Zambian CBC (2023) Secondary Subjects
//   - 38 canonical CBC subjects, 3–4 char collision-free codes
//   - No box-drawing chars (keeps GSM-7, 1 segment where possible)
//   - All subjects shown on one line
//   - Target: ~140–160 chars → 1 SMS instead of 2
//   - MUST stay in sync with src/services/resultsService.ts (v7.0.0)

const { getFirestore } = require('firebase-admin/firestore');
const db = getFirestore();

// ==================== SMS SUBJECT ABBREVIATIONS ====================
// Zambian CBC (2023) — Secondary Schools only (Forms 1–6).
// All codes GSM-7 safe. Max 4 chars. No collisions.
// MUST stay in sync with SUBJECT_SMS_ABBREVIATIONS in resultsService.ts
const SUBJECT_SMS_ABBREVIATIONS = {
  // ----- STEM & Natural Sciences -----
  'Mathematics':              'MATH',
  'Additional Mathematics':   'ADMA',
  'Integrated Science':       'IS',
  'Physics':                  'PHY',
  'Chemistry':                'CHEM',
  'Biology':                  'BIO',
  'Agricultural Science':     'AGR',
  'Computer Science':         'CS',
  'ICT':                      'ICT',

  // ----- Social Sciences & Humanities -----
  'Geography':                'GEO',
  'History':                  'HIST',
  'Civic Education':          'CIV',
  'Religious Education':      'RE',
  'Social Studies':           'SOC',

  // ----- Languages & Literature -----
  'English':                  'ENG',
  'Literature in English':    'LIT',
  'French':                   'FRE',
  'Chinese':                  'CHI',
  'Portuguese':               'POR',
  'Swahili':                  'SWA',
  'Icibemba':                 'BEM',
  'Cinyanja':                 'NYA',
  'Chitonga':                 'TON',
  'Silozi':                   'SIL',
  'Kiikaonde':                'KIK',
  'Lunda':                    'LUN',
  'Luvale':                   'LUV',

  // ----- Business & Commercial -----
  'Business Studies':         'BS',
  'Commerce':                 'COM',
  'Principles of Accounts':   'PA',
  'Economics':                'ECON',

  // ----- Technical, Practical & Vocational -----
  'Design & Technology':      'DT',
  'Food & Nutrition':         'FN',
  'Home Economics':           'HE',
  'Fashion & Fabrics':        'FF',
  'Hospitality Management':   'HM',
  'Travel & Tourism':         'TT',
  'Physical Education':       'PE',
  'Art & Design':             'ART',
  'Music':                    'MUS',
};

// ==================== SUBJECT NORMALIZATION MAP ====================
// Maps user-entered aliases to canonical names so lookups are reliable.
// MUST stay in sync with SUBJECT_NORMALIZATION_MAP in resultsService.ts
const SUBJECT_NORMALIZATION_MAP = {
  // --- STEM ---
  'Mathematics': 'Mathematics', 'Maths': 'Mathematics', 'Math': 'Mathematics',
  'Additional Mathematics': 'Additional Mathematics',
  'Add Maths': 'Additional Mathematics', 'Add Math': 'Additional Mathematics',
  'Integrated Science': 'Integrated Science', 'Int Science': 'Integrated Science', 'IS': 'Integrated Science',
  'Physics': 'Physics', 'Phy': 'Physics',
  'Chemistry': 'Chemistry', 'Chem': 'Chemistry',
  'Biology': 'Biology', 'Bio': 'Biology',
  'Agricultural Science': 'Agricultural Science', 'Agric': 'Agricultural Science', 'Agriculture': 'Agricultural Science',
  'Computer Science': 'Computer Science', 'Comp Sci': 'Computer Science', 'Computing': 'Computer Science',
  'ICT': 'ICT', 'Computer Studies': 'ICT',

  // --- Humanities ---
  'Geography': 'Geography', 'Geo': 'Geography',
  'History': 'History', 'Hist': 'History',
  'Civic Education': 'Civic Education', 'Civic Educ': 'Civic Education', 'Civics': 'Civic Education',
  'Religious Education': 'Religious Education', 'RE': 'Religious Education', 'Religious Studies': 'Religious Education',
  'Social Studies': 'Social Studies', 'Social': 'Social Studies',

  // --- Languages ---
  'English': 'English', 'English Language': 'English', 'Eng': 'English',
  'Literature in English': 'Literature in English', 'Literature': 'Literature in English', 'Lit': 'Literature in English',
  'French': 'French', 'FRE': 'French',
  'Chinese': 'Chinese', 'CHI': 'Chinese',
  'Portuguese': 'Portuguese', 'POR': 'Portuguese',
  'Swahili': 'Swahili', 'SWA': 'Swahili',
  'Icibemba': 'Icibemba', 'Bemba': 'Icibemba',
  'Cinyanja': 'Cinyanja', 'Nyanja': 'Cinyanja',
  'Chitonga': 'Chitonga', 'Tonga': 'Chitonga',
  'Silozi': 'Silozi', 'Lozi': 'Silozi',
  'Kiikaonde': 'Kiikaonde', 'Kaonde': 'Kiikaonde',
  'Lunda': 'Lunda',
  'Luvale': 'Luvale',

  // --- Business ---
  'Business Studies': 'Business Studies', 'Business': 'Business Studies',
  'Commerce': 'Commerce', 'Comm': 'Commerce',
  'Principles of Accounts': 'Principles of Accounts', 'Accounts': 'Principles of Accounts',
  'Accounting': 'Principles of Accounts', 'POA': 'Principles of Accounts',
  'Economics': 'Economics', 'Econ': 'Economics',

  // --- Technical / Vocational ---
  'Design & Technology': 'Design & Technology', 'Design and Technology': 'Design & Technology',
  'Technical Drawing': 'Design & Technology', 'DT': 'Design & Technology',
  'Food & Nutrition': 'Food & Nutrition', 'Food and Nutrition': 'Food & Nutrition', 'Foods': 'Food & Nutrition',
  'Home Economics': 'Home Economics', 'Home Econ': 'Home Economics', 'HE': 'Home Economics',
  'Fashion & Fabrics': 'Fashion & Fabrics', 'Fashion and Fabrics': 'Fashion & Fabrics', 'Fashion': 'Fashion & Fabrics',
  'Hospitality Management': 'Hospitality Management', 'Hospitality': 'Hospitality Management',
  'Travel & Tourism': 'Travel & Tourism', 'Travel and Tourism': 'Travel & Tourism', 'Tourism': 'Travel & Tourism',
  'Physical Education': 'Physical Education', 'PE': 'Physical Education',
  'Art & Design': 'Art & Design', 'Art and Design': 'Art & Design', 'Art': 'Art & Design', 'Design': 'Art & Design',
  'Music': 'Music', 'MUS': 'Music',
};

function normalizeSubjectName(subjectName) {
  if (!subjectName) return '';
  const trimmed = subjectName.trim();
  if (SUBJECT_NORMALIZATION_MAP[trimmed]) return SUBJECT_NORMALIZATION_MAP[trimmed];
  const lower = trimmed.toLowerCase();
  for (const [k, v] of Object.entries(SUBJECT_NORMALIZATION_MAP)) {
    if (k.toLowerCase() === lower) return v;
  }
  return trimmed;
}

function getSubjectSmsCode(subjectName) {
  if (!subjectName) return '???';
  const normalized = normalizeSubjectName(subjectName);
  if (SUBJECT_SMS_ABBREVIATIONS[normalized]) return SUBJECT_SMS_ABBREVIATIONS[normalized];
  // Fallback: first word, first 3 chars, uppercase
  const firstWord = normalized.trim().split(/\s+/)[0] || '???';
  return firstWord.substring(0, 3).toUpperCase();
}

// ==================== GRADE HELPERS ====================

function grade(percentage) {
  if (percentage >= 75) return { g: 1, desc: 'Distinction',    short: 'D1' };
  if (percentage >= 70) return { g: 2, desc: 'Distinction',    short: 'D2' };
  if (percentage >= 65) return { g: 3, desc: 'Merit',          short: 'M1' };
  if (percentage >= 60) return { g: 4, desc: 'Merit',          short: 'M2' };
  if (percentage >= 55) return { g: 5, desc: 'Credit',         short: 'C1' };
  if (percentage >= 50) return { g: 6, desc: 'Credit',         short: 'C2' };
  if (percentage >= 45) return { g: 7, desc: 'Satisfactory',   short: 'S1' };
  if (percentage >= 40) return { g: 8, desc: 'Satisfactory',   short: 'S2' };
  return                       { g: 9, desc: 'Unsatisfactory', short: 'U'  };
}

// ==================== DATA FETCHERS ====================

async function getActiveExamTypes(term, year) {
  try {
    const snap = await db.collection('examConfigs')
      .where('term', '==', term).where('year', '==', year)
      .limit(1).get();

    if (snap.empty) return ['week4', 'week8', 'endOfTerm'];

    const c = snap.docs[0].data();
    const types = [];
    if (c.examTypes?.week4)     types.push('week4');
    if (c.examTypes?.week8)     types.push('week8');
    if (c.examTypes?.endOfTerm) types.push('endOfTerm');
    return types.length ? types : ['week4', 'week8', 'endOfTerm'];
  } catch (err) {
    console.error('getActiveExamTypes:', err);
    return ['week4', 'week8', 'endOfTerm'];
  }
}

async function getStudentResultsBySubject(studentDocId, term, year, examTypes) {
  const q = await db.collection('results')
    .where('studentId', '==', studentDocId)
    .where('term', '==', term)
    .where('year', '==', year)
    .get();

  const map = new Map();
  q.docs.forEach(d => {
    const r = d.data();
    if (!examTypes.includes(r.examType)) return;
    if (!map.has(r.subjectName)) {
      map.set(r.subjectName, {
        subjectName: r.subjectName, week4: null, week8: null, endOfTerm: null,
      });
    }
    map.get(r.subjectName)[r.examType] = r.percentage;
  });
  return Array.from(map.values());
}

// ==================== SMS BODY BUILDER (v3 — CBC compact) ====================

/**
 * Build a compact SMS body for one student's term results.
 *
 * Sample output (~145 chars, 1 SMS segment, GSM-7):
 *
 *   KALABO SEC - T1 2026
 *   Viti Pious Likonge (G12A_025) Grade 12A
 *   BIO 72 CHEM 95 CIV 51 ENG 46 MATH 68 PHY 60
 *   AVG 65 (M1)
 *   Kalabo Sec School
 *
 * Design notes:
 *   - No unicode box-drawing chars (────) — they force UCS-2 (70-char limit)
 *   - No ellipsis char (…) — same UCS-2 problem
 *   - Subject codes (3–4 chars) replace long names
 *   - All subjects shown (no MAX cap) — space-separated fits in 1 segment
 *   - Full student name preserved for guardian readability
 */
async function formatSMSMessage(studentDocId, customId, term, year, studentData, classData) {
  try {
    const examTypes = await getActiveExamTypes(term, year);
    const subjects  = await getStudentResultsBySubject(studentDocId, term, year, examTypes);

    const studentName = studentData.fullName || studentData.name || 'N/A';
    const className   = classData?.name || 'N/A';

    // Compact term label — "Term 1" → "T1"
    const termShort = String(term || '').replace(/^Term\s*/i, 'T');

    const lines = [];

    // --- Line 1: compact header ---
    lines.push(`KALABO SEC - ${termShort} ${year}`);

    // --- Line 2: student identity ---
    lines.push(`${studentName} (${customId || 'N/A'}) ${className}`);

    // --- Line 3: subjects in "CODE score" tokens ---
    const tokens = [];
    let total = 0;
    let count = 0;

    // Stable alphabetical order so guardians see consistent layout term-to-term
    const sortedSubjects = subjects.slice().sort((a, b) =>
      a.subjectName.localeCompare(b.subjectName)
    );

    for (const s of sortedSubjects) {
      // Prefer endOfTerm → week8 → week4 (latest available)
      let latest = null;
      if (s.endOfTerm != null)  latest = s.endOfTerm;
      else if (s.week8 != null) latest = s.week8;
      else if (s.week4 != null) latest = s.week4;

      if (latest == null || latest < 0) continue;

      const code = getSubjectSmsCode(s.subjectName);
      tokens.push(`${code} ${Math.round(latest)}`);
      total += latest;
      count++;
    }

    if (tokens.length === 0) {
      lines.push('No results available yet.');
    } else {
      lines.push(tokens.join(' '));

      // --- Line 4: average + short grade ---
      const avg = Math.round(total / count);
      const g = grade(avg);
      lines.push(`AVG ${avg} (${g.short})`);
    }

    // --- Line 5: footer ---
    lines.push('Kalabo Sec School');

    let msg = lines.join('\n');

    // Safety cap — never send more than 3 segments even in pathological cases.
    // 3 GSM-7 segments = 459 chars; anything longer gets trimmed at the last
    // complete subject token to avoid cutting a number mid-way.
    const MAX_LEN = 459;
    if (msg.length > MAX_LEN) {
      const header  = lines.slice(0, 2).join('\n');
      const footer  = lines[lines.length - 1];
      const avgLine = tokens.length ? lines[lines.length - 2] : '';

      let running = '';
      for (const t of tokens) {
        const candidate = running ? `${running} ${t}` : t;
        const testMsg = [header, candidate, avgLine, footer].filter(Boolean).join('\n');
        if (testMsg.length > MAX_LEN) break;
        running = candidate;
      }

      const trimmed = [
        header,
        running + (running && running !== tokens.join(' ') ? ' ...' : ''),
        avgLine,
        footer,
      ].filter(Boolean).join('\n');

      msg = trimmed.length > MAX_LEN ? trimmed.substring(0, MAX_LEN - 3) + '...' : trimmed;
    }

    return msg;
  } catch (err) {
    console.error('formatSMSMessage:', err);
    // Fallback stays compact too
    const termShort = String(term || '').replace(/^Term\s*/i, 'T');
    return `KALABO SEC - ${termShort} ${year}\nResults for ${customId || 'N/A'} are available.\nPlease contact the school.`;
  }
}

module.exports = {
  formatSMSMessage,
  getActiveExamTypes,
  getSubjectSmsCode,
  normalizeSubjectName,
  grade,
  SUBJECT_SMS_ABBREVIATIONS,
  SUBJECT_NORMALIZATION_MAP,
};