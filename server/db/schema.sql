-- 러브트리 4.0 워크스페이스 저장 (#13)
-- 소유자·revision·서버 저장 시각은 문서 바깥 메타데이터로 둔다.
-- 일반 PostgreSQL용. Neon 전용 드라이버를 assume 하지 않는다.

CREATE TABLE IF NOT EXISTS lovetree_workspaces (
  product_id text NOT NULL,
  subject_id text NOT NULL,
  doc jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, subject_id)
);

CREATE TABLE IF NOT EXISTS lovetree_request_claims (
  product_id text NOT NULL,
  subject_id text NOT NULL,
  client_key text NOT NULL,
  request_hash text NOT NULL,
  result_revision bigint,
  result_saved_at timestamptz,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, subject_id, client_key),
  CHECK (char_length(client_key) BETWEEN 1 AND 128),
  CHECK (char_length(request_hash) = 64)
);
CREATE INDEX IF NOT EXISTS lovetree_request_claims_retention_idx
  ON lovetree_request_claims (claimed_at, product_id, subject_id, client_key);

-- 로그인 상태의 단일 사용 소비(재시작·다중 인스턴스 대응). 값은 해시로만 두고 원본은 남기지 않는다.
CREATE TABLE IF NOT EXISTS lovetree_login_states (
  state_hash char(64) PRIMARY KEY,
  expires_at timestamptz NOT NULL
);

-- 제품 역할(#67 관리자 기반). 키는 서버가 확인한 이 제품의 canonical subject다.
-- 공통 신원과 제품 권한을 분리한다 — 다른 제품의 역할은 여기로 전파되지 않는다.
-- 지정 계정 등록은 승인된 비공개 운영 절차에서 하고, 이 파일에는 주소·이메일·subject를 적지 않는다.
CREATE TABLE IF NOT EXISTS lovetree_product_roles (
  product_id text NOT NULL,
  subject_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','ai_customer','tester')),
  granted_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, subject_id)
);

-- 부여·회수 이력. PADIEM migration 052의 감사 행과 같이 FK 없이 스스로 선다.
CREATE TABLE IF NOT EXISTS lovetree_product_role_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id text NOT NULL,
  subject_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('assign', 'revoke')),
  previous_role text,
  role text,
  actor_subject_id text,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lovetree_product_role_audit_retention_idx
  ON lovetree_product_role_audit (changed_at, id);

