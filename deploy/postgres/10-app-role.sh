#!/bin/sh
# The official entrypoint sources non-executable .sh files on first initialization.
(
set -eu

: "${POSTGRES_APP_USER:?POSTGRES_APP_USER is required}"
: "${POSTGRES_APP_PASSWORD:?POSTGRES_APP_PASSWORD is required}"
case "$POSTGRES_APP_USER" in
  ''|[!a-z]*|*[!a-z0-9_]*|postgres|pg_*)
    echo 'Invalid application role name' >&2
    exit 1
    ;;
esac
if [ "${#POSTGRES_APP_USER}" -gt 63 ]; then
  echo 'Application role name is too long' >&2
  exit 1
fi

# psql reads credentials from the environment, never from shell history/arguments.
# Identifier/literal quoting handles special characters without SQL interpolation.
psql --no-psqlrc --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_user POSTGRES_APP_USER
\getenv app_password POSTGRES_APP_PASSWORD
\getenv app_database POSTGRES_DB
CREATE ROLE :"app_user" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'app_password';
ALTER DATABASE :"app_database" OWNER TO :"app_user";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";
SQL
)
