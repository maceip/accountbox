#!/bin/bash
# Run ONLY this repo's unit tests. `bun test` discovers by walking the whole
# cwd and treats bare args as substring FILTERS (which still match e.g.
# experiments/*/src/**) — reference clones under experiments/ wedged the
# runner on 2026-07-07 (a midscene test blocks forever on macOS
# screen-recording permission). Explicit file paths bypass discovery.
set -euo pipefail
cd "$(dirname "$0")/.."
FILES=$(find src test training scripts eval -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.test.js' 2>/dev/null)
exec bun test $FILES "$@"
