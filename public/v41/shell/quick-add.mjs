// 빠른 추가 화면 (#빠른 추가 ②, 2026-11-09).
// 판정·문구·추출은 ../quick-add.mjs의 순수 함수가 맡고, 이 파일은 DOM만 만진다(docs/TESTING.md).
// 저장은 로컬1 계약(member.apply('quickAdd', {url}))을 그대로 부른다 — 화면은 이름만 쓴다.
import {mountPrivateUpload} from '../private-upload.mjs';
import {extractDropUrl, hasDropPayload, firstImageFile, parseQuickUrl, quickVideoThumb, dropRoute, QUICK_SAVED_TEXT, QUICK_REFINE_LABEL, QUICK_EMPTY_ERROR, QUICK_INVALID_ERROR, DROP_LOGIN_NOTICE, DROP_READONLY_NOTICE} from '../quick-add.mjs';

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

  // 진입 가드는 기존 openEditor와 같은 문구·같은 순서다(예시 → 로그인, 읽기 전용 → 안내+기록).
  function ensureWritable() {
    const member = deps.getMember();
    if (deps.getSource() !== 'server' || !member?.snapshot().owned) { deps.openLoginStart('new-tree'); return false; }
    if (!member.snapshot().writable) { deps.notify(DROP_READONLY_NOTICE); deps.panel('records'); return false; }
    return true;
  }

  function openWriteChooser() {
    if (!ensureWritable()) return;
    const chooser = $('write-chooser');
    if (!chooser.open) chooser.showModal();
    queueMicrotask(() => $('write-quick').focus());
  }
  function chooseQuick() {
    $('write-chooser').close();
    openQuick();
  }
  // 자세한 추가는 기존 순간 남기기와 같다 — 책장에서는 새 트리 흐름, 다른 화면에서는 추가 편집기.
  function chooseDetailed() {
    $('write-chooser').close();
    deps.openEditor(deps.getCurrent() === 'track32-bookshelf.html' ? 'new' : undefined);
  }

  function openQuick() {
    if (!ensureWritable()) return;
    resetQuick();
    const dialog = $('quick-add');
    if (!dialog.open) dialog.showModal();
    queueMicrotask(() => $('quick-url').focus());
  }
  function resetQuick() {
    previewToken += 1;
    $('quick-url').value = '';
    $('quick-preview').replaceChildren();
    $('quick-error').textContent = '';
    $('quick-notice').hidden = true;
    $('quick-notice').textContent = '';
    $('quick-refine').hidden = true;
  }

  function renderPreview() {
    const parsed = parseQuickUrl($('quick-url').value, describe);
    const token = ++previewToken;
    $('quick-preview').replaceChildren();
    if (parsed.status === 'empty') { $('quick-error').textContent = ''; return; }
    if (parsed.status === 'invalid') { $('quick-error').textContent = QUICK_INVALID_ERROR; return; }
    $('quick-error').textContent = '';
    if (parsed.kind === 'youtube') {
      const thumb = quickVideoThumb(parsed.videoId);
      if (thumb) {
        const image = doc.createElement('img');
        image.alt = ''; image.referrerPolicy = 'no-referrer'; image.src = thumb;
        $('quick-preview').append(image);
      }
      const title = doc.createElement('p');
      title.className = 'quick-preview-title';
      title.textContent = 'YouTube 영상';
      $('quick-preview').append(title);
      void loadYouTubeTitle(parsed.videoId, title, token);
      return;
    }
    const label = doc.createElement('p');
    label.className = 'quick-preview-label';
    label.textContent = `${parsed.label || '링크'} · 담을 준비가 됐어요`;
    $('quick-preview').append(label);
  }
  // 제목은 기존 서버 oEmbed 프록시에서만 받는다(썸네일이 200이어도 없는 영상일 수 있어 실패는 조용히 넘긴다).
  async function loadYouTubeTitle(videoId, node, token) {
    if (!videoId) return;
    if (titleCache.has(videoId)) { node.textContent = titleCache.get(videoId); return; }
    try {
      const answer = await fetchImpl('/api/youtube/oembed?v=' + encodeURIComponent(videoId), {headers: {accept: 'application/json'}});
      if (!answer?.ok) return;
      const data = await answer.json();
      const title = typeof data?.title === 'string' ? data.title.trim() : '';
      if (!title) return;
      titleCache.set(videoId, title);
      if (token === previewToken && node.isConnected !== false) node.textContent = title;
    } catch {}
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

  // 저장 한 번 = member.apply('quickAdd', {url}). 성공하면 칸을 비우고 초점을 유지해 연속 추가가 된다.
  function saveUrl(url) {
    let result = null;
    try { result = deps.getMember().apply('quickAdd', {url}) || null; }
    catch (error) { $('quick-error').textContent = error.message; return false; }
    showSaved(url, result);
    if ($('quick-add').open) {
      $('quick-url').value = '';
      previewToken += 1;
      $('quick-preview').replaceChildren();
      $('quick-error').textContent = '';
      $('quick-url').focus();
    }
    return true;
  }

  function canRefine(result) { return !!(result && result.treeId && result.momentId); }
  function setRefineTarget(button, result) {
    button.hidden = !canRefine(result);
    button.dataset.treeId = result?.treeId || '';
    button.dataset.momentId = result?.momentId || '';
  }
  function showSaved(url, result) {
    const parsed = parseQuickUrl(url, describe);
    const thumb = parsed.status === 'ok' && parsed.kind === 'youtube' ? quickVideoThumb(parsed.videoId) : '';
    if ($('quick-add').open) {
      $('quick-notice').textContent = QUICK_SAVED_TEXT;
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
    if ($('quick-add').open) $('quick-add').close();
    $('quick-saved').hidden = true;
    if (!treeId || !momentId) { deps.notify('모아둔 순간에서 그 순간을 직접 열어 주세요.'); return; }
    deps.choose(treeId, momentId);
    deps.openEditor('edit');
  }

  // 사진은 기존 업로더를 그대로 쓴다(#310 onUploaded·imagesOnly). 업로드가 끝나면 그 주소로 바로 담는다.
  const quickUploads = deps.mountUpload({
    form: $('quick-form'), assets: null, imagesOnly: true, fileLabel: '사진 올리기',
    getSubject: () => deps.getSource() === 'server' && snapshot().writable ? snapshot().subject : null,
    getState: () => deps.getMember()?.state() || null,
    onChange: () => {},
    onUploaded: url => { saveUrl(url); }
  });

  // ---- 끌어다 놓기 (데스크톱 pointer:fine) ----
  const isFinePointer = deps.isFinePointer || (() => globalThis.matchMedia?.('(pointer:fine)').matches === true);
  let veilDepth = 0;
  function routeFor(image) {
    return dropRoute({
      source: deps.getSource(), owned: !!snapshot().owned, writable: !!snapshot().writable,
      quickOpen: !!$('quick-add').open, editorOpen: !!$('editor').open, image
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

  $('write-quick').onclick = chooseQuick;
  $('write-detailed').onclick = chooseDetailed;
  $('quick-form').onsubmit = submitQuick;
  $('quick-url').addEventListener('input', renderPreview);
  $('quick-refine').onclick = () => refine($('quick-refine'));
  $('quick-saved-refine').onclick = () => refine($('quick-saved-refine'));
  $('write-chooser').addEventListener('close', () => { if (!$('quick-add').open) $('write-menu').focus?.(); });
  $('quick-add').addEventListener('close', () => { if (!$('write-chooser').open && !$('editor').open) $('write-menu').focus?.(); });
  if (isFinePointer()) mountDrop(doc);

  return {
    openWriteChooser,
    openQuick,
    submitQuick,
    renderPreview,
    handleDrop,
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
