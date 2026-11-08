import test from 'node:test';
import assert from 'node:assert/strict';
// #231 1-B③-2: 옮긴 순간 패널·편집기·책 정보 함수를 직접 불러 결과를 본다(최소 가짜 DOM).
// 소스 글자만 보는 시험을 대신하려고 폼 기준값·저장 인자·모드 전환을 실제 값으로 확인한다.
import { createPanels } from '../public/v41/shell/panels.mjs';

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

function harness({ owned = true, writable = true, source = 'server', busy = false, tree = null, view = 'track59-sketchbook.html' } = {}) {
  const calls = [];
  const notes = [];
  const els = {};
  const fields = () => ({ title: fakeElement(), note: fakeElement(), emotion: fakeElement(), date: fakeElement(), url: fakeElement(), relation: fakeElement() });
  els['moment-form'] = fakeElement({ elements: fields() });
  els['tree-form'] = fakeElement({ elements: { title: fakeElement(), subject: fakeElement() } });
  els['editor'] = fakeElement();
  els['tree-manager'] = fakeElement();
  els['parent-target'] = fakeElement();
  els['related-target'] = fakeElement();
  const modeButtons = [fakeElement({ dataset: { mode: 'add' } }), fakeElement({ dataset: { mode: 'edit' } })];

  const saved = {
    document: globalThis.document, window: globalThis.window,
    FormData: globalThis.FormData, LTMedia: globalThis.LTMedia, confirm: globalThis.confirm
  };
  const LT41 = tree ? { tree, momentId: tree.moments[0]?.id, trees: [tree] } : null;
  globalThis.window = { LT41 };
  globalThis.document = { createElement: () => fakeElement(), querySelectorAll: () => modeButtons };
  // 패널은 HTMLFormElement를 그대로 FormData로 만든다. 최소 폼 데이터로 같은 경로를 태운다.
  globalThis.FormData = class {
    constructor(form) { this.pairs = Object.entries(form.elements).map(([key, field]) => [key, field.value ?? '']); }
    *[Symbol.iterator]() { yield* this.pairs; }
  };
  globalThis.LTMedia = { describe: url => ({ kind: url ? 'photo' : 'none', label: url ? '사진' : '' }), markup: () => '' };
  globalThis.confirm = () => true;

  const member = { snapshot: () => ({ owned, writable, dirty: false }), apply: (...args) => { calls.push(args); return {}; }, dispose() {} };
  const uploads = { busy, resets: 0, reset() { this.resets += 1; } };
  let openedJourney = 0, loginIntent = null, editorPanel = 0, recordsPanel = 0;
  const panels = createPanels({
    $: id => (els[id] ||= fakeElement()),
    getMember: () => member,
    getCurrent: () => view,
    getSource: () => source,
    getUploads: () => uploads,
    notify: text => notes.push(text),
    panel: id => { if (id === 'editor') editorPanel += 1; if (id === 'records') recordsPanel += 1; els[id] && (els[id].open = true); },
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
  };
  return {
    panels, els, calls, notes, modeButtons, uploads,
    counts: () => ({ openedJourney, loginIntent, editorPanel, recordsPanel }),
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
    assert.equal(h.els['editor-title'].textContent, '순간 추가');
    assert.equal(h.els['relation-label'].hidden, false, '추가 모드에는 연결 이유를 보여 준다');
    assert.equal(h.els['moment-management'].hidden, true);
    assert.equal(h.els['moment-form'].elements.emotion.value, '설렘', '기본 감정');
    assert.match(h.els['moment-form'].elements.date.value, /^\d{4}-\d{2}-\d{2}$/, '오늘 날짜');
    assert.equal(h.els['editor-context'].textContent, '새 순간 추가 · 첫 순간에서 이어집니다.');
    assert.equal(h.modeButtons[0].attrs['aria-current'], 'true');
    assert.equal(h.modeButtons[1].attrs['aria-current'], 'false');
    assert.equal(h.uploads.resets, 1, '모드를 바꾸면 업로드 상태를 비운다');
    h.els['editor'].open = true;
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
    assert.equal(h.els['editor-title'].textContent, '순간 수정');
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
    assert.equal(h.modeButtons[1].attrs['aria-current'], 'true');
    assert.deepEqual(h.calls, [], '모드 전환은 저장하지 않는다');
  } finally { h.restore(); }
});

test('setEditorMode(add, parentId)는 그 순간을 부모로 삼는다', () => {
  const h = harness({ tree: sampleTree() });
  try {
    window.LT41.momentId = 'm2';
    h.panels.setEditorMode('add', 'm1');
    assert.equal(h.els['editor-context'].textContent, '새 순간 추가 · 첫 순간에서 이어집니다.');
    assert.equal(h.els['parent-management'].hidden, true);
  } finally { h.restore(); }
});

test('파일 전송 중이거나 순간이 없으면 모드를 바꾸지 않는다', () => {
  const busy = harness({ tree: sampleTree(), busy: true });
  try {
    busy.panels.setEditorMode('edit');
    assert.equal(busy.els['editor-title'], undefined, '전송 중에는 모드를 바꾸지 않는다');
    assert.deepEqual(busy.notes, ['파일 전송을 마치거나 취소한 뒤 작업을 바꿔 주세요.']);
  } finally { busy.restore(); }
  const empty = harness({ tree: { id: 't', title: '빈', moments: [] } });
  try {
    empty.panels.setEditorMode('add');
    assert.deepEqual(empty.notes, ['먼저 순간을 선택해 주세요.']);
    assert.equal(empty.els['editor-title']?.textContent ?? '', '', '편집기 제목을 건드리지 않는다');
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
    assert.equal(readOnly.counts().recordsPanel, 1, '읽기 전용이면 기록 안내를 연다');
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
    assert.equal(add.els['editor-title'].textContent, '순간 추가', '트리가 있으면 추가 모드');
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
    h.els['editor'].open = true;
    form.onsubmit({ preventDefault() {}, target: form });
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0][0], 'add', '편집 모드를 그대로 쓴다');
    assert.equal(h.calls[0][1].note, '저장할 마음');
    assert.equal(h.calls[0][2].treeId, 'tree1', '선택을 그대로 넘긴다');
    assert.equal(h.els['editor'].open, false, '저장하면 닫는다');
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

// 2026-11-09 사고 수정(#245): '순간 남기기'(#write-menu) 연결이 옮겨지지 않아 운영에서 무반응이었다.
// 원래 shell.mjs(e508302) 460행 그대로 — 내 책장이면 새 트리, 나머지 화면이면 기본(추가) 편집기.
test('순간 남기기 버튼은 화면에 따라 새 트리 또는 추가 편집기를 연다', () => {
  const shelf = harness({ tree: sampleTree(), view: 'track32-bookshelf.html' });
  try {
    assert.equal(typeof shelf.els['write-menu'].onclick, 'function', '클릭 연결이 있어야 한다');
    shelf.els['write-menu'].onclick();
    assert.equal(shelf.counts().openedJourney, 1, '내 책장에서는 새 트리(첫 여정)를 연다');
    assert.equal(shelf.counts().editorPanel, 0);
  } finally { shelf.restore(); }

  const book = harness({ tree: sampleTree(), view: 'track59-sketchbook.html' });
  try {
    book.els['write-menu'].onclick();
    assert.equal(book.counts().editorPanel, 1, '기억책에서는 편집기를 연다');
    assert.equal(book.counts().openedJourney, 0);
    assert.equal(book.els['editor-title'].textContent, '순간 추가', '기본값은 추가 모드(인자 없음)');
  } finally { book.restore(); }
});
