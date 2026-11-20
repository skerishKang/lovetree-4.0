import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {displayTreeTitle, AUTO_TITLE_SUFFIX} from '../public/v41/tree-name.mjs';
// 2026-11-09: 헤더가 트리 이름을 줄여 보여 주는지는 소스 글자가 아니라 함수를 직접 불러 확인한다.
import { createHeader } from '../public/v41/shell/header.mjs';
// 시험 정비 2차(2026-11-15): messages·panels·community 호출점도 소스 글자 대신 직접 띄워 본다.
import { createMessages } from '../public/v41/shell/messages.mjs';
import { mountCommunity } from '../public/v41/community-panel.mjs';

function fakeEl(extra = {}) {
  return {
    hidden: false, title: '', textContent: '', dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    querySelectorAll: () => [], querySelector: () => null, attrs: {},
    setAttribute(n, v) { this.attrs[n] = String(v); },
    removeAttribute(n) { delete this.attrs[n]; },
    getAttribute(n) { return this.attrs[n] ?? null; },
    focus() {},
    ...extra
  };
}

function headerHarness(tree) {
  const els = {
    'tree-views': fakeEl(), 'record-menu': fakeEl(), 'source-label': fakeEl(), 'write-menu': fakeEl(),
    'share-menu': fakeEl(), 'account-entry': fakeEl(), 'account-avatar': fakeEl({hidden: true}),
    'account-email': fakeEl(), 'account-popover': fakeEl({hidden: true})
  };
  const saved = {document: globalThis.document, sessionStorage: globalThis.sessionStorage};
  globalThis.sessionStorage = {getItem: () => null, setItem() {}, removeItem() {}};
  globalThis.document = {querySelectorAll: () => [], body: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, dataset: {} } };
  globalThis.window = globalThis;
  globalThis.LT41 = tree ? {tree} : null;
  const header = createHeader({
    $: id => els[id] ?? null,
    navBar: null,
    getMember: () => ({snapshot: () => ({owned: true, writable: true, dirty: false, subject: 's1'})}),
    getModel: () => ({trees: [{id: 't1'}]}),
    getSource: () => 'example',
    getCurrent: () => 'src064-orbit.html',
    accountApi: {account: async () => ({ok: false})},
    delegate: {syncTreeTips() {}}
  });
  header.flowNavigation();
  const restore = () => {
    globalThis.document = saved.document;
    globalThis.sessionStorage = saved.sessionStorage;
    if (saved.sessionStorage === undefined) delete globalThis.sessionStorage;
    delete globalThis.LT41;
  };
  return {els, restore};
}

