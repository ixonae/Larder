#!/usr/bin/env bash
# Stops Larder, archives the whole data directory (database and uploads together, so they always
# match) to backups/larder-<timestamp>.tar.gz, then starts Larder again if it was running.
# Prints the path of the archive.
set -euo pipefail
cd "$(dirname "$0")/.."

DATA_DIR="${LARDER_DATA_DIR:-./data}"
BACKUP_DIR="${LARDER_BACKUP_DIR:-./backups}"
SERVICE="${LARDER_SERVICE:-larder}"

if [ ! -d "$DATA_DIR" ]; then
  echo "No data directory at $DATA_DIR" >&2
  exit 1
fi
mkdir -p "$BACKUP_DIR"
archive="$BACKUP_DIR/larder-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"

running="$(docker compose ps --status running --quiet "$SERVICE")"
restart() {
  if [ -n "$running" ]; then docker compose start "$SERVICE" >/dev/null; fi
}
trap restart EXIT

if [ -n "$running" ]; then docker compose stop "$SERVICE" >/dev/null; fi
tar -czf "$archive.partial" -C "$DATA_DIR" .
mv "$archive.partial" "$archive"
echo "$archive"
