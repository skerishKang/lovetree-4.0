# 러브트리 계정 탈퇴·작업공간 문서 삭제 설계·근거 (2026-11-03)

범위: 로그인한 이용자가 러브트리 데이터와 서비스 연결을 지우는 경로, Chat이 서명 RPC로
러브트리 데이터를 지우는 수신 경로, 작업공간 문서(트리) 하나를 지우는 서버 경로.
구현: `POST /api/account/delete`, `POST /internal/account/delete`, `GET /api/account`,
`DELETE /api/workspace/trees/<treeId>` (`server/account-service.js`, `server/http.js`,
`server/shared-account-deletion.js`, `server/db/account-postgres.js`), 화면: 내 기록 패널 > 계정 탈퇴.

## 0. 경로 계약

- 로그인 세션 필수. 탈퇴 POST는 `origin`이 `LOVETREE_PUBLIC_ORIGIN`(또는
  `LOVETREE_ADDITIONAL_PUBLIC_ORIGINS`)의 닫힌 목록에 있을 때만 실행한다(미디어 쓰기와 같은 경계).
- 본문 `{"confirm": "<확인 값>"}`이 서버가 정한 확인 값과 일치할 때만 실행된다.
  이것이 "복구 불가 파괴는 실행 전 한 번 확인"이다.
- 확인 값은 공통 로그인이 이 제품에 넘겨 준 **이메일**이 있으면 그 이메일, 없으면 고정 문구
  **`탈퇴합니다`**다(2026-11-03 CTO 판정). canonical subject는 사용자가 알 수 없는 내부 값이므로
  확인 값으로 쓰지 않는다. 이메일은 앞뒤 공백과 대소문자 차이만 인정하고, 고정 문구는 정확히
  일치해야 한다(‘탈퇴’, ‘탈퇴합니다.’ 등은 400).
- `GET /api/account`는 확인 방식(`confirmKind`: `email` 또는 `phrase`)만 알려 주고 사용자 식별자는
  내보내지 않는다(`subject` 응답 없음 — 시험으로 고정). 이메일 방식에서만 `email`을 함께 준다.
- 러브트리는 이메일을 저장하지 않고 공유 access 토큰도 `sub`·`account_id`·`sid`만 싣는다.
  그래서 기본 배포의 화면은 “확인을 위해 ‘탈퇴합니다’를 입력하세요”를 보여 주고 같은 문구를
  받아 대조한다. 이메일을 싣는 배포에서는 서버·화면이 자동으로 이메일 확인 방식으로 바뀐다.
- 실행 순서: 출처 검사 → 본문 확인 → 확인 값 일치 → 관리자 차단 → 활성 제품 연결 조회 →
  한 트랜잭션의 명시 삭제 12표 + 탈퇴 기록 1행 → 커밋 → 미디어 정리 → Auth 세션 사전 폐기 →
  Control Plane에서 러브트리 연결 해제 → 마지막 연결이면 Auth 계정 최종 파기 → 세션 쿠키 삭제.
  Auth 사전 단계는 5분 잠금·세션 폐기만 하며, Control Plane은 마지막 연결 해제 때 Auth 준비
  식별자를 요구한다. 연결 해제가 성공한 뒤 계정 매핑과 해시·시각 탈퇴 기록을 확정한다. 연결 해제가 실패하면 Auth 잠금을 해제해 다시 로그인·재시도할 수 있다.
- 관리자 차단: `lovetree_product_roles`에 `admin` 행이 있는 계정은 403
  `account_delete_admin_blocked`. 역할 판정은 요청마다 신원에 견주어 다시 확인한다(기존 `admin-roles.js`).
  공통 전체 탈퇴 요청은 Chat에서만 제공하며 Chat 중앙 관리자 이메일·`platform_admin_roles`도 차단한다.
- 남기는 기록은 최소: `lovetree_account_deletions`에 탈퇴 시각과 사용자 id의 SHA-256 해시 1행.
  이메일·subject 원문은 저장하지 않는다. 보존 기간은 1년이다.
- 러브트리 탈퇴는 러브트리 연결만 끊는다. 다른 공통 로그인 서비스 연결이 남으면 공통 계정은 유지하고,
  마지막 연결이면 공통 계정과 인증 세션을 폐기한다. 모든 서비스 탈퇴는 Chat 설정 > 계정에서 요청한다.

## 0.1 공통 계정 저장과 서비스 연결

