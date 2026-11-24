#!/usr/bin/env bash
# Nightly backup of everything the AI server saves (setup-vps.sh schedules it
# at 02:30). Keeps the last 14 days in /opt/catalyst-backups.
#
# The AI server is paused for the few seconds the copy takes, so the search
# index (a SQLite database) is copied in a consistent state.
# To restore a day: stop the server, unpack the file over ai-server/, start:
#   cd /opt/catalyst/ai-server/deploy && docker compose stop ai
#   tar -xzf /opt/catalyst-backups/ai-storage-2026-11-20.tar.gz -C /opt/catalyst/ai-server
#   docker compose start ai
set -euo pipefail
DEPLOY="$(cd "$(dirname "$0")" && pwd)"
AI_DIR="$(dirname "$DEPLOY")"
DEST=/opt/catalyst-backups
STAMP=$(date +%F)
mkdir -p "$DEST"
chmod 700 "$DEST"

cd "$DEPLOY"
docker compose stop ai
trap 'docker compose start ai' EXIT     # start again even if the copy fails
tar -czf "$DEST/ai-storage-$STAMP.tar.gz" -C "$AI_DIR" storage .env
echo "$(date '+%F %T') saved $DEST/ai-storage-$STAMP.tar.gz ($(du -h "$DEST/ai-storage-$STAMP.tar.gz" | cut -f1))"

find "$DEST" -name 'ai-storage-*.tar.gz' -mtime +14 -delete
