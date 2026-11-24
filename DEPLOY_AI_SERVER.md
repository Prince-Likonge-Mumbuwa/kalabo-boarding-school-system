# Putting the AI server online (Oracle Cloud, free)

This moves the AI server (and its ChromaDB search index) from your PC to a
free Oracle Cloud server, at **https://ai.kalaboboarding.com**, so teachers
can use the AI tools from the live website at any time, wherever they are.

The website itself stays where it is. Only the AI server moves.

```
Teacher's browser ──► www.kalaboboarding.com      (website, Hostinger, unchanged)
        │
        └──────────► ai.kalaboboarding.com        (the Oracle Cloud server)
                       Caddy: HTTPS certificate, passes requests on
                       AI server + ChromaDB: the same code as on your PC
                       ai-server/storage: curriculum, search index, eFiles, scans
                         │
                         └──► NVIDIA (free; later DeepInfra)
```

The same files also work on a paid Hostinger VPS: see
[Moving to Hostinger later](#moving-to-hostinger-later).

## What "free" means here, and its two catches

Oracle's **Always Free** plan includes an ARM server ("Ampere A1") of up to
**2 CPUs and 12 GB memory**, plus up to 200 GB of disk. That is more than the
AI server needs. Oracle asks for a bank card when you sign up, to check who
you are; the free plan does not charge it.

1. **Stay inside the free limits.** If the account has more Ampere A1 servers
   than the free allowance, Oracle switches them off and deletes them after
   30 days. Make **one** server of 2 CPUs / 12 GB and nothing else that costs
   money.
2. **Oracle may stop a server it thinks is idle.** On a free account, a server
   whose processor, network and memory stay mostly unused for 7 days can be
   stopped (Oracle emails first). Stopping is not deleting: the disk, the
   data and the IP address stay, and you start it again from the Oracle
   console (Step 8 shows how). Because of this:
   - Check **https://ai.kalaboboarding.com/api/health** now and then, and
     read Oracle's emails.
   - Copy a backup to the PC every week with `download-ai-backup.bat`.
   - When there is money, either upgrade the Oracle account to *Pay As You
     Go* (the free server stays free, and is no longer stopped for being
     idle; set a budget alert first) or move to Hostinger.

## The files, and what each one does

All in `ai-server/` unless noted.

| File | Where it runs | What it does |
| --- | --- | --- |
| `Dockerfile` | Server | Recipe for the AI server's container: Node 24 on Debian 13, the packages, the code. Starts ChromaDB and the server together. No secrets or data go into it. Works on ARM (Oracle) and ordinary x64 (Hostinger) servers. |
| `.dockerignore` | Server | Keeps `node_modules`, `.env` and `storage` out of the container recipe. |
| `deploy/docker-compose.yml` | Server | Runs two containers: **caddy** (HTTPS front door) and **ai** (the server). Connects `ai-server/storage` and `ai-server/.env` from the server's disk. |
| `deploy/Caddyfile` | Server | Caddy's settings: the address, free HTTPS from Let's Encrypt, upload size, and streaming documents straight through. |
| `deploy/setup-vps.sh` | Server, once | Installs Docker, opens the web ports in the firewall, downloads the code from GitHub, schedules backups and starts everything. |
| `deploy/update.sh` | Server, after each push | Downloads the newest code and restarts the AI server with it. |
| `deploy/backup.sh` | Server, every night 02:30 | Saves `storage` and `.env` to `/opt/catalyst-backups`, keeps 14 days. |
| `deploy/receive-storage.sh` | Server | Unpacks the data `upload-ai-storage.bat` sends. You never run it yourself. |
| `deploy/upload-ai-storage.bat` | Your PC, once | Copies your PC's `storage` and `.env` to the server. |
| `deploy/download-ai-backup.bat` | Your PC, weekly | Copies the server's newest nightly backup to `Documents\catalyst-backups`. |
| `package.json` → `start:prod` | Anywhere | The same start command the container uses: ChromaDB + server. |
| `DEPLOY_AI_SERVER.md` (project root) | — | This guide. |

On the server everything lives in **`/opt/catalyst`** (a copy of the GitHub
repository), the same layout as on your PC: `/opt/catalyst/ai-server/storage`,
`/opt/catalyst/ai-server/.env`, and so on.

## Before you start

1. **Push all your code.** The server downloads the code from GitHub, branch
   `mnakwebwa-contribution`. Run any push `.bat` files you have not run yet
   (for example `push-efile-system.bat`), then **`push-ai-hosting.bat`**, which
   pushes the files in the table above.
2. **Know where the domain's DNS is managed.** These steps assume
   `kalaboboarding.com`'s DNS is in Hostinger's hPanel.

## Step 1. Create the Oracle Cloud account

1. Go to **oracle.com/cloud/free** → *Start for free*.
2. Fill in your details and the card (for checking only).
3. **Home region: choose South Africa Central (Johannesburg).** It is the
   closest to Zambia, so pages respond faster than from Europe. The home
   region **cannot be changed later**, and free servers can only be made in it.
4. Wait for the "account is ready" email, then sign in to the **Oracle Cloud
   console**.

## Step 2. Create the server

Console → menu ☰ → **Compute → Instances → Create instance**.

1. **Name:** `catalyst-ai`.
2. **Image and shape → Edit:**
   - Image: **Canonical Ubuntu 24.04** (the normal one, not "Minimal").
   - Shape: **Ampere → VM.Standard.A1.Flex**, **2 OCPUs** and **12 GB**
     memory. It should show the *Always Free-eligible* label. Do not go higher.
3. **Networking:** let it create a new virtual cloud network and public
   subnet, and keep **Assign a public IPv4 address** on.
4. **Add SSH keys:** choose **Generate a key pair for me** and press
   **Save private key**. This file is the only way to sign in, so:
   - Move it to **`C:\Users\MOGE\.ssh\oracle-ai.key`** (make the `.ssh`
     folder if it is missing). The `.bat` files look for it there.
   - Never put it in the project folder or send it to anyone.
5. **Boot volume:** you can set the size to **100 GB** (free up to 200 GB in
   total).
6. Press **Create**. After a minute or two it says *Running*. Note the
   **Public IP address** on that page.

If it says **"Out of capacity"**, Oracle has no free ARM servers left in
Johannesburg at that moment. Try another *availability domain* if it offers
one, or try again later (early morning often works). Nothing is charged for
trying.

## Step 3. Open the web ports in Oracle's cloud firewall

Oracle has a firewall in front of the server too (the *security list*). It
allows only SSH until you add the web ports.

Console → the instance → **Subnet** link → **Security** (or *Security Lists*)
→ **Default Security List** → **Add Ingress Rules**, and add three rules:

| Source CIDR | IP Protocol | Destination port |
| --- | --- | --- |
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |
| `0.0.0.0/0` | UDP | `443` |

The firewall *inside* the server is opened by `setup-vps.sh` in Step 5.

## Step 4. Point ai.kalaboboarding.com at the server

hPanel → **Domains** → `kalaboboarding.com` → **DNS / Nameservers** →
**Add record**:

| Type | Name | Points to | TTL |
| --- | --- | --- | --- |
| A | `ai` | the server's public IP address | 300 |

It usually works within minutes; it can take up to a few hours. Check from
the PC in Command Prompt: `nslookup ai.kalaboboarding.com` should show the
server's IP.

## Step 5. Run the setup on the server

On your PC, open **Command Prompt** in the project folder. Copy the setup
script to the server, then sign in (replace `SERVER-IP`):

```
scp -i %USERPROFILE%\.ssh\oracle-ai.key ai-server\deploy\setup-vps.sh ubuntu@SERVER-IP:~
ssh -i %USERPROFILE%\.ssh\oracle-ai.key ubuntu@SERVER-IP
```

The first time, it asks *"Are you sure you want to continue connecting?"*:
type `yes`. If it refuses with **"UNPROTECTED PRIVATE KEY FILE"**, Windows
lets other accounts read the key; fix it once with:

```
icacls %USERPROFILE%\.ssh\oracle-ai.key /inheritance:r /grant:r "%USERNAME%:R"
```

You are now on the server (the prompt looks like `ubuntu@catalyst-ai:~$`).
Run the setup:

```
sudo bash setup-vps.sh
```

It stops three times to ask you something:

1. **A deploy key.** It prints a line starting `ssh-ed25519`. On GitHub open
   the repository → **Settings → Deploy keys → Add deploy key**, title
   `Catalyst AI server`, paste the line, leave *Allow write access* **off**,
   save, then press Enter on the server. The server can now read the code,
   but not change it.
2. **The repository address and branch.** The address is on GitHub under
   **Code → SSH**, like `git@github.com:mnakwebwa-creator/<repository>.git`.
   Branch: press Enter for `mnakwebwa-contribution`.
3. **The web address:** `ai.kalaboboarding.com`.

The first build takes several minutes. When it ends, both containers run.
The server will say the superAdmin and keys are missing: the next step
brings them from your PC. Type `exit` to leave the server.

## Step 6. Move your data from the PC

1. Close the AI server on your PC (the `npm run dev` window).
2. Double-click **`ai-server\deploy\upload-ai-storage.bat`**. Type the
   server's IP, and press Enter for the user name `ubuntu`. It finds the key
   file by itself.

It sends `ai-server\storage` (curriculum PDFs, search index, eFiles, scanned
scripts, the superAdmin account) and `ai-server\.env` (your keys), then
`receive-storage.sh` on the server sets `CLIENT_ORIGIN` to the live website
and restarts the AI server.

**From now on the server's copy is the real one.** Teachers' eFiles are saved
there. Do not run the PC's AI server for teachers any more, or the two copies
will drift apart. (You can still run it on the PC for development.)

## Step 7. Check it

Open **https://ai.kalaboboarding.com/api/health** in a browser. You should
see `{"ok":true,"superAdminCreated":true}` and a padlock (HTTPS).

On the server, `sudo docker compose -f /opt/catalyst/ai-server/deploy/docker-compose.yml logs ai`
shows the server's start-up summary, with a ✓ for Writing, Search and
ChromaDB.

## Step 8. Switch the website on

The live website shows the AI Tools only when it is built with
`VITE_AI_API_URL`. Add this setting where the live build gets its other
`VITE_FIREBASE_...` settings (Hostinger's environment variables for the site,
or the GitHub secrets if you use the GitHub Actions upload in `DEPLOY.md`):

```
VITE_AI_API_URL=https://ai.kalaboboarding.com
```

Then rebuild and publish the website as usual. Sign in as a teacher: the AI
Tools menu appears, and documents are written by the server.

## Day to day

To sign in to the server from the PC:
`ssh -i %USERPROFILE%\.ssh\oracle-ai.key ubuntu@SERVER-IP`. The commands
below start with `sudo` because the code and Docker belong to the server's
administrator (root).

| Job | How |
| --- | --- |
| Put new AI server code live | Push from the PC as usual, then on the server: `sudo bash /opt/catalyst/ai-server/deploy/update.sh` (do it when no one is generating) |
| See what the server is doing | `cd /opt/catalyst/ai-server/deploy && sudo docker compose logs -f ai` (Ctrl+C to stop watching) |
| Is it running? | `sudo docker compose ps` in the same folder: both `ai` and `caddy` should be "Up", `ai` "(healthy)" |
| Restart it | `sudo docker compose restart ai` |
| Change a key or setting | `sudo nano /opt/catalyst/ai-server/.env`, save, then `sudo docker compose up -d` |
| Create the superAdmin on the server (if you did not upload one) | `sudo docker compose exec ai node_modules/.bin/tsx scripts/create-superadmin.ts` |
| Backups | Every night at 02:30 into `/opt/catalyst-backups` (14 days). The log is `/var/log/catalyst-backup.log`. |
| Copy a backup to the PC (weekly) | Double-click `ai-server\deploy\download-ai-backup.bat`. It saves to `Documents\catalyst-backups`. |
| **Oracle stopped the server** | Oracle console → Compute → Instances → `catalyst-ai` → **Start**. Wait two minutes; Docker starts the AI server by itself. |

### Restoring a backup

On the server (for a backup already there):

```
cd /opt/catalyst/ai-server/deploy && sudo docker compose stop ai
sudo tar -xzf /opt/catalyst-backups/ai-storage-2026-11-20.tar.gz -C /opt/catalyst/ai-server
sudo docker compose start ai
```

To put a PC copy back (for example onto a new server): copy it up with
`scp -i %USERPROFILE%\.ssh\oracle-ai.key <file> ubuntu@SERVER-IP:/tmp/ai-storage.tar.gz`,
then on the server `sudo bash /opt/catalyst/ai-server/deploy/receive-storage.sh /tmp/ai-storage.tar.gz`.

## If something goes wrong

| What you see | Likely cause | What to do |
| --- | --- | --- |
| The address does not open at all (times out) | The web ports are not open in Oracle's security list | Do Step 3 again; check all three rules are there |
| No padlock / "connection not secure" | DNS not pointing at the server yet, so Caddy could not get the certificate | Check `nslookup ai.kalaboboarding.com`, wait, then `sudo docker compose restart caddy` |
| 502 Bad Gateway | The AI server stopped | `sudo docker compose logs ai` shows why; `sudo docker compose up -d` starts it |
| The website says the AI server cannot be reached / CORS error in the browser console | `CLIENT_ORIGIN` does not list the website's exact address | Edit `.env` (both `https://www.kalaboboarding.com` and `https://kalaboboarding.com`), then `sudo docker compose up -d` |
| "ChromaDB ✗" in the logs | The search index did not start | `sudo docker compose restart ai`; if it repeats, restore last night's backup |
| `ssh` says "Permission denied (publickey)" | Wrong user or key file | User is `ubuntu` (not root); the key is `%USERPROFILE%\.ssh\oracle-ai.key` |
| Everything stopped and Oracle sent an "idle" email | Oracle stopped the free server | Start it in the console (see *Day to day*) |
| `update.sh` says "Not possible to fast-forward" | Someone changed files on the server by hand | `cd /opt/catalyst && sudo git status` shows them; `sudo git checkout -- <file>` undoes them |

## Moving to Hostinger later

Everything above also works on a Hostinger VPS (KVM 2, Ubuntu 24.04 or
26.04), with these differences:

- You sign in as **`root`** with the root password, so leave out `-i …` and
  `sudo`, and type `root` when the `.bat` files ask for the user name.
- There is no Step 3: `setup-vps.sh` sees it is not on Oracle and opens the
  ports with `ufw` itself.
- Hostinger also keeps its own weekly backup of the whole VPS (hPanel → VPS →
  Backups), and does not stop idle servers.

To move: download a backup from Oracle with `download-ai-backup.bat`, set up
the Hostinger VPS (Steps 4–5), put the backup on it as in *Restoring a
backup*, then change the DNS `ai` record to the new IP.

## Using DeepInfra for the AI models

The AI server can write (and search) through DeepInfra, a paid host for the
same Nemotron models, with NVIDIA's free service as the backup. Do this on
the PC first, then copy the same lines to the server.

1. Create an account at deepinfra.com, add a card or prepay a small amount
   (and set a spending limit), then make an API key (Dashboard → API keys).
2. Add to `ai-server/.env` (see `.env.example` for all the DeepInfra lines):

   ```
   DEEPINFRA_API_KEY=your-key
   WRITER_HOSTS=deepinfra,nvidia
   SEARCH_HOSTS=nvidia
   ```

3. Start the AI server (`npm run dev`), then double-click
   **`check-deepinfra.bat`**. It writes a short test answer on DeepInfra,
   compares DeepInfra's search vectors with NVIDIA's and with your index,
   and tells you what `SEARCH_HOSTS` should be.
4. Restart the AI server. Its start-up summary shows the order, for example
   `Writing  DeepInfra (nvidia/NVIDIA-Nemotron-3-Super-120B-A12B) → NVIDIA (…)`.
5. On the server: `sudo nano /opt/catalyst/ai-server/.env`, add the same lines, then
   `sudo docker compose up -d` in `/opt/catalyst/ai-server/deploy`.

How it behaves:

- **Writing**: DeepInfra writes. If it fails before writing anything (busy,
  out of credit, down), NVIDIA writes the document instead, and DeepInfra is
  tried last for the next 2 minutes.
- **Search**: the same, for searches. Indexing new curriculum documents always
  uses the first search host, so the index never mixes the two.
- **If search fails on every host**, the document is still written from the
  syllabus and teaching module, and the teacher sees a note saying so.
- **Pictures** (diagram suggestions) stay on NVIDIA.

## What stays the same, and what comes next

- Without a DeepInfra key the AI uses NVIDIA's free service, as on the PC.
- ChromaDB listens only inside the container. Only Caddy's ports 80 and 443
  (and SSH, 22) are open on the server.
