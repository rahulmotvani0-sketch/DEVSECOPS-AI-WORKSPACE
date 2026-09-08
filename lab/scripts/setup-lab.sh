#!/usr/bin/env bash
set -e

echo "============================================================"
echo " DEVSECOPS AI WORKSPACE — LOCAL LAB SETUP"
echo "============================================================"
echo "Setting up local demonstration environment..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAB_DIR="$(dirname "$SCRIPT_DIR")"

echo "✓ Local lab environment ready."
echo "  Manifest: $LAB_DIR/manifests/checkout-api.yaml"
echo "  Run 'bash $SCRIPT_DIR/break-checkout-api.sh' to trigger intentional memory chaos."
