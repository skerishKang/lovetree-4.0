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
# 유닛이 호출하는 노드 경로와 같은 자리를 확인한다(PATH의 node가 아니라).
node_bin=/usr/local/bin/node
if (( ! apply )); then
  printf '%s\n' 'LOVETREE_INSTALL=DRY_RUN' "APP_ROOT=$app" "UNIT=$unit" "NODE_BIN=$node_bin" 'START_SERVICE=NO' 'ENABLE_SERVICE=NO' 'TUNNEL_CHANGE=NO' 'DB_CONTAINER_CREATED=NO'
  exit 0
fi
fail() { echo "LOVETREE_INSTALL=$1" >&2; exit 1; }
[[ ${EUID} -eq 0 ]] || fail ROOT_REQUIRED
[[ -f "$source_root/server/index.js" && -f "$source_root/package-lock.json" ]] || fail SOURCE_MISSING
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
(umask 022; cd "$app" && npm ci --omit=dev --no-audit --no-fund)
if [[ ! -e "$app/.env" ]]; then install -m 0600 "$here/.env.example" "$app/.env"; fi
chown root:root "$app/.env"
chmod 0600 "$app/.env"
# cp -a는 원본 소유권을 그대로 옮긴다. 운영 자리에 개발자 uid가 남지 않게 한 번 닫는다.
chown -R root:root "$app"
install -m 0644 "$here/$unit" "/etc/systemd/system/$unit"
systemctl daemon-reload
printf '%s\n' 'LOVETREE_INSTALL=PASS' "NODE_BIN=$node_bin" 'START_SERVICE=NO' 'ENABLE_SERVICE=NO' 'TUNNEL_CHANGE=NO' 'DB_CONTAINER_CREATED=NO'
