-- 2026-11-14 고객 의견 창구 (#540). 운영 DB에 표를 얹는 경로.
-- schema.sql에도 같은 내용이 있고, 이 파일은 이미 배포된 DB에 표를 더한다(모두 IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS lovetree_feedback (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id text NOT NULL,
  subject_id text,
  category text NOT NULL CHECK (category IN ('bug','inconvenient','feature','other')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
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