-- 운영 DB 적용용 (이 파일 자체는 자동 적용되지 않는다).
-- PR: feat/community-comments-enhance-261104
-- 적용 순서: ① 머지 후 운영 창구에 이 파일을 psql로 1회 실행(반응 종류 SQL 다음 두 번째) ② scripts/apply-schema.mjs --apply 로 표 확인
-- 근거: schema.sql의 edited_at ADD COLUMN은 신규 설치에는 적용되나 기존 배포에는 DO 블록이 있어도 운영 창구에서
-- 명시 적용이 안전하다. 기존 댓글 행은 그대로 유지되며 edited_at만 NULL로 시작한다.
-- 주의: PostgreSQL에는 ALTER TABLE IF NOT EXISTS 문법이 없다.
--   (ALTER TABLE <name> IF NOT EXISTS 는 구문이 아니다.)
--   테이블이 없을 때를 대비하려면 to_regclass() 가드로 감싼다.
--   재실행 안전: ADD COLUMN IF NOT EXISTS 는 사용 가능하다.

DO $$
BEGIN
  IF to_regclass('public.lovetree_community_comments') IS NULL THEN
    RAISE NOTICE 'lovetree_community_comments 테이블 없음 — 건너뜀';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE lovetree_community_comments ADD COLUMN IF NOT EXISTS edited_at timestamptz';
  RAISE NOTICE 'edited_at timestamptz — ADD COLUMN IF NOT EXISTS 완료';
END
$$;

-- 검증: 기존 댓글 수·edited_at 분포 확인
SELECT count(*) AS total, count(*) FILTER (WHERE edited_at IS NOT NULL) AS edited FROM lovetree_community_comments;
