/**
 * 운영센터 전체 숫자 집계 (#655 2차).
 *
 * 한 번의 집계 질의로 끝낸다 — 전체 행을 Node 로 읽어 세지 않는다. 세는 자리마다 product_id
 * 로 먼저 좁히고(모든 대상 표가 product_id 로 시작하는 인덱스를 쓴다), 남은 계산은 SQL 안에서 한다.
 *
 * 세는 것과 근거:
 *   · 계정 = `lovetree_workspaces` 행이 있는 계정(러브트리 데이터가 있는 계정). 읽기만 한 계정은
 *     행이 없으므로 세지 않는다.
 *   · 새 계정 = 그 계정의 **가장 오래된 흔적**이 창(window) 안인 계정. 흔적으로 쓰는 것은 공유 행
 *     생성 시각과 고객 글 작성 시각이다(개인정보가 없는 시각 열). 요청 클레임 표는 90일 보관 뒤
 *     지워지므로 근거로 쓰지 않는다 — 오래 쉬다 돌아온 계정이 '새 계정'으로 보이는 것을 막는다.
 *     다만 자동 공개 행이 생기기 시작한 2026-11-14 이전 계정은 그 전 시각이 남아 있지 않아,
 *     그 주에 한해 새 계정 수가 실제보다 클 수 있다(그 뒤로는 정확하다).
 *   · 트리·순간 = `lovetree_workspaces.doc` 의 trees/moments 배열 길이 합(문서당 한 번).
 *   · 새 순간 = 순간의 `createdAt`(ISO 글자)이 창 안인 것. ISO-8601 UTC 글자라 글자 비교로 충분하다.
 *   · 공개 트리 = 활성 공유 행이 있고 비공개 표시가 없는 트리(중복 제거).
 *   · 둘러보기 소개 = 공개 트리 중 둘러보기 조건과 같은 것 — 활성 공유 행의 moment_count>=3 이고
 *     (자동 공개 행이거나 주인이 소개를 켠 행), 숨김 처리된 공유 행이 없는 트리(community-postgres 의
 *     `listDiscoverable` 과 같은 조건).
 *   · AI 테스터 = `lovetree_product_roles.role='ai_customer'` 인 subject. 전체 숫자에 포함되며
 *     실제 사용자 = 전체 − AI 테스터로 응답에서 나뉜다.
 *
 * 응답에는 숫자만 담는다 — subject·이메일·이름은 돌려주지 않는다.
 */

const NUMERIC_FIELDS = [
  'accountsReal', 'accountsAi', 'accountsNewReal', 'accountsNewAi',
  'treesReal', 'treesAi',
  'momentsReal', 'momentsAi', 'momentsNewReal', 'momentsNewAi',
  'publicReal', 'publicAi',
  'featuredReal', 'featuredAi'
];

const SQL = `
WITH ai AS (
  SELECT subject_id FROM lovetree_product_roles
  WHERE product_id = $1 AND role = 'ai_customer'
),
docs AS (
  SELECT w.subject_id, w.doc,
         EXISTS (SELECT 1 FROM ai a WHERE a.subject_id = w.subject_id) AS ai_tester
  FROM lovetree_workspaces w
  WHERE w.product_id = $1
),
per_doc AS (
  SELECT d.subject_id, d.ai_tester,
         COALESCE(jsonb_array_length(d.doc->'trees'), 0) AS trees,
         COALESCE(m.moments, 0) AS moments,
         COALESCE(m.moments_since, 0) AS moments_since
  FROM docs d
  LEFT JOIN LATERAL (
    SELECT (count(*))::int AS moments,
           (count(*) FILTER (WHERE (moment->>'createdAt') >= $2))::int AS moments_since
    FROM jsonb_array_elements(COALESCE(d.doc->'trees', '[]'::jsonb)) AS tree
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(tree->'moments', '[]'::jsonb)) AS moment
  ) m ON true
),
active_share AS (
  SELECT s.subject_id, s.share_id, s.tree_id, s.moment_count, s.origin, s.discoverable,
         EXISTS (SELECT 1 FROM ai a WHERE a.subject_id = s.subject_id) AS ai_tester
  FROM lovetree_shares s
  WHERE s.product_id = $1 AND s.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM lovetree_tree_visibility v
      WHERE v.product_id = s.product_id AND v.subject_id = s.subject_id
        AND v.tree_id = s.tree_id AND v.visibility = 'private'
    )
),
public_tree AS (
  SELECT DISTINCT subject_id, tree_id, ai_tester FROM active_share
),
featured_tree AS (
  SELECT DISTINCT s.subject_id, s.tree_id, s.ai_tester
  FROM active_share s
  WHERE s.moment_count >= 3
    AND (s.origin = 'auto' OR s.discoverable = true)
    AND NOT EXISTS (
      SELECT 1 FROM lovetree_community_hidden_shares h
      JOIN lovetree_shares s2 ON s2.product_id = h.product_id AND s2.share_id = h.share_id
      WHERE h.product_id = $1 AND s2.subject_id = s.subject_id AND s2.tree_id = s.tree_id
    )
),
first_seen AS (
  SELECT subject_id, min(at) AS at FROM (
    SELECT subject_id, created_at AS at FROM lovetree_shares WHERE product_id = $1
    UNION ALL
    SELECT subject_id, created_at FROM lovetree_feedback WHERE product_id = $1 AND subject_id IS NOT NULL
  ) evidence
  GROUP BY subject_id
),
account_row AS (
  SELECT (count(*))::int AS "accountsReal",
         (count(*) FILTER (WHERE d.ai_tester))::int AS "accountsAi",
         (count(*) FILTER (WHERE NOT d.ai_tester AND f.at >= $2::timestamptz))::int AS "accountsNewReal",
         (count(*) FILTER (WHERE d.ai_tester AND f.at >= $2::timestamptz))::int AS "accountsNewAi"
  FROM per_doc d LEFT JOIN first_seen f ON f.subject_id = d.subject_id
),
tree_row AS (
  SELECT (COALESCE(sum(trees) FILTER (WHERE NOT ai_tester), 0))::int AS "treesReal",
         (COALESCE(sum(trees) FILTER (WHERE ai_tester), 0))::int AS "treesAi",
         (COALESCE(sum(moments) FILTER (WHERE NOT ai_tester), 0))::int AS "momentsReal",
         (COALESCE(sum(moments) FILTER (WHERE ai_tester), 0))::int AS "momentsAi",
         (COALESCE(sum(moments_since) FILTER (WHERE NOT ai_tester), 0))::int AS "momentsNewReal",
         (COALESCE(sum(moments_since) FILTER (WHERE ai_tester), 0))::int AS "momentsNewAi"
  FROM per_doc
),
public_row AS (
  SELECT (count(*) FILTER (WHERE NOT ai_tester))::int AS "publicReal",
         (count(*) FILTER (WHERE ai_tester))::int AS "publicAi"
  FROM public_tree
),
featured_row AS (
  SELECT (count(*) FILTER (WHERE NOT ai_tester))::int AS "featuredReal",
         (count(*) FILTER (WHERE ai_tester))::int AS "featuredAi"
  FROM featured_tree
)
SELECT * FROM account_row, tree_row, public_row, featured_row
`;

export function createStatsRepo(pool) {
  return {
    async aggregate({ productId, since } = {}) {
      const result = await pool.query(SQL, [productId, since]);
      const row = result.rows[0] ?? {};
      const out = {};
      for (const field of NUMERIC_FIELDS) {
        const value = Number(row[field]);
        out[field] = Number.isSafeInteger(value) && value > 0 ? value : 0;
      }
      return out;
    }
  };
}