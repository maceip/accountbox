#!/bin/bash
set -euo pipefail
echo "=== Completing the one full training/eval loop ==="

ADAPTER_SRC=~/bbverifier/adapters/gmail-agent/adapters.safetensors
ADAPTER_DST=adapters/gmail-agent.safetensors

echo "Waiting for training to produce final adapter (if not already)..."
while [ ! -f "$ADAPTER_SRC" ]; do
  echo "  ... still training or not saved yet. Sleeping 60s"
  sleep 60
done

mkdir -p adapters
cp -v "$ADAPTER_SRC" "$ADAPTER_DST"

echo ""
echo "Adapter from this fine-tune is now in AccountBox."
echo "Running the eval on the 18 synthetic prompts (plan quality vs targets)..."

bun run training/eval-plans.ts

echo ""
echo "=== Full training + eval loop complete for this fine-tune on VibeThinker-3B ==="
echo "You can now also type the prompts in the running app chat to see real plans from the new adapter (once runtime inference bridge uses the safetensors)."
