#!/usr/bin/env bash
# 러브트리 4.0 COM2 API 자동 배포 — 10분 타이머가 부르는 유일한 진입점.
#
# 매 실행:
#   잠금(flock) → origin/main 확인 → 마지막 설치 SHA와 비교
#   → DB 변경(migration/schema)이 있으면 자동 설치 금지(needs_manual_migration)
#   → API와 무관한 변경만 있으면 상태만 갱신(skipped)
#   → 그 외: 백업 tar → install.sh dry run → install.sh --apply → 서비스 재기동 → 확인
#   → 확인 실패: 방금 백업으로 되돌리고 재기동(rolled_back). 같은 SHA는 다시 시도하지 않는다.
#
# 운영 DB에는 쓰지 않는다. migration 적용은 계속 사람이 한다.
# 값(비밀번호·키)은 출력하지 않는다. 이 파일은 비밀 값을 읽지도 않는다.
#
# 수동 사용:
#   /usr/local/sbin/lovetree-api-autodeploy status
#   /usr/local/sbin/lovetree-api-autodeploy run
#   LOVETREE_DEPLOY_LOCK_HELD=0 ...   # 일반 run
#   AUTODEPLOY_ACCEPT_MIGRATIONS=1 /usr/local/sbin/lovetree-api-autodeploy run
#     ↑ 사람이 migration 적용을 확인한 뒤 1회만. 기본값은 0(금지).
set -euo pipefail
umask 077

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { printf '%s %s\n' "$(now)" "$*"; }

app=${AUTODEPLOY_APP:-/opt/padiem/lovetree-api}
state_dir=${AUTODEPLOY_STATE_DIR:-/var/lib/lovetree-api-autodeploy}
repo=${AUTODEPLOY_REPO:-$state_dir/repo}
remote=${AUTODEPLOY_REMOTE:-https://github.com/skerishKang/lovetree-4.0.git}
branch=${AUTODEPLOY_BRANCH:-main}
state_file=$state_dir/state.json
backup_dir=$state_dir/backups
# 수동 install.sh와 같은 잠금 파일을 쓴다. 두 경로가 겹쳐 돌지 않게 하는 유일한 표지다.
lock_file=${LOVETREE_DEPLOY_LOCK:-/run/lock/lovetree-api-deploy.lock}
unit=${AUTODEPLOY_UNIT:-lovetree-api.service}
health_url=${AUTODEPLOY_HEALTH_URL:-http://127.0.0.1:8790/api/community/shares}
http_expect=${AUTODEPLOY_HTTP_EXPECT:-200}
observe_seconds=${AUTODEPLOY_OBSERVE_SECONDS:-60}
http_retries=${AUTODEPLOY_HTTP_RETRIES:-10}
http_retry_sleep=${AUTODEPLOY_HTTP_RETRY_SLEEP:-3}
keep_backups=${AUTODEPLOY_KEEP_BACKUPS:-5}
node_bin=${AUTODEPLOY_NODE:-/usr/local/bin/node}
npm_bin=${AUTODEPLOY_NPM:-npm}
systemctl_bin=${AUTODEPLOY_SYSTEMCTL:-systemctl}
install_sh=${AUTODEPLOY_INSTALL_SH:-}
accept_migrations=${AUTODEPLOY_ACCEPT_MIGRATIONS:-0}

command=${1:-run}
shift || true
for arg in "$@"; do
  case "$arg" in
    --accept-migrations) accept_migrations=1 ;;
    *) log "AUTODEPLOY=FAIL stage=invalid_argument arg=$arg"; exit 2 ;;
  esac
done

state_read() {
  "$node_bin" -e '
    const fs = require("fs");
    try {
      const s = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const v = s[process.argv[2]];
      process.stdout.write(v == null ? "" : String(v));
    } catch { /* state 없음/깨짐 = 빈 값 */ }
  ' "$state_file" "$1" 2>/dev/null || true
}

