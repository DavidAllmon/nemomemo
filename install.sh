#!/bin/sh
# NemoMemo installer for Linux + macOS — https://trynemomemo.com
#
#   curl -fsSL https://trynemomemo.com/install.sh | sh
#
# Runs the app in Docker with a persistent data volume. Re-running upgrades
# in place (the data volume is kept). Overridable via environment:
#   NEMOMEMO_PORT=5230  NEMOMEMO_VOLUME=nemomemo-data
#   NEMOMEMO_CONTAINER=nemomemo  NEMOMEMO_IMAGE=ghcr.io/davidallmon/nemomemo:latest
#
# Feature settings (email, OCR, transcripts, dictation) come from an env file —
# start from .env.example in the repo:
#   NEMOMEMO_ENV_FILE=./nemomemo.env curl -fsSL https://trynemomemo.com/install.sh | sh
set -eu

PORT="${NEMOMEMO_PORT:-5230}"
VOLUME="${NEMOMEMO_VOLUME:-nemomemo-data}"
NAME="${NEMOMEMO_CONTAINER:-nemomemo}"
IMAGE="${NEMOMEMO_IMAGE:-ghcr.io/davidallmon/nemomemo:latest}"
ENV_FILE="${NEMOMEMO_ENV_FILE:-}"

say() { printf '%s\n' "$*"; }
fail() { printf '🐡 %s\n' "$*" >&2; exit 1; }

if [ -n "$ENV_FILE" ] && [ ! -f "$ENV_FILE" ]; then
  fail "No env file at $ENV_FILE. Create it (start from .env.example) or unset NEMOMEMO_ENV_FILE."
fi

say "🐠 NemoMemo installer"

if ! command -v docker >/dev/null 2>&1; then
  case "$(uname -s)" in
    Darwin)
      fail "Docker isn't installed. Install Docker Desktop (https://docs.docker.com/desktop/setup/install/mac-install/) or OrbStack, then re-run this script." ;;
    Linux)
      fail "Docker isn't installed. Install it first:  curl -fsSL https://get.docker.com | sh  — then re-run this script." ;;
    *)
      fail "Unsupported OS: $(uname -s). On Windows, run:  irm https://trynemomemo.com/install.ps1 | iex" ;;
  esac
fi

if ! docker info >/dev/null 2>&1; then
  if [ "$(uname -s)" = "Linux" ] && [ "$(id -u)" -ne 0 ]; then
    fail "Can't talk to the Docker daemon. Start it, add yourself to the docker group, or re-run with sudo:  curl -fsSL https://trynemomemo.com/install.sh | sudo sh"
  fi
  fail "Docker is installed but not running. Start Docker, then re-run this script."
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  say "↻ found an existing '$NAME' container — upgrading in place (your data volume is kept)"
  docker pull "$IMAGE"
  docker rm -f "$NAME" >/dev/null
else
  if command -v curl >/dev/null 2>&1 && curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/"; then
    fail "Port $PORT is already in use. Pick another:  NEMOMEMO_PORT=5231 curl -fsSL https://trynemomemo.com/install.sh | sh"
  fi
  docker pull "$IMAGE"
fi

if [ -n "$ENV_FILE" ]; then
  docker run -d --name "$NAME" --restart unless-stopped \
    -p "$PORT:5230" -v "$VOLUME:/app/data" --env-file "$ENV_FILE" "$IMAGE" >/dev/null
else
  docker run -d --name "$NAME" --restart unless-stopped \
    -p "$PORT:5230" -v "$VOLUME:/app/data" "$IMAGE" >/dev/null
fi

started=1
if command -v curl >/dev/null 2>&1; then
  started=0
  i=0
  while [ $i -lt 30 ]; do
    if curl -fs --max-time 2 "http://localhost:$PORT/healthz" >/dev/null 2>&1; then
      started=1
      break
    fi
    i=$((i + 1))
    sleep 1
  done
fi

say ""
if [ "$started" -eq 1 ]; then
  say "  ✓ your reef is live at http://localhost:$PORT"
else
  say "  container started; still waking up — check:  docker logs $NAME"
  say "  it will be at http://localhost:$PORT"
fi
say ""
say "  · the first account you create becomes the reef keeper (admin)"
say "  · your data lives in the docker volume '$VOLUME' (one SQLite DB + uploads)"
say "  · to upgrade later, just re-run this script"
say ""
say "  just keep swimming 🫧"
