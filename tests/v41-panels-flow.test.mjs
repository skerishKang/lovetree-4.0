// 순간 패널·편집기 시험 (#231 1-B③-2 후속, 2026-11-09).
// 전: shell/panels.mjs 소스를 정규식으로 보던 시험(v41-moment-panel 5번 일부).
// 후: createPanels를 가짜 DOM으로 띄우고 openEditor·setEditorMode·formDirty·write-menu 연결을
//     상태 표로 직접 확인한다. 마크업·CSS 값 검사는 그 파일에 그대로 남긴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPanels } from '../public/v41/shell/panels.mjs';
import { fakeEl, fakeRadioGroup } from './helpers/fake-dom.mjs';

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
    // 순간 폼은 값 표(values)를 쓴다. 책 정보 폼은 실제 폼처럼 컨트롤에서 직렬화한다
    // (라디오는 체크된 것만 — #314가 저장 FormData로 새어 나오는지 보려면 이 경로가 필요하다).
    if (this.form.values) {
      for (const key of Object.keys(this.form.values)) yield [key, this.form.values[key]];
      return;
    }
    for (const [name, control] of Object.entries(this.form.elements || {})) yield [name, String(control?.value ?? '')];
  }
}

function harness({
  source = 'server', owned = true, writable = true, current = 'track32-bookshelf.html',
  busy = false, confirmAnswer = true, lt41 = { tree: TREE, momentId: 'm1' }
} = {}) {
  const calls = { login: [], notify: [], panel: [], firstJourney: 0, reset: 0, apply: [], writeOpen: [], writeShow: [] };
  const elements = {};
  const ids = [
    'change-parent', 'delete-moment', 'editor-cancel', 'link-moment', 'manage-tree',
    'tree-cover', 'tree-delete', 'tree-manager', 'unlink-moment', 'write-menu',
    'tree-cover-method', 'tree-cover-moment-box', 'tree-photo-cover',
    'parent-target', 'parent-relation', 'parent-management', 'parent-current',
    'write-panel', 'write-tabs', 'write-tab-easy', 'write-tab-detailed', 'write-easy', 'write-detailed',
    'write-panel-title', 'write-eyebrow', 'editor-context', 'relation-label', 'more-fields', 'form-error',
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
  elements['write-panel'].open = false;
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
  // #314: 책 정보 폼은 실제 컨트롤에서 FormData를 만든다 — 라디오 묶음은 Chromium 실측 동작을 흉내 낸다.
  elements['tree-form'] = fakeEl({ elements: {
    title: fakeEl({ value: '' }),
    subject: fakeEl({ value: '' }),
    coverMomentId: elements['tree-cover'],
    // #380 5번: 표지 방법 한 줄(첫 순간(기본)·순간에서·디자인·사진).
    coverMode: fakeRadioGroup(['basic', 'moment', 'design', 'photo']),
    coverDesign: fakeRadioGroup(['', 'texture-1', 'texture-2', 'texture-3', 'texture-4', 'texture-5', 'texture-6'])
  } });
  // #256-3 2단계: 책 정보 창에 사진 업로더가 실린다 — 최소 미디어 슬롯 흉내.
  const coverSlotParts = { '[data-media-file]': fakeEl(), '[data-upload-status]': fakeEl(), '[data-stop]': fakeEl() };
  const coverSlot = fakeEl({ innerHTML: '' });
  coverSlot.querySelector = sel => coverSlotParts[sel] || null;
  elements['tree-form'].querySelector = sel => sel === '[data-media-slot]' ? coverSlot : null;
  elements['tree-cover-upload'] = fakeEl({ hidden: true });
  elements['tree-cover-title'] = fakeEl({ value: '' });


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
    querySelectorAll: () => [],
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
    openLoginStart: (kind) => calls.login.push(kind),
    // #425: 한 창의 탭 — 어느 구역을 보여 줬는지 기록한다.
    writePanel: {
      open: (tab) => { calls.writeOpen.push(tab ?? 'from-settings'); },
      show: (tab) => { calls.writeShow.push(tab); },
      setTabsVisible: (visible) => { calls.writeTabsVisible = visible; }
    }
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
  return { panels, elements, calls, coverSlotParts, lt41, restore, screen: () => screen, setScreen: (n) => { screen = n; } };
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
      expect: { login: [], panel: ['write-panel'], firstJourney: 0, editorMode: 'add' }
    },
    {
      name: '순간 수정',
      opts: {},
      mode: 'edit',
      expect: { login: [], panel: ['write-panel'], firstJourney: 0, editorMode: 'edit' }
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
      if (c.expect.panel.includes('write-panel')) {
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
    assert.deepEqual(withTree.calls.panel, ['write-panel']);
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
    dirty.elements['write-panel'].open = true;
    dirty.elements['moment-form'].values.note = '쓰던 글';
    dirty.panels.setEditorMode('edit');
    assert.equal(dirty.panels.editorMode(), 'add', '확인을 거절하면 그대로');
  } finally { dirty.restore(); }

  const add = harness({});
  try {
    add.panels.setEditorMode('add');
    assert.equal(add.elements['write-panel-title'].textContent, '순간 추가');
    assert.equal(add.elements['relation-label'].hidden, false, '추가일 때만 연결 이유를 보여 준다');
    assert.equal(add.elements['more-fields'].open, false);
    assert.equal(add.elements['moment-management'].hidden, true);
    assert.equal(add.calls.reset, 1, '업로드 상태를 비운다');
    assert.match(add.elements['editor-context'].textContent, /^새 순간 추가 · /);
  } finally { add.restore(); }

  const edit = harness({});
  try {
    edit.panels.setEditorMode('edit');
    assert.equal(edit.elements['write-panel-title'].textContent, '순간 수정');
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
    h.elements['write-panel'].open = true;
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
    h.elements['write-panel'].open = true;
    assert.equal(h.panels.formDirty(), false);
    h.elements['parent-management'].hidden = false;
    h.elements['parent-target'].value = 'm1';
    h.elements['parent-relation'].value = 'next';
    assert.equal(h.panels.formDirty(), true, '이전 순간 변경도 입력 변경이다');
  } finally { h.restore(); }
});

