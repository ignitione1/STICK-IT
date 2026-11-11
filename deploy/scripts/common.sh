#!/bin/sh
# Sourced by operational scripts; never source .env as executable shell code.
DEPLOY_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$DEPLOY_ROOT"

dc() {
  docker compose --env-file "$DEPLOY_ROOT/.env" -f "$DEPLOY_ROOT/compose.yaml" "$@"
}
