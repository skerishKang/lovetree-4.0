// #540 고객 의견 — 시험용 메모리 저장소. createFeedbackRepo와 같은 계약만 구현한다.
export function createMemoryFeedbackRepo() {
  const rows = [];
  let nextId = 1;
  const clone = row => ({...row, context: {...(row.context || {})}});
  return {
    rows,
    async create({productId, subjectId = null, category, body, context = {}}) {
      const row = {
        id: nextId++,
        productId,
        subjectId,
        category,
        body,
        context: {...context},
        status: 'received',
        memo: null,
        issueNumber: null,
        createdAt: '2026-11-14T00:00:00.000Z',
        updatedAt: '2026-11-14T00:00:00.000Z'
      };
      rows.push(row);
      return clone(row);
    },
    async list({productId, status = '', category = '', limit = 100}) {
      return rows
        .filter(row => row.productId === productId)
        .filter(row => !status || row.status === status)
        .filter(row => !category || row.category === category)
        .sort((a, b) => b.id - a.id)
        .slice(0, Math.max(1, Math.min(200, Number(limit) || 100)))
        .map(clone);
    },
    async get({productId, id}) {
      const row = rows.find(item => item.productId === productId && item.id === Number(id));
      return row ? clone(row) : null;
    },
    async update({productId, id, status, memo, issueNumber}) {
      const row = rows.find(item => item.productId === productId && item.id === Number(id));
      if (!row) return null;
      if (status !== undefined && status !== null) row.status = status;
      if (memo !== undefined && memo !== null) row.memo = memo;
      if (issueNumber !== undefined && issueNumber !== null) row.issueNumber = issueNumber;
      row.updatedAt = '2026-11-14T00:01:00.000Z';
      return clone(row);
    }
  };
}