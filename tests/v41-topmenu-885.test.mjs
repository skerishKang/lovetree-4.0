import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRE = process.env.LT_TOPMENU_REQUIRE === '1';
const SHOT = process.env.LT_TOPMENU_SHOT_DIR || '';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 화면 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 화면 시험을 건너뜀'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 화면 시험을 건너뜀';

function tree(n) {
  let t = createTree({ subject: '시험' + n, title: '시험 트리 ' + n, note: '', emotion: '설렘', date: '2026-11-18', url: '' }, '2026-11-18T00:00:00Z');
  for (let i = 1; i < 3; i++) t = addMoment(t, { title: '순간 ' + i, note: '', emotion: '설렘', date: '2026-11-1' + i, url: '' }, t.moments[0].id, '2026-11-18T00:0' + i + ':00Z');
  return t;
}

const SCREENS = [['shelf', '#my/shelf'], ['book', '#my/book'], ['board', '#my/board'], ['map', '#my/network']];

test('상단 메뉴: 같은 글자 크기·테두리 0·세로선 0·현재 탭 1·탭 x 고정', { skip: skip || !REQUIRE ? skip || 'LT_TOPMENU_REQUIRE=1 일 때 실행' : false }, async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const width of [1440, 390]) {
      for (const theme of ['night', 'garden']) {
        const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
        await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
        await ctx.route('**://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#333"/></svg>' }));
        await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
        const state = { version: 1, trees: [tree(1), tree(2)], prefs: {} };
        await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-18T09:00:00.000Z' }) }));
        const page = await ctx.newPage();
        await page.goto(`${origin}/v41/?account=1`, { waitUntil: 'load', timeout: 60000 });
        await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
        await page.locator('#discover-ask-no').click().catch(() => {});
        const perScreen = {};
        for (const [name, hash] of SCREENS) {
          await page.evaluate((h) => { location.hash = h; }, hash);
          await page.waitForTimeout(900);
          perScreen[name] = await page.evaluate(() => {
            const record = document.getElementById('record-menu');
            const tabs = [...document.querySelectorAll('#tree-views > button')];
            const plain = tabs.filter((b) => b.id !== 'community-menu');
            const borders = (el) => { const cs = getComputedStyle(el); return ['Top', 'Right', 'Bottom', 'Left'].filter((side) => parseFloat(cs['border' + side + 'Width']) > 0).length; };
            return {
              recordFont: parseFloat(getComputedStyle(record).fontSize),
              tabFonts: tabs.map((b) => parseFloat(getComputedStyle(b).fontSize)),
              tabBorders: plain.reduce((n, b) => n + borders(b), 0),
              dividers: [record, ...plain].reduce((n, el) => n + (parseFloat(getComputedStyle(el).borderLeftWidth) > 0 ? 1 : 0), 0),
              current: tabs.filter((b) => b.getAttribute('aria-current') === 'true').length,
              xs: tabs.map((b) => Math.round(b.getBoundingClientRect().x)),
              recordVisible: !!record && record.getClientRects().length > 0
            };
          });
        }
        const base = perScreen.shelf;
        const xsStable = SCREENS.every(([name]) => JSON.stringify(perScreen[name].xs) === JSON.stringify(base.xs));
        assert.deepEqual([...new Set([base.recordFont, ...base.tabFonts])].length, 1, '트리 단추·탭 글자 크기 같음');
        assert.equal(base.tabBorders, 0, '탭 칸 테두리 0');
        assert.equal(base.dividers, 0, '세로선 0');
        assert.equal(base.current, 1, '현재 탭 1개');
        assert.equal(base.recordVisible, true, '서재에서 트리 단추 보임');
        assert.equal(xsStable, true, '4화면 탭 x 좌표 동일');
        results.push({ width, theme, ...base, xsStable });
        if (SHOT) {
          mkdirSync(SHOT, { recursive: true });
          await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
          await page.screenshot({ path: `${SHOT}/menu-${width}-${theme}.png` });
        }
        await ctx.close();
      }
    }
    console.log(JSON.stringify(results));
  } finally {
    await browser.close();
    await new Promise((ok) => server.close(ok));
  }
});

