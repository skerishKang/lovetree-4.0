import test from 'node:test';
import assert from 'node:assert/strict';
// #369 5: 이 트리의 공유 주소 목록 — 살아 있는 주소 위, 취소된 주소는 '지난 주소 N개' 접힘.
import { createMessages } from '../public/v41/shell/messages.mjs';
import { createTree } from '../src/domain.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createMemoryShareRepo } from '../server/testing/memory-share-repo.js';
import { createShareHandler, createShareService } from '../server/share-service.js';
import { shareUrlFor, SHARE_COPY_FAILURE } from '../public/v41/share-link.mjs';

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
    querySelectorAll: () => [],
    classList: { items:new Set(), add(...v){v.forEach(x=>this.items.add(x))}, remove(...v){v.forEach(x=>this.items.delete(x))}, toggle(v,on){if(on===undefined)on=!this.items.has(v);on?this.items.add(v):this.items.delete(v);return on}, contains(v){return this.items.has(v)} }
  };
  return Object.assign(node, extra);
}

function listHarness({ shares = [], confirmAnswer = true, clipboard = null } = {}) {
  const saved = {window: globalThis.window, document: globalThis.document, location: globalThis.location, addEventListener: globalThis.addEventListener, confirm: globalThis.confirm, LT41Confirm: globalThis.LT41Confirm};
  for (const key of ['window', 'document', 'location', 'addEventListener', 'confirm']) delete globalThis[key];
  const els = {};
  const events = {};
  const requests = [];
  globalThis.addEventListener = (type, fn) => { events[type] = fn; };
  globalThis.location = {origin: 'https://lovetree-4-0.pages.dev', hostname: 'lovetree-4-0.pages.dev', hash: ''};
  globalThis.document = {createElement: () => fakeElement(), createElementNS: (ns, tag) => fakeElement({tagName: String(tag), namespaceURI: String(ns)}), querySelectorAll: () => []};
  globalThis.confirm = () => confirmAnswer;
  globalThis.LT41Confirm = {ask: async () => confirmAnswer};
  if (clipboard) Object.defineProperty(globalThis, 'navigator', {value: {clipboard}, configurable: true});
  globalThis.window = {LT41: {tree: {id: 'tree1', title: '윤슬', moments: [{id: 'm1', title: '첫 순간'}]}, momentId: 'm1', trees: [{id: 'tree1', moments: [{id: 'm1'}]}]}};
  els['community-panel'] = fakeElement();
  els['community-menu'] = fakeElement();
  els['account-entry'] = fakeElement();
  els['view'] = fakeElement();
  const shareApi = {
    preview: async () => ({ok: true, preview: {previewToken: 'tok', tree: {title: '윤슬', moments: []}}}),
    create: async payload => { requests.push(['create', payload]); return {ok: true, share: {id: 'share-new', view: 'book'}}; },
    list: async cursor => {
      requests.push(cursor ? ['list', cursor] : ['list']);
      if (shares.length <= 50) return {ok:true, shares, nextCursor:null};
      return cursor ? {ok:true, shares:shares.slice(50), nextCursor:null}
        : {ok:true, shares:shares.slice(0,50), nextCursor:'more-share-list'};
    },
    setDiscoverable: async (id, next) => { requests.push(['discoverable', id, next]); return {ok: true}; },
    revoke: async id => { requests.push(['revoke', id]); return {ok: true}; },
    getTreeDiscover: async () => ({ok: true, discover: false}),
    setTreeDiscover: async (treeId, next) => { requests.push(['discover', treeId, next]); return {ok: true}; } // 261116 결정 — 스위치가 쓰는 discover 한 벌
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
    assert.equal(row.children[0].children[0].textContent, '공유 중');
    // #480 L13: 날짜는 책·보드·지도와 같은 한 벌(formatDisplayDate)을 지난다 — 늘 dot이면 \"2026. 11. 12\"(끝에 점 없음).\n    assert.match(row.children[0].children[1].textContent, /기억 보드 · 2026\. 11\. 12에 만든 주소/);
    const actions = row.children[1];
    assert.deepEqual(actions.children.map(b => b.textContent), ['복사', '공유 취소'], '#538: 둘러보기 스위치는 자동 소개로 정리됐다');
  } finally { h.restore(); }
});

test('취소는 한 번 확인하고, 거절하면 서버에 보내지 않는다', async () => {
  const h = listHarness({shares: [share('live-1', 'active')], confirmAnswer: false});
  try {
    await h.messages.openSharePanel();
    const revoke = h.els['share-list'].children[0].children[1].children[1];
    await revoke.onclick();
    assert.deepEqual(h.requests.filter(r => r[0] === 'revoke'), [], '거절하면 보내지 않는다');
  } finally { h.restore(); }
});

