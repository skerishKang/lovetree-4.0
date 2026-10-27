# #13 재사용 조사 — 기존 로그인·DB·권한·배포 매핑 (2026-10-27)

상위: #1 · 대상 이슈: #13 · 이전 지시 "#13 서버 저장·로그인 설계"의 수정판.

조사 지시: 새 로그인·DB 설계를 앞서지 말고 기존 구현의 재사용 가능성을 먼저 확인한다. 이번 단계에서 하지 않은 것: 신규 저장소·DB·인증 서비스 생성, 패키지 설치, 코드 이식, `main` 병합, 배포, 운영 인증·DB 설정 변경. COM2의 PADIEM/Claw 서버·DB·프로세스·스케줄된 작업은 읽지도 건드리지도 않았다 — PADIEM은 커밋된 소스와 문서만 열었다. 비밀값은 읽지 않았고 이 문서에 옮기지 않는다(설정 파일의 키 이름과 경로만 적는다).

기준 커밋(각 `main`): lovetree-4.0 `8b40b429` · lovetree-limone `dd8394c5` · LoveBud `b80647f1` · PADIEM 정본 `skerishKang/ai-revenue-lab` `7b65cd24`.

개정: 2차(2026-10-27 Owner 방향 확정). §1·§3·§4·§5·§6·§7을 "PADIEM.net 공통 인증 재사용 + LoveBud/limone DB·API·권한 코드 재사용 + 러브트리 저장 API는 컴2 운영 + 현재 4.0 프런트 유지"에 맞게 다시 썼고, §2의 기존 조사 근거는 그대로 보존했다. 이전 판인 "임시 저장소 승인 vs LoveBud 운영 변경" 양자택일은 제거했다(성립하지 않는 프레임).

## 1. 결론

로그인·신원 검증·소유권 강제·멱등성·배포 배선은 이미 네 저장소에 있고 일부는 라이브로 돈다. 확정 방향은 **PADIEM.net 공통 인증 재사용 + LoveBud/limone의 기존 DB·API·권한 코드 재사용 + 러브트리 저장 API는 컴2에서 운영 + 현재 4.0 프런트 유지**이며, §5가 그 방향으로 다시 쓰였다. 이 방향에서 4.0이 인증을 다시 발명할 필요는 없다. 소스가 가리키는 신규 대상은 두 개 — `links`(관련 연결)의 서버 표현, 문서 단위 동시성 — 이고, 운영측 미해결은 하나다: 4.0의 공개 오리진이 컴2 API의 신원을 어떻게 받는가. PADIEM의 제품 세션은 host-only 쿠키에다 제품 단위 격리(Engine 방화벽)까지 걸려 있어, 출처를 다른 도메인으로 둔 크로스 오리진 재사용이 구조적으로 막혀 있다(§2 PADIEM, §5, §7).

## 2. 실제 구현과 검증 근거

### LoveBud `b80647f1` — LoveBud/LoveTree 플랫폼의 라이브 인증·데이터 권한(PADIEM과는 별개 권위)
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
- 정적 HTML용 인증 호스트: `lib/mvp-auth-host.ts:1-60` — 프레임워크 없는 HTML 셸(`public/mvp/01/index.html:36`)에 same-origin으로 번들된 `auth-host.js`를 실어 `window.__MVP01_GET_ACCESS_TOKEN__` 함수 하나만 설치한다. 토큰을 window/URL/Storage/로그에 남기지 않고, 발급 직전 uid 재비교로 계정 전환에 fail-closed. 정적 앱에 맞는 형태이긴 하나 **Firebase 세션에 묶여 있어 PADIEM 공통 인증에는 그대로 붙일 수 없다(§4에서 패턴만 참조)**.
- 멱등·재플레이: `core/runtime/db/schema.ts:49,62` `trees.client_key` 소유자별 unique, `:73,101` `memories.client_key` `(tree_id, client_key)` unique, `POST /api/trees/with-first-memory` 결정적 id + 원자적 재플레이 상태 기계(`trees.ts:460-701`).
- 스키마: 12개 테이블(`schema.ts:44-283`) — `trees/memories/reactions/comments/tree_comments/tree_likes/tree_social_counts/tree_view_dedup_events/social_idempotency/social_rate_limits/social_audit_log`. **link/edge·문서 blob 테이블 없음.** `visibility`는 `private|unlisted|public` 3단계(`:15`). `owner_id`는 `trees`에만 있고 `memories`는 부모 트리로 소유를 유도.
- 마이그레이션: Drizzle `schema.ts`가 진실 소스, `drizzle/meta/_journal.json` 4개(수동 작성본 `0002_neon_dev_schema_reconciliation.sql`은 저널 밖), CI는 `npm run db:check`만 실행, 실제 적용은 `psql -f ops/releases/sort-order/production-expand.sql` 수동(Expand/Contract/Re-forward 규칙).
- 배포·라이브: Worker `lovetree-limone`(`wrangler.jsonc`), `push → main` 시 `production-auto-deploy.yml`이 `--confirm-worker lovetree-limone --execute` + readiness + smoke. 2026-10-07 05:40Z 커밋 dd8394c5에서 워크플로 성공. 라이브 확인: `GET https://lovetree-limone.charliekant.workers.dev/api/health` → **200 `{"status":"ok","env":"production"}`**, `/api/trees` → **401**, ACAO 없음.

