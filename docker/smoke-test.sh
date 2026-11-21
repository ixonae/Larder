#!/usr/bin/env bash
# Smoke-tests the local `larder:latest` image through docker-compose.yml: creates the owner account,
# starts the container, waits for its health check and requests the web app. On failure it prints the
# container logs; either way it removes the container and its throwaway data.
# Used by the CI and Release workflows. Run it from the repository root.
set -euo pipefail

# A separate project keeps a local Larder started with `docker compose up` running and untouched.
export COMPOSE_PROJECT_NAME=larder-smoke-test

# Shell variables take precedence over `.env`, so these keep a local `.env` from moving the port or
# pointing the throwaway owner account at real data.
export LARDER_UID LARDER_GID LARDER_DATA_DIR LARDER_BIND LARDER_PORT
LARDER_UID=$(id -u)
LARDER_GID=$(id -g)
LARDER_DATA_DIR=$(mktemp -d)
LARDER_BIND=127.0.0.1
LARDER_PORT=${LARDER_SMOKE_TEST_PORT:-3999}

# Use the base file explicitly so local Compose overrides cannot replace the image or mount.
compose() {
  docker compose -f docker-compose.yml "$@"
}

cleanup() {
  local status=$?
  if ((status != 0)); then
    compose logs larder || true
  fi
  compose down --volumes --remove-orphans || true
  rm -rf "$LARDER_DATA_DIR"
  exit "$status"
}
trap cleanup EXIT

printf '%s\n' 'larder-ci-test-password' |
  compose run --pull never -T --rm --no-deps \
    larder node apps/api/src/scripts/setup-owner.ts
compose up -d --no-build --pull never --wait --wait-timeout 120
curl --fail --silent --show-error --max-time 10 --output /dev/null \
  "http://$LARDER_BIND:$LARDER_PORT/"
