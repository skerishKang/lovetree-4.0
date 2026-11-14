import test from 'node:test';
import assert from 'node:assert/strict';
// #231 1-B③-2: 옮긴 순간 패널·편집기·책 정보 함수를 직접 불러 결과를 본다(최소 가짜 DOM).
// 소스 글자만 보는 시험을 대신하려고 폼 기준값·저장 인자·모드 전환을 실제 값으로 확인한다.
import { createPanels } from '../public/v41/shell/panels.mjs';
import { fakeRadioGroup } from './helpers/fake-dom.mjs';

function fakeElement(extra = {}) {
  const node = {
    value: '', textContent: '', innerHTML: '', hidden: false, open: false,
    children: [], attrs: {}, listeners: {}, dataset: {},
    reset() { for (const key of Object.keys(this.elements || {})) if ('value' in this.elements[key]) this.elements[key].value = ''; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; },
    replaceChildren() { this.children = []; },
    append(...kids) { this.children.push(...kids); },
    focus() { this.focused = true; },
    close() { this.open = false; },
    showModal() { this.open = true; }
  };
  return Object.assign(node, extra);
}

function harness({ owned = true, writable = true, source = 'server', busy = false, tree = null, view = 'track59-sketchbook.html', applyImpl = null } = {}) {
  const calls = [];
  const notes = [];
  const els = {};
  const fields = () => ({ title: fakeElement(), note: fakeElement(), emotion: fakeElement(), date: fakeElement(), url: fakeElement(), relation: fakeElement() });
  els['moment-form'] = fakeElement({ elements: fields() });
  // #314: coverDesign은 실제 RadioNodeList 동작(빈 값 대입은 무시)을 흉내 내는 묶음이다.
  els['tree-cover'] = fakeElement();
  els['tree-form'] = fakeElement({ elements: {
    title: fakeElement(), subject: fakeElement(), coverMomentId: els['tree-cover'],
    // #380 5번: 표지 방법 한 줄(첫 순간(기본)·순간에서·디자인·사진).
    coverMode: fakeRadioGroup(['basic', 'moment', 'design', 'photo']),
    coverDesign: fakeRadioGroup(['', 'texture-1', 'texture-2', 'texture-3', 'texture-4', 'texture-5', 'texture-6'])
  } });
  // 새 사진 표지 만들기(이슈 256-3 2단계): 업로더가 기대하는 최소 미디어 슬롯 흉내.
  const coverSlotParts = { '[data-media-file]': fakeElement(), '[data-upload-status]': fakeElement(), '[data-stop]': fakeElement() };
  const coverSlot = fakeElement({ innerHTML: '' });
  coverSlot.querySelector = sel => coverSlotParts[sel] || null;
  els['tree-form'].querySelector = sel => sel === '[data-media-slot]' ? coverSlot : sel === '[type=submit]' ? null : coverSlot.querySelector(sel);
  els['tree-cover-upload'] = fakeElement({ hidden: true });
  els['tree-cover-title'] = fakeElement({ value: '' });
  els['write-panel'] = fakeElement();
  els['tree-manager'] = fakeElement();
  els['parent-target'] = fakeElement();
  els['related-target'] = fakeElement();

  const saved = {
    document: globalThis.document, window: globalThis.window,
    FormData: globalThis.FormData, LTMedia: globalThis.LTMedia, confirm: globalThis.confirm, location: globalThis.location
  };
  const LT41 = tree ? { tree, momentId: tree.moments[0]?.id, trees: [tree] } : null;
  globalThis.window = { LT41 };
  globalThis.document = { createElement: () => fakeElement(), querySelectorAll: () => [] };
  // 패널은 HTMLFormElement를 그대로 FormData로 만든다. 최소 폼 데이터로 같은 경로를 태운다.
  globalThis.FormData = class {
    constructor(form) { this.pairs = Object.entries(form.elements).map(([key, field]) => [key, field.value ?? '']); }
    *[Symbol.iterator]() { yield* this.pairs; }
  };
  globalThis.LTMedia = { describe: url => ({ kind: url ? 'photo' : 'none', label: url ? '사진' : '' }), markup: () => '' };
  globalThis.confirm = () => true;

  const member = { snapshot: () => ({ owned, writable, dirty: false, subject: 'sub_test0001' }), apply: (...args) => { calls.push(args); return applyImpl ? applyImpl(...args) : {}; }, dispose() {} };
  const uploads = { busy, resets: 0, reset() { this.resets += 1; } };
  let openedJourney = 0, loginIntent = null, editorPanel = 0, settingsData = 0, tabsVisible = null;
  const panels = createPanels({
    $: id => (els[id] ||= fakeElement()),
    getMember: () => member,
    getCurrent: () => view,
    getSource: () => source,
    getUploads: () => uploads,
    notify: text => notes.push(text),
    panel: id => { if (id === 'write-panel') editorPanel += 1; els[id] && (els[id].open = true); },
    openSettingsData: () => { settingsData += 1; },
    // #425: 한 창의 탭 — 보여 준 구역 기록.
    writePanel: { show: tab => { tabsVisible = tab; }, setTabsVisible: v => { tabsVisible = v ? 'tabs' : 'none'; } },
    show: () => {},
    selection: () => ({ treeId: tree?.id, momentId: tree?.moments[0]?.id }),
    openFirstJourney: () => { openedJourney += 1; },
    openLoginStart: intent => { loginIntent = intent; }
  });

  const restore = () => {
    globalThis.document = saved.document;
    globalThis.window = saved.window;
    globalThis.FormData = saved.FormData;
    globalThis.LTMedia = saved.LTMedia;
    globalThis.confirm = saved.confirm;
    globalThis.location = saved.location;
  };
  return {
    panels, els, calls, notes, uploads, coverSlotParts, coverSlot,
    counts: () => ({ openedJourney, loginIntent, editorPanel, settingsData, tabsVisible }),
    restore
  };
}

