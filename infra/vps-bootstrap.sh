#!/usr/bin/env bash
#
# Prepare the SHARED Hostinger VPS for the Poetree preschool platform.
#
# This box is not ours alone. At the time of writing it runs:
#   plumber-crm            72.62.227.2            ports 3000 + 5000
#   Poetree Publications   poetreepublications.com / api.*   port 4000
#   poetree-portal         store.poetreepublications.com     ports 3100 + 4100
# plus MySQL (poetree_db, poetree_portal, nexus_publication) and MongoDB.
#
# Every step below is additive and scoped. This script deliberately does NOT:
#   - install or upgrade system Node        (other apps run on /usr/bin/node v20)
#   - apt install nginx or mysql-server     (both already present and serving)
#   - change MySQL bind-address             (would cut off remote clients)
#   - enable ufw                            (would close ports in use)
#   - run `pm2 startup`                     (changes boot behaviour for everyone)
#
# Run as root, once. Re-running is safe.
#
#   export DB_PASSWORD='...'
#   sudo -E bash infra/vps-bootstrap.sh

set -euo pipefail

APP_ROOT=/var/www/poetree-preschool
LOG_DIR=/var/log/poetree-preschool
NVM_DIR=/opt/nvm
NODE_VERSION=22
NODE_LINK=/opt/nodejs/current
DB_NAME=poetree_preschool
DB_USER=poetree_preschool

if [[ -z "${DB_PASSWORD:-}" ]]; then
  echo "ERROR: DB_PASSWORD is not set. Export it before running this script." >&2
  exit 1
fi

echo "==> Pre-flight: confirming we will not collide with anything running"
for port in 3200 4200; do
  if ss -tln | grep -qE ":${port}\b"; then
    echo "ERROR: port ${port} is already in use. Aborting rather than fighting for it." >&2
    ss -tlnp | grep -E ":${port}\b" >&2
    exit 1
  fi
done
echo "    ports 3200 and 4200 are free"

SYSTEM_NODE_BEFORE=$(/usr/bin/node -v 2>/dev/null || echo none)
echo "    system node is ${SYSTEM_NODE_BEFORE} and will not be touched"

echo "==> Installing Node ${NODE_VERSION} into ${NVM_DIR} (off the default PATH)"
# Deliberately NOT sourced into /root/.bashrc. `poetree-portal-api` runs with a
# bare `node` interpreter, so adding Node 22 to root's PATH would silently move
# that project onto a different runtime. Our PM2 apps use an absolute path.
if [[ ! -d "$NVM_DIR" ]]; then
  mkdir -p "$NVM_DIR"
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh \
    | NVM_DIR="$NVM_DIR" PROFILE=/dev/null bash
fi

export NVM_DIR
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm install "$NODE_VERSION" >/dev/null
INSTALLED=$(nvm version "$NODE_VERSION")
echo "    installed ${INSTALLED}"

# Stable path for PM2, so the ecosystem config never names a point release.
mkdir -p "$(dirname "$NODE_LINK")"
ln -sfn "${NVM_DIR}/versions/node/${INSTALLED}" "$NODE_LINK"
echo "    ${NODE_LINK}/bin/node -> $("${NODE_LINK}/bin/node" -v)"

SYSTEM_NODE_AFTER=$(/usr/bin/node -v 2>/dev/null || echo none)
if [[ "$SYSTEM_NODE_BEFORE" != "$SYSTEM_NODE_AFTER" ]]; then
  echo "ERROR: system node changed from ${SYSTEM_NODE_BEFORE} to ${SYSTEM_NODE_AFTER}." >&2
  echo "       That would affect the other projects. Investigate before continuing." >&2
  exit 1
fi
echo "    verified: system node still ${SYSTEM_NODE_AFTER}"

echo "==> Creating application directories"
mkdir -p "$APP_ROOT" "$LOG_DIR"

echo "==> Creating the ${DB_NAME} database and a user scoped to it alone"
# GRANT is on this database only — the existing poetree_db, poetree_portal and
# nexus_publication schemas stay out of reach of this user.
mysql <<SQL
CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
echo "    ${DB_NAME} ready; grants limited to that schema"

echo
echo "Prepare complete. Nothing belonging to another project was modified."
echo
echo "Still to do, by hand:"
echo "  1. Point an A record for school.poetreepublications.com at this server"
echo "  2. Write ${APP_ROOT}/apps/api/.env       (DATABASE_URL, JWT secrets)"
echo "  3. Write ${APP_ROOT}/apps/web/.env.local (API_BASE_URL, COOKIE_SECURE=1)"
echo "  4. Install infra/nginx/poetree-preschool.conf, then run certbot"
echo "  5. Add the CI deploy key to ~/.ssh/authorized_keys"
echo
echo "Deliberately NOT done (would affect the other projects — decide separately):"
echo "  - MySQL still listens on 0.0.0.0:3306 with ufw inactive"
echo "  - PM2 has no systemd unit, so nothing restarts after a reboot"
