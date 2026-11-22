// #327 2부: 모아둔 순간 정리 창. 계산은 inbox-model.mjs 한 벌을 쓰고, 여기서는 읽기·그리기·적용만 한다.
// 저장은 기존 member.apply('treeFromMoments'/'moveMoment') 그대로다(새 저장 경로 없음).
import { cleanupState, cleanupTargets, cleanupAvailable, moveAvailable, isInboxTree, pickerLabel, movedNotice } from '../inbox-model.mjs';

export function createCleanup(deps) {
  const $ = deps.$;
  const getMember = deps.getMember;
  const getSource = deps.getSource;
  const getTrees = deps.getTrees;
  const choose = deps.choose;
  const notify = deps.notify;
  const panel = deps.panel;
  // 생략하면 기존처럼 원시 값만 그린다(화면 규칙 주입 지점은 셸 하나).
  const treeMomentThumb = deps.treeMomentThumb || (() => '');
  const momentTitle = deps.momentTitle || (() => '');
  const thumbCandidatesOf = deps.thumbCandidatesOf || null;
  const fallbackCardOf = deps.fallbackCardOf || null;
  const emotionToneOf = deps.emotionToneOf || (() => 1);
  const addTitleLabel = deps.addTitleLabel || '제목 달기';
  const unavailableLabel = deps.unavailableLabel || '영상을 볼 수 없어요';
  let fromTreeId = '';
  let noticeTimer = null;
  function writable() {
    const snap = getMember()?.snapshot();
    return !!snap?.owned && !!snap?.writable;
  }
  // #380 5번: 입구는 트리 ▾ 드롭다운의 '정리 전 N개 정리하기' 한 곳이다(이전 헤더 '정리하기' 단추는 없앴다).
  // 순간 상세의 옮기기(lt41-move)는 일반 트리에서도 연다.
  function headerAvailable() {
    return cleanupAvailable({ source: getSource(), owned: !!getMember()?.snapshot().owned, tree: window.LT41?.tree || null });
  }
  // #480 M8: 창을 연 순간의 상태(새 트리 이름·순간 고름·옮길 트리). 닫을 때 물을지 판정하는 기준이다.
  let baseState = { picked: '', name: '', target: '' };
  function openAvailable() {
    return moveAvailable({ source: getSource(), owned: !!getMember()?.snapshot().owned }) && writable();
  }
  function open({ momentId = '' } = {}) {
    if (!openAvailable()) { notify('내 기록을 불러온 뒤 정리할 수 있어요.'); return false; }
    const tree = window.LT41?.tree;
    if (!tree) { notify('트리를 먼저 불러와 주세요.'); return false; }
    fromTreeId = tree.id;
    $('cleanup-desc').textContent = isInboxTree(tree)
      ? '모아둔 순간을 다른 트리로 옮기거나, 고른 순간만 골라 새 트리로 만들어요.'
      : '이 트리의 순간을 다른 트리로 옮겨요. 원하는 순간을 더 골라 함께 옮길 수도 있어요.';
    renderMoments(tree, momentId);
    renderTargets(tree);
    $('cleanup-new-name').value = '';
    $('cleanup-error').textContent = '';
    // #480 M8: 창을 열 때의 상태를 기억한다. 순간 상세에서 '옮기기'로 열면 그 순간이 미리 골라져 있고
    // 대상 트리가 처음부터 골라져 있는데, 그것까지 '쓰다 만 입력'으로 세면 열자마자 닫을 때도 묻는다.
    baseState = readState();
    sync();
    panel('cleanup-panel');
    return true;
  }
  function renderMoments(tree, preselect) {
    const host = $('cleanup-moments');
    host.replaceChildren();
    for (const moment of tree.moments) {
      const label = document.createElement('label');
      label.className = 'cleanup-moment';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = moment.id;
      box.checked = moment.id === preselect;
      box.addEventListener('change', sync);
      // 다른 화면과 같은 표시 규칙을 그대로 쓴다: 제목(설정 반영)과 썸네일(없으면 자리만).
      const candidates = thumbCandidatesOf ? thumbCandidatesOf(moment) : [];
      const thumb = candidates[0] || treeMomentThumb(moment);
      let thumbNode = null;
      if (thumb) {
        thumbNode = document.createElement('img');
        thumbNode.className = 'cleanup-moment-thumb';
        thumbNode.alt = '';
        thumbNode.loading = 'lazy';
        thumbNode.referrerPolicy = 'no-referrer';
        thumbNode.src = thumb;
        if (candidates.length) {
          const tone = emotionToneOf(moment.emotion);
          thumbNode.setAttribute('data-lt-candidates', JSON.stringify(candidates));
          thumbNode.setAttribute('data-lt-cand-index', '0');
          thumbNode.setAttribute('data-lt-fallback-mode', 'thumb-slot');
          thumbNode.setAttribute('data-lt-fallback-html', `<span class="lt-thumb-tone" data-tone="${tone}" aria-hidden="true"></span>`);
        }
      }
      // 썸네일이 없으면 그 자리를 비운다(#798 목록 규칙 — 빈 네모를 따로 두지 않는다).
      label.setAttribute('data-lt-moment-row', '');
      const text = document.createElement('span');
      const title = momentTitle(moment);
      // 빈 값 대체: 영상(미디어 메타데이터 또는 영상 주소)이면 "제목 없는 영상", 아니면 "제목 없는 순간" — 흐린 글자.
      const looksLikeVideo=()=>{
        if(moment.mediaMetadata) return true;
        try{
          const host=new URL(String(moment.url||'')).hostname.replace(/^www\./,'');
          return host==='youtu.be'||host.endsWith('youtube.com')||host==='vimeo.com';
        }catch{return /youtu\.be|youtube\.com|vimeo\.com/i.test(String(moment.url||''));}
      };
      const fallbackInfo = (!title && fallbackCardOf) ? fallbackCardOf(moment) : null;
      const blankCopy = fallbackInfo
        ? [fallbackInfo.siteName, fallbackInfo.date, fallbackInfo.emotion].filter(Boolean).join(' · ')
        : (looksLikeVideo() ? '제목 없는 영상' : '제목 없는 순간');
      text.textContent = moment.parentId === null && title ? `${title} · 시작 순간` : (title || blankCopy || (looksLikeVideo() ? '제목 없는 영상' : '제목 없는 순간'));
      if(!title) text.classList.add('is-blank');
      label.append(box);
      if (thumbNode) label.append(thumbNode);
      label.append(text);
      if (candidates.length) {
        const unavailable = document.createElement('small');
        unavailable.className = 'lt-row-unavailable';
        unavailable.setAttribute('data-lt-row-unavailable', '');
        unavailable.hidden = true;
        unavailable.textContent = unavailableLabel;
        label.append(unavailable);
      }
      if (fallbackInfo && fallbackInfo.canAddTitle && moment.id) {
        const editBtn = document.createElement('span');
        editBtn.className = 'lt-fallback-action';
        editBtn.setAttribute('role', 'button');
        editBtn.setAttribute('tabindex', '0');
        editBtn.setAttribute('data-lt-title-edit', moment.id);
        editBtn.setAttribute('data-lt-tree-id', tree.id);
        editBtn.textContent = addTitleLabel;
        label.append(editBtn);
      }
      host.append(label);
    }
  }
  function renderTargets(tree) {
    const select = $('cleanup-target');
    const targets = cleanupTargets(getTrees(), tree.id);
    select.replaceChildren();
    if (!targets.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '옮길 트리가 아직 없어요';
      select.append(option);
    }
    for (const target of targets) {
      const option = document.createElement('option');
      option.value = target.id;
      option.textContent = target.label;
      select.append(option);
    }
    $('cleanup-move-box').hidden = !targets.length;
    // 아래 고정 줄에 옮기기 단추를 두었으므로 대상이 없으면 단추도 함께 숨긴다.
    $('cleanup-move').hidden = !targets.length;
  }
  function pickedIds() {
    return [...$('cleanup-moments').querySelectorAll('input:checked')].map(box => box.value);
  }
  // #480 M8: 쓰다 만 입력 = 창을 열 때와 달라진 것. 새 트리 이름을 적었거나, 순간 고름이 바뀌었거나,
  // 옮길 트리를 바꿨을 때다. 이름 칸만 보면 미리 골라진 순간을 놓치고, 고름만 보면 이름을 놓친다.
  function readState() {
    return {
      picked: pickedIds().slice().sort().join(','),
      name: $('cleanup-new-name').value.trim(),
      target: $('cleanup-target')?.value || ''
    };
  }
  function dirty() {
    const now = readState();
    return now.picked !== baseState.picked || now.name !== baseState.name || now.target !== baseState.target;
  }
  function sync() {
    const target = $('cleanup-target');
    const state = cleanupState({
      selectedIds: pickedIds(),
      newTreeName: $('cleanup-new-name').value,
      targetId: target.value,
      targetLabel: target.selectedOptions[0]?.textContent || ''
    });
    $('cleanup-count').textContent = state.count ? `${state.count}개를 골랐어요.` : '아직 고르지 않았어요.';
    const create = $('cleanup-create');
    create.textContent = state.createLabel;
    create.disabled = !state.canCreate;
    const move = $('cleanup-move');
    move.textContent = state.moveLabel;
    move.disabled = !state.canMove;
  }
  function fail(error) {
    $('cleanup-error').textContent = error?.message || '정리하지 못했어요. 다시 시도해 주세요.';
  }
  function onCreate() {
    const name = $('cleanup-new-name').value.trim();
    const state = cleanupState({ selectedIds: pickedIds(), newTreeName: name });
    if (!state.canCreate) return;
    try {
      const made = getMember().apply('treeFromMoments', { momentIds: pickedIds(), subject: name }, { treeId: fromTreeId });
      finish({ treeId: made.treeId, targetLabel: name, isNew: true });
    } catch (error) { fail(error); }
  }
  function onMove() {
    const target = $('cleanup-target');
    const targetId = target.value;
    const state = cleanupState({ selectedIds: pickedIds(), targetId, targetLabel: target.selectedOptions[0]?.textContent || '' });
    if (!state.canMove) return;
    try {
      for (const momentId of pickedIds()) {
        getMember().apply('moveMoment', { toTreeId: targetId }, { treeId: fromTreeId, momentId });
      }
      finish({ treeId: targetId, targetLabel: target.selectedOptions[0]?.textContent || '', isNew: false });
    } catch (error) { fail(error); }
  }
  // 적용 뒤 셸은 결과 트리로 옮겨 간다(member-session 규칙). 정리 흐름에서는 원래 트리에 머문다(트리가 남아 있을 때).
  function finish({ treeId, targetLabel, isNew }) {
    // #480 M8: 일을 마쳤으니 '쓰다 만 입력'을 지운다 — 여기서 닫을 때는 묻지 않는다.
    baseState = readState();
    $('cleanup-panel').close();
    const stillThere = getTrees().some(t => t.id === fromTreeId);
    if (stillThere && window.LT41?.tree?.id !== fromTreeId) choose(fromTreeId);
    const notice = movedNotice({ targetLabel, isNew });
    $('move-message').textContent = notice.text;
    const actions = $('move-actions');
    actions.replaceChildren();
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = notice.action;
    button.onclick = () => { hideMoveNotice(); choose(treeId); };
    actions.append(button);
    $('move-feedback').hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(hideMoveNotice, 8000);
    notify(notice.text);
  }
  // #644 1: 순간 상세의 '다른 트리로 옮기기' — 트리 목록에서 고르면 바로 옮긴다.
  // 트리가 하나뿐이면(옮길 대상이 없으면) 목록 대신 기존 정리 창('새 트리 만들어 옮기기', treeFromMoments)을 연다.
  function openMove({ momentId = '' } = {}) {
    if (!openAvailable()) { notify('내 기록을 불러온 뒤 옮길 수 있어요.'); return false; }
    const tree = window.LT41?.tree;
    if (!tree) { notify('트리를 먼저 불러와 주세요.'); return false; }
    if (!tree.moments.some(m => m.id === momentId)) { notify('이 순간을 찾을 수 없어요.'); return false; }
    const targets = cleanupTargets(getTrees(), tree.id);
    if (!targets.length) return open({ momentId });
    renderMovePicker(tree, momentId, targets);
    panel('move-picker');
    return true;
  }
  // 되돌리기에 쓰는 원래 자리: 원래 트리·원래 부모. 옮기기(moveMoment)는 링크·연결 이유를 비우고
  // 대상 트리 맨 뒤에 붙이므로, 되돌리기는 원래 트리의 원래 부모 아래로 다시 옮기는 길(moveMoment)뿐이다.
  let moveUndo = null;
  function renderMovePicker(tree, momentId, targets) {
    const host = $('move-picker-list');
    host.replaceChildren();
    for (const target of targets) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'move-picker-item';
      button.textContent = target.label;
      button.addEventListener('click', () => { $('move-picker').close(); moveNow(tree, momentId, target); });
      host.append(button);
    }
    $('move-picker-error').textContent = '';
  }
  function moveNow(tree, momentId, target) {
    const original = tree.moments.find(m => m.id === momentId);
    moveUndo = { fromTreeId: tree.id, momentId, parentId: original?.parentId ?? null, toTreeId: target.id, targetLabel: target.label };
    try {
      getMember().apply('moveMoment', { toTreeId: target.id }, { treeId: tree.id, momentId });
    } catch (error) {
      moveUndo = null;
      notify(error?.message || '옮기지 못했어요. 다시 시도해 주세요.');
      return;
    }
    // 적용 뒤 셸은 결과 트리로 옮겨 간다(member-session 규칙) — 옮겨진 자리를 바로 보여 준다.
    choose(target.id, momentId);
    showMoveNotice();
  }
  function showMoveNotice() {
    const undo = moveUndo;
    if (!undo) return;
    // 원래 트리가 사라졌으면(옮긴 뒤 비어 지워진 트리) 되돌릴 길이 없다 — 안내만 보인다.
    const canUndo = getTrees().some(t => t.id === undo.fromTreeId);
    const notice = movedNotice({ targetLabel: undo.targetLabel, action: canUndo ? '되돌리기' : '' });
    $('move-message').textContent = notice.text;
    const actions = $('move-actions');
    actions.replaceChildren();
    if (notice.action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = notice.action;
      button.onclick = onUndoMove;
      actions.append(button);
    }
    $('move-feedback').hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(hideMoveNotice, 8000);
    notify(notice.text);
  }
  function onUndoMove() {
    const undo = moveUndo;
    if (!undo) { hideMoveNotice(); return; }
    const targetStillHas = getTrees().some(t => t.id === undo.toTreeId && t.moments.some(m => m.id === undo.momentId));
    const fromStillThere = getTrees().some(t => t.id === undo.fromTreeId);
    if (!targetStillHas || !fromStillThere) { hideMoveNotice(); return; }
    try {
      getMember().apply('moveMoment', { toTreeId: undo.fromTreeId, parentId: undo.parentId || undefined }, { treeId: undo.toTreeId, momentId: undo.momentId }, {moment:true});
    } catch (error) {
      notify(error?.message || '되돌리지 못했어요. 다시 시도해 주세요.');
      return;
    }
    moveUndo = null;
    hideMoveNotice();
  }
  function hideMoveNotice() {
    clearTimeout(noticeTimer);
    $('move-feedback').hidden = true;
  }
  $('cleanup-new-name').addEventListener('input', sync);
  $('cleanup-target').addEventListener('change', sync);
  $('cleanup-create').addEventListener('click', onCreate);
  $('cleanup-move').addEventListener('click', onMove);
  return { open, openMove, sync, dirty, headerAvailable, hideMoveNotice, pickerLabel };
}
