import test from 'node:test';
import assert from 'node:assert/strict';
// 빠른 담기 입구의 셸 배선: 가짜 문서·멤버로 함수를 직접 부른다(docs/TESTING.md).
// 실제 붙여넣기·공유 시트 노출은 실기기 확인(docs/DEVICE_CHECKLIST.md) 대상이라 여기선 분기·호출만 본다.
import { createQuickIntake } from '../public/v41/shell/quick-intake.mjs';
import { INTAKE_TEXT_PARAM, INTAKE_TITLE_PARAM, INTAKE_LOGIN_RETRY_TEXT } from '../public/v41/quick-intake.mjs';

function fakeDocument() {
  const listeners = {};
  return {
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatch(type, event) { for (const fn of listeners[type] || []) fn(event); },
  };
}

function fakeBrowser({ search = '', pathname = '/v41/', hash = '' } = {}) {
  const replaced = [];
  return { location: { search, pathname, hash }, history: { replaceState: (...a) => replaced.push(a[2]) }, replaced };
}

function memberFixture({ owned = true, writable = true, phase = 'synced', trees = [] } = {}) {
  const calls = { applied: [] };
  const flags = { owned, writable, phase };
  return {
    calls, flags,
    snapshot: () => ({ owned: flags.owned, writable: flags.writable, phase: flags.phase }),
    state: () => ({ trees }),
    apply: (action, input) => { calls.applied.push([action, input]); return { treeId: 't', momentId: 'm' }; },
  };
}

function memoryStorage() {
  const file = new Map();
  return {
    getItem: (key) => (file.has(key) ? file.get(key) : null),
    setItem: (key, value) => file.set(key, String(value)),
    removeItem: (key) => file.delete(key),
  };
}

