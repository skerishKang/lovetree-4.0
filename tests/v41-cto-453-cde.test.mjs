import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// 시험 정비 2차(2026-11-15): community 배선 검사는 mountCommunity를 직접 띄워 동작으로 본다.
import { mountCommunity } from '../public/v41/community-panel.mjs';

// #453 CTO 점검 1차 PR 2: 설정 창 정리(C) · 자세한 추가 파일 단추(B-2) · 빈 화면 정리(D) · 예시 책 제목(E).
// 화면 배선은 글자로, 순수 규칙은 함수로 고정한다.
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const shell = read('public/v41/shell.mjs');
const html = read('public/v41/index.html');
const css = read('public/v41/shell.css');
const notice = read('public/v41/shell/notice.mjs');
const upload = read('public/v41/private-upload.mjs');

// 둘러보기 하네스 — tests/v41-date-style-one-piece.test.mjs의 communityHarness에
// 가짜 fetch·탭 줄·빈 화면 요소·닫기 흉내를 얹은 모양.
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

const COMMUNITY_ITEM = {
  shareId: 's1', title: '리센느, 나의 순간들', subject: '바다의 기억', summary: '첫 기록',
  momentCount: 2, createdAt: '2026-11-01T09:30:00.000Z',
  cover: { emotion: '설렘', title: '첫 순간' }, emotions: ['설렘'],
  stats: { hearts: 3, favorites: 1, hearted: false, favored: false, reactions: { heart: 3 }, mine: [] }
};

