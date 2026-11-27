import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

/* 계정·설정 창 시험 — 이슈 952(2026-11-19): index.html·shell.mjs·shell.css·dialogs.mjs의
   소스 글자 계약(111 단정)을 지우고, 같은 약속을 실제 화면에서 확인하는 실행 시험으로 바꿨다.
   창 열림·기본 탭·고급 스위치 대비는 tests/v41-header-ia.test.mjs가 이미 잰다. 여기서는
   탭 전환·키보드 이동·더러운 창의 닫기 확인·정책 링크·로그아웃 단추를 잰다.
   LT_SHELL_952_REQUIRE=1 일 때 실행(CI 화면 잡 — 건너뜀=실패). */

const REQUIRE952 = process.env.LT_SHELL_952_REQUIRE === '1';
let chromium952 = null;
let skip952 = false;
try {
  ({ chromium: chromium952 } = await import('playwright'));
  if (!existsSync(chromium952.executablePath())) skip952 = 'Playwright chromium이 설치되어 있지 않아 실행 시험을 건너뜀';
} catch {
  skip952 = 'playwright 패키지가 없어 실행 시험을 건너뜀';
}
if (REQUIRE952 && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip952 = '빌드 결과가 없어 실행 시험을 건너뜀';

function tree952(n) {
  let t = createTree({ subject: '시험' + n, title: '시험 트리 ' + n, note: '', emotion: '설렘', date: '2026-11-18', url: '' }, '2026-11-18T00:00:00Z');
  t = addMoment(t, { title: '순간', note: '', emotion: '설렘', date: '2026-11-18', url: '' }, t.moments[0].id, '2026-11-18T00:01:00Z');
  return t;
}

async function boot952(browser, { width = 1440 } = {}) {
  const server = await serve({});
  const base = `http://127.0.0.1:${server.address().port}`;
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
  await ctx.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
  await ctx.route('**/api/workspace*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [tree952(1)] }, subject: '검사기계정', writeSubjectBound: true, savedAt: '2026-11-16T09:00:00.000Z' }) }));
  const page = await ctx.newPage();
  await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
  await page.waitForFunction(() => !document.getElementById('account-avatar')?.hidden, null, { timeout: 10000 });
  await page.waitForTimeout(500);
  return { server, ctx, page, base };
}

async function openSettings952(page) {
  await page.click('#account-avatar');
  await page.waitForFunction(() => !document.getElementById('account-popover')?.hidden, null, { timeout: 5000 });
  await page.click('#account-open-settings');
  await page.waitForFunction(() => document.getElementById('account-settings')?.open, null, { timeout: 5000 });
}

test('설정 창 실행: 탭 넷으로 열리고, 눌러 옮기고, 방향키로도 옮겨진다', { skip: skip952 || undefined }, async () => {
  const browser = await chromium952.launch();
  const { server, ctx, page } = await boot952(browser);
  try {
    await openSettings952(page);
    const first = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('#account-settings [role=tab]')];
      const panels = [...document.querySelectorAll('#account-settings [role=tabpanel]')];
      return {
        labels: tabs.map((t) => t.textContent.trim()),
        selected: tabs.map((t) => t.getAttribute('aria-selected')),
        visiblePanels: panels.filter((p) => p.getClientRects().length).map((p) => p.id)
      };
    });
    assert.deepEqual(first.labels, ['화면', '프로필', '기록 보기', '계정·개인정보'], '탭은 넷');
    assert.deepEqual(first.selected, ['true', 'false', 'false', 'false'], '처음에는 화면 탭');
    assert.deepEqual(first.visiblePanels, ['account-settings-screen'], '처음에는 화면 칸만 보인다');

    await page.click('#settings-tab-profile');
    const afterClick = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('#account-settings [role=tab]')];
      return {
        selected: tabs.map((t) => t.getAttribute('aria-selected')),
        visiblePanels: [...document.querySelectorAll('#account-settings [role=tabpanel]')].filter((p) => p.getClientRects().length).map((p) => p.id)
      };
    });
    assert.deepEqual(afterClick.selected, ['false', 'true', 'false', 'false'], '프로필 탭을 누르면 표시가 옮겨진다');
    assert.deepEqual(afterClick.visiblePanels, ['account-settings-profile'], '프로필 칸만 보인다');

    await page.focus('#settings-tab-profile');
    await page.keyboard.press('ArrowRight');
    const afterKey = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('#account-settings [role=tab]')];
      return { selected: tabs.map((t) => t.getAttribute('aria-selected')), focus: document.activeElement?.id };
    });
    assert.deepEqual(afterKey.selected, ['false', 'false', 'true', 'false'], '→ 키로 기록 보기 탭으로 옮겨진다');
    assert.equal(afterKey.focus, 'settings-tab-records', '키보드 초점도 같이 옮겨진다');
  } finally { await browser.close(); server.close(); }
});

