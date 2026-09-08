#!/usr/bin/env bash
set -e

# Resolve script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Configure local library path for WebKitGTK / Soup shims
export PKG_CONFIG_PATH="$PROJECT_ROOT/.pkgconfig:$PKG_CONFIG_PATH"
export LIBRARY_PATH="$PROJECT_ROOT/.pkgconfig/lib:$LIBRARY_PATH"
export LD_LIBRARY_PATH="$PROJECT_ROOT/.pkgconfig/lib:$LD_LIBRARY_PATH"

# Ensure audit DB directory exists
mkdir -p "$PROJECT_ROOT/.devsecops"

echo "=== Launching DevSecOps Desktop Workstation (Enterprise Native) ==="
exec "$PROJECT_ROOT/target/debug/devsecops-desktop" "$@"
