import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

/* 접근성 이름 시험 — 이슈 952(2026-11-19): index.html·shell/theme.mjs의 소스 글자 계약(10 단정)을
   지우고, 2026-11-09 axe 수정(label-content-name-mismatch·aria-allowed-attr)의 같은 약속을
   실제 화면 요소에서 확인하는 실행 시험으로 바꿨다.
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

test('실행: 접근성 이름 규칙은 실제 화면 요소에서 확인한다(2026-11-09 axe 수정)', { skip: skip952 || undefined }, async () => {
  const server = await serve({});
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium952.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
    await ctx.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx.route('**/api/workspace*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [tree952(1)] }, subject: '검사기계정', writeSubjectBound: true, savedAt: '2026-11-16T09:00:00.000Z' }) }));
    const page = await ctx.newPage();
    await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    await page.waitForFunction(() => !document.getElementById('account-avatar')?.hidden, null, { timeout: 10000 });
    await page.waitForTimeout(500);

    const names = await page.evaluate(() => {
      const brand = document.querySelector('.brand');
      const record = document.getElementById('record-menu');
      return {
        brandLabel: brand?.getAttribute('aria-label'),
        brandText: brand?.textContent.trim(),
        recordAriaLabel: record?.getAttribute('aria-label'),
        recordText: document.getElementById('source-label')?.textContent.trim()
      };
    });
    assert.ok(names.brandLabel?.includes('LoveTree4.1'), '브랜드 이름은 화면에 보이는 글자(LoveTree4.1)를 그대로 포함한다');
    assert.ok(names.brandText?.startsWith('LoveTree'), `브랜드에 보이는 글자도 LoveTree다(${names.brandText})`);
    assert.equal(names.recordAriaLabel, null, '트리 고르기 단추는 aria-label로 화면 글자를 덮지 않는다');
    assert.ok(/^(트리:|트리 고르기|트리 없음)/.test(names.recordText || ''), `보이는 "트리 …"가 이름이다(${names.recordText})`);

    // 설정 창 "화면" 묶음의 테마 항목(#380 5번): 밤/정원 두 칸이 radio·aria-checked를 쓴다.
    await page.click('#account-avatar');
    await page.waitForFunction(() => !document.getElementById('account-popover')?.hidden, null, { timeout: 5000 });
    await page.click('#account-open-settings');
    await page.waitForFunction(() => document.getElementById('account-settings')?.open, null, { timeout: 5000 });
    const themes = await page.evaluate(() => {
      const radios = [...document.querySelectorAll('#account-settings [data-set-theme]')];
      return {
        values: radios.map((b) => b.dataset.setTheme),
        roles: radios.map((b) => b.getAttribute('role')),
        checked: radios.map((b) => b.getAttribute('aria-checked')),
        pressed: radios.filter((b) => b.hasAttribute('aria-pressed')).length,
        oldAccountTheme: !!document.getElementById('account-theme')
      };
    });
    assert.deepEqual(themes.values, ['night', 'garden'], '테마 항목은 밤/정원 두 칸이다');
    assert.deepEqual(themes.roles, ['radio', 'radio'], '테마 항목은 radio를 쓴다');
    assert.deepEqual(themes.checked, ['true', 'false'], '지금 테마에 aria-checked가 있다');
    assert.equal(themes.pressed, 0, 'aria-pressed를 섞어 쓰지 않는다(axe aria-allowed-attr)');
    assert.equal(themes.oldAccountTheme, false, '계정 메뉴의 옛 테마 칸은 없다');
  } finally { await browser.close(); server.close(); }
});
