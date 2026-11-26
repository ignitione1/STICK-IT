#!/bin/sh
set -eu
umask 077
DEPLOY_ROOT=/opt/stick-it
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
destination="$DEPLOY_ROOT/backups/scheduled"
mkdir -p "$destination"

# The scheduled job and any manual invocation of this wrapper cannot overlap.
exec 9>"$destination/.scheduled.lock"
if ! flock -n 9; then
  echo 'Scheduled backup is already running' >&2
  exit 1
fi

sh "$DEPLOY_ROOT/deploy/scripts/backup.sh" "$destination"
python3 "$SCRIPT_DIR/prune-backups.py" "$destination" --keep 7
