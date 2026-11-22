-- 되돌리기 문서(수동 실행 — 자동 적용되지 않는다).
-- 대상: server/db/migrations/community-comments-legacy-unique-261122.sql 을 적용한 DB를
--       적용 전 모양(옛 3칸 유일 제약이 남아 있던 상태)으로 되돌린다.
-- 주의: 옛 제약을 다시 만들면 같은 idempotency 키로 트리·순간에 각각 쓴 댓글이 유일 제약 위반으로
--       실패하게 된다(#1098 2단계 뒷수습이 막은 버그의 재발). 되돌리기 전에 반드시 문단 0으로
--       충돌 짝이 있는지 먼저 본다.

-- 문단 0. 충돌 짝 확인 — 같은 (제품, 사람, 키)로 대상이 다른 댓글이 있으면 옛 제약 복원이 그 자리에서 실패한다.
SELECT product_id, subject_id, client_key, count(*) AS 행, count(DISTINCT moment_id) AS 대상
FROM lovetree_community_comments
GROUP BY product_id, subject_id, client_key
HAVING count(DISTINCT moment_id) > 1;
-- 0행이면 문단 2의 DELETE 없이 진행할 수 있다. 행이 있으면 운영 판단으로 순간 행을 정리하거나 되돌리기를 중단한다.

-- 문단 1(선택). 순간 댓글 행을 지운다 — 위 질의에 행이 있고 되돌리기를 계속할 때만 주석을 푼다.
-- DELETE FROM lovetree_community_comments WHERE target_kind = 'moment';

-- 문단 2. 새 제약(대상 5칸)은 정의로 찾아 지운다 — 이름은 저장소 문서와 같지만 정의 판정이 더 안전하다.
DO $$
DECLARE
  constraint_name text;
BEGIN
  IF to_regclass('public.lovetree_community_comments') IS NULL THEN
    RETURN;
  END IF;
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'lovetree_community_comments'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ~ '^UNIQUE \(product_id, subject_id, client_key, target_kind, moment_id\)$'
  LOOP
    EXECUTE format('ALTER TABLE lovetree_community_comments DROP CONSTRAINT %I', constraint_name);
    RAISE NOTICE '대상 5칸 유일 제약 % 제거', constraint_name;
  END LOOP;
END
$$;

-- 문단 3. 옛 3칸 유일 제약을 다시 만든다(이미 있으면 건너뛴다 — 정의로 판정).
--   이름은 짧은 이름을 명시한다 — 옛 자동 이름은 63자에 잘려 저장소 문서와 달라질 수 있다.
--   제약의 뜻(정의)은 옛 것과 같다: UNIQUE (product_id, subject_id, client_key).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'lovetree_community_comments'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ~ '^UNIQUE \(product_id, subject_id, client_key\)$'
  ) THEN
    EXECUTE 'ALTER TABLE lovetree_community_comments ADD CONSTRAINT lovetree_community_comments_legacy_client_key UNIQUE (product_id, subject_id, client_key)';
    RAISE NOTICE '옛 3칸 유일 제약 복원 — lovetree_community_comments_legacy_client_key';
  ELSE
    RAISE NOTICE '옛 3칸 유일 제약이 이미 있다 — 건너뜀';
  END IF;
END
$$;

-- 검증: 옛 제약이 1개(문단 3이 만든 것)이고, 대상 5칸 제약은 0개여야 한다.
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'lovetree_community_comments'::regclass
  AND contype = 'u'
ORDER BY pg_get_constraintdef(oid);
