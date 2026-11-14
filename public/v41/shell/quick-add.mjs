// 빠른 추가 화면 (#빠른 추가 ②, 2026-11-09 · 디자인 #343, 2026-11-10).
// 판정·문구·추출은 ../quick-add.mjs의 순수 함수가 맡고, 이 파일은 DOM만 만진다(docs/TESTING.md).
// 저장은 로컬1 계약(member.apply('quickAdd', {url}))을 그대로 부른다 — 화면은 이름만 쓴다.
import {mountPrivateUpload} from '../private-upload.mjs';
import {fetchVideoTitle} from '../video-title.mjs';
import {suggestMomentTitle} from '../domain.mjs';
import {displayTreeTitle} from '../tree-name.mjs';
import {extractDropUrl, hasDropPayload, firstImageFile, parseQuickUrl, dropRoute, previewState, previewTag, savedNoticeText, quickTreeLineText, quickSubmitText, quickSavedTreeText, QUICK_INBOX_LABEL, QUICK_EMPTY_ERROR, QUICK_INVALID_ERROR, DROP_LOGIN_NOTICE, DROP_READONLY_NOTICE, QUICK_PASTE_LABEL, QUICK_CLEAR_LABEL, QUICK_EMPTY_PREVIEW, QUICK_INVALID_PREVIEW, QUICK_PASTE_EMPTY, QUICK_PASTE_ERROR} from '../quick-add.mjs';

