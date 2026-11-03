#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/zenopher-backend"

# Prefer the repository's asdf-selected Node runtime when one is available.
# This avoids accidentally picking a broken system Node installation on macOS.
if command -v asdf >/dev/null 2>&1; then
  asdf_node="$(asdf which node 2>/dev/null || true)"
  if [[ -n "$asdf_node" && -x "$asdf_node" ]]; then
    export PATH="$(dirname -- "$asdf_node"):$PATH"
  fi
fi

FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-8787}"
WRANGLER_STATE_DIR="${WRANGLER_STATE_DIR:-$BACKEND_DIR/.wrangler/local-state}"

frontend_pid=""
backend_pid=""

cleanup() {
  status=$?
  trap - EXIT INT TERM

  if [[ -n "$frontend_pid" ]] && kill -0 "$frontend_pid" 2>/dev/null; then
    kill "$frontend_pid" 2>/dev/null || true
  fi
  if [[ -n "$backend_pid" ]] && kill -0 "$backend_pid" 2>/dev/null; then
    kill "$backend_pid" 2>/dev/null || true
  fi

  wait "$frontend_pid" 2>/dev/null || true
  wait "$backend_pid" 2>/dev/null || true
  exit "$status"
}

trap cleanup EXIT INT TERM

for command in npm; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    exit 1
  fi
done

if [[ ! -f "$FRONTEND_DIR/package.json" ]]; then
  echo "Frontend package.json not found: $FRONTEND_DIR" >&2
  exit 1
fi

if [[ ! -f "$BACKEND_DIR/package.json" ]]; then
  echo "Backend package.json not found: $BACKEND_DIR" >&2
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm install)
fi

if [[ ! -d "$BACKEND_DIR/node_modules" ]]; then
  echo "Installing backend dependencies..."
  (cd "$BACKEND_DIR" && npm install)
fi

export APP_ORIGIN="${APP_ORIGIN:-http://$FRONTEND_HOST:$FRONTEND_PORT}"
export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-$APP_ORIGIN}"
export FRONTEND_PORT BACKEND_PORT
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://127.0.0.1:$BACKEND_PORT}"
export WRANGLER_SEND_METRICS="false"
export DO_NOT_TRACK="true"
export WRANGLER_LOG_PATH="${WRANGLER_LOG_PATH:-$WRANGLER_STATE_DIR/logs}"
mkdir -p "$WRANGLER_STATE_DIR" "$WRANGLER_LOG_PATH"

echo "Starting Zenopher..."
echo "Frontend: http://$FRONTEND_HOST:$FRONTEND_PORT"
echo "Backend:  http://127.0.0.1:$BACKEND_PORT"
echo "Press Ctrl+C to stop both services."
echo

(
  cd "$BACKEND_DIR"
  exec node scripts/local-dev.mjs --port "$BACKEND_PORT"
) &
backend_pid=$!

(
  cd "$FRONTEND_DIR"
  exec node node_modules/vite/bin/vite.js --host "$FRONTEND_HOST" --port "$FRONTEND_PORT"
) &
frontend_pid=$!

while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$frontend_pid" 2>/dev/null; do
  sleep 1
done

echo "A Zenopher service stopped. Shutting down the other service..." >&2
exit 1
