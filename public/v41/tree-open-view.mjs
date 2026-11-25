// 트리를 열 때 쓸 화면 이름은 내 기록 주소의 이름과 같다. 지도의 저장값은 network다.
export const DEFAULT_TREE_OPEN_VIEW = 'tree';
export const TREE_OPEN_VIEWS = Object.freeze([DEFAULT_TREE_OPEN_VIEW, 'board', 'book', 'network']);

export function normalizeTreeOpenView(value) {
  return TREE_OPEN_VIEWS.includes(value) ? value : DEFAULT_TREE_OPEN_VIEW;
}
