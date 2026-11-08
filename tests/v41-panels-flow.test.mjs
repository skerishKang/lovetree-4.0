// 순간 패널·편집기 시험 (#231 1-B③-2 후속, 2026-11-09).
// 전: shell/panels.mjs 소스를 정규식으로 보던 시험(v41-moment-panel 5번 일부).
// 후: createPanels를 가짜 DOM으로 띄우고 openEditor·setEditorMode·formDirty·write-menu 연결을
//     상태 표로 직접 확인한다. 마크업·CSS 값 검사는 그 파일에 그대로 남긴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPanels } from '../public/v41/shell/panels.mjs';
import { fakeEl } from './helpers/fake-dom.mjs';

const TREE = {
  id: 'tree-1',
  title: '리센느',
  moments: [
    { id: 'm1', title: '첫 순간', note: '', emotion: '설렘', date: '2026-11-01', url: '', relation: '', parentId: null },
    { id: 'm2', title: '두 번째', note: '기억', emotion: '위로', date: '2026-11-02', url: '', relation: 'next', parentId: 'm1' }
  ]
};

class FakeFormData {
  constructor(form) { this.form = form; }
  * [Symbol.iterator]() {
    const values = this.form.values || {};
    for (const key of Object.keys(values)) yield [key, values[key]];
  }
}

function harness({
  source = 'server', owned = true, writable = true, current = 'track32-bookshelf.html',
  busy = false, confirmAnswer = true, lt41 = { tree: TREE, momentId: 'm1' }
} = {}) {
  const calls = { login: [], notify: [], panel: [], firstJourney: 0, reset: 0, apply: [] };
  const elements = {};
  const ids = [
    'change-parent', 'delete-moment', 'editor', 'editor-cancel', 'link-moment', 'manage-tree',
    'tree-cover', 'tree-delete', 'tree-manager', 'unlink-moment', 'write-menu',
    'parent-target', 'parent-relation', 'parent-management', 'parent-current',
    'editor-title', 'editor-context', 'relation-label', 'more-fields', 'form-error',
    'moment-management', 'tree-cover-hint', 'media-preview', 'quick-entry-hint', 'tree-form-error',
    'related-target', 'url-media-hint', 'media-preview-image', 'media-preview-text', 'quick-entry-hint-text'
  ];
  for (const id of ids) elements[id] = fakeEl();
  elements['parent-target'].value = '';
  elements['parent-relation'].value = '';
  for (const id of ['parent-target', 'related-target', 'tree-cover']) {
    elements[id].replaceChildren = () => {};
    elements[id].append = () => {};
  }
  elements['tree-manager'].open = false;
  elements['editor'].open = false;
  elements['moment-form'] = fakeEl({
    values: { title: '', note: '', url: '', emotion: '설렘', date: '2026-11-01', relation: '' },
    elements: {}
  });
  for (const name of ['title', 'note', 'url', 'emotion', 'date', 'relation']) {
    elements['moment-form'].elements[name] = fakeEl({ value: '' });
  }
  elements['moment-form'].elements.note.focus = () => { calls.noteFocused = (calls.noteFocused || 0) + 1; };
  elements['moment-form'].reset = () => {
    for (const name of Object.keys(elements['moment-form'].values)) elements['moment-form'].values[name] = '';
  };
  elements['tree-form'] = fakeEl({ values: {}, elements: { title: fakeEl({ value: '' }) } });

  const modeButtons = [fakeEl({ dataset: { mode: 'add' } }), fakeEl({ dataset: { mode: 'edit' } })];

  const saved = {
    document: globalThis.document, window: globalThis.window, LT41: globalThis.LT41,
    FormData: globalThis.FormData, confirm: globalThis.confirm, queueMicrotask: globalThis.queueMicrotask,
    LTMedia: globalThis.LTMedia
  };
  globalThis.window = globalThis;
  globalThis.LT41 = lt41;
  // 미디어 판별은 다른 모듈(전역 LTMedia)이 맡는다 — 여기서는 종류만 흉내 낸다.
  globalThis.LTMedia = {
    describe: (url) => ({ kind: /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url || '') ? 'photo' : 'link' }),
    isMediaUrl: () => false
  };
  globalThis.FormData = FakeFormData;
  globalThis.confirm = () => confirmAnswer;
  globalThis.queueMicrotask = (fn) => fn();
  globalThis.document = {
    querySelectorAll: (sel) => (sel === '[data-mode]' ? modeButtons : []),
    createElement: () => fakeEl({ value: '' })
  };

  let screen = current;
  const panels = createPanels({
    // 화면에 있는 나머지 요소는 이름만 있으면 되는 빈 요소로 채운다(셸과 같은 조회 방식).
    $: (id) => {
      if (!elements[id]) {
        elements[id] = fakeEl({ replaceChildren: () => {}, append: () => {}, appendChild: () => {} });
      }
      return elements[id];
    },
    getMember: () => ({
      snapshot: () => ({ owned, writable, subject: 's1' }),
      apply: (mode, payload, sel) => { calls.apply.push({ mode, payload, sel }); return { treeId: 'tree-1', momentId: 'm3' }; }
    }),
    getCurrent: () => screen,
    getSource: () => source,
    getUploads: () => ({ busy, reset: () => { calls.reset += 1; } }),
    notify: (msg) => calls.notify.push(msg),
    panel: (name) => calls.panel.push(name),
    show: (next) => { screen = next; },
    selection: () => ({ treeId: 'tree-1', momentId: 'm1' }),
    openFirstJourney: () => { calls.firstJourney += 1; },
    openLoginStart: (kind) => calls.login.push(kind)
  });

  const restore = () => {
    globalThis.document = saved.document;
    globalThis.window = saved.window;
    globalThis.LT41 = saved.LT41;
    globalThis.FormData = saved.FormData;
    globalThis.confirm = saved.confirm;
    globalThis.queueMicrotask = saved.queueMicrotask;
    globalThis.LTMedia = saved.LTMedia;
  };
  return { panels, elements, calls, modeButtons, restore, screen: () => screen, setScreen: (n) => { screen = n; } };
}

