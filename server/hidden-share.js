// 운영이 숨긴 공유 판정 — 둘러보기·무대와 공유 직접 읽기가 같은 기준을 쓰게 한다(#1544).
// 숨김은 공유 행 하나가 아니라 (제품, 주인, 트리) 묶음으로 본다.
// 어느 행이 숨겨져도 그 트리의 모든 공유 주소가 숨김이다.
export async function isHiddenShare(communityRepo, { productId, shareId, subjectId, treeId }) {
  if (!communityRepo || typeof communityRepo.isHiddenShare !== 'function') return false;
  return await communityRepo.isHiddenShare({ productId, shareId, subjectId, treeId }) === true;
}
