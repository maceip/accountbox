#!/usr/bin/env bash
# Train dev deploy for train.public.computer WITH DialKit instrumentation.
# Customer-facing deploys must use scripts/deploy.sh (DialKit forbidden).
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=devuser@78.141.219.102
HOST_NAME=${HOST#*@}
APP_DIR=/opt/train/app
LIBSQL_VER=0.5.29
KNOWN_HOSTS=${ACCOUNTBOX_DEPLOY_KNOWN_HOSTS:-/tmp/accountbox_train_known_hosts}
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

echo "== ssh trust =="
ssh-keyscan -H "$HOST_NAME" > "$KNOWN_HOSTS" 2>/dev/null
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15 -o UserKnownHostsFile="$KNOWN_HOSTS" -o StrictHostKeyChecking=yes)
RSYNC_RSH="ssh ${SSH_OPTS[*]}"

echo "== sync =="
rsync -az --delete --partial --timeout=90 -e "$RSYNC_RSH" .output/ "$HOST:$APP_DIR/"
rsync -az --partial --timeout=90 -e "$RSYNC_RSH" public/adapters/ "$HOST:/opt/train/adapters/"

echo "== linux libsql binding (idempotent) + restart =="
ssh "${SSH_OPTS[@]}" "$HOST" "
  cd $APP_DIR/server/node_modules/@libsql 2>/dev/null && [ ! -d linux-x64-gnu ] && {
    curl -sL https://registry.npmjs.org/@libsql/linux-x64-gnu/-/linux-x64-gnu-$LIBSQL_VER.tgz -o /tmp/libsql.tgz &&
    mkdir -p linux-x64-gnu && tar -xzf /tmp/libsql.tgz -C linux-x64-gnu --strip-components=1
  }
  sudo -n systemctl restart train-app
  sleep 3
  curl -s -o /dev/null -w 'local app: %{http_code}\n' http://127.0.0.1:3210/
"

echo "== remote dialkit guard =="
ssh "${SSH_OPTS[@]}" "$HOST" "
  if ! grep -R -I -l -E '$REQUIRED_ARTIFACT_RE' $APP_DIR/public/assets/*.js 2>/dev/null | head -1 >/dev/null; then
    echo 'DialKit markers missing on server after sync.'
    exit 1
  fi
"

echo "== public verify =="
curl -s -m 20 "https://train.public.computer/?dialkit=1" -o /dev/null -w "public: %{http_code}\n"
bun run smoke:production
bun run smoke:train-dev
echo "train-dev deploy done."
