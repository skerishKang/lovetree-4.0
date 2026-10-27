# #13 재사용 조사 — 기존 로그인·DB·권한·배포 매핑 (2026-10-27)

상위: #1 · 대상 이슈: #13 · 이전 지시 "#13 서버 저장·로그인 설계"의 수정판.

조사 지시: 새 로그인·DB 설계를 앞서지 말고 기존 구현의 재사용 가능성을 먼저 확인한다. 이번 단계에서 하지 않은 것: 신규 저장소·DB·인증 서비스 생성, 패키지 설치, 코드 이식, `main` 병합, 배포. COM2의 PADIEM/Claw 서버·DB·프로세스는 조사 대상이 아니며 건드리지 않았다. 비밀값은 읽지 않았고 이 문서에 옮기지 않는다(설정 파일의 키 이름과 경로만 적는다).

기준 커밋(각 `main`): lovetree-4.0 `8b40b429` · lovetree-limone `dd8394c5` · LoveBud `b80647f1`.

## 1. 결론

로그인·토큰 검증·소유권 강제·멱등성·배포 배선은 **이미 두 자매 저장소에 있고 일부는 라이브로 돈다**. 4.0이 새로 설계할 대상이 아니다. 남는 신규 대상은 두 개다: 4.0의 **관련 연결(`links`)을 담을 테이블이 두 스키마 어디에도 없음**, 그리고 **문서 단위 저장의 기기 간 동시성**. 단, 두 API 모두 `Access-Control-Allow-Origin`을 보내지 않아 4.0 오리진(`lovetree-4-0.pages.dev`)에서 브라우저가 응답을 읽을 수 없다 — 재사용은 "다른 오리진에서 API 호출"이 아니라 "같은 오리진 안에 들어가는 것"으로 설계해야 한다.

## 2. 실제 구현과 검증 근거

### LoveBud `b80647f1` — 현재 라이브 인증·데이터 권한
- 로그인: 브라우저 Firebase SDK 8.10.1. `index.html:138-162`, `js/auth/auth-firebase.js:193-365`(`signInWithPopup`·`setPersistence(LOCAL)`·`signOut`), `js/firebase-config.js:16-24`(웹 설정 키 이름만 존재, 값 미확인).
- 세션: Firebase ID 토큰을 `Authorization: Bearer`로. `js/api/base-api-fetch.js:63-83`. 토큰은 `sessionStorage`에만 보관하고 영속 사본을 명시적으로 제거(`js/auth/auth-cache.js:244-320`). 세션 쿠키·Worker 발급 JWT 없음(`_headers`는 CSP/캐시만).
- 서버 검증: `functions/_shared/firebase-id-token-verifier.js:141-188`(RS256+JWKS+`aud`/`iss`/`exp`/`iat`/`auth_time`).
- 기록 저장 API: `functions/api/{trees,memories,comments,community}` 등. 소유권 가드 예 — `functions/_shared/tree-delete-direct-neon.js:142-144` `if (String(ownerRow.owner_id || '') !== ownerId) { failWork(signal, 403, 'Access denied: not your tree'); }`(직접 확인).
- 스키마: Neon Postgres 직결, D1/KV/R2 없음(`wrangler.toml`에 `d1_databases`/`kv_namespaces`/`r2_buckets` 0건, `LB_*_RUNTIME = "direct_neon"` 35개 게이트). `memories`는 `tree_id`/`parent_id`(부모 하나)를 갖되 **link/edge 테이블이 저장소 전체에 없음**(전 repo `CREATE TABLE` grep으로 확인).
- 배포: Pages 프로젝트 `lovebud`(`wrangler.toml:9-10`), CI에 배포 잡 없음 — `docs/ops/FIXED_SLOT_DEPLOY_WITH_WRANGLER.md`로 수동 배포.
- 라이브 확인(2026-10-27, 자격 증명 없이 읽기 전용 GET): `GET https://lovebud.pages.dev/api/trees` → **401 `AUTHORIZATION_REQUIRED`**, 응답 헤더에 ACAO 없음(`/api/health`는 404).
- 주의: `functions/api/[[path]].js:209-213`은 비공개 쓰기에 헤더 **존재 여부만** 보고 Modal로 넘긴다. Modal(`modal_compute/`, 이 저장소 밖 FastAPI)이 실제 검증을 보유하므로 이 경로만으로는 소유권 완결이 아니다.
- 계정 매핑은 있으나 미배선: `workers/love-platform-api/authenticated-principal.js:60` `accountId: null`, `authenticated-account-resolution.js` `wiredIntoRoutes: false`. `app_account`/`app_auth_identity` DDL은 커밋됨(`db/migrations/20260822054500_*.sql:26-107`) 단 매니페스트 상태 `ADOPTION_REQUIRED`.

