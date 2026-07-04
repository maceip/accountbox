#!/usr/bin/env bash
# One-command production deploy for train.public.computer.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=devuser@78.141.219.102
HOST_NAME=${HOST#*@}
APP_DIR=/opt/train/app
LIBSQL_VER=0.5.29
KNOWN_HOSTS=${ACCOUNTBOX_DEPLOY_KNOWN_HOSTS:-/tmp/accountbox_train_known_hosts}
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

echo "== ssh trust =="
ssh-keyscan -H "$HOST_NAME" > "$KNOWN_HOSTS" 2>/dev/null
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15 -o UserKnownHostsFile="$KNOWN_HOSTS" -o StrictHostKeyChecking=yes)
RSYNC_RSH="ssh ${SSH_OPTS[*]}"

echo "== sync =="
rsync -az --delete --partial --timeout=90 -e "$RSYNC_RSH" .output/ "$HOST:$APP_DIR/"
# Caddy serves /adapters/* statically from /opt/train/adapters (not the app),
# so adapters + their identity manifests must sync there too.
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

echo "== remote artifact guard =="
ssh "${SSH_OPTS[@]}" "$HOST" "
  matches=\$(grep -R -I -n -E '$FORBIDDEN_ARTIFACT_RE' $APP_DIR/server $APP_DIR/public/assets 2>/dev/null | head -40 || true)
  if [ -n \"\$matches\" ]; then
    echo \"\$matches\"
    echo 'Forbidden dev instrumentation is present on the server.'
    exit 1
  fi
"

echo "== public verify =="
curl -s -m 20 https://train.public.computer/ -o /dev/null -w "public: %{http_code}\n"
bun run smoke:production
echo "deploy done."
