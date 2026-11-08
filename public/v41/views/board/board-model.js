// 기억 보드의 순수 계산 한 벌. 화면(board.js)이 실제로 이 함수들을 부른다.
// 일반 스크립트로 불러오고(node 시험은 import), window.LT58Model 하나로 노출한다.
window.LT58Model = (() => {
  // 사용자 글자를 HTML에 넣기 전에 이스케이프한다.
  function escapeHTML(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // 카드 자리: 8장씩 줄을 바꾸고, 세로는 400px 간격, 회전은 -2·0·2도.
  function cardPosition(i) {
    return { x: 150 + (i % 8) * 280, y: 150 + Math.floor(i / 8) * 400, rot: (i % 3 - 1) * 2 };
  }

  // 실(연결선) 베지에: 두 핀 사이를 아래로 늘어뜨린다. dx가 클수록 처짐이 커지되 140px까지.
  function threadPath(a, b) {
    const dx = b.x - a.x;
    const sag = Math.min(140, 55 + Math.abs(dx) * 0.08);
    const cy = Math.max(a.y, b.y) + sag;
    return { sag, cy, d: `M ${a.x} ${a.y} C ${a.x + dx * 0.32} ${cy}, ${a.x + dx * 0.68} ${cy}, ${b.x} ${b.y}` };
  }

  // 전체 맞춤 배율: 무대 여백 40px, 최대 0.92배.
  function fitZoom(vw, vh) {
    return Math.min((vw - 40) / 2400, (vh - 40) / 2200, 0.92);
  }

  // 연결 지우기: 목록에서 id 하나만 뺀 새 배열을 준다(원본은 건드리지 않는다).
  function removeConnection(list, id) {
    return list.filter((c) => c.id !== id);
  }

  // 지우기 허용 판단: 실제 기록(읽기 전용)이면 안내 문구를 함께 준다.
  function editGuard(canEdit) {
    return canEdit ? { blocked: false, message: '' } : { blocked: true, message: '읽기 전용에서는 연결을 변경할 수 없어요.' };
  }

  return { escapeHTML, cardPosition, threadPath, fitZoom, removeConnection, editGuard };
})();