-- 4.1 명시적 공유(#120). 개인 문서 자체는 복제하지 않고 소유자 문서의 트리 하나를 가리킨다.
-- 공개 읽기는 매 요청마다 최신 소유 문서에서 해당 트리만 투영하므로 취소·삭제가 즉시 반영된다.
CREATE TABLE IF NOT EXISTS lovetree_shares (
  product_id text NOT NULL,
  share_id text NOT NULL,
  subject_id text NOT NULL,
  tree_id text NOT NULL,
  entry_moment_id text NOT NULL,
  initial_view text NOT NULL CHECK (initial_view IN ('book','board','network')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  discoverable boolean NOT NULL DEFAULT false,
  discoverable_at timestamptz,
  PRIMARY KEY (product_id, share_id),
  CHECK (char_length(share_id) BETWEEN 20 AND 64)
);
ALTER TABLE lovetree_shares ADD COLUMN IF NOT EXISTS discoverable boolean NOT NULL DEFAULT false;
ALTER TABLE lovetree_shares ADD COLUMN IF NOT EXISTS discoverable_at timestamptz;
CREATE INDEX IF NOT EXISTS lovetree_shares_owner_idx
  ON lovetree_shares (product_id, subject_id, created_at DESC);

-- 2026-11-14 공개가 기본 (#538). 공유 행이 그 트리의 공개 핸들이 된다.
-- origin: 'owner'=주인이 만든 링크, 'auto'=저장 성공 뒤 서버가 만든 자동 공개 행.
-- moment_count: 저장 성공 뒤 같은 훅에서 갱신되는 순간 수(직접 올린 사진만 있는 순간도 센다).
-- 둘러보기 조건은 moment_count>=3 이고, discoverable 열은 참조하지 않는다(되돌리기에 대비해 보존).
ALTER TABLE lovetree_shares ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'owner';
ALTER TABLE lovetree_shares ADD COLUMN IF NOT EXISTS moment_count integer NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lovetree_shares_origin_check') THEN
    ALTER TABLE lovetree_shares ADD CONSTRAINT lovetree_shares_origin_check CHECK (origin IN ('owner','auto'));
  END IF;
END
$$;
-- 트리 하나에 자동 공개 행은 하나뿐이다.
CREATE UNIQUE INDEX IF NOT EXISTS lovetree_shares_auto_unique_idx
  ON lovetree_shares (product_id, subject_id, tree_id) WHERE origin = 'auto';

-- 트리 공개 상태(#538). 행이 없으면 공개다(스파스 운용 — 비공개 행만 쌓인다).
-- 비공개는 Plus 전용이고, 판단은 서버가 한다(화면 잠금만으로 막지 않는다).
CREATE TABLE IF NOT EXISTS lovetree_tree_visibility (
  product_id text NOT NULL,
  subject_id text NOT NULL,
  tree_id text NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('public','private')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, subject_id, tree_id)
);

-- 트리 둘러보기 소개 표시(2026-11-16 대표 결정 — 기본 꺼짐, 고객이 켠다. 무료).
-- 행이 없으면 꺼짐이다(스파스 운용 — 켠 트리의 행만 쌓인다). 기존에 둘러보기에 나오던 트리는
-- migrations/tree-discover-optin-261116.sql 이 켜짐으로 채운다(고객 데이터는 바꾸지 않는다).
CREATE TABLE IF NOT EXISTS lovetree_tree_discover (
  product_id text NOT NULL,
  subject_id text NOT NULL,
  tree_id text NOT NULL,
  discover boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, subject_id, tree_id)
);

-- 기존 공유 행의 순간 수를 저장 문서에서 채운다(둘러보기 조건 moment_count>=3).
UPDATE lovetree_shares s
SET moment_count = c.cnt, updated_at = now()
FROM (
  SELECT w.product_id, w.subject_id, tree->>'id' AS tree_id, COALESCE(jsonb_array_length(tree->'moments'), 0) AS cnt
  FROM lovetree_workspaces w, jsonb_array_elements(w.doc->'trees') AS tree
) c
WHERE s.product_id = c.product_id AND s.subject_id = c.subject_id AND s.tree_id = c.tree_id
  AND s.moment_count <> c.cnt;

-- 4.1 discovery/community (#121). Reactions never mutate another member's workspace JSON.
CREATE TABLE IF NOT EXISTS lovetree_community_favorites (
  product_id text NOT NULL,
  share_id text NOT NULL,
  subject_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, share_id, subject_id)
);
CREATE INDEX IF NOT EXISTS lovetree_community_favorites_owner_idx
  ON lovetree_community_favorites (product_id, subject_id, created_at DESC);

-- 투표 기록(#824 대표 결정 2026-11-18, docs/METRICS.md). '담은 사람 수'를 이번 주로 세는 근원 표다.
-- 즐겨찾기 표는 해제 때 행을 지우므로(community-postgres.js setFavorite) 여기는 append-only로 남긴다 —
-- 해제·재담기를 반복해도 표는 하나다(1인 1표 영구). 대상은 두 벌이다:
--   target_kind='tree'  → 공개 트리 카드 투표(target_id = share_id, 1차 — 기존 담기 기반)
--   target_kind='stage' → 무대 영상 투표(target_id = lovetree_stages.stage_id, #792 4단계)
-- 구조는 처음부터 둘 다 담을 수 있게 잡았다(2차 때 표 구조 변경 없음). 투표 가능 시점(가입 7일) 검사는
-- 서비스 계층이 account_emails.created_at 으로 한다(이 표와 무관).
CREATE TABLE IF NOT EXISTS lovetree_community_votes (
  product_id text NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('tree','stage')),
  target_id text NOT NULL,
  subject_id text NOT NULL,
  voted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, target_kind, target_id, subject_id)
);
CREATE INDEX IF NOT EXISTS lovetree_community_votes_week_idx
  ON lovetree_community_votes (product_id, target_kind, voted_at);

-- #792 4단계 ②. 공개 순간의 무대 배정과 현재 담기를 담는다. 기존 기록과 표는 백필하지 않는다.
-- registration_order는 #792 ①의 겹침 동률을 푸는 순번이다. 최초 공개자가 탈퇴해도 기준은 유지한다.
CREATE TABLE IF NOT EXISTS lovetree_stages (
  product_id text NOT NULL,
  stage_id text NOT NULL DEFAULT gen_random_uuid()::text CHECK (stage_id <> ''),
  registration_order integer GENERATED ALWAYS AS IDENTITY UNIQUE,
  key_version smallint NOT NULL DEFAULT 1 CHECK (key_version = 1),
  platform text NOT NULL CHECK (platform = 'youtube'),
  video_id text COLLATE "C" NOT NULL CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  kind text NOT NULL,
  start_seconds integer,
  end_seconds integer,
  PRIMARY KEY (product_id, stage_id),
  UNIQUE NULLS NOT DISTINCT (product_id, key_version, platform, video_id, kind, start_seconds, end_seconds),
  UNIQUE (product_id, key_version, platform, video_id, kind, stage_id),
  CHECK (
    (kind = 'whole' AND start_seconds IS NULL AND end_seconds IS NULL) OR
    (kind = 'bookmark' AND start_seconds IS NOT NULL AND start_seconds BETWEEN 0 AND 43200 AND end_seconds IS NULL) OR
    (kind = 'range' AND start_seconds IS NOT NULL AND end_seconds IS NOT NULL
      AND start_seconds >= 0 AND start_seconds < end_seconds AND end_seconds <= 43200)
  )
);

-- 같은 입력의 배정은 하나다. 복합 외래 키가 다른 제품·영상·규칙·종류의 기준을 참조하는 것을 막는다.
CREATE TABLE IF NOT EXISTS lovetree_stage_assignments (
  product_id text NOT NULL,
  key_version smallint NOT NULL DEFAULT 1,
  platform text NOT NULL,
  video_id text COLLATE "C" NOT NULL,
  kind text NOT NULL,
  start_seconds integer,
  end_seconds integer,
  stage_id text NOT NULL,
  UNIQUE NULLS NOT DISTINCT (product_id, key_version, platform, video_id, kind, start_seconds, end_seconds),
  FOREIGN KEY (product_id, key_version, platform, video_id, kind, stage_id)
    REFERENCES lovetree_stages (product_id, key_version, platform, video_id, kind, stage_id),
  CHECK (
    (kind = 'whole' AND start_seconds IS NULL AND end_seconds IS NULL) OR
    (kind = 'bookmark' AND start_seconds IS NOT NULL AND start_seconds BETWEEN 0 AND 43200 AND end_seconds IS NULL) OR
    (kind = 'range' AND start_seconds IS NOT NULL AND end_seconds IS NOT NULL
      AND start_seconds >= 0 AND start_seconds < end_seconds AND end_seconds <= 43200)
  )
);

-- 기존 영구표가 가리키는 ID, 고정 기준 구간, 한 번 배정한 입력은 소속 순간이 모두 사라져도 보존한다.
CREATE OR REPLACE FUNCTION lovetree_keep_stage_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registered stage keys and assignments are immutable' USING ERRCODE = '55000';
END;
$$;
CREATE OR REPLACE TRIGGER lovetree_stages_immutable
  BEFORE UPDATE OR DELETE ON lovetree_stages
  FOR EACH ROW EXECUTE FUNCTION lovetree_keep_stage_identity();
CREATE OR REPLACE TRIGGER lovetree_stage_assignments_immutable
  BEFORE UPDATE OR DELETE ON lovetree_stage_assignments
  FOR EACH ROW EXECUTE FUNCTION lovetree_keep_stage_identity();

-- 공개 소속은 원본 revision이 바뀌면 교체한다. 화면 집계는 현재 볼 수 있는 (소유자, 트리)를 한 번씩 센다.
CREATE TABLE IF NOT EXISTS lovetree_stage_moments (
  product_id text NOT NULL,
  subject_id text NOT NULL,
  tree_id text NOT NULL,
  moment_id text NOT NULL,
  stage_id text NOT NULL,
  source_revision bigint NOT NULL CHECK (source_revision >= 1),
  PRIMARY KEY (product_id, subject_id, tree_id, moment_id),
  FOREIGN KEY (product_id, stage_id) REFERENCES lovetree_stages (product_id, stage_id),
  FOREIGN KEY (product_id, subject_id) REFERENCES lovetree_workspaces (product_id, subject_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS lovetree_stage_moments_stage_idx
  ON lovetree_stage_moments (product_id, stage_id, subject_id, tree_id);

-- 현재 담기는 해제할 수 있다. 최초 표의 시각은 기존 lovetree_community_votes가 보관한다.
CREATE TABLE IF NOT EXISTS lovetree_stage_saves (
  product_id text NOT NULL,
  stage_id text NOT NULL,
  subject_id text NOT NULL,
  PRIMARY KEY (product_id, stage_id, subject_id),
  FOREIGN KEY (product_id, stage_id) REFERENCES lovetree_stages (product_id, stage_id)
);
CREATE INDEX IF NOT EXISTS lovetree_stage_saves_subject_idx
  ON lovetree_stage_saves (product_id, subject_id);

-- #1098 2단계(261122): 반응 표에 대상 종류(target_kind)와 순간 id(moment_id)를 덧붙인다.
-- 기존 행은 전부 'tree'(기존 트리 단위 반응)이고 moment_id 는 빈 값이다. 순간 반응은 target_kind='moment'
-- 이고 같은 (공유, 대상 순간, 사람, 종) 조합이 PK로 하나만 남는다(같은 요청 두 번 막기 — idempotency).
CREATE TABLE IF NOT EXISTS lovetree_community_reactions (
  product_id text NOT NULL,
  share_id text NOT NULL,
  subject_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('heart','like','love','laugh','wow','sad','angry')),
  target_kind text NOT NULL DEFAULT 'tree' CONSTRAINT lovetree_community_reactions_target_kind_check CHECK (target_kind IN ('tree','moment')),
  moment_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, share_id, subject_id, kind, moment_id),
  CONSTRAINT lovetree_community_reactions_target_pair_check CHECK ((target_kind = 'tree' AND moment_id = '') OR (target_kind = 'moment' AND moment_id <> ''))
);

-- Existing deployments created with kind IN ('heart') only. Re-applying
-- schema.sql on them leaves the old CHECK in place, so the wider allowlist
-- must be applied explicitly. The same statement lives in
-- server/db/migrations/community-reaction-kinds-261104.sql (not auto-applied).
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
  ALTER TABLE lovetree_community_reactions
    ADD CONSTRAINT lovetree_community_reactions_kind_check
    CHECK (kind IN ('heart','like','love','laugh','wow','sad','angry'));
END
$$;

-- Existing deployments lack the moment-target columns (#1098 2단계). Re-applying
-- schema.sql on them upgrades in place; the same statements live in
-- server/db/migrations/community-moment-targets-261122.sql (not auto-applied).
-- 덧붙이기만 한다 — 기존 행은 그대로 'tree'가 되고 데이터는 옮기거나 지우지 않는다.
DO $$
BEGIN
  IF to_regclass('public.lovetree_community_reactions') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE lovetree_community_reactions ADD COLUMN IF NOT EXISTS target_kind text NOT NULL DEFAULT 'tree';
  ALTER TABLE lovetree_community_reactions ADD COLUMN IF NOT EXISTS moment_id text NOT NULL DEFAULT '';
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
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'lovetree_community_reactions'::regclass
      AND conname = 'lovetree_community_reactions_pkey'
      AND pg_get_constraintdef(oid) LIKE '%moment_id%'
  ) THEN
    EXECUTE 'ALTER TABLE lovetree_community_reactions ADD CONSTRAINT lovetree_community_reactions_pkey PRIMARY KEY (product_id, share_id, subject_id, kind, moment_id)';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS lovetree_community_comments (
  product_id text NOT NULL,
  comment_id text NOT NULL,
  share_id text NOT NULL,
  subject_id text NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  client_key text NOT NULL,
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','deleted','hidden')),
  target_kind text NOT NULL DEFAULT 'tree' CONSTRAINT lovetree_community_comments_target_kind_check CHECK (target_kind IN ('tree','moment')),
  moment_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  PRIMARY KEY (product_id, comment_id),
  CONSTRAINT lovetree_community_comments_client_target_key UNIQUE (product_id, subject_id, client_key, target_kind, moment_id),
  CONSTRAINT lovetree_community_comments_target_pair_check CHECK ((target_kind = 'tree' AND moment_id = '') OR (target_kind = 'moment' AND moment_id <> ''))
);
-- Existing deployments lack edited_at. The column is nullable so old rows
-- remain valid; the same ALTER lives in
-- server/db/migrations/community-comments-enhance-261104.sql (not auto-applied).
DO $$ BEGIN ALTER TABLE lovetree_community_comments ADD COLUMN IF NOT EXISTS edited_at timestamptz; END $$;
-- #1098 2단계(261122): 댓글 표에도 대상 칸을 덧붙인다(기존 행은 'tree'). 같은 idempotency 키라도
-- 대상이 다르면(트리 댓글 vs 순간 댓글, 순간이 다르면) 다른 요청이므로 유일 제약도 대상까지 본다.
DO $$
DECLARE
  constraint_name text;
BEGIN
  IF to_regclass('public.lovetree_community_comments') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE lovetree_community_comments ADD COLUMN IF NOT EXISTS target_kind text NOT NULL DEFAULT 'tree';
  ALTER TABLE lovetree_community_comments ADD COLUMN IF NOT EXISTS moment_id text NOT NULL DEFAULT '';
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
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'lovetree_community_comments'::regclass
      AND conname = 'lovetree_community_comments_client_target_key'
  ) THEN
    EXECUTE 'ALTER TABLE lovetree_community_comments ADD CONSTRAINT lovetree_community_comments_client_target_key UNIQUE (product_id, subject_id, client_key, target_kind, moment_id)';
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS lovetree_community_comments_share_idx
  ON lovetree_community_comments (product_id, share_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lovetree_community_comments_moment_idx
  ON lovetree_community_comments (product_id, share_id, moment_id, created_at DESC);

-- #1098 3단계(261122): 내 소식 읽음 시각. 계정(제품+사람)마다 한 줄 — 목록을 연 시점까지 읽음으로 본다.
-- 같은 문장이 server/db/migrations/community-my-news-reads-261122.sql 에도 있다(기존 적용 DB용, 자동 적용 아님).
CREATE TABLE IF NOT EXISTS lovetree_community_my_news_reads (
  product_id text NOT NULL,
  subject_id text NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, subject_id)
);

CREATE TABLE IF NOT EXISTS lovetree_community_reports (
  product_id text NOT NULL,
  report_id text NOT NULL,
  share_id text NOT NULL,
  reporter_subject_id text NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  client_key text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  comment_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text,
  PRIMARY KEY (product_id, report_id),
  UNIQUE (product_id, reporter_subject_id, client_key)
);
-- #1098 2단계(261122): 순간 댓글 신고는 같은 신고 표·운영센터 길을 쓰고, 어떤 댓글인지 comment_id 로 붙인다.
-- 기존 신고(트리 신고)는 comment_id 없음(NULL) — 처리(숨기기)는 트리를 숨기던 기존 규칙 그대로다.
DO $$ BEGIN ALTER TABLE lovetree_community_reports ADD COLUMN IF NOT EXISTS comment_id text; END $$;

CREATE TABLE IF NOT EXISTS lovetree_community_blocks (
  product_id text NOT NULL,
  blocker_subject_id text NOT NULL,
  blocked_subject_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, blocker_subject_id, blocked_subject_id),
  CHECK (blocker_subject_id <> blocked_subject_id)
);