### PADIEM `skerishKang/ai-revenue-lab` main `7b65cd24` — 공통 인증의 실제 계약

정본 주소는 Owner가 지시한 대로 `https://github.com/skerishKang/ai-revenue-lab`(main `7b65cd24`)이고, 컴2 마이그레이션 노트도 같은 저장소의 `origin/main`을 기준 revision으로 적는다(`D:\PADIEM-Servers\MIGRATION_STATUS_20261017.md` "Main source revision: 0c8733245 (`skerishKang/ai-revenue-lab` origin/main when archived)"). PADIEM 호스트에는 요청을 보내지 않았고 컴2 서버·DB·프로세스는 읽지 않았다. 근거는 커밋된 소스와 문서만이다.

- **공통 인증 = Shared Control Plane의 정체성·세션 권위**이지 쿠키 라이브러리가 아니다. `packages/padiem-control-plane/padiem_control_plane/auth_sessions.py:1-20` — 이 계약은 쿠키·OAuth·비밀번호·Bearer를 전혀 싣지 않고, 각 제품이 **자기 인증 어댑터로 신원을 확립한 뒤** 신뢰할 수 있는 경계 지어진 세션 사실만 기록한다. 불변 조건: 브라우저 상태는 절대 canonical 신원의 권위가 아님, 만료·폐기는 명시적이고 단조, 단절된 세션은 재활성화 불가, `tenant_id`는 기본값도 `product_id`/subject 별칭도 없으며 **canonical tenant 생산자가 생기기 전까지는 부재**.
- **제품별 연결 방식(B62 Chat)**: `apps/padiem-chat/app/auth.py:55-79` HMAC-SHA256 서명 토큰(purpose `padiem-chat/session/v1`, payload `{v:1,uid:"usr_…",exp,sid?}`) — 서명과 만료 외에는 전부 fail-closed(`:63-79`, `:116-144`). 전송 규격 `:209-220` — `HttpOnly`, `SameSite=Lax`, `path=/`, `max_age`, **Secure는 배포 소유**(COM2 loopback HTTP 런타임에서는 False). 로그인 경로 `apps/padiem-chat/app/auth_routes.py:280`(Google 시작)·`:426`(Google 콜백)·`:677`(비번 등록)·`:758`(비번 로그인), 세션 발급 `:486`·`:668-673`·`:526`, 로그인 후 Control Plane 브리지 `:296`·`:355`·`:386`, 비번 재설정 시 canonical 세션 전량 폐기 `:138`. `apps/padiem-chat/app/control_plane_identity.py:1-9,27` — Chat은 자기 Google OAuth·서명 호환 쿠키·제품 user row·history/project 소유권을 유지하고 canonical subject/session은 주입된 서버 신뢰 권위에서만 받는다. `PADIEM_CHAT_PRODUCT_ID = "b62"`, 신뢰 provider 열거는 `{google, password}`(`:57`) — **Firebase ID 토큰 검증 경로는 이 제품에 없다.**
- **제품별 연결 방식(B54 Claw)**: `packages/padiem-control-plane/padiem_control_plane/b54_identity_bridge.py:1-34,51` — fail-closed 사슬 `resolve_or_create_product_link(product_id="b54-padiem-claw")` → `IdentityLinkState.ACTIVE` → `CanonicalSubjectRef` → `resolve_active_memberships`(정확히 1이면 사용, 0이면 personal-tenant 정책, >1이면 닫힘) → `establish_auth_session` → product/subject/tenant 3중 가드. `:13-15` — **세션은 권위 수준에서 제품 단위로 격리되고 Engine 방화벽(`auth_session.product_id == app_id`)이 제품 간 세션을 무조건 거부하므로 B62와 세션 상태를 공유하지 않는다.** `apps/padiem-chat/app/b54_canonical_session.py:1-28,69-90` — `product_user_id`·`provider_subject`·`subject_id`·`tenant_id`·`product_id`와 canonical session id는 query·body·cookie에서 절대 읽지 않고 서버 검증 행에서만 만든다.
- **참고 사례(B64, TypeScript Worker)**: `apps/ai-reward-router/src/income-pipeline/padiem-session-auth.ts:1-26` — Chat의 쿠키·비밀·purpose를 그대로 검증하는 재사용 선례지만, host-only 쿠키 때문에 **B64가 그 오리진에서 서빙될 때만** 도달하고 그 외에는 fail-closed다. 러브트리가 갈 길은 아니다(Chat의 쿠키·비밀키 복사 금지).
- **기록 소유자 매핑**: canonical 개인 손잡이는 `CanonicalSubjectRef`의 `subject_id`(`contracts.py:32-36`, `SubjectType`은 `anonymous|user|account`), 제품 user row와 잇는 손잡이는 `ProductIdentityLink(product_id, product_user_id, provider, provider_subject)`. 식별자 규격: safe identifier ≤128(`contracts.py:10`), `MAX_PRODUCT_USER_ID_CHARS=256`(`:12`), **`MAX_IDEMPOTENCY_KEY_CHARS=256`(`:14`) — 멱등성 키가 이미 공통 계약에 존재한다.** 4.0 기록의 소유권 키는 `(러브트리 제품 ID, product_user_id) → subject_id`(+tenant, 생산자가 있을 때)로 잡는다. LoveBud에서 만들지 못한 `accountId` 매핑에 해당하는 것이 여기 이미 배선돼 있다.
- **컴2 이전 상태(커밋된 것만)**: `deploy/host-com2/`에 커밋된 호스팅 정의는 `b14/`(cloudflared·systemd 예시 포함)와 `file-lane/` 두 개뿐 — chat·identity·Control Plane의 컴2 네이티브 호스팅 정의가 없다. `MIGRATION_STATUS_20261017.md`는 컴2 localhost에서 B14 18717·B62 18764·P01 18731 검증됐다고 적고, 막힌 항목으로 "Cloudflare D1/R2 persistence, central identity, broker, OAuth … not migrated", "No public HTTPS reverse proxy or production traffic switch; `chat.padiem.net` remains unchanged"를, 실행 순서 1·2로 "no user-controllable identity headers"와 "Control Plane Identity, Broker, OAuth and durable D1/R2 storage available to COM2"를 둔다.

