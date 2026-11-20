# The AI server and its ChromaDB search index, in one container.
#
# Built on the VPS by deploy/docker-compose.yml (see DEPLOY_AI_SERVER.md in the
# project root). Nothing secret goes into the image: the .env file and the
# storage folder stay on the server's disk and are mounted when it runs.
#
#   /app            this ai-server folder (code only)
#   /app/storage    mounted from the VPS: curriculum PDFs, ChromaDB, eFiles, settings
#   /app/geo        mounted from the VPS: the website's map data (public/geo)

# Node 24 on Debian 13 "trixie". It must be trixie (or newer): ChromaDB's
# Linux server needs glibc 2.39 or newer, and Debian 12 "bookworm" only has
# 2.36, so ChromaDB would not start there. The same image works on ordinary
# (x64) servers like Hostinger and on ARM servers like Oracle Cloud's free
# Ampere A1: Docker picks the right one, and package-lock.json lists the
# ChromaDB, sharp and canvas builds for both.
FROM node:24-trixie-slim

WORKDIR /app

# Install the packages first, so a code-only change does not reinstall them.
# Dev packages are included: tsx runs the TypeScript and concurrently runs
# ChromaDB beside the server.
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production \
    PORT=5050 \
    CHROMA_URL=http://127.0.0.1:8100 \
    DATA_DIR=/app/storage \
    GEO_DIR=/app/geo

EXPOSE 5050

# Docker marks the container unhealthy if the server stops answering.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5050/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# ChromaDB (listening only inside the container, on 127.0.0.1:8100) and the
# AI server. If either stops, both stop, and Docker starts the container again.
CMD ["node_modules/.bin/concurrently", "--kill-others", "--names", "chroma,server", "--prefix-colors", "magenta,cyan", "node scripts/start-chroma.mjs", "node_modules/.bin/tsx src/index.ts"]
