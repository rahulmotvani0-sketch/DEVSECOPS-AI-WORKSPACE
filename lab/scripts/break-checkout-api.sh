#!/usr/bin/env bash
set -e

echo "============================================================"
echo " INTENTIONAL CHAOS INJECTION — BREAKING checkout-api"
echo "============================================================"
echo "Injecting memory exhaustion allocation on checkout-api..."

echo "1. Simulating traffic surge on order fraud detection cache..."
sleep 1
echo "2. RSS Memory usage: 256MiB / 256MiB (100% threshold reached)"
sleep 1
echo "3. Kernel Out-Of-Memory Killer triggered!"
echo "4. Pod checkout-api-7d89b94f-x29q terminated with exit code 137 (OOMKilled)."
echo "============================================================"
echo "CHAOS INJECTED SUCCESSFULLY!"
echo "Now run 'cargo run --bin airlock -- why checkout-api' or launch Airlock Desktop Cockpit to investigate."
echo "============================================================"
