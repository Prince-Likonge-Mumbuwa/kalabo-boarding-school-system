#!/usr/bin/env bash
# Puts the newest code from GitHub live on the server.
# Run on the server after pushing from the PC (sudo: the code and Docker belong to root):
#   sudo bash /opt/catalyst/ai-server/deploy/update.sh
#
# 1. Downloads the newest code of the branch the VPS runs.
# 2. Rebuilds the AI server's container (packages are reinstalled only if
#    package.json changed) and restarts it. Saved data is not touched.
# A document being written at that moment is lost, so update when it is quiet.
set -euo pipefail
cd "$(dirname "$0")/../.."     # /opt/catalyst
git pull --ff-only
cd ai-server/deploy
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps
