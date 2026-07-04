#!/usr/bin/env bash
# GitHub-installed dialkit ships source; bun blocks its prepare script by default.
set -euo pipefail
cd "$(dirname "$0")/.."
DIALKIT_DIR=node_modules/dialkit

if [[ ! -d "$DIALKIT_DIR" ]]; then
  echo "dialkit dependency missing — run bun install first."
  exit 1
fi

if [[ -f "$DIALKIT_DIR/dist/index.js" ]]; then
  exit 0
fi

echo "== building dialkit from source =="
bun pm trust dialkit 2>/dev/null || true
(
  cd "$DIALKIT_DIR"
  npm install
  npm run build
)
