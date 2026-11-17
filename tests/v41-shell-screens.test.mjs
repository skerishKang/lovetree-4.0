import test from 'node:test';
import assert from 'node:assert/strict';
// #231 1-B②: 화면 전환은 셸 글자 대신 함수를 직접 불러 결과를 본다(DOM은 최소 가짜 객체).
import { createScreens } from '../public/v41/shell/screens.mjs';

test('show()는 화면 파일 이름을 받아 그 화면의 iframe 경로로 넘긴다', () => {
  const replaced = [];
  const fakeEl = extra => ({
    hidden: false,
    title: '',
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    contentWindow: { location: { href: 'about:blank', replace: url => replaced.push(url) } },
    addEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    inert: false,
    ...extra
  });
  const elements = {
    view: fakeEl(),
    'view-next': fakeEl(),
    empty: fakeEl(),
    'community-panel': { open: false, close() {} }
  };
  const saved = { document: globalThis.document, location: globalThis.location };
  globalThis.location = { origin: 'https://lovetree-4-0.pages.dev' };
  globalThis.document = {
    body: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
    querySelectorAll: () => []
  };
  try {
    let current = 'src064-orbit.html';
    const screens = createScreens({
      $: id => elements[id] ?? null,
      screens: [['home', 'src064-orbit.html', '첫 화면'], ['shelf', 'track32-bookshelf.html', '내 책장']],
      getCurrent: () => current,
      setCurrent: file => { current = file; },
      getSource: () => 'example',
      hasTree: () => true,
      flowNavigation() {},
      applyTheme() {},
      writeLocation() {},
      links() {},
      onFrameReady() {}
    });

    // #231 1.5단계 ⑥: 예시 모드도 실제 기록과 같은 /v41/views/ 한 벌을 연다.
    screens.show('track32-bookshelf.html');
    assert.equal(current, 'track32-bookshelf.html', '화면 이름을 그대로 받는다');
    assert.equal(replaced.at(-1), 'https://lovetree-4-0.pages.dev/v41/views/track32-bookshelf.html');

    // 의견 #26: 트리를 바꾸면 같은 화면이어도 주소에 tree=를 붙여 새 문서로 띄운다(옛 트리 내용이 남지 않게).
    screens.show('track32-bookshelf.html', false, 'tree-b');
    assert.match(replaced.at(-1), /[?&]tree=tree-b$/, '트리 값이 프레임 주소에 남는다');

    // 목록에 없는 파일은 화면을 바꾸지 않는다.
    const before = replaced.length;
    screens.show('nope.html');
    assert.equal(replaced.length, before);
    assert.equal(current, 'track32-bookshelf.html');
  } finally {
    globalThis.document = saved.document;
    if (saved.location === undefined) delete globalThis.location;
    else globalThis.location = saved.location;
  }
});

test('실제 기록(source=server)이면 views/ 판본, 트리가 없으면 빈 화면을 보여 준다', () => {
  const replaced = [];
  const blank = { hidden: false, title: '', classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, style: {}, contentWindow: { location: { href: 'about:blank', replace: url => replaced.push(url) } }, addEventListener() {}, setAttribute() {}, removeAttribute() {}, inert: false };
  const elements = { view: blank, 'view-next': null, empty: { ...blank, hidden: true }, 'community-panel': { open: false, close() {} } };
  const saved = { document: globalThis.document, location: globalThis.location };
  globalThis.location = { origin: 'https://lovetree-4-0.pages.dev' };
  globalThis.document = { body: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false } }, querySelectorAll: () => [] };
  try {
    let source = 'server', hasTree = true, linksCalled = 0, framesHidden = 0;
    const screens = createScreens({
      $: id => elements[id] ?? null,
      screens: [['home', 'src064-orbit.html', '첫 화면'], ['board', 'track58-pinboard.html', '기억 보드']],
      getCurrent: () => 'src064-orbit.html',
      setCurrent() {},
      getSource: () => source,
      hasTree: () => hasTree,
      flowNavigation() {},
      applyTheme() {},
      writeLocation() {},
      links() { linksCalled += 1; },
      onFrameReady() {}
    });
    screens.show('track58-pinboard.html');
    assert.equal(replaced.at(-1), 'https://lovetree-4-0.pages.dev/v41/views/track58-pinboard.html');

    // 트리가 없으면 화면을 열지 않고 빈 화면 안내를 보여 준다.
    hasTree = false;
    elements.empty.hidden = true;
    const opened = replaced.filter(u => u !== 'about:blank').length;
    screens.show('track58-pinboard.html');
    assert.equal(replaced.filter(u => u !== 'about:blank').length, opened, 'iframe에 새 화면을 열지 않는다');
    assert.ok(replaced.includes('about:blank'), '보이던 화면은 비운다');
    assert.equal(elements.empty.hidden, false, '빈 화면을 보여 준다');
    assert.ok(linksCalled >= 2);
    assert.equal(framesHidden, 0);
  } finally {
    globalThis.document = saved.document;
    if (saved.location === undefined) delete globalThis.location;
    else globalThis.location = saved.location;
  }
});

