import test from 'node:test';
import assert from 'node:assert/strict';
// #231 1-B②-2: 옮긴 헤더 함수를 직접 불러 결과를 본다(소스 글자 시험이 아니라 최소 가짜 DOM).
import { createHeader } from '../public/v41/shell/header.mjs';

function fakeEl(extra = {}) {
  return {
    hidden: false,
    title: '',
    textContent: '',
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    querySelectorAll: () => [],
    querySelector: () => null,
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    removeAttribute(name) { delete this.attrs[name]; },
    getAttribute(name) { return this.attrs[name] ?? null; },
    focus() {},
    ...extra
  };
}

function harness({ owned = false, trees = 0, tree = null, source = 'example', current = 'src064-orbit.html', dirty = false, accountApi = null, subject = 's1' } = {}) {
  const els = {
    'tree-views': fakeEl(),
    'record-menu': fakeEl(),
    'source-label': fakeEl(),
    'write-menu': fakeEl(),
    'share-menu': fakeEl(),
    'account-entry': fakeEl(),
    'account-avatar': fakeEl({ hidden: true }),
    'account-email': fakeEl(),
    'account-popover': fakeEl({ hidden: true })
  };
  const saved = { document: globalThis.document, sessionStorage: globalThis.sessionStorage };
  globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.document = { querySelectorAll: () => [] };
  globalThis.window = globalThis;
  globalThis.LT41 = tree ? { tree } : null;
  let tips = 0;
  const member = { snapshot: () => ({ owned, writable: true, dirty, subject }) };
  const header = createHeader({
    $: id => els[id] ?? null,
    navBar: null,
    getMember: () => (owned === null ? null : member),
    getModel: () => (trees === null ? null : { trees: Array.from({ length: trees }, (_, i) => ({ id: 't' + i })) }),
    getSource: () => source,
    getCurrent: () => current,
    accountApi: accountApi ?? { account: async () => ({ ok: false }) },
    delegate: { syncTreeTips: () => { tips += 1; } }
  });

  const restore = () => {
    globalThis.document = saved.document;
    globalThis.sessionStorage = saved.sessionStorage;
    if (saved.sessionStorage === undefined) delete globalThis.sessionStorage;
    delete globalThis.LT41;
  };
  return { header, els, tips: () => tips, restore };
}

test('flowNavigation: 로그아웃이면 트리 탭을 숨기고 "트리 고르기"를 보여 준다', () => {
  const h = harness({ owned: false, trees: 0, tree: null });
  try {
    h.header.flowNavigation();
    assert.equal(h.els['tree-views'].hidden, true, '트리 보기 탭 숨김');
    // #222: 로그아웃은 트리 선택도 숨긴다(글자는 다음 로그인을 위해 '트리 고르기'로 남겨 둔다).
    assert.equal(h.els['record-menu'].hidden, true, '트리 선택은 숨김');
    assert.equal(h.els['source-label'].textContent, '트리 고르기');
    assert.equal(h.els['write-menu'].hidden, true, '순간 남기기도 숨김(#222)');
    assert.equal(h.els['share-menu'].hidden, true, '공유는 숨김');
    assert.equal(h.tips(), 1, '말풍선 동기화를 부른다');
  } finally {
    h.restore();
  }
});

test('flowNavigation: 트리가 있으면 탭·트리 이름·공유가 모두 열린다', () => {
  const tree = { id: 't0', title: '리센느', moments: [] };
  const h = harness({ owned: true, trees: 1, tree, source: 'server' });
  try {
    h.header.flowNavigation();
    assert.equal(h.els['tree-views'].hidden, false, '트리 보기 탭 표시');
    assert.equal(h.els['source-label'].textContent, '트리: 리센느');
    assert.equal(h.els['share-menu'].hidden, false, '공유 표시');
    assert.equal(h.els['record-menu'].hidden, false);
  } finally {
    h.restore();
  }
});

