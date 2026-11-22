// 셸의 공유 패널·둘러보기 연결·lt41-* 메시지 수신 (#231 1-B③-3).
// 2026-11-08 리팩터링: 동작·문구·주소 형식 변경 0. shell.mjs에서 조건·조회 방식·인자 형태를 바꾸지 않고 그대로 옮겼다.
// #1026 E 2단계(A-06): 둘러보기 창 모듈은 이 연결 지점에서만 받는다(첫 클릭 리스너는 곧바로 단다).
import { MSG } from '../frame-messages.mjs';
import {displayTreeTitle} from '../tree-name.mjs';
import {parseTag,tagKey,isChannelLikeArtist} from '../tags.mjs';
// #480 L13: 날짜는 책·보드·지도·첫 화면과 같은 한 벌(formatDisplayDate)로만 적는다.
import {formatDisplayDate} from '../book-usability.mjs';
import {copyPublicMoment} from '../moments-copy.mjs';

// 261118 대표 지적 2차 5: 서재 화면이 알려 준 '마지막에 본 트리'(가운데 책의 트리).
// 서재 화면에서 콕·보드·지도 탭을 누르면 이 트리로 열린다(shell.mjs의 data-view 눌림에서 쓴다).
let shelfTreeId = '';
export function lastShelfTreeId() { return shelfTreeId; }

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
  // 둘러보기 소개 상태(261116 결정) — 셸이 관찰한 마지막 값을 넘겨 준다(공유 판·힌트가 같은 값을 본다).
  const discoverOf = deps.discoverOf || (() => null);
  const notify = deps.notify;
  const panel = deps.panel;
  // #368: 읽기 전용·로그아웃 안내의 행선지 — 설정 "내 데이터" 묶음(로그아웃이면 로그인).
  const openSettingsData = deps.openSettingsData || (() => {});
  const show = deps.show;
  const links = deps.links;
  const writeLocation = deps.writeLocation;
  const choose = deps.choose;
  const openTreeManager = deps.openTreeManager;
  const openNewTree = deps.openNewTree || (() => {});
  const openEditor = deps.openEditor;
  // 이슈 671: 새로 추가(new·add)는 입구와 상관없이 같은 쓰기 창(openWrite)으로 연다 — 대표 결정(2026-11-12).
  const openWriteEntry = deps.openWriteEntry || (() => {});
  const focusTitleInput = deps.focusTitleInput;
  const openLoginStart = deps.openLoginStart;
  const openAccountMenu = deps.openAccountMenu;
  const openCleanup = deps.openCleanup;
  // #627 PR B: 꼬리표 저장 한 곳(셸 tag-save.mjs) — 화면의 lt41-tags가 부른다.
  const saveTags = deps.saveTags || (() => ({ ok: false, error: 'notfound' }));
  // #644 1: 상세의 옮기기는 트리 목록(셸 cleanup 모듈의 openMove)으로 바로 연다 — 트리가 하나뿐이면
  // 그 모듈이 기존 정리 창('새 트리 만들어 옮기기')을 연다. 셸이 넘겨 주지 않으면 예전 동작(정리 창)으로라도 연다.
  const openMovePicker = deps.openMovePicker || openCleanup;
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
    if (data?.type === MSG.boardSync) {
      const reply = (ok, error) => { try { event.source?.postMessage({type:MSG.boardSaved, ok, error}, location.origin); } catch {} };
      if (getSource() !== 'server' || !getMember()?.snapshot().writable) { reply(false, '서버 편집 연결이 없어 저장하지 않았어요.'); return; }
      try { getMember().apply('boardSync', {moments: data.moments}, {treeId: data.treeId}); reply(true); }
      catch (error) { reply(false, error?.message || '저장하지 못했어요.'); }
      return;
    }
    if (data?.type === MSG.openTags) {
      const ok = deps.openTagManager?.({ suggest: data.suggest === true }) === true;
      try { event.source?.postMessage({ type: MSG.tagsOpened, ok }, location.origin); } catch {}
      return;
    }
    // #627 PR B: 화면의 꼬리표 줄이 확인한 것 — keywords만 기존 저장 경로(shellTags → boardSync)로 바꾼다.
    // 답(lt41-tags-saved)을 보낸 화면에만 돌려 화면 사본이 칩을 다시 맞추게 한다. iframe을 다시 그리지 않는다.
    if (data?.type === MSG.tags) {
      const reply = (ok, keywords, error) => { try { event.source?.postMessage({type:MSG.tagsSaved, ok, momentId: data.momentId, keywords, error}, location.origin); } catch {} };
      if (getSource() !== 'server' || !getMember()?.snapshot().writable) { reply(false, null, '읽어 보는 화면에서는 꼬리표를 바꿀 수 없어요.'); return; }
      const saved = saveTags({ treeId: data.treeId, momentId: data.momentId, keywords: data.keywords, quiet: true });
      // 결함 ③(tags-sync): 저장이 실제로 바뀌었으면 tag-save가 열린 프레임 모두(부낸 화면 포함)에 알렸다 —
      // 같은 답을 두 번 보내지 않게 여기서는 실패·변화 없음일 때만 돌려준다.
      if (!saved.ok || !saved.changed) reply(saved.ok, saved.ok ? saved.keywords : null, saved.error);
      return;
    }
    if (data?.type === MSG.storySave) {
      const treeId = typeof data.treeId === 'string' ? data.treeId : '';
      const fromMomentId = typeof data.fromMomentId === 'string' ? data.fromMomentId : '';
      const momentId = typeof data.momentId === 'string' ? data.momentId : '';
      const relation = typeof data.relation === 'string' ? data.relation.trim() : null;
      const reply = (ok, error) => { try { event.source?.postMessage({type:MSG.storySaved, ok, treeId, fromMomentId, momentId, relation: relation ?? '', error}, location.origin); } catch {} };
      const member = getMember();
      const tree = getModel()?.trees?.find(item => item.id === treeId);
      const parent = tree?.moments?.find(item => item.id === fromMomentId);
      const child = tree?.moments?.find(item => item.id === momentId);
      if (getSource() !== 'server' || !member?.snapshot().writable) { reply(false, '읽기 전용 화면에서는 한마디를 저장할 수 없어요.'); return; }
      if (!tree || !parent || !child || child.parentId !== fromMomentId) { reply(false, '이어진 순간을 찾지 못했어요.'); return; }
      if (relation === null || relation.length > 100) { reply(false, '한마디는 100자까지 적을 수 있어요.'); return; }
      try {
        member.apply('edit', {
          ...child,
          note: child.note ?? '',
          relation
        }, {treeId, momentId}, {moment:true, story:true});
        reply(true, '');
      } catch (error) { reply(false, error?.message || '저장하지 못했어요.'); }
      return;
    }
    if (data?.type === MSG.theme) { applyTheme(); paintThemeControls(); }
    if (data?.type === MSG.journeyStep) { journey.noteJourneyStep(data.step); return; }
    if (data?.type === MSG.journeySave) { if (getSource() === 'share') return; journey.saveFirstJourney(data.draft); return; }
    if (data?.type === MSG.journeyOpenBook) { journey.openJourneyBook(data); return; }
    if (data?.type === MSG.journeyClose) { journey.closeFirstJourney(); return; }
    if (data?.type === MSG.mediaMetadata && getSource() === 'server' && getMember()?.snapshot().owned) {
      const tree = window.LT41?.tree, moment = tree?.moments.find(m => m.id === data.momentId && m.url === data.url);
      if (moment) try {
        getMember().apply('cacheMediaMetadata', {url: data.url, mediaMetadata: data.mediaMetadata}, {treeId: tree.id, momentId: moment.id});
      } catch {}
    }
    if (data?.type === MSG.shelfTree && getModel()?.trees?.some(t => t.id === data.treeId)) { shelfTreeId = data.treeId; return; }
    if (data?.type === MSG.navigate) {
      if (data.view === 'track32-bookshelf.html' && !getMember()?.snapshot().owned) { openLoginStart('shelf'); return; }
      show(data.view);
    }
    if (data?.type === MSG.select && window.LT41?.tree.moments.some(m => m.id === data.id)) {
      window.LT41.momentId = data.id; links(); writeLocation();
    }
    // #315: 공유 감상(share)은 읽기 전용이다. 안쪽 화면의 버튼 정리를 통과한 쓰기 메시지가 남아도 여기서 막는다(이중).
    if (data?.type === MSG.newTree) { openNewTree(); return; }
    if (data?.type === MSG.write && getSource() === 'share') return;
    if (data?.type === MSG.write && data.mode === 'edit' && data.momentId) {
      const targetTree = data.treeId
        ? getModel()?.trees.find(t => t.id === data.treeId && t.moments.some(m => m.id === data.momentId))
        : (window.LT41?.tree?.moments.some(m => m.id === data.momentId) ? window.LT41.tree : getModel()?.trees.find(t => t.moments.some(m => m.id === data.momentId)));
      if (targetTree) {
        if (window.LT41?.tree?.id !== targetTree.id) choose(targetTree.id, data.momentId);
        else { window.LT41.momentId = data.momentId; links(); writeLocation(); }
      }
    }
    // 이슈 671: 고치기(edit)는 지금처럼 편집기로, 새로 추가(new·add)는 같은 쓰기 창으로 보낸다.
    // 목적지(트리·이어질 순간)가 오면 쓰기 창에 넘겨 그 트리·그 순간 다음에 담는다(#647 고른 트리 우선 재사용).
    if (data?.type === MSG.write && data.mode === 'edit') openEditor(data.mode, data.parentId);
    else if (data?.type === MSG.write) openWriteEntry({ treeId: data.treeId || '', parentId: data.parentId || '' });
    if (data?.type === MSG.write && data.focusTitle) focusTitleInput?.();
    // #327 2부: 순간 상세의 '다른 트리로 옮기기'. 공유·예시 화면에서는 보내지 않고, 여기서도 한 번 더 막는다.
    if (data?.type === MSG.move && getSource() === 'server') openMovePicker({ momentId: data.momentId });
    // 순간 목록에서의 옮기기(2026-11-17, 대표 결정): 골라 온 순간들을 한 트리로 옮긴다 — 기존
    // member.apply('moveMoment') 한 길(cleanup.mjs와 같다). 옮긴 뒤에는 지금 보기를 다시 그려 목록을
    // 열어 둔다(LT41_MOMENTS_OPEN을 되살려 목록이 다시 뜰 때 같은 목록·되돌리기 안내를 받게 한다).
    if (data?.type === MSG.moveMoments && getSource() === 'server') {
      const wanted = Array.isArray(data.pairs) && data.pairs.length
        ? data.pairs.map(p => ({ id: String(p?.id || ''), fromTreeId: String(p?.fromTreeId || ''), toTreeId: String(p?.toTreeId || data.toTreeId || '') })).filter(p => p.id && p.toTreeId)
        : (Array.isArray(data.momentIds) ? data.momentIds.map(id => ({ id: String(id || ''), fromTreeId: String(data.fromTreeId || ''), toTreeId: String(data.toTreeId || '') })).filter(p => p.id && p.toTreeId) : []);
      if (!wanted.length) return;
      const movedPairs = [];
      try {
        for (const wantedItem of wanted) {
          const toTree = getModel()?.trees.find(t => t.id === wantedItem.toTreeId);
          if (!toTree) continue;
          const from = wantedItem.fromTreeId && getModel()?.trees.find(t => t.id === wantedItem.fromTreeId && t.moments.some(m => m.id === wantedItem.id))
            || getModel()?.trees.find(t => t.moments.some(m => m.id === wantedItem.id));
          if (!from || from.id === toTree.id) continue;
          try{getMember().apply('moveMoment', { toTreeId: toTree.id }, { treeId: from.id, momentId: wantedItem.id });}catch(err){throw err;}
          movedPairs.push({ id: wantedItem.id, fromTreeId: from.id });
        }
      } catch (error) { notify(error?.message || '옮기지 못했어요. 다시 시도해 주세요.'); return; }
      if (!movedPairs.length) return;
      notify(data.noticeText || '옮겼어요.');
      // 되돌리기는 출발 트리가 남아 있을 때만(정리 창의 canUndo 규칙과 같다) — 옮기고 비워진 트리는
      // 삭제되므로 그 짝은 되돌릴 수 없다.
      const undoPairs = movedPairs.filter(p => getModel()?.trees.some(t => t.id === p.fromTreeId))
        .map(p => ({ id: p.id, fromTreeId: data.toTreeId || '', toTreeId: p.fromTreeId }));
      // 목록 유지: 옮긴 뒤 지금 보기를 다시 그린다 — 되돌리기 짝을 함께 넘겨 목록 창의 되돌리기가 쓴다
      // (undo의 fromTreeId는 옮겨진 지금 자리, toTreeId는 원래 자리다).
      window.LT41_MOMENTS_OPEN = {
        treeId: String(data.keepTreeId || 'all'),
        notice: { text: String(data.noticeText || ''), undo: undoPairs.length ? { pairs: undoPairs, toTreeId: movedPairs[0].fromTreeId } : null }
      };
      show(getCurrent());
      return;
    }
    // 트리 칩 순서(2026-11-17, 대표 결정): 계정 설정 칸(state.prefs.treeChipOrder)에 저장 — 기존 setPrefs 한 길.
    if (data?.type === MSG.prefs && data.patch?.treeChipOrder && getSource() === 'server') {
      try { getMember().apply('setPrefs', { treeChipOrder: data.patch.treeChipOrder }); } catch (error) { notify(error?.message || '순서를 저장하지 못했어요.'); }
      return;
    }
    // 261117 고객 의견: 첫 화면 둘째 줄 '모아둔 순간 N개 정리하기' — 모아둔 순간 정리 창을 연다(옮기기와 별개).
    if (data?.type === MSG.cleanup && getSource() === 'server') { openCleanup({}); return; }
    if (data?.type === MSG.openBook && getModel()?.trees.some(t => t.id === data.treeId && t.moments.some(m => m.id === data.id))) {
      setCurrent('track59-sketchbook.html'); choose(data.treeId, data.id); writeLocation();
    }
    // #810: 서재 ⋯ — 그 트리로 고른 뒤 기존 트리 관리 창을 연다(새 창 만들지 않음). 없는 트리는 무시한다.
    if (data?.type === MSG.manageTree && getSource() === 'server' && getModel()?.trees.some(t => t.id === data.treeId)) {
      // #984: 이미 고른 트리라면 화면을 다시 띄우지 않는다 — 서재가 깜빡이며 프레임이 바뀌면 저장 직후 표지·이름 알림이 유실된다.
      if (window.LT41?.tree?.id !== data.treeId) choose(data.treeId);
      openTreeManager?.();
    }
    // #582: 보드 상세의 '지도에서 관계 보기' — 지도→책 이동과 같은 셸 방식(LT41.momentId로 그 순간을 연다).
    // 지도 파일은 건드리지 않는다. 지도는 뜰 때 LTDEMO.get()(=LT41.momentId)의 순간을 선택한다.
    if (data?.type === MSG.openNetwork) {
      const treeId = data.treeId || window.LT41?.tree?.id;
      if (getModel()?.trees.some(t => t.id === treeId && t.moments.some(m => m.id === data.momentId))) {
        setCurrent('track56-network.html'); choose(treeId, data.momentId); writeLocation();
      }
    }
    // #417: 보드·지도 화면의 트리 ▾ — 다른 트리를 같은 보기로 열 때 쓴다. 책(lt41-open-book)과 같은 규칙이고,
    // 보기는 board·network만 허용하며(그 밖은 무시), 없는 트리도 무시한다.
    if (data?.type === MSG.openView && ['board', 'network'].includes(data.view) && getModel()?.trees.some(t => t.id === data.treeId)) {
      setCurrent(data.view === 'board' ? 'track58-pinboard.html' : 'track56-network.html'); choose(data.treeId); writeLocation();
    }
    // #394: 첫 화면이 순간 목록을 열었다(시작 트리 전달 완료) — 요청 플래그를 치워 다음 화면 이동에 되풀이하지 않게 한다.
    if (data?.type === MSG.momentsOpened) delete window.LT41_MOMENTS_OPEN;
    if (data?.type === MSG.start) { openLoginStart('first'); return; }
    if (data?.type === MSG.account) {
      if (getMember()?.snapshot().owned) openAccountMenu(); else $('account-entry').click();
    }
    if (data?.type === MSG.community) $('community-menu').click();
    if (data?.type === MSG.example && exampleTree?.moments?.some(m => m.id === data.momentId) && ['track59-sketchbook.html', 'track58-pinboard.html'].includes(data.view)) {
      sample({treeId: exampleTree.id, momentId: data.momentId}, data.view);
    }
    if (data?.type === MSG.selection || data?.type === MSG.choose) { links(); writeLocation(); }
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
    // #541: 복사할 주소는 미리보기 카드가 붙는 /t/<id>. view 는 서버가 주소에서 정하고,
    // 기존 #share/<id>/<view> 주소도 계속 열린다(앱 안 이동은 그 형식을 그대로 쓴다).
    return new URL(`/t/${encodeURIComponent(id)}`, location.origin).href;
  }
  function renderShareList(shares = []) {
    const host = $('share-list'), treeId = window.LT41?.tree.id;
    host.replaceChildren();
    // #538: 둘러보기 소개는 서버가 자동으로 판단한다(공개 && 순간 3개 이상). 소유자 목록에는
    // 주인이 만든 링크만 보여 주고, 자동 공개 행(origin='auto')은 숨긴다 — 공개 상태는 위의 안내가 대신한다.
    const selected = shares.filter(item => item.treeId === treeId && item.origin !== 'auto');
    if (!selected.length) {
      const p = document.createElement('p');
      p.textContent = '아직 만든 공유 주소가 없어요. 둘러보기 소개는 기본 꺼짐이에요.';
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
    paintShareDiscover();
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
  // 공개 여부·둘러보기 소개: 설정과 같은 두 칸 선택(44px). 상태 글 줄은 없다.
  async function paintShareDiscover() {
    const treeId = window.LT41?.tree?.id;
    if (!treeId) return;
    const discover = await shareApi.getTreeDiscover(treeId).then(a => a.ok ? a.discover === true : null).catch(() => null);
    if (discover === null) return;
    const off = $('share-disc-off'), on = $('share-disc-on');
    if (off) off.setAttribute('aria-checked', String(discover === false));
    if (on) on.setAttribute('aria-checked', String(discover === true));
    deps.rememberDiscover?.(treeId, discover);
  }
  const discOff = $('share-disc-off'); if (discOff) discOff.onclick = async () => { await setDiscover(false); };
  const discOn = $('share-disc-on'); if (discOn) discOn.onclick = async () => { await setDiscover(true); };
  async function setDiscover(next) {
    const treeId = window.LT41?.tree?.id;
    if (!treeId) { $('share-feedback').textContent = '공개 상태를 바꿀 트리를 먼저 열어 주세요.'; return; }
    const answer = await shareApi.setTreeDiscover(treeId, next);
    $('share-feedback').textContent = answer.ok
      ? (next ? '둘러보기에 소개했어요.' : '둘러보기 소개를 껐어요. 링크를 받은 사람만 볼 수 있어요.')
      : (answer.message || '둘러보기 설정을 바꾸지 못했어요.');
    void paintShareDiscover();
  }
  async function paintShareVisibility() {
    const treeId = window.LT41?.tree?.id;
    if (!treeId) return;
    const answer = await Promise.resolve().then(() => shareApi.getTreeVisibility(treeId)).then(a => (a.ok ? a.visibility : null)).catch(() => null);
    if (answer !== 'public' && answer !== 'private') return;
    const pub = $('share-vis-public'), priv = $('share-vis-private');
    if (pub) pub.setAttribute('aria-checked', String(answer === 'public'));
    if (priv) priv.setAttribute('aria-checked', String(answer === 'private'));
  }
  const visPub = $('share-vis-public'); if (visPub) visPub.onclick = async () => { await setVis('public'); };
  const visPriv = $('share-vis-private'); if (visPriv) visPriv.onclick = async () => { await setVis('private'); };
  async function setVis(next) {
    const treeId = window.LT41?.tree?.id;
    if (!treeId) { $('share-feedback').textContent = '공개 상태를 바꿀 트리를 먼저 열어 주세요.'; return; }
    const answer = await shareApi.setTreeVisibility(treeId, next);
    $('share-feedback').textContent = answer.ok
      ? (next === 'private' ? '이 트리를 비공개로 바꿨어요.' : '이 트리를 공개로 바꿨어요.')
      : (answer.message || '공개 상태를 바꾸지 못했어요.');
    void paintShareVisibility();
  }

  // 둘러보기(공개 목록) 연결. 항목을 열면 공유 주소로, 내 기록 새로 시작은 첫 여정으로 간다.
  // #1026 E: Node 단위 시험의 document 흉내에서는 브라우저 전용 모듈을 받지 않는다.
  const browser = typeof document!=='undefined' && typeof HTMLElement!=='undefined' && !!document.querySelector;
  if(!browser && !deps.mountCommunity)return {openSharePanel};
  const mountCommunity = deps.mountCommunity || (() => import('../community-panel.mjs').then(m => m.mountCommunity));
  void Promise.resolve(mountCommunity()).then(mount => mount({
    button: $('community-menu'),
    dialog: $('community-panel'),
    // #480 L13: 둘러보기 카드·댓글의 날짜도 계정 설정 한 벌을 따른다.
    getDateStyle: () => getDateStyle(),
    getArtistGroups: () => {
      if (getSource() !== 'server' || !getMember()?.snapshot().owned) return [];
      const groups = [], seen = new Set();
      const add = value => {
        // #935: 칩은 저장된 '가수' 꼬리표에서만, 채널 이름은 제외한다(제목 추정은 칩에 넣지 않는다).
        if (isChannelLikeArtist(value)) return;
        const key = tagKey(value);
        if (!key || seen.has(key)) return;
        seen.add(key);
        groups.push(value);
      };
      for (const tree of getModel()?.trees || []) {
        for (const moment of tree.moments || []) for (const raw of moment.keywords || []) {
          const parsed = parseTag(raw);
          if (parsed?.kindId === 'artist') add(parsed.value);
        }
      }
      return groups;
    },
    onOpenShare: item => { $('community-panel').close(); location.hash = `#share/${item.shareId}/${item.view || 'book'}`; },
    // #1025 2단계: [내 트리에 담기] — 고른 트리에 순간을 새로 복사한다(원본 공개 트리는 건드리지 않는다).
    onAddToTree: (item, treeId) => {
      const member = getMember();
      if (getSource() !== 'server' || !member?.snapshot().owned) return {ok:false,reason:'login'};
      const tree = (getModel()?.trees || []).find(t => t.id === treeId);
      if (!tree?.moments?.length) return {ok:false,reason:'tree'};
      const copied = copyPublicMoment(tree, item, location.origin);
      try { member.apply('boardSync', {moments: copied.moments}, {treeId, momentId: copied.momentId}); }
      catch { return {ok:false,reason:'save'}; }
      return {ok:true,treeId};
    },
    notify: (text, options) => notify(text, options),
    memberLogin: () => openSettingsData('new-tree'),
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
  }));

  return {openSharePanel};
}
