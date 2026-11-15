-- 2026-11-16 둘러보기 소개 기본 꺼짐(대표 결정 — AI 명예회원 두 명이 공개를 무서워함).
-- 1) 트리 둘러보기 소개 표: 행이 없으면 꺼짐이다(스파스 운용 — 켠 트리의 행만 쌓인다).
--    소개 켜기·끄기는 무료다(비공개 전환만 Plus 전용 — 그 표와 별개).
-- 2) 지금 둘러보기에 나오는 트리는 켜짐으로 채운다 — 고객 데이터를 바꾸지 않고 기존 공개 상태를
--    그대로 둔다(재실행 안전: ON CONFLICT DO NOTHING). 나오던 조건은 #538 둘러보기 SQL과 같게
--    active + moment_count>=3 + (auto 또는 discoverable) + 비공개 아님 + 숨김 없음이다.
-- 3) 둘러보기 목록·다른 팬 보기(tag-moments)·sitemap(목록을 따라감)은 '소개 켜짐 + 순간 3개 이상'
--    만 나열한다. 시험 계정(tester) 거름은 서비스층이 역할로 한다(기존 규칙 #678 후속 그대로).

CREATE TABLE IF NOT EXISTS lovetree_tree_discover (
  product_id text NOT NULL,
  subject_id text NOT NULL,
  tree_id text NOT NULL,
  discover boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, subject_id, tree_id)
);

INSERT INTO lovetree_tree_discover (product_id, subject_id, tree_id, discover)
SELECT DISTINCT s.product_id, s.subject_id, s.tree_id, true
FROM lovetree_shares s
WHERE s.status = 'active' AND s.moment_count >= 3
  AND (s.origin = 'auto' OR s.discoverable = true)
  AND NOT EXISTS (
    SELECT 1 FROM lovetree_tree_visibility v
    WHERE v.product_id = s.product_id AND v.subject_id = s.subject_id
      AND v.tree_id = s.tree_id AND v.visibility = 'private'
  )
  AND NOT EXISTS (
    SELECT 1 FROM lovetree_shares s2
    WHERE s2.product_id = s.product_id AND s2.tree_id = s.tree_id
      AND EXISTS (SELECT 1 FROM lovetree_community_hidden_shares h
                  WHERE h.product_id = s2.product_id AND h.share_id = s2.share_id)
  )
ON CONFLICT (product_id, subject_id, tree_id) DO NOTHING;
