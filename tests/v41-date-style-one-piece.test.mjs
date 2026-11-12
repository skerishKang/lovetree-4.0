// #480 L13: 날짜 표기 한 벌 — 책·보드·지도·첫 화면뿐 아니라 내 트리(보관함)·둘러보기·공유 목록·
// 보관 파일도 같은 설정(dateStyle)을 따른다. 그리고 '받아서 location.reload() 하는' 새 코드는 만들지 않는다.
// 전: 공유 목록은 toLocaleDateString('ko-KR'), 둘러보기는 String(createdAt).slice(0,10),
//     보관 파일은 toLocaleString('ko-KR')이라 세 표기(점·줄표·한글) 어디에도 맞지 않았다.
// 후: 모두 formatDisplayDate(값, 설정) 한 벌을 지난다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatDisplayDate } from '../public/v41/book-usability.mjs';
import { normalizeDateStyle } from '../public/v41/domain.mjs';
import { createMessages } from '../public/v41/shell/messages.mjs';
import { mountCommunity } from '../public/v41/community-panel.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ISO = '2026-11-10T09:30:00.000Z';

// 세 표기가 실제로 서로 다른 문자열을 만든다(이 시험이 문자열 고정이 아님을 보인다).
test('한 벌: 같은 값이 세 표기로 다르게 적힌다', () => {
  const dotted = formatDisplayDate(ISO, 'dot');
  const dashed = formatDisplayDate(ISO, 'dash');
  const long = formatDisplayDate(ISO, 'long');
  assert.equal(dotted, '2026. 11. 10');
  assert.equal(dashed, '2026-11-10');
  assert.equal(long, '11월 10일');
  assert.notEqual(dotted, dashed, '점과 줄표는 다른 문자열이다');
  assert.equal(normalizeDateStyle(undefined), 'dot', '설정이 없으면 점 표기(기본)');
});

function fakeElement(extra = {}) {
  return Object.assign({
    value: '', textContent: '', hidden: false, open: false, disabled: false, checked: false,
    children: [], attrs: {}, dataset: {}, className: '', selectedOptions: [{ textContent: '' }],
    addEventListener() {}, setAttribute(n, v) { this.attrs[n] = v; }, getAttribute(n) { return this.attrs[n] ?? null; },
    replaceChildren(...k) { this.children = k; }, append(...k) { this.children.push(...k); },
    querySelector: () => fakeElement(), querySelectorAll: () => [], close() { this.open = false; }, showModal() { this.open = true; }
  }, extra);
}

// 공유 목록·공유 미리보기의 날짜가 설정을 따르는지: 실제 createMessages를 돌려 DOM 글자를 읽는다.
function messagesHarness({ dateStyle = 'dot' } = {}) {
  const saved = {};
  for (const key of ['window', 'document', 'location', 'addEventListener']) { saved[key] = globalThis[key]; delete globalThis[key]; }
  const els = {};
  globalThis.addEventListener = () => {};
  globalThis.location = { origin: 'https://example.test', hostname: 'lovetree-4-0.pages.dev', hash: '' };
  globalThis.document = { createElement: () => fakeElement(), querySelectorAll: () => [] };
  globalThis.window = { LT41: { tree: { id: 'tree1', title: '윤슬', moments: [] }, momentId: 'm1' } };
  const get = (id) => (els[id] ||= fakeElement({ id }));
  const messages = createMessages({
    $: get,
    getCurrent: () => 'track59-sketchbook.html',
    setCurrent: () => {},
    getModel: () => globalThis.window.LT41,
    getSource: () => 'server',
    getMember: () => ({ snapshot: () => ({ owned: true, writable: true, dirty: false }) }),
    getDateStyle: () => dateStyle,
    shareApi: {
      list: async () => ({ ok: true, shares: [{ id: 's1', view: 'book', treeId: 'tree1', status: 'active', createdAt: ISO }] }),
      preview: async () => ({ ok: true, preview: { previewToken: 'tok', tree: { title: '윤슬', moments: [{ id: 'm1', title: '첫 순간', emotion: '설렘', date: ISO }] } } }),
      create: async () => ({ ok: true, share: { id: 's2' } }),
      setDiscoverable: async () => ({ ok: true }), revoke: async () => ({ ok: true })
    },
    notify: () => {}, panel: () => {}, show: () => {}, links: () => {}, writeLocation: () => {}, choose: () => {},
    openEditor: () => {}, openLoginStart: () => {}, openAccountMenu: () => {}, sample: () => {},
    applyTheme: () => {}, paintThemeControls: () => {}, viewForFile: () => 'book',
    exampleTree: { id: 'example', moments: [] }, journey: {}, getShareDefaults: () => ({ view: 'book', discover: false })
  });
  return { els, get, messages, utils: messages, restore() { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; } } };
}

