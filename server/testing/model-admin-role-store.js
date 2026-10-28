/**
 * 테스트·개발 전용 제품 역할 저장소. PostgreSQL 검증이 아니라 같은 계약의 모형이다.
 * 실제 배포에서는 `server/db/admin-roles-postgres.js`가 이 자리에 온다.
 */
export function createModelAdminRoleStore({ now = Date.UTC(2026, 9, 27) } = {}) {
  const rows = new Map();
  const audit = [];
  let tick = 0;
  const stamp = () => new Date(now + (tick += 1)).toISOString();
  const key = (productId, subjectId) => `${productId}\u0000${subjectId}`;

  return {
    rows,
    audit,

    async roleFor({ productId, subjectId }) {
      const row = rows.get(key(productId, subjectId));
      return row ? { ...row } : null;
    },

    async assign({ productId, subjectId, role, grantedBy, reason = null, at }) {
      const previous = rows.get(key(productId, subjectId)) ?? null;
      const row = { productId, subjectId, role, grantedBy: grantedBy ?? null, updatedAt: at ?? stamp() };
      rows.set(key(productId, subjectId), row);
      audit.push({ productId, subjectId, action: 'assign', previousRole: previous?.role ?? null, role, actorSubjectId: grantedBy ?? null, reason, changedAt: row.updatedAt });
      return { ...row };
    },

    async revoke({ productId, subjectId, revokedBy, at }) {
      const previous = rows.get(key(productId, subjectId)) ?? null;
      rows.delete(key(productId, subjectId));
      const changedAt = at ?? stamp();
      audit.push({ productId, subjectId, action: 'revoke', previousRole: previous?.role ?? null, role: null, actorSubjectId: revokedBy ?? null, changedAt });
      return previous ? { subjectId, updatedAt: changedAt } : null;
    },

    async list({ productId }) {
      return [...rows.values()].filter((row) => row.productId === productId).map((row) => ({ ...row }));
    },

    async history({ productId, limit = 20 }) {
      return audit.filter((row) => row.productId === productId).slice(-limit).reverse().map((row) => ({ ...row }));
    }
  };
}