const shell = readFileSync(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/v41/shell.css', import.meta.url), 'utf8');

// 렌더 하네스용 가짜 DOM — tests/v41-date-style-one-piece.test.mjs와 같은 모양(최소 가짜 DOM).
function fakeElement(extra = {}) {
  return Object.assign({
    value: '', textContent: '', innerHTML: '', hidden: false, open: false, disabled: false, classList: { items:new Set(), add(...v){v.forEach(x=>this.items.add(x))}, remove(...v){v.forEach(x=>this.items.delete(x))}, toggle(v,on){if(on===undefined)on=!this.items.has(v);on?this.items.add(v):this.items.delete(v);return on}, contains(v){return this.items.has(v)} },
    children: [], attrs: {}, dataset: {}, className: '', style: {}, tagName: '', listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    dispatch(type) { const fn = this.listeners[type]; if (fn) fn(); },
    setAttribute(n, v) { this.attrs[n] = String(v); },
    removeAttribute(n) { delete this.attrs[n]; },
    getAttribute(n) { return this.attrs[n] ?? null; },
    focus() {},
    replaceChildren(...k) { this.children = k; },
    append(...k) { this.children.push(...k); },
    querySelector: () => fakeElement(), querySelectorAll: () => [],
    close() { this.open = false; }, showModal() { this.open = true; }
  }, extra);
}

// 공유 미리보기 하네스 — v41-date-style-one-piece의 messagesHarness와 같은 deps 모양.
function messagesHarness() {
  const saved = {};
  for (const key of ['window', 'document', 'location', 'addEventListener']) { saved[key] = globalThis[key]; delete globalThis[key]; }
  globalThis.addEventListener = () => {};
  globalThis.location = { origin: 'https://example.test', hostname: 'lovetree-4-0.pages.dev', hash: '' };
  globalThis.document = { createElement: () => fakeElement(), createElementNS: (ns, tag) => fakeElement({ tagName: String(tag), namespaceURI: String(ns) }), querySelectorAll: () => [] };
  globalThis.window = { LT41: { tree: { id: 'tree1', title: '리센느, 나의 순간들', moments: [] }, momentId: 'm1' } };
  const els = {};
  const get = (id) => (els[id] ||= fakeElement({ id }));
  const messages = createMessages({
    $: get,
    getCurrent: () => 'track59-sketchbook.html',
    setCurrent: () => {},
    getModel: () => globalThis.window.LT41,
    getSource: () => 'server',
    getMember: () => ({ snapshot: () => ({ owned: true, writable: true, dirty: false }) }),
    getDateStyle: () => 'dot',
    shareApi: {
      list: async () => ({ ok: true, shares: [] }),
      preview: async () => ({ ok: true, preview: { previewToken: 'tok', tree: { title: '리센느, 나의 순간들', moments: [{ id: 'm1', title: '첫 순간', emotion: '설렘', date: '2026-11-01' }] } } }),
      create: async () => ({ ok: true, share: { id: 's2' } }),
      setDiscoverable: async () => ({ ok: true }), revoke: async () => ({ ok: true })
    },
    notify: () => {}, panel: () => {}, show: () => {}, links: () => {}, writeLocation: () => {}, choose: () => {},
    openEditor: () => {}, openLoginStart: () => {}, openAccountMenu: () => {}, sample: () => {},
    applyTheme: () => {}, paintThemeControls: () => {}, viewForFile: () => 'book',
    exampleTree: { id: 'example', moments: [] }, journey: {}, getShareDefaults: () => ({ view: 'book', discover: false })
  });
  return { get, messages, restore() { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; } } };
}

// 둘러보기 하네스 — v41-date-style-one-piece의 communityHarness에 가짜 fetch와 닫기 흉내를 얹은 모양.
const COMMUNITY_ITEM = {
  shareId: 's1', title: '리센느, 나의 순간들', subject: '바다의 기억', summary: '첫 기록',
  momentCount: 2, createdAt: '2026-11-01T09:30:00.000Z',
  cover: { emotion: '설렘', title: '첫 순간' }, emotions: ['설렘'],
  stats: { hearts: 3, favorites: 1, hearted: false, favored: false, reactions: { heart: 3 }, mine: [] }
};

function communityHarness({ items = [] } = {}) {
  const saved = {};
  for (const key of ['window', 'document', 'location', 'addEventListener', 'fetch']) { saved[key] = globalThis[key]; delete globalThis[key]; }
  globalThis.addEventListener = () => {};
  globalThis.location = { origin: 'https://example.test', hostname: 'lovetree-4-0.pages.dev' };
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ items, totalVisible: items.length, nextCursor: '' }) });
  globalThis.window = {};
  const els = {};
  const get = (id) => (els[id] ||= fakeElement({ id }));
  globalThis.document = {
    createElement: (tag) => fakeElement({ tagName: String(tag).toUpperCase() }),
    createElementNS: (ns, tag) => fakeElement({ tagName: String(tag).toUpperCase(), namespaceURI: String(ns) }),
    querySelectorAll: () => []
  };
  const dialog = fakeElement({ id: 'community-panel' });
  dialog.querySelector = (sel) => get(String(sel).replace(/^#/, ''));
  mountCommunity({
    button: get('community-menu'), dialog,
    onOpenShare: () => {}, onStartRecord: () => {}, onShareOwn: () => {}, hasOwnTree: () => false,
    getDateStyle: () => 'dot'
  });
  return {
    get,
    search: async () => { get('community-search-form').onsubmit({ preventDefault() {} }); await new Promise((r) => setTimeout(r, 0)); },
    restore() { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; } }
  };
}

