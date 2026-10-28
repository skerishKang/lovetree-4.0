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
