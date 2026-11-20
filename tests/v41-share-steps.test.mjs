import test from 'node:test';
import assert from 'node:assert/strict';
// #369 1~4: 공유 창의 단계 표시·링크 만들기 이유·복사 안내·둘러보기 스위치·공개 범위 접기.
import fs from 'node:fs';
import { createMessages } from '../public/v41/shell/messages.mjs';

const html = fs.readFileSync(new URL('../public/v41/index.html', import.meta.url), 'utf8');
const shareHtml = html.slice(html.indexOf('<dialog id="share-panel"'), html.indexOf('</dialog>', html.indexOf('<dialog id="share-panel"')));

function fakeElement(extra = {}) {
  const node = {
    value: '', textContent: '', hidden: false, open: false, disabled: false, checked: false,
    children: [], attrs: {}, dataset: {},
    addEventListener(type, fn) { this.listeners = this.listeners || {}; this.listeners[type] = fn; },
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

function shareHarness({ confirmAnswer = true, clipboard = null, visibilityAnswer = null, discoverAnswer = false } = {}) {
  const saved = {window: globalThis.window, document: globalThis.document, location: globalThis.location, addEventListener: globalThis.addEventListener, confirm: globalThis.confirm};
  for (const key of ['window', 'document', 'location', 'addEventListener', 'confirm']) delete globalThis[key];
  const els = {};
  const events = {};
  const calls = {notify: [], panels: []};
  const requests = [];
  globalThis.addEventListener = (type, fn) => { events[type] = fn; };
  globalThis.location = {origin: 'https://lovetree-4-0.pages.dev', hostname: 'lovetree-4-0.pages.dev', hash: ''};
  globalThis.document = { createElementNS: (ns, tag) => ({ tagName: String(tag), namespaceURI: String(ns), attrs: {}, children: [], setAttribute(n,v){this.attrs[n]=String(v)}, getAttribute(n){return this.attrs[n]??null}, append(...k){this.children.push(...k)}, querySelector(){return null}, querySelectorAll(){return []} }), createElement: () => fakeElement(), querySelectorAll: () => []};
  globalThis.confirm = () => confirmAnswer;
  if (clipboard) Object.defineProperty(globalThis, 'navigator', {value: {clipboard}, configurable: true});
  globalThis.window = {LT41: {tree: {id: 'tree1', title: '윤슬', moments: [{id: 'm1', title: '첫 순간'}]}, momentId: 'm1', trees: [{id: 'tree1', moments: [{id: 'm1'}]}]}};
  els['community-panel'] = fakeElement();
  els['community-menu'] = fakeElement();
  els['account-entry'] = fakeElement();
  els['view'] = fakeElement();
  const shareSteps = [1, 2, 3].map(step => fakeElement({dataset: {step: String(step)}}));
  els['share-steps'] = fakeElement({children: shareSteps});
  els['share-create-reason'] = fakeElement({textContent: '먼저 미리보기를 확인해 주세요.'});
  const member = {snapshot: () => ({owned: true, writable: true, dirty: false})};
  const discoverNow = {discover: discoverAnswer, has: false}; // has=false = 아직 서버 값을 못 본 상태(null)
  const shareApi = {
    preview: async payload => { requests.push(['preview', payload]); return {ok: true, preview: {previewToken: 'tok-1', tree: {title: '윤슬', moments: [{title: '첫 순간', emotion: '설렘', date: '2026-11-01'}]}}}; },
    create: async payload => { requests.push(['create', payload]); return {ok: true, share: {id: 'share-1', view: 'book'}}; },
    list: async () => ({ok: true, shares: requests.filter(r => r[0] === 'list').length ? {id: 'share-1', treeId: 'tree1', status: 'active', view: 'book', createdAt: '2026-11-12T09:00:00Z', discoverable: false} : []}),
    setDiscoverable: async (id, next) => { requests.push(['discoverable', id, next]); return {ok: true}; },
    setTreeVisibility: async (treeId, visibility) => { requests.push(['visibility', treeId, visibility]); return visibilityAnswer; },
    getTreeVisibility: async () => ({ok: true, visibility: 'public'}), // #830: 비공개는 누구나 무료 — 조회는 공개로 본다
    getTreeDiscover: async () => ({ok: true, discover: discoverNow.discover}),
    setTreeDiscover: async (treeId, next) => { requests.push(['discover', treeId, next]); discoverNow.discover = next === true; return {ok: true}; }, // 261116 결정 — 스위치가 쓰는 discover 한 벌
    revoke: async id => { requests.push(['revoke', id]); return {ok: true}; }
  };
  const messages = createMessages({
    $: id => (els[id] ||= fakeElement()),
    getCurrent: () => 'track59-sketchbook.html',
    setCurrent: () => {},
    getModel: () => globalThis.window.LT41,
    getSource: () => 'server',
    getMember: () => member,
    shareApi,
    discoverOf: treeId => discoverNow.has ? discoverNow.discover : null,
    rememberDiscover: (treeId, value) => { discoverNow.has = true; discoverNow.discover = value === true; },
    notify: text => calls.notify.push(text),
    panel: id => calls.panels.push(id),
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
    viewForFile: file => (file === 'track59-sketchbook.html' ? 'book' : 'home'),
    exampleTree: {id: 'example', moments: []},
    journey: {}
  });
  return {
    messages, els, calls, requests, shareSteps,
    stage: () => shareSteps.map(li => li.dataset.state).join(','),
    next: () => els['share-next'].textContent,
    reason: () => ({hidden: els['share-create-reason'].hidden, text: els['share-create-reason'].textContent}),
    restore: () => {
      for (const key of Object.keys(saved)) { if (saved[key] === undefined) delete globalThis[key]; else globalThis[key] = saved[key]; }
      if (clipboard) delete globalThis.navigator;
    }
  };
}

test('공유 창을 열면 1단계(고르기)가 현재이고, 링크 만들기가 막힌 이유를 버튼 옆에 보여 준다', async () => {
  const h = shareHarness();
  try {
    await h.messages.openSharePanel();
    assert.equal(h.calls.panels.at(-1), 'share-panel');
    assert.equal(h.stage(), 'current,todo,todo', '① 고르기가 현재');
    assert.match(h.next(), /고른 뒤/);
    assert.equal(h.reason().hidden, false, '이유 문구가 보인다');
    assert.equal(h.reason().text, '먼저 미리보기를 확인해 주세요.');
  } finally { h.restore(); }
});

test('미리보기를 확인하면 3단계(링크 만들기)가 현재가 되고 이유 문구가 숨는다', async () => {
  const h = shareHarness();
  try {
    await h.messages.openSharePanel();
    await h.els['share-preview'].onclick();
    assert.equal(h.stage(), 'done,done,current', '①②는 끝, ③이 현재');
    assert.match(h.next(), /링크를 만들어 주세요/);
    assert.equal(h.reason().hidden, true, '누를 수 있으면 이유 문구는 숨는다');
  } finally { h.restore(); }
});

test('선택을 바꾸면 단계가 고르기로 돌아가고 이유 문구가 다시 보인다', async () => {
  const h = shareHarness();
  try {
    await h.messages.openSharePanel();
    await h.els['share-preview'].onclick();
    h.els['share-view'].onchange();
    assert.equal(h.stage(), 'current,todo,todo');
    assert.equal(h.reason().hidden, false);
  } finally { h.restore(); }
});

test('링크를 만들면 열어 보기 주소가 채워진다(#538: 둘러보기 스위치는 자동 소개로 정리됐다)', async () => {
  const h = shareHarness();
  try {
    await h.messages.openSharePanel();
    await h.els['share-preview'].onclick();
    await h.els['share-create'].onclick();
    assert.equal(h.els['share-open'].href, 'https://lovetree-4-0.pages.dev/t/share-1');
    assert.equal(h.els['share-open'].hidden, false);
    assert.equal(h.stage(), 'done,done,done', '세 단계 모두 끝');
    assert.match(h.next(), /복사하거나 열어 보세요/);
  } finally { h.restore(); }
});

test('복사하면 복사했어요 안내를 role=status 자리에 띄운다', async () => {
  const h = shareHarness({clipboard: {writeText: async () => {}}});
  try {
    await h.messages.openSharePanel();
    await h.els['share-preview'].onclick();
    await h.els['share-create'].onclick();
    await h.els['share-copy'].onclick();
    assert.equal(h.els['share-copy-note'].textContent, '복사했어요.');
  } finally { h.restore(); }
});

// (261116 결정) 비공개 전환 단추는 공유 판에서 정리됐다 — 링크까지 막는 완전 비공개는 무료 안내만 남는다(#830).
// 대신 둘러보기 소개 스위치가 고른 값을 discover PUT으로 저장하고 상태 줄·단추가 같은 값을 따른다.
test('둘러보기 소개 스위치: 고른 값은 discover PUT으로 저장되고 상태 줄이 따라 바뀐다', async () => {
  const h = shareHarness({});
  try {
    await h.messages.openSharePanel();
    await new Promise(r => setImmediate(r)); // paintShareDiscover의 가짜 GET 응답 한 바퀴
    assert.equal(h.els['share-disc-off'].getAttribute('aria-checked'), 'true', '기본 꺼짐(#739)은 안 함이 선택');
    assert.equal(h.els['share-disc-on'].getAttribute('aria-checked'), 'false');
    assert.equal(h.els['share-disc-off'].getAttribute('aria-checked'), 'true');
    await h.els['share-disc-on'].onclick();
    await new Promise(r => setImmediate(r)); // 다시 그리기(paintShareDiscover)의 가짜 GET 한 바퀴
    assert.deepEqual(h.requests.filter(r => r[0] === 'discover'), [['discover', 'tree1', true]], '판단은 서버에 맡긴다');
    // 스위치 뒤 상자 안 문장들(순간 수 힌트·상태 줄)이 같은 상태를 말한다(261116 2차 지적).
    assert.equal(h.els['share-disc-on'].getAttribute('aria-checked'), 'true', '켜짐은 소개가 선택');
    assert.equal(h.els['share-disc-on'].getAttribute('aria-checked'), 'true');
    assert.equal(h.els['share-disc-off'].getAttribute('aria-checked'), 'false');
    assert.match(h.els['share-feedback'].textContent, /둘러보기에 소개했어요/);
  } finally { h.restore(); }
});

// #538: '둘러보기에도 올리기' 스위치와 확인창 흐름은 공개 기본으로 바뀌면서 정리됐다.
// 둘러보기 소개는 서버가 조건(공개 && 순간 3개 이상)으로 자동 판단한다.
test('공유 창 화면에는 발견이라는 말이 없고, 단계·이유·공개 상태 틀이 있다', () => {
  assert.equal(shareHtml.includes('발견'), false, '발견 글자 0건');
  assert.match(shareHtml, /<ol id="share-steps"[^>]*aria-label="공유 단계"/);
  assert.match(shareHtml, /<li data-step="1" data-state="current">보여 줄 것 고르기<\/li>/);
  assert.match(shareHtml, /<li data-step="2" data-state="todo">미리보기<\/li>/);
  assert.match(shareHtml, /<li data-step="3" data-state="todo">링크 만들기<\/li>/);
  assert.match(shareHtml, /<p id="share-create-reason"[^>]*hidden>먼저 미리보기를 확인해 주세요\.<\/p>/);
  assert.match(shareHtml, /<a id="share-open" class="share-open" target="_blank" rel="noopener" hidden>열어 보기<\/a>/);
  assert.match(shareHtml, /<p id="share-copy-note" role="status"><\/p>/);
  assert.match(shareHtml, /공개 여부/);
  assert.match(shareHtml, /둘러보기 소개/);
  assert.match(shareHtml, /id="share-disc-off"/);
  assert.equal(shareHtml.includes('share-disc-on') && shareHtml.includes('id="share-disc-on"'), true, '소개 칸이 있다');
  assert.match(shareHtml, /id="share-disc-on"[^>]*>/);
  assert.match(shareHtml, /둘러보기 소개는 기본 꺼짐/);
  assert.equal(shareHtml.includes('링크 공유와 완전 비공개도'), false, '뜻 불명 문장은 삭제');
  assert.equal(shareHtml.includes('둘러보기에도 올리기'), false, '스위치 문구는 정리됐다');
  assert.match(shareHtml, /<details class="share-scope-more"><summary>자세히<\/summary>/);
  // 공개되는 범위(261117 고객 의견): 공개 응답(서버 projectSharedTree)에 트리 제목·순간(메모·날짜·감정·링크)이
  // 그대로 담기고 /api/media/ 업로드 파일의 url은 빈 값으로 빠진다 — 그 사실대로 적었는지 글자로 고정한다.
  assert.match(shareHtml, /지금 트리 하나의 제목과 순간\(메모·날짜·감정·링크\)이 그대로 보여요/);
  assert.match(shareHtml, /사진·영상 파일과 다른 트리는 공개되지 않아요/);
  assert.equal(shareHtml.includes('올린 사진은 나만 볼 수 있어요'), false, '사진을 올린 적 없는 사람도 이해하게 짧게 고쳤다');
});
