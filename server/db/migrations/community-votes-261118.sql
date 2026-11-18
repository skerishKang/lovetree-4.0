-- 2026-11-18 투표 기록 표(#824 대표 결정, docs/METRICS.md). '인기 = 이번 주에 담은 사람 수'의 근원 표다.
-- 1) 새 표: 대상 종류(target_kind)가 'tree'(공개 트리 카드 — 1차, 기존 담기 기반)와 'stage'(무대 영상 —
--    2차, #792 4단계와 함께) 둘 다 되게 처음부터 잡는다(2차 때 구조 변경 없음). PK로 1인 1표 영구를
--    보장한다(재담기·해제 반복과 무관하게 표는 하나). 가입 7일 게이트는 서비스 계층이 한다.
-- 2) 백필: 지금까지의 즐겨찾기를 트리 투표로 옮겨 적는다 — voted_at은 즐겨찾기 created_at(지난 주에
--    담았으면 지난 주 표로 자연 귀속). 재실행 안전(ON CONFLICT DO NOTHING). 즐겨찾기 행은 그대로 둔다
--    (지금 화면의 즐겨찾기 수는 이 표를 계속 쓴다 — 이 마이그레이션은 읽기 값 하나도 바꾸지 않는다).

CREATE TABLE IF NOT EXISTS lovetree_community_votes (
  product_id text NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('tree','stage')),
  target_id text NOT NULL,
  subject_id text NOT NULL,
  voted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, target_kind, target_id, subject_id)
);
CREATE INDEX IF NOT EXISTS lovetree_community_votes_week_idx
  ON lovetree_community_votes (product_id, target_kind, voted_at);

INSERT INTO lovetree_community_votes (product_id, target_kind, target_id, subject_id, voted_at)
SELECT product_id, 'tree', share_id, subject_id, created_at
FROM lovetree_community_favorites
ON CONFLICT DO NOTHING;