export function createQuickAdd(deps) {
  const $ = deps.$;
  const doc = deps.document || globalThis.document;
  const describe = deps.describe || (url => globalThis.LTMedia.describe(url));
  const fetchImpl = deps.fetchImpl || ((...args) => globalThis.fetch(...args));
  const attachFiles = deps.attachFiles || defaultAttachFiles;
  const savedTimerBox = {timer: null};
  let titleCache = new Map();
  let previewToken = 0;
  // #638: 담을 트리(고른 트리 우선)와, 저장 뒤에 도착한 영상 제목을 채울 대상 한 개.
  let quickTreeId = '';
  let pendingTitleFill = null;
  const inflightTitles = new Map();

  function snapshot() { return deps.getMember()?.snapshot() || {}; }

  // 진입 가드는 기존 openEditor와 같은 문구·같은 순서다(예시 → 로그인, 읽기 전용 → 안내+설정 "내 데이터").
  function ensureWritable() {
    const member = deps.getMember();
    if (!member?.snapshot().owned) { deps.openLoginStart('new-tree'); return false; }
    // #453 A: 예시를 둘러보는 중이면 내 기록으로 돌아와 같은 창을 열어 준다.
    if (deps.getSource() !== 'server') { deps.resumeMember?.('write'); return false; }
    if (!member.snapshot().writable) { deps.notify(DROP_READONLY_NOTICE); deps.openSettingsData?.(); return false; }
    return true;
  }

  // #425: 입구는 하나다 — 같은 창(write-panel)을 열고, 먼저 보일 탭은 설정값(없으면 쉬운 추가)이 정한다.
  function openWrite() {
    if (!ensureWritable()) return;
    deps.resetEditorBaseline?.();
    deps.writePanel.open();
    renderTreeLine();
  }
  // 쉬운 추가 탭으로 연다(끌어다 놓기·'지금 다듬기'처럼 쉬운 추가로 되돌아오는 길).
  function openQuick() {
    if (!ensureWritable()) return;
    deps.resetEditorBaseline?.();
    deps.writePanel.open('easy');
    renderTreeLine();
  }
  function resetQuick() {
    $('quick-url').value = '';
    renderPreview();
  }

  // 담은 뒤 안내 줄은 한 곳에서만 비운다(새 입력 시작·모달 열기). 지난 안내가 남던 문제(#343)를 여기서 막는다.
  function clearSavedNotice() {
    $('quick-notice').textContent = '';
    $('quick-notice').hidden = true;
    const refineButton = $('quick-refine');
    refineButton.hidden = true;
    refineButton.dataset.treeId = '';
    refineButton.dataset.momentId = '';
  }

  function fallbackTitle(url) {
    try { return suggestMomentTitle({url}) || ''; } catch { return ''; }
  }

  // ---- 담을 트리 한 줄(#638, 고른 트리 우선) ----
  // 트리 목록은 트리 메뉴(renderTreeMenu)와 같은 재료(LT41.trees)와 같은 이름 규칙(displayTreeTitle)을 쓰고,
  // 순서도 같게 inbox('모아둔 순간')를 먼저 놓는다.
  function treeChoices() {
    const trees = deps.listTrees?.() || [];
    return trees.map(tree => ({ id: String(tree?.id || ''), name: displayTreeTitle(String(tree?.title || tree?.subject || '') || '트리'), inbox: tree?.inbox === true })).filter(tree => tree.id);
  }
  function resolveQuickTreeId(choices) {
    const current = String(deps.currentTreeId?.() || '');
    if (current && choices.some(tree => tree.id === current)) return current;
    return (choices.find(tree => tree.inbox) || choices[0])?.id || '';
  }
  function selectedTreeName() {
    const choices = treeChoices();
    const found = choices.find(tree => tree.id === quickTreeId) || choices.find(tree => tree.inbox) || choices[0];
    return found?.name || QUICK_INBOX_LABEL;
  }
  // 담기 창의 트리 한 줄: '○○ 트리에 담겨요' + 그 자리에서 바꾸는 고르기. 트리가 하나뿐(또는 0개)이면
  // 바꿀 것이 없으므로 고르기는 숨긴다. 트리가 0개면 기본 트리('모아둔 순간')가 새로 만들어진다(#638).
  function renderTreeLine() {
    const choices = treeChoices();
    if (!quickTreeId || !choices.some(tree => tree.id === quickTreeId)) quickTreeId = resolveQuickTreeId(choices);
    const name = selectedTreeName();
    const line = $('quick-tree-line');
    if (line) line.textContent = quickTreeLineText(name);
    const submit = $('quick-submit');
    if (submit) submit.textContent = quickSubmitText(name);
    const select = $('quick-tree-select');
    if (!select) return;
    const signature = choices.map(tree => tree.id).join('|');
    if (select.dataset.choices !== signature) {
      select.dataset.choices = signature;
      select.replaceChildren(...choices.map(tree => {
        const option = doc.createElement('option');
        option.value = tree.id;
        option.textContent = tree.name;
        return option;
      }));
    }
    select.value = quickTreeId;
    select.hidden = choices.length < 2;
  }

  // 업로더는 전송이 끝나면 form의 [type=submit]을 무조건 다시 켠다(기존 순간 폼 계약).
  // 사진 저장 뒤 칸이 빈 상태에서도 켜져 '주소 없으면 흐림' 규칙이 깨지므로, 전송이 끝난 다음 한 번 다시 맞춘다.
  function syncSubmitState() {
    const state = previewState(parseQuickUrl($('quick-url').value, describe));
    $('quick-submit').disabled = state !== 'youtube' && state !== 'link';
  }

  // 미리보기 카드: 상태 판정은 previewState, 꼬리표는 previewTag가 정한다(순수 함수).
  // 높이는 CSS가 고정하므로 상태가 바뀌어도 아래 버튼 자리가 움직이지 않는다.
  function renderPreview() {
    const input = $('quick-url');
    const parsed = parseQuickUrl(input.value, describe);
    const token = ++previewToken;
    const preview = $('quick-preview');
    const state = previewState(parsed);
    renderTreeLine();
    preview.replaceChildren();
    preview.dataset.state = state;
    preview.dataset.media = 'no';
    $('quick-paste').textContent = String(input.value ?? '').trim() ? QUICK_CLEAR_LABEL : QUICK_PASTE_LABEL;
    // 레거시 규칙 그대로: 담기 버튼은 저장 가능한 주소일 때만 눌린다(빈 칸·지원 안 함은 흐림).
    $('quick-submit').disabled = state !== 'youtube' && state !== 'link';
    clearSavedNotice();
    $('quick-error').textContent = '';
    if (state === 'empty') {
      const empty = doc.createElement('p');
      empty.className = 'quick-preview-empty';
      empty.textContent = QUICK_EMPTY_PREVIEW;
      preview.append(empty);
      return;
    }
    if (state === 'invalid') {
      const guide = doc.createElement('p');
      guide.className = 'quick-preview-invalid';
      guide.textContent = QUICK_INVALID_PREVIEW;
      preview.append(guide);
      return;
    }
    if (parsed.thumb) {
      const media = doc.createElement('div');
      media.className = 'quick-preview-media';
      const image = doc.createElement('img');
      image.alt = ''; image.referrerPolicy = 'no-referrer'; image.src = parsed.thumb;
      media.append(image);
      preview.append(media);
      preview.dataset.media = 'yes';
    }
    const meta = doc.createElement('div');
    meta.className = 'quick-preview-meta';
    const tag = doc.createElement('span');
    tag.className = 'quick-preview-tag';
    tag.textContent = previewTag(parsed.value, parsed.kind);
    const title = doc.createElement('p');
    title.className = 'quick-preview-title';
    title.textContent = fallbackTitle(parsed.value);
    meta.append(tag, title);
    preview.append(meta);
    if (state === 'youtube') void loadYouTubeTitle(parsed.videoId, title, token);
  }
  // 제목은 기존 서버 oEmbed 프록시에서만 받는다(썸네일이 200이어도 없는 영상일 수 있어 실패는 조용히 넘긴다).
  // 받아 둔 제목은 titleCache에 남고, 저장 시(#344) mediaMetadata.title로 함께 넘어가 자동 제목이 된다.
  // 미리보기 제목과 저장 제목은 같은 값이다 — 못 받았으면 둘 다 기존 규칙(fallbackTitle)으로 물러난다.
  // #638: 같은 영상 제목 요청은 한 번만 보낸다(저장 뒤 채움과 미리보기가 경합해도). 노드가 없는 부름(저장 뒤 채움)도 받는다.
  async function loadYouTubeTitle(videoId, node, token) {
    if (!videoId) return;
    if (titleCache.has(videoId)) { if (node) node.textContent = titleCache.get(videoId); return; }
    let running = inflightTitles.get(videoId);
    if (!running) {
      running = fetchVideoTitle(videoId, fetchImpl).then(title => {
        inflightTitles.delete(videoId);
        if (title) {
          titleCache.set(videoId, title);
          fillPendingTitle(videoId, title);
        }
        return title;
      });
      inflightTitles.set(videoId, running);
    }
    const title = await running;
    if (!title) return;
    if (node && token === previewToken && node.isConnected !== false) node.textContent = title;
  }

  // #638 제목 경합: 제목이 도착하기 전에 담았으면 저장한 순간을 기록해 두었다가, 제목이 도착하면
  // 그 순간의 영상 제목(mediaMetadata)을 채운다. backfillTitles(#347 후속 B)는 mediaMetadata만 채우고
  // title은 건드리지 않으므로 사용자가 직접 쓴 제목은 덮이지 않고, 이 화면에서 방금 담은 순간만 채운다
  // (이미 저장된 다른 순간은 자동으로 고치지 않는다 — 그 길은 기존 title-backfill이 맡는다).
  function fillPendingTitle(videoId, title) {
    const pending = pendingTitleFill;
    if (!pending || pending.videoId !== videoId || !title) return;
    pendingTitleFill = null;
    try {
      deps.getMember().apply('backfillTitles', { items: [{ treeId: pending.treeId, momentId: pending.momentId, url: pending.url, mediaMetadata: { title } }] });
    } catch { /* 저장 연결이 끊겼으면 조용히 둔다 — 다음 불러오기 때 title-backfill이 채운다 */ }
  }

  // 붙여넣기/지우기 알약: 값이 있으면 지우기, 비었으면 클립보드에서 주소를 읽어 넣는다.
  function readClipboardText() {
    if (deps.readClipboard) return Promise.resolve().then(() => deps.readClipboard());
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard?.readText) return Promise.reject(new Error('no-clipboard'));
    return clipboard.readText();
  }
  async function togglePaste() {
    const input = $('quick-url');
    if (String(input.value ?? '').trim()) {
      input.value = '';
      renderPreview();
      input.focus();
      return;
    }
    try {
      const text = String((await readClipboardText()) ?? '').trim();
      if (!text) { deps.notify(QUICK_PASTE_EMPTY); input.focus(); return; }
      input.value = text;
      renderPreview();
      input.focus();
    } catch {
      deps.notify(QUICK_PASTE_ERROR);
      input.focus();
    }
  }

  function submitQuick(event) {
    event?.preventDefault?.();
    const parsed = parseQuickUrl($('quick-url').value, describe);
    if (parsed.status !== 'ok') {
      $('quick-error').textContent = parsed.status === 'empty' ? QUICK_EMPTY_ERROR : QUICK_INVALID_ERROR;
      $('quick-url').focus();
      return;
    }
    saveUrl(parsed.value);
  }

  // 미리보기 때 받아 둔 영상 제목을 저장 입력에 붙인다(#344). 못 받았으면(늦은 응답·oEmbed 실패) 붙이지 않고
  // 기존 도메인 규칙(suggestMomentTitle의 마음 한마디·링크 규칙)으로 물러난다.
  function quickMediaTitle(url) {
    const parsed = parseQuickUrl(url, describe);
    if (parsed.status !== 'ok' || parsed.kind !== 'youtube' || !parsed.videoId) return {};
    const title = titleCache.get(parsed.videoId) || '';
    return title ? { mediaMetadata: { title } } : {};
  }

  // 저장될 제목(안내 줄 요약)은 저장과 같은 규칙·같은 입력으로 계산한다 — 화면과 저장이 어긋나지 않게.
  function savedTitleFor(url) {
    try { return suggestMomentTitle({url, mediaMetadata: quickMediaTitle(url).mediaMetadata}) || ''; } catch { return ''; }
  }

  // 저장 한 번 = member.apply('quickAdd', {url, treeId?, mediaMetadata?}). #638: 지금 고른 트리(quickTreeId)에 담는다 —
  // 트리가 0개거나 고르지 못했으면 treeId를 빼 기존 규칙(기본 트리 생성·inbox)으로 물러난다. 성공하면 칸을 비우고
  // 초점을 유지해 연속 추가가 된다. 칸을 비울 때 renderPreview가 지난 안내를 먼저 지우므로, 안내는 저장 직후 값으로 다시 세운다.
  function saveUrl(url) {
    const parsed = parseQuickUrl(url, describe);
    // #638: 담을 트리는 저장 시점에 정한다 — 창을 열지 않고 끌어다 놓기로 바로 담는 길에서도 지금 고른 트리에 담긴다.
    if (!quickTreeId || !treeChoices().some(tree => tree.id === quickTreeId)) quickTreeId = resolveQuickTreeId(treeChoices());
    const input = { url, ...(quickTreeId ? { treeId: quickTreeId } : {}), ...quickMediaTitle(url) };
    let result = null;
    try { result = deps.getMember().apply('quickAdd', input) || null; }
    catch (error) { $('quick-error').textContent = error.message; return false; }
    // #638 제목 경합: 제목을 못 받은 채 담았으면(저장 제목이 기본 문구로 떨어짐) 저장한 순간을 기록해 두고,
    // 제목이 도착하면 그 순간의 영상 제목을 채운다. 미리보기 때 요청이 이미 달리고 있으면 그 응답이 채운다.
    if (parsed.status === 'ok' && parsed.kind === 'youtube' && parsed.videoId && !titleCache.has(parsed.videoId) && result?.treeId && result?.momentId) {
      pendingTitleFill = { treeId: result.treeId, momentId: result.momentId, videoId: parsed.videoId, url };
      void loadYouTubeTitle(parsed.videoId, null, -1);
    }
    const savedTitle = savedTitleFor(url);
    if ($('write-panel').open) {
      $('quick-url').value = '';
      renderPreview();
      $('quick-url').focus();
    }
    showSaved(url, result, savedTitle);
    return true;
  }

  function canRefine(result) { return !!(result && result.treeId && result.momentId); }
  function setRefineTarget(button, result) {
    button.hidden = !canRefine(result);
    button.dataset.treeId = result?.treeId || '';
    button.dataset.momentId = result?.momentId || '';
  }
  function showSaved(url, result, savedTitle = '') {
    const parsed = parseQuickUrl(url, describe);
    const thumb = parsed.status === 'ok' && parsed.kind === 'youtube' ? parsed.thumb : '';
    if ($('write-panel').open) {
      $('quick-notice').textContent = savedNoticeText(savedTitle);
      $('quick-notice').hidden = false;
      setRefineTarget($('quick-refine'), result);
      return;
    }
    const image = $('quick-saved-thumb');
    if (thumb) { image.src = thumb; image.hidden = false; }
    else { image.removeAttribute('src'); image.hidden = true; }
    // #638: 담은 트리 이름을 따라 안내한다(고른 트리 우선). 이름을 못 찾으면 기존 문구('모아둔 순간에 담았어요').
    $('quick-saved-text').textContent = quickSavedTreeText(selectedTreeName());
    $('quick-saved').hidden = false;
    setRefineTarget($('quick-saved-refine'), result);
    clearTimeout(savedTimerBox.timer);
    savedTimerBox.timer = setTimeout(() => { $('quick-saved').hidden = true; }, 20000);
  }

  function refine(button) {
    const treeId = button.dataset.treeId;
    const momentId = button.dataset.momentId;
    if ($('write-panel').open) deps.requestClose?.('write-panel');
    $('quick-saved').hidden = true;
    if (!treeId || !momentId) { deps.notify('모아둔 순간에서 그 순간을 직접 열어 주세요.'); return; }
    deps.choose(treeId, momentId);
    deps.openEditor('edit');
  }

  // #425 2번: 쉬운 추가 탭에는 사진 올리기가 없다(자세한 추가의 업로더만 쓴다).

  // ---- 끌어다 놓기 (데스크톱 pointer:fine) ----
  const isFinePointer = deps.isFinePointer || (() => globalThis.matchMedia?.('(pointer:fine)').matches === true);
  let veilDepth = 0;
  function routeFor(image) {
    return dropRoute({
      source: deps.getSource(), owned: !!snapshot().owned, writable: !!snapshot().writable,
      quickOpen: !!$('write-panel').open && !$('write-easy').hidden, editorOpen: !!$('write-panel').open && $('write-easy').hidden === true, image
    });
  }
  function showVeil(text) {
    const veil = $('drop-veil');
    if (!text) { veil.hidden = true; return; }
    $('drop-veil-text').textContent = text;
    veil.hidden = false;
  }
  function mountDrop(target) {
    target.addEventListener('dragenter', event => {
      if (!hasDropPayload(event.dataTransfer)) return;
      event.preventDefault();
      veilDepth += 1;
      showVeil(routeFor(!!firstImageFile(event.dataTransfer)).veil);
    });
    target.addEventListener('dragover', event => {
      if (!hasDropPayload(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      if ($('drop-veil').hidden) showVeil(routeFor(!!firstImageFile(event.dataTransfer)).veil);
    });
    target.addEventListener('dragleave', () => {
      veilDepth = Math.max(0, veilDepth - 1);
      if (!veilDepth) showVeil('');
    });
    target.addEventListener('drop', event => {
      veilDepth = 0;
      showVeil('');
      handleDrop(event);
    });
  }
  function editorField() { return $('moment-form')?.elements?.url || null; }
  function feedFiles(input, file) {
    if (!input || !file) return false;
    return attachFiles(input, file);
  }
  function fillEditor(url) {
    const field = editorField();
    if (!field) return;
    field.value = url;
    field.dispatchEvent(new Event('input', {bubbles: true}));
    field.focus?.();
  }
  function setQuickValue(url) {
    $('quick-url').value = url;
    renderPreview();
    $('quick-url').focus();
  }
  function handleDrop(event) {
    const dataTransfer = event?.dataTransfer || null;
    const image = firstImageFile(dataTransfer);
    const route = routeFor(!!image);
    // 공유 모드도 기본 동작(브라우저가 링크를 열어 버리는 것)은 막는다 — 받지는 않는다.
    event?.preventDefault?.();
    if (route.kind === 'ignore') return;
    if (route.kind === 'login') { deps.notify(DROP_LOGIN_NOTICE); return; }
    if (route.kind === 'readonly') { deps.notify(DROP_READONLY_NOTICE); return; }
    if (route.kind === 'photo') {
      // #425 2번: 올린 사진은 자세한 추가에서만 받는다 — 쉬운 추가 탭이 열려 있어도 자세한 추가로 옮긴다.
      deps.openEditor?.('add');
      feedFiles($('moment-form')?.querySelector?.('[data-media-file]'), image);
      return;
    }
    const url = extractDropUrl(dataTransfer);
    if (!url) { deps.notify(QUICK_INVALID_ERROR); return; }
    if (route.kind === 'editor') { fillEditor(url); return; }
    if (route.kind === 'modal') { setQuickValue(url); return; }
    saveUrl(url);
  }

  $('quick-form').onsubmit = submitQuick;
  $('quick-url').addEventListener('input', renderPreview);
  $('quick-paste').onclick = () => { void togglePaste(); };
  // #638: 트리 고르기를 바꾸면 그 자리에서 담을 트리가 바뀐다(문구·단추도 같이).
  $('quick-tree-select')?.addEventListener('change', () => {
    quickTreeId = $('quick-tree-select').value || quickTreeId;
    renderTreeLine();
  });
  $('quick-refine').onclick = () => refine($('quick-refine'));
  $('quick-saved-refine').onclick = () => refine($('quick-saved-refine'));
  // 닫기는 공통 틀(shell/dialogs.mjs)이 초점까지 되돌린다 — 여기서는 따로 만지지 않는다.
  if (isFinePointer()) mountDrop(doc);
  // #462: 끌어다 놓기를 받지 않는 기기(휴대폰·터치)에서는 "여기로 끌어다 놓아도 돼요"를 보이지도 읽어 주지도 않는다.
  else {
    const hint = $('quick-hint');
    if (hint) hint.hidden = true;
    $('quick-url').removeAttribute?.('aria-describedby');
  }

  return {
    openWrite,
    openQuick,
    submitQuick,
    renderPreview,
    renderTreeLine,
    handleDrop,
    togglePaste,
    mountFrame: doc => { if (isFinePointer()) mountDrop(doc); },
    saveUrl,
    refine,
    reset: resetQuick,
    state: () => ({ savedTimer: savedTimerBox.timer, titleCache: titleCache.size, quickTreeId })
  };
}

function defaultAttachFiles(input, file) {
  try {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', {bubbles: true}));
    return true;
  } catch { return false; }
}