function sampleTree() {
  return {
    id: 'tree1', title: '윤슬', subject: '윤슬',
    moments: [
      { id: 'm1', title: '첫 순간', note: '마음', emotion: '설렘', date: '2026-11-01', url: '', parentId: null, relation: '' },
      { id: 'm2', title: '둘째 순간', note: '', emotion: '기쁨', date: '2026-11-02', url: 'https://example.test/a.jpg', parentId: 'm1', relation: 'next' }
    ]
  };
}

test('setEditorMode(add)는 추가 모드 기본값과 폼 기준값을 세운다', () => {
  const h = harness({ tree: sampleTree() });
  try {
    h.panels.setEditorMode('add');
    assert.equal(h.els['write-panel-title'].textContent, '순간 추가');
    assert.equal(h.els['relation-label'].hidden, false, '추가 모드에는 연결 이유를 보여 준다');
    assert.equal(h.els['moment-management'].hidden, true);
    assert.equal(h.els['moment-form'].elements.emotion.value, '설렘', '기본 감정');
    assert.match(h.els['moment-form'].elements.date.value, /^\d{4}-\d{2}-\d{2}$/, '오늘 날짜');
    // #601 '가' 결정: 고르지 않은 추가는 가장 최근 순간(둘째 순간)에서 이어짐을 보여 준다.
    assert.equal(h.els['editor-context'].textContent, '새 순간 추가 · 둘째 순간에서 이어집니다.');
    assert.equal(h.counts().tabsVisible, 'detailed', '더하기는 자세한 추가 구역을 보여 준다');
    assert.equal(h.uploads.resets, 1, '모드를 바꾸면 업로드 상태를 비운다');
    h.els['write-panel'].open = true;
    assert.equal(h.panels.formDirty(), false, '막 연 폼은 깨끗하다');
    h.els['moment-form'].elements.note.value = '새로 쓴 마음';
    assert.equal(h.panels.formDirty(), true, '값을 쓰면 미저장으로 본다');
  } finally { h.restore(); }
});

test('setEditorMode(edit)는 기존 값을 채우고 이전 순간 관리와 더 적기를 펼친다', () => {
  const h = harness({ tree: sampleTree() });
  try {
    window.LT41.momentId = 'm2';
    h.panels.setEditorMode('edit');
    const form = h.els['moment-form'].elements;
    assert.equal(h.els['write-panel-title'].textContent, '순간 수정');
    assert.equal(form.title.value, '둘째 순간');
    assert.equal(form.url.value, 'https://example.test/a.jpg');
    assert.equal(form.relation.value, 'next');
    assert.equal(h.els['more-fields'].open, true, '적어 둔 값이 있으면 더 적기를 펼친다');
    assert.equal(h.els['moment-management'].hidden, false);
    assert.equal(h.els['parent-management'].hidden, false, '이전 순간을 바꿀 수 있다');
    assert.equal(h.els['parent-current'].textContent, '현재 이전 순간 · 첫 순간');
    assert.equal(h.els['parent-target'].value, 'm1');
    assert.equal(h.els['relation-label'].hidden, true);
    assert.equal(h.els['editor-context'].textContent, '수정할 순간 · 둘째 순간 · 현재 이전 순간: 첫 순간');
    assert.equal(h.counts().tabsVisible, 'none', '수정에는 탭 줄이 없다');
    assert.deepEqual(h.calls, [], '모드 전환은 저장하지 않는다');
  } finally { h.restore(); }
});