### lovetree-4.0 `8b40b429` — 교체 대상 현재 지면
- 저장소의 유일한 localStorage 접점: `src/main.js:33`. 네트워크 호출·`ownerId`/`token`/`session`어휘가 `src/`·`tests/`·`index.html`에 **0건**(grep 확인).
- 동기 저장·낙관 동시성: `src/storage.js:5-19` `loadState`, `:20-30` `saveState`, `:24` `expectedRaw` 문자열 일치(같은 브라우저 탭 한정, `undefined`이면 무방책), 복구 사본 `:12-17`.
- 데이터: 트리 6키 외 저장 안 함(`src/domain.js:141` 화이트리스트) — 소유자·공개 범위 필드 없음. 순간 `parentId` 하나 + `links[]`(≤20, 양쪽 미러 `:88`, `MAX_LINKS` `:4`). 시점은 `createdAt`만(갱신 시각 없음). `importTrees`(`:146-154`)는 **새 사본을 만드는 동작이 목적**이라 id를 재발급한다(이미 정해진 의도된 동작). 서버 동기화에는 다른 경로로 id를 운반해야 한다(§6-5).
- 배포: Cloudflare Pages `lovetree-4-0`(`docs/DEVELOPMENT.md:61`, `docs/HANDOFF.md:78,84-89`). 이 주장은 실측으로 뒷받침된다 — PR #35의 checks에 `Cloudflare Pages` 항목이 붙어 같은 프로젝트의 미리보기 빌드가 통과했다. 저장소에는 `wrangler.*`·`_headers`·`functions/`가 없고 `.github/workflows/ci.yml`에도 배포 단계가 없다. 즉 배포는 GitHub Actions가 아니라 Pages Git 연결이 담당하며, 서버 구성은 저장소 밖에 있다.

