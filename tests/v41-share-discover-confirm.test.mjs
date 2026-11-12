// #480 M7: "둘러보기 기본 켬"이 확인 없이 공개되지 않는다.
// 예전: 설정이 기본 켬이면 링크를 만든 직후 체크박스만 프로그램으로 켰다 → 스위치는 켜졌는데 실제로는
// '주소로만 공개'(setDiscoverable이 안 돌고 확인창도 없음) = 거짓 상태.
// 지금: 링크를 만든 직후 '스위치를 켤 때와 같은 확인창'을 한 번 띄우고, 승인하면 실제 setDiscoverable까지 간다.
//       거절하면 스위치는 꺼짐. 프로그램으로 체크만 켜는 길은 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMessages } from '../public/v41/shell/messages.mjs';

const MESSAGES_SRC = readFileSync(new URL('../public/v41/shell/messages.mjs', import.meta.url), 'utf8');

function fakeElement(extra = {}) {
  const node = {
    value: '', textContent: '', hidden: false, open: false, disabled: false, checked: false,
    children: [], attrs: {}, dataset: {}, className: '',
    addEventListener() {},
    setAttribute(name, value) { this.attrs[name] = value; },
    getAttribute(name) { return this.attrs[name] ?? null; },
    replaceChildren() { this.children = []; },
    append(...kids) { this.children.push(...kids); },
    select() { this.selected = true; },
    focus() { this.focused = true; },
    click() { this.clicked = (this.clicked || 0) + 1; },
    close() { this.open = false; },
    showModal() { this.open = true; },
    querySelector: () => fakeElement(),
    querySelectorAll: () => []
  };
  return Object.assign(node, extra);
}

// 확인창 문구는 제품 코드가 쓰는 그 문구 하나여야 한다(스위치를 켤 때와 '같은' 확인창).
const SWITCH_CONFIRM = '이 트리를 둘러보기 목록에 올릴까요? 주소만 만든 상태와 달리 제목·대상·공개 순간이 둘러보기에 나타납니다.';

function harness({ confirmAnswer = true, defaultDiscover = true, createFails = false } = {}) {
  const saved = {};
  for (const key of ['window', 'document', 'location', 'addEventListener', 'confirm']) {
    saved[key] = globalThis[key];
    delete globalThis[key];
  }
  const els = {};
  const requests = [];
  const confirms = [];
  globalThis.addEventListener = () => {};
  globalThis.location = { origin: 'https://example.test', hostname: 'lovetree-4-0.pages.dev', hash: '' };
  globalThis.document = { createElement: () => fakeElement(), querySelectorAll: () => [] };
  globalThis.confirm = (text) => { confirms.push(text); return confirmAnswer; };
  globalThis.window = { LT41: { tree: { id: 'tree1', title: '윤슬', moments: [{ id: 'm1', title: '첫 순간'}] }, momentId: 'm1', trees: [{ id: 'tree1', moments: [{ id: 'm1' }] }] } };

  const shareApi = {
    preview: async () => ({ ok: true, preview: { previewToken: 'tok', tree: { title: '윤슬', moments: [] } } }),
    create: async (payload) => {
      requests.push(['create', payload]);
      return createFails ? { ok: false, message: '만들지 못했어요' } : { ok: true, share: { id: 'share-new', view: 'book' } };
    },
    list: async () => { requests.push(['list']); return { ok: true, shares: [] }; },
    setDiscoverable: async (id, next) => { requests.push(['discoverable', id, next]); return { ok: true }; },
    revoke: async () => ({ ok: true })
  };

  createMessages({
    $: id => (els[id] ||= fakeElement()),
    getCurrent: () => 'track59-sketchbook.html',
    setCurrent: () => {},
    getModel: () => globalThis.window.LT41,
    getSource: () => 'server',
    getMember: () => ({ snapshot: () => ({ owned: true, writable: true, dirty: false }) }),
    shareApi,
    notify: () => {},
    panel: () => {},
    show: () => {},
    links: () => {},
    writeLocation: () => {},
    choose: () => {},
    openEditor: () => {},
    openLoginStart: () => {},
    openAccountMenu: () => {},
    sample: () => {},
    applyTheme: () => {},
    paintThemeControls: () => {},
    viewForFile: () => 'book',
    exampleTree: { id: 'example', moments: [] },
    journey: {},
    getShareDefaults: () => ({ view: 'book', discover: defaultDiscover })
  });

  return {
    els, requests, confirms,
    // 링크 만들기: 미리보기 → '링크 만들기'. 단계 검사를 통과해야 만들어진다.
    async createLink() {
      els['share-moment'].value = 'm1';
      els['share-view'].value = 'book';
      await els['share-preview'].onclick();
      await els['share-create'].onclick();
    },
    restore() {
      for (const key of Object.keys(saved)) { if (saved[key] === undefined) delete globalThis[key]; else globalThis[key] = saved[key]; }
    }
  };
}