### lovetree-limone `dd8394c5` — 4.0에 가장 가까운 형태
- 서버 검증기: `core/runtime/server/api/auth.ts:131-236` — 외부 의존성 없이 WebCrypto로 Firebase ID 토큰을 검사하고 실패 시 `null`로 닫힌다(`uid: payload.sub` :206). `tests/auth.test.mjs`가 실제 RSA 서명 토큰과 위조 alg 거부까지 확인.
- 소유권 가드: `core/runtime/server/api/access.ts:76-78` `isTreeOwner = tree.ownerId === user.uid`(직접 확인), 갱신/삭제는 가드 후 행 필터, `deleteTree`는 cascade.
- 정적 HTML용 인증 호스트: `lib/mvp-auth-host.ts:1-60` — 프레임워크 없는 HTML 셸(`public/mvp/01/index.html:36`)에 same-origin으로 번들된 `auth-host.js`를 실어 `window.__MVP01_GET_ACCESS_TOKEN__` 함수 하나만 설치한다. 토큰을 window/URL/Storage/로그에 남기지 않고, 발급 직전 uid 재비교로 계정 전환에 fail-closed. **세 저장소를 통틀어 4.0 같은 정적 앱에 바로 들어맞는 유일한 유닛.**
- 멱등·재플레이: `core/runtime/db/schema.ts:49,62` `trees.client_key` 소유자별 unique, `:73,101` `memories.client_key` `(tree_id, client_key)` unique, `POST /api/trees/with-first-memory` 결정적 id + 원자적 재플레이 상태 기계(`trees.ts:460-701`).
- 스키마: 12개 테이블(`schema.ts:44-283`) — `trees/memories/reactions/comments/tree_comments/tree_likes/tree_social_counts/tree_view_dedup_events/social_idempotency/social_rate_limits/social_audit_log`. **link/edge·문서 blob 테이블 없음.** `visibility`는 `private|unlisted|public` 3단계(`:15`). `owner_id`는 `trees`에만 있고 `memories`는 부모 트리로 소유를 유도.
- 마이그레이션: Drizzle `schema.ts`가 진실 소스, `drizzle/meta/_journal.json` 4개(수동 작성본 `0002_neon_dev_schema_reconciliation.sql`은 저널 밖), CI는 `npm run db:check`만 실행, 실제 적용은 `psql -f ops/releases/sort-order/production-expand.sql` 수동(Expand/Contract/Re-forward 규칙).
- 배포·라이브: Worker `lovetree-limone`(`wrangler.jsonc`), `push → main` 시 `production-auto-deploy.yml`이 `--confirm-worker lovetree-limone --execute` + readiness + smoke. 2026-10-07 05:40Z 커밋 dd8394c5에서 워크플로 성공. 라이브 확인: `GET https://lovetree-limone.charliekant.workers.dev/api/health` → **200 `{"status":"ok","env":"production"}`**, `/api/trees` → **401**, ACAO 없음.

### lovetree-4.0 `8b40b429` — 교체 대상 현재 지면
- 저장소의 유일한 localStorage 접점: `src/main.js:33`. 네트워크 호출·`ownerId`/`token`/`session`어휘가 `src/`·`tests/`·`index.html`에 **0건**(grep 확인).
- 동기 저장·낙관 동시성: `src/storage.js:5-19` `loadState`, `:20-30` `saveState`, `:24` `expectedRaw` 문자열 일치(같은 브라우저 탭 한정, `undefined`이면 무방책), 복구 사본 `:12-17`.
- 데이터: 트리 6키 외 저장 안 함(`src/domain.js:141` 화이트리스트) — 소유자·공개 범위 필드 없음. 순간 `parentId` 하나 + `links[]`(≤20, 양쪽 미러 `:88`, `MAX_LINKS` `:4`). 시점은 `createdAt`만(갱신 시각 없음). `importTrees`(`:146-154`)가 id를 새로 발급 → 기기 간 id 불안정.
- 배포: Cloudflare Pages `lovetree-4-0`(`docs/DEVELOPMENT.md:61`, `docs/HANDOFF.md:78,84-89`). 이 주장은 실측으로 뒷받침된다 — PR #35의 checks에 `Cloudflare Pages` 항목이 붙어 같은 프로젝트의 미리보기 빌드가 통과했다. 다만 저장소에는 `wrangler.*`·`_headers`·`functions/`가 없고 `.github/workflows/ci.yml`에도 배포 단계가 없다. 즉 배포는 GitHub Actions가 아니라 Pages Git 연결이 담당하며, 서버 구성은 저장소 밖에 있다.