## 3. 문서상 계획 vs 실제 코드

| 주장 | 출처 | 등급 |
|---|---|---|
| shared Firebase Auth가 현재 Product 인증 | LoveBud #4004(열림)·#4006(열림) 코멘트, `SHARED_LOVE_PLATFORM_AUTHORITY.md` §2 | **LoveBud/LoveTree 플랫폼 한정 라이브 확인**(401 실측). PADIEM의 공통 인증은 아님 |
| PADIEM 공통 인증도 Firebase 토큰을 쓴다 | `apps/padiem-chat/app/control_plane_identity.py:57` provider 열거 `{google, password}`, `auth.py`·`auth_routes.py` 전 경로에 Firebase 검증 없음 | **코드에 없음** — 초기 Firebase 문서만 보고 인증 방식을 정하면 틀린다 |
| 다른 제품의 로그인 세션을 그대로 빌려 쓴다 | `b54_identity_bridge.py:13-15`(Engine 방화벽 `product_id == app_id`, B62와 세션 공유 안 함), `padiem-session-auth.ts:1-26`(B64는 같은 오리진에서 서빙될 때만 도달) | **구조적으로 차단** — 빌리는 길이고 제품별로 자기 연결이 있다 |
| 세 번째 프런트 앱(4.0)용 클라이언트/테넌트 등록 | LoveBud #4004 토폴로지는 LoveBud·LoveTree만 명시, `app_id`/`tenant_id` 컬럼 없음. **PADIEM에는 제품 ID 등록이 실제로 존재**(`b62`, `b54-padiem-claw` + `resolve_or_create_product_link`) | LoveBud 쪽은 모순, PADIEM 쪽은 **개념 있음(제품 ID 할당은 권위 소유자 결정)** |
| Neon Auth 단계적 전환 | LoveBud #4006, `db/migrations/20260822054500_*` | 소스만 있고 **미배선**(`accountId: null`), 매핑 테이블 0행은 #4006 코멘트 보고 |
| 별도 LoveTree DB = `TRANSITIONAL_BRIDGE_NONCANONICAL`, 두 번째 영구 canonical 금지 | LoveBud #4004·#4005, `AGENTS.md:45-52`, `SHARED_LOVE_PLATFORM_AUTHORITY.md:33` | LoveBud 플랫폼 정책(문서). 이번 확정 방향의 기준선은 PADIEM이므로 이 정책과 대립하는 선택지로 다루지 않는다 |
| `tenant_id`가 언제든 쓰인다 | `auth_sessions.py:15-19` — canonical tenant 생산자가 생기기 전까지 **부재**가 기본 | 계약상 없음 — 소유권 키는 `subject_id`로 잡는다 |
| LoveBud API의 CORS 허용 | `Access-Control-Allow-Origin`은 `docs/conversation/full/2026-04-17-*.md`에 인용된 과거 Netlify 함수에만 존재. 현행 `functions/`·`workers/`·`js/`는 git grep 0건, 라이브 응답 헤더에도 없음 | **문서=과거 사본, 코드=없음** |
| 4.0 "Worker/D1 어댑터로 교체" | `README.md:62`, `docs/HANDOFF.md:130` | 4.0에 어댑터 인터페이스 자체가 없음(동기 호출 6곳 포함) |
| `core/FRONTEND_BACKEND_BOUNDARY.md:16` "Target: Staged Neon Auth" | limone | 문서만, 코드 없음 |
| `src/0*`, `public/mvp/01/surfaces`, 4.0의 old 비교 자산 | 각 저장소 | 디자인 목업 코퍼스(인증·API 없음) — 구현으로 오독 금지 |

## 4. 후보 판정

