/**
 * 화면 공통 문맥과 행동 계약.
 *
 * 화면은 데이터(`trees`·`tree` 등)와 함께 아래 둘을 같은 모양으로 받는다.
 *
 *   context = { treeId, momentId, readOnly }
 *   actions = {
 *     navigate(where)                         // 'home' | 'trees'
 *     openBook(treeId, momentId, readOnly)    // 기억책으로
 *     openWorkspace(treeId, momentId, readOnly)   // 트리 연결 보기로 (읽기 전용이면 demo)
 *     requestMoment(kind, id)                 // 'new' | 'add' | 'edit'
 *     selectMoment(momentId)                  // 기억책이 읽던 페이지를 앱 선택으로 보고
 *     library(action, id)                     // 백업·가져오기·복구·삭제 같은 화면 밖 동작
 *   }
 *
 * 주소·저장소·팝업의 최종 처리는 `main.js`가 맡는다. 화면은 이 콜백으로만 바깥에 알린다.
 */
export function viewContext({ treeId = null, momentId = null, readOnly = false } = {}) {
  const id = value => (typeof value === 'string' && value ? value : null);
  return Object.freeze({ treeId: id(treeId), momentId: id(momentId), readOnly: Boolean(readOnly) });
}