## 3. 문서상 계획 vs 실제 코드

| 주장 | 출처 | 등급 |
|---|---|---|
| shared Firebase Auth가 현재 Product 인증 | LoveBud #4004(열림)·#4006(열림) 코멘트, `SHARED_LOVE_PLATFORM_AUTHORITY.md` §2 | **라이브 코드+배포 확인** (401 실측) |
| Neon Auth 단계적 전환 | LoveBud #4006, `db/migrations/20260822054500_*` | 소스만 있고 **미배선**(`accountId: null`), 매핑 테이블 0행은 #4006 코멘트 보고 |
| 별도 LoveTree DB = `TRANSITIONAL_BRIDGE_NONCANONICAL`, 두 번째 영구 canonical 금지 | LoveBud #4004·#4005, `AGENTS.md:45-52`, `SHARED_LOVE_PLATFORM_AUTHORITY.md:33` | 오너 승인 정책(문서) |
| 세 번째 프런트 앱(4.0)용 클라이언트/테넌트 등록 | #4004 토폴로지는 LoveBud·LoveTree만 명시, `app_id`/`tenant_id` 컬럼 없음 | **문서와 스키마 모순** — 개념 없음 |
| LoveBud API의 CORS 허용 | `Access-Control-Allow-Origin`은 `docs/conversation/full/2026-04-17-*.md`에 인용된 과거 Netlify 함수에만 존재. 현행 `functions/`·`workers/`·`js/`는 git grep 0건, 라이브 응답 헤더에도 없음 | **문서=과거 사본, 코드=없음** |
| 4.0 "Worker/D1 어댑터로 교체" | `README.md:62`, `docs/HANDOFF.md:130` | 4.0에 어댑터 인터페이스 자체가 없음(동기 호출 6곳 포함) |
| `core/FRONTEND_BACKEND_BOUNDARY.md:16` "Target: Staged Neon Auth" | limone | 문서만, 코드 없음 |
| `src/0*`, `public/mvp/01/surfaces`, 4.0의 old 비교 자산 | 각 저장소 | 디자인 목업 코퍼스(인증·API 없음) — 구현으로 오독 금지 |

## 4. 후보 판정

| 후보 | 경로(커밋) | 판정 | 4.0의 순간·부모·관련 연결과 다른 점 |
|---|---|---|---|
| limone Firebase ID 토큰 검증기 | `core/runtime/server/api/auth.ts:131-236` @dd8394c5 | **그대로 재사용** | 신원만 담당 — 4.0 모델과 무관 |
| limone 소유권 가드 | `core/runtime/server/api/access.ts:76-151` @dd8394c5 | **그대로 재사용(표현만 4.0에 맞춤)** | 4.0은 소유자가 문서 단위를 소유, 트리가 곧 문서 |
| limone 정적 HTML 인증 호스트 | `lib/mvp-auth-host.ts`, `scripts/build-mvp-auth-host.mjs`, `public/mvp/01/index.html:36` @dd8394c5 | **수정 후 재사용(가장 유망)** | 이름·단일 전역 규약만 4.0에 맞게 변경 |
| `client_key` 멱등·결정적 id·재플레이 | `core/runtime/db/schema.ts:49,62,73,101`, `server/api/trees.ts:460-701` @dd8394c5 | **수정 후 재사용** | 4.0은 `importTrees`가 id를 재발급 → 먼저 중단해야 함 |
| LoveBud 라이브 API(`/api/trees` 등) | `functions/api/*` @b80647f1 | **제외(단, 소유권 가드·`social_idempotency` 참조)** | `links`/edge 없음, 순간 좌표가 `tree_hub_layouts.manual_positions` JSONB, `trees.id` TEXT vs `memories.tree_id` UUID 불일치(45 orphan 보고), CORS 없음 |
| LoveBud `app_account`/`app_auth_identity` 매핑 | `db/migrations/20260822054500_*` @b80647f1 | **제외(미배선)** | 4.0은 지금 raw Firebase UID를 그대로 키로 쓸 수밖에 없음 |
| Neon Auth 전환 | LoveBud #4006 프로토타입 브랜치 | **제외(보류 결정)** | — |
| D1 예제/`wrangler-v2.jsonc`/`app/chatgpt-auth.ts` | limone | **제외(미배선·죽은 경로)** | — |

