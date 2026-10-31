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
  role text NOT NULL CHECK (role IN ('admin')),
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
  kind text NOT NULL CHECK (kind IN ('heart')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, share_id, subject_id, kind)
);

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
  PRIMARY KEY (product_id, comment_id),
  UNIQUE (product_id, subject_id, client_key)
);
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
