/**
 * 운영센터 고객 정보(261116 대표 결정: 운영진은 고객 정보를 다 본다).
 *
 * 읽기만 한다 — 이 저장소에는 고객 기록을 고치거나 지우는 질의가 없다. 유일한 쓰기는
 * 열람 기록(누가·언제·어느 고객) 한 줄을 더하는 것이고, 그 줄은 90일 자동 삭제 대상이다.
 *
 * 근거 표:
 *   · 계정 = lovetree_account_emails — 러브트리에 로그인한 적 있는 계정. created_at = 가입일(첫 로그인),
 *     updated_at = 마지막 로그인(로그인할 때마다 upsertEmail 이 갱신한다).
 *   · 마지막 활동 = lovetree_workspaces.saved_at(마지막 기록 저장).
 *   · 표시 이름 = workspace 문서의 prefs.displayName(#368).
 *   · 트리·순간 = 같은 문서의 trees/moments 배열(공개·비공개 모두).
 *   · 트리 공개 상태 = lovetree_tree_visibility('private' → 나만) · lovetree_shares(활성 → 링크 공유)
 *     · lovetree_tree_discover(true → 둘러보기 소개).
 *   · 구분 = lovetree_product_roles.role('ai_customer' → AI 명예회원, 'tester' → 시험, 없음 → 실제 고객).
 *
 * subject는 자세히 판을 여는 내부 식별자로만 쓰고 화면 글자에는 가린 id만 보인다(server/admin-customers.js 의
 * maskSubjectId). 이메일·표시 이름은 대표 결정에 따라 전문으로 내려 준다.
 */

const iso = (value) => (value instanceof Date ? value.toISOString() : (value ?? null));

const ACCOUNT_LIST_SQL = `
SELECT e.subject_id,
       e.email,
       e.created_at AS joined_at,
       e.updated_at AS last_login_at,
       w.saved_at AS last_activity_at,
       COALESCE(w.doc->'prefs'->>'displayName', '') AS display_name,
       (SELECT count(*) FROM jsonb_array_elements(COALESCE(w.doc->'trees', '[]'::jsonb)))::int AS tree_count,
       (SELECT count(*) FROM jsonb_array_elements(COALESCE(w.doc->'trees', '[]'::jsonb)) AS t
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(t->'moments', '[]'::jsonb)))::int AS moment_count,
       r.role
FROM lovetree_account_emails e
LEFT JOIN lovetree_workspaces w ON w.product_id = e.product_id AND w.subject_id = e.subject_id
LEFT JOIN lovetree_product_roles r ON r.product_id = e.product_id AND r.subject_id = e.subject_id
WHERE e.product_id = $1
ORDER BY last_activity_at DESC NULLS LAST, e.created_at DESC, e.subject_id`;

const ACCOUNT_DETAIL_SQL = `
SELECT e.subject_id, e.email, e.created_at AS joined_at, e.updated_at AS last_login_at,
       w.saved_at AS last_activity_at, w.doc, r.role
FROM lovetree_account_emails e
LEFT JOIN lovetree_workspaces w ON w.product_id = e.product_id AND w.subject_id = e.subject_id
LEFT JOIN lovetree_product_roles r ON r.product_id = e.product_id AND r.subject_id = e.subject_id
WHERE e.product_id = $1 AND e.subject_id = $2`;

// 트리마다 공개 상표를 한 번에 모은다(나만 / 링크 공유 / 둘러보기 소개).
const TREE_MARKERS_SQL = `
SELECT v.tree_id, 'private' AS kind, v.visibility AS value
FROM lovetree_tree_visibility v WHERE v.product_id = $1 AND v.subject_id = $2
UNION ALL
SELECT s.tree_id, 'share', s.status FROM lovetree_shares s WHERE s.product_id = $1 AND s.subject_id = $2
UNION ALL
SELECT d.tree_id, 'discover', d.discover::text FROM lovetree_tree_discover d WHERE d.product_id = $1 AND d.subject_id = $2`;

const RECORD_VIEW_SQL = `
INSERT INTO lovetree_admin_customer_views (product_id, customer_subject_id, admin_subject_id, viewed_at)
VALUES ($1, $2, $3, now())`;

const RECENT_VIEWS_SQL = `
SELECT v.id, v.customer_subject_id, v.admin_subject_id, v.viewed_at,
       COALESCE(e.email, '') AS email,
       COALESCE(w.doc->'prefs'->>'displayName', '') AS display_name
FROM lovetree_admin_customer_views v
LEFT JOIN lovetree_account_emails e ON e.product_id = v.product_id AND e.subject_id = v.customer_subject_id
LEFT JOIN lovetree_workspaces w ON w.product_id = v.product_id AND w.subject_id = v.customer_subject_id
WHERE v.product_id = $1
ORDER BY v.viewed_at DESC, v.id DESC
LIMIT $2`;

export function createAdminCustomersRepo(pool) {
  return {
    async list({ productId }) {
      const { rows } = await pool.query(ACCOUNT_LIST_SQL, [productId]);
      return rows.map((row) => ({
        subjectId: row.subject_id,
        email: row.email,
        displayName: row.display_name || '',
        role: row.role ?? null,
        joinedAt: iso(row.joined_at),
        lastLoginAt: iso(row.last_login_at),
        lastActivityAt: iso(row.last_activity_at),
        treeCount: Number(row.tree_count) || 0,
        momentCount: Number(row.moment_count) || 0
      }));
    },

    async detail({ productId, subjectId }) {
      const { rows } = await pool.query(ACCOUNT_DETAIL_SQL, [productId, subjectId]);
      const row = rows[0];
      if (!row) return null;
      const markers = await pool.query(TREE_MARKERS_SQL, [productId, subjectId]);
      return {
        subjectId: row.subject_id,
        email: row.email,
        displayName: row.doc?.prefs?.displayName || '',
        role: row.role ?? null,
        joinedAt: iso(row.joined_at),
        lastLoginAt: iso(row.last_login_at),
        lastActivityAt: iso(row.last_activity_at),
        doc: row.doc ?? null,
        markers: markers.rows.map((m) => ({ treeId: m.tree_id, kind: m.kind, value: m.value }))
      };
    },

    async recordView({ productId, customerSubjectId, adminSubjectId }) {
      await pool.query(RECORD_VIEW_SQL, [productId, customerSubjectId, adminSubjectId]);
    },

    async recentViews({ productId, limit = 20 }) {
      const size = Math.max(1, Math.min(100, Number(limit) || 20));
      const { rows } = await pool.query(RECENT_VIEWS_SQL, [productId, size]);
      return rows.map((row) => ({
        id: String(row.id),
        customerSubjectId: row.customer_subject_id,
        adminSubjectId: row.admin_subject_id,
        viewedAt: iso(row.viewed_at),
        email: row.email || '',
        displayName: row.display_name || ''
      }));
    }
  };
}
