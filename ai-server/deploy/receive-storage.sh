#!/usr/bin/env bash
# Unpacks the AI server's data and settings sent from the PC, then restarts it.
#
# You don't run this yourself: upload-ai-storage.bat (on the PC) sends the
# packed file to the server and then runs this script there with sudo.
#
#   sudo bash /opt/catalyst/ai-server/deploy/receive-storage.sh /tmp/ai-storage.tar.gz
#
# What it does:
#   1. Pauses the AI server, so nothing writes to storage while it is replaced.
#   2. Unpacks storage/ and .env into /opt/catalyst/ai-server.
#   3. Makes .env readable by root only (it holds the API keys).
#   4. Sets CLIENT_ORIGIN to the live website's two addresses.
#   5. Starts the AI server again and shows that it is running.
set -euo pipefail

PACK=${1:-/tmp/ai-storage.tar.gz}
AI_DIR=/opt/catalyst/ai-server

if [ "$(id -u)" -ne 0 ]; then echo "Run this with sudo."; exit 1; fi
if [ ! -f "$PACK" ]; then echo "$PACK was not found. Nothing was changed."; exit 1; fi

cd "$AI_DIR/deploy"
docker compose stop ai || true
tar -xzf "$PACK" -C "$AI_DIR"
rm -f "$PACK"
chmod 600 "$AI_DIR/.env"
sed -i 's#^CLIENT_ORIGIN=.*#CLIENT_ORIGIN=https://www.kalaboboarding.com,https://kalaboboarding.com#' "$AI_DIR/.env"
docker compose up -d
docker compose ps
