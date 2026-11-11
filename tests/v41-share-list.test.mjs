import test from 'node:test';
import assert from 'node:assert/strict';
// #369 5: 이 트리의 공유 주소 목록 — 살아 있는 주소 위, 취소된 주소는 '지난 주소 N개' 접힘.
import { createMessages } from '../public/v41/shell/messages.mjs';

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

function listHarness({ shares = [], confirmAnswer = true, clipboard = null } = {}) {
  const saved = {window: globalThis.window, document: globalThis.document, location: globalThis.location, addEventListener: globalThis.addEventListener, confirm: globalThis.confirm};
  for (const key of ['window', 'document', 'location', 'addEventListener', 'confirm']) delete globalThis[key];
  const els = {};
  const events = {};
  const requests = [];
  globalThis.addEventListener = (type, fn) => { events[type] = fn; };
  globalThis.location = {origin: 'https://lovetree-4-0.pages.dev', hostname: 'lovetree-4-0.pages.dev', hash: ''};
  globalThis.document = {createElement: () => fakeElement(), querySelectorAll: () => []};
  globalThis.confirm = () => confirmAnswer;
  if (clipboard) Object.defineProperty(globalThis, 'navigator', {value: {clipboard}, configurable: true});
  globalThis.window = {LT41: {tree: {id: 'tree1', title: '윤슬', moments: [{id: 'm1', title: '첫 순간'}]}, momentId: 'm1', trees: [{id: 'tree1', moments: [{id: 'm1'}]}]}};
  els['community-panel'] = fakeElement();
  els['community-menu'] = fakeElement();
  els['account-entry'] = fakeElement();
  els['view'] = fakeElement();
  const shareApi = {
    preview: async () => ({ok: true, preview: {previewToken: 'tok', tree: {title: '윤슬', moments: []}}}),
    create: async payload => { requests.push(['create', payload]); return {ok: true, share: {id: 'share-new', view: 'book'}}; },
    list: async () => { requests.push(['list']); return {ok: true, shares}; },
    setDiscoverable: async (id, next) => { requests.push(['discoverable', id, next]); return {ok: true}; },
    revoke: async id => { requests.push(['revoke', id]); return {ok: true}; }
  };
  const messages = createMessages({
    $: id => (els[id] ||= fakeElement()),
    getCurrent: () => 'track59-sketchbook.html',
    setCurrent: () => {},
    getModel: () => globalThis.window.LT41,
    getSource: () => 'server',
    getMember: () => ({snapshot: () => ({owned: true, writable: true, dirty: false})}),
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
    exampleTree: {id: 'example', moments: []},
    journey: {}
  });
  return {
    messages, els, requests,
    restore: () => {
      for (const key of Object.keys(saved)) { if (saved[key] === undefined) delete globalThis[key]; else globalThis[key] = saved[key]; }
      if (clipboard) delete globalThis.navigator;
    }
  };
}

const share = (id, status, view = 'book', discoverable = false) => ({id, treeId: 'tree1', status, view, createdAt: '2026-11-12T09:00:00Z', discoverable});

test('살아 있는 주소가 위에 오고, 취소된 주소는 지난 주소 접힘 안에 들어간다', async () => {
  const h = listHarness({shares: [share('old-1', 'revoked'), share('live-1', 'active'), share('old-2', 'revoked'), share('live-2', 'active', 'board', true)]});
  try {
    await h.messages.openSharePanel();
    const rows = h.els['share-list'].children;
    assert.equal(rows.length, 3, '활성 2개 + 지난 주소 접힘 1개');
    assert.match(rows[0].className, /share-item/);
    assert.match(rows[1].className, /share-item/);
    assert.equal(rows[2].className, 'share-past');
    assert.equal(rows[2].children[0].textContent, '지난 주소 2개');
    assert.equal(rows[2].children[1].children[0].children[0].textContent, '공유 취소됨');
    assert.match(rows[2].children[1].className, /share-revoked/);
  } finally { h.restore(); }
});

test('살아 있는 주소마다 만든 날짜·처음 열 보기·복사·취소가 있다', async () => {
  const h = listHarness({shares: [share('live-1', 'active', 'board', true)]});
  try {
    await h.messages.openSharePanel();
    const row = h.els['share-list'].children[0];
    assert.equal(row.children[0].children[0].textContent, '공유 중 · 둘러보기에 올림');
    assert.match(row.children[0].children[1].textContent, /기억 보드 · 2026\. 11\. 12\.에 만든 주소/);
    const actions = row.children[1];
    assert.deepEqual(actions.children.map(b => b.textContent), ['둘러보기에서 내리기', '복사', '공유 취소']);
  } finally { h.restore(); }
});

test('취소는 한 번 확인하고, 거절하면 서버에 보내지 않는다', async () => {
  const h = listHarness({shares: [share('live-1', 'active')], confirmAnswer: false});
  try {
    await h.messages.openSharePanel();
    const revoke = h.els['share-list'].children[0].children[1].children[2];
    await revoke.onclick();
    assert.deepEqual(h.requests.filter(r => r[0] === 'revoke'), [], '거절하면 보내지 않는다');
  } finally { h.restore(); }
});

test('취소를 확인하면 회수하고 안내를 남긴다', async () => {
  const h = listHarness({shares: [share('live-1', 'active')]});
  try {
    await h.messages.openSharePanel();
    const revoke = h.els['share-list'].children[0].children[1].children[2];
    await revoke.onclick();
    assert.deepEqual(h.requests.filter(r => r[0] === 'revoke'), [['revoke', 'live-1']]);
    assert.match(h.els['share-feedback'].textContent, /공유를 취소했어요/);
  } finally { h.restore(); }
});

test('복사는 그 주소의 공유 주소를 클립보드에 넣는다', async () => {
  const written = [];
  const h = listHarness({shares: [share('live-1', 'active', 'network')], clipboard: {writeText: async value => written.push(value)}});
  try {
    await h.messages.openSharePanel();
    const copy = h.els['share-list'].children[0].children[1].children[1];
    await copy.onclick();
    assert.deepEqual(written, ['https://lovetree-4-0.pages.dev/v41/#share/live-1/network']);
    assert.match(h.els['share-feedback'].textContent, /복사했어요/);
  } finally { h.restore(); }
});

test('만든 공유가 없으면 안내 한 줄만 남는다', async () => {
  const h = listHarness({shares: []});
  try {
    await h.messages.openSharePanel();
    assert.equal(h.els['share-list'].children.length, 1);
    assert.equal(h.els['share-list'].children[0].textContent, '아직 만든 공유 주소가 없어요.');
  } finally { h.restore(); }
});
