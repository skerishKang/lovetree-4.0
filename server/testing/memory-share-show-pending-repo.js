export function createMemoryShareShowPendingRepo() {
  const marks = new Set();
  const key = (productId, subjectId) => productId + '\0' + subjectId;
  return {
    async mark({ productId, subjectId }) { marks.add(key(productId, subjectId)); },
    async clear({ productId, subjectId }) { marks.delete(key(productId, subjectId)); },
    async has({ productId, subjectId }) { return marks.has(key(productId, subjectId)); }
  };
}
