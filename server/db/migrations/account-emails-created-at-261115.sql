-- 2026-11-15 계정 가입일 (#655 2차). 로그인 콜백이 계정을 넣는 lovetree_account_emails 는
-- updated_at 만 있어서 '첫 로그인 시각'이 로그인할 때마다 덮어써졌다. 러브트리 첫 로그인을
-- 가입일로 보기 위해 created_at 을 더하고, 이후 upsert 는 이 칸을 갱신하지 않는다.
--   · 새 행은 DEFAULT now() 로 첫 로그인 시각이 찍힌다.
--   · 이미 있던 행은 아래에서 한 번 채운다 — 그 계정의 가장 이른 흔적
--     (문서 안 트리·순간 createdAt 최솟값, 공유 행 생성 시각 최솟값, 고객 글 작성 시각 최솟값, 지금 updated_at)
--     중 가장 이른 값. 근거가 하나도 없으면 updated_at 을 쓴다.
-- 재실행 안전: ADD COLUMN IF NOT EXISTS 이고, 채우기는 같은 값을 다시 넣을 뿐이다.

ALTER TABLE lovetree_account_emails ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

WITH doc_stamps AS (
  -- 문서 안 트리·순간의 createdAt(ISO-8601 글자). 모양이 맞는 값만 본다(잘못된 글자로 전체가 멈추지 않게).
  SELECT w.product_id, w.subject_id, stamp.stamp
  FROM lovetree_workspaces w
  CROSS JOIN LATERAL (
    SELECT tree->>'createdAt' AS stamp
    FROM jsonb_array_elements(COALESCE(w.doc->'trees', '[]'::jsonb)) AS tree
    UNION ALL
    SELECT moment->>'createdAt'
    FROM jsonb_array_elements(COALESCE(w.doc->'trees', '[]'::jsonb)) AS tree
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(tree->'moments', '[]'::jsonb)) AS moment
  ) AS stamp
  WHERE stamp.stamp ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}'
),
doc_first AS (
  SELECT product_id, subject_id, (min(stamp))::timestamptz AS at
  FROM doc_stamps GROUP BY product_id, subject_id
),
share_first AS (
  SELECT product_id, subject_id, min(created_at) AS at FROM lovetree_shares GROUP BY product_id, subject_id
),
feedback_first AS (
  SELECT product_id, subject_id, min(created_at) AS at
  FROM lovetree_feedback WHERE subject_id IS NOT NULL GROUP BY product_id, subject_id
)
evidence AS (
  SELECT e.product_id, e.subject_id,
         LEAST(
           COALESCE(d.at, e.updated_at),
           COALESCE(s.at, e.updated_at),
           COALESCE(f.at, e.updated_at),
           e.updated_at
         ) AS at
  FROM lovetree_account_emails e
  LEFT JOIN doc_first d USING (product_id, subject_id)
  LEFT JOIN share_first s USING (product_id, subject_id)
  LEFT JOIN feedback_first f USING (product_id, subject_id)
)
UPDATE lovetree_account_emails e
SET created_at = ev.at
FROM evidence ev
WHERE ev.product_id = e.product_id
  AND ev.subject_id = e.subject_id
  AND e.created_at IS DISTINCT FROM ev.at;
