import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { createServer } from "./server";

// One id per build: baked into the code and published as /version.json, so
// open tabs can tell that a newer version is out (client/lib/appVersion.ts).
const BUILD_ID = process.env.BUILD_ID || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14) + "-" + Math.random().toString(36).slice(2, 6);

function versionFile(): Plugin {
  return {
    name: "version-file",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: BUILD_ID }) + "\n" });
    },
  };
}

/** Libraries of the AI document figures (see manualChunks): kept out of the start-up "vendor" file. */
const LAZY_FIGURE_LIBS = /[\\/]node_modules[\\/](\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(mermaid|@mermaid-js|langium|chevrotain|@chevrotain|chevrotain-allstar|vscode-[a-z-]+|cytoscape[a-z-]*|layout-base|cose-base|dagre-d3-es|elkjs|khroma|katex|stylis|dayjs|marked|ts-dedent|@braintree|@iconify|@upsetjs|es-toolkit|lodash-es|d3|d3-[a-z-]+|delaunator|robust-predicates|mathjax-full|mj-context-menu|speech-rule-engine|wicked-good-xpath|smiles-drawer|mathjs|complex\.js|decimal\.js|escape-latex|fraction\.js|javascript-natural-sort|seedrandom|tiny-emitter|typed-function|roughjs|points-on-curve|points-on-path|path-data-parser|hachure-fill|topojson-client)[\\/]/;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    fs: {
      // node_modules: the face engine (onnxruntime-web) loads its own files at run time.
      allow: ["./client", "./shared", "./node_modules"],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "server/**"],
    },
  },
  build: {
    outDir: "dist/spa",
    rollupOptions: {
      output: {
        // File names: name.HASH.js. (Changed from name-HASH.js in Oct 2026 so
        // that every file got an address no cache had ever seen: during a
        // broken deploy, caches had saved the app page under the old names.)
        // ".b" added 24 Nov 2026 for the same reason: during an outage the
        // Hostinger CDN answered 429 marked "immutable, 1 year", and browsers
        // kept those errors under the vendor/firebase/css names (white page).
        entryFileNames: "assets/[name].b.[hash].js",
        chunkFileNames: "assets/[name].b.[hash].js",
        assetFileNames: "assets/[name].b.[hash][extname]",
        // Big libraries in their own files: cached by the browser across
        // app updates, and PDF code is only downloaded when a PDF is made.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\\/](firebase|@firebase)[\\/]/.test(id)) return "firebase";
          if (/[\\/](pdf-lib|pdfmake|jspdf|@pdf-lib|fontkit|html2canvas)[\\/]/.test(id)) return "pdf";
          // Charts: leave to the bundler so they load only with the pages
          // that draw charts (results analysis).
          if (/[\\/](recharts[a-z-]*|d3-[a-z]+|victory-vendor|internmap|decimal\.js-light|react-smooth|recharts-scale)[\\/]/.test(id)) return;
          // Figure and maths libraries for AI documents (Mermaid, MathJax,
          // smiles-drawer, mathjs, map drawing) and everything they bring
          // with them: several MB, loaded only when a document has figures
          // or maths. None of them imports React.
          if (LAZY_FIGURE_LIBS.test(id)) return;
          // Face recognition engine (~4 MB incl. WebAssembly): loaded only
          // when a teacher opens Scan faces / Enrol faces, never at start.
          if (/[\\/]onnxruntime-(web|common)[\\/]/.test(id)) return;
          // 3D (three.js and React Three Fiber): only the superAdmin console's
          // usage chart draws in 3D, so it loads with that chart, never at start.
          if (/[\\/](three|@react-three|react-reconciler|its-fine|suspend-react|react-use-measure)[\\/]/.test(id)) return;
          // Everything else shared — React itself, the router, icons, UI
          // primitives and small helpers — goes in ONE file. React must not
          // be split into its own file: the router (React file) and the UI
          // libraries (vendor file) import each other, and the two files
          // then load in the wrong order and the app crashes on start
          // ("Cannot read properties of undefined (reading 'forwardRef')").
          return "vendor";
        },
      },
    },
  },
  // onnxruntime-web ships its own WebAssembly; let Vite copy it as-is
  // (same setting as Tick).
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  define: { __APP_VERSION__: JSON.stringify(mode === "production" ? BUILD_ID : "dev") },
  plugins: [react(), expressPlugin(), versionFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
}));

function expressPlugin(): Plugin {
  return {
    name: "express-plugin",
    apply: "serve", // Only apply during development (serve mode)
    configureServer(server) {
      const app = createServer();

      // Add Express app as middleware to Vite dev server
      server.middlewares.use(app);
    },
  };
}
