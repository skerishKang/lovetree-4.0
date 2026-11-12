import test from 'node:test';
import assert from 'node:assert/strict';
// #369 5: 이 트리의 공유 주소 목록 — 살아 있는 주소 위, 취소된 주소는 '지난 주소 N개' 접힘.
import { createMessages } from '../public/v41/shell/messages.mjs';
import { createTree } from '../src/domain.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createMemoryShareRepo } from '../server/testing/memory-share-repo.js';
import { createShareHandler, createShareService } from '../server/share-service.js';

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
    // #480 L13: 날짜는 책·보드·지도와 같은 한 벌(formatDisplayDate)을 지난다 — 늘 dot이면 \"2026. 11. 12\"(끝에 점 없음).\n    assert.match(row.children[0].children[1].textContent, /기억 보드 · 2026\. 11\. 12에 만든 주소/);
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

// 이슈 #466 T2: 위 시험들의 share()는 클라이언트가 스스로 날조한 모양(ISO createdAt 등)을 쓴다.
// 서버가 createdAt 형식이나 status/discoverable 값의 이름을 바꿔도 클라 시험(날조)과 서버 시험(필드 존재만)이
// 각각 따로 통과할 수 있어, 실배포에서만 깨질 수 있다. 여기서는 실제 share-service(메모리 저장소)가
// 만든 진짜 GET /api/shares 응답을 그대로 클라 렌더러에 먹여 한 줄 왕복을 고정한다.
test('실제 서버(share-service)가 만든 목록 응답을 클라 렌더러가 그대로 그린다(서버↔클라 교차 검증)', async () => {
  const PRODUCT = 'lovetree-test', CLOCK = '2026-11-12T09:00:00.000Z';
  const tree = createTree({subject: '윤슬', title: '첫 장면', note: '마음', emotion: '설렘', date: '2026-11-12', url: ''}, CLOCK);
  const workspaceRepo = createMemoryWorkspaceRepo();
  const workspace = createWorkspaceService({repo: workspaceRepo, productId: PRODUCT});
  await workspace.write({productId: PRODUCT, subjectId: 'alice'}, {state: {version: 1, trees: [tree]}, expectedRevision: 0, clientKey: 'seed'});
  const shareRepo = createMemoryShareRepo();
  let n = 0;
  const service = createShareService({shareRepo, workspaceRepo, productId: PRODUCT, makeId: () => String(++n).padStart(24, 's')});
  const handle = createShareHandler({authenticate: async () => ({productId: PRODUCT, subjectId: 'alice'}), service, productId: PRODUCT});
  const request = (method, path, body) => handle({method, path, headers: body ? {'content-type': 'application/json'} : {}, body: body ? JSON.stringify(body) : ''});

  const input = {treeId: tree.id, entryMomentId: tree.moments[0].id, view: 'network'};
  const preview = await request('POST', '/api/shares/preview', input);
  const created = await request('POST', '/api/shares', {...input, previewToken: preview.body.preview.previewToken});
  assert.equal(created.status, 201);
  const listed = await request('GET', '/api/shares');
  assert.equal(listed.status, 200);
  const [realShare] = listed.body.shares;
  // 서버 산출물 그대로(날조 없음) — status·view·discoverable·createdAt 전부 서버가 준 값.
  assert.equal(realShare.id, created.body.share.id);
  assert.equal(realShare.status, 'active');
  assert.equal(realShare.view, 'network');
  assert.equal(realShare.discoverable, false);

  const h = listHarness({shares: listed.body.shares});
  try {
    globalThis.window.LT41.tree.id = tree.id; // 목록은 window.LT41.tree.id와 같은 treeId만 보여 준다
    await h.messages.openSharePanel();
    const row = h.els['share-list'].children[0];
    assert.match(row.className, /share-item/, '서버가 준 status="active"를 살아 있는 주소로 그린다(지난 주소 접힘 아님)');
    assert.equal(row.children[0].children[0].textContent, '공유 중 · 주소로만 공개');
    assert.match(row.children[0].children[1].textContent, /관계 지도 · .+에 만든 주소/, '서버의 createdAt을 Invalid Date 없이 날짜로 그린다');
    assert.doesNotMatch(row.children[0].children[1].textContent, /Invalid Date/);
  } finally { h.restore(); }
});