test('openEditor 분기 표: 로그아웃 → 로그인, 편집 불가 → 안내+기록, new → 첫 여정, add/edit → 편집기', () => {
  const cases = [
    {
      name: '로그아웃(예시 화면)',
      opts: { source: 'example', owned: false },
      mode: 'add',
      expect: { login: ['new-tree'], panel: [], firstJourney: 0, editorMode: 'add' }
    },
    {
      name: '로그아웃인데 서버 소스',
      opts: { source: 'server', owned: false },
      mode: 'edit',
      expect: { login: ['new-tree'], panel: [], firstJourney: 0, editorMode: 'add' }
    },
    {
      name: '로그인·편집 불가',
      opts: { owned: true, writable: false },
      mode: 'add',
      expect: { login: [], panel: ['records'], firstJourney: 0, editorMode: 'add' }
    },
    {
      name: '새 트리 요청',
      opts: {},
      mode: 'new',
      expect: { login: [], panel: [], firstJourney: 1, editorMode: 'add' }
    },
    {
      name: '순간 추가',
      opts: {},
      mode: 'add',
      expect: { login: [], panel: ['editor'], firstJourney: 0, editorMode: 'add' }
    },
    {
      name: '순간 수정',
      opts: {},
      mode: 'edit',
      expect: { login: [], panel: ['editor'], firstJourney: 0, editorMode: 'edit' }
    }
  ];
  for (const c of cases) {
    const h = harness(c.opts);
    try {
      h.panels.openEditor(c.mode);
      assert.deepEqual(h.calls.login, c.expect.login, `${c.name}: 로그인 이동`);
      assert.deepEqual(h.calls.panel, c.expect.panel, `${c.name}: 패널`);
      assert.equal(h.calls.firstJourney, c.expect.firstJourney, `${c.name}: 첫 여정`);
      assert.equal(h.panels.editorMode(), c.expect.editorMode, `${c.name}: 편집기 모드`);
      if (c.expect.panel.includes('editor')) {
        assert.equal(h.calls.noteFocused, 1, `${c.name}: 마음 한마디 칸에 초점`);
      }
    } finally { h.restore(); }
  }
});

