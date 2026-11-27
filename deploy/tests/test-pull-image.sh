#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -f "$tmp/timeout" "$tmp/sleep" "$tmp/attempts"; rmdir "$tmp"' EXIT
cat > "$tmp/timeout" <<'MOCK'
#!/bin/sh
echo attempt >> "$PULL_TEST_LOG"
count=$(wc -l < "$PULL_TEST_LOG")
if [ "$PULL_TEST_MODE" = retry ] && [ "$count" -ge 2 ]; then exit 0; fi
exit 124
MOCK
cat > "$tmp/sleep" <<'MOCK'
#!/bin/sh
exit 0
MOCK
chmod +x "$tmp/timeout" "$tmp/sleep"
PULL_TEST_LOG="$tmp/attempts"
export PULL_TEST_LOG
PATH="$tmp:$PATH"
export PATH
eval "$(sed -n '/^pull_image() {/,/^}$/p' "$root/deploy/scripts/deploy-release.sh")"
PULL_TEST_MODE=retry
export PULL_TEST_MODE
pull_image example:test
[ "$(wc -l < "$PULL_TEST_LOG")" -eq 2 ]
rm "$PULL_TEST_LOG"
PULL_TEST_MODE=fail
export PULL_TEST_MODE
if pull_image example:test; then
  echo 'Expected failed pull' >&2
  exit 1
else
  status=$?
fi
[ "$status" -eq 124 ]
[ "$(wc -l < "$PULL_TEST_LOG")" -eq 3 ]
echo 'Image pull retry tests passed'
