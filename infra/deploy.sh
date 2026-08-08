#!/usr/bin/env bash
#
# Runs ON THE VPS, invoked over SSH by .github/workflows/deploy.yml after the
# built artefact has been rsynced into place.
#
# Build output (apps/api/dist, apps/web/.next, packages/shared/dist) is produced
# in CI, so the VPS never has to compile — that matters on a small box.

set -euo pipefail

APP_ROOT=${APP_ROOT:-/var/www/poetree/app}
SCHEMA="$APP_ROOT/apps/api/prisma/schema.prisma"

cd "$APP_ROOT"

echo "==> Installing dependencies"
# --include=dev because the Prisma CLI, needed for migrations, is a dev dependency.
npm ci --include=dev --no-audit --no-fund

echo "==> Generating Prisma client"
npx prisma generate --schema "$SCHEMA"

echo "==> Applying database migrations"
# `migrate deploy` only applies committed migrations and never resets data.
npx prisma migrate deploy --schema "$SCHEMA"

echo "==> Reloading PM2"
if pm2 describe poetree-api >/dev/null 2>&1; then
  pm2 reload infra/ecosystem.config.cjs --update-env
else
  pm2 start infra/ecosystem.config.cjs
fi
pm2 save

echo "==> Waiting for the API to report healthy"
for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:4000/api/v1/health >/dev/null; then
    echo "API healthy after ${attempt} attempt(s)"
    exit 0
  fi
  sleep 3
done

echo "ERROR: API did not become healthy. Recent logs:" >&2
pm2 logs poetree-api --lines 50 --nostream >&2 || true
exit 1
