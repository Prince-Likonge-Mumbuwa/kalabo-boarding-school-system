/**
 * Entry point of the AI server: `npm run dev` runs this file (and ChromaDB
 * beside it). It builds the services, starts Express and prints a status summary.
 */
import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { createServices } from "./container.js";
import { type Host, hostsInOrder } from "./services/ai/hosts.js";

const services = createServices(config);
await services.curriculum.failInterrupted();
// Documents from before form ranges existed are moved to the new labels and indexed again.
for (const id of await services.curriculum.migrateLevels()) await services.indexing.enqueue(id);

createApp(services).listen(config.port, async () => {
  const created = await services.superAdmin.exists();
  const writers = hostsInOrder(config, config.writerHosts);
  const searchers = hostsInOrder(config, config.searchHosts);
  const names = (hosts: Host[], model: (h: Host) => string) => hosts.map((h) => `${h.label} (${model(h)})`).join(" → ");
  console.log(`\nKalabo AI server: http://localhost:${config.port}`);
  console.log(`  ${created ? "✓" : "✗"} SuperAdmin       ${created ? "account exists" : 'not created yet. Run "npm run create-superadmin"'}`);
  console.log(`  ${config.firebaseProjectId ? "✓" : "✗"} Teacher sign-in  ${config.firebaseProjectId || "FIREBASE_PROJECT_ID is not set in .env"}`);
  // Hosts are tried in this order; a host without a key in .env is left out.
  console.log(`  ${writers.length ? "✓" : "✗"} Writing          ${writers.length ? names(writers, (h) => h.writeModel) : `no key for ${config.writerHosts.join(" or ")} in .env (WRITER_HOSTS)`}`);
  console.log(`  ${searchers.length ? "✓" : "✗"} Search           ${searchers.length ? names(searchers, (h) => h.embedModel) : `no key for ${config.searchHosts.join(" or ")} in .env (SEARCH_HOSTS)`}`);
  if (writers.some((h) => /ultra/i.test(h.writeModel)))
    console.log(`  ! Speed            the Ultra model is very large and slow; NVIDIA_MODEL=nvidia/nemotron-3.5-super-vl-120b-a12b is much faster`);
  console.log(`  ✓ Queue            ${config.writerConcurrency} documents at a time (WRITER_CONCURRENCY); light jobs on ${config.fastModel || "the main model"}`);
  console.log(`  ✓ Allowed from     ${config.clientOrigins.join(", ")}`);
  console.log(`  ✓ Storage          ${config.dataDir}`);
  // ChromaDB starts at the same moment as this server and needs a few seconds,
  // so keep checking for up to 30 seconds before reporting it as unreachable.
  let chroma = await services.store.health();
  for (let attempt = 0; !chroma.ok && attempt < 15; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    chroma = await services.store.health();
  }
  console.log(`  ${chroma.ok ? "✓" : "✗"} ChromaDB         ${chroma.ok ? config.chromaUrl : chroma.error}\n`);
});
