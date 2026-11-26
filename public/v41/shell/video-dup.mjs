// #876: 같은 영상을 다시 담을 때 — 막지 말고 담기 전에 한 번 알려 주는 창(대표 결정 2026-11-18).
// 러브트리의 순간은 영상이 아니라 '그 장면과 마음'이라 같은 영상을 다시 담을 정당한 경우가 있다
// (다른 구간·다른 트리·다른 시점의 마음). 판정 자체는 ../quick-intake.mjs의 순수 규칙이 맡고,
// 이 파일은 창만 만진다(docs/TESTING.md).
//
// 창 규칙(#845 규칙표): 잠깐 판 — 열려 있는 창(순간 추가) 위에 겹쳐 열리고(#845 3단계 STACK_ALLOWED),
// ×·Esc·뒤로가기로 닫으면 아무것도 담지 않고 창만 닫힌다(적어 둔 값은 순간 추가 창에 그대로 남는다).
// [그래도 넣기]는 원래 하려던 담기를 그대로 하고, [건너뛰기]는 담지 않고 닫고, [그 순간 보기]는 이미 담은
// 순간을 편집기로 연다('지금 다듬기'와 같은 길 — 닫기·이동·초점 규칙을 그대로 쓴다).
// #1439: 순간 정리의 옮기기·복사하기도 이 창으로 묻는다(문구 "이 트리에 같은 영상이 이미 있어요 · 그래도 넣기 / 건너뛰기").
// 정리에서는 [그 순간 보기]를 숨기고, ×·Esc·뒤로가기로 닫으면 onCancel(이번 작업 그만)을 알린다.
export function createVideoDup(deps) {
  const $ = deps.$;
  const doc = deps.document || globalThis.document;
  const dialog = $('video-dup-panel');
  // 창을 열어 둔 동안의 담기 동작 — [그래도 담기]가 부른다. 닫기(×·Esc·뒤로가기)로 창이 닫히면
  // 'close'에서 버리고 다음 담기 때 새로 물어본다(한 번 알려 주기의 '한 번'은 담기마다 다시 산다).
  let pending = null;

  function finish() {
    const action = pending;
    pending = null;
    return action || null;
  }

  $('video-dup-continue').onclick = () => {
    const action = finish();
    dialog.close();
    action?.onContinue?.();
  };
  $('video-dup-skip').onclick = () => {
    const action = finish();
    dialog.close();
    action?.onSkip?.();
  };
  $('video-dup-view').onclick = () => {
    const action = finish();
    const { treeId = '', momentId = '' } = action || {};
    dialog.close();
    if (!treeId || !momentId) return;
    // 순간 추가 창은 공통 닫기 규칙으로 닫는다 — 적어 둔 값이 있으면 기존 규칙대로 한 번 묻는다.
    deps.requestClose?.('write-panel');
    deps.choose?.(treeId, momentId);
    deps.openEditor?.('edit');
  };
  // ×·Esc·뒤로가기·바깥 누르기로 닫히면 아무것도 담지 않는다 — pending을 버리고, 물은 쪽에 그만둠을 알린다.
  dialog.addEventListener('close', () => { const action = finish(); action?.onCancel?.(); });

  // info: { treeName, dateText, onContinue, onSkip?, onCancel?, eyebrow?, noun?, detail?, showView? }
  // 제목은 #1439 문구 "이 트리에 같은 영상이 이미 있어요"(영상·사진·순간), 아래 줄은 어느 트리·언제 담았는지.
  function open(info = {}) {
    if (pending) { const previous = finish(); previous?.onCancel?.(); }
    pending = info;
    const noun = info.noun || '영상';
    const eyebrow = $('video-dup-eyebrow');
    if (eyebrow) eyebrow.textContent = info.eyebrow || '순간 추가';
    $('video-dup-title').textContent = `이 트리에 같은 ${noun}이 이미 있어요`;
    const date = info.dateText ? ` (${info.dateText})` : '';
    const where = info.treeName ? `'${info.treeName}' 트리에 ` : '이 트리에 ';
    $('video-dup-text').textContent = info.detail || `${where}이미 담은 ${noun}이에요${date}. 그래도 넣을까요?`;
    $('video-dup-view').hidden = info.showView === false || !info.treeId || !info.momentId;
    dialog.showModal();
    deps.onModalShown?.();
  }

  return { open, isOpen: () => !!dialog.open };
}
