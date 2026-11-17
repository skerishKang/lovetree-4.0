// The landing artwork is always the original gallery, never a member's document.
// 2026-11-07: 가운데 버튼 3개의 강조·문구만 상태로 정한다(자리·개수는 그대로).
// 셸이 body[data-member]·body[data-tree-count]로 알려 준다. 트리가 0개인 로그인 상태는
// LT41이 비어 있어서 그것만으로는 로그아웃과 구분되지 않기 때문이다.
// 261116 PR 2: 로그인 후 둘째 줄 안내('정리 안 된 순간 N개'·'첫 순간을 남기면…')는 치웠다 —
// 그 자리에 '+ 순간 추가' 단추가 온다(대표 확정). homeSecondLine은 같이 거뒀다.

export function homePresentation(context) {
 const member = context?.member === 'in' || context?.member === 'out'
  ? context.member
  : (context?.source === 'server' ? 'in' : 'out');
 const declared = Number(context?.treeCount);
 const treeCount = member === 'in'
  ? Math.max(0, Number.isFinite(declared) ? declared : (Array.isArray(context?.trees) ? context.trees.length : 0))
  : 0;
 return {
  trees: [],
  context: {treeId: null, momentId: null, readOnly: true},
  accountLabel: member === 'in' ? '내 계정' : '로그인',
  centerState: {member, treeCount}
 };
}
