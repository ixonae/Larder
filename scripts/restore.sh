#!/usr/bin/env bash
# Restores a backup made by backup.sh into an EMPTY data directory, then starts Larder.
# Usage: scripts/restore.sh backups/larder-<timestamp>.tar.gz
set -euo pipefail

archive="${1:?Usage: scripts/restore.sh <backup.tar.gz>}"
archive="$(cd "$(dirname "$archive")" && pwd)/$(basename "$archive")"
cd "$(dirname "$0")/.."

DATA_DIR="${LARDER_DATA_DIR:-./data}"
SERVICE="${LARDER_SERVICE:-larder}"

if [ ! -f "$archive" ]; then
  echo "No backup at $archive" >&2
  exit 1
fi
mkdir -p "$DATA_DIR"
if [ -n "$(ls -A "$DATA_DIR")" ]; then
  echo "$DATA_DIR is not empty. Stop Larder (docker compose stop) and move it away first," >&2
  echo "e.g. mv $DATA_DIR $DATA_DIR.old, so nothing is overwritten." >&2
  exit 1
fi

docker compose stop "$SERVICE" >/dev/null 2>&1 || true
tar -xzf "$archive" -C "$DATA_DIR"
docker compose up -d --wait "$SERVICE"
echo "Restored $archive into $DATA_DIR"
