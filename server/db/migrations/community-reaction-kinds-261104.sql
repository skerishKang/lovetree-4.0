-- 운영 DB 적용용 (이 파일 자체는 자동 적용되지 않는다).
-- PR: feat/community-reaction-kinds-261104
-- 적용 순서: ① 머지 후 운영 창구에 이 파일을 psql로 1회 실행 ② scripts/apply-schema.mjs --apply 로 표 확인
-- 근거: schema.sql의 CHECK 변경만으로는 기존 heart 전용 CHECK가 남아 있어 신규 kind가 거부됨.
-- 기존 heart 행은 그대로 유지되며, CHECK만 넓힌다.

ALTER TABLE IF NOT EXISTS lovetree_community_reactions
  DROP CONSTRAINT IF EXISTS lovetree_community_reactions_kind_check;

-- 구 CHECK(한쪽만 허용)를 id로 찾아 제거한다. 신규 설치(schema.sql만)면 해당 없음.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'lovetree_community_reactions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%heart%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE lovetree_community_reactions DROP CONSTRAINT %I', constraint_name);
  END IF;
END
$$;

ALTER TABLE lovetree_community_reactions
  ADD CONSTRAINT lovetree_community_reactions_kind_check
  CHECK (kind IN ('heart', 'like', 'love', 'laugh', 'wow', 'sad', 'angry'));

-- 검증: 기존 heart 행 수 확인
SELECT kind, count(*) AS n FROM lovetree_community_reactions GROUP BY kind ORDER BY kind;
