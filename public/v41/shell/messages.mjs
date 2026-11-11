// 셸의 공유 패널·둘러보기 연결·lt41-* 메시지 수신 (#231 1-B③-3).
// 2026-11-08 리팩터링: 동작·문구·주소 형식 변경 0. shell.mjs에서 조건·조회 방식·인자 형태를 바꾸지 않고 그대로 옮겼다.
import {mountCommunity} from '../community-panel.mjs';
import {displayTreeTitle} from '../tree-name.mjs';

export function createMessages(deps) {
  const {$} = deps;
  const getCurrent = deps.getCurrent;
  const setCurrent = deps.setCurrent;
  const getModel = deps.getModel;
  const getSource = deps.getSource;
  const getMember = deps.getMember;
  const shareApi = deps.shareApi;
  const notify = deps.notify;
  const panel = deps.panel;
  const show = deps.show;
  const links = deps.links;
  const writeLocation = deps.writeLocation;
  const choose = deps.choose;
  const openEditor = deps.openEditor;
  const openLoginStart = deps.openLoginStart;
  const openAccountMenu = deps.openAccountMenu;
  const openCleanup = deps.openCleanup;
  const sample = deps.sample;
  const applyTheme = deps.applyTheme;
  const paintThemeControls = deps.paintThemeControls;
  const viewForFile = deps.viewForFile;
  const exampleTree = deps.exampleTree;
  const journey = deps.journey;

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
    if (data?.type === 'lt41-write') openEditor(data.mode, data.parentId);
    // #327 2부: 순간 상세의 '다른 트리로 옮기기'. 공유·예시 화면에서는 보내지 않고, 여기서도 한 번 더 막는다.
    if (data?.type === 'lt41-move' && getSource() === 'server') openCleanup({ momentId: data.momentId });
    if (data?.type === 'lt41-open-book' && getModel()?.trees.some(t => t.id === data.treeId && t.moments.some(m => m.id === data.id))) {
      setCurrent('track59-sketchbook.html'); choose(data.treeId, data.id); writeLocation();
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
  function renderShareList(shares = []) {
    const host = $('share-list'), treeId = window.LT41?.tree.id;
    host.replaceChildren();
    const selected = shares.filter(item => item.treeId === treeId);
    if (!selected.length) {
      const p = document.createElement('p');
      p.textContent = '아직 만든 공유 주소가 없어요.';
      host.append(p);
      return;
    }
    for (const item of selected) {
      const row = document.createElement('div');
      row.className = 'share-item' + (item.status === 'revoked' ? ' share-revoked' : '');
      const text = document.createElement('div'), strong = document.createElement('strong'), small = document.createElement('small');
      strong.textContent = item.status === 'active' ? (item.discoverable ? '공유 중 · 발견 공개' : '공유 중 · 주소로만 공개') : '공유 취소됨';
      small.textContent = (item.view === 'board' ? '기억 보드' : item.view === 'network' ? '관계 지도' : '기억책') + ' · ' + new Date(item.createdAt).toLocaleString('ko-KR');
      text.append(strong, small);
      row.append(text);
      if (item.status === 'active') {
        const actions = document.createElement('div');
        actions.className = 'share-item-actions';
        const discover = document.createElement('button');
        discover.type = 'button';
        discover.textContent = item.discoverable ? '발견에서 내리기' : '발견에 공개';
        discover.onclick = async () => {
          const next = !item.discoverable;
          if (next && !confirm('이 트리를 누구나 검색할 수 있는 발견 목록에 공개할까요? 공유 주소만 만든 상태와 달리 제목·대상·공개 순간이 목록에 나타납니다.')) return;
          discover.disabled = true;
          const answer = await shareApi.setDiscoverable(item.id, next);
          if (!answer.ok) { $('share-feedback').textContent = shareFailure(answer); discover.disabled = false; return; }
          $('share-feedback').textContent = next ? '발견 목록 공개를 켰어요.' : '발견 목록에서 내렸어요. 공유 주소는 계속 사용할 수 있어요.';
          await loadShareList();
        };
        const revoke = document.createElement('button');
        revoke.type = 'button';
        revoke.textContent = '공유 취소';
        revoke.onclick = async () => {
          if (!confirm('이 공유 주소를 지금 회수할까요? 발견 목록에서도 즉시 내려갑니다.')) return;
          revoke.disabled = true;
          const answer = await shareApi.revoke(item.id);
          if (!answer.ok) { $('share-feedback').textContent = shareFailure(answer); revoke.disabled = false; return; }
          $('share-feedback').textContent = '공유를 취소했어요. 새 요청은 즉시 차단됩니다.';
          if ($('share-url').dataset.shareId === item.id) $('share-created').hidden = true;
          await loadShareList();
        };
        actions.append(discover, revoke);
        row.append(actions);
      }
      host.append(row);
    }
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
    $('share-view').value = ['book', 'board', 'network'].includes(viewForFile(getCurrent())) ? viewForFile(getCurrent()) : 'book';
    sharePreviewKey = ''; sharePreviewToken = '';
    $('share-create').disabled = true;
    $('share-preview-result').hidden = true;
    $('share-created').hidden = true;
    $('share-feedback').textContent = '';
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
      li.textContent = `${moment.title} · ${moment.emotion} · ${moment.date}`;
      $('share-preview-moments').append(li);
    }
    $('share-preview-result').hidden = false;
    $('share-create').disabled = false;
    $('share-feedback').textContent = '미리보기를 확인한 뒤 링크를 만들 수 있어요.';
  };
  $('share-create').onclick = async () => {
    const payload = sharePayload();
    if (sharePreviewKey !== JSON.stringify(payload)) { invalidateSharePreview(); return; }
    const button = $('share-create');
    button.disabled = true;
    $('share-feedback').textContent = '공유 주소를 만들고 있어요.';
    const answer = await shareApi.create({...payload, previewToken: sharePreviewToken});
    if (!answer.ok) { $('share-feedback').textContent = shareFailure(answer); button.disabled = false; return; }
    const shareBase = location.hostname === 'lovetree.padiem.net' ? '/' : '/v41/';
    const url = new URL(`${shareBase}#share/${answer.share.id}/${answer.share.view}`, location.origin).href;
    $('share-url').value = url;
    $('share-url').dataset.shareId = answer.share.id;
    $('share-created').hidden = false;
    $('share-feedback').textContent = '명시적으로 공유 주소를 만들었어요.';
    sharePreviewKey = ''; sharePreviewToken = '';
    await loadShareList();
  };
  $('share-copy').onclick = async () => {
    const input = $('share-url');
    try {
      await navigator.clipboard.writeText(input.value);
      $('share-feedback').textContent = '공유 주소를 복사했어요.';
    } catch {
      input.select();
      $('share-feedback').textContent = '주소를 선택했어요. 복사해 주세요.';
    }
  };

  // 둘러보기(공개 목록) 연결. 항목을 열면 공유 주소로, 내 기록 새로 시작은 첫 여정으로 간다.
  mountCommunity({
    button: $('community-menu'),
    dialog: $('community-panel'),
    onOpenShare: item => { $('community-panel').close(); location.hash = `#share/${item.shareId}/${item.view || 'book'}`; },
    onShareOwn: () => {
      $('community-panel').close();
      if (getSource() === 'server' && getMember()?.snapshot().owned && window.LT41) openSharePanel();
      else { notify('로그인하고 공유할 내 트리를 먼저 선택해 주세요.'); panel('records'); }
    },
    onStartRecord: subject => {
      $('community-panel').close();
      if (getSource() !== 'server' || !getMember()?.snapshot().owned) {
        notify('로그인한 뒤 내 계정에 새 트리를 시작할 수 있어요. 원본 공개 트리는 복사하지 않아요.');
        panel('records'); return;
      }
      journey.openFirstJourney({subject: subject || ''});
    }
  });

  return {openSharePanel};
}