test('기본 켬 + 승인: 확인창 한 번 → 실제로 공개까지 간다(전: 확인 없이 체크만 켜짐)', async () => {
  const h = harness({ confirmAnswer: true, defaultDiscover: true });
  try {
    await h.createLink();
    assert.deepEqual(h.confirms, [SWITCH_CONFIRM], '스위치를 켤 때와 같은 확인창을 한 번 띄운다');
    assert.deepEqual(h.requests.filter(r => r[0] === 'discoverable'), [['discoverable', 'share-new', true]], '승인하면 실제 setDiscoverable까지 간다');
    assert.equal(h.els['share-discover'].checked, true, '스위치는 켜짐으로 맞춰진다(이제 사실과 같다)');
    assert.match(h.els['share-feedback'].textContent, /둘러보기에 올렸어요/);
  } finally { h.restore(); }
});

test('기본 켬 + 거절: 확인 한 번, 공개 안 함, 스위치는 꺼짐(전: 체크만 켜져 거짓 상태)', async () => {
  const h = harness({ confirmAnswer: false, defaultDiscover: true });
  try {
    await h.createLink();
    assert.deepEqual(h.confirms, [SWITCH_CONFIRM], '한 번 묻는다');
    assert.deepEqual(h.requests.filter(r => r[0] === 'discoverable'), [], '거절하면 서버에 공개 요청을 보내지 않는다');
    assert.equal(h.els['share-discover'].checked, false, '거절하면 스위치는 꺼짐');
    assert.equal(h.els['share-discover'].disabled, false, '스위치는 다시 만질 수 있다');
  } finally { h.restore(); }
});

test('기본 꺼짐: 확인창도 공개 요청도 없다(지금과 같다)', async () => {
  const h = harness({ confirmAnswer: true, defaultDiscover: false });
  try {
    await h.createLink();
    assert.deepEqual(h.confirms, [], '기본 꺼짐이면 묻지 않는다');
    assert.deepEqual(h.requests.filter(r => r[0] === 'discoverable'), []);
    assert.equal(h.els['share-discover'].checked, false);
    assert.equal(h.els['share-discover'].disabled, false, '링크를 만든 뒤 스위치는 만질 수 있다');
  } finally { h.restore(); }
});

test('사용자가 스위치를 직접 켜도 같은 확인창을 지난다', async () => {
  const h = harness({ confirmAnswer: true, defaultDiscover: false });
  try {
    await h.createLink();
    h.els['share-discover'].checked = true;
    await h.els['share-discover'].onchange();
    assert.deepEqual(h.confirms, [SWITCH_CONFIRM], '직접 켜도 같은 문구로 묻는다');
    assert.deepEqual(h.requests.filter(r => r[0] === 'discoverable'), [['discoverable', 'share-new', true]]);
  } finally { h.restore(); }
});

test('링크 만들기가 실패하면 확인창도 공개도 없다', async () => {
  const h = harness({ confirmAnswer: true, defaultDiscover: true, createFails: true });
  try {
    await h.createLink();
    assert.deepEqual(h.confirms, [], '만들지 못했으면 묻지 않는다');
    assert.deepEqual(h.requests.filter(r => r[0] === 'discoverable'), []);
  } finally { h.restore(); }
});

test('코드 계약: 프로그램으로 체크만 켜는 길이 없다', () => {
  // 예전 동작(확인 없이 체크박스만 켬)은 없어졌다.
  assert.doesNotMatch(MESSAGES_SRC, /\$\('share-discover'\)\.checked = getShareDefaults\(\)\.discover;/);
  // 켜는 곳은 확인을 지나는 setDiscoverable 한 곳뿐이다.
  assert.match(MESSAGES_SRC, /const DISCOVER_CONFIRM = '이 트리를 둘러보기 목록에 올릴까요\? 주소만 만든 상태와 달리 제목·대상·공개 순간이 둘러보기에 나타납니다\.';/);
  assert.match(MESSAGES_SRC, /if \(next && ask && !confirm\(DISCOVER_CONFIRM\)\) \{ box\.checked = false; return false; \}/);
  assert.match(MESSAGES_SRC, /if \(getShareDefaults\(\)\.discover\) await setDiscoverable\(answer\.share\.id, true, \{ask: true\}\);/);
  // 스위치를 직접 켜는 길도 같은 확인을 지난다.
  assert.match(MESSAGES_SRC, /\$\('share-discover'\)\.onchange = async \(\) => \{[\s\S]{0,200}await setDiscoverable\(shareId, next, \{ask: next\}\);/);
  // 공개 요청 뒤에는 서버가 정한 값으로 스위치를 맞춘다(거짓 상태가 남지 않는다).
  assert.match(MESSAGES_SRC, /if \(!answer\.ok\) \{ box\.checked = !next;[\s\S]{0,200}box\.checked = next;/);
});