| 영역 | 저장·연결 | 삭제 처리 |
|---|---|---|
| 공통 계정 정본 | Control Plane Identity Durable Object의 canonical subject와 제품별 active product link | 서비스 탈퇴는 제품 링크 하나를 해제하고, 마지막 링크 제거가 canonical subject를 파기한다 |
| 공통 로그인 | padiem-auth의 Google 지문→canonical account 매핑, Durable Object별 refresh 세션 및 계정별 세션 색인 | 마지막 링크 제거 전에 색인된 refresh 세션을 폐기하고 연결 삭제 성공 뒤 Google 매핑·해시/시각 감사 기록을 확정한다 |
| Chat·Claw·북AI | Chat D1의 `users.provider_subject='shared:'+subject`, `auth_account_link_cache`; 북AI 서버 기록은 같은 subject의 `bookai_records` | Chat 탈퇴는 Chat·Claw 데이터와 계정 저장 북AI 기록을 삭제한다. 전체 탈퇴 요청도 이 경로를 거친다 |
| 러브트리 | LoveTree PostgreSQL 사용자 자료는 canonical subject로 연결되며 `lovetree_product_roles`는 제품별 관리자 권한이다 | Chat의 서명된 내부 호출은 러브트리 자료만 지운다. Control Plane 링크 제거는 Chat 오케스트레이터가 수행한다 |
| CGI 쇼핑몰 | 자체 회원 계정과 Google OAuth; 공통 계정의 제품 연결은 없음 | 공통 계정 탈퇴에서 제외되며 CGI 자체 탈퇴·거래 기록 절차를 따른다 |

Chat의 서비스별 탈퇴는 Chat 제품 링크만 제거하고 다른 활성 링크가 있으면 공통 계정을 유지한다.
전체 탈퇴는 Chat에서 러브트리 데이터 삭제 요청을 먼저 보내고 Chat·북AI 데이터를 지운 뒤,
러브트리 연결을 Chat 연결보다 먼저 해제한다. 마지막 연결에서 Auth 세션·매핑을 폐기한다.
서명 검증·요청 시각·UUID 재생 방지·관리자 차단은 서비스 내부 요청에서도 유지된다.

## 1. 왜 CASCADE에 기대지 않는가

`server/db/schema.sql`의 표들은 FK·ON DELETE CASCADE 선언에 의존하지 않는다. 운영 DB의 제약 상태가
배포마다 같다는 보장이 없고, 선언이 있어도 삭제 순서·범위를 코드에서 확인할 수 없기 때문이다.
탈퇴 경로는 사용자 키가 있는 표를 **자식→부모 순서로 명시 삭제**하고, 한 트랜잭션 안에서 전부
처리한다. 어느 문장이든 실패하면 ROLLBACK으로 전부 되돌아간다(부분 탈퇴 없음).

## 2. 사용자 데이터 테이블 전수 (schema.sql 2026-11-03)

총 14개 표 중 사용자 키를 가진 살아있는 표는 12개다. 12개 전부 탈퇴 경로가 지운다.

### 2.1 사용자 키로 지우는 표 (12)

| 테이블 | 키 | 지우는 방식 |
|---|---|---|
| lovetree_community_favorites | subject_id | 명시 삭제 |
| lovetree_community_reactions | subject_id | 명시 삭제 |
| lovetree_community_comments | subject_id | 명시 삭제(상태 값과 무관하게 행 삭제) |
| lovetree_community_reports | reporter_subject_id | 명시 삭제 |
| lovetree_community_blocks | blocker_subject_id / blocked_subject_id | 양쪽 키 모두 명시 삭제 |
| lovetree_community_hidden_shares | hidden_by / share_id→소유자 | 내가 숨긴 행 + 내 공유가 숨겨진 행 |
| lovetree_community_moderation_audit | actor_subject_id | 내가 처리한 감사 행 |
| lovetree_shares | subject_id | 명시 삭제 |
| lovetree_request_claims | subject_id | 명시 삭제(재전송 방지 클레임) |
| lovetree_workspaces | subject_id | 명시 삭제(문서 본문) |
| lovetree_product_roles | subject_id | 명시 삭제(관리자는 애초에 거부) |
| lovetree_product_role_audit | subject_id / actor_subject_id | 대상·행위자 양쪽 |

### 2.2 지우지 않는 표

| 테이블 | 이유 |
|---|---|
| lovetree_login_states | state 해시와 만료 시각만 있고 계정과 연결되지 않는다(로그인 1회용). |
| lovetree_account_deletions | 탈퇴 기록 자체. 이 행이 옛 세션을 거부하는 근거다. |

### 2.3 마지막에 남기는 행

| 대상 | 방식 |
|---|---|
| lovetree_account_deletions | 같은 트랜잭션에서 `INSERT … ON CONFLICT DO UPDATE` 1행(시각 + SHA-256 해시) |

## 3. 세션 무효화

공유 access 토큰은 서명·만료만으로 유효하다. 탈퇴 기록(해시)을
`createDeletedAccountGuard`가 **모든 API 경계에서 매 요청 대조**해 탈퇴 계정의 옛 자격 증명을
401 `account_deleted`로 거부한다. 응답은 세션 쿠키(`lovetree_session`)를 지운다.
마지막 공통 계정 연결을 해제하는 과정에서는 padiem-auth의 계정별 refresh 세션 색인을 확인해
모든 refresh 세션을 폐기하고, Control Plane이 공통 인증 세션을 정리한 뒤 계정 매핑을 최종 파기한다.
다른 활성 제품 연결이 있는 서비스별 탈퇴에서는 그 공통 계정과 세션을 유지한다.

## 4. 미디어 파일 정리