// 2026-11-09 #빠른 추가 ②: '순간 남기기'는 이제 고르기 창(빠른 추가/자세한 추가)을 연다.
// 연결은 shell.mjs가 createQuickAdd에 넘기고, 분기(책장→자세한 'new'·나머지→'add') 시험은
// tests/v41-quick-add-flow.test.mjs가 createQuickAdd를 직접 불러 본다. panels는 편집기만 맡는다.
test('write-menu 연결은 shell/quick-add.mjs가 맡는다 — panels가 다시 연결하지 않는다', () => {
  const shelf = harness({ current: 'track32-bookshelf.html' });
  try {
    assert.equal(shelf.elements['write-menu'].onclick, undefined, 'panels는 write-menu를 연결하지 않는다(고르기 창은 셸 몫)');
  } finally { shelf.restore(); }
});

test('순간 추가 한 창(#425): 더하기는 자세한 추가 구역을, 수정은 탭 없이 제목 "순간 수정"으로 연다', () => {
  const add = harness({});
  try {
    add.panels.setEditorMode('add');
    assert.deepEqual(add.calls.writeShow, ['detailed'], '더하기는 탭을 보여 주고 자세한 추가 구역');
    assert.equal(add.calls.writeTabsVisible, true, '탭 줄이 보인다');
  } finally { add.restore(); }

  const edit = harness({});
  try {
    edit.panels.setEditorMode('edit');
    assert.equal(edit.calls.writeTabsVisible, false, '수정에는 탭 줄이 없다');
    assert.equal(edit.elements['write-panel-title'].textContent, '순간 수정');
  } finally { edit.restore(); }
});

test('편집기 저장은 같은 member.apply 경로로 나간다', () => {
  const h = harness({});
  try {
    h.panels.setEditorMode('add');
    h.elements['write-panel'].open = true;
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
    h.elements['write-panel'].open = true;
    h.elements['moment-form'].onsubmit({ preventDefault() {}, target: h.elements['moment-form'] });
    assert.deepEqual(h.calls.apply.map((a) => a.mode), ['add', 'edit']);
  } finally { h.restore(); }
});

// #314 (2026-11-09): 책 정보 관리 창을 다른 책으로 바꿔 열면 이전 책의 디자인 표지가 남아
// 그대로 저장됐다. RadioNodeList.value = ''는 체크를 풀지 않는다(Chromium 1254 실측).
const TREE_A = {
  id: 'tree-a', title: '하루의 조각', subject: '하루', coverDesign: 'texture-3', coverMomentId: '',
  moments: [
    { id: 'a1', title: '아침', note: '', emotion: '설렘', date: '2026-11-01', url: '', relation: '', parentId: null },
    { id: 'a2', title: '사진', note: '', emotion: '설렘', date: '2026-11-02', url: 'https://example.test/a.jpg', relation: 'next', parentId: 'a1' }
  ]
};
const TREE_B = {
  id: 'tree-b', title: '겨울 정원', subject: '겨울', coverDesign: '', coverMomentId: '',
  moments: [
    { id: 'b1', title: '눈', note: '', emotion: '설렘', date: '2026-11-03', url: '', relation: '', parentId: null }
  ]
};

