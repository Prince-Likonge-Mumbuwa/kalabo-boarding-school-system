// @/services/smsTemplates.ts
//
// Ready-made SMS templates. A template always fits in ONE SMS:
// 160 characters of the plain GSM-7 alphabet. One "smart" character (curly
// quote, long dash, emoji…) switches the whole SMS to UCS-2 and the limit
// drops to 70 — so every template is cleaned with toGsm7() first.

import { isGsm7 } from '@/services/resultsService';

export const ONE_SMS = 160;
export const SCHOOL_SMS_NAME = 'Kalabo Boarding Sec';

// ==================== GSM-7 ====================

/** Smart punctuation → plain keyboard characters. */
const REPLACE: Array<[RegExp, string]> = [
  [/[‘’‚‛′´`]/g, "'"],
  [/[“”„‟″]/g, '"'],
  [/[‐-―−]/g, '-'],
  [/…/g, '...'],
  [/[  -​  　\t]/g, ' '],
  [/[•·]/g, '-'],
];

/**
 * Text that stays GSM-7 (160 a SMS): smart punctuation made plain, other
 * characters outside the basic GSM-7 set (emoji, €, [ ] { } …) removed.
 */
export function toGsm7(text: string): string {
  let s = text;
  for (const [re, to] of REPLACE) s = s.replace(re, to);
  s = s.normalize('NFC');
  let out = '';
  for (const ch of s) {
    // The extension characters ({ } [ ] ~ | ^ \ €) cost 2 each: drop them too.
    if ('{}[]~|^\\€'.includes(ch)) continue;
    if (isGsm7(ch)) out += ch;
  }
  return out.replace(/ {2,}/g, ' ');
}

/** Characters and SMS count of a message, as the network bills it. */
export function smsLength(text: string): { chars: number; sms: number; gsm: boolean } {
  const gsm = isGsm7(text);
  let chars = 0;
  for (const ch of text) chars += gsm && '{}[]~|^\\€'.includes(ch) ? 2 : 1;
  const one = gsm ? 160 : 70;
  const part = gsm ? 153 : 67;
  return { chars, sms: chars <= one ? 1 : Math.ceil(chars / part), gsm };
}

// ==================== SUMMONS ====================

export type SummonsSigner = 'Head' | 'Deputy Head';
export type SummonsPlace = 'head' | 'deputy' | 'guidance' | 'form-teacher';

export const SIGNER_LABEL: Record<SummonsSigner, string> = {
  Head: 'The Head',
  'Deputy Head': 'The Deputy Head',
};

export const PLACE_LABEL: Record<SummonsPlace, string> = {
  head: "the Head's office",
  deputy: "the Deputy Head's office",
  guidance: 'the Guidance office',
  'form-teacher': 'the form teacher',
};

export interface SummonsInput {
  learnerName: string;
  className?: string;
  /** yyyy-mm-dd */
  date: string;
  /** HH:mm (24 h) */
  time: string;
  place: SummonsPlace;
  signer: SummonsSigner;
  /** Number the parent can call; left out when blank. */
  phone?: string;
  schoolName?: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-31" → "Sat 31 Oct". */
export function shortDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** The next school day (Mon–Fri) after `from`, as yyyy-mm-dd. */
export function nextSchoolDay(from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1, 12);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
/** "John Chola Mwale" → "John C. Mwale" (first and last kept, middle as initials). */
const middleInitials = (s: string) => {
  const w = words(s);
  return w.length <= 2 ? w.join(' ') : [w[0], ...w.slice(1, -1).map(x => `${x[0]}.`), w[w.length - 1]].join(' ');
};
/** "John Chola Mwale" → "John Mwale". */
const firstLast = (s: string) => {
  const w = words(s);
  return w.length <= 2 ? w.join(' ') : `${w[0]} ${w[w.length - 1]}`;
};
/** "Grade 10A" → "10A", "Form 1B" → "1B". */
const shortClass = (s: string) => s.replace(/^\s*(grade|form|gr\.?|f\.?)\s*/i, '').trim();
/** "0977 123 456" → "0977123456". */
const compactPhone = (s: string) => s.replace(/[\s-]/g, '');

/**
 * The summons SMS, always one SMS (≤ 160 GSM-7 characters):
 *
 *   Kalabo Boarding Sec: Parent of John Mwale (Grade 10A), please report to
 *   the Head's office on Fri 31 Oct at 09:00. Tel 0977123456. -The Deputy Head
 *
 * When it is too long it is shortened step by step: middle names become
 * initials, the class loses "Grade"/"Form", the phone number is left out,
 * then only the learner's first and last names are kept, then the name is cut.
 */
export function buildSummonsMessage(input: SummonsInput): string {
  const school = toGsm7(input.schoolName ?? SCHOOL_SMS_NAME).trim();
  const fullName = toGsm7(input.learnerName).trim() || 'your child';
  const cls = toGsm7(input.className ?? '').trim();
  const phone = compactPhone(toGsm7(input.phone ?? ''));
  const when = `${shortDate(input.date)} at ${input.time}`;
  const signer = SIGNER_LABEL[input.signer];

  const compose = (name: string, klass: string, withPhone: boolean) =>
    `${school}: Parent of ${name}${klass ? ` (${klass})` : ''}, please report to ${PLACE_LABEL[input.place]} on ${when}.` +
    `${withPhone && phone ? ` Tel ${phone}.` : ''} -${signer}`;

  const tries: Array<[string, string, boolean]> = [
    [fullName, cls, true],
    [middleInitials(fullName), cls, true],
    [middleInitials(fullName), shortClass(cls), true],
    [middleInitials(fullName), shortClass(cls), false],
    [firstLast(fullName), shortClass(cls), false],
  ];
  for (const [n, c, p] of tries) {
    const msg = compose(n, c, p);
    if (msg.length <= ONE_SMS) return msg;
  }
  // Last resort: cut the name to fit.
  const [n, c] = tries[tries.length - 1];
  const over = compose(n, c, false).length - ONE_SMS;
  return compose(n.slice(0, Math.max(1, n.length - over - 1)).trimEnd() + '.', c, false);
}
