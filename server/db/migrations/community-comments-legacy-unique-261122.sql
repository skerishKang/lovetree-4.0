-- 적용 DB 마이그레이션(수동 적용 — 자동 적용되지 않는다).
-- PR: #1098 2단계 뒷수습 — 댓글 표에 남은 옛 유일 제약을 정의로 찾아 지운다
-- 배경: community-moment-targets-261122.sql 의 옛 제약 정리가 이름을 추측해 지웠다.
--   옛 유일 제약의 자동 이름은 표 이름까지 붙어 63자를 넘어, PostgreSQL이 끝을 잘라
--   lovetree_community_comments_product_id_subject_id_client_ke… 로 만들어진다(운영에서 확인).
--   그래서 '…_client_key_key'라는 이름으로 지우려던 DROP IF EXISTS 는 'does not exist, skipping'으로
--   넘어갔고 옛 제약이 남았다. 옛 제약(3칸)이 남으면 같은 idempotency 키로 트리·순간 댓글을 각각 쓸 때
--   두 번째 쓰기가 옛 제약 위반으로 실패한다 — 새 제약을 향한 ON CONFLICT 는 이 충돌을 덮지 못한다.
-- 내용: 이름을 추측하지 않고, 정의가 정확히 UNIQUE (product_id, subject_id, client_key) 인 유일 제약을
--   pg_constraint 정의로 찾아 모두 지운다. 재실행 안전 — 없으면 아무것도 하지 않는다.
-- 되돌리기: server/db/rollbacks/community-comments-legacy-unique-261122-rollback.sql
-- 적용 순서: community-moment-targets-261122.sql 이 이미 적용된 뒤에 이 파일을 적용한다(지금 운영이 그 상태).

DO $$
DECLARE
  constraint_name text;
BEGIN
  IF to_regclass('public.lovetree_community_comments') IS NULL THEN
    RAISE NOTICE 'lovetree_community_comments 테이블 없음 — 건너뜀';
    RETURN;
  END IF;

  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'lovetree_community_comments'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ~ '^UNIQUE \(product_id, subject_id, client_key\)$'
  LOOP
    EXECUTE format('ALTER TABLE lovetree_community_comments DROP CONSTRAINT %I', constraint_name);
    RAISE NOTICE '옛 3칸 유일 제약 % 제거', constraint_name;
  END LOOP;
END
$$;

-- 검증: 3칸만 보는 유일 제약은 0개여야 한다(아래 질의가 0행을 돌려준다).
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'lovetree_community_comments'::regclass
  AND contype = 'u'
  AND pg_get_constraintdef(oid) ~ '^UNIQUE \(product_id, subject_id, client_key\)$';
