# Certificate fonts

Used only by the award certificates (`client/services/pdf/certificatePDF.ts`).
All are open-licence (SIL Open Font License 1.1) from Google Fonts:

| File | Font | Used for |
|---|---|---|
| Cinzel-Regular.ttf, Cinzel-Bold.ttf | Cinzel | School name, CERTIFICATE, headings |
| Cormorant-Medium.ttf, Cormorant-Bold.ttf, Cormorant-Italic.ttf | Cormorant Garamond | Body text and numbers |
| GreatVibes-Regular.ttf | Great Vibes | The learner's name |

They were cut down to Latin letters only (about 200 KB in total) and the
Cormorant numbers were switched to "lining" figures (so 1 doesn't look like I).
They load only when someone downloads certificates.
