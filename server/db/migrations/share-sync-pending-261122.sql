-- 적용 DB 마이그레이션(이 파일만 단독 적용은 하지 않는다).
-- PR: #1163 — 보임 쪽 공유 동기화를 응답 뒤로 미루고 실패 표식으로 다시 한다.
-- 내용: 보임 동기화 실패 계정을 기억하는 표를 덧붙인다. 기존 데이터는 옮기거나 지우지 않는다.
CREATE TABLE IF NOT EXISTS lovetree_share_sync_pending (
  product_id text NOT NULL,
  subject_id text NOT NULL,
  marked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, subject_id)
);
CREATE INDEX IF NOT EXISTS lovetree_share_sync_pending_marked_idx
  ON lovetree_share_sync_pending (product_id, marked_at);