CREATE TABLE IF NOT EXISTS lovetree_community_hidden_shares (
  product_id text NOT NULL,
  share_id text NOT NULL,
  report_id text,
  hidden_by text NOT NULL,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, share_id)
);

CREATE TABLE IF NOT EXISTS lovetree_community_moderation_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id text NOT NULL,
  report_id text,
  target_type text NOT NULL DEFAULT 'report' CHECK (target_type IN ('report','share','comment')),
  target_id text,
  action text NOT NULL CHECK (action IN ('resolved','dismissed','hide_share','restore_share','hide_comment')),
  actor_subject_id text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE lovetree_community_moderation_audit ALTER COLUMN report_id DROP NOT NULL;
ALTER TABLE lovetree_community_moderation_audit ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'report';
ALTER TABLE lovetree_community_moderation_audit ADD COLUMN IF NOT EXISTS target_id text;
ALTER TABLE lovetree_community_moderation_audit DROP CONSTRAINT IF EXISTS lovetree_community_moderation_audit_action_check;
ALTER TABLE lovetree_community_moderation_audit ADD CONSTRAINT lovetree_community_moderation_audit_action_check CHECK (action IN ('resolved','dismissed','hide_share','restore_share','hide_comment'));
ALTER TABLE lovetree_community_moderation_audit DROP CONSTRAINT IF EXISTS lovetree_community_moderation_audit_target_type_check;
ALTER TABLE lovetree_community_moderation_audit ADD CONSTRAINT lovetree_community_moderation_audit_target_type_check CHECK (target_type IN ('report','share','comment'));
CREATE INDEX IF NOT EXISTS lovetree_community_moderation_audit_retention_idx
  ON lovetree_community_moderation_audit (changed_at, id);

