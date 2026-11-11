#!/bin/sh
set -eu
umask 077
. "$(dirname -- "$0")/common.sh"
destination=${1:-"$DEPLOY_ROOT/backups"}
mkdir -p "$destination"
bundle=$(CDPATH= cd -- "$destination" && pwd)/$(date -u +%Y%m%dT%H%M%SZ)-$$
mkdir "$bundle"

# Keep DB and files consistent. Restart only services that were running before.
running=$(dc ps --status running --services)
restart_services=''
for service in web api; do
  if printf '%s\n' "$running" | grep -qx "$service"; then
    restart_services="$restart_services $service"
  fi
done
resume() {
  status=$?
  trap - EXIT
  if [ -n "$restart_services" ]; then
    # Intentional splitting: values are only the two fixed service names above.
    if ! dc start --wait $restart_services; then
      echo 'Backup finished, but application restart failed; inspect containers.' >&2
      status=1
    fi
  fi
  exit "$status"
}
trap resume EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
if [ -n "$restart_services" ]; then dc stop $restart_services; fi

dc exec -T postgres sh -c 'exec pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$bundle/database.dump.part"
dc run --rm --no-deps --entrypoint tar -T api -C /app/uploads -czf - . > "$bundle/uploads.tar.gz.part"
mv "$bundle/database.dump.part" "$bundle/database.dump"
mv "$bundle/uploads.tar.gz.part" "$bundle/uploads.tar.gz"
(
  cd "$bundle"
  sha256sum database.dump uploads.tar.gz > SHA256SUMS
)
printf 'Backup ready: %s\nCopy the whole directory off the VPS.\n' "$bundle"