// #453 D1 + 맨 위 메뉴 눌린 표시: show()가 [data-view] 단추에 aria-current를 넣는다 —
// 지금 보는 화면만 'true', 나머지는 'false'이고, 빈 화면(트리 없음)에서는 전부 'false'다.
test("show()는 [data-view] 단추에 지금 보는 화면만 aria-current=true로 남긴다", () => {
  const replaced = [];
  const fakeEl = extra => ({
    hidden: false, title: '', dataset: {}, style: {}, attrs: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    contentWindow: { location: { href: 'about:blank', replace: url => replaced.push(url) } },
    addEventListener() {}, inert: false,
    setAttribute(name, value) { this.attrs[name] = String(value); },
    removeAttribute(name) { delete this.attrs[name]; },
    getAttribute(name) { return this.attrs[name] ?? null; },
    ...extra
  });
  const tabs = ['track59-sketchbook.html', 'track58-pinboard.html', 'track56-network.html']
    .map(view => fakeEl({ dataset: { view } }));
  const elements = { view: fakeEl(), 'view-next': fakeEl(), empty: fakeEl(), 'community-panel': { open: false, close() {} } };
  const saved = { document: globalThis.document, location: globalThis.location };
  globalThis.location = { origin: 'https://lovetree-4-0.pages.dev' };
  globalThis.document = {
    body: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
    querySelectorAll: sel => (sel === '[data-view]' ? tabs : [])
  };
  try {
    let hasTree = true;
    const screens = createScreens({
      $: id => elements[id] ?? null,
      screens: [['book', 'track59-sketchbook.html', '책'], ['board', 'track58-pinboard.html', '보드'], ['network', 'track56-network.html', '지도']],
      getCurrent: () => 'src064-orbit.html',
      setCurrent() {},
      getSource: () => 'example',
      hasTree: () => hasTree,
      flowNavigation() {},
      applyTheme() {},
      writeLocation() {},
      links() {},
      onFrameReady() {}
    });
    screens.show('track59-sketchbook.html');
    assert.deepEqual(tabs.map(b => b.attrs['aria-current']), ['true', 'false', 'false'], '지금 보는 화면만 눌린 상태다');

    screens.show('track58-pinboard.html');
    assert.deepEqual(tabs.map(b => b.attrs['aria-current']), ['false', 'true', 'false'], '화면을 옮기면 눌린 표시도 옮겨간다');

    // #453 D1: 빈 화면(트리 없음)에서는 어느 탭도 "지금 보는 곳"이 아니다 — 전부 false로 지운다.
    hasTree = false;
    screens.show('track56-network.html');
    assert.deepEqual(tabs.map(b => b.attrs['aria-current']), ['false', 'false', 'false'], '빈 화면에서는 눌린 표시가 없다');
  } finally {
    globalThis.document = saved.document;
    if (saved.location === undefined) delete globalThis.location;
    else globalThis.location = saved.location;
  }
});

