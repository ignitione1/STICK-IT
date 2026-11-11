#!/bin/sh
set -eu
umask 077
. "$(dirname -- "$0")/common.sh"
if [ "$#" -ne 1 ]; then
  echo 'Usage: sh deploy/scripts/restore.sh /path/to/trusted-backup-directory' >&2
  exit 1
fi
bundle=$(CDPATH= cd -- "$1" && pwd)
test -f "$bundle/database.dump"
test -f "$bundle/uploads.tar.gz"
test -f "$bundle/SHA256SUMS"
(
  cd "$bundle"
  sha256sum --check SHA256SUMS
)

# Deliberately leave web/api stopped after restore, including on failure.
dc stop web api
tables=$(dc exec -T postgres sh -c 'exec psql --no-psqlrc --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --no-align' <<'SQL'
WITH user_schemas AS (
  SELECT oid, nspname FROM pg_namespace
  WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
)
SELECT (SELECT count(*) FROM user_schemas WHERE nspname <> 'public')
     + (SELECT count(*) FROM pg_class WHERE relnamespace IN (SELECT oid FROM user_schemas))
     + (SELECT count(*) FROM pg_proc WHERE pronamespace IN (SELECT oid FROM user_schemas))
     + (SELECT count(*) FROM pg_type WHERE typnamespace IN (SELECT oid FROM user_schemas));
SQL
)
if [ "$tables" != 0 ]; then
  echo 'Restore refused: target database is not empty. Use a separate new volume/database.' >&2
  exit 1
fi
dc run --rm --no-deps --entrypoint node -T api -e 'if (require("node:fs").readdirSync("/app/uploads").length) { console.error("Restore refused: uploads volume is not empty"); process.exit(1); }'

dc exec -T postgres sh -c 'exec pg_restore --exit-on-error --single-transaction --no-owner --no-acl --role "$POSTGRES_APP_USER" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' < "$bundle/database.dump"
dc run --rm --no-deps --entrypoint tar -T api --no-same-owner -C /app/uploads -xzf - < "$bundle/uploads.tar.gz"
echo 'Restore complete. Verify the result, then run: sh deploy/scripts/stack.sh up'
