#!/usr/bin/env bash
# One-time setup of the AI server on a fresh Ubuntu server (26.04 or 24.04):
# Oracle Cloud's free Ampere A1 (ARM) server, or a Hostinger VPS.
#
# Run it with sudo on the server (the guide shows how to get it there):
#   sudo bash setup-vps.sh
#
# What it does, in order (safe to run again; finished steps are skipped):
#   1. Sets the clock to Zambian time and installs git, Docker and a firewall.
#   2. Opens only SSH (22) and web (80, 443) in the firewall. On Oracle it
#      adds them to Oracle's own firewall rules; elsewhere it uses ufw.
#   3. Makes an SSH key so the VPS can read the code from GitHub, and waits
#      while you add it to the repository as a read-only "deploy key".
#   4. Downloads the code to /opt/catalyst.
#   5. Asks for the AI server's web address and saves it in deploy/.env.
#   6. Creates ai-server/.env from the example if it is missing (you fill it in).
#   7. Schedules the nightly backup (02:30) and starts everything.
set -euo pipefail

APP_DIR=/opt/catalyst
AI_DIR=$APP_DIR/ai-server
say() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then echo "Run this as root (or with sudo)."; exit 1; fi

say "1. Time zone, git, Docker and firewall"
timedatectl set-timezone Africa/Lusaka || true
apt-get update -y
apt-get install -y git curl ca-certificates openssh-client
if ! command -v docker >/dev/null 2>&1; then
  # Docker's official install script (adds the docker and docker compose commands).
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

say "2. Firewall: allow SSH, HTTP and HTTPS only"
RULES=/etc/iptables/rules.v4
if [ -f "$RULES" ] && grep -q -- "-A INPUT -j REJECT" "$RULES"; then
  # Oracle Cloud's Ubuntu: its firewall rules (iptables, saved in rules.v4)
  # already allow only SSH and reject everything else. Oracle says not to use
  # ufw there, so add web ports just above the "reject everything" rule, both
  # now and in the saved file that is loaded at every start-up.
  # (Oracle's cloud firewall, the "security list", must allow 80 and 443 too;
  # the guide shows where.)
  for P in "tcp 80" "tcp 443" "udp 443"; do
    set -- $P
    LINE="-A INPUT -p $1 -m state --state NEW -m $1 --dport $2 -j ACCEPT"
    if ! grep -q -- "$LINE" "$RULES"; then
      sed -i "0,/^-A INPUT -j REJECT/s##$LINE\n&#" "$RULES"
    fi
    if ! iptables -C INPUT -p "$1" -m state --state NEW -m "$1" --dport "$2" -j ACCEPT 2>/dev/null; then
      AT=$(iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')
      iptables -I INPUT "${AT:-1}" -p "$1" -m state --state NEW -m "$1" --dport "$2" -j ACCEPT
    fi
  done
  echo "Opened 80 and 443 in Oracle's firewall rules ($RULES)."
else
  apt-get install -y ufw
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 443/udp
  ufw --force enable
fi

say "3. Access to the code on GitHub"
KEY=/root/.ssh/catalyst_deploy
if [ ! -f "$KEY" ]; then
  mkdir -p /root/.ssh && chmod 700 /root/.ssh
  ssh-keygen -t ed25519 -N "" -C "catalyst-ai-vps" -f "$KEY" >/dev/null
fi
# Use this key for github.com, and trust GitHub's server key.
if ! grep -q "catalyst_deploy" /root/.ssh/config 2>/dev/null; then
  printf 'Host github.com\n  IdentityFile %s\n  IdentitiesOnly yes\n' "$KEY" >> /root/.ssh/config
fi
ssh-keyscan -t ed25519 github.com >> /root/.ssh/known_hosts 2>/dev/null
if [ ! -d "$APP_DIR/.git" ]; then
  echo
  echo "Add this key on GitHub: the repository -> Settings -> Deploy keys -> Add deploy key"
  echo "(title: Catalyst AI VPS, leave 'Allow write access' OFF):"
  echo
  cat "$KEY.pub"
  echo
  read -r -p "Press Enter once the key is added... " _
fi

say "4. Download the code to $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  read -r -p "Repository SSH address (e.g. git@github.com:mnakwebwa-creator/kalabo-boarding-school.git): " REPO
  read -r -p "Branch to run [mnakwebwa-contribution]: " BRANCH
  BRANCH=${BRANCH:-mnakwebwa-contribution}
  git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
else
  echo "Already there; to get the newest code later, run deploy/update.sh."
fi
# The scripts are made runnable below; tell git not to count that as a change.
git -C "$APP_DIR" config core.fileMode false
mkdir -p "$AI_DIR/storage"

say "5. The AI server's web address"
if [ ! -f "$AI_DIR/deploy/.env" ]; then
  read -r -p "Address (e.g. ai.kalaboboarding.com): " DOMAIN
  echo "AI_DOMAIN=$DOMAIN" > "$AI_DIR/deploy/.env"
fi
cat "$AI_DIR/deploy/.env"

say "6. Settings and keys (ai-server/.env)"
if [ ! -f "$AI_DIR/.env" ]; then
  cp "$AI_DIR/.env.example" "$AI_DIR/.env"
  chmod 600 "$AI_DIR/.env"
  echo "Created $AI_DIR/.env from the example."
  echo "Either upload your PC's ai-server/.env over it (upload-ai-storage.bat does this),"
  echo "or edit it now with:  nano $AI_DIR/.env"
  echo "Set CLIENT_ORIGIN=https://www.kalaboboarding.com,https://kalaboboarding.com"
fi

say "7. Nightly backup and start"
chmod +x "$AI_DIR/deploy/"*.sh
CRON="30 2 * * * $AI_DIR/deploy/backup.sh >> /var/log/catalyst-backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v "deploy/backup.sh" ; echo "$CRON" ) | crontab -
cd "$AI_DIR/deploy"
docker compose up -d --build

say "Done"
echo "Check:  docker compose -f $AI_DIR/deploy/docker-compose.yml ps"
echo "Logs:   docker compose -f $AI_DIR/deploy/docker-compose.yml logs -f ai"
echo "Then open https://$(sed -n 's/^AI_DOMAIN=//p' "$AI_DIR/deploy/.env")/api/health in a browser."
