#!/usr/bin/env bash
# DialKit is vendored at vendor/dialkit WITH its dist/ committed, installed as
# a file: dependency — no network, no build step (self-contained rule). This
# guard just fails fast if the install is missing or someone stripped dist/.
set -euo pipefail
cd "$(dirname "$0")/.."
DIALKIT_DIR=node_modules/dialkit

if [[ ! -f "$DIALKIT_DIR/dist/index.js" || ! -f "$DIALKIT_DIR/dist/styles.css" ]]; then
  echo "dialkit dist missing — run 'bun install' (vendored at vendor/dialkit, dist is committed)."
  exit 1
fi
