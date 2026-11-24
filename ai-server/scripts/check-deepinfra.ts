/**
 * Checks DeepInfra before the AI server relies on it:
 *
 *   npm run check-deepinfra        (or double-click check-deepinfra.bat)
 *
 * Needs DEEPINFRA_API_KEY in ai-server/.env. ChromaDB should be running
 * (npm run dev in another window) for step 3; NVIDIA_API_KEY makes step 2
 * a side-by-side comparison.
 *
 *   1. Writing: asks Nemotron on DeepInfra for a two-line answer, streaming,
 *      as the generators do. Shows the reply and how long it took.
 *   2. Search vectors: embeds the same sentences on DeepInfra and (if its key
 *      is set) NVIDIA, and compares them. The same model should give the
 *      same numbers (similarity close to 1.000).
 *   3. Your index: takes passages already stored in ChromaDB, embeds their
 *      text on DeepInfra, and compares with the stored vectors. If they match,
 *      searches can use DeepInfra without re-indexing.
 *
 * At the end it says what to put in .env. Nothing is changed by the check.
 */
import { ChromaClient } from "chromadb";
import { config } from "../src/config/env.js";
import { allHosts } from "../src/services/ai/hosts.js";
import { NemotronProvider } from "../src/services/ai/NemotronProvider.js";
import { NvidiaEmbeddingService } from "../src/services/rag/EmbeddingService.js";

const hosts = allHosts(config);
const ok = (s: string) => console.log(`  ✓ ${s}`);
const bad = (s: string) => console.log(`  ✗ ${s}`);
const cosine = (a: number[], b: number[]) => {
  if (a.length !== b.length) return NaN;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / Math.sqrt(na * nb);
};
const fmt = (x: number) => (Number.isNaN(x) ? "different sizes" : x.toFixed(4));

if (!hosts.deepinfra.apiKey) {
  console.log("DEEPINFRA_API_KEY is not set in ai-server/.env. Add it (DeepInfra dashboard -> API keys) and run this again.");
  process.exit(1);
}

let writingOk = false, vectorsMatch: boolean | null = null, indexMatch: boolean | null = null;

console.log(`\n1. Writing on DeepInfra (${hosts.deepinfra.writeModel})`);
try {
  const writer = new NemotronProvider(config, undefined, hosts.deepinfra);
  const t = performance.now();
  let first = 0, reply = "";
  for await (const piece of writer.stream({ system: "You are a helpful assistant for Zambian secondary school teachers.", user: "In two short lines: what is a computer network?" })) {
    if (!first) first = performance.now() - t;
    reply += piece;
  }
  writingOk = reply.trim().length > 0;
  (writingOk ? ok : bad)(`reply in ${((performance.now() - t) / 1000).toFixed(1)} s (first words after ${(first / 1000).toFixed(1)} s):`);
  console.log(`    ${reply.trim().slice(0, 300).replace(/\n/g, "\n    ")}`);
  if (/<\/?think>/.test(reply)) bad("the reply still contains <think> tags; tell Claude");
} catch (err) {
  bad((err as Error).message);
}

console.log(`\n2. Search vectors (${hosts.deepinfra.embedModel})`);
const deep = new NvidiaEmbeddingService(config, hosts.deepinfra);
const sentences = [
  "A star topology connects every computer to a central switch.",
  "Photosynthesis takes place in the chloroplasts of green plants.",
  "The Zambezi River forms the border between Zambia and Zimbabwe.",
];
try {
  const deepDocs = await deep.embedDocuments(sentences);
  const deepQuery = await deep.embedQuery("Which topology uses a central switch?");
  ok(`DeepInfra returns ${deepDocs[0]?.length ?? 0} numbers per text`);
  if (hosts.nvidia.apiKey) {
    const nv = new NvidiaEmbeddingService(config, hosts.nvidia);
    const nvDocs = await nv.embedDocuments(sentences);
    const nvQuery = await nv.embedQuery("Which topology uses a central switch?");
    const sims = [...sentences.map((_, i) => cosine(deepDocs[i]!, nvDocs[i]!)), cosine(deepQuery, nvQuery)];
    vectorsMatch = sims.every((s) => s > 0.99);
    (vectorsMatch ? ok : bad)(`same text on DeepInfra vs NVIDIA, similarity: ${sims.map(fmt).join(", ")} (1.000 = identical)`);
  } else console.log("  - NVIDIA_API_KEY not set: side-by-side comparison skipped");
} catch (err) {
  bad((err as Error).message);
}

console.log(`\n3. Your search index (${config.chromaUrl}, collection ${config.chromaCollection})`);
try {
  const url = new URL(config.chromaUrl);
  const client = new ChromaClient({ host: url.hostname, port: Number(url.port || 8000), ssl: url.protocol === "https:" });
  const collection = await client.getCollection({ name: config.chromaCollection });
  const count = await collection.count();
  const sample = await collection.get({ limit: 5, offset: Math.max(0, Math.floor(count / 2)), include: ["documents", "embeddings"] });
  const texts = (sample.documents ?? []).filter((d): d is string => typeof d === "string");
  const stored = (sample.embeddings ?? []) as number[][];
  ok(`${count} passages stored, ${stored[0]?.length ?? 0} numbers each`);
  const fresh = await deep.embedDocuments(texts);
  const sims = fresh.map((v, i) => (v ? cosine(v, stored[i]) : NaN));
  indexMatch = sims.length > 0 && sims.every((s) => s > 0.99);
  (indexMatch ? ok : bad)(`stored passages re-embedded on DeepInfra, similarity: ${sims.map(fmt).join(", ")}`);
} catch (err) {
  console.log(`  - could not read the index (${(err as Error).message}). Start ChromaDB with "npm run dev" and run this again.`);
}

console.log("\nWhat to put in ai-server/.env:");
if (writingOk) console.log("  WRITER_HOSTS=deepinfra,nvidia     (DeepInfra writes; NVIDIA takes over if it fails)");
else console.log("  WRITER_HOSTS=nvidia,deepinfra     (writing on DeepInfra failed above; fix that first)");
if (indexMatch) console.log("  SEARCH_HOSTS=deepinfra,nvidia     (DeepInfra's vectors match your index: no re-indexing needed)");
else if (indexMatch === false || vectorsMatch === false)
  console.log("  SEARCH_HOSTS=nvidia                (DeepInfra's vectors differ from your index; moving search would need a full re-index)");
else console.log("  SEARCH_HOSTS=nvidia                (keep until step 3 can run and shows a match)");
console.log("Then restart the AI server.\n");
