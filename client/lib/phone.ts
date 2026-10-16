// @/lib/phone.ts
// Zambian phone validation + carrier detection (client-side).
//
// Ported from sms-functions/functions/src/lib/phone.js so the Parent Portal
// and the SMS backend validate numbers identically. A number is valid ONLY
// when it is a complete Zambian mobile number (local 0-form or +260 form)
// with a known prefix. Partial input ("09", "0977") is rejected — it must
// never be treated as a usable number or used to look a learner up.

export type Carrier = 'MTN' | 'AIRTEL' | 'ZAMTEL' | 'ZedMobile' | 'OTHER' | 'UNKNOWN';

export const getCarrier = (phone: string): Carrier => {
  if (!phone) return 'UNKNOWN';
  if (/^260(96|76)/.test(phone)) return 'MTN';
  if (/^260(97|77)/.test(phone)) return 'AIRTEL';
  if (/^260(95|75)/.test(phone)) return 'ZAMTEL';
  if (/^260(98|78)/.test(phone)) return 'ZedMobile';
  return 'OTHER';
};

export interface ValidatedPhone {
  /** E.164 form, e.g. "+260977123456" */
  number: string;
  /** canonical digits only, e.g. "260977123456" */
  digits: string;
  /** 9-digit national subscriber part, e.g. "977123456" — use this to compare numbers */
  national9: string;
  carrier: Carrier;
}

/**
 * Validate and canonicalize a Zambian mobile number.
 * Returns null for anything that is not a complete, valid number — this is
 * what stops a partial string like "09" from matching.
 *
 * Accepts: "0977123456", "+260977123456", "260977123456", "977123456"
 * (and the same with spaces, dashes or brackets).
 */
export const validateZambianNumber = (
  phone: string | null | undefined,
): ValidatedPhone | null => {
  if (!phone) return null;

  let cleaned = String(phone).trim().replace(/[\s\-()]+/g, '');
  if (cleaned.startsWith('+')) cleaned = cleaned.substring(1);
  if (cleaned.startsWith('0')) cleaned = '260' + cleaned.substring(1);
  if (!cleaned.startsWith('260')) cleaned = '260' + cleaned;

  // 260 + (valid 2-digit prefix) + 7 more digits = a full subscriber number.
  const pattern = /^260(75|76|77|78|95|96|97|98)\d{7}$/;
  if (!pattern.test(cleaned)) return null;

  return {
    number: '+' + cleaned,
    digits: cleaned,
    national9: cleaned.slice(3),
    carrier: getCarrier(cleaned),
  };
};

/**
 * True when `input` is a complete, valid Zambian mobile number.
 * Convenience wrapper for UI-level checks.
 */
export const isValidZambianNumber = (input: string | null | undefined): boolean =>
  validateZambianNumber(input) !== null;