| 후보 | 경로(커밋) | 판정 | 4.0의 순간·부모·관련 연결과 다른 점 |
|---|---|---|---|
| PADIEM Control Plane identity bridge | `packages/padiem-control-plane/padiem_control_plane/b54_identity_bridge.py:1-51`, `apps/padiem-chat/app/control_plane_identity.py:1-90` @7b65cd24 | **패턴 재사용** — 러브트리 전용 제품 ID로 자기 브리지를 두고 같은 사슬(`resolve_or_create_product_link` → `CanonicalSubjectRef` → `establish_auth_session`)을 탄다 | 제품 격리와 세션 권위는 4.0 모델과 무관. 기록 소유권 키를 `subject_id`로 얻는 통로 |
| PADIEM 세션·신원 계약 | `auth_sessions.py:1-50`, `contracts.py:10-16`, `apps/padiem-chat/app/auth.py:55-144` @7b65cd24 | **계약 그대로 재사용** — purpose가 붙은 HMAC 서명 + fail-closed, safe identifier ≤128, `MAX_IDEMPOTENCY_KEY_CHARS` 멱등성 키 | 4.0에는 id·멱등 개념이 아직 없다(§6-5) |
| Chat의 `padiem_session` 쿠키·비밀 | `apps/padiem-chat/app/auth.py:209-220`, `apps/ai-reward-router/src/income-pipeline/padiem-session-auth.ts:1-26` @7b65cd24 | **제외** — 복사 금지(Owner 지시), Engine 방화벽이 제품 간 세션을 무조건 거부(`b54_identity_bridge.py:13-15`) | 4.0은 자기 경계에서 자기 신원을 받는다 |
| B54 서버측 로그인 증거 생성자 | `apps/padiem-chat/app/b54_canonical_session.py:69-90` @7b65cd24 | **재사용 기준** — 의도된 두 생성자만 허용하고 query·body·cookie 신원을 차단 | 4.0은 아직 신원이 없는 로컬 앱이므로 그대로 맞출 지점 |
| limone Firebase ID 토큰 검증기 | `core/runtime/server/api/auth.ts:131-236` @dd8394c5 | **판정 보류** — PADIEM의 실제 계약은 provider `{google, password}`에 서버측 OAuth 교환이고 Firebase 검증 경로가 없다(`control_plane_identity.py:57`). LoveBud/LoveTree 신원을 쓸 때만 성립 | 검증 대상 토큰이 다르면 재사용도 없다 |
| limone 소유권 가드 | `core/runtime/server/api/access.ts:76-151` @dd8394c5 | **그대로 재사용(표현만 4.0에 맞춤)** | 4.0은 소유자가 문서 단위를 소유, 트리가 곧 문서 |
| LoveBud 소유권 가드·멱등 테이블 | `functions/_shared/tree-delete-direct-neon.js:142-144`, `social_idempotency`/`client_key` @b80647f1 | **수정 후 재사용** — 가드 문구와 재플레이 규칙을 가져온다 | 재사용 지점은 스키마가 아니라 가드·멱등 |
| limone 정적 HTML 인증 호스트 | `lib/mvp-auth-host.ts:1-60`, `scripts/build-mvp-auth-host.mjs`, `public/mvp/01/index.html:36` @dd8394c5 | **패턴만 참조** — Firebase 세션에 묶여 PADIEM 계약에는 맞지 않는다. 남길 것은 토큰을 window·URL·Storage·로그에 남기지 않고 발급 직전 바인드 재비교로 fail-closed하는 규약 | 4.0이 정적 Pages라는 점만 같고 인증 공급자가 다르다 |
| `client_key` 멱등·결정적 id·재플레이 | `core/runtime/db/schema.ts:49,62,73,101`, `server/api/trees.ts:460-701` @dd8394c5 | **수정 후 재사용** — `importTrees`의 id 재발급은 '새 사본'의 의도된 동작이라 건드리지 않고, 동기화 경로는 별도 id·멱등 규칙으로 승계(§6-5) | 재발급과 동기화를 한 규칙으로 묶으면 사본 만들기가 깨진다 |
| LoveBud 라이브 API(`/api/trees` 등) | `functions/api/*` @b80647f1 | **제외** | `links`/edge 없음, 순간 좌표가 `tree_hub_layouts.manual_positions` JSONB, `trees.id` TEXT vs `memories.tree_id` UUID 불일치(45 orphan 보고), CORS 없음 |
| LoveBud `app_account`/`app_auth_identity` 매핑 | `db/migrations/20260822054500_*` @b80647f1 | **제외(미배선)** — 제품 간 개인 매핑은 PADIEM Control Plane이 이미 배선돼 있다 | 4.0은 raw Firebase UID를 키로 쓰지 않는다 |
| Neon Auth 전환 | LoveBud #4006 프로토타입 브랜치 | **제외(보류 결정)** | — |
| D1 예제/`wrangler-v2.jsonc`/`app/chatgpt-auth.ts` | limone | **제외(미배선·죽은 경로)** | — |

