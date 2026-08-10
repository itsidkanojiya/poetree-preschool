#!/usr/bin/env bash
#
# Make PM2 survive a reboot.
#
# Right now nothing on this box restarts after a reboot: PM2 has no systemd
# unit, so every project on it — ours and the three others — stays down until
# somebody logs in and runs `pm2 resurrect` by hand.
#
# This is deliberately NOT part of vps-bootstrap.sh. That script is scoped to
# our own app and is safe to run unattended; this one changes boot behaviour for
# every project sharing the box, which is somebody's decision to make and not a
# side effect of deploying a preschool platform.
#
# What it does:
#   1. Installs a systemd unit that starts PM2 as root at boot.
#   2. Saves the CURRENT process list as the one to resurrect.
#
# Step 2 is the part that deserves attention. `pm2 save` snapshots every process
# PM2 is currently running, not just ours, so whatever is in the list below is
# what will come back after a reboot. If one of the other projects is stopped
# right now because someone stopped it on purpose, it will stay stopped; if one
# is running a stale build, that stale build is what returns.
#
# Read the list. Then run it again with --confirm.
#
#   bash infra/pm2-systemd.sh            # shows what would be saved
#   bash infra/pm2-systemd.sh --confirm  # does it

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run this as root — the unit is installed for root's PM2 daemon." >&2
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 is not on PATH for this user. Nothing to do." >&2
  exit 1
fi

echo "==> Processes PM2 would resurrect after a reboot"
echo
pm2 list
echo

if [[ "${1:-}" != "--confirm" ]]; then
  cat <<'NOTE'
Nothing has been changed.

Everything in the list above — including the other projects on this box — is
what a reboot would bring back. Check it is the state you want, then run:

  bash infra/pm2-systemd.sh --confirm

NOTE
  exit 0
fi

echo "==> Installing the systemd unit"
# `pm2 startup` prints a command rather than running one when it cannot detect
# the init system; -u and --hp make it deterministic instead.
pm2 startup systemd -u root --hp /root

echo "==> Saving the current process list"
pm2 save

echo "==> Verifying"
if systemctl is-enabled pm2-root >/dev/null 2>&1; then
  echo "pm2-root is enabled. Processes will come back after a reboot."
else
  echo "WARNING: pm2-root is not enabled. Check the output above." >&2
  exit 1
fi

cat <<'NOTE'

Done. Two things worth knowing:

  - `pm2 save` is a snapshot, not a subscription. After changing what runs on
    this box, run `pm2 save` again or the change is lost at the next reboot.
  - To undo this entirely: `pm2 unstartup systemd`.

NOTE
