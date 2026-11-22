-- #1211: 운영센터 수신 일 키와 외부 답글 번호. 재실행해도 안전하다.
ALTER TABLE lovetree_feedback_replies ADD COLUMN IF NOT EXISTS ops_reply_id text;

CREATE TABLE IF NOT EXISTS lovetree_feedback_ingest_events (
  product_id text NOT NULL,
  event_key text NOT NULL CHECK (event_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id,event_key)
);
