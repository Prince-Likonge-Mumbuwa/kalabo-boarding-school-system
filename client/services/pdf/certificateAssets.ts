// @/services/pdf/certificateAssets.ts
//
// Loads the fonts and school logo for award certificates.
//
// The fonts live in client/assets/fonts/ (open licence — see README.md there).
// `?url` tells Vite to publish each file with the app and give us its address;
// the files are only downloaded when someone actually makes certificates.

import { loadSchoolLogo } from '@/lib/schoolLogo';
import type { CertificateAssets } from './certificatePDF';

import cinzelRegularUrl from '@/assets/fonts/Cinzel-Regular.ttf?url';
import cinzelBoldUrl from '@/assets/fonts/Cinzel-Bold.ttf?url';
import cormorantMediumUrl from '@/assets/fonts/Cormorant-Medium.ttf?url';
import cormorantBoldUrl from '@/assets/fonts/Cormorant-Bold.ttf?url';
import cormorantItalicUrl from '@/assets/fonts/Cormorant-Italic.ttf?url';
import greatVibesUrl from '@/assets/fonts/GreatVibes-Regular.ttf?url';

let cached: Promise<CertificateAssets> | null = null;

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load certificate font (${res.status}): ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Downloads everything once per visit. */
export function loadCertificateAssets(): Promise<CertificateAssets> {
  if (!cached) {
    cached = (async () => {
      const [cinzelRegular, cinzelBold, cormorantMedium, cormorantBold, cormorantItalic, greatVibes, logo] =
        await Promise.all([
          fetchBytes(cinzelRegularUrl),
          fetchBytes(cinzelBoldUrl),
          fetchBytes(cormorantMediumUrl),
          fetchBytes(cormorantBoldUrl),
          fetchBytes(cormorantItalicUrl),
          fetchBytes(greatVibesUrl),
          loadSchoolLogo(),
        ]);
      return { cinzelRegular, cinzelBold, cormorantMedium, cormorantBold, cormorantItalic, greatVibes, logo };
    })();
    // A failed attempt (e.g. offline) may succeed next time.
    cached.catch(() => { cached = null; });
  }
  return cached;
}
