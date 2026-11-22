-- #1190: 새 의견을 공용 운영센터로 보낼 줄. schema.sql 의 같은 문장과 한 벌로 유지한다.
-- 의견 id·종류·일 키를 묶어 같은 일을 두 번 넣지 않는다(멱등). 재시도는 next_attempt_at 로 미룬다.
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
