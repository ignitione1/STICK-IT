#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -f "$tmp/docker" "$tmp/removed"; rmdir "$tmp"' EXIT
cat > "$tmp/docker" <<'MOCK'
#!/bin/sh
api=ghcr.io/ignitione1/stick-it-api
web=ghcr.io/ignitione1/stick-it-web
case "$1 $2" in
  'image ls')
    if [ "$3" = "$api" ]; then
      printf '%s\n' "$api:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" "$api:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" "$api:cccccccccccccccccccccccccccccccccccccccc" "$api:dddddddddddddddddddddddddddddddddddddddd" "$api:latest"
    else
      printf '%s\n' "$web:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    fi ;;
  'ps -aq') case "$*" in *dddddddddddddddddddddddddddddddddddddddd*) echo running ;; esac ;;
  'image rm') printf '%s\n' "$3" >> "$MOCK_LOG" ;;
  *) echo "Unexpected Docker call: $*" >&2; exit 1 ;;
esac
MOCK
chmod +x "$tmp/docker"
export MOCK_LOG="$tmp/removed"
export PATH="$tmp:$PATH"
sh "$root/deploy/scripts/prune-images.sh" \
  ghcr.io/ignitione1/stick-it-api:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  ghcr.io/ignitione1/stick-it-web:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  ghcr.io/ignitione1/stick-it-api:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
  ghcr.io/ignitione1/stick-it-web:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
test "$(cat "$MOCK_LOG")" = 'ghcr.io/ignitione1/stick-it-api:cccccccccccccccccccccccccccccccccccccccc'
echo 'Image retention test passed'