test('flowNavigation: 공유 감상에서는 트리 관련을 숨긴다', () => {
  const tree = { id: 't0', title: '리센느', moments: [] };
  const h = harness({ owned: false, trees: 1, tree, source: 'share' });
  try {
    h.header.flowNavigation();
    assert.equal(h.els['tree-views'].hidden, true);
    assert.equal(h.els['record-menu'].hidden, true, '트리 선택도 숨김');
    assert.equal(h.els['write-menu'].hidden, true);
    assert.equal(h.els['share-menu'].hidden, true);
  } finally {
    h.restore();
  }
});

test('renderAccount: 로그아웃은 로그인 알약, 로그인은 첫 글자 동그라미', () => {
  const out = harness({ owned: false });
  try {
    out.header.renderAccount();
    assert.equal(out.els['account-entry'].hidden, false);
    assert.equal(out.els['account-entry'].textContent, '로그인');
    assert.equal(out.els['account-avatar'].hidden, true);
  } finally {
    out.restore();
  }
  const inn = harness({ owned: true });
  try {
    inn.header.renderAccount();
    assert.equal(inn.els['account-entry'].hidden, true);
    assert.equal(inn.els['account-avatar'].hidden, false);
    assert.ok(inn.els['account-avatar'].getAttribute('aria-label'), 'aria-label 을 채운다');
  } finally {
    inn.restore();
  }
});

test('closeAccountMenu: 열려 있을 때만 닫는다', () => {
  const h = harness({ owned: true });
  try {
    h.els['account-popover'].hidden = false;
    h.header.closeAccountMenu();
    assert.equal(h.els['account-popover'].hidden, true);
  } finally {
    h.restore();
  }
});

// #368 1·2: 계정 메뉴는 본인만 보는 곳이라 이메일을 가리지 않고 전체를 보여 준다.
test('renderAccount: 이메일이 있으면 계정 메뉴에 전체 이메일을 보여 주고 가리지 않는다', async () => {
  const email = 'kimbs5993+tutorial02@example.com';
  const h = harness({
    owned: true,
    accountApi: { account: async () => ({ ok: true, confirmKind: 'email', email }) }
  });
  try {
    await h.header.loadAccountEmail();
    assert.equal(h.els['account-email'].textContent, email, '전체 이메일 표시, mask(•) 없음');
    assert.ok(!h.els['account-email'].textContent.includes('•'), '마스킹 문자가 없다');
    assert.equal(h.els['account-avatar'].textContent, 'K', '동그라미 글자 = 이메일 첫 글자(대문자)');
    assert.equal(h.els['account-avatar'].getAttribute('aria-label'), `내 계정 메뉴, ${email}으로 로그인됨`);
  } finally {
    h.restore();
  }
});

test('renderAccount: 이메일이 없으면 subject 첫 글자로 동그라미, 표시는 내 계정', () => {
  const h = harness({ owned: true, subject: 'usr_member_abc' });
  try {
    h.header.renderAccount();
    assert.equal(h.els['account-email'].textContent, '내 계정', '이메일 없을 때 표시는 내 계정');
    assert.equal(h.els['account-avatar'].textContent, 'U', '이메일 없으면 subject 첫 글자 규칙');
    assert.equal(h.els['account-avatar'].getAttribute('aria-label'), '내 계정 메뉴, 내 계정으로 로그인됨');
  } finally {
    h.restore();
  }
});

test('loadAccountEmail: 계정 API가 이메일을 주면 갱신하고, 아니면 그대로 둔다', async () => {
  const email = 'fan02@love.io';
  const loaded = harness({ owned: true, accountApi: { account: async () => ({ ok: true, confirmKind: 'email', email }) } });
  try {
    await loaded.header.loadAccountEmail();
    assert.equal(loaded.header.currentAccountEmail(), email);
    assert.equal(loaded.els['account-email'].textContent, email);
  } finally {
    loaded.restore();
  }
  const none = harness({ owned: true, accountApi: { account: async () => ({ ok: true, confirmKind: 'phrase' }) } });
  try {
    await none.header.loadAccountEmail();
    assert.equal(none.header.currentAccountEmail(), '', '이메일 없으면 빈 값 유지');
    assert.equal(none.els['account-email'].textContent, '내 계정');
  } finally {
    none.restore();
  }
});
