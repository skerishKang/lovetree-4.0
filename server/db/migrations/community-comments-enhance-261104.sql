-- 운영 DB 적용용 (이 파일 자체는 자동 적용되지 않는다).
-- PR: feat/community-comments-enhance-261104
-- 적용 순서: ① 머지 후 운영 창구에 이 파일을 psql로 1회 실행(반응 종류 SQL 다음 두 번째) ② scripts/apply-schema.mjs --apply 로 표 확인
-- 근거: schema.sql의 edited_at ADD COLUMN은 신규 설치에는 적용되나 기존 배포에는 DO 블록이 있어도 운영 창구에서
-- 명시 적용이 안전하다. 기존 댓글 행은 그대로 유지되며 edited_at만 NULL로 시작한다.

ALTER TABLE IF NOT EXISTS lovetree_community_comments
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- 검증: 기존 댓글 수·edited_at 분포 확인
SELECT count(*) AS total, count(*) FILTER (WHERE edited_at IS NOT NULL) AS edited FROM lovetree_community_comments;
