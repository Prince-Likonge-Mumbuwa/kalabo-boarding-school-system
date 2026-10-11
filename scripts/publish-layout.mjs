// Runs after `vite build`. Makes the built site work whichever folder the
// host publishes:
//
//   dist/spa/   the website (index.html, assets/, .htaccess, sw.js, ...)
//   dist/       the SAME website copied here as well, plus dist/server
//
// Hostinger copies the "output directory" into public_html. Earlier the
// output directory was `dist`, so the page landed in public_html/spa/ while
// it looks for its files at /assets/..., and the site stayed blank. With
// this copy, publishing either `dist` or `dist/spa` gives a working site,
// with no files to move by hand.
//
// The .htaccess in dist/ also blocks /server/, so the server code is never
// served to visitors (dist/server/.htaccess denies it as well).

import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const spa = path.join(dist, 'spa');

if (!fs.existsSync(path.join(spa, 'index.html'))) {
  console.error('publish-layout: dist/spa/index.html not found; run vite build first.');
  process.exit(1);
}

// Remove an earlier copy (keep spa/ and server/).
for (const name of fs.readdirSync(dist)) {
  if (name === 'spa' || name === 'server') continue;
  fs.rmSync(path.join(dist, name), { recursive: true, force: true });
}

// Copy the site into dist/.
for (const name of fs.readdirSync(spa)) {
  fs.cpSync(path.join(spa, name), path.join(dist, name), { recursive: true });
}

// dist/.htaccess: the normal rules, plus: never serve /server/.
const htaccess = path.join(dist, '.htaccess');
const rules = fs.readFileSync(htaccess, 'utf8');
const block = [
  '',
  '# --- The server code is not part of the website (present only when the whole dist folder is published)',
  '<IfModule mod_rewrite.c>',
  '  RewriteEngine On',
  '  RewriteRule ^server(/|$) - [F,L]',
  '</IfModule>',
  '',
].join('\n');
// Put the block first so it wins over the "every address loads index.html" rule.
fs.writeFileSync(htaccess, block + '\n' + rules);

console.log('publish-layout: site ready in dist/ and dist/spa/ (either can be published).');
