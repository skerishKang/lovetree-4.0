// 트리 공개 상태 메모리 저장소 (#538 공개가 기본). 스파스 운용 — 비공개만 Set 에 쌓인다.
export function createMemoryTreeVisibilityRepo() {
  const privateKeys = new Set();
  const key = (productId, subjectId, treeId) => [productId, subjectId, treeId].join('\0');
  return {
    async get({ productId, subjectId, treeId }) {
      return privateKeys.has(key(productId, subjectId, treeId)) ? { visibility: 'private', updatedAt: null } : { visibility: 'public', updatedAt: null };
    },
    async set({ productId, subjectId, treeId, visibility }) {
      const k = key(productId, subjectId, treeId);
      if (visibility === 'private') privateKeys.add(k); else privateKeys.delete(k);
      return visibility;
    },
    // 메모리 커뮤니티 저장소의 둘러보기 필터에 쓰는 동기 판정.
    isPrivate(productId, subjectId, treeId) { return privateKeys.has(key(productId, subjectId, treeId)); }
  };
}
