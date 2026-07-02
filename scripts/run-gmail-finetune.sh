#!/usr/bin/env bash
# Real E2E fine-tune launcher for vibethinker-3b on Gmail + AccountBox tasks.
# Uses data generated from synthetic prompts + your real Gmail usage traces.
#
# Prerequisites (you have these locally):
# - The vibethinker / bb-triage training setup with your 3B model weights.
# - Generated dataset: training/gmail-agent-train.jsonl
#
# This script prepares and launches the real training (no fakes).

set -euo pipefail

DATASET="${1:-training/gmail-agent-train.jsonl}"
OUT_ADAPTER_DIR="adapters/gmail-agent-$(date +%Y%m%d-%H%M)"

if [ ! -f "$DATASET" ]; then
  echo "Dataset not found: $DATASET"
  echo "Run: bun run training/generate-gmail-dataset.ts first (after using the app with real Gmail)."
  exit 1
fi

echo "[gmail-finetune] Using dataset: $DATASET"
echo "[gmail-finetune] Will write adapter to: $OUT_ADAPTER_DIR"

# Copy the dataset into the training workspace the vibethinker scripts expect.
# Adjust paths to match your local vibethinker/bb-triage layout.
mkdir -p ~/vibethinker/bb-triage/data
cp "$DATASET" ~/vibethinker/bb-triage/data/gmail-agent-train.jsonl

cd ~/vibethinker/bb-triage

echo "[gmail-finetune] Launching real training (this will take time and use your GPU/CPU)..."
# Use your existing launcher that does the real LoRA fine-tune.
# Example from your setup (adjust if you use a different entrypoint):
if [ -x remote/launch_train.sh ]; then
  DATASET_PATH=data/gmail-agent-train.jsonl bash remote/launch_train.sh
else
  echo "Could not find your launch_train.sh. Please run your normal fine-tune command pointing at data/gmail-agent-train.jsonl"
  echo "Example (mlx style):"
  echo "  .venv/bin/mlx_lm.lora --config lora_config.yaml --data data/gmail-agent-train.jsonl"
fi

echo "[gmail-finetune] When it finishes, the new adapter will be in adapters/. Copy it into the AccountBox runtime to test."
echo "Then use the chat with the same real prompts and compare before/after tool-call accuracy."
