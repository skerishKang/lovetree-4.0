// #380 4 2차: 공통 틀(dialogs.mjs)의 더러움 판정 중 화면과 무관한 계산만 모아 둔다.
// 순간 잇기(connection-panel)는 연결을 만들지 않고 보여 주는 패널이다. 그래서 "고른 연결이 저장 전"은
// 패널을 열 때(또는 마지막으로 그릴 때) 보여 준 연결이 지금 트리의 저장본과 다른지로 본다.
// 같으면 더러움 없음(확인 없이 닫힘), 다르면 아직 저장되지 않은 고른 연결이 있으므로 한 번 묻는다.
export function connectionSignature(tree, momentId) {
  if (!tree || typeof tree !== 'object') return '';
  const edges = Array.isArray(tree.edges) ? tree.edges : [];
  const shown = edges
    .filter(edge => edge && (edge.from === momentId || edge.to === momentId))
    .map(edge => [edge.from, edge.to, edge.kind || '', edge.reason || ''].join('>'))
    .sort();
  return [tree.id || '', momentId || '', shown.join('|')].join('#');
}
