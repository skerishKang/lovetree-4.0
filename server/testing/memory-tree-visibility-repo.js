// 트리 공개 상태 메모리 저장소 (#538 공개가 기본). 스파스 운용 — 비공개만 Set 에 쌓인다.
export function createMemoryTreeVisibilityRepo() {
  const privateKeys = new Set();
  const key = (productId, subjectId, treeId) => [productId, subjectId, treeId].join('\0');
  return {
    async get({ productId, subjectId, treeId }) {
      return privateKeys.has(key(productId, subjectId, treeId)) ? { visibility: 'private', updatedAt: null } : { visibility: 'public', updatedAt: null };
    },
    async privateTreeIds({ productId, subjectId, treeIds }) {
      return new Set(treeIds.filter(treeId => privateKeys.has(key(productId, subjectId, treeId))));
    },
    async set({ productId, subjectId, treeId, visibility }) {
      const k = key(productId, subjectId, treeId);
      if (visibility === 'private') privateKeys.add(k); else privateKeys.delete(k);
      return visibility;
    },
    // 시험·집계용 읽기(#655 2차). 비공개 표시가 있는 트리만 돌려준다(스파스 운용 그대로).
    async privateTrees({ productId }) {
      return [...privateKeys].map((k) => k.split('\0')).filter(([p]) => p === productId).map(([, subjectId, treeId]) => ({ subjectId, treeId }));
    },
    // 메모리 커뮤니티 저장소의 둘러보기 필터에 쓰는 동기 판정.
    isPrivate(productId, subjectId, treeId) { return privateKeys.has(key(productId, subjectId, treeId)); }
  };
}
