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

# --- Dependencies -----------------------------------------------------------
#
# `npm ci` deletes node_modules before rebuilding it, and the old process is
# still serving requests while that happens. Anything the running app loads
# lazily then fails to resolve: body-parser reaches for iconv-lite's encodings
# on the first request body it parses, so every LOGIN returned a 500 for the
# length of the install. It cleared itself on reload, which is exactly why it
# went unnoticed — nothing was broken by the time anyone looked.
#
# So: only reinstall when the lockfile actually changed, and when it has,
# take the app down deliberately rather than serving errors from a half-deleted
# node_modules. A short, honest outage beats a window of 500s that look like
# application bugs to whoever hits them.
# The stamp lives OUTSIDE the app root on purpose: the deploy rsyncs with
# --delete, so anything under $APP_ROOT that is not in the repository is wiped
# on every release. Kept here it would vanish each time and every deploy would
# reinstall — the exact thing this is meant to avoid.
STATE_DIR=/var/lib/poetree-preschool
mkdir -p "$STATE_DIR"
LOCK_STAMP="$STATE_DIR/deps-lock-hash"

CURRENT_LOCK=$(sha256sum "$APP_ROOT/package-lock.json" | cut -d' ' -f1)
PREVIOUS_LOCK=$(cat "$LOCK_STAMP" 2>/dev/null || echo "none")

OURS=(poetree-preschool-api poetree-preschool-web)

# Declared before the branch: the PM2 step at the end reads it either way, and
# `set -u` aborts on an unset variable.
STOPPED=""

if [[ "$CURRENT_LOCK" == "$PREVIOUS_LOCK" && -d "$APP_ROOT/node_modules" ]]; then
  echo "==> Dependencies unchanged — skipping install, no downtime"
else
  echo "==> Dependencies changed — stopping the app before reinstalling"

  # By name, one at a time, and only ours. `pm2 stop` on a name PM2 does not
  # know is an error, and `set -e` would abort the deploy over a process that
  # was simply not running yet.
  for app in "${OURS[@]}"; do
    if pm2 describe "$app" >/dev/null 2>&1; then
      pm2 stop "$app" >/dev/null
      STOPPED="$STOPPED $app"
    fi
  done

  if [[ -n "$STOPPED" ]]; then
    echo "    stopped:$STOPPED"
  else
    echo "    nothing was running yet"
  fi

  # --include=dev because the Prisma CLI, needed for migrations, is a dev dependency.
  npm ci --include=dev --no-audit --no-fund

  # Written only after a successful install. If npm ci fails, the stamp keeps
  # its old value and the next deploy reinstalls rather than trusting a
  # half-built node_modules.
  printf '%s' "$CURRENT_LOCK" > "$LOCK_STAMP"

  # Deliberately NOT restarted here. `npm ci` has just deleted the generated
  # Prisma client along with the rest of node_modules, and `prisma generate`
  # does not run until below — starting now means the app boots against a
  # client that does not exist yet, crashes with "@prisma/client did not
  # initialize", and crash-loops until the reload at the end rescues it.
  #
  # It stays down until generate and migrate have run, and the PM2 step below
  # brings it back. Longer stopped, but stopped once and on purpose, rather
  # than up and failing.
fi

echo "==> Generating Prisma client"
npx prisma generate --schema "$SCHEMA"

echo "==> Applying database migrations"
# Run from apps/api so Prisma picks up apps/api/.env — from the monorepo root it
# looks for a root .env, finds none, and dies with "Environment variable not found:
# DATABASE_URL" even though the API itself is configured correctly.
# `migrate deploy` only applies committed migrations and never resets data.
( cd "$APP_ROOT/apps/api" && npx prisma migrate deploy --schema prisma/schema.prisma )

echo "==> Bringing the app up (only the apps named in our ecosystem file)"
if [[ -n "$STOPPED" ]]; then
  # We stopped these ourselves above and left them down through generate and
  # migrate. Start them by name — `reload` on a stopped process is not a
  # documented way to start one, and the whole point of this path is that the
  # app comes back exactly once.
  for app in $STOPPED; do
    pm2 start "$app" >/dev/null
    echo "    started $app"
  done
elif pm2 describe poetree-preschool-api >/dev/null 2>&1; then
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