test('setEditorMode(add, parentId)는 그 순간을 부모로 삼는다', () => {
  const h = harness({ tree: sampleTree() });
  try {
    window.LT41.momentId = 'm2';
    h.panels.setEditorMode('add', 'm1');
    // 부모를 정확히 고른 추가는 그 순간(m1)에서 이어짐을 보여 준다.
    assert.equal(h.els['editor-context'].textContent, '새 순간 추가 · 첫 순간에서 이어집니다.');
    assert.equal(h.els['parent-management'].hidden, true);
  } finally { h.restore(); }
});

test('파일 전송 중이거나 순간이 없으면 모드를 바꾸지 않는다', () => {
  const busy = harness({ tree: sampleTree(), busy: true });
  try {
    busy.panels.setEditorMode('edit');
    assert.equal(busy.els['write-panel-title'], undefined, '전송 중에는 모드를 바꾸지 않는다');
    assert.deepEqual(busy.notes, ['파일 전송을 마치거나 취소한 뒤 작업을 바꿔 주세요.']);
  } finally { busy.restore(); }
  const empty = harness({ tree: { id: 't', title: '빈', moments: [] } });
  try {
    empty.panels.setEditorMode('add');
    assert.deepEqual(empty.notes, ['먼저 순간을 선택해 주세요.']);
    assert.equal(empty.els['write-panel-title']?.textContent ?? '', '', '편집기 제목을 건드리지 않는다');
  } finally { empty.restore(); }
});

test('openEditor는 로그인·쓰기 권한·새 트리 분기를 그대로 지킨다', () => {
  const out = harness({ tree: sampleTree(), owned: false });
  try {
    out.panels.openEditor('add');
    assert.equal(out.counts().loginIntent, 'new-tree', '로그아웃이면 로그인으로 보낸다');
  } finally { out.restore(); }
  const readOnly = harness({ tree: sampleTree(), writable: false });
  try {
    readOnly.panels.openEditor('add');
    assert.equal(readOnly.counts().settingsData, 1, '읽기 전용이면 설정 내 데이터를 연다');
    assert.deepEqual(readOnly.notes, ['서버 편집 연결이 아직 준비되지 않았어요. 기록은 안전하게 읽을 수 있습니다.']);
  } finally { readOnly.restore(); }
  const fresh = harness({ tree: sampleTree() });
  try {
    fresh.panels.openEditor('new');
    assert.equal(fresh.counts().openedJourney, 1, '새 트리는 첫 여정으로 간다');
    assert.equal(fresh.counts().editorPanel, 0);
  } finally { fresh.restore(); }
  const add = harness({ tree: sampleTree() });
  try {
    add.panels.openEditor();
    assert.equal(add.els['write-panel-title'].textContent, '순간 추가', '트리가 있으면 추가 모드');
    assert.equal(add.counts().editorPanel, 1);
  } finally { add.restore(); }
});

test('편집기 저장은 editorMode와 폼 값·선택을 member.apply에 그대로 넘긴다', () => {
  const h = harness({ tree: sampleTree() });
  try {
    h.panels.setEditorMode('add');
    const form = h.els['moment-form'];
    form.elements.note.value = '저장할 마음';
    form.elements.url.value = 'https://example.test/b.jpg';
    form.open = true;
    h.panels.formDirty();
    h.els['write-panel'].open = true;
    form.onsubmit({ preventDefault() {}, target: form });
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0][0], 'add', '편집 모드를 그대로 쓴다');
    assert.equal(h.calls[0][1].note, '저장할 마음');
    assert.equal(h.calls[0][2].treeId, 'tree1', '선택을 그대로 넘긴다');
    assert.equal(h.els['write-panel'].open, false, '저장하면 닫는다');
    assert.deepEqual(h.notes, ['서버에 저장하고 있어요.']);
  } finally { h.restore(); }
});

