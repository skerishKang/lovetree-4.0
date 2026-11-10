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
  let fromTreeId = '';
  let noticeTimer = null;
  function writable() {
    const snap = getMember()?.snapshot();
    return !!snap?.owned && !!snap?.writable;
  }
  // 헤더 '정리하기'는 모아둔 순간 트리에서만 보인다. 순간 상세의 옮기기는 일반 트리에서도 연다.
  function headerAvailable() {
    return cleanupAvailable({ source: getSource(), owned: !!getMember()?.snapshot().owned, tree: window.LT41?.tree || null });
  }
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
      const thumb = treeMomentThumb(moment);
      let thumbNode = null;
      if (thumb) {
        thumbNode = document.createElement('img');
        thumbNode.className = 'cleanup-moment-thumb';
        thumbNode.alt = '';
        thumbNode.loading = 'lazy';
        thumbNode.referrerPolicy = 'no-referrer';
        thumbNode.src = thumb;
      }
      const text = document.createElement('span');
      const title = momentTitle(moment);
      // 빈 값은 빈 값으로 둔다 — 원시 자동 제목("…에서 간직한 순간")은 화면에 내보내지 않는다.
      text.textContent = moment.parentId === null && title ? `${title} · 시작 순간` : (title||'');
      label.append(box);
      if (thumbNode) label.append(thumbNode);
      label.append(text);
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
  }
  function pickedIds() {
    return [...$('cleanup-moments').querySelectorAll('input:checked')].map(box => box.value);
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
  function hideMoveNotice() {
    clearTimeout(noticeTimer);
    $('move-feedback').hidden = true;
  }
  $('cleanup-new-name').addEventListener('input', sync);
  $('cleanup-target').addEventListener('change', sync);
  $('cleanup-create').addEventListener('click', onCreate);
  $('cleanup-move').addEventListener('click', onMove);
  return { open, sync, headerAvailable, hideMoveNotice, pickerLabel };
}