for (const style of ['dot', 'dash', 'long']) {
  test(`공유 목록: 만든 날짜가 설정(${style})을 따른다(전: 늘 ko-KR)`, async () => {
    const h = messagesHarness({ dateStyle: style });
    try {
      h.utils.openSharePanel();
      await new Promise((r) => setTimeout(r, 0));
      const host = h.get('share-list');
      // 행은 여러 겹(행 > 세부 > 버튼)이라 글자를 모두 모아 읽는다.
      const walk = (node) => [node.textContent || '', ...(node.children || []).flatMap(walk)].join(' ');
      const text = (host.children || []).map(walk).join(' ');
      assert.ok(text.includes(formatDisplayDate(ISO, style)), `"${formatDisplayDate(ISO, style)}"가 보여야 한다`);
      assert.ok(!/2026\.\s*11\.\s*10\./.test(text) || style === 'dot', '다른 표기가 섞이지 않는다');
      assert.ok(!text.includes('오전') && !text.includes('오후'), 'ko-KR 로케일 문자열(오전/오후)이 남지 않는다');
    } finally { h.restore(); }
  });

  test(`공유 미리보기: 순간 날짜가 설정(${style})을 따른다(전: 저장된 ISO 그대로)`, async () => {
    const h = messagesHarness({ dateStyle: style });
    try {
      h.get('share-moment').value = 'm1';
      h.get('share-view').value = 'book';
      await h.get('share-preview').onclick();
      const items = h.get('share-preview-moments').children || [];
      const text = items.map((li) => li.textContent).join(' ');
      assert.ok(text.includes(formatDisplayDate(ISO, style)), `"${formatDisplayDate(ISO, style)}"가 보여야 한다`);
      assert.ok(!text.includes('2026-11-10T'), '원본 ISO 문자열이 그대로 나오지 않는다');
    } finally { h.restore(); }
  });
}

// 둘러보기(공개 목록) 카드·댓글의 날짜가 설정을 따르는지.
function communityHarness({ dateStyle = 'dot', items = [], comments = [] } = {}) {
  const saved = {};
  for (const key of ['window', 'document', 'location', 'addEventListener', 'fetch']) { saved[key] = globalThis[key]; delete globalThis[key]; }
  globalThis.addEventListener = () => {};
  globalThis.location = { origin: 'https://example.test', hostname: 'lovetree-4-0.pages.dev' };
  globalThis.document = { createElement: () => fakeElement(), querySelectorAll: () => [] };
  globalThis.window = {};
  const els = {};
  const get = (id) => (els[id] ||= fakeElement({ id }));
  globalThis.document.querySelector = (sel) => get(String(sel).replace(/^#/, ''));
  const dialog = fakeElement({ id: 'community-panel' });
  dialog.querySelector = (sel) => get(String(sel).replace(/^#/, ''));
  mountCommunity({
    button: get('community-menu'), dialog,
    onOpenShare: () => {}, onStartRecord: () => {}, onShareOwn: () => {}, hasOwnTree: () => false,
    getDateStyle: () => dateStyle
  });
  return { get, restore() { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; } } };
}

// 카드 글자를 실제로 만드는 함수는 모듈 안쪽이라, 계약(공용 한 벌을 지난다)을 코드로 고정한다.
test('둘러보기: 카드·댓글 날짜가 공용 한 벌을 지난다(전: ISO 앞 10글자 고정)', () => {
  const src = read('public/v41/community-panel.mjs');
  assert.match(src, /import \{formatDisplayDate\} from '\.\/book-usability\.mjs';/);
  assert.match(src, /const when=value=>formatDisplayDate\(String\(value\|\|''\)\.slice\(0,10\),dateStyle\(\)\);/);
  assert.doesNotMatch(src, /String\(comment\.createdAt\|\|''\)\.slice\(0,10\)/, '댓글 날짜가 원본 앞 10글자로 남지 않는다');
  assert.doesNotMatch(src, /String\(item\.createdAt\|\|''\)\.slice\(0,10\)/, '카드 날짜가 원본 앞 10글자로 남지 않는다');
  assert.match(src, /const dateStyle=\(\)=>\(typeof getDateStyle==='function'\?getDateStyle\(\):'dot'\);/);
  // 셸이 설정을 넘긴다.
  assert.match(read('public/v41/shell/messages.mjs'), /getDateStyle: \(\) => getDateStyle\(\),/);
});

test('보관 파일: 날짜가 공용 한 벌을 지난다(전: toLocaleString(ko-KR))', () => {
  // 주석은 빼고 코드만 본다(설명에 옛 호출 이름이 남는 것은 상관없다).
  const src = read('public/v41/private-upload.mjs').split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  assert.match(src, /import \{formatDisplayDate\} from '\.\/book-usability\.mjs';/);
  assert.match(src, /const uploadedDate\s*=\s*formatDisplayDate\(asset\.createdAt\s*,\s*getState\(\)\?\.prefs\?\.dateStyle\)/);
  assert.doesNotMatch(src, /toLocaleString\('ko-KR'\)/);
});

test('L13 규칙: 값을 받아 location.reload() 하는 코드를 새로 만들지 않았다', () => {
  // 날짜 값을 받아 다시 뜨는 길은 #476/#477이 정리한 첫 화면 하나뿐이다. 여기서 새로 만들지 않는다.
  for (const p of ['public/v41/shell/messages.mjs', 'public/v41/shell.mjs', 'public/v41/community-panel.mjs', 'public/v41/private-upload.mjs']) {
    const src = read(p);
    assert.doesNotMatch(src, /location\.reload\(\)/, `${p}에 프레임 새로고침이 없다`);
  }
  // 이 L13 변경은 새 날짜 메시지 '수신기'를 만들지 않는다 — community-panel·private-upload에는 원래도 없다.
  for (const p of ['public/v41/community-panel.mjs', 'public/v41/private-upload.mjs']) {
    assert.doesNotMatch(read(p), /addEventListener\('message'/, `${p}에 message 수신기가 없다`);
  }
  // messages.mjs의 message 수신기는 예전부터 있던 하나뿐이고(날짜 메시지를 받지 않는다), 새로 늘리지 않았다.
  const msgSrc = read('public/v41/shell/messages.mjs');
  assert.equal((msgSrc.match(/addEventListener\('message'/g) || []).length, 1, 'messages.mjs의 message 수신기는 하나뿐이다');
  assert.doesNotMatch(msgSrc, /lt41-date-style/, 'messages.mjs가 날짜 메시지를 받지 않는다');
});
