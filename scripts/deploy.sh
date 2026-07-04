#!/usr/bin/env bash
# One-command production deploy for train.public.computer.
#   scripts/deploy.sh            build + sync + restart + verify
#   scripts/deploy.sh --no-build sync + restart + verify (reuse .output)
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=devuser@78.141.219.102
APP_DIR=/opt/train/app
LIBSQL_VER=0.5.29

if [[ "${1:-}" != "--no-build" ]]; then
  echo "== typecheck + build =="
  bun run typecheck
  bun run build
fi

echo "== sync =="
rsync -az --partial --timeout=90 .output/ "$HOST:$APP_DIR/"
# Caddy serves /adapters/* statically from /opt/train/adapters (not the app),
# so adapters + their identity manifests must sync there too.
rsync -az --partial --timeout=90 public/adapters/ "$HOST:/opt/train/adapters/"

echo "== linux libsql binding (idempotent) + restart =="
ssh -o BatchMode=yes -o ConnectTimeout=15 "$HOST" "
  cd $APP_DIR/server/node_modules/@libsql 2>/dev/null && [ ! -d linux-x64-gnu ] && {
    curl -sL https://registry.npmjs.org/@libsql/linux-x64-gnu/-/linux-x64-gnu-$LIBSQL_VER.tgz -o /tmp/libsql.tgz &&
    mkdir -p linux-x64-gnu && tar -xzf /tmp/libsql.tgz -C linux-x64-gnu --strip-components=1
  }
  sudo -n systemctl restart train-app
  sleep 3
  curl -s -o /dev/null -w 'local app: %{http_code}\n' http://127.0.0.1:3210/
"

echo "== public verify =="
curl -s -m 20 https://train.public.computer/ -o /dev/null -w "public: %{http_code}\n"
echo "deploy done."
