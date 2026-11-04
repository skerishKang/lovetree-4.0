#!/usr/bin/env bash
# Installs only the LoveTree storage API unit. Never starts/enables any service.
# Dry-run은 기본값이고, 실제 적용은 --apply로만 열린다. 터널 설정에는 손대지 않는다.
set -euo pipefail
umask 077
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source_root=$(cd -- "$here/../../.." && pwd)
apply=0
while (($#)); do
  case "$1" in
    --apply) apply=1; shift ;;
    --dry-run) apply=0; shift ;;
    --source-root) source_root=${2:?source root required}; shift 2 ;;
    *) echo 'LOVETREE_INSTALL=INVALID_ARGUMENT' >&2; exit 2 ;;
  esac
done
app=/opt/padiem/lovetree-api
unit=lovetree-api.service
retention_unit=lovetree-log-retention.service
retention_timer=lovetree-log-retention.timer
# 유닛이 호출하는 노드 경로와 같은 자리를 확인한다(PATH의 node가 아니라).
node_bin=/usr/local/bin/node
if (( ! apply )); then
  printf '%s\n' 'LOVETREE_INSTALL=DRY_RUN' "APP_ROOT=$app" "UNIT=$unit" "RETENTION_UNIT=$retention_unit" "RETENTION_TIMER=$retention_timer" "NODE_BIN=$node_bin" 'START_SERVICE=NO' 'ENABLE_SERVICE=NO' 'TUNNEL_CHANGE=NO' 'DB_CONTAINER_CREATED=NO'
  exit 0
fi
fail() { echo "LOVETREE_INSTALL=$1" >&2; exit 1; }
# 자동 배포(autodeploy.sh)와 같은 잠금 파일을 쓴다 — 수동 설치와 타이머가 겹치지 않게 한다.
# autodeploy가 잠금을 쥔 채 이 스크립트를 부를 때는 LOVETREE_DEPLOY_LOCK_HELD=1로 넘어온다.
lock_file=${LOVETREE_DEPLOY_LOCK:-/run/lock/lovetree-api-deploy.lock}
if [[ ${LOVETREE_DEPLOY_LOCK_HELD:-0} != 1 ]]; then
  [[ ${EUID} -eq 0 ]] || fail ROOT_REQUIRED
  exec 9>"$lock_file" || fail DEPLOY_LOCK_UNAVAILABLE
  flock -w 300 9 || fail DEPLOY_LOCKED
fi
[[ ${EUID} -eq 0 ]] || fail ROOT_REQUIRED
[[ -f "$source_root/server/index.js" && -f "$source_root/src/domain.js" && -f "$source_root/package-lock.json" ]] || fail SOURCE_MISSING
[[ -x "$node_bin" ]] || fail NODE_MISSING
"$node_bin" -e 'const[m,i]=process.versions.node.split(".").map(Number);process.exit(m>22||(m===22&&i>=13)?0:1)' || fail NODE_TOO_OLD
command -v npm >/dev/null || fail NPM_MISSING
if systemctl is-active --quiet "$unit"; then fail STOP_LOVETREE_API_BEFORE_UPDATE; fi
install -d -m 0755 "$app"
if ! getent passwd lovetree-api >/dev/null; then
  useradd --system --user-group --home-dir "$app" --shell /usr/sbin/nologin lovetree-api
fi
rm -rf "$app/server"
cp -a "$source_root/server" "$app/server"
# 서버가 검증 규칙을 프런트와 한 곳에서 쓴다(server/workspace-service.js → ../src/domain.js).
# 이 한 파일이 없으면 서비스는 시작한 직후 ERR_MODULE_NOT_FOUND로 죽는다.
install -d -m 0755 "$app/src"
install -m 0644 "$source_root/src/domain.js" "$app/src/domain.js"
install -m 0644 "$source_root/package.json" "$app/package.json"
install -m 0644 "$source_root/package-lock.json" "$app/package-lock.json"
install -m 0644 "$here/check_config.mjs" "$app/check_config.mjs"
install -m 0644 "$here/preflight_imports.mjs" "$app/preflight_imports.mjs"
(umask 022; cd "$app" && npm ci --omit=dev --no-audit --no-fund)
# 소스 트리가 제한된 umask로 체크아웃됐을 수 있다(cp -a는 원본 모드를 그대로 옮긴다).
# 서비스 사용자(lovetree-api)가 읽고 디렉터리를 통과할 수 있게 설치 트리를 정규화한다.
# .env·backups는 건드리지 않는다(.env는 아래에서 0600으로 닫힌다).
chmod 0755 "$app"
chmod -R a+rX "$app/server" "$app/src" "$app/node_modules"
chmod a+r "$app/check_config.mjs" "$app/preflight_imports.mjs" "$app/package.json" "$app/package-lock.json"
# 사전점검: server/index.js의 import 그래프가 실제 파일로 해석되는지 확인한다.
# 누락된 파일(src/domain.js 등)이 있으면 ESM 로더가 ERR_MODULE_NOT_FOUND를 낸다.
# 이 시점에 설치를 중단해야 systemd가 재시작 루프에 빠지지 않는다(2026-10-28 재발 방지).
# env를 비워 실행하므로 index.js 본문 부작용(포트 점유) 없이 그래프만 검사된다.
if ! (cd "$app" && env -i "$node_bin" preflight_imports.mjs ./server/index.js); then fail IMPORT_PREFLIGHT_FAILED; fi
if [[ ! -e "$app/.env" ]]; then install -m 0600 "$here/.env.example" "$app/.env"; fi
chown root:root "$app/.env"
chmod 0600 "$app/.env"
# cp -a는 원본 소유권을 그대로 옮긴다. 운영 자리에 개발자 uid가 남지 않게 한 번 닫는다.
chown -R root:root "$app"
install -m 0644 "$here/$unit" "/etc/systemd/system/$unit"
install -m 0644 "$here/$retention_unit" "/etc/systemd/system/$retention_unit"
install -m 0644 "$here/$retention_timer" "/etc/systemd/system/$retention_timer"
systemctl daemon-reload
printf '%s\n' 'LOVETREE_INSTALL=PASS' "NODE_BIN=$node_bin" 'START_SERVICE=NO' 'ENABLE_SERVICE=NO' 'TUNNEL_CHANGE=NO' 'DB_CONTAINER_CREATED=NO'
