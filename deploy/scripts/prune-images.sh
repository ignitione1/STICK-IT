#!/bin/sh
set -eu
if [ "$#" -ne 4 ]; then
  echo 'Usage: prune-images.sh CURRENT_API CURRENT_WEB PREVIOUS_API PREVIOUS_WEB' >&2
  exit 1
fi
current_api=$1
current_web=$2
previous_api=$3
previous_web=$4
for repository in ghcr.io/ignitione1/stick-it-api ghcr.io/ignitione1/stick-it-web; do
  docker image ls "$repository" --format '{{.Repository}}:{{.Tag}}' | while IFS= read -r image; do
    case "$image" in "$repository":*) tag=${image#"$repository":} ;; *) continue ;; esac
    case "$tag" in *[!0-9a-f]*|'') continue ;; esac
    [ "${#tag}" -eq 40 ] || continue
    case "$image" in "$current_api"|"$current_web"|"$previous_api"|"$previous_web") continue ;; esac
    # Keep images used by any container, including unrelated projects.
    [ -z "$(docker ps -aq --filter "ancestor=$image")" ] || continue
    docker image rm "$image" || echo "Warning: could not remove $image" >&2
  done
done
