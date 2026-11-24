/**
 * Starts the ChromaDB server that ships inside the `chromadb` npm package.
 * Run by `npm run chroma` (and therefore by `npm run dev`). Copied from
 * Company Knowledge AI; its files are kept in ai-server/storage/chroma.
 *
 * Why this file exists: the package's own `chroma` command refuses to start
 * on ordinary 64-bit Windows ("Only ARM64 is supported"), even though npm
 * installs a working server for it (chromadb-js-bindings-win32-x64-msvc).
 * This script loads the right server for your computer and starts it with
 * the same arguments the `chroma` command would have used.
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// One native package per operating system and processor type.
const packages = {
  "win32-x64": "chromadb-js-bindings-win32-x64-msvc",
  "win32-arm64": "chromadb-js-bindings-win32-arm64-msvc",
  "linux-x64": "chromadb-js-bindings-linux-x64-gnu",
  "linux-arm64": "chromadb-js-bindings-linux-arm64-gnu",
  "darwin-x64": "chromadb-js-bindings-darwin-x64",
  "darwin-arm64": "chromadb-js-bindings-darwin-arm64",
};
const key = `${os.platform()}-${os.arch()}`;
const name = packages[key];
if (!name) {
  console.error(`ChromaDB has no bundled server for this computer (${key}).`);
  process.exit(1);
}

let server;
try {
  server = require(name);
} catch (err) {
  console.error(`Could not load the ChromaDB server (${name}). Run "npm install" again.\n${err.message}`);
  process.exit(1);
}

// Same port as CHROMA_URL in .env (default http://localhost:8100). Port 8100 is used so
// this can run at the same time as Company Knowledge AI's ChromaDB on 8000. The server
// listens on 127.0.0.1 (IPv4), which is also where the AI server connects.
const port = process.env.CHROMA_PORT ?? "8100";
const dataDir = path.join(root, "storage", "chroma");
mkdirSync(dataDir, { recursive: true });

process.on("SIGINT", () => process.exit(0));
server.cli(["chroma", "run", "--path", dataDir, "--host", "127.0.0.1", "--port", port]);
