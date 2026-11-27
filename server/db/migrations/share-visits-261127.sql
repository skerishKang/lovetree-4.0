-- #1443: 공유별 누적 방문 수와 단기 중복 방지 자료를 분리한다.
CREATE TABLE IF NOT EXISTS lovetree_share_visits (
  product_id text NOT NULL,
  share_id text NOT NULL,
  visits bigint NOT NULL DEFAULT 0 CHECK (visits >= 0),
  PRIMARY KEY (product_id, share_id),
  FOREIGN KEY (product_id, share_id) REFERENCES lovetree_shares (product_id, share_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS lovetree_share_visit_dedup (
  product_id text NOT NULL,
  share_id text NOT NULL,
  visitor_hash text NOT NULL CHECK (visitor_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (product_id, share_id, visitor_hash),
  FOREIGN KEY (product_id, share_id) REFERENCES lovetree_shares (product_id, share_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS lovetree_share_visit_dedup_expiry_idx
  ON lovetree_share_visit_dedup (expires_at);