test("서재에서 트리를 고르면 가운데 책이 그 트리로 이동", { skip: skip || !REQUIRE ? skip || "LT_TOPMENU_REQUIRE=1 일 때 실행" : false }, async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"items":[]}' }));
    const two = [tree(1), tree(2)];
    const state = { version: 1, trees: two, prefs: {} };
    await ctx.route("**/api/workspace**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision: 1, state, subject: "시험계정", writeSubjectBound: true, savedAt: "2026-11-18T09:00:00.000Z" }) }));
    const page = await ctx.newPage();
    await page.goto(`${origin}/v41/?account=1`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    await page.locator('#discover-ask-no').click().catch(() => {});
    await page.evaluate(() => { location.hash = '#my/shelf'; });
    await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some((f) => { try { return /track32-bookshelf/.test(f.contentWindow.location.href) && f.contentDocument.querySelector('.book-card.is-center'); } catch { return false; } }), null, { timeout: 15000 });
    await page.click('#record-menu');
    await page.click(`[data-tree-id="${two[1].id}"]`);
    await page.waitForFunction((id) => [...document.querySelectorAll('iframe')].some((f) => {
      try { return /track32-bookshelf/.test(f.contentWindow.location.href) && f.contentDocument.querySelector('.book-card.is-center [data-book-id]')?.dataset.bookId === id; } catch { return false; }
    }), two[1].id, { timeout: 10000 });
    assert.match(await page.evaluate(() => document.getElementById('source-label').textContent), /시험2/);
    console.log('SHELF_TREE_PICK', two[1].id);
    await ctx.close();
  } finally { await browser.close(); await new Promise((ok) => server.close(ok)); }
});

