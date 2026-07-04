#!/usr/bin/env bash
# Shared deploy helpers for train.public.computer (local box or remote SSH).
set -euo pipefail

accountbox_deploy_is_local() {
  local host_name="${1:?host name required}"
  local self_ip
  self_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [[ "$host_name" == "127.0.0.1" || "$host_name" == "localhost" || "$host_name" == "$self_ip" ]]
}

accountbox_deploy_sync() {
  local src_dir="${1:?source dir}"
  local host="${2:?user@host}"
  local app_dir="${3:?app dir}"
  local host_name="${host#*@}"

  if accountbox_deploy_is_local "$host_name"; then
    echo "== sync (local) =="
    rsync -az --delete --partial "$src_dir/" "$app_dir/"
    return 0
  fi

  local known_hosts="${ACCOUNTBOX_DEPLOY_KNOWN_HOSTS:-/tmp/accountbox_train_known_hosts}"
  echo "== ssh trust =="
  ssh-keyscan -H "$host_name" > "$known_hosts" 2>/dev/null
  local -a ssh_opts=(
    -o BatchMode=yes
    -o ConnectTimeout=15
    -o "UserKnownHostsFile=$known_hosts"
    -o StrictHostKeyChecking=yes
  )
  echo "== sync (remote) =="
  rsync -az --delete --partial --timeout=90 -e "ssh ${ssh_opts[*]}" "$src_dir/" "$host:$app_dir/"
}

accountbox_deploy_sync_adapters() {
  local adapters_dir="${1:?adapters source}"
  local host="${2:?user@host}"
  local adapters_dest="${3:?adapters dest}"
  local host_name="${host#*@}"

  if accountbox_deploy_is_local "$host_name"; then
    rsync -az --partial "$adapters_dir/" "$adapters_dest/"
    return 0
  fi

  local known_hosts="${ACCOUNTBOX_DEPLOY_KNOWN_HOSTS:-/tmp/accountbox_train_known_hosts}"
  local -a ssh_opts=(
    -o BatchMode=yes
    -o ConnectTimeout=15
    -o "UserKnownHostsFile=$known_hosts"
    -o StrictHostKeyChecking=yes
  )
  rsync -az --partial --timeout=90 -e "ssh ${ssh_opts[*]}" "$adapters_dir/" "$host:$adapters_dest/"
}

accountbox_deploy_restart() {
  local host="${1:?user@host}"
  local app_dir="${2:?app dir}"
  local libsql_ver="${3:?libsql version}"
  local host_name="${host#*@}"

  if accountbox_deploy_is_local "$host_name"; then
    echo "== restart (local) =="
    (
      cd "$app_dir/server/node_modules/@libsql" 2>/dev/null && [ ! -d linux-x64-gnu ] && {
        curl -sL "https://registry.npmjs.org/@libsql/linux-x64-gnu/-/linux-x64-gnu-${libsql_ver}.tgz" -o /tmp/libsql.tgz &&
        mkdir -p linux-x64-gnu && tar -xzf /tmp/libsql.tgz -C linux-x64-gnu --strip-components=1
      }
    ) || true
    sudo -n systemctl restart train-app
    sleep 3
    curl -s -o /dev/null -w 'local app: %{http_code}\n' http://127.0.0.1:3210/
    return 0
  fi

  local known_hosts="${ACCOUNTBOX_DEPLOY_KNOWN_HOSTS:-/tmp/accountbox_train_known_hosts}"
  local -a ssh_opts=(
    -o BatchMode=yes
    -o ConnectTimeout=15
    -o "UserKnownHostsFile=$known_hosts"
    -o StrictHostKeyChecking=yes
  )
  echo "== restart (remote) =="
  ssh "${ssh_opts[@]}" "$host" "
    cd $app_dir/server/node_modules/@libsql 2>/dev/null && [ ! -d linux-x64-gnu ] && {
      curl -sL https://registry.npmjs.org/@libsql/linux-x64-gnu/-/linux-x64-gnu-$libsql_ver.tgz -o /tmp/libsql.tgz &&
      mkdir -p linux-x64-gnu && tar -xzf /tmp/libsql.tgz -C linux-x64-gnu --strip-components=1
    }
    sudo -n systemctl restart train-app
    sleep 3
    curl -s -o /dev/null -w 'local app: %{http_code}\n' http://127.0.0.1:3210/
  "
}

accountbox_deploy_remote_grep() {
  local host="${1:?user@host}"
  local pattern="${2:?pattern}"
  local app_dir="${3:?app dir}"
  local host_name="${host#*@}"

  if accountbox_deploy_is_local "$host_name"; then
    grep -R -I -l -E "$pattern" "$app_dir/public/assets"/*.js 2>/dev/null | head -1 >/dev/null
    return $?
  fi

  local known_hosts="${ACCOUNTBOX_DEPLOY_KNOWN_HOSTS:-/tmp/accountbox_train_known_hosts}"
  local -a ssh_opts=(
    -o BatchMode=yes
    -o ConnectTimeout=15
    -o "UserKnownHostsFile=$known_hosts"
    -o StrictHostKeyChecking=yes
  )
  ssh "${ssh_opts[@]}" "$host" "
    grep -R -I -l -E '$pattern' $app_dir/public/assets/*.js 2>/dev/null | head -1 >/dev/null
  "
}

accountbox_deploy_smoke() {
  local with_dialkit="${1:-false}"
  echo "== browser smoke (Playwright) =="
  bunx playwright install chromium 2>/dev/null || true
  bun run smoke:production
  if [[ "$with_dialkit" == "true" ]]; then
    bun run smoke:train-dev
    bun run harness:train-dialkit-note
    bun run harness:train-dialkit-tuners
    bun run capture:train-screenshots
  fi
}