비공개 업로드는 `LOVETREE_MEDIA_DIR/<sha256(productId\0subjectId)>/*.asset`에 있다.
DB 삭제가 **커밋된 뒤** `store.removeAccount(principal)`가 그 폴더를 `rm -rf`로 지운다.
같은 호출을 다시 하면 남은 파일만 지우므로 멱등이다. 파일 정리가 실패해도 DB는 이미 비어 있고,
응답의 `mediaCleaned`가 false로 남는다. 운영자는 같은 계정 폴더를 다시 지우면 끝난다.

## 5. 작업공간 문서(트리) 개별 삭제

`DELETE /api/workspace/trees/<treeId>`는 principal.subjectId의 문서만 읽어 그 트리 하나를 지우고
revision을 1 올려 저장한다. 기존 저장과 같은 revision CAS·클레임 경로를 쓰므로 경합은
409 `revision_conflict`로 다뤄진다. 다른 사용자의 트리 id를 보내면 그 사용자의 문서에는 닿지
않으므로 404 `tree_not_found`이고 아무것도 바뀌지 않는다. 화면의 기존 "이 트리 삭제"는
미저장 변경·롤백을 함께 다루는 revision 저장 경로를 그대로 쓰고, 이 경로는 서버 API 계약이다.

## 6. 시험

`tests/account-deletion.test.mjs` — 16건:

- (a) 정상 탈퇴: 12표 전부에서 그 사용자 행 0, 다른 사용자 행은 그대로, 탈퇴 기록 1행, 파일 정리 1회 호출
- (b) 확인 값 불일치 → 400, 아무것도 지워지지 않음
- (c) 로그인 없음 → 401, 다른 출처 Origin → 403(출처 검사), 둘 다 아무것도 지우지 않음
- (d) 중간 실패 → 503 + 전체 롤백(스냅샷 동일), 파일 정리 호출 없음
- (e) 탈퇴 뒤 옛 세션 → 인증 경계에서 401 `account_deleted`
- (f) 관리자 계정 → 403 `account_delete_admin_blocked`, 아무것도 지워지지 않음
- (g) 확인 방식: 이메일 없는 토큰은 `탈퇴합니다` 일치 시 실행·불일치 400, 이메일 있는 토큰은
  이메일 대조(대소문자·공백 관용), `GET /api/account` 응답에 `subject` 없음
- (h) 스키마 누락 검사: schema.sql의 사용자 키 표가 모두 삭제 목록에 있고, 목록의 표가 스키마에 존재
- (i) 작업공간 문서 개별 삭제: 내 문서만 지워지고 남의 문서·다른 사용자 문서는 그대로
- (j) 서명된 내부 삭제는 러브트리 자료만 지우고 중복·재생 요청을 거부
- (k) 다른 서비스 연결이 남으면 유지하고 마지막 연결은 Auth 사전 폐기→Control Plane 해제→Auth 최종 파기 순서로 처리
- (l) Control Plane 해제 실패 시 Auth 잠금을 해제하고 공통 계정을 보존해 재시도 가능

실행: `npm test` (node --test tests/*.test.mjs).

## 7. 운영 반영 때 컴2에서 할 일

이 작업에서는 운영 DB 적용과 Worker·호스트 배포를 하지 않는다.

1. 승인된 PostgreSQL schema 작업에서 `lovetree_account_deletions`와
   `lovetree_account_delete_rpc_requests`를 적용한다.
2. COM2 LoveTree API에 `server/shared-account-deletion.js`,
   `server/db/account-delete-rpc-postgres.js`와 관련 계정·HTTP 변경을 배포한다.
   `LOVETREE_MEDIA_DIR`·`LOVETREE_PUBLIC_ORIGIN`·`LOVETREE_ADDITIONAL_PUBLIC_ORIGINS` 설정도 점검한다.
3. LoveTree 호스트에는 환경 변수 이름 `LOVETREE_ACCOUNT_DELETE_RPC_SECRET`,
   `LOVETREE_IDENTITY_RPC_URL`, `LOVETREE_IDENTITY_RPC_SECRET`를 구성한다.
   비밀 값은 운영 비밀 관리 절차로 주입한다.
4. Cloudflare `padiem-control-plane-identity` Identity Durable Object schema v4와
   `PADIEM_IDENTITY_RPC_INGRESS_SECRET`, `padiem-auth`와
   `PADIEM_ACCOUNT_DELETE_RPC_SECRET`를 반영한다.
5. Chat Worker에 `PADIEM_CHAT_ACCOUNT_DELETE_RPC_SECRET`과
   `PADIEM_CHAT_LOVETREE_ACCOUNT_DELETE_URL`을 설정하고 D1 migration 097을 적용한 뒤 배포한다.
   Chat·Auth·Identity RPC의 대응 비밀 값은 각 Worker의 배포 비밀 관리에 둔다.
6. 비운영 계정으로 서비스별 연결 유지, 마지막 연결의 세션 폐기·공통 계정 파기, 전체 서비스 탈퇴,
   관리자 차단, 각 RPC 실패 뒤 재시도를 확인한다. CGI 쇼핑몰은 자체 계정이므로 전체 탈퇴 대상에서
   제외된다. 외부 백업의 순환 삭제는 서비스별 운영 정책을 따르며 본 작업에서 실행하지 않는다.
