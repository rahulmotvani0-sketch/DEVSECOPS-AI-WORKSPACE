#!/usr/bin/env bash
# Launch script for Airlock Desktop on Ubuntu 24.04
# Works around missing webkit2gtk-4.0 packages by shimming to 4.1
# Starts the Vite dev server automatically if not already running
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SHIM_PC="$DIR/.pkg-config-shims"
SHIM_LIB="$DIR/.lib-shims"

export PKG_CONFIG_PATH="$SHIM_PC:${PKG_CONFIG_PATH:-}"
export LIBRARY_PATH="$SHIM_LIB:${LIBRARY_PATH:-}"
export LD_LIBRARY_PATH="$SHIM_LIB:${LD_LIBRARY_PATH:-}"

# Start Vite dev server if not already running (Tauri dev mode loads from localhost:5173)
if ! curl -s http://localhost:5173 >/dev/null 2>&1; then
  echo "Starting Vite dev server..."
  (cd "$DIR/src-ui" && npm run dev &)
  for i in {1..10}; do
    curl -s http://localhost:5173 >/dev/null 2>&1 && break
    sleep 1
  done
fi

exec cargo run --package airlock-desktop "$@"