function strictDescribe(value) {
  let parsed;
  try { parsed = new URL(String(value ?? '')); } catch { return { kind: 'invalid', original: value, label: '', openUrl: '' }; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { kind: 'invalid', original: value, label: '', openUrl: '' };
  return { kind: 'link', original: value, label: parsed.hostname.replace(/^www\./, ''), openUrl: parsed.href };
}

function setup({ member, source = 'server', browser = fakeBrowser(), describe = strictDescribe, storage } = {}) {
  const notifies = [];
  const logins = [];
  const doc = fakeDocument();
  const state = { source };
  const intake = createQuickIntake({
    document: doc,
    getMember: () => member,
    getSource: () => state.source,
    notify: (t) => notifies.push(t),
    openLoginStart: (i) => logins.push(i),
    describe,
    location: browser.location,
    history: browser.history,
    storage: storage ?? memoryStorage(),
  });
  return { intake, doc, notifies, logins, state, ...browser, member };
}

test('붙여넣기: 입력 칸 안에서는 손대지 않는다', () => {
  const member = memberFixture();
  const { doc, intake, notifies } = setup({ member });
  const target = { nodeType: 1, tagName: 'INPUT', isContentEditable: false };
  const event = { target, clipboardData: { getData: (t) => (t === 'text/uri-list' ? 'https://a.test/x' : '') }, prevented: false, preventDefault() { this.prevented = true; } };
  doc.dispatch('paste', event);
  assert.equal(event.prevented, false);
  assert.equal(member.calls.applied.length, 0);
  assert.equal(notifies.length, 0);
  assert.equal(intake.pending(), null);
});

test('붙여넣기: 셸 문서에 주소를 바로 담고 안내한다', () => {
  const member = memberFixture();
  const { doc, intake, notifies } = setup({ member });
  const event = { target: {}, clipboardData: { getData: (t) => (t === 'text/uri-list' ? 'https://a.test/x' : 'https://a.test/x') }, preventDefault() { this.prevented = true; } };
  doc.dispatch('paste', event);
  assert.equal(event.prevented, true);
  assert.deepEqual(member.calls.applied, [['quickAdd', { url: 'https://a.test/x' }]]);
  assert.deepEqual(notifies, ['모아둔 순간에 담았어요']);
  assert.equal(intake.pending(), null);
});

test('붙여넣기: 주소가 아닌 텍스트는 안내만 한다', () => {
  const member = memberFixture();
  const { doc, notifies } = setup({ member });
  doc.dispatch('paste', { target: {}, clipboardData: { getData: () => '그냥 글자' } });
  assert.equal(member.calls.applied.length, 0);
  assert.deepEqual(notifies, ['링크 형식을 확인해 주세요.']);
});

test('붙여넣기: 빈 클립보드·클립보드 없음은 조용히 지나간다', () => {
  const member = memberFixture();
  const { doc, notifies } = setup({ member });
  doc.dispatch('paste', { target: {}, clipboardData: { getData: () => '' } });
  doc.dispatch('paste', { target: {} });
  assert.equal(member.calls.applied.length, 0);
  assert.deepEqual(notifies, []);
});

test('붙여넣기: 내용 편집 칸(contentEditable·하위 트리)도 입력 칸으로 본다', () => {
  const member = memberFixture();
  const { doc } = setup({ member });
  doc.dispatch('paste', { target: { nodeType: 1, isContentEditable: true }, clipboardData: { getData: () => 'https://a.test/x' } });
  doc.dispatch('paste', { target: { nodeType: 1, closest: () => true }, clipboardData: { getData: () => 'https://a.test/x' } });
  assert.equal(member.calls.applied.length, 0);
});

test('공유 시트 진입: 세션이 확정되기 전에는 로그인도 담기도 미룬다(#342 후속)', () => {
  const member = memberFixture({ owned: false, writable: false, phase: 'checking' });
  const browser = fakeBrowser({ search: `?quickadd=https%3A%2F%2Fb.test%2F1&${INTAKE_TEXT_PARAM}=제목+https%3A%2F%2Fb.test%2F2&${INTAKE_TITLE_PARAM}=t&x=2` });
  const { intake, logins, replaced } = setup({ member, browser, source: 'file' });
  assert.deepEqual(replaced, ['/v41/?x=2']);
  assert.deepEqual(intake.pending(), { url: 'https://b.test/1' });
  intake.flush();
  assert.deepEqual(logins, [], '서버 확인 중(checking)에 로그인 화면으로 보내지 않는다 — 이것이 고리의 원인이었다');
  assert.equal(member.calls.applied.length, 0, '로그인 전에는 담지 않는다');
  assert.equal(intake.pending()?.url, 'https://b.test/1', '자리는 비우지 않는다(세션 수명에 맡긴다)');
});

test('공유 시트 진입: 로그아웃이 확정된 뒤에 한 번만 로그인한다', () => {
  const member = memberFixture({ owned: false, writable: false, phase: 'checking' });
  const browser = fakeBrowser({ search: `?quickadd=${encodeURIComponent('https://b.test/1')}` });
  const { intake, logins, state } = setup({ member, browser, source: 'file' });
  intake.flush();
  assert.deepEqual(logins, [], '아직 모름');
  state.source = 'server';                    // 401이면 서버 기록은 빈 상태로 load된다
  member.flags.phase = 'login';                   // 서버가 401로 확정
  intake.flush();
  assert.deepEqual(logins, [undefined], '확정된 로그아웃에 한 번만 보낸다');
  assert.equal(intake.attempted(), 'https://b.test/1', '보관한 주소에 시도 표시를 둔다');
});

test('공유 시트 진입: 로그인하고 돌아오면 이어서 담는다(로그인 화면 이동 없음)', () => {
  const pendingUrl = 'https://b.test/1';
  const storage = memoryStorage();
  const away = memberFixture({ owned: false, writable: false, phase: 'login' });
  const first = setup({ member: away, source: 'server', storage, browser: fakeBrowser({ search: `?quickadd=${encodeURIComponent(pendingUrl)}` }) });
  first.intake.flush();
  assert.deepEqual(first.logins, [undefined]);
  const back = memberFixture({ owned: true, writable: true, phase: 'synced' });
  const second = setup({ member: back, source: 'file', storage });   // 로그인에서 돌아온 새 문서(같은 탭 보관소)
  second.intake.flush();
  assert.deepEqual(second.logins, [], '세션 확정 전에는 다시 보내지 않는다');
  second.state.source = 'server';
  second.intake.flush();
  assert.deepEqual(back.calls.applied, [['quickAdd', { url: pendingUrl }]]);
  assert.deepEqual(second.notifies, ['모아둔 순간에 담았어요']);
  assert.equal(second.intake.pending(), null);
  assert.equal(second.intake.attempted(), '', '담은 뒤에는 시도 표시도 지운다');
});

test('공유 시트 진입: 두 번째 로그아웃은 안내로 멈춘다(로그인 고리 차단)', () => {
  const pendingUrl = 'https://b.test/1';
  const storage = memoryStorage();
  const away = memberFixture({ owned: false, writable: false, phase: 'login' });
  const first = setup({ member: away, source: 'server', storage, browser: fakeBrowser({ search: `?quickadd=${encodeURIComponent(pendingUrl)}` }) });
  first.intake.flush();
  assert.deepEqual(first.logins, [undefined]);
  // 로그인 화면에서 돌아왔는데 또 로그아웃: 같은 자리에서 다시 보내지 않는다.
  const again = memberFixture({ owned: false, writable: false, phase: 'login' });
  const second = setup({ member: again, source: 'server', storage });
  second.intake.flush();
  assert.deepEqual(second.logins, [], '두 번째는 로그인으로 보내지 않는다');
  assert.deepEqual(second.notifies, [INTAKE_LOGIN_RETRY_TEXT]);
  assert.equal(second.intake.pending(), null, '고리를 끊고 자리를 비운다');
});

test('공유 시트 진입: 상태 변화를 여러 번 흘려도 로그인 시작은 한 번뿐이다(강도)', () => {
  const storage = memoryStorage();
  const member = memberFixture({ owned: false, writable: false, phase: 'checking' });
  const run = setup({ member, source: 'file', storage, browser: fakeBrowser({ search: `?quickadd=${encodeURIComponent('https://b.test/1')}` }) });
  run.state.source = 'server';                    // 401이면 서버 기록은 빈 상태로 load된다
  const phases = ['checking', 'checking', 'checking', 'login', 'checking', 'login', 'login', 'offline', 'login'];
  for (const phase of phases) { member.flags.phase = phase; run.intake.flush(); }
  assert.deepEqual(run.logins, [undefined], '로그인 시작은 한 번');
  assert.equal(member.calls.applied.length, 0, '로그아웃 상태에서는 담지 않는다');
  // 로그인하고 돌아와 확정된 경우: 상태 변화가 여러 번 와도 한 번만 담는다.
  const back = memberFixture({ owned: true, writable: true, phase: 'synced' });
  const returning = setup({ member: back, source: 'file', browser: fakeBrowser({ search: `?quickadd=${encodeURIComponent('https://b.test/1')}` }) });
  returning.state.source = 'server';
  for (const phase of ['synced', 'syncing', 'synced', 'synced', 'synced']) { back.flags.phase = phase; returning.intake.flush(); }
  assert.deepEqual(back.calls.applied, [['quickAdd', { url: 'https://b.test/1' }]], '담기는 한 번(새로고침·재진입 중복 0)');
  assert.deepEqual(returning.logins, [], '확정된 계정에서는 로그인으로 보내지 않는다');
});

test('붙여넣기: 세션 확인 중이면 보관했다가 확정 뒤 담고, 로그아웃이면 옛대로 안내만 한다', () => {
  const checking = memberFixture({ owned: false, writable: false, phase: 'checking' });
  const run = setup({ member: checking, source: 'file' });
  run.doc.dispatch('paste', { target: {}, clipboardData: { getData: () => 'https://a.test/x' }, preventDefault() {} });
  assert.equal(run.intake.pending()?.url, 'https://a.test/x', '확인 중에는 잃지 않고 보관한다');
  assert.deepEqual(run.logins, [], '확인 중에는 로그인으로 보내지 않는다');
  assert.deepEqual(run.notifies, [], '확인 중에는 로그인 안내도 띄우지 않는다');
  checking.flags.owned = true;
  checking.flags.writable = true;
  run.state.source = 'server';
  run.intake.flush();
  assert.deepEqual(checking.calls.applied, [['quickAdd', { url: 'https://a.test/x' }]]);

  const away = setup({ member: null, source: 'example' });
  away.doc.dispatch('paste', { target: {}, clipboardData: { getData: () => 'https://a.test/y' }, preventDefault() {} });
  assert.deepEqual(away.notifies, ['로그인한 뒤 순간을 담을 수 있어요.'], '세션이 없으면 옛 계약대로 안내만');
  assert.deepEqual(away.logins, []);
  assert.equal(away.intake.pending(), null);
});

test('공유 시트 진입: text만 온 주소도 담는다(앱이 문구에 주소를 싣는 모양)', () => {
  const member = memberFixture();
  const browser = fakeBrowser({ search: `?${INTAKE_TEXT_PARAM}=제목+https%3A%2F%2Fb.test%2F2&${INTAKE_TITLE_PARAM}=내 영상` });
  const { intake, notifies } = setup({ member, browser });
  intake.flush();
  assert.deepEqual(member.calls.applied, [['quickAdd', { url: 'https://b.test/2' }]]);
  assert.deepEqual(notifies, ['모아둔 순간에 담았어요']);
  assert.equal(intake.pending(), null);
});

test('공유 시트 진입: url → text → title 순, 여러 주소면 첫 주소', () => {
  const member = memberFixture();
  const browser = fakeBrowser({ search: `?${INTAKE_TEXT_PARAM}=제목+https%3A%2F%2Fb.test%2F2&${INTAKE_TITLE_PARAM}=https%3A%2F%2Fc.test%2F1+https%3A%2F%2Fc.test%2F2` });
  const { intake } = setup({ member, browser });
  intake.flush();
  assert.deepEqual(member.calls.applied, [['quickAdd', { url: 'https://b.test/2' }]]);
  const second = fakeBrowser({ search: `?${INTAKE_TITLE_PARAM}=https%3A%2F%2Fc.test%2F1+https%3A%2F%2Fc.test%2F2` });
  const secondMember = memberFixture();
  const secondRun = setup({ member: secondMember, browser: second });
  secondRun.intake.flush();
  assert.deepEqual(secondMember.calls.applied, [['quickAdd', { url: 'https://c.test/1' }]]);
});

test('공유 시트 진입: 주소가 아닌 문구는 안내하고 지운다', () => {
  const member = memberFixture();
  const { intake, notifies, replaced } = setup({ member, browser: fakeBrowser({ search: `?${INTAKE_TEXT_PARAM}=주소+없음&${INTAKE_TITLE_PARAM}=제목` }) });
  assert.deepEqual(replaced, ['/v41/']);
  assert.deepEqual(notifies, ['링크 형식을 확인해 주세요.']);
  assert.equal(intake.pending(), null, '주소가 아닌 값은 보관하지 않는다');
});

test('공유 시트 진입: 이미 담아둔 주소면 막고, 새로고침 중복도 같은 규칙이다', () => {
  const url = 'https://b.test/1';
  const member = memberFixture({ trees: [{ id: 'inbox', inbox: true, moments: [{ id: 'm0', url }] }] });
  const browser = fakeBrowser({ search: `?quickadd=${encodeURIComponent(url)}` });
  const { intake, notifies } = setup({ member, browser });
  intake.flush();
  assert.equal(member.calls.applied.length, 0);
  assert.deepEqual(notifies, ['이미 모아둔 순간에 있는 주소예요.']);
  assert.equal(intake.pending(), null);
});

test('공유 시트 진입: 쓰기 불가면 안내하고, 준비되면 이어서 담는다', () => {
  const member = memberFixture({ writable: false });
  const browser = fakeBrowser({ search: `?quickadd=${encodeURIComponent('https://b.test/1')}` });
  const { intake, notifies } = setup({ member, browser });
  intake.flush();
  assert.deepEqual(notifies, ['서버 편집 연결이 아직 준비되지 않았어요. 기록은 안전하게 읽을 수 있습니다.']);
  assert.equal(intake.pending()?.url, 'https://b.test/1');
  member.flags.writable = true;
  intake.flush();
  assert.deepEqual(member.calls.applied, [['quickAdd', { url: 'https://b.test/1' }]]);
  assert.equal(intake.pending(), null);
});

test('공유 시트 진입: 적용이 막히면 안내·보관 유지, 다음 상태변경에 재시도한다', () => {
  const member = memberFixture();
  member.apply = () => { throw new Error('먼저 내 기록을 불러오고 저장 연결을 확인해 주세요.'); };
  const browser = fakeBrowser({ search: `?quickadd=${encodeURIComponent('https://b.test/1')}` });
  const { intake, notifies } = setup({ member, browser });
  intake.flush();
  assert.deepEqual(notifies, ['먼저 내 기록을 불러오고 저장 연결을 확인해 주세요.']);
  assert.equal(intake.pending()?.url, 'https://b.test/1');
  member.apply = (action, input) => { member.calls.applied.push([action, input]); return { treeId: 't', momentId: 'm' }; };
  intake.flush();
  assert.deepEqual(member.calls.applied, [['quickAdd', { url: 'https://b.test/1' }]]);
});

test('공유 시트 진입: 읽기 전용 소스·주소 아님은 조용히/안내대로', () => {
  const member = memberFixture();
  const share = setup({ member, source: 'share', browser: fakeBrowser({ search: '?quickadd=https%3A%2F%2Fb.test%2F1' }) });
  share.intake.flush();
  assert.equal(share.member.calls.applied.length, 0);
  assert.deepEqual(share.notifies, []);

  const invalid = setup({ member, source: 'server', browser: fakeBrowser({ search: '?quickadd=notaurl' }) });
  assert.deepEqual(invalid.notifies, ['링크 형식을 확인해 주세요.']);
  assert.equal(invalid.intake.pending(), null, '주소가 아닌 값은 보관하지 않는다');
});

test('붙여넣기: 판정 함수가 막혀도 안내로 끝난다', () => {
  const member = memberFixture();
  const { doc, notifies } = setup({ member, describe: () => { throw new Error('deny'); } });
  doc.dispatch('paste', { target: {}, clipboardData: { getData: () => 'https://a.test/x' } });
  assert.deepEqual(notifies, ['링크 형식을 확인해 주세요.']);
  assert.equal(member.calls.applied.length, 0);
});