-- 2026-11-03 계정 탈퇴. 남기는 기록은 사용자 id 해시와 시각뿐이다(이메일·subject 원문 저장 금지).
-- 이 행이 있으면 그 계정의 옛 세션은 인증 경계에서 거부되고, 저장·공유·커뮤니티 데이터는 남지 않는다.
CREATE TABLE IF NOT EXISTS lovetree_account_deletions (
  product_id text NOT NULL,
  subject_hash char(64) NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, subject_hash)
);

-- 2026-11-11 계정 이메일. 공통 로그인 토큰 교환 응답의 사용자 정보(profile.email)를
-- 로그인 콜백이 검증된 access 토큰의 account_id와 함께 이 표에 모아 둔다(서버끼리만 쓰는
-- 내부 경로 /internal/account/email, 공개 프록시 목록 밖). 확인·복구에 쓰고, 삭제 시 함께 지운다.
-- 2026-11-15 (#655 2차): created_at = 러브트리 첫 로그인 시각(가입일). upsert 는 이 칸을 갱신하지
-- 않는다 — 두 번째 로그인부터는 updated_at 만 바뀐다. 기존 행 채우기는 migrations 쪽에서 했다.
CREATE TABLE IF NOT EXISTS lovetree_account_emails (
  product_id text NOT NULL,
  subject_id text NOT NULL,
  email text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, subject_id)
);

