#!/usr/bin/env bash
# Launch script for Airlock Desktop on Ubuntu 24.04
# Works around missing webkit2gtk-4.0 packages by shimming to 4.1
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SHIM_PC="$DIR/.pkg-config-shims"
SHIM_LIB="$DIR/.lib-shims"

export PKG_CONFIG_PATH="$SHIM_PC:${PKG_CONFIG_PATH:-}"
export LIBRARY_PATH="$SHIM_LIB:${LIBRARY_PATH:-}"
export LD_LIBRARY_PATH="$SHIM_LIB:${LD_LIBRARY_PATH:-}"

exec cargo run --package airlock-desktop "$@"