test('openEditor: 모르는 요청은 트리가 있으면 추가, 없으면 새 트리로 떨어진다', () => {
  const withTree = harness({});
  try {
    withTree.panels.openEditor('bogus');
    assert.equal(withTree.panels.editorMode(), 'add');
    assert.deepEqual(withTree.calls.panel, ['editor']);
  } finally { withTree.restore(); }

  const withoutTree = harness({ lt41: null });
  try {
    withoutTree.panels.openEditor('bogus');
    assert.equal(withoutTree.calls.firstJourney, 1, '트리가 없으면 새 트리 = 첫 여정');
    assert.deepEqual(withoutTree.calls.panel, []);
  } finally { withoutTree.restore(); }
});

test('편집 불가 안내에는 읽을 수 있다는 말이 함께 나간다', () => {
  const h = harness({ owned: true, writable: false });
  try {
    h.panels.openEditor('add');
    assert.equal(h.calls.notify.length, 1);
    assert.match(h.calls.notify[0], /편집 연결이 아직 준비되지 않았어요/);
    assert.match(h.calls.notify[0], /기록은 안전하게 읽을 수 있습니다/);
  } finally { h.restore(); }
});

test('setEditorMode 표: 파일 전송 중·입력 있음이면 바꾸지 않고, 제목·안내·더 적기를 모드에 맞춘다', () => {
  const busy = harness({ busy: true });
  try {
    busy.panels.setEditorMode('edit');
    assert.match(busy.calls.notify[0], /파일 전송을 마치거나 취소한 뒤/);
    assert.equal(busy.panels.editorMode(), 'add', '모드가 바뀌지 않는다');
    assert.equal(busy.calls.reset, 0);
  } finally { busy.restore(); }

  const dirty = harness({ confirmAnswer: false });
  try {
    dirty.elements['editor'].open = true;
    dirty.elements['moment-form'].values.note = '쓰던 글';
    dirty.panels.setEditorMode('edit');
    assert.equal(dirty.panels.editorMode(), 'add', '확인을 거절하면 그대로');
  } finally { dirty.restore(); }

  const add = harness({});
  try {
    add.panels.setEditorMode('add');
    assert.equal(add.elements['editor-title'].textContent, '순간 추가');
    assert.equal(add.elements['relation-label'].hidden, false, '추가일 때만 연결 이유를 보여 준다');
    assert.equal(add.elements['more-fields'].open, false);
    assert.equal(add.elements['moment-management'].hidden, true);
    assert.equal(add.calls.reset, 1, '업로드 상태를 비운다');
    assert.match(add.elements['editor-context'].textContent, /^새 순간 추가 · /);
  } finally { add.restore(); }

  const edit = harness({});
  try {
    edit.panels.setEditorMode('edit');
    assert.equal(edit.elements['editor-title'].textContent, '순간 수정');
    assert.equal(edit.elements['relation-label'].hidden, true);
    assert.equal(edit.elements['more-fields'].open, true, '이미 적은 값이 있으면 더 적기를 펼친다');
    assert.equal(edit.elements['moment-management'].hidden, false);
    assert.equal(edit.elements['form-error'].textContent, '');
  } finally { edit.restore(); }

  const empty = harness({ lt41: { tree: TREE, momentId: 'm3' } });
  try {
    empty.panels.setEditorMode('edit');
    assert.equal(empty.calls.notify.at(-1), '먼저 순간을 선택해 주세요.');
    assert.equal(empty.panels.editorMode(), 'add', '고를 순간이 없으면 모드를 바꾸지 않는다');
  } finally { empty.restore(); }
});

