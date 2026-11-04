-- 운영 DB 적용용 (이 파일 자체는 자동 적용되지 않는다).
-- PR: feat/community-reaction-kinds-261104
-- 적용 순서: ① 머지 후 운영 창구에 이 파일을 psql로 1회 실행 ② scripts/apply-schema.mjs --apply 로 표 확인
-- 근거: schema.sql의 CHECK 변경만으로는 기존 heart 전용 CHECK가 남아 있어 신규 kind가 거부됨.
-- 기존 heart 행은 그대로 유지되며, CHECK만 넓힌다.
-- 주의: PostgreSQL에는 ALTER TABLE IF NOT EXISTS 문법이 없다.
--   (ALTER TABLE <name> IF NOT EXISTS 는 구문이 아니다.)
--   테이블이 없을 때를 대비하려면 to_regclass() 가드로 감싼다.
--   재실행 안전: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT (DO 블록 안에서 중복 시 스킵).

-- 1) 예전 heart 전용 CHECK(자동 생성명을 포함해)를 모두 제거한다.
DO $$
DECLARE
  constraint_name text;
BEGIN
  IF to_regclass('public.lovetree_community_reactions') IS NULL THEN
    RAISE NOTICE 'lovetree_community_reactions 테이블 없음 — 건너뜀';
    RETURN;
  END IF;

  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'lovetree_community_reactions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%heart%'
  LOOP
    EXECUTE format(
      'ALTER TABLE lovetree_community_reactions DROP CONSTRAINT IF EXISTS %I',
      constraint_name
    );
    RAISE NOTICE 'drop check %', constraint_name;
  END LOOP;

  -- 우리가 만든 CHECK가 이미 있고 정의를 만족하면 추가하지 않는다(재실행 안전).
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lovetree_community_reactions_kind_check'
      AND pg_get_constraintdef(oid) LIKE '%heart%'
      AND pg_get_constraintdef(oid) LIKE '%angry%'
  ) THEN
    RAISE NOTICE 'lovetree_community_reactions_kind_check 이미 7종 — 건너뜀';
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER TABLE lovetree_community_reactions DROP CONSTRAINT IF EXISTS %I',
    'lovetree_community_reactions_kind_check'
  );

  EXECUTE format(
    'ALTER TABLE lovetree_community_reactions ADD CONSTRAINT %I CHECK (%s)',
    'lovetree_community_reactions_kind_check',
    'kind IN (''heart'', ''like'', ''love'', ''laugh'', ''wow'', ''sad'', ''angry'')'
  );
  RAISE NOTICE 'lovetree_community_reactions_kind_check = 7종으로 설정';
END
$$;

-- 검증: 기존 heart 행 수 확인
SELECT kind, count(*) AS n FROM lovetree_community_reactions GROUP BY kind ORDER BY kind;
