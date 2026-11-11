// The landing artwork is always the original gallery, never a member's document.
// 2026-11-07: 가운데 버튼 3개의 강조·문구만 상태로 정한다(자리·개수는 그대로).
// 셸이 body[data-member]·body[data-tree-count]로 알려 준다. 트리가 0개인 로그인 상태는
// LT41이 비어 있어서 그것만으로는 로그아웃과 구분되지 않기 때문이다.
// 로그인 후 둘째 줄 상태 문구 (2026-11-11 #380). 로그인 전이면 null — 현재 문구를 그대로 둔다.
// 정리할 것이 있으면 몇 개인지 알리고(입구는 트리 ▾ 드롭다운 한 곳, #380 5번), 없으면 마지막 순간,
// 순간이 없으면 첫 순간 안내. 첫 화면에는 정리 창을 여는 입구를 두지 않는다.
export function homeSecondLine({member, unorganizedCount = null, last = null, hasMoment = false} = {}) {
  if (member !== 'in') return null;
  if (typeof unorganizedCount === 'number' && unorganizedCount > 0) {
    return {text:`정리 안 된 순간 ${unorganizedCount}개`, action:'none'};
  }
  if (!hasMoment && !last) return {text:'첫 순간을 남기면 여기서 이어 볼 수 있어요', action:'none'};
  if (last && last.title) {
    return last.days === null || last.days === undefined
      ? {text:`마지막 순간 「${last.title}」`, action:'none'}
      : {text:`마지막 순간 「${last.title}」 · ${last.days}일 전`, action:'none'};
  }
  return last && last.days !== null && last.days !== undefined
    ? {text:`마지막 순간 · ${last.days}일 전`, action:'none'}
    : {text:'마지막 순간', action:'none'};
}

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
