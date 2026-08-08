#!/usr/bin/env bash
#
# Runs ON THE VPS, invoked over SSH by .github/workflows/deploy.yml after the
# built artefact has been rsynced into place.
#
# This box is shared with plumber-crm, poetreepublications.com and
# poetree-portal. Every command below is scoped to our app root and our two PM2
# processes — nothing here reads or writes another project's files, and PM2 is
# always addressed through our own ecosystem file so it cannot touch theirs.
#
# Build output (apps/api/dist, apps/web/.next, packages/shared/dist) is produced
# in CI, so this 2-core box never has to compile.

set -euo pipefail

APP_ROOT=${APP_ROOT:-/var/www/poetree-preschool}
SCHEMA="$APP_ROOT/apps/api/prisma/schema.prisma"
NODE_BIN=/opt/nodejs/current/bin

if [[ ! -x "$NODE_BIN/node" ]]; then
  echo "ERROR: Node 22 not found at $NODE_BIN/node. Run infra/vps-bootstrap.sh first." >&2
  exit 1
fi

# Put OUR Node first for this script only. This is a subshell environment; it
# does not alter root's PATH, so the other projects' bare `node` interpreter
# keeps resolving to /usr/bin/node v20.
export PATH="$NODE_BIN:$PATH"

echo "==> Using $(node -v) from $NODE_BIN (system node is $(/usr/bin/node -v))"

cd "$APP_ROOT"

echo "==> Installing dependencies"
# --include=dev because the Prisma CLI, needed for migrations, is a dev dependency.
npm ci --include=dev --no-audit --no-fund

echo "==> Generating Prisma client"
npx prisma generate --schema "$SCHEMA"

echo "==> Applying database migrations"
# `migrate deploy` only applies committed migrations and never resets data.
npx prisma migrate deploy --schema "$SCHEMA"

echo "==> Reloading PM2 (only the apps named in our ecosystem file)"
if pm2 describe poetree-preschool-api >/dev/null 2>&1; then
  pm2 reload infra/ecosystem.config.cjs --update-env
else
  pm2 start infra/ecosystem.config.cjs
fi
pm2 save

echo "==> Waiting for the API to report healthy"
for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:4200/api/v1/health >/dev/null; then
    echo "API healthy after ${attempt} attempt(s)"
    pm2 describe poetree-preschool-api | grep -E 'status|restarts' || true
    exit 0
  fi
  sleep 3
done

echo "ERROR: API did not become healthy. Recent logs:" >&2
pm2 logs poetree-preschool-api --lines 50 --nostream >&2 || true
exit 1