## 5. 권장안 — PADIEM 공통 인증 + 기존 DB·API 재사용 + 컴2 저장 API + 현재 4.0 프런트

이전의 "4.0을 limone Worker 오리진 안으로 옮긴다" 권고는 **취소**한다. 프런트 이동은 요구하지 않는다. 확정 방향을 네 갈래로 옮긴다.

1. **PADIEM 공통 인증 연결(인증은 재사용, 신원은 제품 고유)** — LoveTree는 자기 제품 ID를 가진다(값 할당은 Control Plane 소유자 결정이고 이 문서에서 이름을 정하지 않는다). 연결 방식은 B54가 이미 배선한 것과 똑같다: 서버가 확립한 로그인 증거(`provider`는 `{google, password}` 닫힌 열거) → `resolve_or_create_product_link` → `IdentityLinkState.ACTIVE` → `CanonicalSubjectRef` → `establish_auth_session`(`b54_identity_bridge.py:17-34`). Chat의 쿠키·비밀·purpose를 복사하지 않고 `b62`/`b54-padiem-claw` 제품 ID를 전용하지 않는다 — Engine 방화벽(`auth_session.product_id == app_id`)이 제품 간 세션을 무조건 거부하므로 애초에 빌릴 수 없다(`b54_identity_bridge.py:13-15`).
2. **기존 LoveBud/limone DB·API·권한 코드 재사용** — 소유권 가드 형태(`limone core/runtime/server/api/access.ts:76-151`, `LoveBud functions/_shared/tree-delete-direct-neon.js:142-144`), `client_key`와 멱등 재플레이(`limone core/runtime/db/schema.ts:49,62,73,101`, `LoveBud social_idempotency`), 그리고 4.0 도메인 검증(`src/domain.js:109-154`의 `validateState`)을 서버에서 그대로 다시 쓴다. 저장 API가 받을 신원·멱등 키의 길이와 문자 규격은 PADIEM 공통 계약(`contracts.py:10-16`)을 따른다.
3. **러브트리 저장 API는 컴2에서 운영** — 4.0의 워크스페이스 문서를 문서 단위로 받는 API(로그인·신원 확립은 1에 위임). 컴2에 필요한 것은 마이그레이션 노트의 실행 순서 1·2 그대로다: 사용자 조종이 가능한 인증 헤더를 배제한 네이티브 ingress와 서버 간 인증, Control Plane Identity·Broker·OAuth·durable D1/R2의 컴2 제공(`MIGRATION_STATUS_20261017.md`, `deploy/host-com2/`에는 현재 `b14/`와 `file-lane/`만 커밋돼 있다). "인증 외 대부분은 컴2 서버 운영"이라는 방향과 맞는다.
4. **현재 4.0 프런트 유지 + 로컬 우선 저장 유지** — `lovetree-4-0.pages.dev`를 그대로 쓴다. `src/storage.js`를 async 어댑터로 갈아치우면 동기 호출 6곳(`src/views/memory.js:3-16`, `src/views/shelf.js:21-42`)까지 함께 고쳐야 한다. 더 작은 방법은 로컬 저장을 캐시로 남기고 그 위에 동기화 계층을 얹는 것: 손대는 지점은 `src/main.js:32-37`의 저장 핸들과 `commit` 하나, `src/storage.js`의 회수 시점, 동기화 모듈 신설 — 3개다.

### 남는 설계 문제 하나: 4.0 오리진과 저장 API 사이의 신원 전달

소스만으로는 결정할 수 없고, 확인한 제약은 분명하다.

- Chat 세션은 `HttpOnly; Secure; SameSite=Lax`에 Domain 속성이 없는 host-only 쿠키다(`auth.py:209-220`). Pages 오리진에서 다른 호스트로 호출하면 브라우저가 쿠키를 싣지 않는다.
- B64(TypeScript Worker)가 택한 재사용 방법은 **같은 오리진에서 서빙되는 것**뿐이었다(`padiem-session-auth.ts:1-26`) — 4번(프런트 유지)과 충돌한다.
- LoveBud·limone API는 `Access-Control-Allow-Origin`을 보내지 않는다(§2 실측). 크로스 오리진 호출은 상대 쪽 허용 추가가 필요하다.
- PADIEM에는 제품 고유 세션 손잡이가 이미 있다(`auth_sessions.py:1-20` 제품 스코프, `auth.py:82-144`에서 `sid`를 폐기 손잡이로 사용).

