// 운영센터 고객 정보(261116) — 시험용 메모리 저장소. createAdminCustomersRepo와 같은 계약만 구현한다.
// 읽기만 한다는 계약도 함께 지킨다 — 고객 기록을 고치거나 지우는 함수는 두지 않고, 열람 기록 추가만 둔다.

export function createMemoryAdminCustomersRepo({ accounts = [] } = {}) {
  const views = [];
  let nextViewId = 1;
  const rows = accounts.map((account) => ({ ...account }));

  return {
    rows,
    views,
    async list({ productId }) {
      return rows
        .filter((row) => row.productId === productId)
        .slice()
        .sort((a, b) => String(b.lastActivityAt ?? '').localeCompare(String(a.lastActivityAt ?? ''))
          || String(b.joinedAt ?? '').localeCompare(String(a.joinedAt ?? ''))
          || String(a.subjectId).localeCompare(String(b.subjectId)))
        .map((row) => ({ ...row }));
    },
    async detail({ productId, subjectId }) {
      const row = rows.find((item) => item.productId === productId && item.subjectId === subjectId);
      if (!row) return null;
      return { ...row, markers: (row.markers ?? []).map((marker) => ({ ...marker })) };
    },
    async recordView({ productId, customerSubjectId, adminSubjectId }) {
      views.push({ id: nextViewId++, productId, customerSubjectId, adminSubjectId, viewedAt: '2026-11-16T09:00:00.000Z' });
    },
    async recentViews({ productId, limit = 20 }) {
      return views
        .filter((row) => row.productId === productId)
        .slice()
        .reverse()
        .slice(0, Math.max(1, Math.min(100, Number(limit) || 20)))
        .map((row) => {
          const account = rows.find((item) => item.subjectId === row.customerSubjectId);
          return { ...row, email: account?.email ?? '', displayName: account?.displayName ?? '' };
        });
    }
  };
}
