// Smoke test for the production build (dist/spa).
//
// Opens the built site in a real browser, exactly as visitors get it, and
// fails if the app crashes or shows a blank page. The unit tests cannot
// catch this kind of fault (for example the October "forwardRef" crash that
// only happened in the production bundle), so the deploy runs this first and
// nothing is uploaded if it fails.
//
//   node scripts/smoke-test.mjs [dist/spa]
//
// Needs Playwright. In CI it is installed outside the project; point to it
// with PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs.
// CHROMIUM_PATH can name a Chromium binary to use instead of Playwright's.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'dist/spa');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error(`No index.html in ${root}. Run the build first.`);
  process.exit(1);
}

// What the live server must contain for the site to work on Hostinger.
for (const f of ['.htaccess', 'sw.js', 'manifest.json']) {
  if (!fs.existsSync(path.join(root, f))) {
    console.error(`Missing ${f} in ${root}. The public/ folder must be in the repository.`);
    process.exit(1);
  }
}

const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

// A tiny static server that behaves like the .htaccess rules: real files as
// they are, missing /assets/ files 404, every other address gets index.html.
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(root, urlPath);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    if (urlPath.startsWith('/assets/') || urlPath.startsWith('/images/')) { res.writeHead(404).end(); return; }
    file = path.join(root, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const failures = [];

// Public pages, plus a protected one (must send a signed-out visitor to sign in).
const pages = ['/', '/signin', '/parent-portal', '/dashboard/admin'];

try {
  for (const p of pages) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Outside fonts etc. are not needed to prove the app starts.
    await page.route(u => !u.href.startsWith(base), r => r.abort());
    await page.goto(base + p, { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForFunction(() => {
        const el = document.getElementById('root');
        return el && el.innerText.trim().length > 20;
      }, null, { timeout: 20000 });
    } catch {
      errors.push('the page stayed blank');
    }
    await page.waitForTimeout(500);
    if (errors.length) failures.push(`${p}: ${errors.join(' | ')}`);
    else console.log(`ok  ${p}  ->  ${new URL(page.url()).pathname}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error('\nThe built site does not start:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\nSmoke test passed: the built site starts and shows its pages.');