test('이전 순간을 먼저 저장하지 않으면 편집기 저장을 막는다', () => {
  const h = harness({ tree: sampleTree() });
  try {
    window.LT41.momentId = 'm2';
    h.panels.setEditorMode('edit');
    h.els['parent-target'].value = 'm2';
    const form = h.els['moment-form'];
    form.onsubmit({ preventDefault() {}, target: form });
    assert.deepEqual(h.calls, [], '저장하지 않는다');
    assert.equal(h.els['form-error'].textContent, '이전 순간 변경은 아래 버튼으로 먼저 저장해 주세요.');
  } finally { h.restore(); }
});

test('책 정보 관리는 값·기준값·저장·삭제를 그대로 쓴다', () => {
  const h = harness({ tree: sampleTree() });
  try {
    h.panels.openTreeManager();
    assert.equal(h.els['tree-form'].elements.title.value, '윤슬');
    assert.equal(h.els['tree-form'].elements.subject.value, '윤슬');
    assert.equal(h.els['tree-cover'].children.length, 3, '기본 표지 + 순간 2개');
    assert.equal(h.panels.treeDirty(), false);
    h.els['tree-form'].elements.title.value = '새 이름';
    assert.equal(h.panels.treeDirty(), true);
    h.els['tree-form'].onsubmit({ preventDefault() {}, target: h.els['tree-form'] });
    assert.equal(h.calls[0][0], 'editTree');
    assert.equal(h.calls[0][1].title, '새 이름');
    h.els['tree-delete'].onclick();
    assert.equal(h.calls[1][0], 'deleteTree');
  } finally { h.restore(); }
});

// 2026-11-09 #빠른 추가 ②: '순간 남기기' 연결은 shell.mjs → createQuickAdd로 옮겨졌다.
// 고르기 창 분기(책장→자세한 'new'·나머지→'add')는 tests/v41-quick-add-flow.test.mjs가
// createQuickAdd를 직접 불러 확인하고, panels는 편집기만 맡는다(우연히 다시 연결되면 이중 동작이므로).
test('순간 남기기 연결은 이 파일을 벗어났다 — panels는 write-menu를 연결하지 않는다', () => {
  const shelf = harness({ tree: sampleTree(), view: 'track32-bookshelf.html' });
  try {
    assert.equal(shelf.els['write-menu'], undefined, 'panels는 write-menu를 아예 찾지 않는다(연결은 셸 몫)');
  } finally { shelf.restore(); }
});

// #256-3 2단계: 책 정보 관리 창의 새 사진 표지 만들기. 흐름은 직접 불러 결과를 본다.
const setImmediateTick = () => new Promise(resolve => setImmediate(resolve));

async function driveCoverUpload(h, { file = { type: 'image/png', size: 1000 } } = {}) {
  const fileInput = h.coverSlotParts['[data-media-file]'];
  fileInput.files = [file];
  await fileInput.listeners.change();
  for (let i = 0; i < 200 && h.calls.length < 2; i += 1) await setImmediateTick();
}

test('새 사진 표지: 업로드 성공 뒤 순간 추가 → 표지 지정 두 번 저장으로 나간다', async () => {
  let uploaded = 0;
  const h = harness({ tree: sampleTree(), applyImpl: (action, input, selection) => {
    if (action === 'add') {
      assert.deepEqual(selection, { treeId: 'tree1', momentId: 'm1' }, '루트 순간 아래로 붙는다');
      globalThis.window.LT41.tree = { ...globalThis.window.LT41.tree, coverMomentId: 'new1', moments: [...globalThis.window.LT41.tree.moments, { id: 'new1', title: '사진으로 남긴 순간', url: input.url, parentId: 'm1', relation: '' }] };
      return { treeId: 'tree1', momentId: 'new1' };
    }
    return {};
  } });
  h.uploadedFetch = () => { uploaded += 1; return { status: 200, text: async () => JSON.stringify({ name: 'c.png', url: 'https://lovetree-4-0.pages.dev/api/media/c.png' }) }; };
  try {
    globalThis.location = { origin: 'https://lovetree-4-0.pages.dev' };
    globalThis.fetch = () => { uploaded += 1; return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify({ name: 'c.png', url: 'https://lovetree-4-0.pages.dev/api/media/c.png' }) }); };
    h.panels.openTreeManager();
    // #380 5번: 올리기 칸은 표지 방법에서 '사진'을 골랐을 때만 보인다.
    assert.equal(h.els['tree-cover-upload'].hidden, true, '처음에는 첫 순간(기본)이라 올리기 칸이 숨는다');
    for (const radio of h.els['tree-form'].elements.coverMode) radio.checked = radio.value === 'photo';
    h.els['tree-form'].elements.coverMode[3].onchange?.();
    assert.equal(h.els['tree-cover-upload'].hidden, false, '사진 방법을 고르면 보인다');
    await driveCoverUpload(h);
    assert.equal(h.calls.length, 2, '순간 추가 + 표지 지정');
    assert.equal(h.calls[0][0], 'add');
    assert.equal(h.calls[1][0], 'editTree');
    assert.deepEqual(h.calls[1][1], { title: '윤슬', subject: '윤슬', coverMomentId: 'new1', coverDesign: '', coverMode: 'photo' }, '이름·대상은 저장된 값, 표지는 새 순간, 방법은 사진, 디자인은 보존');
    assert.equal(h.els['tree-cover'].value, 'new1', '선택지가 새 순간으로 채워지고 고른다');
    assert.equal(h.els['tree-cover'].children.length, 4, '기본 + 기존 2 + 새 사진');
    assert.match(h.notes.join(' '), /새 사진 순간을 표지로 만들었어요/);
    assert.match(h.coverSlotParts['[data-upload-status]'].textContent, /새 사진 순간을 표지로 만들었어요/);
    assert.equal(h.panels.treeDirty(), false, '성공 뒤 기준값을 다시 세워 닫을 때 경고가 없다');
    assert.equal(h.els['tree-cover-title'].value, '', '제목 칸은 비운다');
  } finally { h.restore(); }
});

