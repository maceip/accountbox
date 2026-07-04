#!/usr/bin/env bash
# Train dev deploy for train.public.computer WITH DialKit instrumentation.
# Customer-facing deploys must use scripts/deploy.sh (DialKit forbidden).
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/deploy-lib.sh
source scripts/deploy-lib.sh

HOST=devuser@78.141.219.102
APP_DIR=/opt/train/app
LIBSQL_VER=0.5.29
REQUIRED_ARTIFACT_RE='accountbox-train|Agent notes|copyAgentReport'

echo "== source guard =="
if ! git diff --quiet -- src vite.config.ts public/adapters adapters; then
  echo "Refusing deploy: app source files have uncommitted changes."
  git status --short -- src vite.config.ts public/adapters adapters
  exit 1
fi

echo "== clean train-dev build =="
rm -rf .output
bash scripts/ensure-dialkit.sh
export VITE_DIALKIT=on
bun run typecheck
bun run build

echo "== dialkit artifact guard =="
if ! rg -I -l "$REQUIRED_ARTIFACT_RE" .output/public/assets/*.js >/dev/null 2>&1; then
  echo "Refusing deploy: DialKit markers missing from production artifact."
  echo "Expected one of: accountbox-train, Agent notes, copyAgentReport"
  exit 1
fi

cat > .output/deploy-manifest.json <<EOF
{
  "commit": "$(git rev-parse HEAD)",
  "branch": "$(git branch --show-current)",
  "builtAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "dirty": $(test -n "$(git status --porcelain)" && echo true || echo false),
  "dialkit": true,
  "viteDialkit": "on"
}
EOF

accountbox_deploy_sync ".output" "$HOST" "$APP_DIR"
accountbox_deploy_sync_adapters "public/adapters" "$HOST" "/opt/train/adapters"
accountbox_deploy_restart "$HOST" "$APP_DIR" "$LIBSQL_VER"

echo "== remote dialkit guard =="
if ! accountbox_deploy_remote_grep "$HOST" "$REQUIRED_ARTIFACT_RE" "$APP_DIR"; then
  echo "DialKit markers missing on server after sync."
  exit 1
fi

echo "== public verify =="
curl -s -m 20 "https://train.public.computer/?dialkit=1" -o /dev/null -w "public: %{http_code}\n"
accountbox_deploy_smoke true
echo "train-dev deploy done."