// #583 '이 순간 열기': 지도를 특정 순간을 가운데 두고 열 요청이 있으면 show()가 프레임 주소에
// ?open=<순간>을 붙이고, 요청은 한 번 쓰면 지운다. 다른 화면에는 붙이지 않는다.
test("show()는 '이 순간 열기' 요청을 지도 프레임 주소 ?open=으로 옮기고 한 번만 쓴다", () => {
  const replaced = [];
  const fakeEl = () => ({
    hidden: false, title: '', dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    contentWindow: { location: { href: 'about:blank', replace: url => replaced.push(url) } },
    addEventListener() {}, setAttribute() {}, removeAttribute() {}, inert: false
  });
  const elements = { view: fakeEl(), 'view-next': fakeEl(), empty: fakeEl(), 'community-panel': { open: false, close() {} } };
  const saved = { document: globalThis.document, location: globalThis.location };
  globalThis.location = { origin: 'https://lovetree-4-0.pages.dev' };
  globalThis.document = {
    body: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
    querySelectorAll: () => []
  };
  try {
    let pending = 'm9';
    const screens = createScreens({
      $: id => elements[id] ?? null,
      screens: [['network', 'track56-network.html', '관계 지도'], ['book', 'track59-sketchbook.html', '책']],
      getCurrent: () => 'src064-orbit.html',
      setCurrent() {},
      getSource: () => 'example',
      hasTree: () => true,
      flowNavigation() {},
      applyTheme() {},
      writeLocation() {},
      links() {},
      takeNetworkOpen: () => { const v = pending; pending = null; return v; },
      onFrameReady() {}
    });
    screens.show('track56-network.html');
    assert.equal(replaced.at(-1), 'https://lovetree-4-0.pages.dev/v41/views/track56-network.html?open=m9', '지도 프레임 주소에 ?open=을 붙인다');
    // 요청은 한 번 소비된다 — 다음 지도 화면(탭으로 다시 열기)에는 붙지 않는다.
    screens.show('track59-sketchbook.html');
    assert.equal(replaced.at(-1), 'https://lovetree-4-0.pages.dev/v41/views/track59-sketchbook.html', '다른 화면 주소에는 붙지 않는다');
    screens.show('track56-network.html');
    assert.equal(replaced.at(-1), 'https://lovetree-4-0.pages.dev/v41/views/track56-network.html', '쓴 요청은 두 번 붙지 않는다');
  } finally {
    globalThis.document = saved.document;
    if (saved.location === undefined) delete globalThis.location;
    else globalThis.location = saved.location;
  }
});

// #713 후속(2026-11-16 보고): 그래프 화면만 views/graph/ 아래에 있다 — screenUrl이 하위 폴더를 빠뜨려
// #my/graph가 4.0 첫 화면으로 열렸다. show()가 만드는 iframe 주소와 화면 파일 실재를 고정한다.
test('show()는 그래프 화면 주소에 views/graph/ 하위 폴더를 붙인다', () => {
  const replaced = [];
  const fakeEl = () => ({
    hidden: false, title: '', dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    contentWindow: { location: { href: 'about:blank', replace: url => replaced.push(url) } },
    addEventListener() {}, setAttribute() {}, removeAttribute() {}, inert: false
  });
  const elements = { view: fakeEl(), 'view-next': fakeEl(), empty: fakeEl(), 'community-panel': { open: false, close() {} } };
  const saved = { document: globalThis.document, location: globalThis.location };
  globalThis.location = { origin: 'https://lovetree-4-0.pages.dev' };
  globalThis.document = {
    body: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
    querySelectorAll: () => []
  };
  try {
    const screens = createScreens({
      $: id => elements[id] ?? null,
      screens: [['graph', 'track60-graph.html', '그래프 보기'], ['network', 'track56-network.html', '지도']],
      getCurrent: () => 'src064-orbit.html',
      setCurrent() {},
      getSource: () => 'server',
      hasTree: () => true,
      flowNavigation() {},
      applyTheme() {},
      writeLocation() {},
      links() {},
      onFrameReady() {}
    });
    screens.show('track60-graph.html');
    assert.equal(replaced.at(-1), 'https://lovetree-4-0.pages.dev/v41/views/graph/track60-graph.html', '그래프 프레임 주소에 하위 폴더가 있다');
    screens.show('track56-network.html');
    assert.equal(replaced.at(-1), 'https://lovetree-4-0.pages.dev/v41/views/track56-network.html', '다른 화면 주소는 그대로다');
  } finally {
    globalThis.document = saved.document;
    if (saved.location === undefined) delete globalThis.location;
    else globalThis.location = saved.location;
  }
});
