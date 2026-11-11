#!/bin/sh
set -eu
. "$(dirname -- "$0")/common.sh"
action=${1:-help}
case "$action" in
  check) dc config --quiet ;;
  db-up) dc up -d --wait postgres ;;
  up) dc up -d --wait ;;
  stop) dc stop ;;
  down) dc down ;; # Keep both named volumes; never pass --volumes here.
  status) dc ps ;;
  logs) dc logs --tail=100 --follow ;;
  migrate) dc run --rm --no-deps --entrypoint node api dist/db/migrate.js ;;
  *)
    echo 'Usage: sh deploy/scripts/stack.sh {check|db-up|up|stop|down|status|logs|migrate}'
    exit 1
    ;;
esac
