// 공용 로그인 2단계 대응 시험: 1단계형·2단계형·실패 + 강도 증명(2단계 처리를 지우면 실패).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fillAuthEmailLogin } from '../tools/postdeploy/auth-login.mjs';

const AUTH = 'https://auth.padiem.net';
const DONE = 'https://lovetree-4-0.pages.dev/v41/';
const LOGIN = `${AUTH}/login?client_id=lovetree-4-0`;
const PW_STEP = `${AUTH}/login/password?state=abc`;
const noWait = async () => {};

function fakePage(routes, start = LOGIN) {
  let url = start;
  const state = { fills: [], clicks: 0 };
  const current = () => routes[url] || {};
  const locator = (selector) => {
    const loc = {
      count: async () => {
        const route = current();
        if (selector === '#email') return route.email ? 1 : 0;
        if (selector === '#password') return route.password ? 1 : 0;
        if (selector === 'form button[type=submit]') return route.submit === false ? 0 : 1;
        if (selector === '[role=alert], .error, .form-error') return route.alert ? 1 : 0;
        return 0;
      },
      isVisible: async () => (await loc.count()) > 0,
      fill: async (value) => { state.fills.push([selector, value]); },
      first: () => loc,
      click: async () => {
        state.clicks += 1;
        if (current().next) url = current().next;
      },
      innerText: async () => current().alert || '',
    };
    return loc;
  };
  return { page: { url: () => url, locator }, state };
}

test('1단계형: 한 화면에서 이메일·비밀번호를 제출하면 로그인 완료', async () => {
  const { page, state } = fakePage({
    [LOGIN]: { email: true, password: true, next: DONE },
    [DONE]: {},
  });
  const result = await fillAuthEmailLogin(page, 'pw-1step', 'a@b.c', noWait);
  assert.deepEqual(result, { ok: true });
  assert.equal(page.url(), DONE);
  assert.equal(state.clicks, 1);
});

test('2단계형: 이메일 제출 뒤 비밀번호 화면에서 한 번 더 제출해야 로그인 완료', async () => {
  const { page, state } = fakePage({
    [LOGIN]: { email: true, password: true, next: PW_STEP },
    [PW_STEP]: { password: true, next: DONE },
    [DONE]: {},
  });
  const result = await fillAuthEmailLogin(page, 'pw-2step', 'a@b.c', noWait);
  assert.deepEqual(result, { ok: true });
  assert.equal(page.url(), DONE);
  assert.equal(state.clicks, 2);
  assert.ok(state.fills.some(([sel, val]) => sel === '#password' && val === 'pw-2step'));
});

test('2단계형(이메일만 있는 1단계): 비밀번호 화면을 기다려 채운다', async () => {
  const { page, state } = fakePage({
    [LOGIN]: { email: true, next: PW_STEP },
    [PW_STEP]: { password: true, next: DONE },
    [DONE]: {},
  });
  const result = await fillAuthEmailLogin(page, 'pw-email-only', 'a@b.c', noWait);
  assert.deepEqual(result, { ok: true });
  assert.equal(page.url(), DONE);
  assert.equal(state.clicks, 2);
});

test('실패: 비밀번호 화면이 없고 오류 문구가 남으면 실패로 판정', async () => {
  const { page } = fakePage({
    [LOGIN]: { email: true, password: true, alert: '잘못된 인증 정보입니다.' },
  });
  const result = await fillAuthEmailLogin(page, 'wrong', 'a@b.c', noWait);
  assert.equal(result.ok, false);
  assert.match(result.error, /잘못된 인증 정보/);
  assert.match(page.url(), /auth\.padiem\.net/);
});

test('강도 증명: 2단계 처리를 지운 1단계 전용 함수는 2단계에서 로그인 완료에 이르지 못한다', async () => {
  const legacy = async (page, password, emailValue) => {
    const email = page.locator('#email');
    if (!(await email.count())) return false;
    await email.fill(emailValue);
    await page.locator('#password').fill(password);
    await page.locator('form button[type=submit]').first().click();
    if (!/auth\.padiem\.net/.test(page.url())) return { ok: true };
    const text = await page.locator('[role=alert], .error, .form-error').first().innerText().catch(() => '');
    return text ? { ok: false, error: text.trim() } : { ok: true };
  };
  const fixture = () => fakePage({
    [LOGIN]: { email: true, password: true, next: PW_STEP },
    [PW_STEP]: { password: true, next: DONE },
    [DONE]: {},
  });
  const legacyRun = fixture();
  await legacy(legacyRun.page, 'pw', 'a@b.c');
  assert.equal(legacyRun.page.url(), PW_STEP);
  const fixedRun = fixture();
  await fillAuthEmailLogin(fixedRun.page, 'pw', 'a@b.c', noWait);
  assert.equal(fixedRun.page.url(), DONE);
});
