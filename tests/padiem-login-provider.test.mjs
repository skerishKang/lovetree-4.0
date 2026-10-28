import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../server/errors.js';
import { createLoginProvider } from '../server/padiem-login-provider.js';

const PRODUCT = 'lovetree-4-0';
const START = 'https://chat.example.test/auth/lovetree/start';
const ORIGIN = 'https://lovetree-4-0.pages.dev';
const STATE = 'abc123DEF456ghi789JKL012';
const TICKET = 'lovt_0123456789abcdefABCDEFGH';

const provider = (over = {}) => createLoginProvider({
  env: { LOVETREE_PADIEM_HANDOFF_START_URL: START, LOVETREE_PUBLIC_ORIGIN: ORIGIN, ...over },
  productId: PRODUCT
});

test('the start address carries only the login request and our own return origin', () => {
  const made = provider();
  const url = new URL(made.authorizationUrl({ state: STATE }));
  assert.equal(`${url.protocol}//${url.host}${url.pathname}`, START);
  // PADIEM 쪽 시작 라우트가 읽는 두 값과 정확히 같은 이름·같은 쌍이어야 한다.
  assert.deepEqual([...url.searchParams.keys()].sort(), ['return_origin', 'state']);
  assert.equal(url.searchParams.get('state'), STATE);
  assert.equal(url.searchParams.get('return_origin'), ORIGIN);
  assert.equal(made.returnOrigin, ORIGIN);
});

test('plain http is refused except for a loopback test deployment', () => {
  assert.throws(() => provider({ LOVETREE_PADIEM_HANDOFF_START_URL: 'http://chat.example.test/auth/lovetree/start' }), /https/);
  assert.throws(() => provider({ LOVETREE_PUBLIC_ORIGIN: 'http://evil.example' }), /https/);
  assert.throws(() => provider({ LOVETREE_PADIEM_HANDOFF_START_URL: '' }), /LOVETREE_PADIEM_HANDOFF_START_URL/);
  assert.throws(() => provider({ LOVETREE_PUBLIC_ORIGIN: '' }), /LOVETREE_PUBLIC_ORIGIN/);
  assert.throws(() => provider({ LOVETREE_PADIEM_HANDOFF_START_URL: 'https://chat.example.test' }), /시작 경로 전체/);
  assert.throws(() => createLoginProvider({ env: {}, productId: '' }), /LOVETREE_PRODUCT_ID/);
  const local = provider({
    LOVETREE_PADIEM_HANDOFF_START_URL: 'http://127.0.0.1:8790/auth/lovetree/start',
    LOVETREE_PUBLIC_ORIGIN: 'http://127.0.0.1:8788'
  });
  assert.match(local.authorizationUrl({ state: STATE }), /^http:\/\/127\.0\.0\.1:8790\/auth\/lovetree\/start\?/);
});

test('an unforgeable login request shape is required in both directions', () => {
  const made = provider();
  for (const bad of [undefined, null, '', 'short', 'has spaces', `${'a'.repeat(65)}`, 'https://evil.example']) {
    assert.throws(() => made.authorizationUrl({ state: bad }), error => error instanceof ApiError && error.status === 500, String(bad));
  }
});

test('the returned code is accepted only as a handoff ticket, never as identity', async () => {
  const made = provider();
  assert.deepEqual(await made.exchangeCode({ code: TICKET, state: STATE }), { handoffTicket: TICKET });
  for (const bad of [
    '', 'nope', `lovt_${'x'.repeat(10)}`, `lovt_${'x'.repeat(49)}`, 'lovt_has?bad', `${TICKET} trailing`,
    'aho_0123456789abcdef01234567', null, undefined, 42
  ]) {
    assert.equal(await made.exchangeCode({ code: bad, state: STATE }), null, String(bad));
  }
  assert.equal(await made.exchangeCode({ code: TICKET, state: 'short' }), null, '로그인 요청 모양도 함께 맞아야 한다');
  const keys = Object.keys(await made.exchangeCode({ code: TICKET, state: STATE }));
  assert.deepEqual(keys, ['handoffTicket'], '이 경로로 지나가는 키는 표 하나뿐이다');
});