function communityHarness({ items = [], defer = false, emptyHidden = true } = {}) {
  const saved = {};
  for (const key of ['window', 'document', 'location', 'addEventListener', 'fetch']) { saved[key] = globalThis[key]; delete globalThis[key]; }
  globalThis.addEventListener = () => {};
  globalThis.location = { origin: 'https://example.test', hostname: 'lovetree-4-0.pages.dev' };
  let resolveFetch = () => {};
  globalThis.fetch = defer
    ? () => new Promise((resolve) => { resolveFetch = resolve; })
    : async () => ({ ok: true, status: 200, json: async () => ({ items, totalVisible: items.length, nextCursor: '' }) });
  globalThis.window = {};
  const els = {};
  const get = (id) => (els[id] ||= fakeElement({ id }));
  const tab = fakeElement();
  tab.setAttribute('aria-current', 'true');
  const emptyEl = fakeElement({ hidden: emptyHidden });
  globalThis.document = {
    createElement: (tag) => fakeElement({ tagName: String(tag).toUpperCase() }),
    createElementNS: (ns, tag) => fakeElement({ tagName: String(tag).toUpperCase(), namespaceURI: String(ns) }),
    querySelectorAll: (sel) => (sel === 'nav [data-view]' ? [tab] : []),
    getElementById: (id) => (id === 'empty' ? emptyEl : null)
  };
  const dialog = fakeElement({ id: 'community-panel' });
  dialog.querySelector = (sel) => get(String(sel).replace(/^#/, ''));
  mountCommunity({
    button: get('community-menu'), dialog,
    onOpenShare: () => {}, onStartRecord: () => {}, onShareOwn: () => {}, hasOwnTree: () => false,
    getDateStyle: () => 'dot'
  });
  return {
    get, tab, button: get('community-menu'), dialog,
    open: () => get('community-menu').onclick(),
    close: () => dialog.dispatch('close'),
    search: async () => { get('community-search-form').onsubmit({ preventDefault() {} }); await new Promise((r) => setTimeout(r, 0)); },
    searchNow: () => get('community-search-form').onsubmit({ preventDefault() {} }),
    resolveFetch: async (body) => { resolveFetch({ ok: true, status: 200, json: async () => body }); await new Promise((r) => setTimeout(r, 0)); },
    restore() { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; } }
  };
}

test('C3·C4·C5: 이름·용량·공유 보기 이름', () => {
  const nameLine = shell.slice(shell.indexOf('function paintSettingsProfile'), shell.indexOf('function paintSettingsProfile') + 700);
  assert.match(nameLine, /displayName/, '표시 이름을 먼저 쓴다');
  assert.equal((nameLine.match(/@/g) || []).length <= 1, true, '이메일은 한 번만 쓴다');
});

test('D1: 대화상자를 닫으면 빈 화면이 아닐 때만 탭의 "지금 보는 곳"을 되살린다', async () => {
  // 전: community-panel.mjs의 emptyShown 배선 글자 → 후: mountCommunity를 띄우고 열었다 닫아 본다.
  // screens.mjs가 빈 화면에서 aria-current를 전부 지우는 동작은 tests/v41-shell-screens.test.mjs가
  // createScreens로 직접 부러 본다.
  for (const c of [
    { emptyHidden: true, restored: 'true', name: '빈 화면이 아니면 원래 현재 탭을 되살린다' },
    { emptyHidden: false, restored: 'false', name: '빈 화면이면 되살리지 않는다' }
  ]) {
    const h = communityHarness({ emptyHidden: c.emptyHidden });
    try {
      h.open();
      await new Promise((r) => setTimeout(r, 0)); // 열기 때 시작된 목록 불러오기를 마친다
      assert.equal(h.tab.attrs['aria-current'], 'false', '둘러보기가 열린 동안 탭 표시를 내려놓는다');
      assert.equal(h.tab.dataset.wasCurrent, '1', '원래 현재였던 탭을 기억한다');
      h.close();
      assert.equal(h.tab.dataset.wasCurrent, undefined, '기억은 닫을 때 지운다');
      assert.equal(h.tab.attrs['aria-current'], c.restored, c.name);
      assert.equal(h.button.attrs['aria-current'], 'false', '둘러보기 단추 표시도 내려놓는다');
    } finally { h.restore(); }
  }
});

test('D3: 결과가 있어도 미리보기는 닫혀 있고, 카드를 누를 때 연다', async () => {
  const empty = communityHarness({ items: [] });
  try {
    await empty.search();
    assert.equal(empty.get('community-preview').open, false, '빈 결과에서는 미리보기가 닫혀 있다');
  } finally { empty.restore(); }
  const some = communityHarness({ items: [COMMUNITY_ITEM] });
  try {
    await some.search();
    assert.equal(some.get('community-preview').open, false, '목록을 불러와도 미리보기는 열리지 않는다');
    const card=some.get('community-list').children.find(node=>node.dataset.shareId==='s1');
    assert.equal(card.tagName,'BUTTON','카드 전체가 키보드로도 열리는 단추다');
    assert.equal(card.children.some(node=>node.tagName==='BUTTON'),false,'카드 안에는 별도 액션 단추가 없다');
    card.onclick();
    assert.equal(some.get('community-preview').open,true,'카드를 누르면 미리보기가 열린다');
    const close=some.get('community-preview').children[0].children.find(node=>node.className==='community-preview-close');
    close.onclick();
    assert.equal(some.get('community-preview').open,false,'닫기 단추로 미리보기를 닫는다');
  } finally { some.restore(); }
  const loading = communityHarness({ defer: true });
  try {
    loading.searchNow();
    assert.equal(loading.get('community-preview').open, false, '불러오는 중에도 미리보기는 닫혀 있다');
    await loading.resolveFetch({ items: [], totalVisible: 0, nextCursor: '' });
  } finally { loading.restore(); }
});

// #824 결정 7·1·2(2026-11-18): 3 미만 숫자 숨김 · 이번 주 담은 수 · '많이 담긴 순' 정렬.
test('#824: 3 미만 숫자는 라벨만 남기고, 3부터 숫자가 보인다', async () => {
  const small = communityHarness({ items: [{ ...COMMUNITY_ITEM, stats: { ...COMMUNITY_ITEM.stats, favorites: 0, hearts: 2, weeklyFavorites: 2 } }] });
  try {
    await small.search();
    const card = small.get('community-list').children.find(node => node.dataset.shareId === 's1');
    const meta = card.children.find(node => node.className === 'community-card-meta').textContent;
    assert.doesNotMatch(meta, /공감 2/, '공감 2는 숫자를 숨긴다');
    assert.doesNotMatch(meta, /이번 주/, '이번 주 2명도 숨긴다');
    card.onclick();
    const body = small.get('community-preview').children.find(node => node.className === 'community-preview-body');
    const fav = body.children.find(node => node.className === 'community-preview-actions').children[0].textContent;
    assert.equal(fav, '즐겨찾기', '즐겨찾기 0은 라벨만 남긴다');
    const previewMeta = body.children.find(node => node.className === 'community-preview-meta').textContent;
    assert.doesNotMatch(previewMeta, /공감 2/);
  } finally { small.restore(); }
  const big = communityHarness({ items: [{ ...COMMUNITY_ITEM, stats: { ...COMMUNITY_ITEM.stats, favorites: 3, hearts: 4, weeklyFavorites: 5 } }] });
  try {
    await big.search();
    const card = big.get('community-list').children.find(node => node.dataset.shareId === 's1');
    const meta = card.children.find(node => node.className === 'community-card-meta').textContent;
    assert.match(meta, /공감 4/, '3 이상은 숫자를 보여 준다');
    assert.match(meta, /이번 주 5명/, '이번 주 담은 수는 3 이상일 때 따라온다');
    card.onclick();
    const body = big.get('community-preview').children.find(node => node.className === 'community-preview-body');
    const fav = body.children.find(node => node.className === 'community-preview-actions').children[0].textContent;
    assert.equal(fav, '즐겨찾기 3', '즐겨찾기 3은 숫자를 보여 준다');
  } finally { big.restore(); }
});

test('#824: 정렬 고르기로 많이 담긴 순을 고르면 sort=popular로 부른다', async () => {
  const h = communityHarness({ items: [COMMUNITY_ITEM] });
  try {
    const calls = [];
    const previous = globalThis.fetch;
    globalThis.fetch = async (input) => { calls.push(String(typeof input === 'string' ? input : input.url)); return { ok: true, status: 200, json: async () => ({ items: [COMMUNITY_ITEM], totalVisible: 1, nextCursor: '' }) }; };
    h.open();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(calls.some(url => url.includes('sort=popular')), false, '기본(최신순)으로는 popular를 부르지 않는다');
    const sortSelect = h.get('community-sort');
    sortSelect.value = 'popular';
    sortSelect.onchange();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(calls.some(url => url.includes('sort=popular')), true, '많이 담긴 순을 고르면 sort=popular로 부른다');
    assert.match(h.get('community-feedback').textContent, /많이 담긴 순서예요\./, '안내 말도 정렬을 따라간다');
    globalThis.fetch = previous;
  } finally { h.restore(); }
});

test('#824·#903: 가입 7일 미만이 담기를 누르면 안내가 단추 바로 다음 줄에 뜨고, 담기에 성공하면 지워진다', async () => {
  const item = { ...COMMUNITY_ITEM, stats: { ...COMMUNITY_ITEM.stats, favorites: 5, favored: false } };
  const h = communityHarness({ items: [item] });
  try {
    const calls = [];
    let failFavorite = true;
    const previous = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = String(typeof input === 'string' ? input : input.url), method = String(init?.method || 'GET');
      calls.push(method + ' ' + url);
      if (method !== 'GET' && url.includes('/favorite')) {
        if (failFavorite === 'server') return { ok: false, status: 500, json: async () => ({ error: { code: 'server_error', message: '' } }), message: undefined };
        if (failFavorite) return { ok: false, status: 403, json: async () => ({ error: { code: 'vote_too_new', message: '가입하고 7일이 지나면 투표할 수 있어요.' } }), message: undefined };
        return { ok: true, status: 200, json: async () => ({ ok: true, stats: { ...item.stats, favored: method === 'PUT', favorites: method === 'PUT' ? 6 : 5 } }) };
      }
      return { ok: true, status: 200, json: async () => ({ items: [item], totalVisible: 1, nextCursor: '' }) };
    };
    h.open();
    await new Promise((r) => setTimeout(r, 0));
    const card = h.get('community-list').children.find(node => node.dataset.shareId === 's1');
    card.onclick();
    const body = h.get('community-preview').children.find(node => node.className === 'community-preview-body');
    const fav = body.children.find(node => node.className === 'community-preview-actions').children.find(node => node.dataset.communityAction === 'favorite');
    assert.equal(fav.textContent, '즐겨찾기 5', '누르기 전에는 담지 않은 상태다');
    // #903: 안내 칸은 담기 단추 묶음(community-preview-actions) 바로 다음 줄이다 — 막히기 전에는 숨어 있다.
    const noteOf = (nowBody) => {
      const nowActions = nowBody.children.find(node => node.className === 'community-preview-actions');
      return nowBody.children[nowBody.children.indexOf(nowActions) + 1];
    };
    const note = noteOf(body);
    assert.equal(note.className, 'community-vote-note', '안내 칸은 actions 바로 다음 줄자리에 둔다');
    assert.equal(note.hidden, true, '막히기 전에는 안내 칸이 보이지 않는다');
    fav.onclick();
    await new Promise((r) => setTimeout(r, 0));
    assert.doesNotMatch(h.get('community-feedback').textContent, /가입하고 7일/, '투표 막힘 안내는 상태 줄에 내리지 않는다(#903 — 단추 아래 칸 하나만)');
    assert.equal(fav.textContent, '즐겨찾기 5', '막힌 담기는 하트 상태를 바꾸지 않는다');
    assert.equal(fav.attrs['aria-pressed'], 'false', '눌림 표시도 원래대로다');
    assert.equal(calls.some(call => call.startsWith('PUT ') && call.includes('/favorite')), true, '담기 요청은 서버로 나갔다');
    assert.equal(note.hidden, false, '막히면 안내 칸을 단추 바로 다음 줄에 보인다');
    assert.equal(note.textContent, '가입하고 7일이 지나면 투표할 수 있어요.', '서버 안내 문구를 그대로 단추 옆에 내린다');
    // 담기에 성공하면 안내는 지워진다(미리보기를 다시 그려 새 안내 칸은 숨은 채로 둔다).
    failFavorite = false;
    fav.onclick();
    await new Promise((r) => setTimeout(r, 0));
    const body2 = h.get('community-preview').children.find(node => node.className === 'community-preview-body');
    const fav2 = body2.children.find(node => node.className === 'community-preview-actions').children.find(node => node.dataset.communityAction === 'favorite');
    assert.equal(fav2.textContent, '✓ 즐겨찾기 6', '성공한 담기는 하트 상태를 바꾼다');
    assert.equal(noteOf(body2).hidden, true, '담기에 성공하면 안내 칸은 다시 숨는다');
    // 투표 막힘이 아닌 실패(서버 고장)는 상태 줄로 내린다 — 단추 아래 칸은 숨은 채.
    failFavorite = 'server';
    const fav3 = body2.children.find(node => node.className === 'community-preview-actions').children.find(node => node.dataset.communityAction === 'favorite');
    fav3.onclick();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(h.get('community-feedback').textContent, '요청을 처리하지 못했어요.', '다른 실패는 상태 줄로 내린다');
    assert.equal(noteOf(h.get('community-preview').children.find(node => node.className === 'community-preview-body')).hidden, true, '다른 실패 때는 단추 아래 칸을 보이지 않는다');
    globalThis.fetch = previous;
  } finally { h.restore(); }
});
