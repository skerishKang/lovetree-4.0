-- 2026-11-14 공개가 기본 (#538). schema.sql 의 같은 문장과 한 벌로 유지한다.
-- 1) 트리 공개 상태 표: 행이 없으면 공개다(스파스 운용 — 비공개 행만 쌓인다).
--    비공개는 Plus 전용이고, 판단은 서버가 한다(화면 잠금만으로 막지 않는다).
-- 2) 공유 행에 origin('owner'|'auto')·moment_count 를 추가한다.
--    moment_count 는 /api/workspace 저장 성공 뒤 같은 훅에서 갱신되고,
--    둘러보기 SQL 은 moment_count >= 3 으로 거른다(직접 올린 사진만 있는 순간도 센다).
-- 3) 기존 공유 행의 moment_count 를 저장 문서에서 채운다(이전 — 기존 트리도 공개).

CREATE TABLE IF NOT EXISTS lovetree_tree_visibility (
  product_id text NOT NULL,
  subject_id text NOT NULL,
  tree_id text NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('public','private')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, subject_id, tree_id)
);

ALTER TABLE lovetree_shares ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'owner';
ALTER TABLE lovetree_shares ADD COLUMN IF NOT EXISTS moment_count integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lovetree_shares_origin_check') THEN
    ALTER TABLE lovetree_shares ADD CONSTRAINT lovetree_shares_origin_check CHECK (origin IN ('owner','auto'));
  END IF;
END
$$;

-- 트리 하나에 자동 공개 행은 하나뿐이다.
CREATE UNIQUE INDEX IF NOT EXISTS lovetree_shares_auto_unique_idx
  ON lovetree_shares (product_id, subject_id, tree_id) WHERE origin = 'auto';

-- 기존 공유 행의 순간 수를 저장 문서에서 채운다(둘러보기 조건 moment_count>=3).
UPDATE lovetree_shares s
SET moment_count = c.cnt, updated_at = now()
FROM (
  SELECT w.product_id, w.subject_id, tree->>'id' AS tree_id, COALESCE(jsonb_array_length(tree->'moments'), 0) AS cnt
  FROM lovetree_workspaces w, jsonb_array_elements(w.doc->'trees') AS tree
) c
WHERE s.product_id = c.product_id AND s.subject_id = c.subject_id AND s.tree_id = c.tree_id
  AND s.moment_count <> c.cnt;
