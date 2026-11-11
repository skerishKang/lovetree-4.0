import test from 'node:test';
import assert from 'node:assert/strict';
// #327 ② 빠른 추가: 연결은 createQuickAdd를 fake DOM으로 직접 불러 본다(docs/TESTING.md).
// 판정·문구·추출 계산은 tests/v41-quick-add.test.mjs가 함수 호출로 고정한다.
import { createQuickAdd } from '../public/v41/shell/quick-add.mjs';
import {
  QUICK_SAVED_TEXT, QUICK_EMPTY_ERROR, QUICK_INVALID_ERROR, DROP_LOGIN_NOTICE, DROP_READONLY_NOTICE, DROP_VEIL_TEXT,
  QUICK_PASTE_LABEL, QUICK_CLEAR_LABEL, QUICK_EMPTY_PREVIEW, QUICK_INVALID_PREVIEW, QUICK_PASTE_EMPTY, QUICK_PASTE_ERROR,
  savedNoticeText
} from '../public/v41/quick-add.mjs';

function fakeEl(extra = {}) {
  const listeners = {};
  const node = {
    value: '', textContent: '', hidden: false, open: false, dataset: {}, src: '', alt: '', className: '',
    children: [], listeners,
    addEventListener(type, fn) { listeners[type] = fn; },
    dispatchEvent(event) { this.dispatched.push(event.type); return true; },
    dispatched: [],
    replaceChildren() { this.children = []; },
    append(...kids) { this.children.push(...kids); },
    removeAttribute(name) { delete this.attrs?.[name]; },
    attrs: {},
    focus() { this.focused = (this.focused || 0) + 1; },
    close() { this.open = false; },
    showModal() { this.open = true; }
  };
  return Object.assign(node, extra);
}