test('새 사진 표지: 순간 제목을 적으면 그 제목으로 순간을 만든다', async () => {
  const h = harness({ tree: sampleTree(), applyImpl: (action, input) => {
    if (action === 'add') {
      globalThis.window.LT41.tree = { ...globalThis.window.LT41.tree, moments: [...globalThis.window.LT41.tree.moments, { id: 'new1', title: input.title, url: input.url, parentId: 'm1', relation: '' }] };
      return { treeId: 'tree1', momentId: 'new1' };
    }
    return {};
  } });
  try {
    globalThis.location = { origin: 'https://lovetree-4-0.pages.dev' };
    globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify({ name: 'c.png', url: 'https://lovetree-4-0.pages.dev/api/media/c.png' }) });
    h.panels.openTreeManager();
    h.els['tree-cover-title'].value = '  첫 표지 사진  ';
    await driveCoverUpload(h);
    assert.deepEqual(h.calls[0][1], { url: h.calls[0][1].url, title: '첫 표지 사진' }, '공백만 남기고 제목을 넘긴다');
  } finally { h.restore(); }
});

test('새 사진 표지: 제목을 비우면 기본값(사진으로 남긴 순간)에 맡긴다', async () => {
  const h = harness({ tree: sampleTree(), applyImpl: (action, input) => {
    if (action === 'add') {
      assert.equal('title' in input, false, '제목 키를 보내지 않는다 — 도메인 기본값이 붙는다');
      globalThis.window.LT41.tree = { ...globalThis.window.LT41.tree, moments: [...globalThis.window.LT41.tree.moments, { id: 'new1', title: '사진으로 남긴 순간', url: input.url, parentId: 'm1', relation: '' }] };
      return { treeId: 'tree1', momentId: 'new1' };
    }
    return {};
  } });
  try {
    globalThis.location = { origin: 'https://lovetree-4-0.pages.dev' };
    globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify({ name: 'c.png', url: 'https://lovetree-4-0.pages.dev/api/media/c.png' }) });
    h.panels.openTreeManager();
    await driveCoverUpload(h);
    assert.equal(h.calls.length, 2);
  } finally { h.restore(); }
});

test('새 사진 표지: 표지 지정이 실패하면 사진은 순간으로 남았다고 알린다', async () => {
  const h = harness({ tree: sampleTree(), applyImpl: (action, input) => {
    if (action === 'add') {
      globalThis.window.LT41.tree = { ...globalThis.window.LT41.tree, moments: [...globalThis.window.LT41.tree.moments, { id: 'new1', title: '사진으로 남긴 순간', url: input.url, parentId: 'm1', relation: '' }] };
      return { treeId: 'tree1', momentId: 'new1' };
    }
    if (action === 'editTree') throw Error('서버에 저장하지 못했어요');
    return {};
  } });
  try {
    globalThis.location = { origin: 'https://lovetree-4-0.pages.dev' };
    globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify({ name: 'c.png', url: 'https://lovetree-4-0.pages.dev/api/media/c.png' }) });
    h.panels.openTreeManager();
    await driveCoverUpload(h);
    assert.match(h.coverSlotParts['[data-upload-status]'].textContent, /사진은 순간으로 남았지만 표지 지정은 실패했어요/);
    assert.doesNotMatch(h.notes.join(' '), /표지로 만들었어요/);
    assert.equal(h.els['tree-cover'].children.length, 4, '실패해도 새 순간은 선택지에 남는다');
  } finally { h.restore(); }
});