## 5. 최소 변경 재사용안 (하나만)

**4.0을 limone Worker의 같은 오리진 안으로 들여, 기존 인증 호스트·검증기·가드·멱등성·배포 배선을 통째로 재사용한다.** 데이터는 새 테이블 하나(4.0 워크스페이스 문서)에 문서 단위로 담고, 순간을 `memories`로 분해하지 않는다.

- 바뀌는 것(4.0 쪽 4개 지점): `src/main.js:32-37`(저장 핸들→주입형 어댑터), `src/storage.js`(동기→서버 revision/if-match), `src/domain.js:146-154`(id 재발급 중단 + `client_key` 발급), 동기 `getItem/setItem` 6곳(`src/views/memory.js:3-16`, `src/views/shelf.js:21-42`).
- 바뀌는 것(저장소 쪽, 모두 작은 것): 정적 surface 등록 + 인증 호스트 script 태그, 문서 저장 엔드포인트 1개(`GET`/`PUT` by `owner_id` + revision), Firebase 승인 오리진 등록.
- 새로 만들지 않는 것: 로그인 화면, 토큰 검증기, 소유권 가드, 사용자 테이블, DB 인스턴스, CI/배포 배선.
- 이 안의 대가(정직하게): 데이터가 놓이는 저장소는 #4004 기준 `TRANSITIONAL_BRIDGE_NONCANONICAL`이다. canonical(LoveBud) 쪽으로 가려면 3개의 다른 저장소 변경 — CORS·승인 오리진·**`links`용 canonical DDL(프로덕션 파괴적 변경 게이트)** — 이 필요해 변경량이 더 크다. 어느 쪽을 고를지는 #13이 아니라 Owner 결정.

## 6. 그래도 신규 구현 대상(기존에 없는 것)

1. **관련 연결(`links`)의 서버 표현** — 두 스키마 어디에도 link/edge가 없다(직접 확인: LoveBud 커밋 전체 `CREATE TABLE` 목록에 없고 array/jsonb 연결 컬럼도 없음; limone `memories`는 `parent_id` + `connection_reason` 텍스트만, `schema.ts:66-104`). 4.0은 부모 1개 + 관련 연결 ≤20을 동시에 지켜야 한다.
2. **문서 단위 동시성 계약** — `expectedRaw`는 같은 브라우저 탭에서만 작동하고 `undefined`이면 무방책(`src/storage.js:24`, `src/main.js:37`). 서버 revision/if-match가 필요하다.
3. **id 안정성** — `importTrees`의 재발급을 멈추고 `client_key`로 승계.
4. **첫 로그인 시 기존 브라우저 기록 이관**과 복구 사본(`lovetree.v4.workspace.recovery.v1`) 정책의 서버판.
5. **4.0 기록의 소유자·공개 범위 필드** — 현재 `validateState` 6키 외에는 아무것도 저장하지 않는다(`src/domain.js:141`).
6. **갱신 시각** — 순간에 `createdAt`만 있어 충돌 해석·감사 시계로 쓸 수 없다.

## 7. 확인하지 못한 것

- 두 저장소의 **프로덕션 Neon 실제 컬럼·행 상태**(저널 밖 수동 SQL이 수행됐는지 소스로 증명 불가, `trees`의 검증된 `CREATE TABLE`이 커밋에 없음).
- Cloudflare Pages/Worker의 **실제 환경 변수·비밀 바인딩**(저장소 밖).
- Firebase **승인 오리진** 목록과 `lovebud.pages.dev`의 현행 HTML.
- Modal(`modal_compute`) 내부 소유권 검증 — 이 저장소 밖.
- 4.0 `npm test`/`npm run build` 미실행(이 단계의 패키지 설치 금지 지시). 문서-only 변경이며 회귀 위험은 이 문서 1개 파일에 한정된다.

### 이 조사의 실행 방법(재현)
`git ls-tree`/`git show`/`git grep`으로 각 main 커밋만 읽었고, 작업 트리는 변경하지 않았다. 검증용 라이브 요청은 자격 증명 없는 읽기 전용 GET 3건(`lovebud.pages.dev/api/trees` 401, `.../api/health` 404, `lovetree-limone.*.workers.dev/api/health` 200)이다.
