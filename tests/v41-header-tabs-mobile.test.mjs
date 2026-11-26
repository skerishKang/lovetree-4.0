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
    assert.equal(folded.headerHeight, 57, `390: 머리줄은 한 줄 57px(${folded.headerHeight}px)`);

    await page.click('#mobile-more');
    await page.waitForFunction(() => !document.getElementById('header-overflow')?.hidden, null, { timeout: 5000 });
    const menu = await page.evaluate(() => ({
      items: [...document.querySelectorAll('#header-overflow [role=menuitem]')].map((b) => b.textContent.trim()),
      current: [...document.querySelectorAll('#header-overflow [role=menuitem]')].find((b) => b.getAttribute('aria-current') === 'true')?.textContent.trim() || null
    }));
    assert.deepEqual(
      menu.items,
      ['첫 화면', '둘러보기', '서재', '트리', '보드', '책', '지도', '＋ 순간 추가', '의견 보내기'],
      '접기 메뉴도 맨 위 메뉴와 같은 구조·순서다(#380 2번, 261117 서재 첫 자리)'
    );
    assert.equal(menu.current, '첫 화면', '지금 보는 화면 항목에 aria-current가 있다(#458)');

    await page.click('#header-overflow [role=menuitem]:nth-child(3)'); // 서재
    await page.waitForFunction(() => document.getElementById('header-overflow')?.hidden, null, { timeout: 5000 });
    assert.ok(true, '항목을 누르면 메뉴가 닫힌다');
  } finally { await browser.close(); server.close(); }
});

// #1029: 트리 이름 길이가 바뀌어도 단추 폭과 옆 탭(좁은 화면에서는 계정 단추) x가 그대로인지 수치로 잡는다.
function tree1029(title) {
  const t = createTree({ subject: '제목', title, note: '', emotion: '기쁨', date: '2026-11-18', url: '' }, '2026-11-18T00:00:00Z');
  t.title = title;
  return addMoment(t, { title: '기억', note: '', emotion: '기쁨', date: '2026-11-18', url: '' }, t.moments[0].id, '2026-11-18T00:01:00Z');
}

test('#1029 트리 이름 2·8·20자 × 1440·390 × 정원·밤: 단추 폭·탭 x 같음, 글자 넘침 0', { skip: skip952 || undefined, timeout: 300000 }, async (t) => {
  const server = await serve({});
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium952.launch();
  const rows = [];
  try {
    for (const width of [1440, 390]) {
      for (const theme of ['garden', 'night']) {
        for (const len of [2, 8, 20]) {
          const name = '가'.repeat(len);
          const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
          await ctx.addInitScript((value) => { try { localStorage.setItem('lt41.theme', value); } catch {} }, theme);
          await ctx.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
          await ctx.route('**/api/workspace*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [tree1029(name)] }, subject: '시험 계정', writeSubjectBound: true, savedAt: '2026-11-16T09:00:00.000Z' }) }));
          const page = await ctx.newPage();
          await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
          await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
          await page.waitForFunction(() => !document.getElementById('account-avatar')?.hidden, null, { timeout: 10000 });
          await page.waitForTimeout(200);
          const m = await page.evaluate(() => {
            const b = document.getElementById('record-menu');
            const l = document.getElementById('source-label');
            const prefix = document.querySelector('.tree-prefix');
            const prefixVisible = prefix ? getComputedStyle(prefix).display !== 'none' && prefix.getBoundingClientRect().width > 0 : false;
            const legacyTreeMenuVisible = b.getClientRects().length > 0 && getComputedStyle(b).visibility !== 'hidden';
            const br = b.getBoundingClientRect();
            const tab = document.querySelector('#tree-views button[data-view]')?.getBoundingClientRect();
            // 390에서는 탭이 접혀 있으므로 그 자리를 대신하는 계정 단추 x를 잰다.
            const nextX = tab && tab.width > 0 ? tab.x : document.getElementById('account-avatar').getBoundingClientRect().x;
            let glyphOverflow = 0;
            for (const child of b.querySelectorAll('*')) {
              const r = child.getBoundingClientRect();
              if (!r.width && !r.height) continue;
              glyphOverflow = Math.max(glyphOverflow, r.right - br.right, br.left - r.left, r.bottom - br.bottom, br.top - r.top);
            }
            return {
              buttonWidth: Math.round(br.width * 100) / 100,
              nextX: Math.round(nextX * 100) / 100,
              glyphOverflow: Math.round(Math.max(0, glyphOverflow) * 100) / 100,
              pageOverflow: Math.round((document.documentElement.scrollWidth - document.documentElement.clientWidth) * 100) / 100,
              label: l.textContent,
              prefixVisible, legacyTreeMenuVisible, prefixText: prefix ? prefix.textContent.trim() : '', aria: b.getAttribute('aria-label'),
              title: b.title,
              inViewport: br.left >= 0 && br.right <= window.innerWidth
            };
          });
          rows.push({ width, theme, len, ...m });
          assert.equal(m.label, name, `${width}·${theme}·${len}자: 단추 안에는 이름만`);
          assert.ok(m.title.includes(name), `${width}·${theme}·${len}자: title에 전체 이름`);
          assert.equal(m.inViewport, true, `${width}·${theme}·${len}자: 버튼이 화면 안`);
          assert.equal(m.prefixVisible, width === 1440 && m.legacyTreeMenuVisible, `${width}: 밖의 '트리' 글자 ${width === 1440 ? '보임' : '숨김'}`);
          if (width === 1440 && m.legacyTreeMenuVisible) assert.equal(m.prefixText, '트리', '1440: 고정 글자는 트리');
          assert.equal(m.aria, `트리: ${name}, 트리 바꾸기`, '스크린리더 이름');
          await ctx.close();
        }
      }
    }
  } finally { await browser.close(); server.close(); }
  t.diagnostic(JSON.stringify(rows));
  for (const width of [1440, 390]) {
    for (const theme of ['garden', 'night']) {
      const group = rows.filter((r) => r.width === width && r.theme === theme);
      assert.equal(group.length, 3, `${width}·${theme}: 이름 길이 3종`);
      assert.equal(new Set(group.map((r) => r.buttonWidth)).size, 1, `${width}·${theme}: 단추 폭 차이 0`);
      assert.equal(new Set(group.map((r) => r.nextX)).size, 1, `${width}·${theme}: 탭·계정 단추 x 차이 0`);
    }
  }
  assert.equal(rows.filter((r) => r.glyphOverflow > 0 || r.pageOverflow > 0).length, 0, '글자 넘침 0');
});
