// 빠른 추가 화면 (#빠른 추가 ②, 2026-11-09 · 디자인 #343, 2026-11-10).
// 판정·문구·추출은 ../quick-add.mjs의 순수 함수가 맡고, 이 파일은 DOM만 만진다(docs/TESTING.md).
// 저장은 로컬1 계약(member.apply('quickAdd', {url}))을 그대로 부른다 — 화면은 이름만 쓴다.
import {mountPrivateUpload} from '../private-upload.mjs';
import {fetchVideoTitle} from '../video-title.mjs';
import {suggestMomentTitle} from '../domain.mjs';
import {extractDropUrl, hasDropPayload, firstImageFile, parseQuickUrl, dropRoute, previewState, previewTag, savedNoticeText, QUICK_SAVED_TEXT, QUICK_EMPTY_ERROR, QUICK_INVALID_ERROR, DROP_LOGIN_NOTICE, DROP_READONLY_NOTICE, QUICK_PASTE_LABEL, QUICK_CLEAR_LABEL, QUICK_EMPTY_PREVIEW, QUICK_INVALID_PREVIEW, QUICK_PASTE_EMPTY, QUICK_PASTE_ERROR} from '../quick-add.mjs';

export function createQuickAdd(deps) {
  const $ = deps.$;
  const doc = deps.document || globalThis.document;
  const describe = deps.describe || (url => globalThis.LTMedia.describe(url));
  const fetchImpl = deps.fetchImpl || ((...args) => globalThis.fetch(...args));
  const attachFiles = deps.attachFiles || defaultAttachFiles;
  const savedTimerBox = {timer: null};
  let titleCache = new Map();
  let previewToken = 0;

  function snapshot() { return deps.getMember()?.snapshot() || {}; }

  // 진입 가드는 기존 openEditor와 같은 문구·같은 순서다(예시 → 로그인, 읽기 전용 → 안내+설정 "내 데이터").
  function ensureWritable() {
    const member = deps.getMember();
    if (deps.getSource() !== 'server' || !member?.snapshot().owned) { deps.openLoginStart('new-tree'); return false; }
    if (!member.snapshot().writable) { deps.notify(DROP_READONLY_NOTICE); deps.openSettingsData?.(); return false; }
    return true;
  }

  // #425: 입구는 하나다 — 같은 창(write-panel)을 열고, 먼저 보일 탭은 설정값(없으면 쉬운 추가)이 정한다.
  function openWrite() {
    if (!ensureWritable()) return;
    deps.writePanel.open();
  }
  // 쉬운 추가 탭으로 연다(끌어다 놓기·'지금 다듬기'처럼 쉬운 추가로 되돌아오는 길).
  function openQuick() {
    if (!ensureWritable()) return;
    deps.writePanel.open('easy');
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
  async function loadYouTubeTitle(videoId, node, token) {
    if (!videoId) return;
    if (titleCache.has(videoId)) { node.textContent = titleCache.get(videoId); return; }
    const title = await fetchVideoTitle(videoId, fetchImpl);
    if (!title) return;
    titleCache.set(videoId, title);
    if (token === previewToken && node.isConnected !== false) node.textContent = title;
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
    if (quickUploads?.busy) return;
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

  // 저장 한 번 = member.apply('quickAdd', {url, mediaMetadata?}). 성공하면 칸을 비우고 초점을 유지해 연속 추가가 된다.
  // 칸을 비울 때 renderPreview가 지난 안내를 먼저 지우므로, 안내는 저장 직후 값으로 다시 세운다.
  function saveUrl(url) {
    let result = null;
    try { result = deps.getMember().apply('quickAdd', {url, ...quickMediaTitle(url)}) || null; }
    catch (error) { $('quick-error').textContent = error.message; return false; }
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
    $('quick-saved-text').textContent = QUICK_SAVED_TEXT;
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

  // 사진은 기존 업로더를 그대로 쓴다(#310 onUploaded·imagesOnly). 업로드가 끝나면 그 주소로 바로 담는다.
  const quickUploads = deps.mountUpload({
    form: $('quick-form'), assets: null, imagesOnly: true, fileLabel: '📷 사진 올리기',
    getSubject: () => deps.getSource() === 'server' && snapshot().writable ? snapshot().subject : null,
    getState: () => deps.getMember()?.state() || null,
    onChange: () => {},
    onUploaded: url => { saveUrl(url); setTimeout(syncSubmitState, 0); }
  });

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
      if (route.target === 'editor') feedFiles($('moment-form')?.querySelector?.('[data-media-file]'), image);
      else { openQuick(); feedFiles($('quick-form')?.querySelector?.('[data-media-file]'), image); }
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
  $('quick-refine').onclick = () => refine($('quick-refine'));
  $('quick-saved-refine').onclick = () => refine($('quick-saved-refine'));
  // 닫기는 공통 틀(shell/dialogs.mjs)이 초점까지 되돌린다 — 여기서는 따로 만지지 않는다.
  if (isFinePointer()) mountDrop(doc);

  return {
    openWrite,
    openQuick,
    submitQuick,
    renderPreview,
    handleDrop,
    togglePaste,
    mountFrame: doc => { if (isFinePointer()) mountDrop(doc); },
    saveUrl,
    refine,
    uploads: quickUploads,
    reset: resetQuick,
    state: () => ({ savedTimer: savedTimerBox.timer, titleCache: titleCache.size })
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
