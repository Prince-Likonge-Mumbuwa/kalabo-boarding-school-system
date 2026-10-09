// @/services/zambiaHolidays.ts
//
// ============================================================================
//  ZAMBIA PUBLIC HOLIDAY SEED DATA
// ============================================================================
//
//  15 entries per year:
//    • Fixed-date holidays — New Year's Day, Women's Day, Youth Day,
//      Kenneth Kaunda Day, Labour Day, African Freedom Day, Teachers' Day,
//      National Day of Prayer, Independence Day, Christmas Day.
//    • Easter-relative — Good Friday, Easter Monday.
//    • Movable fixed-weekday — Heroes' Day (1st Mon July), Unity Day
//      (the Tuesday after), Farmers' Day (1st Mon August).
//
//  SUNDAY-IN-LIEU RULE
//  ───────────────────
//  Three holidays are "in-lieu eligible". When one falls on a Sunday,
//  the following Monday is written as a SEPARATE holiday doc suffixed
//  "(in lieu)". In-lieu eligible:
//      • International Women's Day  (Mar 8)
//      • Teachers' Day              (Oct 5)
//      • National Day of Prayer     (Oct 18)
//
//  The rest are either fixed mid-week by statute or already fall on a
//  fixed weekday (Heroes', Unity, Farmers'), so no substitution applies.
//
//  IDEMPOTENT
//  ──────────
//  seedZambiaPublicHolidays() skips any holiday whose (name, startDate)
//  pair already exists for the year. Safe to re-run.
//
//  Teachers' Day (Oct 5) is a FULL public holiday — no learning takes
//  place on that day.
// ============================================================================

import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ==================== TYPES ====================

export interface SeedHoliday {
  name: string;
  /** Local 'YYYY-MM-DD', inclusive. */
  startDate: string;
  endDate: string;
  kind: 'public' | 'school' | 'exam-week';
  /** True for the in-lieu Monday, so UIs can distinguish it from the real date. */
  isInLieu?: boolean;
}

export interface SeedResult {
  /** Number of holiday docs written. */
  written: number;
  /** Number already present (matched by name + startDate). */
  skipped: number;
  /** Sample of skipped names, for a toast summary. */
  skippedExamples: string[];
}

// ==================== DATE HELPERS ====================

const pad = (n: number) => String(n).padStart(2, '0');

const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

const isoFromDate = (d: Date) =>
  ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/**
 * Western (Gregorian) Easter Sunday. Meeus/Jones/Butcher algorithm.
 * Accurate for 1900–2099.
 */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 1..12
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const isSunday = (y: number, m: number, d: number) =>
  new Date(y, m - 1, d).getDay() === 0;

/** First Monday of a 1-indexed month. */
function firstMondayOf(year: number, month: number): Date {
  const first = new Date(year, month - 1, 1);
  const dow = first.getDay(); // 0=Sun..6=Sat
  const offset = dow === 1 ? 0 : (8 - dow) % 7;
  return addDays(first, offset);
}

/**
 * If a holiday falls on a Sunday, returns the following Monday. Else null.
 */
function inLieuMondayIfSunday(
  year: number,
  month: number,
  day: number,
): Date | null {
  if (!isSunday(year, month, day)) return null;
  return new Date(year, month - 1, day + 1);
}

// ==================== HOLIDAY LIST ====================

/**
 * Every Zambia public holiday for a given year, including any in-lieu
 * Mondays. Sorted by date, then by name.
 */
