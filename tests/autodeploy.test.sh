#!/usr/bin/env bash
# autodeploy.sh 판정 시험 — 실제 git 저장소와 가짜 systemctl/curl/install.sh로 돈다.
# 운영 DB·서비스에는 접속하지 않는다. CI의 ubuntu 잡에서 실행된다.
#
# 시나리오: 같은 SHA 건너뜀 / 프런트만 변경 건너뜀 / migration 변경 보류 /
#           --accept-migrations 1회 허용 / 정상 설치 / 확인 실패 시 되돌림 / 되돌린 SHA 재시도 금지
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
script=$repo_root/deploy/host-com2/lovetree-api/autodeploy.sh
[[ -f "$script" ]] || { echo "AUTODEPLOY_TEST=FAIL script_missing" >&2; exit 1; }

root=$(mktemp -d)
trap 'rm -rf -- "$root"' EXIT
fail() { echo "AUTODEPLOY_TEST=FAIL $*" >&2; exit 1; }
pass() { echo "AUTODEPLOY_TEST=OK $*"; }
assert_eq() {
  local expected=$1 actual=$2 label=$3
  [[ "$expected" == "$actual" ]] || fail "$label expected=[$expected] actual=[$actual]"
}

node_bin=$(command -v node || true)
[[ -n "$node_bin" ]] || fail node_missing

# ── 시험용 origin 저장소: main에 커밋을 하나씩 올린다.
origin=$root/origin.git
seed=$root/seed
git init -q --bare "$origin"
git init -q "$seed"
git -C "$seed" config user.email ci@example.com
git -C "$seed" config user.name ci
git -C "$seed" config commit.gpgsign false
mkdir -p "$seed/server" "$seed/src"
printf 'v1\n' > "$seed/server/index.js"
printf 'export const x = 1;\n' > "$seed/src/domain.js"
printf '{}\n' > "$seed/package.json"
printf '{}\n' > "$seed/package-lock.json"
git -C "$seed" add -A
git -C "$seed" commit -qm a
A=$(git -C "$seed" rev-parse HEAD)
git -C "$seed" push -q "$origin" HEAD:refs/heads/main

push_commit() { # $1 = message
  git -C "$seed" add -A
  git -C "$seed" commit -qm "$1"
  git -C "$seed" push -q "$origin" HEAD:refs/heads/main
  git -C "$seed" rev-parse HEAD
}

# ── 가짜 명령
bin=$root/bin
mkdir -p "$bin"
cat > "$bin/systemctl" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  is-active) exit 0 ;;
  show) echo 0; exit 0 ;;
  stop|start|restart|daemon-reload) echo "systemctl $*" >> "${FAKE_LOG:?}"; exit 0 ;;
esac
exit 0
EOF
cat > "$bin/journalctl" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$bin/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s' "${FAKE_HTTP_CODE:-200}"
exit 0
EOF
chmod +x "$bin/systemctl" "$bin/journalctl" "$bin/curl"

fake_install=$root/fake-install.sh
cat > "$fake_install" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
mode=dry
src=""
while (($#)); do
  case "$1" in
    --apply) mode=apply; shift ;;
    --dry-run) mode=dry; shift ;;
    --source-root) src=${2:?}; shift 2 ;;
    *) shift ;;
  esac
done
printf '%s %s\n' "$mode" "$src" >> "${FAKE_INSTALL_LOG:?}"
if [[ $mode == apply && ${FAKE_INSTALL_FAIL:-0} == 1 ]]; then exit 1; fi
if [[ $mode == apply && -n $src ]]; then
  rm -rf "${FAKE_APP:?}/server" "${FAKE_APP:?}/src"
  cp -a "$src/server" "$FAKE_APP/server"
  cp -a "$src/src" "$FAKE_APP/src"
  cat "$src/server/index.js" > "$FAKE_APP/INSTALLED"
fi
EOF
chmod +x "$fake_install"

# ── 배포 대상 앱과 상태 파일
app=$root/app
mkdir -p "$app/server" "$app/src"
printf 'old\n' > "$app/server/index.js"
printf 'old\n' > "$app/src/domain.js"
printf 'ENV=1\n' > "$app/.env"
printf '{}\n' > "$app/package.json"
printf '{}\n' > "$app/package-lock.json"

state=$root/state
mkdir -p "$state" "$state/backups"
cat > "$state/state.json" <<JSON
{
  "last_checked_at": null,
  "checked_sha": "$A",
  "target_sha": null,
  "installed_sha": "$A",
  "result": "installed",
  "failed_stage": null,
  "attempted_sha": null
}
JSON

field() {
  "$node_bin" -e '
    const fs = require("fs");
    const s = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.stdout.write(String(s[process.argv[2]] ?? ""));
  ' "$state/state.json" "$1"
}

install_calls() {
  if [[ -f "$root/install.log" ]]; then
    grep -c '^apply ' "$root/install.log" || true
  else
    echo 0
  fi
}

run_autodeploy() {
  env PATH="$bin:$PATH" \
    AUTODEPLOY_APP="$app" \
    AUTODEPLOY_STATE_DIR="$state" \
    AUTODEPLOY_REMOTE="$origin" \
    AUTODEPLOY_INSTALL_SH="$fake_install" \
    AUTODEPLOY_NPM=true \
    AUTODEPLOY_NODE="$node_bin" \
    AUTODEPLOY_SYSTEMCTL=systemctl \
    AUTODEPLOY_OBSERVE_SECONDS=0 \
    AUTODEPLOY_HTTP_RETRIES=1 \
    AUTODEPLOY_HTTP_RETRY_SLEEP=0 \
    LOVETREE_DEPLOY_LOCK="$root/deploy.lock" \
    FAKE_LOG="$root/fake.log" \
    FAKE_INSTALL_LOG="$root/install.log" \
    FAKE_APP="$app" \
    FAKE_HTTP_CODE="${FAKE_HTTP_CODE:-200}" \
    "$@" bash "$script" run > "$root/run.log" 2>&1 || {
      cat "$root/run.log" >&2
      fail "run_exit_nonzero"
    }
}

