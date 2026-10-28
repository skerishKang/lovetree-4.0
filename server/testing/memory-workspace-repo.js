/**
 * PostgreSQL CAS·클레임 계약을 그대로 닮은 메모리 모형. 테스트 전용이다.
 * 실제 DB의 동시 잠금이 아니라 함수 본문이 끝나기 전까지 다른 호출이 끼어들 수 없는
 * 단일 스레드 직렬화로 원자성을 모형화하므로, 이 모형 통과 = PostgreSQL 검증 완료가 아니다.
 */
export function createMemoryWorkspaceRepo({ now = Date.UTC(2026, 9, 27) } = {}) {
  const docs = new Map();
  const claims = new Map();
  let tick = 0;
  const stamp = () => new Date(now + (tick += 1)).toISOString();
  const docKey = (productId, subjectId) => `${productId}\u0000${subjectId}`;

  return {
    async load({ productId, subjectId }) {
      const row = docs.get(docKey(productId, subjectId));
      return row ? { revision: row.revision, savedAt: row.savedAt, doc: structuredClone(row.doc) } : null;
    },

    async commit({ productId, subjectId, doc, expectedRevision, clientKey, requestHash }) {
      const key = `${docKey(productId, subjectId)}\u0000${clientKey}`;
      const existing = claims.get(key);
      if (existing) {
        if (existing.requestHash !== requestHash) return { status: 'keyConflict' };
        return { status: 'replayed', revision: existing.revision, savedAt: existing.savedAt };
      }
      const current = docs.get(docKey(productId, subjectId));
      const currentRevision = current ? current.revision : 0;
      if (currentRevision !== expectedRevision) return { status: 'revisionConflict', currentRevision };
      const savedAt = stamp();
      const row = { revision: expectedRevision + 1, savedAt, doc: structuredClone(doc) };
      docs.set(docKey(productId, subjectId), row);
      claims.set(key, { requestHash, revision: row.revision, savedAt });
      return { status: 'saved', revision: row.revision, savedAt };
    }
  };
}
