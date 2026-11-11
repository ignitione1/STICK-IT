#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
tag=${1:-2.3.0}
platform=${2:-linux/amd64}
if [ ! -f dist/index.html ]; then
  echo 'Build frontend first: npm ci && npm run build' >&2
  exit 1
fi
# Run on a workstation/CI with Docker, not on the 1 GB VPS. No .env needed.
docker build --platform "$platform" --target runtime -t "stick-it-api:$tag" -f server/Dockerfile server
docker build --platform "$platform" -t "stick-it-web:$tag" -f deploy/web.Dockerfile .
printf 'Images ready: stick-it-api:%s and stick-it-web:%s\n' "$tag" "$tag"
