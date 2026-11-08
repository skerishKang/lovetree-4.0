import test from 'node:test';
import assert from 'node:assert/strict';
// #231 1-B③-1: 옮긴 로그인 시작·세션 함수를 직접 불러 결과를 본다(최소 가짜 location·DOM).
import { createAuth } from '../public/v41/shell/auth.mjs';

function harness({ search = '', owned = false, writable = true } = {}) {
  const assigned = [];
  const replaced = [];
  const els = {};
  const el = () => ({ hidden: false, textContent: '', setAttribute() {}, removeAttribute() {} });
  for (const id of ['account-entry', 'account-avatar', 'record-feedback']) els[id] = el();
  const saved = {
    location: globalThis.location,
    history: globalThis.history,
    localStorage: globalThis.localStorage
  };
  globalThis.location = { search, pathname: '/v41/', hash: '', assign: url => assigned.push(url) };
  globalThis.history = { replaceState: (_s, _t, url) => replaced.push(url) };
  globalThis.localStorage = { getItem: () => 'garden', setItem() {}, removeItem() {} };
  let notified = 0, closed = 0, editor = null, shown = null;
  const auth = createAuth({
    $: id => els[id] ?? el(),
    getMember: () => ({ snapshot: () => ({ owned, writable }) }),
    notify: () => { notified += 1; },
    closeAccountMenu: () => { closed += 1; },
    openEditor: mode => { editor = mode; },
    showScreen: file => { shown = file; }
  });
  const restore = () => {
    globalThis.location = saved.location;
    globalThis.history = saved.history;
    globalThis.localStorage = saved.localStorage;
    if (saved.location === undefined) delete globalThis.location;
    if (saved.history === undefined) delete globalThis.history;
    if (saved.localStorage === undefined) delete globalThis.localStorage;
  };
  return { auth, els, assigned, replaced, counts: () => ({ notified, closed }), editor: () => editor, shown: () => shown, restore };
}

test('주소의 의도(intent)를 읽고 주소에서는 지운다', () => {
  const h = harness({ search: '?intent=new-tree&lt_theme=garden' });
  try {
    assert.equal(h.auth.pendingIntent(), 'new-tree', '의도를 읽는다');
    assert.equal(h.replaced.length, 1, '주소를 한 번 정리한다');
    assert.equal(h.replaced[0], '/v41/?lt_theme=garden', 'intent만 지우고 나머지는 남긴다');
  } finally {
    h.restore();
  }
});

test('의도가 없으면 주소를 건드리지 않는다', () => {
  const h = harness({ search: '?lt_theme=garden' });
  try {
    assert.equal(h.auth.pendingIntent(), '');
    assert.equal(h.replaced.length, 0);
  } finally {
    h.restore();
  }
});

test('startLogin은 테마와 의도를 담은 로그인 주소로 이동한다', () => {
  const h = harness();
  try {
    h.auth.startLogin('shelf');
    assert.equal(h.assigned.length, 1);
    const url = h.assigned[0];
    assert.match(url, /^\/auth\/login\?next=/, '로그인 시작 주소');
    assert.match(url, /lt_theme=garden/, '지금 테마를 유지');
    assert.match(decodeURIComponent(url), /intent=shelf/, '의도를 유지');

    // 모르는 의도는 붙이지 않는다.
    h.auth.startLogin('evil');
    assert.doesNotMatch(decodeURIComponent(h.assigned[1]), /intent=/, '허용 목록 밖 의도는 버린다');

    // first는 의도 없이(=기본 first 경로) 간다.
    h.auth.openLoginStart('first');
    assert.doesNotMatch(decodeURIComponent(h.assigned[2]), /intent=/);
    h.auth.openLoginStart('new-tree');
    assert.match(decodeURIComponent(h.assigned[3]), /intent=new-tree/);
  } finally {
    h.restore();
  }
});

test('401·만료는 로그아웃 화면으로 되돌리고 안내 줄을 남긴다', () => {
  const h = harness({ owned: true });
  try {
    h.auth.authRequired();
    assert.equal(h.els['account-entry'].hidden, false, '로그인 알약을 다시 보여 준다');
    assert.equal(h.els['account-entry'].textContent, '로그인');
    assert.equal(h.els['account-avatar'].hidden, true, '계정 동그라미는 숨긴다');
    assert.equal(h.els['record-feedback'].textContent, '로그인 확인이 필요해요. 다시 로그인해 주세요.');
    assert.deepEqual(h.counts(), { notified: 1, closed: 1 });
  } finally {
    h.restore();
  }
  // 로그아웃 상태에서는 아무것도 바꾸지 않는다.
  const out = harness({ owned: false });
  try {
    out.auth.authRequired();
    assert.equal(out.counts().notified, 0);
  } finally {
    out.restore();
  }
});

test('로그인 뒤 의도대로 이어 준다 — new-tree는 첫 여정, shelf는 내 책장', () => {
  const h = harness({ search: '?intent=new-tree' });
  try {
    assert.equal(h.auth.consumeLoginIntent({ writable: true }), 'new-tree');
    assert.equal(h.editor(), 'new');
    assert.equal(h.auth.pendingIntent(), '', '한 번만 쓴다');
    assert.equal(h.auth.consumeLoginIntent({ writable: true }), '', '두 번째는 아무것도 하지 않는다');
  } finally {
    h.restore();
  }
  const shelf = harness({ search: '?intent=shelf' });
  try {
    shelf.auth.consumeLoginIntent({ writable: true });
    assert.equal(shelf.shown(), 'track32-bookshelf.html');
  } finally {
    shelf.restore();
  }
  // 쓰기 권한이 없으면 첫 여정을 열지 않는다.
  const noWrite = harness({ search: '?intent=new-tree' });
  try {
    noWrite.auth.consumeLoginIntent({ writable: false });
    assert.equal(noWrite.editor(), null);
  } finally {
    noWrite.restore();
  }
});
