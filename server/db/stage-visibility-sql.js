import { ROLE_AI_CUSTOMER } from '../admin-roles.js';
import { rankingOwnerSql } from './ranking-policy-sql.js';

// 현재 공개된 원본과 소개 동의가 판단 기준이다. 영구 무대와 저장된 소속만으로 공개할 수 없다.
// 소유자 동기화와 개인화된 공개 읽기는 각각 두 번째 매개변수에 계정을 전달한다.
export function eligibleStageTreesSql({ ownerParam = false, viewerParam = false, forRanking = false, hasRealCustomers = false } = {}) {
  const visibleRole = rankingOwnerSql(forRanking && hasRealCustomers);
  return `SELECT picked.product_id, picked.subject_id, picked.tree_id, picked.share_id,
           picked.ai_tester, w.revision AS source_revision, t.tree_doc
    FROM (
      SELECT DISTINCT ON (s.subject_id, s.tree_id)
             s.product_id, s.subject_id, s.tree_id, s.share_id,
             COALESCE(owner_role.role = '${ROLE_AI_CUSTOMER}', false) AS ai_tester
      FROM lovetree_shares s
      JOIN lovetree_tree_discover d USING (product_id, subject_id, tree_id)
      LEFT JOIN lovetree_tree_visibility v USING (product_id, subject_id, tree_id)
      LEFT JOIN lovetree_product_roles owner_role USING (product_id, subject_id)
      WHERE s.product_id = $1 AND s.status = 'active' AND s.moment_count >= 3 AND d.discover
        AND v.visibility IS DISTINCT FROM 'private' AND ${visibleRole}
        ${ownerParam ? 'AND s.subject_id = $2' : ''}
        AND NOT EXISTS (
          SELECT 1 FROM lovetree_shares alias
          JOIN lovetree_community_hidden_shares h USING (product_id, share_id)
          WHERE alias.product_id = s.product_id AND alias.subject_id = s.subject_id AND alias.tree_id = s.tree_id
        )
        ${viewerParam ? `AND NOT EXISTS (
          SELECT 1 FROM lovetree_community_blocks b WHERE b.product_id = s.product_id
            AND ((b.blocker_subject_id = $2 AND b.blocked_subject_id = s.subject_id)
              OR (b.blocker_subject_id = s.subject_id AND b.blocked_subject_id = $2))
        )` : ''}
      ORDER BY s.subject_id, s.tree_id, (s.origin = 'auto') DESC, s.created_at DESC, s.share_id DESC
    ) picked
    JOIN lovetree_workspaces w USING (product_id, subject_id)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(w.doc->'trees') = 'array' THEN w.doc->'trees' ELSE '[]'::jsonb END
    ) AS t(tree_doc)
    WHERE w.doc->'version' = '1'::jsonb AND t.tree_doc->>'id' = picked.tree_id
      AND CASE WHEN jsonb_typeof(t.tree_doc->'moments') = 'array' THEN jsonb_array_length(t.tree_doc->'moments') >= 3 ELSE false END`;
}

// 소속 revision과 현재 공개 순간을 함께 확인한다. 표현에 필요한 제목·주소·구간만 투영한다.
export function visibleStageMomentsSql({ forRanking = false, hasRealCustomers = false } = {}) {
  const eligible = eligibleStageTreesSql({ viewerParam: true, forRanking, hasRealCustomers });
  return `SELECT m.stage_id, m.subject_id, m.tree_id, m.moment_id, m.source_revision, e.share_id, e.ai_tester,
      e.tree_doc->>'title' AS tree_title, p.moment->>'url' AS moment_url,
      p.moment->'startSeconds' AS start_seconds, p.moment->'endSeconds' AS end_seconds,
      COALESCE(NULLIF(p.moment #>> '{mediaMetadata,title}',''), NULLIF(p.moment->>'title',''), e.tree_doc->>'title') AS title
    FROM (${eligible}) e
    JOIN lovetree_stage_moments m USING (product_id, subject_id, tree_id, source_revision)
    CROSS JOIN LATERAL (
      SELECT t.moment FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(e.tree_doc->'moments')='array' THEN e.tree_doc->'moments' ELSE '[]'::jsonb END
      ) AS t(moment) WHERE t.moment->>'id'=m.moment_id LIMIT 1
    ) p`;
}

// 서버 내부 결과. 소유자 키는 같은 로컬 tree_id를 사용하는 계정을 구분하는 데 쓴다.
export async function listVisibleStageMoments(db, { productId, viewerSubjectId = null, stageId = null, forRanking = false, hasRealCustomers = false }) {
  const { rows } = await db.query(`
    SELECT stage_id, subject_id, tree_id, moment_id, source_revision, share_id, ai_tester
    FROM (${visibleStageMomentsSql({ forRanking, hasRealCustomers })}) visible
    WHERE $3::text IS NULL OR stage_id=$3
    ORDER BY stage_id, subject_id, tree_id, moment_id`,
    [productId, viewerSubjectId, stageId]);
  return rows;
}
