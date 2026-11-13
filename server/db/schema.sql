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
  role text NOT NULL CHECK (role IN ('admin','ai_customer')),
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

CREATE TABLE IF NOT EXISTS lovetree_community_reactions (
  product_id text NOT NULL,
  share_id text NOT NULL,
  subject_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('heart','like','love','laugh','wow','sad','angry')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, share_id, subject_id, kind)
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

CREATE TABLE IF NOT EXISTS lovetree_community_comments (
  product_id text NOT NULL,
  comment_id text NOT NULL,
  share_id text NOT NULL,
  subject_id text NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  client_key text NOT NULL,
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','deleted','hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  PRIMARY KEY (product_id, comment_id),
  UNIQUE (product_id, subject_id, client_key)
);
-- Existing deployments lack edited_at. The column is nullable so old rows
-- remain valid; the same ALTER lives in
-- server/db/migrations/community-comments-enhance-261104.sql (not auto-applied).
DO $$ BEGIN ALTER TABLE lovetree_community_comments ADD COLUMN IF NOT EXISTS edited_at timestamptz; END $$;
CREATE INDEX IF NOT EXISTS lovetree_community_comments_share_idx
  ON lovetree_community_comments (product_id, share_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lovetree_community_reports (
  product_id text NOT NULL,
  report_id text NOT NULL,
  share_id text NOT NULL,
  reporter_subject_id text NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  client_key text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text,
  PRIMARY KEY (product_id, report_id),
  UNIQUE (product_id, reporter_subject_id, client_key)
);

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
CREATE TABLE IF NOT EXISTS lovetree_account_emails (
  product_id text NOT NULL,
  subject_id text NOT NULL,
  email text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
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
-- 상태: 받음(received) / 확인 중(reviewing) / 고침(fixed) / 다음에(later).
-- 종류: 이상해요(bug) / 불편해요(inconvenient) / 기능 제안(feature) / 그 밖에(other).
CREATE TABLE IF NOT EXISTS lovetree_feedback (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id text NOT NULL,
  subject_id text,
  kind text NOT NULL DEFAULT 'opinion' CHECK (kind IN ('opinion','journal')),
  category text NOT NULL CHECK (category IN ('bug','inconvenient','feature','other')),
  title text,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  score smallint CHECK (score IS NULL OR (score BETWEEN 1 AND 5)),
  journal_date date,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','reviewing','fixed','later')),
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
CREATE TABLE IF NOT EXISTS lovetree_feedback_replies (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id text NOT NULL,
  post_id bigint NOT NULL,
  author_type text NOT NULL CHECK (author_type IN ('customer','internal')),
  author_subject_id text,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lovetree_feedback_replies_post_idx
  ON lovetree_feedback_replies (product_id, post_id, created_at);

-- AI 고객 페르소나 소개. 관리자가 쓰고 고친다.
CREATE TABLE IF NOT EXISTS lovetree_ai_personas (
  product_id text NOT NULL,
  subject_id text NOT NULL,
  name text NOT NULL,
  intro jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, subject_id)
);
