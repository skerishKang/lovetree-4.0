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
