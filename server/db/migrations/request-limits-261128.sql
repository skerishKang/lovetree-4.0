CREATE TABLE IF NOT EXISTS lovetree_rate_limits (
  product_id text NOT NULL,
  scope text NOT NULL,
  window_start timestamptz NOT NULL,
  count bigint NOT NULL DEFAULT 1 CHECK (count >= 1),
  PRIMARY KEY (product_id, scope, window_start)
);
CREATE INDEX IF NOT EXISTS lovetree_rate_limits_retention_idx
  ON lovetree_rate_limits (window_start, product_id, scope);

CREATE TABLE IF NOT EXISTS lovetree_share_previews (
  token_hash char(64) PRIMARY KEY,
  product_id text NOT NULL,
  subject_id text NOT NULL,
  tree_id text NOT NULL,
  request_hash char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  result_share_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lovetree_share_previews_retention_idx
  ON lovetree_share_previews (expires_at, product_id, subject_id);
