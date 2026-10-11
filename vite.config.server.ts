import { defineConfig } from "vite";
import path from "path";
import fs from "fs";

// Server build configuration
export default defineConfig({
  // The server needs none of the website's public files. (Copying them here
  // also put a second .htaccess in dist/server.)
  publicDir: false,
  plugins: [
    {
      // If the whole dist folder is ever published, the server code must not
      // be downloadable: this replaces any older dist/server/.htaccess.
      name: "deny-web-access",
      closeBundle() {
        fs.writeFileSync(path.resolve(__dirname, "dist/server/.htaccess"), "Require all denied\n");
      },
    },
  ],
  build: {
    lib: {
      entry: path.resolve(__dirname, "server/node-build.ts"),
      name: "server",
      fileName: "production",
      formats: ["es"],
    },
    outDir: "dist/server",
    target: "node22",
    ssr: true,
    rollupOptions: {
      external: [
        // Node.js built-ins
        "fs",
        "path",
        "url",
        "http",
        "https",
        "os",
        "crypto",
        "stream",
        "util",
        "events",
        "buffer",
        "querystring",
        "child_process",
        // External dependencies that should not be bundled
        "express",
        "cors",
      ],
      output: {
        format: "es",
        entryFileNames: "[name].mjs",
      },
    },
    minify: false, // Keep readable for debugging
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});
