# 러브트리 계정 탈퇴·작업공간 문서 삭제 설계·근거 (2026-11-03)

범위: 로그인한 이용자가 자기 러브트리 데이터를 스스로 지우는 경로와, 작업공간 문서(트리) 하나를
지우는 서버 경로. 구현: `POST /api/account/delete`, `GET /api/account`,
`DELETE /api/workspace/trees/<treeId>` (`server/account-service.js`, `server/http.js`,
`server/db/account-postgres.js`), 화면: 내 기록 패널 > 계정 탈퇴.

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
- 실행 순서: 출처 검사 → 본문 확인 → 확인 값 일치 → 관리자 차단 → 이미 탈퇴했는지 확인 →
  한 트랜잭션의 명시 삭제 12표 + 탈퇴 기록 1행 → 커밋 → 미디어 폴더 정리(멱등) → 세션 쿠키 삭제.
- 관리자 차단: `lovetree_product_roles`에 `admin` 행이 있는 계정은 403
  `account_delete_admin_blocked`. 역할 판정은 요청마다 신원에 견주어 다시 확인한다(기존 `admin-roles.js`).
- 남기는 기록은 최소: `lovetree_account_deletions`에 탈퇴 시각과 사용자 id의 SHA-256 해시 1행.
  이메일·subject 원문은 저장하지 않는다.
- **공통 로그인 계정은 지우지 않는다.** Control Plane identity는 PADIEM 다른 서비스와 공유하므로
  그대로 남고, 러브트리 데이터만 지운다. 이 사실을 탈퇴 화면에 적는다.

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

공유 access 토큰은 서명·만료만으로 유효하고 서버 폐기 목록이 없다. 탈퇴 기록(해시)을
`createDeletedAccountGuard`가 **모든 API 경계에서 매 요청 대조**해 탈퇴 계정의 옛 자격 증명을
401 `account_deleted`로 거부한다. 응답은 세션 쿠키(`lovetree_session`)를 지우고,
공유 access 쿠키는 브라우저가 만료 시까지 들고 있어도 서버가 더 이상 받지 않는다.
다른 서비스의 공통 로그인 세션은 건드리지 않는다.

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

`tests/account-deletion.test.mjs` — 9건:

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

실행: `npm test` (node --test tests/*.test.mjs).

## 7. 운영 반영 때 컴2에서 할 일

1. `server/db/schema.sql`의 `lovetree_account_deletions` 표를 운영 DB에 적용한다(멱등 DDL).
2. 새 코드(`server/account-service.js`·`account-guard.js`·`db/account-postgres.js`, 수정된
   `http.js`·`index.js`·`workspace-service.js`·`private-media.js`)를 COM2 서버에 배포한다.
   `LOVETREE_MEDIA_DIR`·`LOVETREE_PUBLIC_ORIGIN`·`LOVETREE_ADDITIONAL_PUBLIC_ORIGINS`가 지금 값 그대로인지 확인한다.
3. 탈퇴 뒤 미디어 폴더가 남았는지 `mediaCleaned=false` 응답·로그로 확인하고, 남았으면 같은 폴더를 다시 지운다.
4. 공통 로그인 계정은 남는다 — 탈퇴 뒤 Google 로그인은 되지만 러브트리 API는 401 `account_deleted`다.
5. 공통 로그인 토큰에 `email`을 싣는 것은 **선택**이다. 넣지 않아도 고정 문구(`탈퇴합니다`)로
   탈퇴가 동작하고, 넣으면 서버·화면이 이메일 확인 방식으로 자동 전환된다(코드 수정 불필요).
   문구를 바꿀 때는 서버 `DELETE_CONFIRMATION_PHRASE`와 화면 `ACCOUNT_DELETE_PHRASE`를 함께 고친다.
