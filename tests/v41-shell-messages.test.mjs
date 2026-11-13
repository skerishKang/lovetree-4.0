import test from 'node:test';
import assert from 'node:assert/strict';
// #231 1-B③-3: 옮긴 첫 여정 연결·공유 패널·lt41-* 수신을 직접 불러 결과를 본다(최소 가짜 DOM).
import { createJourney } from '../public/v41/shell/journey.mjs';
import { createMessages } from '../public/v41/shell/messages.mjs';

function fakeElement(extra = {}) {
  const node = {
    value: '', textContent: '', innerHTML: '', hidden: false, open: false, disabled: false,
    children: [], attrs: {}, dataset: {}, style: {},
    addEventListener(type, fn) { this.listeners = this.listeners || {}; this.listeners[type] = fn; },
    setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; },
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

function globals() {
  return {window: globalThis.window, document: globalThis.document, location: globalThis.location, history: globalThis.history, addEventListener: globalThis.addEventListener};
}
function restore(saved) {
  for (const key of Object.keys(saved)) {
    if (saved[key] === undefined) delete globalThis[key];
    else globalThis[key] = saved[key];
  }
}

function journeyHarness({ owned = true, writable = true, source = 'server', current = 'src064-orbit.html', depth = 0 } = {}) {
  const saved = globals();
  const els = {};
  const posted = [], replacedUrls = [], shown = [], notices = [], panels = [];
  const modal = [];
  let handled = '';
  globalThis.location = {origin: 'https://lovetree-4-0.pages.dev', hash: '#home'};
  globalThis.history = {
    state: depth ? {lt41Journey: depth} : null,
    pushState: (_s, _t, url) => { globalThis.location.hash = url; },
    replaceState: (_s, _t, url) => { globalThis.location.hash = url; },
    go: delta => { modal.push(delta); }
  };
  globalThis.document = {body: {classList: {remove() {}, add() {}}}};
  els['view'] = fakeElement({contentWindow: {postMessage: (message, origin) => posted.push([message, origin]), location: {replace: url => replacedUrls.push(url)}}});
  els['empty'] = fakeElement();
  els['community-panel'] = fakeElement();
  const member = {snapshot: () => ({owned, writable, dirty: false}), state: () => ({trees: [{id: 'tree1', moments: [{id: 'm1', title: '첫 순간'}]}]}), apply: (...args) => { posted.push(['apply', ...args]); return {treeId: 't9', momentId: 'm9'}; }};
  const journey = createJourney({
    $: id => (els[id] ||= fakeElement()),
    getCurrent: () => current,
    setCurrent: file => { current = file; },
    getMember: () => member,
    getSource: () => source,
    notify: text => notices.push(text),
    panel: id => panels.push(id),
    show: (file, write) => shown.push([file, write]),
    screens: [['home', 'src064-orbit.html'], ['book', 'track59-sketchbook.html']],
    choose: (treeId, momentId) => shown.push(['choose', treeId, momentId]),
    writeLocation: mode => shown.push(['writeLocation', mode]),
    openLoginStart: intent => notices.push('login:' + intent),
    flowNavigation: () => shown.push(['flow']),
    setHandled: hash => { handled = hash; }
  });
  return {journey, els, posted, replacedUrls, shown, notices, panels, modal, state: () => ({current, handled}), restore: () => restore(saved)};
}

function messagesHarness({ owned = true, source = 'server', current = 'track59-sketchbook.html', model = {trees: [{id: 'tree1', moments: [{id: 'm1'}]}]} } = {}) {
  const saved = globals();
  const els = {};
  const events = {};
  const calls = {notify: [], panels: [], shown: [], editors: [], logins: [], links: 0, writes: 0, chooses: [], samples: [], journeys: [], menus: []};
  const requests = [];
  globalThis.addEventListener = (type, fn) => { events[type] = fn; };
  globalThis.location = {origin: 'https://lovetree-4-0.pages.dev', hostname: 'lovetree-4-0.pages.dev', hash: ''};
  globalThis.document = {createElement: () => fakeElement(), querySelectorAll: () => []};
  globalThis.window = {LT41: {tree: {id: 'tree1', title: '윤슬', moments: [{id: 'm1', title: '첫 순간'}]}, momentId: 'm1', trees: model.trees}};
  const dialog = fakeElement({querySelector: () => fakeElement()});
  const button = fakeElement();
  els['community-panel'] = dialog;
  els['community-menu'] = button;
  els['account-entry'] = fakeElement();
  els['view'] = fakeElement();

  let ownedNow = owned;
  const member = {snapshot: () => ({owned: ownedNow, writable: true, dirty: false})};
  const shareApi = {
    preview: async payload => { requests.push(['preview', payload]); return {ok: true, preview: {previewToken: 'tok-1', tree: {title: '윤슬', moments: [{title: '첫 순간', emotion: '설렘', date: '2026-11-01'}]}}}; },
    create: async payload => { requests.push(['create', payload]); return {ok: true, share: {id: 'share-1', view: 'book'}}; },
    list: async () => ({ok: true, shares: []}),
    setDiscoverable: async (id, next) => { requests.push(['discoverable', id, next]); return {ok: true}; },
    revoke: async id => { requests.push(['revoke', id]); return {ok: true}; }
  };
  const journey = {
    openFirstJourney: options => calls.journeys.push(['open', options]),
    saveFirstJourney: draft => calls.journeys.push(['save', draft]),
    noteJourneyStep: step => calls.journeys.push(['step', step]),
    openJourneyBook: args => calls.journeys.push(['book', args]),
    closeFirstJourney: () => calls.journeys.push(['close'])
  };
  const messages = createMessages({
    $: id => (els[id] ||= fakeElement()),
    getCurrent: () => current,
    setCurrent: file => { current = file; },
    getModel: () => model,
    getSource: () => source,
    getMember: () => member,
    shareApi,
    notify: text => calls.notify.push(text),
    panel: id => calls.panels.push(id),
    show: (file, write) => calls.shown.push([file, write]),
    links: () => { calls.links += 1; },
    writeLocation: () => { calls.writes += 1; },
    choose: (treeId, momentId) => calls.chooses.push([treeId, momentId]),
    openEditor: (mode, parentId) => calls.editors.push([mode, parentId]),
    openLoginStart: intent => calls.logins.push(intent),
    openAccountMenu: () => calls.menus.push('account'),
    sample: (selection, view) => calls.samples.push([selection, view]),
    applyTheme: () => {},
    paintThemeControls: () => {},
    viewForFile: file => (file === 'track59-sketchbook.html' ? 'book' : 'home'),
    exampleTree: {id: 'example', moments: [{id: 'e1'}]},
    journey
  });
  return {
    messages, els, events, calls, requests, dialog, button,
    state: () => ({current}),
    receive: data => events.message({origin: 'https://lovetree-4-0.pages.dev', source: els['view'].contentWindow, data}),
    setOwned: value => { ownedNow = value; },
    restore: () => restore(saved)
  };
}

test('lt41-select는 화면이 보낸 순간으로 선택을 옮기고 주소를 다시 쓴다', () => {
  const h = messagesHarness();
  try {
    h.receive({type: 'lt41-select', id: 'm1'});
    assert.equal(window.LT41.momentId, 'm1');
    assert.equal(h.calls.links, 1);
    assert.equal(h.calls.writes, 1);
    // 모르는 순간이면 아무것도 하지 않는다.
    h.receive({type: 'lt41-select', id: 'nope'});
    assert.equal(h.calls.links, 1);
  } finally { h.restore(); }
});

test('다른 출처·다른 iframe이 보낸 메시지는 무시한다', () => {
  const h = messagesHarness();
  try {
    h.events.message({origin: 'https://evil.test', source: h.els['view'].contentWindow, data: {type: 'lt41-write', mode: 'add'}});
    h.events.message({origin: 'https://lovetree-4-0.pages.dev', source: {}, data: {type: 'lt41-write', mode: 'add'}});
    assert.deepEqual(h.calls.editors, []);
  } finally { h.restore(); }
});

test('lt41-write·lt41-start·lt41-community·lt41-journey-save는 정해진 곳으로 넘긴다', () => {
  const h = messagesHarness();
  try {
    h.receive({type: 'lt41-write', mode: 'add', parentId: 'm1'});
    assert.deepEqual(h.calls.editors, [['add', 'm1']]);
    h.receive({type: 'lt41-start'});
    assert.deepEqual(h.calls.logins, ['first']);
    h.receive({type: 'lt41-community'});
    assert.equal(h.button.clicked, 1, '둘러보기는 그 메뉴 버튼 클릭으로 넘긴다');
    h.receive({type: 'lt41-journey-save', draft: {subject: '윤슬'}});
    assert.deepEqual(h.calls.journeys, [['save', {subject: '윤슬'}]]);
    h.receive({type: 'lt41-open-book', treeId: 'tree1', id: 'm1'});
    assert.deepEqual(h.calls.chooses, [['tree1', 'm1']]);
    assert.equal(h.calls.writes, 1, '기억책으로 옮기며 주소를 쓴다');
  } finally { h.restore(); }
});

test('lt41-open-view는 보드·지도에서 다른 트리를 같은 보기로 열고, 모르는 보기·없는 트리는 무시한다', () => {
  const h = messagesHarness({current: 'track58-pinboard.html'});
  try {
    h.receive({type: 'lt41-open-view', treeId: 'tree1', view: 'board'});
    assert.deepEqual(h.calls.chooses, [['tree1', undefined]], '트리를 고른다');
    assert.equal(h.state().current, 'track58-pinboard.html', '보드는 보드로 연다');
    assert.equal(h.calls.writes, 1, '주소를 쓴다');
    h.receive({type: 'lt41-open-view', treeId: 'tree1', view: 'network'});
    assert.equal(h.state().current, 'track56-network.html', '지도는 지도로 연다');
    const after = h.calls.chooses.length;
    h.receive({type: 'lt41-open-view', treeId: 'tree1', view: 'book'});
    h.receive({type: 'lt41-open-view', treeId: 'nope', view: 'board'});
    h.receive({type: 'lt41-open-view', view: 'board'});
    assert.equal(h.calls.chooses.length, after, '허용하지 않는 보기·없는 트리는 무시한다');
  } finally { h.restore(); }
});

test('로그아웃 상태의 lt41-navigate(내 책장)는 화면을 열지 않고 로그인으로 보낸다', () => {
  const h = messagesHarness({owned: false});
  try {
    h.receive({type: 'lt41-navigate', view: 'track32-bookshelf.html'});
    assert.deepEqual(h.calls.logins, ['shelf']);
    assert.deepEqual(h.calls.shown, []);
    h.receive({type: 'lt41-navigate', view: 'track59-sketchbook.html'});
    assert.deepEqual(h.calls.shown, [['track59-sketchbook.html', undefined]]);
  } finally { h.restore(); }
});

test('공유는 미리보기 없이는 만들지 않고, 미리보기 뒤에만 주소를 만든다', async () => {
  const h = messagesHarness();
  try {
    await h.messages.openSharePanel();
    assert.equal(h.calls.panels.at(-1), 'share-panel', '공유 패널을 연다');
    assert.equal(h.els['share-view'].value, 'book', '지금 화면을 기본값으로 쓴다');

    await h.els['share-create'].onclick();
    assert.deepEqual(h.requests, [], '미리보기 전에는 서버에 만들지 않는다');
    assert.equal(h.els['share-feedback'].textContent, '선택이 바뀌었어요. 공개 내용을 다시 미리 봐 주세요.');

    await h.els['share-preview'].onclick();
    assert.equal(h.requests[0][0], 'preview');
    assert.equal(h.els['share-preview-result'].hidden, false);
    assert.match(h.els['share-preview-summary'].textContent, /“윤슬”의 1개 순간을 공개합니다\./);

    await h.els['share-create'].onclick();
    assert.equal(h.requests[1][0], 'create');
    assert.equal(h.requests[1][1].previewToken, 'tok-1', '미리보기 토큰을 그대로 넘긴다');
    assert.equal(h.els['share-url'].value, 'https://lovetree-4-0.pages.dev/t/share-1');
    assert.equal(h.els['share-created'].hidden, false);
  } finally { h.restore(); }
});

test('공유는 다른 사람 기록·미저장 상태에서는 열지 않는다', async () => {
  const other = messagesHarness({source: 'example'});
  try {
    await other.messages.openSharePanel();
    assert.deepEqual(other.calls.panels, []);
    assert.deepEqual(other.calls.notify, ['내 서버 기록에서 공유할 트리를 먼저 열어 주세요.']);
  } finally { other.restore(); }
});

test('공유 목록은 이 트리에 만든 공유만 보여 주고, 없으면 안내 한 줄을 남긴다', async () => {
  const h = messagesHarness();
  try {
    await h.messages.openSharePanel();
    assert.equal(h.els['share-list'].children.length, 1, '공유가 없으면 안내 한 줄');
    assert.equal(h.els['share-list'].children[0].textContent, '아직 만든 공유 주소가 없어요. 트리는 공개가 기본이라 순간 3개부터 둘러보기에 소개돼요.');
  } finally { h.restore(); }
});

test('첫 여정 저장은 member.apply(new→add)를 그대로 쓰고 결과를 iframe에 돌려준다', () => {
  const h = journeyHarness();
  try {
    h.journey.saveFirstJourney({subject: '윤슬', url: 'https://example.test/a.jpg', emotion: '설렘', date: '2026-11-01', skipped: true});
    const apply = h.posted.find(entry => entry[0] === 'apply');
    assert.equal(apply[1], 'new');
    assert.equal(apply[2].subject, '윤슬');
    const reply = h.posted.find(entry => entry[0]?.type === 'lt41-journey-result');
    assert.equal(reply[0].ok, true);
    assert.equal(reply[0].treeId, 't9');
    assert.equal(reply[0].connected, false);
  } finally { h.restore(); }
});

test('로그아웃이면 첫 여정 저장 대신 안내를 돌려주고, 진입은 로그인으로 보낸다', () => {
  const h = journeyHarness({owned: false});
  try {
    h.journey.saveFirstJourney({subject: '윤슬'});
    const reply = h.posted.find(entry => entry[0]?.type === 'lt41-journey-result');
    assert.equal(reply[0].ok, false);
    assert.equal(reply[0].message, '로그인한 뒤 내 기록에 저장할 수 있어요.');
    h.journey.openFirstJourney();
    assert.deepEqual(h.notices, ['login:new-tree']);
    assert.equal(h.replacedUrls.length, 0);
  } finally { h.restore(); }
});

test('첫 여정 열기는 첫 여정 화면으로 iframe을 바꾸고 history에 단계를 남긴다', () => {
  const h = journeyHarness({owned: true});
  try {
    h.journey.openFirstJourney({subject: '윤슬', step: 0, route: true});
    assert.equal(h.state().current, 'first-journey.html');
    assert.equal(h.replacedUrls.at(-1), 'https://lovetree-4-0.pages.dev/v41/views/first-journey.html?subject=%EC%9C%A4%EC%8A%AC&step=0');
    assert.equal(globalThis.location.hash, '#journey/00', '주소에 단계를 남긴다');
    assert.equal(h.els['empty'].hidden, true);
  } finally { h.restore(); }
});

test('여정 닫기는 연 기록 수만큼 뒤로 가고, 저장 뒤 뒤로가기는 첫 화면으로 나간다', () => {
  const h = journeyHarness({current: 'first-journey.html', depth: 2});
  try {
    h.journey.closeFirstJourney();
    assert.deepEqual(h.modal, [-2], '기록을 되감는다');
    h.journey.finishJourney();
    assert.deepEqual(h.shown.at(-1), ['src064-orbit.html', false]);
    assert.equal(globalThis.location.hash, '#home');
    assert.equal(h.journey.saved(), false);
  } finally { h.restore(); }
});

test('여정 단계 이동은 열린 여정이면 화면에 단계만 알린다', () => {
  const h = journeyHarness({current: 'first-journey.html'});
  try {
    h.journey.gotoJourneyStep(3);
    const message = h.posted.find(entry => entry[0]?.type === 'lt41-journey-goto');
    assert.equal(message[0].step, 3);
    assert.equal(message[1], 'https://lovetree-4-0.pages.dev');
  } finally { h.restore(); }
});