선택지는 셋이고 결정은 API·Control Plane 소유자 몫이다. (a) 러브트리 제품 ID로 발급된 **러브트리 고유의 first-party credential**을 러브트리 자기 경계에서 발급·검증(쿠키·비밀 공유 없음), (b) 4.0 Pages 오리진에 동등한 러브트리 로그인·세션 엔드포인트를 두고 `Access-Control-Allow-Origin`을 러브트리 오리진으로 한정 허용, (c) 4.0 Pages에 작은 프록시를 두어 API를 same-origin으로 보이게 하되 신원의 권위는 계속 컴2에 둔다. 공통 인증을 다시 발명하지 않는다는 조건에서는 (a)·(b)가 PADIEM 선례에 가장 가깝다.

## 6. 필요한 차이만 정리 — DB 연결 · links 저장 · 기기 간 충돌 · ID와 멱등성

1. **관련 연결(`links`)의 서버 표현이 기존에 없다** — 근거: LoveBud 커밋 전체 `CREATE TABLE` 목록에 link/edge가 없고 array/jsonb 연결 컬럼도 없음; limone `memories`는 `parent_id` + `connection_reason` 텍스트만(`schema.ts:66-104`). 4.0은 부모 1개 + 관련 연결 ≤20을 동시에 지켜야 한다.
2. **`links` 저장은 "변경 내용"과 "기존 데이터 영향"을 분리한다** — 새 테이블(`tree_id`, `moment_id`, `target_moment_id`, `kind`, 소유 손잡이, 인덱스)을 **추가**하는 변경이고, 기존 행·기존 컬럼을 고치지 않는다. 러브트리 저장 API는 처음 여는 저장소라 이전 대상 기존 행이 0이며, 첫 increment의 실제 데이터 영향은 없다. 같은 것을 LoveBud canonical 테이블에 붙일 때만 그쪽 프로덕션 DDL이 되어 파괴적 변경 게이트를 탄다 — 두 경우를 한 단어로 섞지 않는다. 지켜야 할 불변은 4.0에 이미 있다: `MAX_LINKS` 20, 자기 자신 금지, 없는 id 금지, **양쪽 미러**와 삭제 시 정리(`src/domain.js:77-107`). 서버가 한쪽만 지우면 미러가 깨진다.
3. **DB 연결** — 재사용할 형태는 두 자매 저장소가 이미 쓰고 있는 패턴이다: Neon Postgres 직결 + **읽기/쓰기 연결 분리**(LoveBud `LOVE_PLATFORM_DATABASE_URL` / `LOVE_PLATFORM_WRITE_DATABASE_URL`, forbidden-fallback 목록 포함), 금지된 기본값으로 몰래 떨어지지 않게 하는 E2E 안전 게이트(`limone core/runtime/server/api/e2e-safety.ts:10-13,43-101` — Neon hostname allow/deny로 테스트가 프로덕션을 건드릴 수 없다), Expand/Contract/Re-forward 마이그레이션 순서(`limone ops/releases/sort-order/`). PADIEM 쪽 내구성 저장소는 D1(`padiem-chat-db`, `padiem-engine`)이고 LoveBud에는 D1/KV/R2가 없다. 필요한 차이는 러브트리 문서 테이블 한 개(소유 손잡이 `subject_id`, 제품 ID, revision, `client_key`)이고, 실제 연결 문자열·바인딩·스케줄은 컴2 소관이라 이 문서에서 정하지 않는다.
4. **문서 단위 동시성** — `expectedRaw`는 같은 브라우저 탭에서만 작동하고 `undefined`이면 무방책이다(`src/storage.js:24`, `src/main.js:37`). 서버에서는 문서 revision + if-match, 그리고 409를 사용자에게 알리는 경계가 새로 필요하다. 순간별 merge는 하지 않는다(문서 단위 낙관 잠금). 재사용 근거: `limone`은 갱신·삭제 전에 소유권을 재조회한 뒤 행 필터(`server/api/trees.ts:216-249`), 결정적 id로 재플레이를 원자적으로 처리(`:460-701`).
5. **ID와 멱등성 — 동기화와 최초 이전은 `importTrees`와 별개 규칙이다** — `importTrees`의 id 재발급은 "새 사본 가져오기"라는 기능의 의도된 동작이므로 **유지**한다(`src/domain.js:146-154`, links id도 재매핑). 별도로 정할 것:
   - *동기화 id*: 같은 기기에서 서버로 올라가는 편집 경로에서 순간 id는 불변하다(클라이언트 발급 UUIDv4, `src/domain.js:7-15`).
   - *멱등 손잡이*: `client_key`는 재시도 판별용이지 id가 아니다. 이 분리는 두 저장소에 이미 있다(`limone core/runtime/db/schema.ts:101` `uniqueIndex(memories_tree_client_key_uniq)`, PADIEM `contracts.py:14` `MAX_IDEMPOTENCY_KEY_CHARS`).
   - *최초 이전*: 브라우저 blob 한 벌을 `(제품 ID, subject_id, 문서 id, client_key)`로 1회 효과에 묶어 재시도가 중복 문서를 만들지 않게 한다.
   - *사본 가져오기*: 지금처럼 id 재발급 — 서버에는 새 문서로 올라간다.
