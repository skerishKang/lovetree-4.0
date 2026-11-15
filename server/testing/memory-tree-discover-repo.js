// 트리 둘러보기 소개 표시 메모리 저장소(2026-11-16 대표 결정 — 기본 꺼짐, 고객이 켠다).
// 스파스 운용 — 켠 트리만 Set에 쌓인다. 행이 없으면 꺼짐이다(PostgreSQL 표와 같은 모양).
export function createMemoryTreeDiscoverRepo() {
  const onKeys = new Set();
  const key = (productId, subjectId, treeId) => [productId, subjectId, treeId].join('\0');
  return {
    async get({ productId, subjectId, treeId }) {
      return { discover: onKeys.has(key(productId, subjectId, treeId)), updatedAt: null };
    },
    async set({ productId, subjectId, treeId, discover }) {
      const k = key(productId, subjectId, treeId);
      if (discover) onKeys.add(k); else onKeys.delete(k);
      return true;
    },
    // 시험·집계용 읽기. 켠 트리만 돌려준다(스파스 운용 그대로).
    async discoveredTrees({ productId }) {
      return [...onKeys].map((k) => k.split('\0')).filter(([p]) => p === productId).map(([, subjectId, treeId]) => ({ subjectId, treeId }));
    },
    // 메모리 커뮤니티 저장소의 둘러보기 필터에 쓰는 동기 판정.
    isOn(productId, subjectId, treeId) { return onKeys.has(key(productId, subjectId, treeId)); }
  };
}
