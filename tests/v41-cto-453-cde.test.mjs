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
    value: '', textContent: '', innerHTML: '', hidden: false, open: false, disabled: false,
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

test('C1·C2: 설정 창은 맨 위에서 열리고, 지난 안내는 남지 않는다', () => {
  assert.match(shell, /openAccountSettings\(\{section=''[\s\S]{0,80}?\)\{/, '기본값은 맨 위(빈 구역)다');
  assert.match(shell, /if\(!section\)return;/, '구역을 지정했을 때만 그 묶음으로 스크롤한다');
  assert.match(shell, /settings-feedback'\)\.textContent=''/, '열 때 지난 안내를 비운다');
  assert.match(notice, /if \(\$\('settings-feedback'\) && \$\('account-settings'\)\?\.open\)/, '설정이 열려 있을 때만 그 줄에 쓴다');
});

test('C3·C4·C5: 이름·용량·공유 보기 이름', () => {
  const nameLine = shell.slice(shell.indexOf('function paintSettingsProfile'), shell.indexOf('function paintSettingsProfile') + 700);
  assert.match(nameLine, /displayName/, '표시 이름을 먼저 쓴다');
  assert.equal((nameLine.match(/@/g) || []).length <= 1, true, '이메일은 한 번만 쓴다');
  assert.match(shell, /Math\.round\(data\.usedBytes\/1000000\)\+' MB \/ '\+Math\.round\(data\.quotaBytes\/1000000\)\+' MB 사용/);
  assert.match(html, /data-share-view="book"[^>]*>책</);
  assert.match(html, /data-share-view="network"[^>]*>지도</);
  assert.doesNotMatch(html, />기억책</);
  assert.match(css, /@media\(min-width:900px\)\{#account-settings\{padding-inline:max\(24px,calc\(\(100% - 720px\)\/2\)\)\}\}/, '넓은 화면은 720px 안팎 가운데');
});

test('B-2: 사진·영상은 디자인 단추 + 고른 파일 이름으로 고른다', () => {
  assert.match(upload, /class="file-pick"/);
  assert.match(upload, /class="file-pick-button"/, '보이는 것은 단추다');
  assert.match(upload, /class="file-pick-name"/, '고른 파일 이름 자리');
  assert.match(upload, /<span class="file-pick">[\s\S]{0,240}?<input type="file"/, '실제 input은 같은 칸 안에 그대로 둔다');
  assert.match(upload, /function setName\(/);
  assert.match(css, /\.file-pick input\[type=file\]\{display:none\}/, '실제 칸은 숨긴다');
  assert.match(css, /\.file-pick-button\{[^}]*min-height:44px/, '누를 수 있는 크기');
  assert.match(upload, /<button type="button" class="file-pick-button" data-file-open>/, '단추는 키보드로 눌린다');
  assert.match(upload, /querySelector\('\[data-file-open\]'\)|\[data-file-open\]/, '단추가 실제 input을 연다');
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

test('D2: 빈 화면 문구·단추는 계정 상태에 맞춘다', () => {
  assert.match(shell, /function paintEmptyCopy\(\)/);
  assert.match(shell, /owned\?'아직 트리가 없어요\.':'다시 펼칠 순간을 기다리고 있어요\.'/);
  // #463: 트리 0개(로그인)는 ＋ 첫 트리 만들기가 주 버튼이다.
  assert.match(shell, /\$\('empty-records'\)\.textContent=owned\?'＋ 첫 트리 만들기':'내 기록 불러오기'/);
  assert.match(shell, /\$\('empty-file'\)\.hidden=owned;/, '로그인 상태에서는 백업 파일 열기를 숨긴다');
  assert.match(shell, /if\(kind!=='share'\)\{[\s\S]{0,120}?paintEmptyCopy\(\);/);
});

test('D3: 공개 트리가 0개면 미리보기 칸을 숨기고, 결과가 있으면 보인다', async () => {
  // 전: previewCollapses 정의와 hidden 대입 줄을 글자로 봤다 → 후: 목록을 실제로 불러와 본다.
  const empty = communityHarness({ items: [] });
  try {
    await empty.search();
    assert.equal(empty.get('community-preview').hidden, true, '빈 결과는 미리보기 칸을 숨긴다');
  } finally { empty.restore(); }
  const some = communityHarness({ items: [COMMUNITY_ITEM] });
  try {
    await some.search();
    assert.equal(some.get('community-preview').hidden, false, '결과가 있으면 미리보기 칸을 보인다');
  } finally { some.restore(); }
  const loading = communityHarness({ defer: true });
  try {
    loading.searchNow();
    assert.equal(loading.get('community-preview').hidden, false, '불러오는 중에는 미리보기 칸을 숨기지 않는다');
    await loading.resolveFetch({ items: [], totalVisible: 0, nextCursor: '' });
    assert.equal(loading.get('community-preview').hidden, true, '빈 결과로 끝나면 그때 숨긴다');
  } finally { loading.restore(); }
  // 빈 결과 배치는 CSS 값 — 글자 검사로 유지한다(docs/TESTING.md 규칙 2).
  assert.match(css, /\.community-layout:has\(#community-preview\[hidden\]\)\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(css, /\.community-layout:has\(#community-preview\[hidden\]\) \.community-empty\{[^}]*text-align:center/);
});