test('취소를 확인하면 회수하고 안내를 남긴다', async () => {
  const h = listHarness({shares: [share('live-1', 'active')]});
  try {
    await h.messages.openSharePanel();
    const revoke = h.els['share-list'].children[0].children[1].children[1];
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
    const copy = h.els['share-list'].children[0].children[1].children[0];
    await copy.onclick();
    assert.deepEqual(written, ['https://lovetree-4-0.pages.dev/t/live-1']);
    assert.match(h.els['share-feedback'].textContent, /복사했어요/);
  } finally { h.restore(); }
});

test('복사가 막히면 공유 판의 실패 안내 문구를 그대로 보여 준다', async () => {
  const h = listHarness({shares: [share('live-1', 'active', 'book')], clipboard: {writeText: async () => { throw Error('denied'); }}});
  try {
    await h.messages.openSharePanel();
    const copy = h.els['share-list'].children[0].children[1].children[0];
    await copy.onclick();
    assert.equal(h.els['share-feedback'].textContent, SHARE_COPY_FAILURE);
  } finally { h.restore(); }
});

test('#1540 공유 주소는 보기와 화면에 관계없이 같은 주소를 만든다', () => {
  const saved = globalThis.location;
  globalThis.location = {origin: 'https://lovetree-4-0.pages.dev'};
  try {
    const book = shareUrlFor('share-same-00000001', 'book');
    assert.equal(book, 'https://lovetree-4-0.pages.dev/t/share-same-00000001');
    assert.equal(shareUrlFor('share-same-00000001', 'board'), book, '보기가 달라도 주소는 같다');
    assert.equal(shareUrlFor('share-same-00000001', 'network'), book, '지도도 같은 주소다');
    assert.match(SHARE_COPY_FAILURE, /복사하지 못했어요/);
  } finally {
    if (saved) globalThis.location = saved; else delete globalThis.location;
  }
});

test('만든 공유가 없으면 안내 한 줄만 남는다', async () => {
  const h = listHarness({shares: []});
  try {
    await h.messages.openSharePanel();
    assert.equal(h.els['share-list'].children.length, 1);
    assert.match(h.els['share-list'].children[0].textContent, /아직 만든 공유 주소가 없어요\. 둘러보기 소개는 기본 꺼짐이에요\./);
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
    assert.equal(row.children[0].children[0].textContent, '공유 중');
    assert.match(row.children[0].children[1].textContent, /지도 · .+에 만든 주소/, '서버의 createdAt을 Invalid Date 없이 날짜로 그린다');
    assert.doesNotMatch(row.children[0].children[1].textContent, /Invalid Date/);
  } finally { h.restore(); }
});

test('55개 공유 주소를 더 보기로 끝까지 열어 오래된 주소를 회수한다', async () => {
  const rows=Array.from({length:55},(_,i)=>({...share('link-'+String(54-i).padStart(20,'0'),'active'),
    createdAt:new Date(Date.UTC(2026,10,28,0,0,54-i)).toISOString()}));
  const h=listHarness({shares:rows});
  try{
    await h.messages.openSharePanel();
    const host=h.els['share-list'];
    assert.equal(host.children.filter(el=>el.className==='share-item').length,50);
    const more=host.children.find(el=>el.textContent==='더 보기');
    assert.ok(more,'다음 공유 주소를 보는 단추가 있어야 한다');
    await more.onclick();
    const shown=host.children.filter(el=>el.className==='share-item');
    assert.equal(shown.length,55);
    const last=shown.at(-1),oldId=rows.at(-1).id;
    await last.children[1].children[1].onclick();
    assert.deepEqual(h.requests.filter(r=>r[0]==='list'),[['list'],['list','more-share-list']]);
    assert.deepEqual(h.requests.filter(r=>r[0]==='revoke'),[['revoke',oldId]]);
    assert.equal(h.els['share-list'].children.filter(el=>el.className==='share-item').length,54,
      '회수된 오래된 주소만 지난 주소 접힘으로 이동하고 앞서 연 목록을 유지한다');
  }finally{h.restore();}
});

test('다른 트리 주소가 첫 50개를 차지해도 이어 보기로 내 주소를 찾는다', async () => {
  const rows=Array.from({length:55},(_,i)=>({...share('different-'+String(54-i).padStart(20,'0'),'active'),
    treeId:i<50?'other-tree':'tree1'}));
  const h=listHarness({shares:rows});
  try {
    await h.messages.openSharePanel();
    const host=h.els['share-list'];
    assert.match(host.children[0].textContent,/더 확인해 주세요/);
    const more=host.children.find(child=>child.textContent==='더 보기');
    assert.ok(more);
    await more.onclick();
    assert.equal(host.children.filter(child=>child.className==='share-item').length,5);
    assert.equal(host.children.find(child=>child.textContent==='더 보기'),undefined);
  }finally{h.restore();}
});
