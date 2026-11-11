## 2026-11-11 — 계정 이메일 저장: 공통 로그인 이메일을 계정 테이블로 (로컬1, ai/local1-lt-account-email-store-261111, PR #389 → 0c4ce9f)

- 무엇: 토큰 교환 응답이 실어 오는 `profile.email`을 로그인 콜백에서 모아 계정 단위로 저장하고, `/api/account`의 확인 값·표시에 쓴다. #368 가림 제거(PR #385)로 "이메일 전체가 본인 화면에 보이는" 단계까지 열렸으니, 이제 "이메일이 오는 경로"를 마감.
- 구현: `server/db/schema.sql` + 마이그레이션 `account-emails-261111.sql`의 `lovetree_account_emails(product_id, subject_id, email, updated_at)`. 새 내부 경로 `/internal/account/email`(공개 프록시 목록 밖)는 access 토큰(JWKS)을 검증해 그 토큰이 인증한 accountId와 본문 subject가 일치할 때만 기록한다. 계정 삭제 시 표를 함께 지운다(`ACCOUNT_USER_TABLES` + 메모리 모형). `describe`/탈퇴 확인 값은 검증 패스너드 → 저장값 → 고정 문구 순으로 고른다. 콜백 반영은 최선 노력이고 실패해도 로그인을 막지 않는다.
- 전제: access 토큰에는 email 클레임이 없어(2026-11-11 확인) 저장값이 있어야 동작하고, 그 값은 공통 로그인의 프로필 클레임 허용 설정이 켜져야 콜백에 닿는다. 꺼져 있으면 표가 빈 채 기존 흐름이 그대로 맞다.
- 검증: `npm test` 963 pass/0 fail/37 skip(로컬 PostgreSQL·릴레이 환경 없음), `npm run build` 통과. 신규·갱신 테스트: 서버 핸들러 계약, 저장·삭제 통합, Pages 콜백, 스키마 컬럼/업서트 검사. CI 검사(ubuntu·windows·미리보기 postdeploy(로그아웃)·PostgreSQL 저장·로그인 상태 검증·마이그레이션 실행 시험) 통과.
- 참고: 별도 워크플로 `Deploy Bundle Boot Test`(커밋 경로 필터)의 부트 컨트롤 1건이 첫 시도에서 실패 — 로그는 설치·사전점검·ExecCondition 통과 뒤 런타임 모듈 상태 불일치를 보였고, 커밋 트리/아카이브에는 해당 함수가 있어 정합적이라 러너 쪽 이력 문제로 기록해 둔다(워크플로 재시도 권한 없음). paths 필터 덕에 문서 전용 PR에서는 돌지 않는다.
- 남은 것: 프로필 클레임 동의 후 다음 로그인에서 실제 저장 확인(계정 02, 헤드리스). 동의 전 빈 값은 정상이며 기존 표시·탈퇴 흐름 그대로다. 임시 작업장/브랜치 정리 예정.
