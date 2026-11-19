import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

/* 좁은 화면(390) 머리줄 시험 — 이슈 952(2026-11-19): CSS 미디어 규칙·접기 메뉴 마크업의
   소스 글자 계약(19 단정)을 지우고, 같은 약속을 390 실제 화면에서 확인하는 실행 시험으로 바꿨다.
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

test('실행(390): 머리줄은 접어 한 줄로 남고, 더보기 메뉴에 화면이 모두 있다', { skip: skip952 || undefined }, async () => {
  const server = await serve({});
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium952.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
    await ctx.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx.route('**/api/workspace*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [tree952(1)] }, subject: '검사기계정', writeSubjectBound: true, savedAt: '2026-11-16T09:00:00.000Z' }) }));
    const page = await ctx.newPage();
    await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    await page.waitForFunction(() => !document.getElementById('account-avatar')?.hidden, null, { timeout: 10000 });
    await page.waitForTimeout(500);

    const folded = await page.evaluate(() => {
      const rects = (id) => !!document.getElementById(id)?.getClientRects().length;
      return {
        community: rects('community-menu'),
        treeViews: [...document.querySelectorAll('#tree-views button')].some((b) => b.getClientRects().length),
        write: rects('write-menu'),
        more: rects('mobile-more'),
        headerHeight: document.querySelector('.app-header')?.offsetHeight
      };
    });
    assert.equal(folded.community, false, '390: 둘러보기 단추는 접힌다');
    assert.equal(folded.treeViews, false, '390: 서재·책·보드·지도 탭은 접힌다');
    assert.equal(folded.write, false, '390: ＋ 순간 추가는 접힌다');
    assert.equal(folded.more, true, '390: 더보기(☰) 단추는 보인다');
    assert.ok(folded.headerHeight < 80, `390: 머리줄은 한 줄(${folded.headerHeight}px)`);

    await page.click('#mobile-more');
    await page.waitForFunction(() => !document.getElementById('header-overflow')?.hidden, null, { timeout: 5000 });
    const menu = await page.evaluate(() => ({
      items: [...document.querySelectorAll('#header-overflow [role=menuitem]')].map((b) => b.textContent.trim()),
      current: [...document.querySelectorAll('#header-overflow [role=menuitem]')].find((b) => b.getAttribute('aria-current') === 'true')?.textContent.trim() || null
    }));
    assert.deepEqual(
      menu.items,
      ['첫 화면', '둘러보기', '서재', '책', '보드', '지도', '＋ 순간 추가', '의견 보내기'],
      '접기 메뉴도 맨 위 메뉴와 같은 구조·순서다(#380 2번, 261117 서재 첫 자리)'
    );
    assert.equal(menu.current, '첫 화면', '지금 보는 화면 항목에 aria-current가 있다(#458)');

    await page.click('#header-overflow [role=menuitem]:nth-child(3)'); // 서재
    await page.waitForFunction(() => document.getElementById('header-overflow')?.hidden, null, { timeout: 5000 });
    assert.ok(true, '항목을 누르면 메뉴가 닫힌다');
  } finally { await browser.close(); server.close(); }
});
