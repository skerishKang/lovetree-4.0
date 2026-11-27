// #327 2부: 모아둔 순간 정리 창. 계산은 inbox-model.mjs 한 벌을 쓰고, 여기서는 읽기·그리기·적용만 한다.
// 저장은 기존 member.apply 한 길이다 — 새 트리는 'treeFromMoments', 옮기기·복사하기는 'organizeMoments'(#1439),
// 그 되돌리기는 'undoOrganize'. 같은 순간 판정은 quick-intake 한 벌(#876·#1439), 안내 시간은 공통 타이머(#1273).
import { cleanupState, cleanupTargets, cleanupAvailable, moveAvailable, isInboxTree, pickerLabel, movedNotice, organizedNotice } from '../inbox-model.mjs';
import { duplicatesByTree, sameMomentNoun } from '../quick-intake.mjs';
import { recentVideoFallbackMarkup, isVideoMoment } from '../thumb-fallback.mjs';
import '../toast-timer.js';

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
  // #1439: '이미 있음'을 물어볼 창(#876 같은 영상 안내 창을 같이 쓴다). 없으면 묻지 않고 넣는다(막지 않는다).
  const sameMoment = deps.sameMoment || null;
  // #1273 9번 공통 타이머: 단추 있는 안내는 8초, 마우스·초점이 안내 안에 있으면 멈춘다.
  // 셸 안내 줄의 단추 없는 안내도 예전부터 8초였으므로 같은 시간을 쓴다.
  const toastApi = globalThis.LTToastTimer || globalThis.window?.LTToastTimer || null;
  const noticeTimer = toastApi ? toastApi.createToastTimer() : null;
  const NOTICE_MS = toastApi?.ACTION_TOAST_MS || 8000;
  let fallbackTimer = null;
  let targetRows = [];
  let busy = false;
  let cards = false, cardMode = 'move', targetPage = false, newTarget = false;
  const narrow = () => matchMedia('(max-width: 700px), (pointer: coarse)').matches;
  const dialog = () => $('cleanup-panel');
  let backButton, newButton, copyFinish, localNotice, localMessage, localActions;
  function initCards() {
    if (backButton) return;
    const button = (id, text, action) => {
      const b = document.createElement('button'); b.type = 'button'; b.id = id; b.textContent = text; b.onclick = action; return b;
    };
    backButton = button('cleanup-back', '← 순간 목록', () => showTargets(false));
    $('cleanup-move-box').prepend(backButton);
    newButton = button('cleanup-new-card', '+ 새 트리', () => {
      newTarget = true; $('cleanup-create-box').hidden = false; $('cleanup-new-name').focus();
    });
    copyFinish = button('cleanup-copy-finish', '복사하기', () => onOrganize('copy', newTarget ? $('cleanup-new-name').value.trim() : ''));
    copyFinish.className = 'primary'; dialog().querySelector('.panel-foot').append(copyFinish);
    localNotice = document.createElement('div'); localNotice.className = 'cleanup-local-notice'; localNotice.hidden = true;
    localNotice.setAttribute('role','status');
    localMessage = document.createElement('span'); localActions = document.createElement('div');
    localNotice.append(localMessage, localActions); dialog().append(localNotice);
    dialog().addEventListener('cleanup-back', () => showTargets(false));
    dialog().addEventListener('close', () => { targetPage = false; dialog().removeAttribute('data-target-page'); });
    dialog().addEventListener('cancel', e => { if (cards && targetPage) { e.preventDefault(); e.stopImmediatePropagation(); showTargets(false); } }, true);
  }
  function showTargets(on) {
    targetPage = on;
    dialog().toggleAttribute('data-target-page', on);
    if (!on) { newTarget = false; $('cleanup-new-name').value = ''; for (const row of targetRows) row.box.checked = false; }
    sync();
    if (on) backButton.focus(); else $('cleanup-move').focus();
  }
  function selectCard(mode) {
    if (!pickedIds().length) return;
    cardMode = mode; newTarget = false; $('cleanup-new-name').value = '';
    for (const row of targetRows) row.box.checked = false;
    if (narrow()) showTargets(true); else sync();
  }
  function cardMove(id) {
    if (!cards || busy || !pickedIds().length) return;
    cardMode = 'move'; newTarget = false;
    for (const row of targetRows) row.box.checked = row.id === id;
    onOrganize('move');
  }
  function syncCards() {
    if (!backButton) return;
    backButton.hidden = !cards || !targetPage;
    copyFinish.hidden = !cards || cardMode !== 'copy' || (narrow() && !targetPage);
    newButton.hidden = !cards;
    if (!cards) return;
    const count = pickedIds().length;
    $('cleanup-count').textContent = count + '개 고름';
    $('cleanup-create-box').hidden = !newTarget;
    $('cleanup-create').hidden = !newTarget;
    $('cleanup-create').disabled = busy || !count || !$('cleanup-new-name').value.trim();
    $('cleanup-move-box').hidden = narrow() && !targetPage && targetRows.length > 0;
    $('cleanup-pick').hidden = targetPage;
    $('cleanup-desc').hidden = targetPage;
    $('cleanup-move').hidden = targetPage;
    $('cleanup-copy').hidden = targetPage;
    $('cleanup-move').textContent = '옮기기'; $('cleanup-copy').textContent = '복사하기';
    $('cleanup-move').disabled = $('cleanup-copy').disabled = busy || !count;
    copyFinish.disabled = busy || !count || (!pickedTargets().length && !(newTarget && $('cleanup-new-name').value.trim()));
    newButton.disabled = busy || !count;
    $('cleanup-target-hint').textContent = targetPage ? '순간 '+count+'개를 어디로 '+(cardMode==='copy'?'복사할까요?':'옮길까요?') : cardMode==='copy'?'복사할 트리를 골라 주세요.':'순간을 고른 뒤 트리 카드로 끌거나 눌러 주세요.';
    for (const row of targetRows) { row.box.hidden = cardMode !== 'copy'; row.box.disabled = busy || !count; row.card.disabled = busy || !count; row.card.hidden = cardMode === 'copy'; }
  }
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
    cards = globalThis.LT41_THEME_REGISTRY?.readCleanupView() === 'cards';
    if (cards) initCards();
    if (backButton) {
      cardMode = 'move'; targetPage = false; newTarget = false;
      dialog().toggleAttribute('data-cleanup-cards', cards);
      dialog().removeAttribute('data-target-page');
      $('cleanup-pick').hidden = $('cleanup-desc').hidden = $('cleanup-create-box').hidden = $('cleanup-create').hidden = false;
      localNotice.hidden = true;
    }
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
        const slot = document.createElement('span');
        slot.className = 'cleanup-moment-thumb-slot';
        thumbNode = document.createElement('img');
        thumbNode.className = 'cleanup-moment-thumb';
        thumbNode.alt = '';
        thumbNode.loading = 'lazy';
        thumbNode.referrerPolicy = 'no-referrer';
        const tone = emotionToneOf(moment.emotion);
        const fallbackHtml = isVideoMoment(moment)
          ? recentVideoFallbackMarkup(moment)
          : `<span class="lt-thumb-tone" data-tone="${tone}" aria-hidden="true"></span>`;
        thumbNode.setAttribute('data-lt-candidates', JSON.stringify(candidates.length ? candidates : [thumb]));
        thumbNode.setAttribute('data-lt-cand-index', '0');
        thumbNode.setAttribute('data-lt-fallback-mode', 'thumb-slot');
        thumbNode.setAttribute('data-lt-fallback-html', fallbackHtml);
        thumbNode.src = thumb;
        slot.append(thumbNode);
        thumbNode = slot;
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
      if (cards && !narrow()) {
        label.draggable = true;
        label.addEventListener('dragstart', e => {
          if (busy || narrow()) { e.preventDefault(); return; }
          if (!box.checked) { for (const b of host.querySelectorAll('input')) b.checked = b === box; }
          sync(); e.dataTransfer.setData('text/plain','cleanup'); e.dataTransfer.effectAllowed = 'move';
        });
      }
      host.append(label);
    }
  }
  // #1439: 대상 트리는 고르기 칸 목록이다(예전 드롭다운). 옮기기는 하나만, 복사하기는 여러 개를 고른다.
  // 고른 순간이 이미 들어 있는 트리에는 '이미 있음'을 미리 붙인다(sync가 고를 때마다 다시 센다).
  function renderTargets(tree) {
    const host = $('cleanup-targets');
    const targets = cleanupTargets(getTrees(), tree.id);
    host.replaceChildren();
    targetRows = [];
    if (cards) host.append(newButton);
    for (const target of targets) {
      const label = document.createElement('label');
      label.className = 'cleanup-moment cleanup-target';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = target.id;
      box.checked = false;
      box.addEventListener('change', sync);
      const text = document.createElement('span');
      text.textContent = target.label;
      const badge = document.createElement('small');
      badge.className = 'cleanup-dup';
      badge.setAttribute('data-lt-dup', '');
      badge.hidden = true;
      badge.textContent = '이미 있음';
      label.append(box, text, badge);
      host.append(label);
      let card;
      if (cards) {
        card = document.createElement('button'); card.type = 'button'; card.className = 'cleanup-card-action';
        const tree = getTrees().find(t => t.id === target.id);
        const cover = document.createElement('span'); cover.className = 'cleanup-tree-cover'; cover.setAttribute('aria-hidden','true');
        const moment = tree?.moments.find(m => m.id === tree.coverMomentId) || tree?.moments[0];
        const thumb = moment && treeMomentThumb(moment);
        if (thumb) { const img = document.createElement('img'); img.src = thumb; img.alt = ''; img.referrerPolicy = 'no-referrer'; cover.append(img); }
        else cover.textContent = '❧';
        const info = document.createElement('span'); info.textContent = (tree?.subject || target.label) + ' · 순간 ' + (tree?.moments.length || 0) + '개';
        text.replaceChildren(cover,info);
        card.textContent = '옮기기'; card.setAttribute('aria-label', target.label+'에 옮기기');
        card.onclick = () => cardMove(target.id);
        label.append(card);
        label.addEventListener('click', e => { if (cardMode === 'move' && e.target !== card) { e.preventDefault(); cardMove(target.id); } });
        label.addEventListener('dragover', e => { if (!narrow() && pickedIds().length && e.dataTransfer.types.includes('text/plain')) { e.preventDefault(); label.classList.add('cleanup-drop-hot'); } });
        label.addEventListener('dragleave', () => label.classList.remove('cleanup-drop-hot'));
        label.addEventListener('drop', e => { e.preventDefault(); label.classList.remove('cleanup-drop-hot'); if (!narrow() && e.dataTransfer.getData('text/plain') === 'cleanup') cardMove(target.id); });
      }
      targetRows.push({ id: target.id, label: target.label, box, badge, card });
    }
    $('cleanup-move-box').hidden = false;
    const empty = $('cleanup-target-empty');
    if (empty) empty.hidden = targets.length > 0;
    // 아래 고정 줄에 옮기기·복사하기 단추를 두었으므로 대상이 없으면 단추도 함께 숨긴다.
    $('cleanup-move').hidden = !targets.length;
    $('cleanup-copy').hidden = !targets.length;
  }
  function pickedIds() {
    return [...$('cleanup-moments').querySelectorAll('input:checked')].map(box => box.value);
  }
  function pickedTargets() {
    return targetRows.filter(row => row.box.checked);
  }
  function pickedMoments() {
    const tree = getTrees().find(t => t.id === fromTreeId) || window.LT41?.tree;
    const ids = new Set(pickedIds());
    return (tree?.moments || []).filter(m => ids.has(m.id));
  }
  // #480 M8: 쓰다 만 입력 = 창을 열 때와 달라진 것. 새 트리 이름을 적었거나, 순간 고름이 바뀌었거나,
  // 옮길 트리를 바꿨을 때다. 이름 칸만 보면 미리 골라진 순간을 놓치고, 고름만 보면 이름을 놓친다.
  function readState() {
    return {
      picked: pickedIds().slice().sort().join(','),
      name: $('cleanup-new-name').value.trim(),
      target: pickedTargets().map(row => row.id).sort().join(',')
    };
  }
  function dirty() {
    const now = readState();
    return now.picked !== baseState.picked || now.name !== baseState.name || now.target !== baseState.target;
  }
  function sync() {
    const targets = pickedTargets();
    const state = cleanupState({
      selectedIds: pickedIds(),
      newTreeName: $('cleanup-new-name').value,
      targetIds: targets.map(row => row.id),
      targetLabels: targets.map(row => row.label)
    });
    $('cleanup-count').textContent = state.count ? `${state.count}개를 골랐어요.` : '아직 고르지 않았어요.';
    const create = $('cleanup-create');
    create.textContent = state.createLabel;
    create.setAttribute?.('aria-label', '고른 순간으로 새 트리 만들기');
    create.disabled = busy || !state.canCreate;
    const move = $('cleanup-move');
    move.textContent = state.moveLabel;
    move.setAttribute?.('aria-label', state.canMove ? state.moveLabel : '옮길 순간과 대상 트리를 골라 주세요');
    move.disabled = busy || !state.canMove;
    const copy = $('cleanup-copy');
    copy.textContent = state.copyLabel;
    copy.setAttribute?.('aria-label', state.canCopy ? state.copyLabel : '복사할 순간과 대상 트리를 골라 주세요');
    copy.disabled = busy || !state.canCopy;
    $('cleanup-target-hint').textContent = state.targetHint || '옮기기는 트리 하나, 복사하기는 여러 트리를 고를 수 있어요.';
    // '이미 있음': 고른 순간 중 같은 순간이 그 트리에 이미 있으면 붙인다(여러 개 중 일부면 그 수).
    const moments = pickedMoments();
    const dup = new Map(duplicatesByTree(getTrees(), moments, targetRows.map(row => row.id)).map(item => [item.treeId, item.momentIds.length]));
    for (const row of targetRows) {
      const n = dup.get(row.id) || 0;
      row.badge.hidden = !n;
      row.badge.textContent = n && moments.length > 1 && n < moments.length ? `이미 있음 ${n}개` : '이미 있음';
    }
    syncCards();
  }
  function fail(error) {
    $('cleanup-error').textContent = error?.message || '정리하지 못했어요. 다시 시도해 주세요.';
  }
  function onCreate() {
    const name = $('cleanup-new-name').value.trim();
    const state = cleanupState({ selectedIds: pickedIds(), newTreeName: name });
    if (!state.canCreate) return;
    if (cards) { onOrganize(cardMode, name); return; }
    try {
      const made = getMember().apply('treeFromMoments', { momentIds: pickedIds(), subject: name }, { treeId: fromTreeId });
      finish({ treeId: made.treeId, targetLabel: name, isNew: true });
    } catch (error) { fail(error); }
  }
  // #1439: 같은 순간이 이미 있는 트리마다 한 번 묻는다 — 그래도 넣기 / 건너뛰기(그 트리에 이미 있는 순간만 뺀다).
  // ×·Esc로 닫으면 이번 옮기기·복사하기를 하지 않는다(고른 것은 창에 그대로 남는다).
  function askSame({ treeLabel, momentIds, moments }) {
    if (!sameMoment) return Promise.resolve('put');
    const dupMoments = moments.filter(m => momentIds.includes(m.id));
    const nouns = new Set(dupMoments.map(sameMomentNoun));
    const noun = nouns.size === 1 ? [...nouns][0] : '순간';
    const detail = moments.length > 1 ? `'${treeLabel}' 트리 · 고른 ${moments.length}개 중 ${momentIds.length}개가 이미 있어요.` : `'${treeLabel}' 트리에 이미 있어요.`;
    return new Promise(resolve => {
      let settled = false;
      const answer = value => { if (!settled) { settled = true; resolve(value); } };
      Promise.resolve().then(() => sameMoment.open({
        eyebrow: '순간 정리', noun, detail, showView: false,
        onContinue: () => answer('put'), onSkip: () => answer('skip'), onCancel: () => answer('cancel')
      })).catch(() => answer('put'));
    });
  }
  async function onOrganize(mode, newTreeName = '') {
    if (busy) return;
    const targets = newTreeName && mode === 'move' ? [] : pickedTargets();
    const ids = pickedIds();
    const state = cleanupState({ selectedIds: ids, targetIds: targets.map(row => row.id), targetLabels: targets.map(row => row.label) });
    if (!newTreeName && (mode === 'move' ? !state.canMove : !state.canCopy)) return;
    $('cleanup-error').textContent = '';
    const moments = pickedMoments();
    const plan = duplicatesByTree(getTrees(), moments, targets.map(row => row.id));
    const skip = {};
    if (plan.length) {
      busy = true; sync();
      try {
        for (const item of plan) {
          const row = targets.find(r => r.id === item.treeId);
          const answer = await askSame({ treeLabel: row?.label || '', momentIds: item.momentIds, moments });
          if (answer === 'cancel') return;
          if (answer === 'skip') skip[item.treeId] = item.momentIds;
        }
      } finally { busy = false; sync(); }
    }
    const placed = targets.reduce((n, row) => n + ids.filter(id => !(skip[row.id] || []).includes(id)).length, 0);
    if (!placed && !newTreeName) { $('cleanup-error').textContent = '모두 이미 있는 순간이라 건너뛰었어요. 바뀐 것이 없어요.'; return; }
    // 정리 결과를 셸이 다시 그리는 동안 이 창을 '쓰다 만 입력'으로 붙잡지 않는다(실패하면 되돌린다).
    const savedBase = baseState;
    baseState = readState();
    const toTreeIds = targets.map(row => row.id);
    // 지금 보고 있는 트리가 바뀌지 않으면(복사는 원래 트리를 고치지 않는다) 화면을 다시 띄우지 않고 모델만 고친다.
    const meta = mode === 'copy' && !toTreeIds.includes(window.LT41?.tree?.id) ? { tree: true } : undefined;
    let result;
    try {
      if (cards) deps.holdPanel?.('cleanup-panel', true);
      result = getMember().apply('organizeMoments', { mode, momentIds: ids, toTreeIds, skip, ...(newTreeName ? { newTreeName } : {}) }, { treeId: fromTreeId }, meta);
    } catch (error) { baseState = savedBase; fail(error); return; } finally { if (cards) deps.holdPanel?.('cleanup-panel', false); }
    finishOrganize({ mode, result, labels: [...targets.map(row => row.label), ...(newTreeName ? [newTreeName] : [])] });
  }
  function finishOrganize({ mode, result, labels }) {
    baseState = readState();
    if (!cards) $('cleanup-panel').close();
    const stillThere = getTrees().some(t => t.id === fromTreeId);
    if (stillThere && window.LT41?.tree?.id !== fromTreeId) choose(fromTreeId);
    if (cards) {
      const source = getTrees().find(t => t.id === fromTreeId) || { id: fromTreeId, moments: [] };
      cardMode = 'move'; showTargets(false); renderMoments(source); renderTargets(source); sync(); baseState = readState();
    }
    const summary = result?.summary || {};
    organizeUndo = result?.record ? { record: result.record, mode } : null;
    const notice = organizedNotice({ mode, targetLabels: labels, count: summary.moments || 0, skipped: summary.skipped || 0, action: organizeUndo ? '되돌리기' : '' });
    showNotice(notice.text, notice.action ? [{ label: notice.action, onClick: onUndoOrganize }] : []);
  }
  let organizeUndo = null;
  function onUndoOrganize() {
    const undo = organizeUndo;
    if (!undo) { hideMoveNotice(); return; }
    const record = undo.record;
    const touched = undo.mode === 'copy' ? record.toTreeIds : [record.fromTreeId, ...record.toTreeIds];
    const meta = undo.mode === 'copy' && !touched.includes(window.LT41?.tree?.id) ? { tree: true } : undefined;
    try {
      if (cards) deps.holdPanel?.('cleanup-panel', true);
      getMember().apply('undoOrganize', { record }, { treeId: record.fromTreeId }, meta);
    } catch (error) {
      notify(error?.message || '되돌리지 못했어요. 다시 시도해 주세요.');
      return;
    } finally { if (cards) deps.holdPanel?.('cleanup-panel', false); }
    if (cards && dialog().open) {
      const source = getTrees().find(t => t.id === record.fromTreeId);
      if (source) { renderMoments(source); renderTargets(source); sync(); baseState = readState(); }
    }
    organizeUndo = null;
    hideMoveNotice();
    notify(undo.mode === 'copy' ? '복사한 순간을 거뒀어요.' : '옮긴 순간을 원래 자리로 돌렸어요.');
  }
  // 셸 위쪽 안내 줄(#move-feedback) 한 벌 — 글과 단추를 그리고 공통 타이머로 거둔다.
  function showNotice(text, actions = []) {
    $('move-message').textContent = text;
    const inside = cards && dialog().open;
    if (inside) localMessage.textContent = text;
    const host = inside ? localActions : $('move-actions');
    host.replaceChildren();
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      button.onclick = action.onClick;
      host.append(button);
    }
    const bar = inside ? localNotice : $('move-feedback');
    bar.hidden = false;
    if (noticeTimer) noticeTimer.arm(bar, NOTICE_MS, hideMoveNotice);
    else { clearTimeout(fallbackTimer); fallbackTimer = setTimeout(hideMoveNotice, NOTICE_MS); }
    notify(text);
  }
  // 적용 뒤 셸은 결과 트리로 옮겨 간다(member-session 규칙). 정리 흐름에서는 원래 트리에 머문다(트리가 남아 있을 때).
  function finish({ treeId, targetLabel, isNew }) {
    // #480 M8: 일을 마쳤으니 '쓰다 만 입력'을 지운다 — 여기서 닫을 때는 묻지 않는다.
    baseState = readState();
    $('cleanup-panel').close();
    const stillThere = getTrees().some(t => t.id === fromTreeId);
    if (stillThere && window.LT41?.tree?.id !== fromTreeId) choose(fromTreeId);
    const notice = movedNotice({ targetLabel, isNew });
    showNotice(notice.text, [{ label: notice.action, onClick: () => { hideMoveNotice(); choose(treeId); } }]);
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
      if (getTrees().find(t => t.id === target.id)?.moments.length === 0) {
        const result = getMember().apply('organizeMoments', { mode: 'move', momentIds: [momentId], toTreeIds: [target.id] }, { treeId: tree.id });
        moveUndo.record = result.record;
      } else {
        getMember().apply('moveMoment', { toTreeId: target.id }, { treeId: tree.id, momentId });
      }
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
    const canUndo = !!undo.record || getTrees().some(t => t.id === undo.fromTreeId);
    const notice = movedNotice({ targetLabel: undo.targetLabel, action: canUndo ? '되돌리기' : '' });
    showNotice(notice.text, notice.action ? [{ label: notice.action, onClick: onUndoMove }] : []);
  }
  function onUndoMove() {
    const undo = moveUndo;
    if (!undo) { hideMoveNotice(); return; }
    const targetStillHas = getTrees().some(t => t.id === undo.toTreeId && t.moments.some(m => m.id === undo.momentId));
    const fromStillThere = getTrees().some(t => t.id === undo.fromTreeId);
    if (!undo.record && (!targetStillHas || !fromStillThere)) { hideMoveNotice(); return; }
    try {
      if (undo.record) {
        getMember().apply('undoOrganize', { record: undo.record }, { treeId: undo.fromTreeId });
        choose(undo.fromTreeId, undo.momentId);
      } else {
        getMember().apply('moveMoment', { toTreeId: undo.fromTreeId, parentId: undo.parentId || undefined }, { treeId: undo.toTreeId, momentId: undo.momentId }, {moment:true});
      }
    } catch (error) {
      notify(error?.message || '되돌리지 못했어요. 다시 시도해 주세요.');
      return;
    }
    moveUndo = null;
    hideMoveNotice();
  }
  function hideMoveNotice() {
    noticeTimer?.cancel();
    clearTimeout(fallbackTimer);
    $('move-feedback').hidden = true;
    if (localNotice) localNotice.hidden = true;
  }
  $('cleanup-new-name').addEventListener('input', sync);
  $('cleanup-create').addEventListener('click', onCreate);
  $('cleanup-move').addEventListener('click', () => cards ? selectCard('move') : onOrganize('move'));
  $('cleanup-copy').addEventListener('click', () => cards ? selectCard('copy') : onOrganize('copy'));
  return { open, openMove, sync, dirty, headerAvailable, hideMoveNotice, pickerLabel };
}