test('설정 창 실행: 고친 내용이 있으면 Esc로 닫을 때 한 번 묻는다', { skip: skip952 || undefined }, async () => {
  const browser = await chromium952.launch();
  const { server, ctx, page } = await boot952(browser);
  try {
    await openSettings952(page);
    await page.click('#settings-tab-profile');
    await page.fill('#profile-name', '새로운 이름');
    // #978: 닫기 확인은 앱 안 틀(#lt-close-confirm)이다 — 브라우저 기본 confirm은 불리지 않는다.
    const nativeDialogs = [];
    page.on('dialog', (d) => { nativeDialogs.push(d.message()); void d.dismiss().catch(() => {}); });
    // 첫 Esc: 확인 창을 내고(아니요) 창은 그대로다.
    await page.keyboard.press('Escape');
    await page.waitForSelector('#lt-close-confirm[open]', { timeout: 8000 });
    await page.click('#lt-close-confirm-no');
    await page.waitForFunction(() => !document.querySelector('#lt-close-confirm')?.open, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => document.getElementById('account-settings')?.open), true, '취소하면 창은 열려 있다');
    // 다시 Esc: 예로 닫히고 초점은 연 단추(계정 동그라미)로 돌아간다.
    await page.keyboard.press('Escape');
    await page.waitForSelector('#lt-close-confirm[open]', { timeout: 8000 });
    await page.click('#lt-close-confirm-yes');
    await page.waitForFunction(() => !document.getElementById('account-settings')?.open, null, { timeout: 5000 });
    await page.waitForFunction(() => document.activeElement?.id === 'account-avatar', null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'account-avatar', '닫으면 초점이 연 단추로 돌아간다');
    assert.deepEqual(nativeDialogs, [], '브라우저 기본 confirm은 불리지 않는다');
  } finally { await browser.close(); server.close(); }
});

test('#1541 계정 탈퇴는 앱 확인 창의 Esc 취소·Enter 확인을 따른다', { skip: skip952 || undefined }, async () => {
  const browser = await chromium952.launch({headless: true});
  const { server, ctx, page } = await boot952(browser);
  try {
    let deletes = 0;
    await page.route('**/api/account/delete', async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      deletes += 1;
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, commonAccountDeleted: false})});
    });
    await openSettings952(page);
    await page.click('#settings-tab-account');
    await page.click('#account-settings-more > summary');
    await page.click('#account-settings-delete > summary');
    await page.fill('#account-confirm', '탈퇴합니다');
    await page.waitForFunction(() => !document.getElementById('account-delete')?.disabled);
    const nativeDialogs = [];
    page.on('dialog', dialog => { nativeDialogs.push(dialog.message()); void dialog.dismiss().catch(() => {}); });
    await page.evaluate(() => { document.getElementById('account-form').requestSubmit(); });
    await page.waitForSelector('#lt-confirm[open]');
    assert.equal(await page.evaluate(() => document.getElementById('account-settings').open), true, '확인 창이 떠도 설정 창은 열려 있다');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'lt-confirm-cancel');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('lt-confirm')?.open);
    assert.equal(deletes, 0);
    assert.equal(await page.evaluate(() => document.getElementById('account-settings').open), true);
    await page.evaluate(() => document.getElementById('account-form').requestSubmit());
    await page.waitForSelector('#lt-confirm[open]');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.getElementById('account-settings').open);
    assert.equal(deletes, 1);
    assert.deepEqual(nativeDialogs, []);
  } finally { await ctx.close().catch(() => {}); await browser.close(); await new Promise(resolve => server.close(resolve)); }
});

test('설정 창 실행: 개인정보 묶음의 정책 링크는 새 창이고 로그아웃 단추가 있다', { skip: skip952 || undefined }, async () => {
  const browser = await chromium952.launch();
  const { server, ctx, page } = await boot952(browser);
  try {
    // 로그아웃 단추는 계정 팝오버 안에 있다(설정 창을 열면 팝오버는 닫힌다).
    await page.click('#account-avatar');
    await page.waitForFunction(() => !document.getElementById('account-popover')?.hidden, null, { timeout: 5000 });
    const logoutVisible = await page.evaluate(() => !!document.getElementById('account-logout')?.getClientRects().length);
    await page.click('#account-open-settings');
    await page.waitForFunction(() => document.getElementById('account-settings')?.open, null, { timeout: 5000 });
    await page.click('#settings-tab-account');
    const got = await page.evaluate(() => {
      const links = [...document.querySelectorAll('#account-settings-account a.policy-link')];
      return { links: links.map((a) => ({ href: a.href, target: a.target, rel: a.rel })) };
    });
    assert.deepEqual(
      got.links.map((l) => l.href),
      ['https://auth.padiem.net/privacy?theme=night#lovetree', 'https://auth.padiem.net/terms?theme=night'],
      '개인정보 처리 방침·이용약관 두 링크다'
    );
    assert.ok(got.links.every((l) => l.target === '_blank' && l.rel.includes('noopener')), '정책 링크는 새 창(noopener)이다');
    assert.equal(logoutVisible, true, '로그아웃 단추가 계정 팝오버에 보인다');
  } finally { await browser.close(); server.close(); }
});
