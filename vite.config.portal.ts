// vite.config.portal.ts — builds the code the `portal` Cloud Function runs.
//
//   npm run build:portal
//
// Input:  sms-functions/portal/portalCore.ts (+ the app services it imports)
// Output: sms-functions/functions/src/portal/portalCore.cjs  (COMMIT this file:
//         the function deploy uploads only sms-functions/functions)
//
// Browser-only modules are swapped for server versions (sms-functions/portal):
//   firebase/firestore, @/lib/auditedFirestore → adminFirestore.ts (Admin SDK)
//   @/lib/firebase, firebase/app, firebase/auth → shims.ts (no sign-in)
// firebase-admin stays external: the function installs it from its package.json.
import { defineConfig } from "vite";
import path from "path";

const r = (p: string) => path.resolve(__dirname, p);

export default defineConfig({
  publicDir: false, // do not copy the website's public/ files into the function
  resolve: {
    // Most specific first: '@/lib/firebase' must win over the general '@'.
    alias: [
      { find: /^@\/lib\/auditedFirestore$/, replacement: r("sms-functions/portal/adminFirestore.ts") },
      { find: /^@\/lib\/firebase$/, replacement: r("sms-functions/portal/shims.ts") },
      { find: /^firebase\/firestore$/, replacement: r("sms-functions/portal/adminFirestore.ts") },
      { find: /^firebase\/(app|auth)$/, replacement: r("sms-functions/portal/shims.ts") },
      { find: /^@shared\//, replacement: r("shared") + "/" },
      { find: /^@\//, replacement: r("client") + "/" },
    ],
  },
  // The app code reads import.meta.env.* (Firebase web keys); the server needs none.
  define: { "import.meta.env": "{}" },
  ssr: { noExternal: true, external: ["firebase-admin", "firebase-admin/firestore", "firebase-admin/app"] },
  build: {
    ssr: r("sms-functions/portal/portalCore.ts"),
    outDir: r("sms-functions/functions/src/portal"),
    emptyOutDir: false, // portal.js lives in the same folder
    target: "node22",
    minify: false, // readable, so errors in the function logs point somewhere useful
    sourcemap: false,
    rollupOptions: {
      external: [/^firebase-admin(\/.*)?$/],
      output: { format: "cjs", entryFileNames: "portalCore.cjs", inlineDynamicImports: true },
    },
  },
});
