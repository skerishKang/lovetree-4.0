export function createMemoryShareSyncPendingRepo() {
  const rows = new Map();
  const key = (productId, subjectId) => `${productId}\0${subjectId}`;
  return {
    async mark({ productId, subjectId }) {
      rows.set(key(productId, subjectId), { productId, subjectId, markedAt: new Date().toISOString() });
      return true;
    },
    async clear({ productId, subjectId }) { return rows.delete(key(productId, subjectId)); },
    async has({ productId, subjectId }) { return rows.has(key(productId, subjectId)); },
    async list({ productId }) {
      return [...rows.values()].filter((row) => row.productId === productId).map((row) => ({ ...row }));
    }
  };
}
