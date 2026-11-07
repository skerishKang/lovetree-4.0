// The landing artwork is always the original gallery, never a member's document.
// 2026-11-07: 가운데 버튼 3개의 강조·문구만 상태로 정한다(자리·개수는 그대로).
// 셸이 body[data-member]·body[data-tree-count]로 알려 준다. 트리가 0개인 로그인 상태는
// LT41이 비어 있어서 그것만으로는 로그아웃과 구분되지 않기 때문이다.
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
  canResume: context?.source !== 'example' && !!context?.tree?.moments?.some(m => m.id === context.momentId),
  centerState: {member, treeCount}
 };
}