6. **소유자·공개 범위·갱신 시각** — 소유 손잡이는 `(제품 ID, product_user_id) → subject_id`로 잡는다(`tenant_id`는 생산자가 있을 때만 — `auth_sessions.py:15-19`). 4.0 기록은 지금 `validateState` 6키 외에는 아무것도 저장하지 않아 소유자·공개 범위가 없다(`src/domain.js:141`). 공개 범위 값 자릿수는 리모네가 `private|unlisted|public` 3단계를 이미 갖고 있어(`core/runtime/db/schema.ts:15`) #15에서 같이 정한다. 순간에 `updatedAt`가 없어(트리만 보유 — `src/domain.js:53,59`) 충돌 해석과 감사 시계가 불가능하다.

## 7. 확인하지 못한 것

- **러브트리 제품 ID**: 값·할당 절차·누가 Control Plane에 등록하는지 소스에 없다(확인된 것은 `b62`, `b54-padiem-claw` 두 개뿐). Owner·권위 소유자 결정.
- **4.0 오리진용 credential 전달**: PADIEM 안에 "다른 오리진의 브라우저가 제품 세션을 받는다"는 선례가 없다(§5 남는 설계 문제). 이 문서에서 방식을 단정하지 않았다.
- **Control Plane Identity·Broker·OAuth·D1/R2의 컴2 제공 시점**: 마이그레이션 노트 기준 미이관. `deploy/host-com2/`에는 `b14/`와 `file-lane/`만 커밋돼 있다.
- **`tenant_id` 생산자**: 계약상 부재가 기본(`auth_sessions.py:15-19`) — 소유권 키에 tenant가 들어갈 수 있는 시점 미확인.
- 두 자매 저장소의 **프로덕션 Neon 실제 컬럼·행 상태**(저널 밖 수동 SQL이 수행됐는지 소스로 증명 불가, `trees`의 검증된 `CREATE TABLE`이 커밋에 없음).
- Cloudflare Pages/Worker의 **실제 환경 변수·비밀 바인딩**(저장소 밖).
- Firebase **승인 오리진** 목록과 `lovebud.pages.dev`의 현행 HTML.
- Modal(`modal_compute`) 내부 소유권 검증 — 이 저장소 밖.
- 4.0 `npm test`/`npm run build` 미실행(이 단계의 패키지 설치 금지 지시). 문서-only 변경이며 회귀 위험은 이 문서 1개 파일에 한정된다.

### 이 조사의 실행 방법(재현)

`git ls-tree`/`git show`/`git grep`으로 각 `main` 커밋만 읽었고 작업 트리는 변경하지 않았다. PADIEM은 blobless clone(`--filter=blob:none --no-checkout`)으로 `origin/main` `7b65cd24`의 커밋된 소스와 문서만 열었고, **PADIEM·COM2 호스트로의 요청은 0건**, 컴2 서버·DB·프로세스·스케줄된 작업은 읽지도 건드리지도 않았다. 자매 저장소 쪽 검증용 요청은 자격 증명이 없는 읽기 전용 GET 3건(`lovebud.pages.dev/api/trees` 401, `.../api/health` 404, `lovetree-limone.*.workers.dev/api/health` 200)이다.
