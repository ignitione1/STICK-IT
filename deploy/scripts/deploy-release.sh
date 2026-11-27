#!/bin/sh
# Installed as a root-owned forced SSH command, outside the checkout.
set -eu
umask 077
release=${SSH_ORIGINAL_COMMAND:-}
case "$release" in *[!0-9a-f]*|'') echo 'Invalid release SHA' >&2; exit 1 ;; esac
[ "${#release}" -eq 40 ] || { echo 'Invalid release SHA' >&2; exit 1; }
cd /opt/stick-it

# This is also the lock held by the scheduled backup wrapper.
mkdir -p /opt/stick-it/backups/scheduled
exec 9>/opt/stick-it/backups/scheduled/.scheduled.lock
flock -n 9 || { echo 'Backup or deployment already running' >&2; exit 1; }

test -z "$(git status --porcelain --untracked-files=all)" || { echo 'Checkout is not clean' >&2; exit 1; }
previous=$(git rev-parse HEAD)
previous_api=$(docker inspect --format '{{.Config.Image}}' "$(docker compose ps -q api)")
previous_web=$(docker inspect --format '{{.Config.Image}}' "$(docker compose ps -q web)")
git fetch origin main
git merge-base --is-ancestor "$release" origin/main || { echo 'Release is not on main' >&2; exit 1; }
git merge-base --is-ancestor "$previous" "$release" || { echo 'Release is not a fast-forward' >&2; exit 1; }
git diff --quiet "$previous" "$release" -- server/drizzle || { echo 'Database migrations require an explicit deployment procedure' >&2; exit 1; }

api="ghcr.io/ignitione1/stick-it-api:$release"
web="ghcr.io/ignitione1/stick-it-web:$release"

# Stop an unresponsive client and retry without touching the running containers.
# Docker retains downloaded layers, so a subsequent attempt can reuse them.
pull_image() {
  image=$1
  attempt=1
  while [ "$attempt" -le 3 ]; do
    echo "Pulling image (attempt $attempt/3): $image"
    if timeout --kill-after=10s 120s docker pull "$image"; then
      echo "Image ready: $image"
      return 0
    else
      status=$?
    fi
    echo "Image pull failed or timed out (exit $status): $image" >&2
    [ "$attempt" -lt 3 ] || return "$status"
    attempt=$((attempt + 1))
    sleep 5
  done
}
pull_image "$api"
pull_image "$web"

# A failed backup or failed application restart prevents the deployment.
echo 'Images ready; starting pre-deployment backup'
sh deploy/scripts/backup.sh /opt/stick-it/backups/scheduled
env_backup=$(mktemp /opt/stick-it-ops/deploy-env.XXXXXXXX)
cp -p .env "$env_backup"
rollback() {
  result=$?
  trap - EXIT
  if [ "$result" -ne 0 ]; then
    echo 'Deployment failed; restoring the previous checkout and images' >&2
    if [ -n "$(git status --porcelain --untracked-files=all)" ]; then
      echo "Checkout changed during deployment; inspect VPS manually. Saved configuration: $env_backup" >&2
      exit "$result"
    fi
    if ! cp -p "$env_backup" .env || ! git reset --hard "$previous" || ! docker compose up -d --wait; then
      echo "Automatic rollback failed; inspect VPS immediately. Saved configuration: $env_backup" >&2
      exit "$result"
    fi
  fi
  rm -f -- "$env_backup"
  exit "$result"
}
trap rollback EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

git merge --ff-only "$release"
python3 - "$api" "$web" <<'PY'
from pathlib import Path
import os, sys, tempfile
path = Path('.env')
lines = path.read_text(encoding='utf-8').splitlines(keepends=True)
for key, value in [('API_IMAGE', sys.argv[1]), ('WEB_IMAGE', sys.argv[2])]:
    matches = [i for i, line in enumerate(lines) if line.startswith(key + '=')]
    if len(matches) != 1:
        raise SystemExit(f'Expected exactly one {key} in .env')
    lines[matches[0]] = f'{key}={value}\n'
fd, tmp = tempfile.mkstemp(prefix='.env.deploy-', dir='.')
try:
    with os.fdopen(fd, 'w', encoding='utf-8', newline='') as output:
        output.writelines(lines)
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)
finally:
    if os.path.exists(tmp):
        os.unlink(tmp)
PY
docker compose up -d --wait
curl --fail --silent --show-error http://127.0.0.1:8080/api/health >/dev/null
python3 /opt/stick-it-ops/prune-backups.py /opt/stick-it/backups/scheduled --keep 7 || echo 'Warning: backup cleanup failed; inspect VPS' >&2
sh deploy/scripts/prune-images.sh "$api" "$web" "$previous_api" "$previous_web" || echo 'Warning: image cleanup failed; inspect VPS' >&2
echo "Deployment complete: $release"
