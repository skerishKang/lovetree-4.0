// 셸의 공유 패널·둘러보기 연결·lt41-* 메시지 수신 (#231 1-B③-3).
// 2026-11-08 리팩터링: 동작·문구·주소 형식 변경 0. shell.mjs에서 조건·조회 방식·인자 형태를 바꾸지 않고 그대로 옮겼다.
import {mountCommunity} from '../community-panel.mjs';
import {displayTreeTitle} from '../tree-name.mjs';
// #480 L13: 날짜는 책·보드·지도·첫 화면과 같은 한 벌(formatDisplayDate)로만 적는다.
import {formatDisplayDate} from '../book-usability.mjs';

export function createMessages(deps) {
  const {$} = deps;
  const getCurrent = deps.getCurrent;
  const setCurrent = deps.setCurrent;
  const getModel = deps.getModel;
  const getSource = deps.getSource;
  const getMember = deps.getMember;
  // #480 L13: 계정 설정의 날짜 표기. 셸이 넘겨 주지 않으면 기본(dot)으로 적는다 — 새로 만드는 규칙 아님.
  const getDateStyle = deps.getDateStyle || (() => 'dot');
  const shareApi = deps.shareApi;
  const notify = deps.notify;
  const panel = deps.panel;
  // #368: 읽기 전용·로그아웃 안내의 행선지 — 설정 "내 데이터" 묶음(로그아웃이면 로그인).
  const openSettingsData = deps.openSettingsData || (() => {});
  const show = deps.show;
  const links = deps.links;
  const writeLocation = deps.writeLocation;
  const choose = deps.choose;
  const openEditor = deps.openEditor;
  const focusTitleInput = deps.focusTitleInput;
  const openLoginStart = deps.openLoginStart;
  const openAccountMenu = deps.openAccountMenu;
  const openCleanup = deps.openCleanup;
  const sample = deps.sample;
  const applyTheme = deps.applyTheme;
  const paintThemeControls = deps.paintThemeControls;
  const viewForFile = deps.viewForFile;
  const exampleTree = deps.exampleTree;
  const journey = deps.journey;
  // #368 3차: 공유 창 시작값(처음 열 보기)은 계정 설정에서 온다. #538: 둘러보기 올림 기본 설정은 공개 기본으로 정리됐다.
  const getShareDefaults = deps.getShareDefaults || (() => ({view: 'book'}));

  let sharePreviewKey = '';
  let sharePreviewToken = '';

  // 화면(iframe)이 보내는 lt41-* 메시지는 이 한 곳에서만 받는다. 처리 순서·조건은 shell.mjs 그대로다.
  // 화면 교대 중에는 보드가 #view-next에 있을 수 있어 두 iframe 모두에서 받는다.
  addEventListener('message', event => {
    const data = event.data;
    const fromView = event.source === $('view')?.contentWindow || event.source === $('view-next')?.contentWindow;
    if (event.origin !== location.origin || !fromView) return;
    // 4.1 기억 보드 저장: 화면이 만든 순간·연결·배치를 기존 워크스페이스 저장 경로로 보낸다.
    if (data?.type === 'lt41-board-sync') {
      const reply = (ok, error) => { try { event.source?.postMessage({type:'lt41-board-saved', ok, error}, location.origin); } catch {} };
      if (getSource() !== 'server' || !getMember()?.snapshot().writable) { reply(false, '서버 편집 연결이 없어 저장하지 않았어요.'); return; }
      try { getMember().apply('boardSync', {moments: data.moments}, {treeId: data.treeId}); reply(true); }
      catch (error) { reply(false, error?.message || '저장하지 못했어요.'); }
      return;
    }
    if (data?.type === 'lt41-theme') { applyTheme(); paintThemeControls(); }
    if (data?.type === 'lt41-journey-step') { journey.noteJourneyStep(data.step); return; }
    if (data?.type === 'lt41-journey-save') { if (getSource() === 'share') return; journey.saveFirstJourney(data.draft); return; }
    if (data?.type === 'lt41-journey-open-book') { journey.openJourneyBook(data); return; }
    if (data?.type === 'lt41-journey-close') { journey.closeFirstJourney(); return; }
    if (data?.type === 'lt41-media-metadata' && getSource() === 'server' && getMember()?.snapshot().owned) {
      const tree = window.LT41?.tree, moment = tree?.moments.find(m => m.id === data.momentId && m.url === data.url);
      if (moment) try {
        getMember().apply('cacheMediaMetadata', {url: data.url, mediaMetadata: data.mediaMetadata}, {treeId: tree.id, momentId: moment.id});
      } catch {}
    }
    if (data?.type === 'lt41-navigate') {
      if (data.view === 'track32-bookshelf.html' && !getMember()?.snapshot().owned) { openLoginStart('shelf'); return; }
      show(data.view);
    }
    if (data?.type === 'lt41-select' && window.LT41?.tree.moments.some(m => m.id === data.id)) {
      window.LT41.momentId = data.id; links(); writeLocation();
    }
    // #315: 공유 감상(share)은 읽기 전용이다. 안쪽 화면의 버튼 정리를 통과한 쓰기 메시지가 남아도 여기서 막는다(이중).
    if (data?.type === 'lt41-write' && getSource() === 'share') return;
    if (data?.type === 'lt41-write' && data.mode === 'edit' && data.momentId) {
      const targetTree = data.treeId
        ? getModel()?.trees.find(t => t.id === data.treeId && t.moments.some(m => m.id === data.momentId))
        : (window.LT41?.tree?.moments.some(m => m.id === data.momentId) ? window.LT41.tree : getModel()?.trees.find(t => t.moments.some(m => m.id === data.momentId)));
      if (targetTree) {
        if (window.LT41?.tree?.id !== targetTree.id) choose(targetTree.id, data.momentId);
        else { window.LT41.momentId = data.momentId; links(); writeLocation(); }
      }
    }
    if (data?.type === 'lt41-write') openEditor(data.mode, data.parentId);
    if (data?.type === 'lt41-write' && data.focusTitle) focusTitleInput?.();
    // #327 2부: 순간 상세의 '다른 트리로 옮기기'. 공유·예시 화면에서는 보내지 않고, 여기서도 한 번 더 막는다.
    if (data?.type === 'lt41-move' && getSource() === 'server') openCleanup({ momentId: data.momentId });
    if (data?.type === 'lt41-open-book' && getModel()?.trees.some(t => t.id === data.treeId && t.moments.some(m => m.id === data.id))) {
      setCurrent('track59-sketchbook.html'); choose(data.treeId, data.id); writeLocation();
    }
    // #417: 보드·지도 화면의 트리 ▾ — 다른 트리를 같은 보기로 열 때 쓴다. 책(lt41-open-book)과 같은 규칙이고,
    // 보기는 board·network만 허용하며(그 밖은 무시), 없는 트리도 무시한다.
    if (data?.type === 'lt41-open-view' && ['board', 'network'].includes(data.view) && getModel()?.trees.some(t => t.id === data.treeId)) {
      setCurrent(data.view === 'board' ? 'track58-pinboard.html' : 'track56-network.html'); choose(data.treeId); writeLocation();
    }
    // #394: 첫 화면이 순간 목록을 열었다(시작 트리 전달 완료) — 요청 플래그를 치워 다음 화면 이동에 되풀이하지 않게 한다.
    if (data?.type === 'lt41-moments-opened') delete window.LT41_MOMENTS_OPEN;
    if (data?.type === 'lt41-start') { openLoginStart('first'); return; }
    if (data?.type === 'lt41-account') {
      if (getMember()?.snapshot().owned) openAccountMenu(); else $('account-entry').click();
    }
    if (data?.type === 'lt41-community') $('community-menu').click();
    if (data?.type === 'lt41-example' && exampleTree.moments.some(m => m.id === data.momentId) && ['track59-sketchbook.html', 'track58-pinboard.html'].includes(data.view)) {
      sample({treeId: exampleTree.id, momentId: data.momentId}, data.view);
    }
    if (data?.type === 'lt-selection' || data?.type === 'lt41-choose') { links(); writeLocation(); }
  });

  function sharePayload() {
    return {treeId: window.LT41?.tree.id || '', entryMomentId: $('share-moment').value, view: $('share-view').value};
  }
  function shareFailure(answer) {
    return answer.status === 401 ? '로그인이 필요해요.' : answer.code === 'timeout' ? '서버 응답 시간이 초과됐어요.' : answer.message || '공유 요청을 처리하지 못했어요.';
  }
  // #369: 단계를 눈에 보이게 — ① 보여 줄 것 고르기 ② 미리보기 ③ 링크 만들기.
  // 지금 단계와 다음에 할 일을 #share-steps·#share-next에 그린다.
  const SHARE_STAGES = {
    choose: {current: 1, next: '보여 줄 순간과 처음 열 보기를 고른 뒤, 공개 내용을 미리 봐 주세요.'},
    ready: {current: 3, next: '미리보기를 확인했어요. 이 내용으로 링크를 만들어 주세요.'},
    done: {current: 0, next: '링크를 복사하거나 열어 보세요. 새 링크는 다시 미리 본 뒤 만들 수 있어요.'}
  };
  function paintShareSteps(stage) {
    const stageInfo = SHARE_STAGES[stage] || SHARE_STAGES.choose;
    for (const li of $('share-steps').children) {
      const step = Number(li.dataset.step);
      li.dataset.state = stageInfo.current === 0 || step < stageInfo.current ? 'done' : step === stageInfo.current ? 'current' : 'todo';
    }
    $('share-next').textContent = stageInfo.next;
    // '링크 만들기'가 눌리지 않는 이유를 버튼 옆에 보여 준다.
    $('share-create-reason').hidden = !$('share-create').disabled;
  }
  function shareUrlFor(id, view) {
    const shareBase = location.hostname === 'lovetree.padiem.net' ? '/' : '/v41/';
    return new URL(`${shareBase}#share/${id}/${view}`, location.origin).href;
  }
  function renderShareList(shares = []) {
    const host = $('share-list'), treeId = window.LT41?.tree.id;
    host.replaceChildren();
    // #538: 둘러보기 소개는 서버가 자동으로 판단한다(공개 && 순간 3개 이상). 소유자 목록에는
    // 주인이 만든 링크만 보여 주고, 자동 공개 행(origin='auto')은 숨긴다 — 공개 상태는 위의 안내가 대신한다.
    const selected = shares.filter(item => item.treeId === treeId && item.origin !== 'auto');
    if (!selected.length) {
      const p = document.createElement('p');
      p.textContent = '아직 만든 공유 주소가 없어요. 트리는 공개가 기본이라 순간 3개부터 둘러보기에 소개돼요.';
      host.append(p);
      return;
    }
    // #369: 살아 있는 주소만 위에, 취소된 주소는 '지난 주소 N개' 접힘 안에 둔다.
    const active = selected.filter(item => item.status === 'active');
    const past = selected.filter(item => item.status !== 'active');
    for (const item of active) host.append(shareRow(item));
    if (past.length) {
      const details = document.createElement('details');
      details.className = 'share-past';
      const summary = document.createElement('summary');
      summary.textContent = `지난 주소 ${past.length}개`;
      details.append(summary);
      for (const item of past) details.append(sharePastRow(item));
      host.append(details);
    }
  }
  function shareLabel(item) {
    // 예전에는 toLocaleDateString('ko-KR')이라 세 표기(점·줄표·한글) 어디에도 맞지 않았다.
    return (item.view === 'board' ? '보드' : item.view === 'network' ? '지도' : '책') + ' · ' + formatDisplayDate(item.createdAt, getDateStyle()) + '에 만든 주소';
  }
  function shareRow(item) {
    const row = document.createElement('div');
    row.className = 'share-item';
    const text = document.createElement('div'), strong = document.createElement('strong'), small = document.createElement('small');
    strong.textContent = '공유 중';
    small.textContent = shareLabel(item);
    text.append(strong, small);
    row.append(text);
    {
        const actions = document.createElement('div');
        actions.className = 'share-item-actions';
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.textContent = '복사';
        copy.onclick = async () => {
          try {
            await navigator.clipboard.writeText(shareUrlFor(item.id, item.view));
            $('share-feedback').textContent = '공유 주소를 복사했어요.';
          } catch {
            $('share-feedback').textContent = '복사하지 못했어요. 열어 보기로 주소를 확인해 주세요.';
          }
        };
        const revoke = document.createElement('button');
        revoke.type = 'button';
        revoke.textContent = '공유 취소';
        revoke.onclick = async () => {
          if (!confirm('이 공유 주소를 지금 회수할까요? 둘러보기에 올렸다면 목록에서도 즉시 내려갑니다.')) return;
          revoke.disabled = true;
          const answer = await shareApi.revoke(item.id);
          if (!answer.ok) { $('share-feedback').textContent = shareFailure(answer); revoke.disabled = false; return; }
          $('share-feedback').textContent = '공유를 취소했어요. 새 요청은 즉시 차단됩니다.';
          if ($('share-url').dataset.shareId === item.id) { $('share-created').hidden = true; }
          await loadShareList();
        };
        actions.append(copy, revoke);
        row.append(actions);
      }
      return row;
  }
  function sharePastRow(item) {
    const row = document.createElement('div');
    row.className = 'share-item share-revoked';
    const text = document.createElement('div'), strong = document.createElement('strong'), small = document.createElement('small');
    strong.textContent = '공유 취소됨';
    small.textContent = shareLabel(item);
    text.append(strong, small);
    row.append(text);
    return row;
  }
  async function loadShareList() {
    const answer = await shareApi.list();
    if (answer.ok) renderShareList(answer.shares); else $('share-list').textContent = shareFailure(answer);
  }
  function invalidateSharePreview() {
    sharePreviewKey = ''; sharePreviewToken = '';
    $('share-create').disabled = true;
    $('share-preview-result').hidden = true;
    $('share-feedback').textContent = '선택이 바뀌었어요. 공개 내용을 다시 미리 봐 주세요.';
    paintShareSteps('choose');
  }
  async function openSharePanel() {
    if (getSource() !== 'server' || !getMember()?.snapshot().owned || !window.LT41) {
      notify('내 서버 기록에서 공유할 트리를 먼저 열어 주세요.'); return;
    }
    if (getMember().snapshot().dirty) {
      notify('서버 저장이 끝난 뒤 공유 내용을 확인해 주세요.'); return;
    }
    const tree = window.LT41.tree;
    $('share-moment').replaceChildren();
    for (const moment of tree.moments) {
      const o = document.createElement('option');
      o.value = moment.id; o.textContent = moment.title;
      $('share-moment').append(o);
    }
    $('share-moment').value = window.LT41.momentId;
    // #368 3차: 처음 열 보기는 설정의 공유 기본값으로 시작한다(공유마다 바꿀 수 있다).
    $('share-view').value = getShareDefaults().view;
    sharePreviewKey = ''; sharePreviewToken = '';
    $('share-create').disabled = true;
    $('share-preview-result').hidden = true;
    $('share-created').hidden = true;
    $('share-feedback').textContent = '';
    $('share-copy-note').textContent = '';
    paintShareMomentHint();
    paintShareVisibility();
    paintShareSteps('choose');
    panel('share-panel');
    void loadShareList();
  }

  $('share-menu').onclick = openSharePanel;
  $('share-moment').onchange = invalidateSharePreview;
  $('share-view').onchange = invalidateSharePreview;
  $('share-preview').onclick = async () => {
    const button = $('share-preview'), payload = sharePayload();
    button.disabled = true;
    $('share-feedback').textContent = '서버에서 공개 범위를 확인하고 있어요.';
    const answer = await shareApi.preview(payload);
    button.disabled = false;
    if (!answer.ok) { $('share-feedback').textContent = shareFailure(answer); return; }
    sharePreviewKey = JSON.stringify(payload);
    sharePreviewToken = answer.preview.previewToken;
    $('share-preview-summary').textContent = `“${displayTreeTitle(answer.preview.tree.title)}”의 ${answer.preview.tree.moments.length}개 순간을 공개합니다.${answer.preview.omittedPrivateMedia ? ' 비공개 업로드 ' + answer.preview.omittedPrivateMedia + '개는 제외됩니다.' : ''}`;
    $('share-preview-moments').replaceChildren();
    for (const moment of answer.preview.tree.moments) {
      const li = document.createElement('li');
      li.textContent = `${moment.title} · ${moment.emotion} · ${formatDisplayDate(moment.date, getDateStyle())}`;
      $('share-preview-moments').append(li);
    }
    $('share-preview-result').hidden = false;
    $('share-create').disabled = false;
    $('share-feedback').textContent = '미리보기를 확인한 뒤 링크를 만들 수 있어요.';
    paintShareSteps('ready');
  };
  $('share-create').onclick = async () => {
    const payload = sharePayload();
    if (sharePreviewKey !== JSON.stringify(payload)) { invalidateSharePreview(); return; }
    const button = $('share-create');
    button.disabled = true;
    $('share-feedback').textContent = '공유 주소를 만들고 있어요.';
    const answer = await shareApi.create({...payload, previewToken: sharePreviewToken});
    if (!answer.ok) { $('share-feedback').textContent = shareFailure(answer); button.disabled = false; return; }
    const url = shareUrlFor(answer.share.id, answer.share.view);
    $('share-url').value = url;
    $('share-url').dataset.shareId = answer.share.id;
    $('share-open').href = url;
    $('share-open').hidden = false;
    $('share-created').hidden = false;
    $('share-copy-note').textContent = '';
    $('share-feedback').textContent = '명시적으로 공유 주소를 만들었어요.';
    sharePreviewKey = ''; sharePreviewToken = '';
    paintShareSteps('done');
    await loadShareList();
  };
  $('share-copy').onclick = async () => {
    const input = $('share-url');
    try {
      await navigator.clipboard.writeText(input.value);
      $('share-copy-note').textContent = '복사했어요.';
      $('share-feedback').textContent = '공유 주소를 복사했어요.';
    } catch {
      input.select();
      $('share-copy-note').textContent = '';
      $('share-feedback').textContent = '주소를 선택했어요. 복사해 주세요.';
    }
  };
  // #538: 순간 수 안내 — 3개 미만이면 '순간 3개를 모으면 둘러보기에 소개돼요'.
  function paintShareMomentHint() {
    const hint = $('share-moment-hint');
    if (!hint) return;
    const count = window.LT41?.tree?.moments?.length || 0;
    hint.textContent = count >= 3
      ? `이 트리의 순간 ${count}개 · 둘러보기에 소개되고 있어요.`
      : `이 트리의 순간 ${count}개 · 순간 3개를 모으면 둘러보기에 소개돼요.`;
  }
  // #538: 공개 상태 표시. 비공개 전환은 Plus 전용 — 판단은 서버가 한다(403 plus_required_private).
  function paintShareVisibility() {
    const state = $('share-visibility-state');
    if (state) state.textContent = '공개 상태 · 공개(기본)';
  }
  $('share-private').onclick = async () => {
    const treeId = window.LT41?.tree?.id;
    if (!treeId) { $('share-feedback').textContent = '공개 상태를 바꿀 트리를 먼저 열어 주세요.'; return; }
    const answer = await shareApi.setTreeVisibility(treeId, 'private');
    $('share-feedback').textContent = answer.ok
      ? '비공개로 바꿨어요.'
      : (answer.code === 'plus_required_private' ? '비공개는 Plus 전용이에요. 지금은 모든 트리가 공개로 유지돼요.' : (answer.message || '공개 상태를 바꾸지 못했어요.'));
  };

  // 둘러보기(공개 목록) 연결. 항목을 열면 공유 주소로, 내 기록 새로 시작은 첫 여정으로 간다.
  mountCommunity({
    button: $('community-menu'),
    dialog: $('community-panel'),
    // #480 L13: 둘러보기 카드·댓글의 날짜도 계정 설정 한 벌을 따른다.
    getDateStyle: () => getDateStyle(),
    onOpenShare: item => { $('community-panel').close(); location.hash = `#share/${item.shareId}/${item.view || 'book'}`; },
    // 이슈 457 5번: 공유할 내 트리가 있어야 "내 트리 공유하기" — 로그아웃·트리 0개는 "첫 트리 만들기"로 바뀐다.
    hasOwnTree: () => getSource() === 'server' && !!getMember()?.snapshot().owned && (getModel()?.trees?.length || 0) > 0,
    onShareOwn: () => {
      $('community-panel').close();
      if (getSource() === 'server' && getMember()?.snapshot().owned && window.LT41) openSharePanel();
      else { notify('로그인하고 공유할 내 트리를 먼저 선택해 주세요.'); openSettingsData(); }
    },
    onStartRecord: subject => {
      $('community-panel').close();
      if (getSource() !== 'server' || !getMember()?.snapshot().owned) {
        notify('로그인한 뒤 내 계정에 새 트리를 시작할 수 있어요. 원본 공개 트리는 복사하지 않아요.');
        // #368: 로그인 상태면 설정 "내 데이터", 로그아웃이면 로그인(돌아오면 새 트리 흐름)으로 보낸다.
        openSettingsData('new-tree'); return;
      }
      journey.openFirstJourney({subject: subject || ''});
    }
  });

  return {openSharePanel};
}