function harness({ source = 'server', owned = true, writable = true, current = 'track59-sketchbook.html', finePointer = true, applyImpl = null, attachFiles = null, clipboard = null } = {}) {
  const calls = { apply: [], notify: [], panel: [], choose: [], openEditor: [], login: [], attach: [], writeOpen: [], writeShow: [], requestClose: [] };
  const els = {};
  // #425: 고르기 창·빠른 추가·편집기가 한 창(write-panel)으로 합쳐졌다.
  const need = ['write-panel', 'write-tabs', 'write-tab-easy', 'write-tab-detailed', 'write-easy', 'write-detailed', 'write-menu', 'quick-form', 'quick-url', 'quick-paste', 'quick-preview', 'quick-error', 'quick-submit', 'quick-notice', 'quick-refine', 'quick-saved', 'quick-saved-thumb', 'quick-saved-text', 'quick-saved-refine', 'drop-veil', 'drop-veil-text', 'moment-form'];
  for (const id of need) els[id] = fakeEl();
  els['quick-url'].dispatched = [];
  els['moment-form'] = fakeEl({ elements: { url: fakeEl() } });
  const editorMedia = fakeEl(), quickMedia = fakeEl();
  els['moment-form'].querySelector = sel => sel === '[data-media-file]' ? editorMedia : null;
  els['quick-form'].querySelector = sel => sel === '[data-media-file]' ? quickMedia : null;

  const member = {
    snapshot: () => ({ owned, writable, subject: 'sub_test0003', dirty: false }),
    apply: (...args) => { calls.apply.push(args); if (applyImpl) return applyImpl(...args); return { treeId: 'tree-inbox', momentId: 'm-new' }; },
    state: () => null
  };
  const uploadsCalls = [];
  const docListeners = {};
  const doc = {
    createElement: tag => fakeEl({ tagName: tag }),
    addEventListener(type, fn) { docListeners[type] = fn; }
  };
  const saved = { LTMedia: globalThis.LTMedia, Event: globalThis.Event };
  globalThis.LTMedia = {
    describe: (url) => {
      const v = String(url ?? '');
      const m = v.match(/youtube\.com\/watch\?v=([\w-]+)/) || v.match(/youtu\.be\/([\w-]+)/) || v.match(/youtube\.com\/shorts\/([\w-]+)/);
      if (m) return { kind: 'youtube', videoId: m[1], label: 'YouTube 영상', openUrl: `https://www.youtube.com/watch?v=${m[1]}`, loadUrl: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` };
      try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol) ? { kind: 'link', label: u.hostname, openUrl: u.href } : { kind: 'invalid', openUrl: '' }; }
      catch { return { kind: 'none', openUrl: '' }; }
    }
  };
  const api = createQuickAdd({
    $: id => { if (!els[id]) els[id] = fakeEl(); return els[id]; },
    document: doc,
    getMember: () => member,
    getSource: () => source,
    getCurrent: () => current,
    notify: text => calls.notify.push(text),
    panel: id => calls.panel.push(id),
    choose: (treeId, momentId) => calls.choose.push([treeId, momentId]),
    openEditor: (mode, parentId) => calls.openEditor.push([mode, parentId]),
    openLoginStart: intent => calls.login.push(intent),
    // #425: 한 창의 탭 — 어떤 탭으로 열었는지 기록한다.
    // #425: 한 창 — 탭 기록과 창 열림 흉내를 함께 둔다.
    writePanel: { open: (tab) => { calls.writeOpen.push(tab ?? 'from-settings'); els['write-panel'].open = true; }, show: (tab) => { calls.writeShow.push(tab); }, tab: () => 'easy' },
    requestClose: (id) => calls.requestClose.push(id),
    mountUpload: options => { uploadsCalls.push(options); return { busy: false, reset() {} }; },
    attachFiles: attachFiles || ((input, file) => { calls.attach.push([input === editorMedia ? 'editor' : 'quick', file]); return true; }),
    isFinePointer: () => finePointer,
    fetchImpl: async () => ({ ok: false }),
    ...(clipboard ? { readClipboard: clipboard } : {})
  });
  const restore = () => { globalThis.LTMedia = saved.LTMedia; globalThis.Event = saved.Event; };
  return { api, els, calls, docListeners, editorMedia, quickMedia, uploadsCalls, restore };
}

const URL_OK = 'https://www.youtube.com/watch?v=abc12345678';
const URL_SHORTS = 'https://www.youtube.com/shorts/9NXOCr-T8LU';
const FALLBACK_TITLE = 'youtube.com에서 간직한 순간';

function previewParts(els) {
  const nodes = els['quick-preview'].children || [];
  const media = nodes.find((node) => node.className === 'quick-preview-media') || null;
  const meta = nodes.find((node) => node.className === 'quick-preview-meta') || null;
  const tag = meta?.children?.find((node) => node.className === 'quick-preview-tag') || null;
  const title = meta?.children?.find((node) => node.className === 'quick-preview-title') || null;
  return { nodes, media, meta, tag, title };
}

test('진입(#425): 서버·편집 가능이면 한 창을 열고, 탭은 설정값(없으면 쉬운 추가)으로 둔다', async () => {
  const h = harness();
  try {
    h.api.openWrite();
    assert.equal(h.els['write-panel'].open, true, '한 창이 열린다');
    assert.deepEqual(h.calls.writeOpen, ['from-settings'], '먼저 보일 탭은 설정값이 정한다');
    assert.deepEqual(h.calls.login, []);
  } finally { h.restore(); }
});

test('진입: 예시·로그아웃은 기존 로그인 안내, 읽기 전용은 안내+기록 패널이다', () => {
  for (const source of ['example', 'file', 'share']) {
    const h = harness({ source });
    try {
      h.api.openWrite();
      assert.equal(h.els['write-panel'].open, false, `${source}: 창을 열지 않는다`);
      assert.deepEqual(h.calls.login, ['new-tree'], `${source}: 기존 로그인 안내로 보낸다`);
    } finally { h.restore(); }
  }
  const h = harness({ writable: false });
  try {
    h.api.openWrite();
    assert.equal(h.els['write-panel'].open, false);
    assert.deepEqual(h.calls.notify, [DROP_READONLY_NOTICE]);
    assert.deepEqual(h.calls.panel, ['records']);
  } finally { h.restore(); }
});

test('쉬운 추가로 열면 한 창의 쉬운 추가 탭이고, 칸은 비어 있다', () => {
  const quick = harness();
  try {
    quick.els['quick-url'].value = '';
    quick.els['quick-url'].listeners.input();
    quick.api.openQuick();
    assert.deepEqual(quick.calls.writeOpen, ['easy'], '탭은 쉬운 추가로 열린다');
    assert.equal(quick.els['write-panel'].open, true, '한 창을 연다');
    assert.equal(quick.els['quick-url'].value, '', '열 때는 칸을 비운다');
    assert.equal(quick.els['quick-preview'].dataset.state, 'empty', '빈 상태 카드');
    assert.equal(quick.els['quick-preview'].children[0].className, 'quick-preview-empty');
    assert.equal(quick.els['quick-preview'].children[0].textContent, QUICK_EMPTY_PREVIEW);
    assert.equal(quick.els['quick-submit'].disabled, true, '주소가 없으면 담기 버튼은 흐림(disabled)');
    assert.equal(quick.els['quick-paste'].textContent, QUICK_PASTE_LABEL, '알약은 붙여넣기');
  } finally { quick.restore(); }

});

test('끌어다 놓기(#425): 자세한 추가 탭에서는 주소 칸에 넣고, 쉬운 추가 탭에서는 그 칸에 넣는다', () => {
  const image = { type: 'image/png' };
  const withEditor = harness();
  try {
    withEditor.els['write-panel'].open = true; withEditor.els['write-easy'].hidden = true;
    withEditor.docListeners.drop({ dataTransfer: { types: ['Files'], files: [image], getData: () => '' }, preventDefault() {} });
    assert.deepEqual(withEditor.calls.apply, []);
    assert.deepEqual(withEditor.calls.attach, [['editor', image]], '자세한 추가 탭의 사진 칸으로 넣는다');
  } finally { withEditor.restore(); }

  const plain = harness();
  try {
    plain.docListeners.drop({ dataTransfer: { types: ['Files'], files: [image], getData: () => '' }, preventDefault() {} });
    assert.equal(plain.els['write-panel'].open, true, '한 창을 열어 사진을 받는다');
    assert.deepEqual(plain.calls.attach, [['quick', image]]);
    assert.deepEqual(plain.calls.apply, [], '사진은 업로드가 끝난 뒤에 담는다(onUploaded)');
  } finally { plain.restore(); }
});

test('미리보기: YouTube·Shorts는 썸네일+금테 꼬리표+제목, 링크는 꼬리표+제목, 지원 안 함은 같은 틀에 안내', () => {
  const h = harness();
  try {
    h.els['quick-url'].value = URL_OK;
    h.els['quick-url'].listeners.input();
    let parts = previewParts(h.els);
    assert.equal(h.els['quick-preview'].dataset.state, 'youtube');
    assert.equal(parts.media.children[0].tagName, 'img');
    assert.equal(parts.media.children[0].referrerPolicy, 'no-referrer');
    assert.equal(parts.media.children[0].src, 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg', '썸네일은 기존 describe 판정을 쓴다');
    assert.equal(parts.tag.textContent, 'YOUTUBE', '금테 꼬리표');
    assert.equal(parts.title.textContent, FALLBACK_TITLE, 'oEmbed 전에는 저장 제목과 같은 기존 규칙');
    assert.equal(h.els['quick-submit'].disabled, false, '담을 수 있는 주소면 버튼이 눌린다');
    assert.equal(h.els['quick-paste'].textContent, QUICK_CLEAR_LABEL, '값이 생기면 알약은 지우기');

    h.els['quick-url'].value = URL_SHORTS;
    h.els['quick-url'].listeners.input();
    parts = previewParts(h.els);
    assert.equal(parts.tag.textContent, 'YOUTUBE · SHORTS', 'Shorts는 모양까지 보여 준다');

    h.els['quick-url'].value = 'https://example.com/a';
    h.els['quick-url'].listeners.input();
    parts = previewParts(h.els);
    assert.equal(parts.media, null, '일반 링크에는 썸네일이 없다');
    assert.equal(parts.tag.textContent, 'example.com');
    assert.equal(parts.title.textContent, 'example.com에서 간직한 순간');
    assert.equal(h.els['quick-submit'].disabled, false);

    h.els['quick-url'].value = 'notaurl';
    h.els['quick-url'].listeners.input();
    assert.equal(h.els['quick-preview'].dataset.state, 'invalid');
    assert.equal(h.els['quick-preview'].children[0].className, 'quick-preview-invalid');
    assert.equal(h.els['quick-preview'].children[0].textContent, QUICK_INVALID_PREVIEW, '같은 틀에 안내');
    assert.equal(h.els['quick-error'].textContent, '', '미리보기 안내가 곧 오류 안내다(중복 문구 없음)');
    assert.equal(h.els['quick-submit'].disabled, true, '지원하지 않는 주소는 담기 흐림');

    h.els['quick-url'].value = '';
    h.els['quick-url'].listeners.input();
    assert.equal(h.els['quick-preview'].children[0].textContent, QUICK_EMPTY_PREVIEW, '빈 칸은 빗금 안내로 돌아간다');
    assert.equal(h.els['quick-error'].textContent, '', '빈 칸은 오류가 아니다');
  } finally { h.restore(); }
});

test('저장: apply("quickAdd",{url}) 한 번 → ✓ 안내·지금 다듬기·칸 비움·초점 유지(연속 추가)', () => {
  const h = harness();
  try {
    h.els['write-panel'].open = true;
    h.api.renderPreview();
    h.els['quick-url'].value = URL_OK;
    h.els['quick-url'].listeners.input();
    h.els['quick-form'].onsubmit({ preventDefault() {} });
    assert.deepEqual(h.calls.apply, [['quickAdd', { url: URL_OK }]], '로컬1 계약 그대로 한 번');
    assert.equal(h.els['quick-notice'].textContent, savedNoticeText(FALLBACK_TITLE), '✓ 담았어요 · 제목 요약');
    assert.equal(h.els['quick-notice'].hidden, false);
    assert.equal(h.els['quick-refine'].hidden, false, '지금 다듬기가 안내 줄에 보인다');
    assert.equal(h.els['quick-refine'].dataset.treeId, 'tree-inbox');
    assert.equal(h.els['quick-refine'].dataset.momentId, 'm-new');
    assert.equal(h.els['quick-url'].value, '', '칸을 비워 연속 추가');
    assert.ok(h.els['quick-url'].focused, '초점을 유지한다');
    assert.equal(h.els['quick-submit'].disabled, true, '칸을 비우면 다시 흐림');
    assert.equal(h.els['quick-preview'].dataset.state, 'empty');
  } finally { h.restore(); }
});

test('저장: 새 입력을 시작하면 지난 안내가 즉시 사라진다(#343 버그)', () => {
  const h = harness();
  try {
    h.els['write-panel'].open = true;
    h.els['quick-url'].value = URL_OK;
    h.els['quick-url'].listeners.input();
    h.els['quick-form'].onsubmit({ preventDefault() {} });
    assert.equal(h.els['quick-notice'].hidden, false, '저장 직후에는 보인다');
    h.els['quick-url'].value = URL_SHORTS;
    h.els['quick-url'].listeners.input();
    assert.equal(h.els['quick-notice'].textContent, '', '새 입력이 시작되면 지난 안내를 비운다');
    assert.equal(h.els['quick-notice'].hidden, true);
    assert.equal(h.els['quick-refine'].hidden, true, '지난 순간의 다듬기 링크도 함께 비운다');
    assert.equal(h.els['quick-refine'].dataset.momentId, '');
  } finally { h.restore(); }
});

test('붙여넣기 알약: 값이 있으면 지우기, 비었으면 클립보드에서 읽어 미리보기를 띄운다', async () => {
  const clear = harness();
  try {
    clear.els['quick-url'].value = URL_OK;
    clear.els['quick-url'].listeners.input();
    await clear.api.togglePaste();
    assert.equal(clear.els['quick-url'].value, '', '값이 있으면 지운다');
    assert.equal(clear.els['quick-paste'].textContent, QUICK_PASTE_LABEL);
    assert.equal(clear.els['quick-preview'].dataset.state, 'empty');
    assert.ok(clear.els['quick-url'].focused);
  } finally { clear.restore(); }

  const paste = harness({ clipboard: async () => `  ${URL_SHORTS}  ` });
  try {
    await paste.api.togglePaste();
    assert.equal(paste.els['quick-url'].value, URL_SHORTS, '앞뒤 공백은 지운다');
    assert.equal(paste.els['quick-paste'].textContent, QUICK_CLEAR_LABEL);
    const parts = previewParts(paste.els);
    assert.equal(parts.tag.textContent, 'YOUTUBE · SHORTS', '읽은 주소로 바로 미리보기');
    assert.ok(paste.els['quick-url'].focused);
  } finally { paste.restore(); }

  const empty = harness({ clipboard: async () => '   ' });
  try {
    await empty.api.togglePaste();
    assert.deepEqual(empty.calls.notify, [QUICK_PASTE_EMPTY]);
    assert.equal(empty.els['quick-url'].value, '');
  } finally { empty.restore(); }

  const denied = harness({ clipboard: async () => { throw new Error('denied'); } });
  try {
    await denied.api.togglePaste();
    assert.deepEqual(denied.calls.notify, [QUICK_PASTE_ERROR], '읽기 실패는 직접 붙여 넣기로 안내');
    assert.ok(denied.els['quick-url'].focused);
  } finally { denied.restore(); }
});

test('저장: 빈 칸·잘못된 주소는 막고, 도메인이 던지면 그 문구를 보여 준다', () => {
  const h = harness();
  try {
    h.els['quick-form'].onsubmit({ preventDefault() {} });
    assert.equal(h.els['quick-error'].textContent, QUICK_EMPTY_ERROR);
    assert.deepEqual(h.calls.apply, [], '빈 칸은 저장하지 않는다');
    assert.ok(h.els['quick-url'].focused);

    h.els['quick-url'].value = 'notaurl';
    h.els['quick-form'].onsubmit({ preventDefault() {} });
    assert.equal(h.els['quick-error'].textContent, QUICK_INVALID_ERROR);
    assert.deepEqual(h.calls.apply, []);
  } finally { h.restore(); }
});

test('저장: 도메인이 던지면 그 문구를 그대로 보여 주고 안내는 내지 않는다', () => {
  const h = harness({ applyImpl: () => { throw new Error('트리는 50개까지 만들 수 있어요.'); } });
  try {
    h.els['write-panel'].open = true;
    h.els['quick-notice'].hidden = true;
    h.els['quick-url'].value = URL_OK;
    h.els['quick-form'].onsubmit({ preventDefault() {} });
    assert.equal(h.els['quick-error'].textContent, '트리는 50개까지 만들 수 있어요.');
    assert.equal(h.els['quick-notice'].hidden, true, '실패했으니 담았다는 안내가 없다');
    assert.equal(h.els['quick-url'].value, URL_OK, '실패하면 칸을 비우지 않는다');
  } finally { h.restore(); }
});

test('저장: 모달이 닫힌 채 끌어다 놓으면 아래 안내판에 썸네일과 지금 다듬기를 보여 준다', () => {
  const h = harness();
  try {
    h.api.saveUrl(URL_OK);
    assert.equal(h.els['quick-saved'].hidden, false);
    assert.equal(h.els['quick-saved-text'].textContent, QUICK_SAVED_TEXT);
    assert.equal(h.els['quick-saved-thumb'].src, 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg');
    assert.equal(h.els['quick-saved-refine'].hidden, false);
    assert.ok(h.api.state().savedTimer, '20초 뒤 숨기는 타이머가 선다');
    h.els['quick-saved-refine'].onclick();
    assert.deepEqual(h.calls.choose, [['tree-inbox', 'm-new']], '그 순간의 자세한 편집');
    assert.deepEqual(h.calls.openEditor, [['edit', undefined]]);
    assert.equal(h.els['quick-saved'].hidden, true);
  } finally { h.restore(); }
});

test('끌어다 놓기: 놓으면 바로 저장하고, 모달 위에서는 칸에 넣어 미리보기만 한다', () => {
  const shell = harness();
  try {
    shell.docListeners.drop({ dataTransfer: { types: ['text/uri-list'], getData: t => t === 'text/uri-list' ? URL_OK : '' }, preventDefault() {} });
    assert.deepEqual(shell.calls.apply, [['quickAdd', { url: URL_OK }]], '셸 어디에나 놓으면 바로 담는다');
    assert.equal(shell.els['drop-veil'].hidden, true, '놓은 뒤 덮개를 거둔다');
  } finally { shell.restore(); }

  const modal = harness();
  try {
    modal.els['write-panel'].open = true;
    modal.docListeners.drop({ dataTransfer: { types: ['text/uri-list'], getData: t => t === 'text/uri-list' ? URL_OK : '' }, preventDefault() {} });
    assert.deepEqual(modal.calls.apply, [], '모달 위에서는 저장하지 않는다');
    assert.equal(modal.els['quick-url'].value, URL_OK);
    assert.ok(modal.els['quick-url'].focused);
    assert.equal(modal.els['quick-preview'].dataset.state, 'youtube', '놓은 주소로 미리보기');
  } finally { modal.restore(); }

  const editor = harness();
  try {
    editor.els['write-panel'].open = true; editor.els['write-easy'].hidden = true;
    editor.docListeners.drop({ dataTransfer: { types: ['text/plain'], getData: t => t === 'text/plain' ? URL_OK : '' }, preventDefault() {} });
    assert.deepEqual(editor.calls.apply, [], '자세한 추가 화면에서는 저장하지 않는다');
    assert.equal(editor.els['moment-form'].elements.url.value, URL_OK, '주소 칸에 넣는다');
    assert.deepEqual(editor.els['moment-form'].elements.url.dispatched, ['input'], 'input을 알려 미리보기를 띤다');
  } finally { editor.restore(); }
});

test('끌어다 놓기: 이미지 파일은 사진 업로더로, 로그아웃·공유는 받지 않는다', () => {
  const image = { type: 'image/png' };
  const withEditor = harness();
  try {
    withEditor.els['write-panel'].open = true; withEditor.els['write-easy'].hidden = true;
    withEditor.docListeners.drop({ dataTransfer: { types: ['Files'], files: [image], getData: () => '' }, preventDefault() {} });
    assert.deepEqual(withEditor.calls.apply, []);
    assert.deepEqual(withEditor.calls.attach, [['editor', image]], '자세한 추가 화면의 사진 칸으로 넣는다');
  } finally { withEditor.restore(); }

  const plain = harness();
  try {
    plain.docListeners.drop({ dataTransfer: { types: ['Files'], files: [image], getData: () => '' }, preventDefault() {} });
    assert.equal(plain.els['write-panel'].open, true, '한 창을 열어 사진을 받는다');
    assert.deepEqual(plain.calls.attach, [['quick', image]]);
    assert.deepEqual(plain.calls.apply, [], '사진은 업로드가 끝난 뒤에 담는다(onUploaded)');
  } finally { plain.restore(); }

  const guest = harness({ owned: false });
  try {
    guest.docListeners.drop({ dataTransfer: { types: ['text/uri-list'], getData: t => t === 'text/uri-list' ? URL_OK : '' }, preventDefault() {} });
    assert.deepEqual(guest.calls.apply, []);
    assert.deepEqual(guest.calls.notify, [DROP_LOGIN_NOTICE]);
  } finally { guest.restore(); }

  const shared = harness({ source: 'share' });
  try {
    shared.docListeners.drop({ dataTransfer: { types: ['text/uri-list'], getData: t => t === 'text/uri-list' ? URL_OK : '' }, preventDefault() {} });
    assert.deepEqual(shared.calls.apply, []);
    assert.deepEqual(shared.calls.notify, [], '공유 모드는 안내도 없이 무시한다(#315)');
  } finally { shared.restore(); }
});

test('덮개: 끌기가 들어오면 문구를 보여 주고 나가면 거둔다', () => {
  const h = harness();
  try {
    h.docListeners.dragenter({ dataTransfer: { types: ['text/uri-list'], getData: () => '' }, preventDefault() {} });
    assert.equal(h.els['drop-veil'].hidden, false);
    assert.equal(h.els['drop-veil-text'].textContent, DROP_VEIL_TEXT);
    h.docListeners.dragleave();
    assert.equal(h.els['drop-veil'].hidden, true);
    h.docListeners.dragenter({ dataTransfer: { types: ['text/uri-list'], getData: () => '' }, preventDefault() {} });
    h.docListeners.dragenter({ dataTransfer: { types: ['text/uri-list'], getData: () => '' }, preventDefault() {} });
    h.docListeners.dragleave();
    assert.equal(h.els['drop-veil'].hidden, false, '안쪽으로 들어온 끼기는 하나만 나가도 유지한다');
    h.docListeners.dragleave();
    assert.equal(h.els['drop-veil'].hidden, true);
  } finally { h.restore(); }
});

test('연결 구조: shell.mjs는 기존 업로더를 그대로 넘기고 write-menu를 고르기 창에 연다', async () => {
  const h = harness();
  try {
    assert.equal(h.uploadsCalls.length, 1, 'createQuickAdd가 업로더를 하나 만든다');
    assert.equal(h.uploadsCalls[0].imagesOnly, true, '사진만 받는 인스턴스');
    assert.equal(h.uploadsCalls[0].fileLabel, '📷 사진 올리기', '점선 칸의 라벨(#343)');
    assert.equal(typeof h.uploadsCalls[0].onUploaded, 'function', 'onUploaded로 담기에 연결');
  } finally { h.restore(); }
  // shell.mjs의 연결 한 줄은 글자로 고정한다(연결이 지워지면 운영에서 무반응이 되는 #245 전례).
  const fs = await import('node:fs');
  const shell = fs.readFileSync(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8');
  assert.match(shell, /mountUpload:mountPrivateUpload/, 'shell.mjs가 기존 업로더를 quick-add에 넘긴다');
  // #425: 순간 남기기는 한 창(write-panel)을 연다 — 고르기 창은 없다.
  assert.match(shell, /\$\('write-menu'\)\.onclick=\(\)=>shellQuick\.openWrite\(\)/, '순간 남기기는 한 창을 연다');
  assert.doesNotMatch(shell, /openWriteChooser/, '옛 고르기 창 진입이 남지 않는다');
});