test('#314 회귀: 책 A(격자) → B(디자인 없음) → 다시 A를 연속으로 열어도 폼이 책마다 다시 정해진다', () => {
  const h = harness({ lt41: { tree: TREE_A, momentId: 'a1' } });
  try {
    const form = h.elements['tree-form'];
    const checked = () => [...form.elements.coverDesign].filter(r => r.checked).map(r => r.value);
    const savedValue = () => Object.fromEntries(new FormData(form)).coverDesign;
    const open = (tree) => { h.lt41.tree = tree; h.panels.openTreeManager(); };

    open(TREE_A);
    assert.deepEqual(checked(), ['texture-3'], 'A는 저장된 격자가 선택돼 있다');
    assert.equal(savedValue(), 'texture-3', 'A에서 저장하면 격자가 나간다');
    assert.equal(form.elements.title.value, '하루의 조각');
    assert.equal(form.elements.subject.value, '하루');

    // 이전 책에서 남은 업로드 안내·파일이 새 책 창에 남지 않는다.
    h.coverSlotParts['[data-upload-status]'].textContent = '이전 책에서 올린 사진 안내';
    h.coverSlotParts['[data-media-file]'].value = 'C:\fakepath\cover.png';

    open(TREE_B);
    assert.deepEqual(checked(), [''], 'B는 디자인이 없으므로 기본(빈 값) — 이전 책의 격자가 남지 않는다');
    assert.equal(savedValue(), '', 'B에서 그대로 저장하면 빈 값이 나간다');
    assert.equal(form.elements.title.value, '겨울 정원', '제목도 B 값으로 바뀐다');
    assert.equal(form.elements.subject.value, '겨울', '대상도 B 값으로 바뀐다');
    assert.equal(h.elements['tree-cover'].value, 'b1', '사진 표지 select도 B 기준(첫 순간)으로');
    assert.equal(h.elements['tree-cover-title'].value, '', '새 사진 제목 칸도 빈다');
    assert.equal(h.elements['tree-photo-cover'].hidden, true, '사진 표지 안내도 B 기준으로 숨는다');
    assert.match(h.elements['tree-cover-hint'].textContent, /첫 순간/, '안내 문구도 B 기준');
    assert.equal(h.coverSlotParts['[data-upload-status]'].textContent, '', '이전 책의 업로드 안내가 남지 않는다');
    assert.equal(h.coverSlotParts['[data-media-file]'].value, '', '이전 책에서 고른 파일이 남지 않는다');

    open(TREE_A);
    assert.deepEqual(checked(), ['texture-3'], '다시 A를 열면 저장된 격자가 돌아온다');
    assert.equal(h.elements['tree-cover'].value, 'a1', 'A의 표지 select도 다시 A 값(첫 순간)으로');

    // 사진 표지가 있는 책과 없는 책의 안내가 서로 새지 않는다.
    // #380 5번: 사진 표지는 '순간에서'(사진 순간) 또는 '사진' 방법일 때 안내가 보인다.
    // 실제 저장본의 순간처럼 type='photo'·image를 가진 순간을 표지로 고른 경우.
    const photoTree = { ...TREE_A, coverDesign: '', coverMomentId: 'a2', moments: TREE_A.moments.map(m => m.id === 'a2' ? { ...m, type: 'photo', image: m.url } : m) };
    open(photoTree);
    assert.equal(h.elements['tree-photo-cover'].hidden, false, '사진 순간을 표지로 쓰는 책에서는 안내가 보인다');
    assert.match(h.elements['tree-cover-hint'].textContent, /“사진”의 사진을 표지로 사용합니다/);
    open(TREE_B);
    assert.equal(h.elements['tree-photo-cover'].hidden, true, '사진 표지가 없는 책에서는 다시 숨는다');
  } finally { h.restore(); }
});

test('#314 회귀: 사진으로 표지를 만든 뒤 책 정보 저장을 다시 눌러도 디자인이 섞이지 않는다', () => {
  const photo = { id: 'b-photo', title: '사진으로 남긴 순간', note: '', emotion: '설렘', date: '2026-11-04', url: 'https://example.test/p.jpg', relation: '', parentId: 'b1' };
  const h = harness({ lt41: { tree: TREE_A, momentId: 'a1' } });
  try {
    const form = h.elements['tree-form'];
    // 이슈 재현 순서: A(격자)를 열었다가 닫고, 디자인 없는 B를 연다.
    h.panels.openTreeManager();
    h.lt41.tree = TREE_B;
    h.panels.openTreeManager();
    // 업로드 성공 직후의 상태: 모델·select에 새 사진 순간이 반영된다(makeCoverFromUpload가 하는 일).
    h.lt41.tree = { ...TREE_B, coverMomentId: 'b-photo', moments: [...TREE_B.moments, photo] };
    h.elements['tree-cover'].value = 'b-photo';
    for (const radio of form.elements.coverMode) radio.checked = radio.value === 'photo';
    // 창 아래 '책 정보 저장'을 다시 누른다.
    form.onsubmit({ preventDefault() {}, target: form });
    const last = h.calls.apply.at(-1);
    assert.equal(last.mode, 'editTree');
    assert.equal(last.payload.coverDesign, '', '다른 책(A)의 격자가 사진 표지 저장에 섞이지 않는다');
    assert.equal(last.payload.coverMomentId, 'b-photo', '표지는 사진 순간으로 저장된다');
    assert.equal(last.payload.title, '겨울 정원', '저장 제목은 B 그대로다');
  } finally { h.restore(); }
});
