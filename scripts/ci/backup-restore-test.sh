#!/usr/bin/env bash
# CI check: back up a running install, restore it into a fresh data directory, and verify
# the same rows and the same uploaded files come back. Needs the image built (docker compose build).
set -euo pipefail
cd "$(dirname "$0")/../.."

work="$(mktemp -d)"
export COMPOSE_PROJECT_NAME=larder-ci
export LARDER_UID="$(id -u)" LARDER_GID="$(id -g)"
export LARDER_DATA_DIR="$work/data" LARDER_BACKUP_DIR="$work/backups"
URL="http://127.0.0.1:${LARDER_PORT:-3000}"
trap 'docker compose down >/dev/null 2>&1 || true' EXIT

snapshot() {
  curl -fsS "$URL/api/me"
  (cd "$LARDER_DATA_DIR/uploads" && sha256sum ./*)
}

echo "--- start a fresh install"
mkdir -p "$LARDER_DATA_DIR/uploads"
docker compose up -d --wait
head -c 65536 /dev/urandom > "$LARDER_DATA_DIR/uploads/sample.webp"
before="$(snapshot)"

echo "--- back up"
archive="$(scripts/backup.sh)"
test -s "$archive"
test -n "$(docker compose ps --status running --quiet larder)" || {
  echo "Larder was not restarted after the backup" >&2
  exit 1
}
docker compose down

echo "--- restore into an empty data directory"
export LARDER_DATA_DIR="$work/restored"
scripts/restore.sh "$archive"
after="$(snapshot)"

if [ "$before" != "$after" ]; then
  echo "Restored data differs:" >&2
  diff <(echo "$before") <(echo "$after") >&2 || true
  exit 1
fi
echo "--- OK: same rows and files after restore"
