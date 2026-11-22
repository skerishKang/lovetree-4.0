-- 적용 DB 마이그레이션(이 파일만 단독 적용은 하지 않는다).
-- PR: #1098 2단계 — 순간 단위 ♡·댓글 서버 규칙
-- 적용 순서: 기존 적용 DB에서 이 파일을 psql로 1회 실행(응답 메시지 SQL 아래 참고) 또는 scripts/apply-schema.mjs --apply 로 확인
-- 내용: 반응·댓글 표에 대상 종류(target_kind)와 순간 id(moment_id)를 덧붙이고, 신고 표에 순간 댓글 신고의 comment_id 를 덧붙인다.
--   · 기존 행은 전부 target_kind='tree'(기존 트리 단위), moment_id='' 이다 — 데이터를 옮기거나 지우지 않는다(덧붙이기만).
--   · 반응 표 PK가 (product_id, share_id, subject_id, kind)에서 (..., moment_id)로 넓어진다 — 기존 행끼리는 같은 값을 가리키므로 충돌이 없다.
--   · 댓글 표 유일 제약이 (product_id, subject_id, client_key)에서 (..., target_kind, moment_id)로 넓어진다 —
--     같은 idempotency 키라도 대상(트리/순간, 어느 순간)이 다르면 다른 요청으로 본다. 기존 트리 댓글의 중복 방지 규칙은 그대로다.
--   · 운영센터 길은 그대로 — 순간 댓글 신고도 lovetree_community_reports 에 들어가고 comment_id 로 어떤 댓글인지 구분한다.
-- 주의: PostgreSQL에는 ALTER TABLE IF NOT EXISTS 문법이 없다.
--   (ALTER TABLE <name> IF NOT EXISTS 는 유효한 구문이 아니다)
--   테이블이 없을 때 미리 비교하려면 to_regclass() 검사로 건너뛴다.
--   열 단위 덧붙이기는 ADD COLUMN IF NOT EXISTS 를 사용한다.

-- 1) 반응 표: 대상 칸 덧붙이기 + PK 넓히기
DO $$
BEGIN
  IF to_regclass('public.lovetree_community_reactions') IS NULL THEN
    RAISE NOTICE 'lovetree_community_reactions 테이블 없음 — 건너뜀';
    RETURN;
  END IF;

  ALTER TABLE lovetree_community_reactions ADD COLUMN IF NOT EXISTS target_kind text NOT NULL DEFAULT 'tree';
  ALTER TABLE lovetree_community_reactions ADD COLUMN IF NOT EXISTS moment_id text NOT NULL DEFAULT '';
  RAISE NOTICE 'lovetree_community_reactions: target_kind·moment_id 덧붙이기 완료';

  ALTER TABLE lovetree_community_reactions DROP CONSTRAINT IF EXISTS lovetree_community_reactions_target_kind_check;
  ALTER TABLE lovetree_community_reactions
    ADD CONSTRAINT lovetree_community_reactions_target_kind_check CHECK (target_kind IN ('tree','moment'));

  ALTER TABLE lovetree_community_reactions DROP CONSTRAINT IF EXISTS lovetree_community_reactions_target_pair_check;
  ALTER TABLE lovetree_community_reactions
    ADD CONSTRAINT lovetree_community_reactions_target_pair_check
    CHECK ((target_kind = 'tree' AND moment_id = '') OR (target_kind = 'moment' AND moment_id <> ''));

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'lovetree_community_reactions'::regclass
      AND conname = 'lovetree_community_reactions_pkey'
      AND pg_get_constraintdef(oid) NOT LIKE '%moment_id%'
  ) THEN
    EXECUTE 'ALTER TABLE lovetree_community_reactions DROP CONSTRAINT lovetree_community_reactions_pkey';
    RAISE NOTICE 'lovetree_community_reactions: 기존 PK 제거';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'lovetree_community_reactions'::regclass
      AND conname = 'lovetree_community_reactions_pkey'
      AND pg_get_constraintdef(oid) LIKE '%moment_id%'
  ) THEN
    EXECUTE 'ALTER TABLE lovetree_community_reactions ADD CONSTRAINT lovetree_community_reactions_pkey PRIMARY KEY (product_id, share_id, subject_id, kind, moment_id)';
    RAISE NOTICE 'lovetree_community_reactions: PK에 moment_id 포함해서 다시 만듦';
  END IF;
END
$$;

-- 2) 댓글 표: 대상 칸 덧붙이기 + 유일 제약 넓히기 + 순간 목록용 색인
DO $$
DECLARE
  constraint_name text;
BEGIN
  IF to_regclass('public.lovetree_community_comments') IS NULL THEN
    RAISE NOTICE 'lovetree_community_comments 테이블 없음 — 건너뜀';
    RETURN;
  END IF;

  ALTER TABLE lovetree_community_comments ADD COLUMN IF NOT EXISTS target_kind text NOT NULL DEFAULT 'tree';
  ALTER TABLE lovetree_community_comments ADD COLUMN IF NOT EXISTS moment_id text NOT NULL DEFAULT '';
  RAISE NOTICE 'lovetree_community_comments: target_kind·moment_id 덧붙이기 완료';

  ALTER TABLE lovetree_community_comments DROP CONSTRAINT IF EXISTS lovetree_community_comments_target_kind_check;
  ALTER TABLE lovetree_community_comments
    ADD CONSTRAINT lovetree_community_comments_target_kind_check CHECK (target_kind IN ('tree','moment'));

  ALTER TABLE lovetree_community_comments DROP CONSTRAINT IF EXISTS lovetree_community_comments_target_pair_check;
  ALTER TABLE lovetree_community_comments
    ADD CONSTRAINT lovetree_community_comments_target_pair_check
    CHECK ((target_kind = 'tree' AND moment_id = '') OR (target_kind = 'moment' AND moment_id <> ''));

  -- 옛 유일 제약(3칸)은 자동 이름이 63자에 잘려('…_client_ke…') 이름 추측으로는 못 지운다 —
  -- 정의가 UNIQUE (product_id, subject_id, client_key) 인 것을 찾아 지운다(뒷수습 마이그레이션과 같은 방식).
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'lovetree_community_comments'::regclass
      AND conname = 'lovetree_community_comments_client_target_key'
  ) THEN
    EXECUTE 'ALTER TABLE lovetree_community_comments ADD CONSTRAINT lovetree_community_comments_client_target_key UNIQUE (product_id, subject_id, client_key, target_kind, moment_id)';
    RAISE NOTICE 'lovetree_community_comments: 유일 제약을 대상까지 보도록 넓힘';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS lovetree_community_comments_moment_idx
  ON lovetree_community_comments (product_id, share_id, moment_id, created_at DESC);

-- 3) 신고 표: 순간 댓글 신고가 어떤 댓글인지 comment_id 로 붙인다(기존 트리 신고는 NULL 그대로).
DO $$
BEGIN
  IF to_regclass('public.lovetree_community_reports') IS NULL THEN
    RAISE NOTICE 'lovetree_community_reports 테이블 없음 — 건너뜀';
    RETURN;
  END IF;
  ALTER TABLE lovetree_community_reports ADD COLUMN IF NOT EXISTS comment_id text;
  RAISE NOTICE 'lovetree_community_reports: comment_id 덧붙이기 완료';
END
$$;

-- 검증: 기존 행은 전부 tree인지, 새 칸이 있는지 확인
SELECT 'reactions' AS 표, target_kind, count(*) FROM lovetree_community_reactions GROUP BY target_kind
UNION ALL
SELECT 'comments', target_kind, count(*) FROM lovetree_community_comments GROUP BY target_kind;