state_write() {
  "$node_bin" -e '
    const fs = require("fs"), path = require("path");
    const [file, ...pairs] = process.argv.slice(1);
    let s = {};
    try { s = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* 새로 시작 */ }
    for (const p of pairs) {
      const i = p.indexOf("=");
      if (i < 0) continue;
      const k = p.slice(0, i), v = p.slice(i + 1);
      s[k] = v === "" ? null : v;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(tmp, file);
  ' "$state_file" "$@"
}

if [[ "$command" == "status" ]]; then
  if [[ -f "$state_file" ]]; then cat "$state_file"; else echo '{}'; fi
  exit 0
fi
if [[ "$command" != "run" ]]; then
  log "AUTODEPLOY=FAIL stage=unknown_command command=$command"
  exit 2
fi

mkdir -p "$state_dir" "$backup_dir"
mkdir -p "$(dirname "$lock_file")" 2>/dev/null || true

# ── 잠금: 겹쳐 돌지 않는다. 이미 누가 돌고 있으면 조용히 끝낸다(타이머를 실패로 만들지 않는다).
exec 9>"$lock_file" || { log "AUTODEPLOY=FAIL stage=lock_unavailable path=$lock_file"; exit 1; }
if ! flock -n 9; then
  log "AUTODEPLOY=SKIPPED reason=locked"
  exit 0
fi

# ── 저장소 최신 main
if [[ ! -d "$repo/.git" ]]; then
  log "AUTODEPLOY=STEP clone repo=$repo"
  git clone --quiet --no-checkout "$remote" "$repo" || { log "AUTODEPLOY=FAIL stage=clone"; exit 1; }
fi
if ! git -C "$repo" fetch --quiet --prune origin "+refs/heads/$branch:refs/remotes/origin/$branch"; then
  log "AUTODEPLOY=FAIL stage=fetch"
  exit 1
fi
target=$(git -C "$repo" rev-parse --verify "refs/remotes/origin/$branch^{commit}") || {
  log "AUTODEPLOY=FAIL stage=resolve_target"; exit 1;
}

installed=$(state_read installed_sha)
if [[ -z "$installed" ]]; then
  log "AUTODEPLOY=FAIL stage=state_missing_installed_sha"
  exit 1
fi
if ! git -C "$repo" cat-file -e "${installed}^{commit}" 2>/dev/null; then
  # 기준 SHA를 저장소에서 확인할 수 없으면 추측하지 않고 사람에게 넘긴다.
  state_write last_checked_at="$(now)" checked_sha="$target" target_sha="$target" \
    installed_sha="$installed" result=needs_manual_migration failed_stage=unknown_installed_sha
  log "AUTODEPLOY=NEEDS_MANUAL_MIGRATION reason=unknown_installed_sha sha=$target"
  exit 0
fi

if [[ "$target" == "$installed" ]]; then
  state_write last_checked_at="$(now)" checked_sha="$target" target_sha="$target" \
    installed_sha="$installed" result=installed failed_stage=
  log "AUTODEPLOY=NOOP reason=same_sha sha=$target"
  exit 0
fi

# 되돌림 뒤 같은 SHA로는 다시 시도하지 않는다 — 다음 SHA가 올 때까지 기다린다.
prev_result=$(state_read result)
attempted=$(state_read attempted_sha)
if [[ "$prev_result" == "rolled_back" && -n "$attempted" && "$target" == "$attempted" ]]; then
  state_write last_checked_at="$(now)" checked_sha="$target"
  log "AUTODEPLOY=SKIPPED reason=rolled_back_same_sha sha=$target"
  exit 0
fi

mapfile -t changed < <(git -C "$repo" diff --name-only "$installed" "$target")

# ── DB 변경은 자동 설치 금지. 사람이 migration을 적용한 뒤 --accept-migrations로 1회 연다.
has_migration=0
for file in "${changed[@]}"; do
  case "$file" in
    server/db/migrations/*|server/db/schema.sql) has_migration=1 ;;
  esac
done
if (( has_migration )) && (( accept_migrations == 0 )); then
  state_write last_checked_at="$(now)" checked_sha="$target" target_sha="$target" \
    installed_sha="$installed" result=needs_manual_migration failed_stage=manual_migration_required
  log "AUTODEPLOY=NEEDS_MANUAL_MIGRATION sha=$target from=$installed files=$(printf '%s,' "${changed[@]}" | tr -d '\n')"
  exit 0
fi

# ── API 설치와 무관한 변경(프런트만 등)은 상태만 갱신한다.
has_api=0
for file in "${changed[@]}"; do
  case "$file" in
    server/*|src/domain.js|package.json|package-lock.json|\
    deploy/host-com2/lovetree-api/install.sh|\
    deploy/host-com2/lovetree-api/check_config.mjs|\
    deploy/host-com2/lovetree-api/preflight_imports.mjs) has_api=1 ;;
  esac
done
if (( ! has_api )); then
  state_write last_checked_at="$(now)" checked_sha="$target" target_sha="$target" \
    installed_sha="$target" result=skipped failed_stage=
  log "AUTODEPLOY=SKIPPED reason=no_api_change sha=$target from=$installed"
  exit 0
fi

if [[ -z "$install_sh" ]]; then install_sh=$repo/deploy/host-com2/lovetree-api/install.sh; fi
if [[ -f "$install_sh" ]]; then
  if [[ -x "$install_sh" ]]; then install_cmd=("$install_sh"); else install_cmd=(bash "$install_sh"); fi
else
  log "AUTODEPLOY=FAIL stage=install_script_missing path=$install_sh"
  exit 1
fi

log "AUTODEPLOY=STEP checkout sha=$target from=$installed"
git -C "$repo" checkout --quiet --force --detach "$target" || { log "AUTODEPLOY=FAIL stage=checkout"; exit 1; }

before_restarts=$("${systemctl_bin}" show -p NRestarts --value "$unit" 2>/dev/null | tr -d '[:space:]' || true)
before_restarts=${before_restarts:-0}

# ── 백업 tar (최근 keep_backups 개만 남긴다)
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup=$backup_dir/lovetree-api-$stamp-$target.tar.gz
log "AUTODEPLOY=STEP backup file=$(basename "$backup")"
tar -czf "$backup" -C "$app" --exclude=./node_modules --exclude=./backups . || {
  log "AUTODEPLOY=FAIL stage=backup"; exit 1;
}
mapfile -t old_backups < <(ls -1t "$backup_dir"/lovetree-api-*.tar.gz 2>/dev/null | tail -n +$((keep_backups + 1)) || true)
if (( ${#old_backups[@]} )); then rm -f -- "${old_backups[@]}"; fi

# ── 사전 점검(dry run) → 권한 있는 설치. install.sh는 서비스가 켜져 있으면 거부하므로 먼저 멈춘다.
log "AUTODEPLOY=STEP dry_run"
if ! "${install_cmd[@]}" --dry-run --source-root "$repo"; then
  log "AUTODEPLOY=FAIL stage=dry_run"
  exit 1
fi

rollback() {
  stage=$1
  log "AUTODEPLOY=ROLLBACK stage=$stage backup=$(basename "$backup")"
  "${systemctl_bin}" stop "$unit" >/dev/null 2>&1 || true
  # node_modules는 그대로 두고 나머지만 백업 시점으로 되돌린다(백업 tar에 .env 포함).
  find "$app" -mindepth 1 -maxdepth 1 ! -name node_modules ! -name backups -exec rm -rf -- {} + 2>/dev/null || true
  if ! tar -xzf "$backup" -C "$app"; then
    log "AUTODEPLOY=FAIL stage=rollback_extract"
    exit 1
  fi
  (cd "$app" && "$npm_bin" ci --omit=dev --no-audit --no-fund) >/dev/null 2>&1 || \
    log "AUTODEPLOY=WARN stage=rollback_npm_ci"
  "${systemctl_bin}" start "$unit" >/dev/null 2>&1 || true
  sleep 2
  if "${systemctl_bin}" is-active --quiet "$unit"; then
    log "AUTODEPLOY=ROLLBACK_SERVICE=active"
  else
    log "AUTODEPLOY=ROLLBACK_SERVICE=inactive"
  fi
  state_write last_checked_at="$(now)" checked_sha="$target" target_sha="$target" \
    installed_sha="$installed" attempted_sha="$target" result=rolled_back failed_stage="$stage"
  exit 0
}

log "AUTODEPLOY=STEP stop_service"
"${systemctl_bin}" stop "$unit" || { log "AUTODEPLOY=FAIL stage=stop_service"; exit 1; }

log "AUTODEPLOY=STEP install"
if ! LOVETREE_DEPLOY_LOCK_HELD=1 "${install_cmd[@]}" --apply --source-root "$repo"; then
  rollback install_failed
fi

log "AUTODEPLOY=STEP start_service"
"${systemctl_bin}" start "$unit" || rollback start_failed
started_epoch=$(date +%s)

# ── 확인: active / NRestarts 증가 없음 / 공개 읽기 200 / 60초 오류 로그 0
verify_failed=""
for ((i = 1; i <= http_retries; i++)); do
  if "${systemctl_bin}" is-active --quiet "$unit"; then break; fi
  sleep "$http_retry_sleep"
done
if ! "${systemctl_bin}" is-active --quiet "$unit"; then
  verify_failed=service_not_active
fi

if [[ -z "$verify_failed" ]]; then
  after_restarts=$("${systemctl_bin}" show -p NRestarts --value "$unit" 2>/dev/null | tr -d '[:space:]' || true)
  if [[ "${after_restarts:-0}" != "$before_restarts" ]]; then
    verify_failed="nrestarts_increased($before_restarts->${after_restarts:-?})"
  fi
fi

if [[ -z "$verify_failed" ]]; then
  code=""
  for ((i = 1; i <= http_retries; i++)); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$health_url" 2>/dev/null || true)
    if [[ "$code" == "$http_expect" ]]; then break; fi
    sleep "$http_retry_sleep"
  done
  if [[ "$code" != "$http_expect" ]]; then
    verify_failed="http_${code:-none}"
  fi
fi

if [[ -z "$verify_failed" ]] && (( observe_seconds > 0 )); then
  log "AUTODEPLOY=STEP observe seconds=$observe_seconds"
  sleep "$observe_seconds"
  error_lines=$(journalctl -u "$unit" --since "@$started_epoch" -p err --no-pager 2>/dev/null \
    | grep -v '^-- ' | grep -c . || true)
  if [[ "${error_lines:-0}" != "0" ]]; then
    verify_failed="error_logs_${error_lines:-?}"
  fi
fi

if [[ -n "$verify_failed" ]]; then
  rollback "$verify_failed"
fi

state_write last_checked_at="$(now)" checked_sha="$target" target_sha="$target" \
  installed_sha="$target" attempted_sha="$target" result=installed failed_stage=
log "AUTODEPLOY=INSTALLED sha=$target from=$installed"