// 만들어진 노드 나무에서 h3만 모은다(el()은 h3에 className을 안 붙인다).
function h3s(node) {
  const out = [];
  const walk = (n) => { if (n.tagName === 'H3') out.push(n); for (const c of n.children || []) walk(c); };
  walk(node);
  return out;
}

test('1. 헤더·목록 이름: "리센느, 나의 순간들"은 "리센느"로 보인다', () => {
  assert.equal(AUTO_TITLE_SUFFIX, ', 나의 순간들');
  assert.equal(displayTreeTitle('리센느, 나의 순간들'), '리센느');
  assert.equal(displayTreeTitle('리센느의 기록, 나의 순간들'), '리센느의 기록');
});

test('2. 직접 쓴 이름은 그대로 둔다(정확히 일치할 때만 뗀다)', () => {
  assert.equal(displayTreeTitle('리센느'), '리센느');
  assert.equal(displayTreeTitle('리센느, 나의 순간들 2'), '리센느, 나의 순간들 2');
  assert.equal(displayTreeTitle('나의 순간들'), '나의 순간들');
  assert.equal(displayTreeTitle(', 나의 순간들'), ', 나의 순간들');
  assert.equal(displayTreeTitle(''), '');
  assert.equal(displayTreeTitle(undefined), '');
});

// '셸 페이지 스크립트 배선' 글자 검사 2개는 지웠다(이슈 952) — 트리 드롭다운에 실제로 그려진 이름은
// tests/v41-topmenu-885.test.mjs가 화면에서 잰다(말줄임·⌄ 자리와 함께).

test('3-1. 헤더가 실제로 줄인 이름을 보여 준다(함수 직접 호출)', () => {
  const {els, restore} = headerHarness({title: '리센느, 나의 순간들'});
  try {
    assert.match(els['source-label'].textContent, /리센느/);
    assert.doesNotMatch(els['source-label'].textContent, /나의 순간들/, '자동 꼬리말은 헤더에 보이지 않는다');
    assert.equal(els['tree-views'].getAttribute('aria-label'), '이 트리 보기');
  } finally { restore(); }
});

test('3-2. 직접 쓴 이름은 헤더에서도 그대로다', () => {
  const {els, restore} = headerHarness({title: '리센느의 기록'});
  try {
    assert.equal(els['source-label'].textContent.includes('리센느의 기록'), true);
    assert.equal(els['tree-views'].getAttribute('aria-label'), '이 트리 보기');
  } finally { restore(); }
});

test('3-3. 공유 미리보기 요약도 줄인 이름을 보여 준다(createMessages 직접 호출)', async () => {
  // 전: messages.mjs의 displayTreeTitle 호출 줄을 글자로 봤다 → 후: 미리보기를 실제로 띄워 요약 글자를 본다.
  const h = messagesHarness();
  try {
    h.get('share-moment').value = 'm1';
    h.get('share-view').value = 'book';
    await h.get('share-preview').onclick();
    const text = h.get('share-preview-summary').textContent;
    assert.match(text, /“리센느”의 1개 순간을 공개합니다\./, '요약은 줄인 이름으로 쓴다');
    assert.ok(!text.includes('나의 순간들'), '자동 꼬리말이 요약에 남지 않는다');
  } finally { h.restore(); }
});

