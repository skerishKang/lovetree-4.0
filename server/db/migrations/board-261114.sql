-- 2026-11-14 2차: 관리자 게시판 + AI 고객 사용 일지 + 페르소나.
-- schema.sql 에도 같은 내용이 있고, 이 파일은 이미 배포된 DB에 더한다(모두 IF NOT EXISTS / DROP IF EXISTS).

-- AI 고객 역할(관리자 기반과 같은 표). 실제 사용자에게는 보이지 않는다.
ALTER TABLE lovetree_product_roles DROP CONSTRAINT IF EXISTS lovetree_product_roles_role_check;
ALTER TABLE lovetree_product_roles ADD CONSTRAINT lovetree_product_roles_role_check CHECK (role IN ('admin','ai_customer'));

-- 의견(1차)을 '게시판 글'로 확장한다. 의견은 kind='opinion', 사용 일지는 kind='journal'.
ALTER TABLE lovetree_feedback ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'opinion';
ALTER TABLE lovetree_feedback ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE lovetree_feedback ADD COLUMN IF NOT EXISTS score smallint;
ALTER TABLE lovetree_feedback ADD COLUMN IF NOT EXISTS journal_date date;
ALTER TABLE lovetree_feedback DROP CONSTRAINT IF EXISTS lovetree_feedback_kind_check;
ALTER TABLE lovetree_feedback ADD CONSTRAINT lovetree_feedback_kind_check CHECK (kind IN ('opinion','journal'));
ALTER TABLE lovetree_feedback DROP CONSTRAINT IF EXISTS lovetree_feedback_score_check;
ALTER TABLE lovetree_feedback ADD CONSTRAINT lovetree_feedback_score_check CHECK (score IS NULL OR (score BETWEEN 1 AND 5));
CREATE INDEX IF NOT EXISTS lovetree_feedback_kind_idx
  ON lovetree_feedback (product_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS lovetree_feedback_journal_idx
  ON lovetree_feedback (product_id, subject_id, journal_date);

-- 답글. 고객에게 보이는 답변(customer)과 내부 메모(internal).
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

-- AI 고객 페르소나 소개(누구·왜·쓰는 모습·만족/실망·지금 상태). 관리자가 쓰고 고친다.
CREATE TABLE IF NOT EXISTS lovetree_ai_personas (
  product_id text NOT NULL,
  subject_id text NOT NULL,
  name text NOT NULL,
  intro jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, subject_id)
);