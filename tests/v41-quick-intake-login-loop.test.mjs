import test from 'node:test';
import assert from 'node:assert/strict';
// 공유 진입(?quickadd) 로그인 고리 차단의 순수 판정(#342 후속, docs/TESTING.md).
// 상태 미확정 → 기다림, 로그인 확정 → 한 번만 로그인, 이미 보냈으면 안내가 표다.
// 화면 배선은 tests/v41-quick-intake-flow.test.mjs가 가짜 객체로 직접 부른다.
import {
  INTAKE_LOGIN_RETRY_TEXT,
  INTAKE_STEP_WAIT, INTAKE_STEP_SAVE, INTAKE_STEP_LOGIN, INTAKE_STEP_NOTICE, INTAKE_STEP_SKIP,
  intakeStep, loginAttempted, createLoginAttemptSlot,
} from '../public/v41/quick-intake.mjs';

function memoryStorage() {
  const file = new Map();
  return {
    getItem: (key) => (file.has(key) ? file.get(key) : null),
    setItem: (key, value) => file.set(key, String(value)),
    removeItem: (key) => file.delete(key),
  };
}

test('intakeStep 표: 세션 확정 전에는 기다리고, 확정된 로그인 필요에만 로그인으로 보낸다', () => {
  const rows = [
    // [설명, 세션 상태, 시도 표시, 기대]
    ['앱 부팅(기록 출처 file·확인 중)', { source: 'file', owned: false, phase: 'checking' }, false, INTAKE_STEP_WAIT],
    ['서버 확인 중(아직 소유 미확정)', { source: 'server', owned: false, phase: 'checking' }, false, INTAKE_STEP_WAIT],
    ['세션 없음(상태 없음)', { source: 'example', owned: false, phase: '' }, false, INTAKE_STEP_WAIT],
    ['서버 연결 실패는 확정이 아니다', { source: 'server', owned: false, phase: 'offline' }, false, INTAKE_STEP_WAIT],
    ['로그인 필요 확정(401)', { source: 'server', owned: false, phase: 'login' }, false, INTAKE_STEP_LOGIN],
    ['두 번째 로그아웃(이미 보냄)', { source: 'server', owned: false, phase: 'login' }, true, INTAKE_STEP_NOTICE],
    ['로그인 후 복귀(서버 기록 load 완료)', { source: 'server', owned: true, phase: 'synced' }, false, INTAKE_STEP_SAVE],
    ['로그인 후 복귀(저장 중이어도 담는다)', { source: 'server', owned: true, phase: 'syncing' }, true, INTAKE_STEP_SAVE],
    ['공유 감상 화면', { source: 'share', owned: false, phase: 'synced' }, false, INTAKE_STEP_SKIP],
    ['예시 화면(소유 아님)', { source: 'example', owned: false, phase: 'synced' }, false, INTAKE_STEP_WAIT],
  ];
  for (const [name, session, attempted, expected] of rows) {
    assert.equal(intakeStep(session, { attempted }), expected, name);
  }
});

test('intakeStep: 세션 상태가 비어 있어도 던지지 않고 기다린다', () => {
  assert.equal(intakeStep(), INTAKE_STEP_WAIT);
  assert.equal(intakeStep({}), INTAKE_STEP_WAIT);
  assert.equal(intakeStep({ source: 'server', owned: 'yes' }), INTAKE_STEP_WAIT, 'owned는 참/거짓만 인정한다');
});

test('loginAttempted: 같은 주소만 시도로 본다(주소 표기 차이는 같은 주소)', () => {
  assert.equal(loginAttempted('https://b.test/1', 'https://b.test/1'), true);
  assert.equal(loginAttempted('https://b.test/1', 'https://b.test/2'), false);
  assert.equal(loginAttempted('', 'https://b.test/1'), false);
  assert.equal(loginAttempted(null, 'https://b.test/1'), false);
  assert.equal(loginAttempted('https://b.test/1', ''), false);
  assert.equal(loginAttempted('not a url', 'not a url'), true, 'URL로 못 읽으면 원문 비교');
});

test('createLoginAttemptSlot: 표시를 남기고 지우며, 저장소가 없거나 막혀도 조용하다', () => {
  const storage = memoryStorage();
  const slot = createLoginAttemptSlot(storage);
  assert.equal(slot.read(), '');
  slot.mark('https://b.test/1');
  assert.equal(slot.read(), 'https://b.test/1');
  assert.equal(loginAttempted(slot.read(), 'https://b.test/1'), true);
  slot.clear();
  assert.equal(slot.read(), '');

  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const guarded = createLoginAttemptSlot(blocked);
  guarded.mark('https://b.test/1');
  assert.equal(guarded.read(), '', '읽기 실패는 빈 값');
  guarded.clear();

  const none = createLoginAttemptSlot(null);
  none.mark('https://b.test/1');
  assert.equal(none.read(), '');
});

test('고리 차단 문구는 한 벌이다(로그인에서 돌아온 뒤 또 로그아웃이면 다시 보내지 않고 안내로 멈춘다)', () => {
  assert.equal(INTAKE_LOGIN_RETRY_TEXT, '로그인한 뒤 다시 공유해 주세요.');
});

test('연결 구조: shell.mjs는 보관한 주소로 세션을 시작하고 상태마다 판정을 부른다', async () => {
  // 연결 한 줄이 지워지면 운영에서 고리가 다시 생긴다(#245 전례) — 글자로 고정한다.
  const fs = await import('node:fs');
  const shell = fs.readFileSync(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8');
  assert.match(shell, /shouldLoadMemberRecords\(location\.search,document\.cookie,location\.hash\)\|\|shellIntake\.pending\(\)/, '보관한 공유 주소가 있으면 세션을 시작한다(로그아웃 진입 → 로그인 → 이어서 담기)');
  assert.match(shell, /function memberStatus\(status\)\{\s*\n\s*shellIntake\.flush\(\);/, '동기화 상태가 바뀔 때마다 판정을 부른다');
  const wiring = fs.readFileSync(new URL('../public/v41/shell/quick-intake.mjs', import.meta.url), 'utf8');
  assert.match(wiring, /intakeStep\(sessionState\(\), \{ attempted: loginAttempted\(attempts\.read\(\), url\) \}\)/, '셸 배선은 순수 판정 한 벌을 그대로 쓴다');
  assert.match(wiring, /slot\.write\(url\); attempts\.mark\(url\); loginStart\(\);/, '로그인은 보관·시도 표시와 함께 한 번만 시작한다');
  assert.match(wiring, /attempts\.clear\(\); notify\(INTAKE_LOGIN_RETRY_TEXT\)/, '두 번째 로그아웃은 안내로 멈춘다');
  assert.equal(/getSource\?\.\(\) !== 'server'/.test(wiring), false, '출처가 server가 아니면 곧바로 로그인으로 보내던 옛 판정이 남아 있지 않다');
});
