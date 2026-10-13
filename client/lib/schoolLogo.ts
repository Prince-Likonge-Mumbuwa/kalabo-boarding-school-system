// @/lib/schoolLogo.ts
//
// The school logo for every downloaded document (report cards, mark
// schedules, SBA sheets, results analysis, teacher lists...).
//
// The logo is part of the app build (client/assets/school-logo.png), so it
// is published together with the program files under /assets/ and is always
// there when the app is. Before, each PDF fetched /images/school-logo.png
// from the web server; when that address was missing or answered with the
// app page instead of the picture, documents silently came out without the
// logo.
//
// To change the logo: replace client/assets/school-logo.png (and, for the
// website pages, public/images/school-logo.png), then rebuild.

import type { PDFDocument, PDFImage } from 'pdf-lib';
import bundledLogoUrl from '@/assets/school-logo.png';

/** Address of the logo for <img> tags and printed HTML pages. */
export const SCHOOL_LOGO_URL: string = bundledLogoUrl;

type LogoBytes = { bytes: Uint8Array; kind: 'png' | 'jpg' };

const kindOf = (b: Uint8Array): LogoBytes['kind'] | null => {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  return null; // e.g. a web page sent back instead of the picture
};

let cached: Promise<LogoBytes | null> | null = null;

/** Downloads the logo once per visit; null if no copy could be loaded. */
export function loadSchoolLogo(): Promise<LogoBytes | null> {
  if (!cached) {
    cached = (async () => {
      // The bundled copy first; the old public address as a fallback.
      for (const url of [bundledLogoUrl, '/images/school-logo.png']) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const bytes = new Uint8Array(await res.arrayBuffer());
          const kind = kindOf(bytes);
          if (kind) return { bytes, kind };
        } catch {
          /* try the next address */
        }
      }
      console.warn('School logo could not be loaded; documents will have no logo.');
      return null;
    })();
    // A failed attempt (e.g. offline) may succeed next time.
    cached.then(r => { if (!r) cached = null; });
  }
  return cached;
}

/** Puts the logo into a PDF, ready for page.drawImage; null if unavailable. */
export async function embedSchoolLogo(pdfDoc: PDFDocument): Promise<PDFImage | null> {
  const logo = await loadSchoolLogo();
  if (!logo) return null;
  try {
    return logo.kind === 'png' ? await pdfDoc.embedPng(logo.bytes) : await pdfDoc.embedJpg(logo.bytes);
  } catch (err) {
    console.warn('School logo could not be added to the document:', err);
    return null;
  }
}
