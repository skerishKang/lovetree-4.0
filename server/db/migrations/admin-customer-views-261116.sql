-- 운영센터 고객 열람 기록(261116 대표 결정: 운영진은 고객 정보를 다 본다 — 대신 누가 언제 어느 고객을 열었는지 남긴다).
-- 관리자가 고객 자세히 판을 열 때마다 한 줄(누가·언제·어느 고객). 90일 자동 삭제 대상
-- (server/db/access-log-retention-postgres.js 의 ACCESS_LOG_RETENTION_TARGETS에 같이 넣는다).
-- FK 없이 스스로 선다 — lovetree_product_role_audit·lovetree_community_moderation_audit와 같은 방식.
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