test('setEditorMode·formDirty: 편집기를 닫았으면 입력이 남아도 변경 아님으로 본다', () => {
  const h = harness({});
  try {
    h.panels.setEditorMode('add');
    const baseline = h.elements['moment-form'].values;
    assert.equal(h.panels.formDirty(), false, '편집기가 닫혀 있으면 항상 false');
    h.elements['editor'].open = true;
    baseline.note = '새로 쓴 글';
    assert.equal(h.panels.formDirty(), true, '닫힌 뒤 열고 값을 넣으면 변경');
    baseline.note = '';
    assert.equal(h.panels.formDirty(), false, '기준값으로 돌아오면 변경 아님');
  } finally { h.restore(); }
});

test('formDirty: 이전 순간을 바꾸면 본문이 그대로여도 변경으로 본다', () => {
  const h = harness({});
  try {
    h.panels.setEditorMode('edit');
    h.elements['editor'].open = true;
    assert.equal(h.panels.formDirty(), false);
    h.elements['parent-management'].hidden = false;
    h.elements['parent-target'].value = 'm1';
    h.elements['parent-relation'].value = 'next';
    assert.equal(h.panels.formDirty(), true, '이전 순간 변경도 입력 변경이다');
  } finally { h.restore(); }
});

test('write-menu 연결: 내 책장에서는 새 트리(첫 여정), 다른 화면에서는 추가 편집기', () => {
  const shelf = harness({ current: 'track32-bookshelf.html' });
  try {
    assert.equal(typeof shelf.elements['write-menu'].onclick, 'function', 'write-menu가 연결돼 있다');
    shelf.elements['write-menu'].onclick();
    assert.equal(shelf.calls.firstJourney, 1, '내 책장에서는 첫 여정으로');
    assert.deepEqual(shelf.calls.panel, []);
  } finally { shelf.restore(); }

  for (const screen of ['src064-orbit.html', 'track59-sketchbook.html', 'track58-pinboard.html']) {
    const h = harness({ current: screen });
    try {
      h.elements['write-menu'].onclick();
      assert.equal(h.calls.firstJourney, 0, `${screen}: 첫 여정으로 보내지 않는다`);
      assert.deepEqual(h.calls.panel, ['editor'], `${screen}: 추가 편집기를 연다`);
      assert.equal(h.panels.editorMode(), 'add');
    } finally { h.restore(); }
  }
});

test('패널 탭 버튼은 각자 모드로 편집기를 바꾼다', () => {
  const h = harness({});
  try {
    assert.equal(h.modeButtons.length, 2);
    for (const b of h.modeButtons) {
      assert.equal(typeof b.onclick, 'function', `${b.dataset.mode} 탭이 연결돼 있다`);
    }
    h.modeButtons[1].onclick();
    assert.equal(h.panels.editorMode(), 'edit');
    h.modeButtons[0].onclick();
    assert.equal(h.panels.editorMode(), 'add');
  } finally { h.restore(); }
});

test('편집기 저장은 같은 member.apply 경로로 나간다', () => {
  const h = harness({});
  try {
    h.panels.setEditorMode('add');
    h.elements['editor'].open = true;
    h.elements['moment-form'].values.note = '저장할 글';
    let prevented = false;
    h.elements['moment-form'].onsubmit({ preventDefault() { prevented = true; }, target: h.elements['moment-form'] });
    assert.equal(prevented, true);
    assert.deepEqual(h.calls.apply.map((a) => a.mode), ['add']);
    assert.equal(h.calls.apply[0].payload.note, '저장할 글');
    assert.deepEqual(h.calls.apply[0].sel, { treeId: 'tree-1', momentId: 'm1' });
    assert.match(h.calls.notify.at(-1), /서버에 저장하고 있어요/);

    // 수정 모드에서는 같은 폼이 'edit'으로 나가야 한다(모드가 add로 굳으면 여기서 잡힌다).
    h.panels.setEditorMode('edit');
    h.elements['editor'].open = true;
    h.elements['moment-form'].onsubmit({ preventDefault() {}, target: h.elements['moment-form'] });
    assert.deepEqual(h.calls.apply.map((a) => a.mode), ['add', 'edit']);
  } finally { h.restore(); }
});
