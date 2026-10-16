// Copies Tick's TEMPLATE_KEY into a temporary file for
// `firebase functions:secrets:set FACE_TEMPLATE_KEY --data-file`, so faces
// enrolled in Tick stay readable. The key is never printed.
// Same order Tick itself uses: TEMPLATE_KEY in .env, else data/secrets.json.
import fs from 'node:fs';
import path from 'node:path';
const [tick, out] = process.argv.slice(2);
let key = '';
try {
  const env = fs.readFileSync(path.join(tick, '.env'), 'utf8');
  const m = env.match(/^\s*TEMPLATE_KEY\s*=\s*(.*)\s*$/m);
  if (m) key = m[1].trim().replace(/^(['"])(.*)\1$/, '$2');
} catch { /* no .env */ }
let source = 'tick-v4\\.env';
if (!key) {
  try { key = JSON.parse(fs.readFileSync(path.join(tick, 'data', 'secrets.json'), 'utf8')).TEMPLATE_KEY || ''; source = 'tick-v4\\data\\secrets.json'; } catch { /* none */ }
}
if (!key || key.length < 12) { console.error('Could not find Tick TEMPLATE_KEY (.env or data\\secrets.json).'); process.exit(1); }
fs.writeFileSync(out, key, { mode: 0o600 });
console.log(`Face key taken from ${source} (${key.length} characters, not shown).`);
