# Publishing the website (Hostinger)

## The build works with either output folder

`pnpm build` puts the finished website in **both** places:

- `dist/spa/`
- `dist/` itself, beside `dist/server`

So Hostinger's *output directory* can be `dist` or `dist/spa`; either gives a
working site with nothing to move by hand. (Earlier, publishing `dist` put
the site in `public_html/spa/` while the page looked for its files in
`/assets/`, and the site stayed blank.) When `dist` is published, the server
code in `/server/` is blocked from the web.

That is enough if you keep Hostinger's own GitHub deploy. The automatic
upload below is an alternative that also runs the tests and a browser check
before anything goes live.

## Automatic upload with GitHub Actions (optional)

Every push to the **main** branch publishes the site automatically through
GitHub Actions (`.github/workflows/deploy.yml`):

1. Install and run the tests.
2. Build the site into `dist/spa`.
3. **Smoke test.** Open the built site in a real browser. Stop if any page
   crashes or stays blank.
4. Upload the **contents** of `dist/spa` into `public_html` by FTP.
   - Only changed files are sent.
   - Files from older versions are removed.

If any step fails, nothing is uploaded and the live site stays as it was.
Progress and errors are on GitHub → **Actions**. To publish again without a
new push, use **Actions → Deploy to Hostinger → Run workflow**.

Browser tabs left open across an update reload themselves once to pick up the
new version (see `index.html`). The service worker always fetches pages from
the network, so visitors get new versions straight away.

## One-time setup

### 1. GitHub secrets

Go to GitHub → the repository → **Settings → Secrets and variables →
Actions → New repository secret**.

| Secret | Value |
|---|---|
| `VITE_FIREBASE_API_KEY` | the same as in your local `.env` |
| `VITE_FIREBASE_AUTH_DOMAIN` | 〃 |
| `VITE_FIREBASE_PROJECT_ID` | 〃 |
| `VITE_FIREBASE_STORAGE_BUCKET` | 〃 |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | 〃 |
| `VITE_FIREBASE_APP_ID` | 〃 |
| `VITE_SMS_API_URL` | 〃 (only if you use SMS) |
| `FTP_SERVER` | hPanel → **Files → FTP Accounts**: *FTP IP* (or hostname) |
| `FTP_USERNAME` | the FTP username shown there (e.g. `u123456789` or `u123456789.yourdomain.com`) |
| `FTP_PASSWORD` | that account's FTP password (use *Change FTP password* if you don't know it) |

Optional repository **variables** (same page, *Variables* tab):

- `FTP_SERVER_DIR`: the folder to upload into, as seen after logging in with
  that FTP account. The default is `public_html/`. Use `/` if the account
  opens straight inside `public_html`. Always end it with `/`.
- `FTP_PROTOCOL`: set it to `ftp` only if the encrypted upload cannot
  connect.

### 2. Hostinger

- If hPanel → **Advanced → Git** (or a GitHub connection under Websites) is
  set up for this site, remove it. Otherwise Hostinger also copies or builds
  files into `public_html` and fights with this upload.
- Clean `public_html` once:
  - delete the old `spa` and `server` folders;
  - delete everything else that came from earlier uploads (`assets`,
    `index.html`, `.htaccess`, …). The first run puts fresh copies back.
  - Leave `.well-known` if it exists.

### 3. Push to main

Merge your work branch into `main`, for example with a pull request on
GitHub, or push to `main`. The site is live a few minutes later.

## Checking before you push

```
pnpm test
pnpm build:client
node scripts/smoke-test.mjs
```

The smoke test needs Playwright on your PC. Set it up once with
`pnpm add -D playwright` and then `npx playwright install chromium`. The
deploy does the smoke test anyway, so this is optional.
