# COM2 러브트리 API 자동 배포

`main`에 머지된 API 변경을 COM2(WSL Ubuntu)가 10분마다 확인해 자동 설치한다.
실패하면 방금 백업으로 되돌린다. **운영 DB에는 쓰지 않는다** — migration/`schema.sql` 변경은 자동 설치하지 않고 사람에게 넘긴다.

## 파일

| 저장소 | 설치 위치 (COM2) |
| --- | --- |
| `deploy/host-com2/lovetree-api/autodeploy.sh` | `/usr/local/sbin/lovetree-api-autodeploy` |
| `deploy/host-com2/lovetree-api/lovetree-api-autodeploy.service` | `/etc/systemd/system/lovetree-api-autodeploy.service` |
| `deploy/host-com2/lovetree-api/lovetree-api-autodeploy.timer` | `/etc/systemd/system/lovetree-api-autodeploy.timer` |

상태·백업·저장소 사본은 `/var/lib/lovetree-api-autodeploy/`에 있다.
잠금 파일은 `/run/lock/lovetree-api-deploy.lock` 하나이며 수동 `install.sh`도 같은 파일을 쓴다.

## 한 번 돌 때의 판정

1. `flock`으로 잠근다. 이미 돌고 있으면 `SKIPPED reason=locked`.
2. `origin/main`을 받아 상태 파일의 `installed_sha`와 비교한다.
3. 같으면 `NOOP reason=same_sha`.
4. `server/db/migrations/` 또는 `server/db/schema.sql`이 바뀌었으면 `needs_manual_migration` — 설치하지 않는다.
5. API 설치와 무관한 파일만 바뀌었으면 `skipped` — `installed_sha`만 갱신한다.
6. 그 외: 백업 tar(최근 5개 보존) → `install.sh --dry-run` → 서비스 정지 → `install.sh --apply`
   (내부에서 `preflight_imports` 사전 점검) → 기동 → 확인
   (active, NRestarts 증가 없음, `GET /api/community/shares` 200, 60초 오류 로그 0).
7. 확인 실패: 백업을 풀고 재기동한 뒤 `rolled_back`과 실패 단계를 기록한다.
   **같은 SHA로는 다시 시도하지 않는다** — 다음 SHA가 올 때까지 기다린다.

API 설치 대상(6번으로 넘어가는 변경): `server/**`, `src/domain.js`, `package.json`, `package-lock.json`,
`install.sh`, `check_config.mjs`, `preflight_imports.mjs`.

## 상태 파일

`/var/lib/lovetree-api-autodeploy/state.json`

```json
{
  "last_checked_at": "2026-11-04T14:00:00Z",
  "checked_sha": "…",
  "target_sha": "…",
  "installed_sha": "…",
  "result": "installed|skipped|needs_manual_migration|rolled_back",
  "failed_stage": null,
  "attempted_sha": "…"
}
```

## 설치·운영

```bash
# 최초 설치(머지된 SHA에서)
install -m 0755 deploy/host-com2/lovetree-api/autodeploy.sh /usr/local/sbin/lovetree-api-autodeploy
install -m 0644 deploy/host-com2/lovetree-api/lovetree-api-autodeploy.service /etc/systemd/system/
install -m 0644 deploy/host-com2/lovetree-api/lovetree-api-autodeploy.timer /etc/systemd/system/
systemctl daemon-reload

# 상태 파일 시작점: 지금 운영 중인 API SHA
mkdir -p /var/lib/lovetree-api-autodeploy
printf '%s\n' '{"last_checked_at":null,"checked_sha":"<SHA>","target_sha":null,"installed_sha":"<SHA>","result":"installed","failed_stage":null,"attempted_sha":null}' \
  > /var/lib/lovetree-api-autodeploy/state.json

# 타이머 전에 수동 1회
/usr/local/sbin/lovetree-api-autodeploy run

# 타이머 켜기 / 상태 / 로그
systemctl enable --now lovetree-api-autodeploy.timer
/usr/local/sbin/lovetree-api-autodeploy status
journalctl -u lovetree-api-autodeploy.service -n 50 --no-pager

# 되돌리는 법(자동 배포 중지) — 한 줄
systemctl disable --now lovetree-api-autodeploy.timer
```

## migration 보류를 푸는 법

`needs_manual_migration`은 DB 변경을 자동 적용하지 않았다는 뜻이다.
사람이 migration을 적용한 것을 확인한 뒤 **한 번만** 다음을 실행한다.

```bash
AUTODEPLOY_ACCEPT_MIGRATIONS=1 /usr/local/sbin/lovetree-api-autodeploy run
```

`--accept-migrations` 인자로도 같다. 이 실행은 확인(migration 적용)을 대신하지 않는다 — 사람의 확인이 선행 조건이다.

## 되돌림

- 자동: 확인 실패 시 그 실행의 백업 tar로 되돌리고 서비스를 다시 켠다. 같은 SHA는 재시도하지 않는다.
- 수동: `state.json`의 `installed_sha`를 이전 SHA로 되돌리고(또는 그대로 두고) `install.sh --apply`로 설치하거나,
  `/var/lib/lovetree-api-autodeploy/backups/`의 tar를 풀고 `npm ci --omit=dev` 후 재기동한다.
- 백업은 최근 5개만 남는다. 수동 백업(`/opt/padiem/lovetree-api/backups/`)은 지우지 않는다.
