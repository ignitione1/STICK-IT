#!/bin/sh
set -eu

config=/tmp/trusted-proxy.conf
: > "$config"
if [ -n "${TRUSTED_HOST_PROXY:-}" ]; then
  # Accept one literal IPv4 address only, never a CIDR or Nginx syntax.
  if ! printf '%s\n' "$TRUSTED_HOST_PROXY" | awk '
    BEGIN { FS="." }
    NR != 1 || NF != 4 { exit 1 }
    { for (i = 1; i <= 4; i++) if ($i !~ /^[0-9]+$/ || length($i) > 3 || $i + 0 > 255) exit 1 }
  '; then
    echo 'Invalid TRUSTED_HOST_PROXY: expected a single IPv4 address' >&2
    exit 1
  fi
  printf 'set_real_ip_from %s;\nreal_ip_header X-Real-IP;\n' "$TRUSTED_HOST_PROXY" > "$config"
fi
exec nginx -g 'daemon off;'