# 1) 같은 SHA → 설치 없음
run_autodeploy
grep -q 'AUTODEPLOY=NOOP reason=same_sha' "$root/run.log" || { cat "$root/run.log"; fail same_sha_log; }
assert_eq "$A" "$(field installed_sha)" same_sha_installed
assert_eq "0" "$(install_calls)" same_sha_install_calls
pass same_sha

# 2) 프런트만 변경 → 상태만 갱신
mkdir -p "$seed/public"
printf 'front\n' > "$seed/public/index.html"
B=$(push_commit b)
run_autodeploy
grep -q 'AUTODEPLOY=SKIPPED reason=no_api_change' "$root/run.log" || { cat "$root/run.log"; fail front_log; }
assert_eq "$B" "$(field installed_sha)" front_installed
assert_eq "skipped" "$(field result)" front_result
assert_eq "0" "$(install_calls)" front_install_calls
pass front_only

# 3) migration 변경 → 자동 설치 보류, 설치 SHA 유지
mkdir -p "$seed/server/db/migrations"
printf -- '-- migrate\n' > "$seed/server/db/migrations/261104-x.sql"
C=$(push_commit c)
run_autodeploy
grep -q 'AUTODEPLOY=NEEDS_MANUAL_MIGRATION' "$root/run.log" || { cat "$root/run.log"; fail migration_log; }
assert_eq "$B" "$(field installed_sha)" migration_installed
assert_eq "needs_manual_migration" "$(field result)" migration_result
assert_eq "manual_migration_required" "$(field failed_stage)" migration_stage
assert_eq "0" "$(install_calls)" migration_install_calls
pass migration_guard

# 3b) 사람이 적용을 확인한 1회(--accept-migrations) → 설치 진행
run_autodeploy AUTODEPLOY_ACCEPT_MIGRATIONS=1
assert_eq "$C" "$(field installed_sha)" accept_installed
assert_eq "installed" "$(field result)" accept_result
assert_eq "1" "$(install_calls)" accept_install_calls
assert_eq "v1" "$(cat "$app/INSTALLED")" accept_app_version
pass accept_migrations

# 4) 서버 코드 변경 → 정상 설치
printf 'v2\n' > "$seed/server/index.js"
D=$(push_commit d)
run_autodeploy
grep -q 'AUTODEPLOY=INSTALLED' "$root/run.log" || { cat "$root/run.log"; fail install_log; }
assert_eq "$D" "$(field installed_sha)" installed_sha
assert_eq "v2" "$(cat "$app/INSTALLED")" installed_app_version
assert_eq "2" "$(install_calls)" installed_calls
pass installed

# 5) 확인 실패(HTTP 503) → 백업으로 되돌림, 상태 rolled_back
printf 'v3\n' > "$seed/server/index.js"
E=$(push_commit e)
FAKE_HTTP_CODE=503 run_autodeploy
grep -q 'AUTODEPLOY=ROLLBACK stage=http_503' "$root/run.log" || { cat "$root/run.log"; fail rollback_log; }
assert_eq "$D" "$(field installed_sha)" rollback_installed
assert_eq "rolled_back" "$(field result)" rollback_result
assert_eq "http_503" "$(field failed_stage)" rollback_stage
assert_eq "$E" "$(field attempted_sha)" rollback_attempted
assert_eq "v2" "$(cat "$app/server/index.js")" rollback_app_restored
assert_eq "v2" "$(cat "$app/INSTALLED")" rollback_marker_restored
calls_after_rollback=$(install_calls)
pass rollback

# 6) 같은 SHA 재시도 금지 → 설치 호출이 늘지 않는다
run_autodeploy
grep -q 'AUTODEPLOY=SKIPPED reason=rolled_back_same_sha' "$root/run.log" || { cat "$root/run.log"; fail rolled_retry_log; }
assert_eq "$calls_after_rollback" "$(install_calls)" rolled_back_no_retry_calls
assert_eq "rolled_back" "$(field result)" rolled_back_no_retry_result
pass rolled_back_no_retry

# 7) 다음 SHA → 다시 설치, 백업 보존 5개
for i in 1 2 3 4 5 6; do : > "$state/backups/lovetree-api-2020010${i}T000000Z-aaaaaaa.tar.gz"; done
printf 'v4\n' > "$seed/server/index.js"
F=$(push_commit f)
run_autodeploy
assert_eq "$F" "$(field installed_sha)" next_installed
assert_eq "v4" "$(cat "$app/INSTALLED")" next_app_version
backup_count=$(find "$state/backups" -maxdepth 1 -name 'lovetree-api-*.tar.gz' | wc -l | tr -d ' ')
[[ "$backup_count" -le 5 ]] || fail "backup_retention count=$backup_count"
pass next_sha_and_retention

# 8) 수동 install.sh가 같은 잠금 파일을 쓰는지(정적 확인 — 적용 경로에 flock이 있어야 한다)
grep -q 'lovetree-api-deploy.lock' "$repo_root/deploy/host-com2/lovetree-api/install.sh" || fail install_lock_path_missing
grep -q 'flock -w 300 9' "$repo_root/deploy/host-com2/lovetree-api/install.sh" || fail install_lock_flock_missing
grep -q 'LOVETREE_DEPLOY_LOCK_HELD' "$repo_root/deploy/host-com2/lovetree-api/install.sh" || fail install_lock_bypass_missing
pass install_lock

echo "AUTODEPLOY_TEST=PASS"