test('새 사진 표지: 순간 만들기가 실패하면 사진은 보관 파일로 남았다고 알린다', async () => {
  const h = harness({ tree: sampleTree(), applyImpl: (action) => {
    if (action === 'add') throw Error('먼저 내 기록을 불러오고 저장 연결을 확인해 주세요');
    return {};
  } });
  try {
    globalThis.location = { origin: 'https://lovetree-4-0.pages.dev' };
    globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify({ name: 'c.png', url: 'https://lovetree-4-0.pages.dev/api/media/c.png' }) });
    h.panels.openTreeManager();
    await driveCoverUpload(h);
    assert.equal(h.calls.length, 1, '표지 지정으로 나가지 않는다');
    assert.match(h.coverSlotParts['[data-upload-status]'].textContent, /사진은 보관 파일로 남았어요/);
  } finally { h.restore(); }
});

// #314: A(격자) → B(디자인 없음)로 창을 바꿔 열고, 사진 표지를 만든 뒤 '책 정보 저장'을 다시 눌러도
// 이전 책의 디자인이 따라가지 않아야 한다(운영 재현 순서 그대로의 시험 판).
test('#314: 다른 책에서 고른 디자인이 남지 않고, 사진 표지 뒤 저장에도 섞이지 않는다', async () => {
  const treeA = { ...sampleTree(), coverDesign: 'texture-3' };
  const treeB = {
    id: 'tree2', title: '겨울 정원', subject: '겨울', coverDesign: '', coverMomentId: '',
    moments: [{ id: 'b1', title: '눈', note: '', emotion: '설렘', date: '2026-11-03', url: '', parentId: null, relation: '' }]
  };
  const h = harness({ tree: treeA, applyImpl: (action, input) => {
    const tree = globalThis.window.LT41.tree;
    if (action === 'add') {
      globalThis.window.LT41.tree = { ...tree, moments: [...tree.moments, { id: 'new1', title: '사진으로 남긴 순간', url: input.url, parentId: 'b1', relation: '' }] };
      return { treeId: tree.id, momentId: 'new1' };
    }
    if (action === 'editTree') {
      globalThis.window.LT41.tree = { ...tree, ...input, moments: tree.moments };
      return {};
    }
    return {};
  } });
  try {
    globalThis.location = { origin: 'https://lovetree-4-0.pages.dev' };
    globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify({ name: 'c.png', url: 'https://lovetree-4-0.pages.dev/api/media/c.png' }) });
    const form = h.els['tree-form'];
    const checked = () => [...form.elements.coverDesign].filter(r => r.checked).map(r => r.value);
    h.panels.openTreeManager();
    assert.deepEqual(checked(), ['texture-3'], 'A에서는 저장된 격자가 선택돼 있다');
    globalThis.window.LT41.tree = treeB;
    h.panels.openTreeManager();
    assert.deepEqual(checked(), [''], '디자인이 없는 B에서는 기본(빈 값)이 선택된다 — 이전 책 선택이 남지 않는다');
    await driveCoverUpload(h);
    assert.deepEqual(checked(), [''], '사진으로 표지를 만든 뒤에도 디자인 선택은 기본 그대로다');
    form.onsubmit({ preventDefault() {}, target: form });
    const saved = h.calls.at(-1);
    assert.equal(saved[0], 'editTree', '창 아래 저장은 editTree로 나간다');
    assert.equal(saved[1].coverDesign, '', '사진 표지 책 저장에 이전 책 디자인이 섞이지 않는다');
    assert.equal(saved[1].coverMomentId, 'new1', '표지는 새 사진 순간으로');
  } finally { h.restore(); }
});

test('새 사진 표지: 예시(로그아웃) 상태에서는 창 자체가 열리지 않아 버튼이 보이지 않는다', () => {
  const h = harness({ tree: sampleTree(), source: 'example' });
  try {
    h.panels.openTreeManager();
    assert.equal(h.els['tree-manager'].open, false, '예시 기록에서는 열지 않는다(기존 안내 유지)');
    assert.equal(h.els['tree-cover-upload'].hidden, true, '업로드 블록은 기본 숨김');
  } finally { h.restore(); }
});
