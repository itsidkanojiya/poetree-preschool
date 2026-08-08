#!/usr/bin/env bash
#
# One-time provisioning for the Hostinger VPS (Ubuntu 22.04/24.04).
# Run as root, once. Re-running is safe — every step is idempotent.
#
#   export DB_PROD_PASSWORD='...'
#   export DB_DEV_PASSWORD='...'
#   sudo -E bash infra/vps-bootstrap.sh
#
# This script never contains credentials. It reads them from the environment so
# nothing sensitive is committed.

set -euo pipefail

APP_ROOT=/var/www/poetree/app
LOG_DIR=/var/log/poetree
NODE_MAJOR=22

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "ERROR: $name is not set. Export it before running this script." >&2
    exit 1
  fi
}

require_env DB_PROD_PASSWORD
require_env DB_DEV_PASSWORD

echo "==> Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg git rsync ufw nginx mysql-server \
  certbot python3-certbot-nginx

echo "==> Installing Node.js ${NODE_MAJOR}"
if ! command -v node >/dev/null || [[ "$(node -v)" != v${NODE_MAJOR}* ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

echo "==> Installing PM2"
npm install -g pm2@latest
pm2 startup systemd -u root --hp /root >/dev/null

echo "==> Hardening MySQL to localhost only"
# The database must never be reachable from the internet. Developers reach the
# dev database through an SSH tunnel instead.
cat >/etc/mysql/mysql.conf.d/99-poetree.cnf <<'EOF'
[mysqld]
bind-address = 127.0.0.1
EOF
systemctl restart mysql

echo "==> Creating databases and least-privilege users"
mysql <<SQL
CREATE DATABASE IF NOT EXISTS poetree_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS poetree_dev  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'poetree_prod'@'127.0.0.1' IDENTIFIED BY '${DB_PROD_PASSWORD}';
CREATE USER IF NOT EXISTS 'poetree_dev'@'127.0.0.1'  IDENTIFIED BY '${DB_DEV_PASSWORD}';

ALTER USER 'poetree_prod'@'127.0.0.1' IDENTIFIED BY '${DB_PROD_PASSWORD}';
ALTER USER 'poetree_dev'@'127.0.0.1'  IDENTIFIED BY '${DB_DEV_PASSWORD}';

GRANT ALL PRIVILEGES ON poetree_prod.* TO 'poetree_prod'@'127.0.0.1';
GRANT ALL PRIVILEGES ON poetree_dev.*  TO 'poetree_dev'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

echo "==> Creating application directories"
mkdir -p "$APP_ROOT" "$LOG_DIR"

echo "==> Configuring the firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status verbose

echo
echo "Bootstrap complete."
echo
echo "Still to do, by hand:"
echo "  1. Write $APP_ROOT/apps/api/.env      (DATABASE_URL, JWT secrets, CORS_ORIGINS)"
echo "  2. Write $APP_ROOT/apps/web/.env.local (API_BASE_URL, COOKIE_SECURE=1)"
echo "  3. Install the Nginx site from infra/nginx/poetree.conf and run certbot"
echo "  4. Add the CI deploy key to /root/.ssh/authorized_keys"
echo "  5. Disable password SSH login: PasswordAuthentication no in /etc/ssh/sshd_config"