test('4. 둘러보기(공개 목록)도 같은 이름 규칙을 쓴다(mountCommunity 직접 호출)', async () => {
  // 카드를 실제로 열어 카드와 미리보기의 표시 이름을 확인한다.
  const h = communityHarness({ items: [COMMUNITY_ITEM] });
  try {
    await h.search();
    const cardTitle = h3s(h.get('community-list'))[0]?.textContent;
    assert.equal(cardTitle, '리센느', '목록 제목은 자동 꼬리말을 뗀다');
    assert.equal(h.get('community-preview').open, false, '미리보기는 카드 선택 전에는 닫혀 있다');
    h.get('community-list').children[0].onclick();
    const previewTitle = h3s(h.get('community-preview'))[0]?.textContent;
    const titles = [cardTitle, previewTitle];
    assert.deepEqual(titles, ['리센느', '리센느'], '카드 제목과 미리보기 제목은 모두 줄인 이름이다');
    assert.ok(titles.every((t) => !t.includes('나의 순간들')), '자동 꼬리말이 목록에 보이지 않는다');
  } finally { h.restore(); }
});

test('4-1. 같은 이름과 순간은 공개 표시명만 쓰고 순번을 붙이지 않는다', async () => {
  const same = (shareId, coverTitle, extra = {}) => ({
    ...COMMUNITY_ITEM, shareId, cover: { ...COMMUNITY_ITEM.cover, title: coverTitle }, ...extra
  });
  const h = communityHarness({ items: [
    same('s1', '첫 순간', { aiTester: true, publicDisplayName: '하은' }),
    same('s2', '다른 순간', { publicDisplayName: '바다' }),
    same('s3', '첫 순간', { publicDisplayName: '윤슬' }),
    same('s4', '첫 순간')
  ] });
  try {
    await h.search();
    const cards = h.get('community-list').children;
    const labels = cards.map(card => card.children.find(node => node.className === 'community-card-distinct')?.textContent || '');
    assert.deepEqual(labels, ['AI 명예회원 하은님', '', '윤슬님', '']);
    assert.equal(cards.some(card => card.children.some(node => String(node.textContent).includes('같은 이름'))), false);
  } finally { h.restore(); }
});

test('4-2. 가로 YouTube 표지는 넓게 그리고 세로 표지는 흐린 배경을 유지한다', async () => {
  const horizontal = { ...COMMUNITY_ITEM, shareId: 'wide', cover: { ...COMMUNITY_ITEM.cover, type: 'youtube', url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE', thumbnailUrl: 'https://img.youtube.com/vi/M7lc1UVf-VE/hqdefault.jpg', vertical: false } };
  const vertical = { ...COMMUNITY_ITEM, shareId: 'tall', cover: { ...COMMUNITY_ITEM.cover, type: 'youtube', url: 'https://www.youtube.com/shorts/aqz-KE-bpKQ', thumbnailUrl: 'https://img.youtube.com/vi/aqz-KE-bpKQ/hqdefault.jpg', vertical: true } };
  const h = communityHarness({ items: [horizontal, vertical] });
  try {
    await h.search();
    const [wideCard, tallCard] = h.get('community-list').children;
    const wideCover = wideCard.children[0], tallCover = tallCard.children[0];
    assert.equal(wideCover.dataset.mediaKind, 'video-youtube');
    assert.equal(tallCover.dataset.mediaKind, 'video-vertical');
    assert.equal(wideCover.children[0].children.some(node => node.className === 'community-cover-backdrop'), true);
    assert.equal(tallCover.children[0].children.some(node => node.className === 'community-cover-backdrop'), true);
  } finally { h.restore(); }
});

test('5. 긴 이름은 말줄임 — 헤더 트리 이름과 문맥 줄이 폭을 넘지 않는다', () => {
  // 261119 대표 결정: 칸 폭은 글자에 맞추고 긴 이름만 말줄임(상한 안). 옛 '고정 폭 11em' 단정은 지웠다 —
  // 지금의 폭·말줄임·⌄ 자리는 tests/v41-topmenu-885.test.mjs가 실제 화면에서 숫자로 잰다.
  // css 말줄임 글자 검사도 이슈 952로 지웠다 — 같은 실측이 대신한다.
});