export function zambiaPublicHolidays(year: number): SeedHoliday[] {
  const list: SeedHoliday[] = [];

  // ── Fixed-date holidays ───────────────────────────────────────────
  const fixed: Array<{ name: string; month: number; day: number }> = [
    { name: "New Year's Day",              month: 1,  day: 1  },
    { name: "International Women's Day",   month: 3,  day: 8  },
    { name: 'Youth Day',                   month: 3,  day: 12 },
    { name: 'Kenneth Kaunda Day',          month: 4,  day: 28 },
    { name: 'Labour Day',                  month: 5,  day: 1  },
    { name: 'African Freedom Day',         month: 5,  day: 25 },
    { name: "Teachers' Day",               month: 10, day: 5  },
    { name: 'National Day of Prayer',      month: 10, day: 18 },
    { name: 'Independence Day',            month: 10, day: 24 },
    { name: 'Christmas Day',               month: 12, day: 25 },
  ];

  for (const h of fixed) {
    list.push({
      name: h.name,
      startDate: ymd(year, h.month, h.day),
      endDate: ymd(year, h.month, h.day),
      kind: 'public',
    });
  }

  // ── In-lieu Mondays ───────────────────────────────────────────────
  const inLieuEligible = [
    { name: "International Women's Day", month: 3,  day: 8  },
    { name: "Teachers' Day",             month: 10, day: 5  },
    { name: 'National Day of Prayer',    month: 10, day: 18 },
  ];

  for (const h of inLieuEligible) {
    const monday = inLieuMondayIfSunday(year, h.month, h.day);
    if (monday) {
      const dateStr = isoFromDate(monday);
      list.push({
        name: `${h.name} (in lieu)`,
        startDate: dateStr,
        endDate: dateStr,
        kind: 'public',
        isInLieu: true,
      });
    }
  }

  // ── Easter-relative ───────────────────────────────────────────────
  const easter = easterSunday(year);
  const goodFriday = addDays(easter, -2);
  const easterMonday = addDays(easter, 1);

  list.push({
    name: 'Good Friday',
    startDate: isoFromDate(goodFriday),
    endDate: isoFromDate(goodFriday),
    kind: 'public',
  });
  list.push({
    name: 'Easter Monday',
    startDate: isoFromDate(easterMonday),
    endDate: isoFromDate(easterMonday),
    kind: 'public',
  });

  // ── Movable fixed-weekday ─────────────────────────────────────────
  const heroesDay = firstMondayOf(year, 7);      // 1st Mon July
  const unityDay = addDays(heroesDay, 1);        // Tue after Heroes'
  const farmersDay = firstMondayOf(year, 8);     // 1st Mon August

  list.push({
    name: "Heroes' Day",
    startDate: isoFromDate(heroesDay),
    endDate: isoFromDate(heroesDay),
    kind: 'public',
  });
  list.push({
    name: 'Unity Day',
    startDate: isoFromDate(unityDay),
    endDate: isoFromDate(unityDay),
    kind: 'public',
  });
  list.push({
    name: "Farmers' Day",
    startDate: isoFromDate(farmersDay),
    endDate: isoFromDate(farmersDay),
    kind: 'public',
  });

  return list.sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      a.name.localeCompare(b.name),
  );
}

// ==================== SEED WRITER ====================

const HOLIDAYS = 'school_holidays';

/**
 * Writes the given year's Zambian public holidays (including any in-lieu
 * Mondays) to `school_holidays`.
 *
 * Idempotent per (name, startDate). Re-running is safe: it only adds
 * what's missing.
 *
 * Call from an admin UI button — never automatically. A school may have
 * deliberately hidden a holiday, and re-seeding shouldn't undo that.
 */
export async function seedZambiaPublicHolidays(
  year: number,
  actorUid: string | null,
): Promise<SeedResult> {
  const seed = zambiaPublicHolidays(year);

  // One read for the whole year.
  const existingSnap = await getDocs(
    query(
      collection(db, HOLIDAYS),
      where('startDate', '>=', `${year}-01-01`),
      where('startDate', '<=', `${year}-12-31`),
    ),
  );
  const existingKey = new Set(
    existingSnap.docs.map(d => {
      const data = d.data();
      return `${data.name}__${data.startDate}`;
    }),
  );

  const toWrite = seed.filter(h => !existingKey.has(`${h.name}__${h.startDate}`));
  const skipped = seed.length - toWrite.length;

  if (toWrite.length === 0) {
    return { written: 0, skipped, skippedExamples: [] };
  }

  // Chunked batch — well under the 500-op limit even for future-proofing.
  const CHUNK = 400;
  let written = 0;
  for (let i = 0; i < toWrite.length; i += CHUNK) {
    const slice = toWrite.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const h of slice) {
      const ref = doc(collection(db, HOLIDAYS));
      batch.set(ref, {
        name: h.name,
        startDate: h.startDate,
        endDate: h.endDate,
        kind: h.kind,
        createdBy: actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    written += slice.length;
  }

  return {
    written,
    skipped,
    skippedExamples: seed.slice(0, 3).map(h => `${h.name} (${h.startDate})`),
  };
}