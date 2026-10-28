const iso = (value) => (value instanceof Date ? value.toISOString() : value === null || value === undefined ? null : String(value));

/**
 * 제품 역할의 PostgreSQL 저장소(#67). `server/admin-roles.js`가 요구하는 계약만 구현한다.
 * 질의는 전부 매개변수화 — 역할 자리에 들어올 수 있는 값은 서버가 확인한 canonical subject뿐이다.
 */
export function createAdminRoleRepo(pool) {
  if (!pool || typeof pool.query !== 'function') throw new Error('PostgreSQL pool이 필요합니다.');

  return {
    async roleFor({ productId, subjectId }) {
      const result = await pool.query(
        'SELECT product_id, subject_id, role, granted_by, updated_at FROM lovetree_product_roles WHERE product_id = $1 AND subject_id = $2',
        [productId, subjectId]
      );
      const row = result.rows[0];
      return row ? { productId: row.product_id, subjectId: row.subject_id, role: row.role, grantedBy: row.granted_by, updatedAt: iso(row.updated_at) } : null;
    },

    async assign({ productId, subjectId, role, grantedBy, reason = null, at }) {
      const existing = await pool.query(
        'SELECT role FROM lovetree_product_roles WHERE product_id = $1 AND subject_id = $2',
        [productId, subjectId]
      );
      const previousRole = existing.rows[0]?.role ?? null;
      const row = await pool.query(
        `INSERT INTO lovetree_product_roles (product_id, subject_id, role, granted_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, now(), now())
         ON CONFLICT (product_id, subject_id)
         DO UPDATE SET role = EXCLUDED.role, granted_by = EXCLUDED.granted_by, updated_at = now()
         RETURNING product_id, subject_id, role, granted_by, updated_at`,
        [productId, subjectId, role, grantedBy]
      );
      const saved = row.rows[0];
      await pool.query(
        `INSERT INTO lovetree_product_role_audit (product_id, subject_id, action, previous_role, role, actor_subject_id, reason)
         VALUES ($1, $2, 'assign', $3, $4, $5, $6)`,
        [productId, subjectId, previousRole, saved.role, grantedBy, reason]
      );
      return { subjectId: saved.subject_id, role: saved.role, grantedBy: saved.granted_by, updatedAt: iso(saved.updated_at) };
    },

    async revoke({ productId, subjectId, revokedBy }) {
      const removed = await pool.query(
        'DELETE FROM lovetree_product_roles WHERE product_id = $1 AND subject_id = $2 RETURNING role, updated_at',
        [productId, subjectId]
      );
      const previous = removed.rows[0] ?? null;
      await pool.query(
        `INSERT INTO lovetree_product_role_audit (product_id, subject_id, action, previous_role, role, actor_subject_id)
         VALUES ($1, $2, 'revoke', $3, NULL, $4)`,
        [productId, subjectId, previous?.role ?? null, revokedBy]
      );
      return previous ? { subjectId, updatedAt: iso(previous.updated_at) } : null;
    },

    async list({ productId }) {
      const result = await pool.query(
        'SELECT subject_id, role, granted_by, updated_at FROM lovetree_product_roles WHERE product_id = $1 ORDER BY updated_at DESC LIMIT 200',
        [productId]
      );
      return result.rows.map((row) => ({ productId, subjectId: row.subject_id, role: row.role, grantedBy: row.granted_by, updatedAt: iso(row.updated_at) }));
    },

    async history({ productId, limit = 20 }) {
      const result = await pool.query(
        `SELECT subject_id, action, previous_role, role, actor_subject_id, changed_at
         FROM lovetree_product_role_audit WHERE product_id = $1 ORDER BY id DESC LIMIT $2`,
        [productId, limit]
      );
      return result.rows.map((row) => ({ productId, subjectId: row.subject_id, action: row.action, previousRole: row.previous_role, role: row.role, actorSubjectId: row.actor_subject_id, changedAt: iso(row.changed_at) }));
    }
  };
}
