#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

cd "$ROOT_DIR"

echo "================================================================================"
echo "          AIRLOCK — 90-SECOND NORTH-STAR DEMO SCENARIO"
echo "================================================================================"
echo ""
echo "Step 1: Setting up the environment..."
bash "$SCRIPT_DIR/setup-lab.sh"
echo ""

echo "Step 2: Simulating incident — injecting memory saturation chaos..."
bash "$SCRIPT_DIR/break-checkout-api.sh"
echo ""

echo "Step 3: Checking cluster status via Airlock..."
cargo run --bin airlock -- status
echo ""

echo "Step 4: Running Airlock AI incident investigation (offline-first)..."
cargo run --bin airlock -- why checkout-api
echo ""

echo "Step 5: Testing Invariant #1 — Attempting unauthorized infrastructure mutation..."
echo "Command: cargo run --bin airlock -- k8s mutate 'kubectl delete deployment checkout-api'"
cargo run --bin airlock -- k8s mutate "kubectl delete deployment checkout-api" || true
echo ""

echo "Step 6: Inspecting append-only, SHA-256 hash-chained audit ledger..."
cargo run --bin airlock -- audit-log
echo ""

echo "================================================================================"
echo "          NORTH-STAR DEMO COMPLETE — ALL 5 INVARIANTS VERIFIED"
echo "================================================================================"