// 261119 대표 결정 3가지 — 눈이 아니라 숫자로 잰다.
//  ① 트리 선택 단추: 폭은 글자에 맞추고(긴 이름은 말줄임) ⌄는 오른쪽 끝 고정(여백 편차 ±2px).
//  ② 목록 아래 메뉴 순서: ＋ 새 트리 → 이 트리 관리 → 이 트리 공유 → 꼬리표 정리.
//  ② 목록 모양은 계정 메뉴와 같은 규칙: 판은 한 색, 항목 바탕 투명, 강조는 hover·초점과 지금 트리 ✓뿐.
//  ③ 서재·책·보드·지도는 감싸는 판 없이 글자 링크(현재 화면 밑줄 2px·진한 글자, 누름 영역 44px).
test('상단 메뉴 261119: 트리 단추 폭·⌄ 자리·목록 규칙·메뉴 순서·글자 링크 탭', { skip: skip || !REQUIRE ? skip || 'LT_TOPMENU_REQUIRE=1 일 때 실행' : false }, async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  // createTree는 title을 제목 규칙으로 다시 짓는다 — 표시 이름만 길게 바꿔 말줄임을 잰다.
  const longTree = { ...createTree({ subject: '긴 이름', title: '긴 이름', note: '', emotion: '설렘', date: '2026-11-18', url: '' }, '2026-11-18T00:00:00Z'), title: '아주 아주 긴 이름을 가진 트리 — 스물두 글자를 넘기는 제목' };
  try {
    for (const width of [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
      await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
      await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      const state = { version: 1, trees: [tree(1), tree(2), longTree], prefs: {} };
      await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-18T09:00:00.000Z' }) }));
      const page = await ctx.newPage();
      // 긴 이름 트리를 지금 트리로 연다 — 말줄임과 ⌄ 자리를 같은 자리에서 함께 잰다.
      await page.goto(`${origin}/v41/?account=1#my/board?tree=${longTree.id}&moment=${longTree.moments[0].id}`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
      await page.locator('#discover-ask-no').click().catch(() => {});
      await page.waitForTimeout(700);
      const bar = await page.evaluate(() => {
        const record = document.getElementById('record-menu');
        const label = document.getElementById('source-label');
        const r = record.getBoundingClientRect();
        const caret = record.querySelector('svg').getBoundingClientRect();
        const frame = document.querySelector('.tree-frame');
        const fcs = getComputedStyle(frame);
        const tabs = [...document.querySelectorAll('#tree-views button[data-view]')];
        const cur = tabs.find((b) => b.getAttribute('aria-current') === 'true') || null;
        const ccs = cur ? getComputedStyle(cur) : null;
        return {
          recordW: Math.round(r.width), recordMax: parseFloat(getComputedStyle(record).maxWidth) || 0,
          caretRightGap: Math.round((r.right - caret.right) * 10) / 10,
          labelClipped: label.scrollWidth > label.clientWidth + 1,
          frameBg: fcs.backgroundColor, frameBorder: parseFloat(fcs.borderTopWidth) || 0,
          tabsHidden: tabs.every((b) => !b.getClientRects().length),
          currentDeco: ccs ? ccs.textDecorationLine : null,
          currentThickness: ccs ? ccs.textDecorationThickness : null,
          currentBg: ccs ? ccs.backgroundColor : null,
          tabHeights: tabs.map((b) => Math.round(b.getBoundingClientRect().height)),
          currentCount: tabs.filter((b) => b.getAttribute('aria-current') === 'true').length
        };
      });
      assert.ok(bar.caretRightGap >= 11 && bar.caretRightGap <= 15, `${width}: ⌄ 오른쪽 여백 ${bar.caretRightGap}px 는 13±2`);
      assert.ok(bar.recordW <= bar.recordMax + 1, `${width}: 단추 폭 ${bar.recordW} ≤ 최대 ${bar.recordMax}`);
      assert.equal(bar.labelClipped, true, `${width}: 긴 이름은 말줄임(글자가 칸을 넘지 않는다)`);
      assert.equal(bar.frameBg, 'rgba(0, 0, 0, 0)', `${width}: 탭을 감싸는 판 배경 없음`);
      assert.equal(bar.frameBorder, 0, `${width}: 탭을 감싸는 판 테두리 없음`);
      if (width === 1440) {
        assert.equal(bar.tabsHidden, false, '1440: 탭 보임');
        assert.equal(bar.currentDeco, 'underline', '고른 탭은 밑줄');
        assert.equal(bar.currentThickness, '2px', '밑줄 두께 2px');
        assert.equal(bar.currentBg, 'rgba(0, 0, 0, 0)', '고른 탭을 채우지 않는다');
        assert.ok(bar.tabHeights.every((h) => h >= 44), `탭 누름 영역 44px 이상 — ${JSON.stringify(bar.tabHeights)}`);
        assert.equal(bar.currentCount, 1, '현재 화면 표시 1개');
      }

      // 목록: 마우스로 연다 → 초점 테두리 없음, 항목 바탕 투명, 판은 한 색,아래 메뉴 순서 고정.
      await page.mouse.move(10, 300);
      await page.click('#record-menu');
      await page.mouse.move(width - 12, width === 390 ? 800 : 860);
      await page.waitForTimeout(200);
      const list = await page.evaluate(() => {
        const pop = document.getElementById('tree-popover');
        const items = [...pop.querySelectorAll('button')];
        const cs = getComputedStyle(pop);
        const first = items[0] ? getComputedStyle(items[0]) : null;
        const checked = items.filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => ({ bg: getComputedStyle(b).backgroundColor, shadow: getComputedStyle(b).boxShadow }));
        const plain = items.filter((b) => !b.closest('.tree-foot') && b.getAttribute('aria-checked') !== 'true').map((b) => getComputedStyle(b).backgroundColor);
        return {
          openedBy: pop.dataset.ltOpenedBy,
          firstOutline: first ? first.outlineWidth : null,
          popoverBg: cs.backgroundColor,
          foot: [...pop.querySelectorAll('.tree-foot button')].map((b) => b.textContent.trim()),
          checked, plain,
          checkMarks: items.filter((b) => b.querySelector('.tree-check')).length
        };
      });
      assert.equal(list.openedBy, 'mouse', '마우스로 열면 opened-by=mouse');
      assert.equal(list.firstOutline, '0px', `${width}: 마우스로 연 목록 첫 항목에 초점 테두리 없음`);
      assert.ok(!/rgba\(0, 0, 0, 0\)/.test(list.popoverBg), `${width}: 목록 판은 한 색으로 칠한다(${list.popoverBg})`);
      assert.deepEqual(list.foot.slice(0, 4), ['＋ 새 트리', '이 트리 관리 (이름·표지)', '이 트리 공유', '꼬리표 정리'], `${width}: 목록 아래 메뉴 순서`);
      assert.ok(list.checked.every((c) => c.bg === 'rgba(0, 0, 0, 0)' && c.shadow === 'none'), `${width}: 지금 트리는 ✓ 하나로만 강조 — ${JSON.stringify(list.checked)}`);
      assert.ok(list.plain.every((bg) => bg === 'rgba(0, 0, 0, 0)'), `${width}: 평상시 항목 바탕 투명 — ${JSON.stringify(list.plain)}`);
      assert.equal(list.checkMarks, 1, `${width}: ✓는 지금 트리 하나`);
      await ctx.close();
    }
  } finally { await browser.close(); await new Promise((ok) => server.close(ok)); }
});
