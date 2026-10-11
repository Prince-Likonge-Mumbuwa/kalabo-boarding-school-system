import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { createServer } from "./server";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    fs: {
      allow: ["./client", "./shared"],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "server/**"],
    },
  },
  build: {
    outDir: "dist/spa",
    rollupOptions: {
      output: {
        // Big libraries in their own files: cached by the browser across
        // app updates, and PDF code is only downloaded when a PDF is made.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\\/](firebase|@firebase)[\\/]/.test(id)) return "firebase";
          if (/[\\/](pdf-lib|pdfmake|jspdf|@pdf-lib|fontkit|html2canvas)[\\/]/.test(id)) return "pdf";
          // Charts: leave to the bundler so they load only with the pages
          // that draw charts (results analysis).
          if (/[\\/](recharts[a-z-]*|d3-[a-z]+|victory-vendor|internmap|decimal\.js-light|react-smooth|recharts-scale)[\\/]/.test(id)) return;
          if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler|@tanstack)[\\/]/.test(id)) return "react";
          // Everything else shared (icons, UI primitives, small helpers).
          return "vendor";
        },
      },
    },
  },
  plugins: [react(), expressPlugin()],
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
