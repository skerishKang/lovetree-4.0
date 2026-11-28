// 셸과 화면 사이에 보내는 type과 본문 필드. ?는 요청이나 응답에 따라 생략할 수 있는 필드다.
// 일반 스크립트 화면과 모듈이 같은 문서에 들어와도 두 표의 객체는 하나만 만든다.
(() => {
  function fromShell(name, payload) {
    return Object.freeze({ name, from: '셸', to: '화면', payload });
  }

  function fromView(name, payload) {
    return Object.freeze({ name, from: '화면', to: '셸', payload });
  }

  const messages = Object.freeze({
    selection: fromView('lt-selection', 'id, boardState? (noHistory: 기록 없이 현재 순간만 갱신)'),
    account: fromView('lt41-account', '없음'),
    advanced: fromShell('lt41-advanced', 'value'),
    boardSaved: fromShell('lt41-board-saved', 'ok, error?'),
    boardDetail: fromShell('lt41-board-detail', 'open'),
    boardPanel: fromView('lt41-board-panel', 'state'),
    treeDetail: fromView('lt41-tree-detail', 'open'),
    boardRestore: fromShell('lt41-board-restore', 'momentId, detailOpen, view?, scroll?, panel?, cinemaIndex?'),
    boardSync: fromView('lt41-board-sync', 'treeId, moments'),
    // 셸은 옛 화면에서 같은 이름으로 보낸 판 선택도 받는다.
    boardTheme: Object.freeze({ name: 'lt41-board-theme', from: '셸·화면', to: '화면·셸', payload: 'value' }),
    boardThemeChoice: fromView('lt41-board-theme-choice', 'value'),
    // 옛 화면에서 선택을 알릴 때 받던 이름이다.
    choose: fromView('lt41-choose', '없음'),
    cleanup: fromView('lt41-cleanup', '없음'),
    community: fromView('lt41-community', 'tab? (trees|moments)'),
    dateStyle: fromShell('lt41-date-style', 'value'),
    deleteMoment: fromView('lt41-delete-moment', 'treeId?, momentId'),
    // #1495: 둘러보기에 소개된 내 트리 목록(소개된 트리 id → true). 서재 카드 표시가 읽는다.
    discoverState: fromShell('lt41-discover-state', 'trees'),
    example: fromView('lt41-example', 'view, momentId'),
    homeCards: fromShell('lt41-home-cards', 'mode'),
    homeMoment: fromView('lt41-home-moment', 'value'),
    homeMomentSet: fromShell('lt41-home-moment-set', 'value'),
    journeyClose: fromView('lt41-journey-close', '없음'),
    journeyGoto: fromShell('lt41-journey-goto', 'step'),
    journeyOpenBook: fromView('lt41-journey-open-book', 'treeId, firstMomentId'),
    // 성공하면 트리와 순간 식별값 및 연결 여부, 실패하면 안내 글을 보낸다.
    journeyResult: fromShell('lt41-journey-result', 'ok, treeId?, firstMomentId?, momentId?, connected?, message?'),
    journeySave: fromView('lt41-journey-save', 'draft'),
    journeyStep: fromView('lt41-journey-step', 'step'),
    manageTree: fromView('lt41-manage-tree', 'treeId'),
    mediaMetadata: fromView('lt41-media-metadata', 'momentId, url, mediaMetadata'),
    momentsOpened: fromView('lt41-moments-opened', '없음'),
    momentsSaved: fromShell('lt41-moments-saved', 'treeId, momentId'),
    motion: fromShell('lt41-motion', 'paused'),
    move: fromView('lt41-move', 'momentId'),
    // pairs의 항목에는 id와 출발·도착 트리 식별값을 담는다.
    moveMoments: fromView('lt41-move-moments', 'momentIds, pairs, fromTreeId, toTreeId, targetLabel, noticeText, keepTreeId?'),
    navigate: fromView('lt41-navigate', 'view, filter? (all|public)'),
    networkView: fromShell('lt41-network-view', 'value'),
    newTree: fromView('lt41-new-tree', '없음'),
    openBook: fromView('lt41-open-book', 'treeId, id'),
    openGuide: fromShell('lt41-open-guide', '없음'),
    openNetwork: fromView('lt41-open-network', 'momentId, treeId?'),
    // #1495: 서재 카드의 '둘러보기에 보임' — 그 트리 공유 판을 연다.
    openShare: fromView('lt41-open-share', 'treeId'),
    openTags: fromView('lt41-open-tags', 'suggest'),
    openTree: fromView('lt41-open-tree', 'treeId, id?'),
    openView: fromView('lt41-open-view', 'treeId, view'),
    toolbarTreePicker: fromView('lt41-toolbar-tree-picker', 'rect, via'),
    toolbarTreePickerState: fromShell('lt41-toolbar-tree-picker-state', 'open, focus'),
    pageTurn: fromShell('lt41-page-turn', 'value'),
    // patch.treeChipOrder는 새 순서대로 정렬한 트리 식별값 배열이다.
    prefs: fromView('lt41-prefs', 'patch'),
    report: fromView('lt41-report', 'message, where, at'),
    select: fromView('lt41-select', 'id'),
    share: fromView('lt41-share', 'treeId, id'),
    setShelfView: fromView('lt41-set-shelf-view', 'value'),
    setShelfOpenMode: fromView('lt41-set-shelf-open-mode', 'value'),
    shelfFilter: fromShell('lt41-shelf-filter', 'value'),
    shelfSelectTree: fromShell('lt41-shelf-select-tree', 'treeId'),
    shelfTree: fromView('lt41-shelf-tree', 'treeId'),
    shelfView: fromShell('lt41-shelf-view', 'value'),
    shelfOpenMode: fromShell('lt41-shelf-open-mode', 'value'),
    start: fromView('lt41-start', '없음'),
    storySave: fromView('lt41-story-save', 'treeId, fromMomentId, momentId, relation'),
    // 성공일 때도 error를 빈 문자열로 함께 보낸다.
    storySaved: fromShell('lt41-story-saved', 'ok, treeId, fromMomentId, momentId, relation, error'),
    tags: fromView('lt41-tags', 'treeId, momentId, keywords'),
    tagsSaved: fromShell('lt41-tags-saved', 'ok, momentId, keywords, error?'),
    // 옛 화면의 테마 변경 알림은 기존 기기 설정을 다시 읽는 계기가 된다.
    theme: fromView('lt41-theme', '없음'),
    titleDisplay: fromShell('lt41-title-display', 'value'),
    treesRenamed: fromShell('lt41-trees-renamed', 'titles'),
    treesSaved: fromShell('lt41-trees-saved', 'background?, treeId?, momentId?'),
    viewer: fromView('lt41-viewer', 'open'),
    write: fromView('lt41-write', 'mode, treeId?, momentId?, parentId?, focusTitle?'),
  });

  // 화면이 받는 셸→화면 메시지인지 보는 공통 확인 (#1161).
  // 받은 메시지가 표에 있는 이름이고 방향이 셸→화면이며, 같은 출처이고 부모 창에서 온 경우에만 참이다.
  function isShellMessage(event) {
    const type = event?.data?.type;
    if (typeof type !== 'string') return false;
    const entry = Object.values(messages).find(item => item.name === type);
    if (!entry || !entry.from.includes('셸') || !entry.to.includes('화면')) return false;
    if (event.origin !== globalThis.location?.origin) return false;
    if (event.source !== globalThis.window?.parent) return false;
    return true;
  }

  if (globalThis.LT41_FRAME_MESSAGES && globalThis.LT41_MSG && globalThis.LT41_isShellMessage) return;

  globalThis.LT41_FRAME_MESSAGES = messages;
  globalThis.LT41_MSG = Object.freeze(Object.fromEntries(
    Object.entries(messages).map(([key, entry]) => [key, entry.name])
  ));
  globalThis.LT41_isShellMessage = isShellMessage;
})();