-- Short-lived replay IDs for signed cross-service deletion calls. No account identifier is stored.
CREATE TABLE IF NOT EXISTS lovetree_account_delete_rpc_requests (
  service_id text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS lovetree_account_delete_rpc_requests_expiry_idx
  ON lovetree_account_delete_rpc_requests (expires_at);

-- 2026-11-14 고객 의견 창구 (#540). 로그인·로그아웃 모두 보낼 수 있고, 로그아웃이면 subject_id를 비운다.
-- 개인 정보(이메일·전화번호 꼴)는 저장 전에 가린다. 화면 그림 첨부는 2차로 미룬다.
-- 상태: 받음(received) / 확인 중(reviewing) / 고침(fixed) / 다음에(later) / 닫음(closed — 목록 기본에서 숨긴다, #564).
-- 종류: 이상해요(bug) / 불편해요(inconvenient) / 기능 제안(feature) / 그 밖에(other).
CREATE TABLE IF NOT EXISTS lovetree_feedback (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id text NOT NULL,
  subject_id text,
  kind text NOT NULL DEFAULT 'opinion' CHECK (kind IN ('opinion','journal')),
  category text NOT NULL CHECK (category IN ('bug','inconvenient','feature','other')),
  title text,
  body text NOT NULL CHECK ((kind = 'journal' AND char_length(body) BETWEEN 1 AND 8000) OR (kind <> 'journal' AND char_length(body) BETWEEN 1 AND 2000)),
  score smallint CHECK (score IS NULL OR (score BETWEEN 1 AND 5)),
  journal_date date,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','reviewing','fixed','later','closed')),
  memo text,
  issue_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lovetree_feedback_recent_idx
  ON lovetree_feedback (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lovetree_feedback_status_idx
  ON lovetree_feedback (product_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS lovetree_feedback_kind_idx
  ON lovetree_feedback (product_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS lovetree_feedback_journal_idx
  ON lovetree_feedback (product_id, subject_id, journal_date);

-- 게시판 답글. 고객에게 보이는 답변(customer)과 내부 메모(internal).
-- status·edited_at: 고객이 자기 덧붙임을 고치거나 지울 때 쓴다(커뮤니티 댓글과 같은 방식 —
-- 지우기는 실제 삭제가 아니라 status='deleted'. 기존 행은 기본 'visible').
CREATE TABLE IF NOT EXISTS lovetree_feedback_replies (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id text NOT NULL,
  post_id bigint NOT NULL,
  author_type text NOT NULL CHECK (author_type IN ('customer','internal')),
  author_subject_id text,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);
CREATE INDEX IF NOT EXISTS lovetree_feedback_replies_post_idx
  ON lovetree_feedback_replies (product_id, post_id, created_at);

-- #1190: 공용 운영센터로 보낼 줄. 의견 id·종류·일 키를 묶어 같은 일을 두 번 넣지 않는다.
CREATE TABLE IF NOT EXISTS lovetree_feedback_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id text NOT NULL,
  feedback_id bigint NOT NULL,
  event_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('new','append','status')),
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, feedback_id, kind, event_key)
);
CREATE INDEX IF NOT EXISTS lovetree_feedback_outbox_due_idx
  ON lovetree_feedback_outbox (status, next_attempt_at) WHERE status = 'pending';

-- AI 고객 페르소나 소개. 관리자가 쓰고 고친다.
CREATE TABLE IF NOT EXISTS lovetree_ai_personas (
  product_id text NOT NULL,
  subject_id text NOT NULL,
  name text NOT NULL,
  intro jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, subject_id)
);

-- 운영센터 고객 열람 기록(261116 대표 결정). 관리자가 고객 자세히 판을 열 때마다 한 줄.
-- 90일 자동 삭제 대상(access-log-retention-postgres.js 의 ACCESS_LOG_RETENTION_TARGETS).
-- 자세한 것은 server/db/migrations/admin-customer-views-261116.sql 과 같다.
CREATE TABLE IF NOT EXISTS lovetree_admin_customer_views (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id text NOT NULL,
  customer_subject_id text NOT NULL,
  admin_subject_id text NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lovetree_admin_customer_views_retention_idx
  ON lovetree_admin_customer_views (viewed_at, id);
CREATE INDEX IF NOT EXISTS lovetree_admin_customer_views_customer_idx
  ON lovetree_admin_customer_views (product_id, customer_subject_id, viewed_at DESC);

-- #1163(#1068 2단계): 보임 쪽 공유 동기화 실패 표식 — 계정당 한 줄. 보임 동기화가 저장 응답 뒤에
-- 실패하면 표식을 남기고, 표식이 있는 계정은 다음 저장·조회 요청에서 보임 동기화를 다시 시도해
-- 성공하면 해제한다. (server/db/migrations/share-show-pending-261122.sql 과 같은 모양.)
CREATE TABLE IF NOT EXISTS lovetree_share_show_pending (
  product_id text NOT NULL,
  subject_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, subject_id)
);
