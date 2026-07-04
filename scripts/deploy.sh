#!/usr/bin/env bash
# One-command production deploy for train.public.computer.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/deploy-lib.sh
source scripts/deploy-lib.sh

HOST=devuser@78.141.219.102
APP_DIR=/opt/train/app
LIBSQL_VER=0.5.29
FORBIDDEN_ARTIFACT_RE='DialKit|dialkit|accountbox-train|productionEnabled'

if [[ "${1:-}" == "--no-build" ]]; then
  echo "--no-build is disabled: production deploys must create a fresh artifact."
  exit 1
fi

echo "== source guard =="
if ! git diff --quiet -- src vite.config.ts public/adapters adapters; then
  echo "Refusing deploy: app source files have uncommitted changes."
  git status --short -- src vite.config.ts public/adapters adapters
  exit 1
fi

echo "== clean build =="
rm -rf .output
bash scripts/ensure-dialkit.sh
bun run typecheck
bun run build

echo "== artifact guard =="
if rg -I -n "$FORBIDDEN_ARTIFACT_RE" .output; then
  echo "Refusing deploy: forbidden dev instrumentation found in production artifact."
  exit 1
fi

cat > .output/deploy-manifest.json <<EOF
{
  "commit": "$(git rev-parse HEAD)",
  "branch": "$(git branch --show-current)",
  "builtAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "dirty": $(test -n "$(git status --porcelain)" && echo true || echo false)
}
EOF

accountbox_deploy_sync ".output" "$HOST" "$APP_DIR"
accountbox_deploy_sync_adapters "public/adapters" "$HOST" "/opt/train/adapters"
accountbox_deploy_restart "$HOST" "$APP_DIR" "$LIBSQL_VER"

echo "== remote artifact guard =="
if accountbox_deploy_remote_grep "$HOST" "$FORBIDDEN_ARTIFACT_RE" "$APP_DIR"; then
  echo "Forbidden dev instrumentation is present on the server."
  exit 1
fi

echo "== public verify =="
curl -s -m 20 https://train.public.computer/ -o /dev/null -w "public: %{http_code}\n"
accountbox_deploy_smoke false
echo "deploy done."
