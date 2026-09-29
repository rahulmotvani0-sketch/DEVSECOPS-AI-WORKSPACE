#!/usr/bin/env bash
# Launch Airlock Desktop in dev mode (Tauri v2)
# Starts the Vite dev server and the Tauri app together via the Tauri CLI.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$DIR"
npx --prefix src-ui tauri dev
