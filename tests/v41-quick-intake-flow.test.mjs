import test from 'node:test';
import assert from 'node:assert/strict';
// 빠른 담기 입구의 셸 배선: 가짜 문서·멤버로 함수를 직접 부른다(docs/TESTING.md).
// 실제 붙여넣기·공유 시트 노출은 실기기 확인(docs/DEVICE_CHECKLIST.md) 대상이라 여기선 분기·호출만 본다.
import { createQuickIntake } from '../public/v41/shell/quick-intake.mjs';
import { INTAKE_TEXT_PARAM, INTAKE_TITLE_PARAM } from '../public/v41/quick-intake.mjs';

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

function memberFixture({ owned = true, writable = true, trees = [] } = {}) {
  const calls = { applied: [] };
  const flags = { owned, writable };
  return {
    calls, flags,
    snapshot: () => ({ owned: flags.owned, writable: flags.writable }),
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
  const intake = createQuickIntake({
    document: doc,
    getMember: () => member,
    getSource: () => source,
    notify: (t) => notifies.push(t),
    openLoginStart: (i) => logins.push(i),
    describe,
    location: browser.location,
    history: browser.history,
    storage: storage ?? memoryStorage(),
  });
  return { intake, doc, notifies, logins, ...browser, member };
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

test('공유 시트 진입: 부팅에 파라미터를 소비하고 로그인 필요면 보관한다', () => {
  const member = memberFixture({ owned: false, writable: false });
  const browser = fakeBrowser({ search: `?quickadd=https%3A%2F%2Fb.test%2F1&${INTAKE_TEXT_PARAM}=제목+https%3A%2F%2Fb.test%2F2&${INTAKE_TITLE_PARAM}=t&x=2` });
  const { intake, logins, replaced } = setup({ member, browser, source: 'example' });
  assert.deepEqual(replaced, ['/v41/?x=2']);
  assert.deepEqual(intake.pending(), { url: 'https://b.test/1' });
  intake.flush();
  assert.deepEqual(logins, [undefined]);
  assert.equal(member.calls.applied.length, 0, '로그인 전에는 담지 않는다');
  assert.equal(intake.pending()?.url, 'https://b.test/1', '자리는 비우지 않는다(세션 수명에 맡긴다)');
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
