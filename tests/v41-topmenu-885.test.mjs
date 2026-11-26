import {clickToolbarTreeChoice,treeChoiceExpanded,treeChoiceFocused} from './helpers/tree-picker-pr3.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
import { testBackNavigation } from './helpers/history-assert.mjs';
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

// 닫힘 신호는 목록 숨김과 단추 aria-expanded=false 두 가지다. Esc·Enter가 같은 도우미를 쓴다.
async function waitTreeChoiceClosed(page, timeout) {
  await page.waitForFunction(() => document.getElementById('tree-popover')?.hidden, null, { timeout });
  await page.waitForFunction(() => document.querySelector('iframe#view')?.contentDocument?.querySelector('button.lt-toolbar-tree-choice')?.getAttribute('aria-expanded') === 'false', null, { timeout });
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
        // 대표 11-23: 화면마다 머리줄 높이·단추 줄 높이가 달라 서재·책에서 단추와 아래 선이 내려와 보였다.
        const headerGeom = () => page.evaluate(() => {
          const h = document.querySelector('.app-header') || document.querySelector('header');
          const record = document.getElementById('record-menu');
          const label = document.getElementById('source-label');
          const caret = record?.querySelector('svg');
          const r = record?.getBoundingClientRect();
          return {
            headerH: Math.round(h.getBoundingClientRect().height),
            tops: [...h.querySelectorAll('#tree-views > button, .header-actions > button, .header-actions > .view-toggle, .account-slot > *')]
              .filter((e) => e.getClientRects().length).map((e) => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2)),
            caretRightGap: r && r.width > 0 && caret ? Math.round((r.right - caret.getBoundingClientRect().right) * 10) / 10 : null,
            labelLeftGap: r && label ? Math.round((label.getBoundingClientRect().left - r.left) * 10) / 10 : null
          };
        });
        const geoms = { home: await headerGeom() };
        for (const [name, hash] of SCREENS) {
          await page.evaluate((h) => { location.hash = h; }, hash);
          await page.waitForTimeout(900);
          geoms[name] = await headerGeom();
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

        // #1367: ???? ?? ??? ??? ?? ??? ?? ?? ??? ???.
        const order = await page.evaluate(() => {
          const nav = document.querySelector('.main-nav');
          const ids = [...nav.querySelectorAll('button')].map((b) => b.id || b.dataset.view);
          const rect = (sel) => {
            const b = document.querySelector(sel)?.getBoundingClientRect();
            return b ? { left: b.left, right: b.right } : null;
          };
          return {
            ids,
            shelf: rect('[data-view="track32-bookshelf.html"]'),
            tree: rect('[data-view="track61-tree.html"]'),
            explore: rect('#community-menu'),
            picker: rect('#record-menu'),
            overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
          };
        });
        assert.deepEqual(order.ids, [
          'community-menu', 'record-menu', 'track32-bookshelf.html',
          'track61-tree.html', 'track58-pinboard.html',
          'track59-sketchbook.html', 'track56-network.html',
        ], width + '/' + theme + ': ??? ?? ??? Tab ?? ??? ??');
        assert.equal(order.overflow, 0, width + '/' + theme + ': ??? ?? ??? ??');
        if (width === 1440) {
          assert.ok(order.explore.right <= order.shelf.left, '????? ?? ????? ?? ??');
          assert.ok(order.tree.left - order.shelf.right >= 8, '??? ?? ?? ?? ??? ?? ??? ??');
        } else {
          await page.locator('#mobile-more').click();
          const folded = await page.locator('#header-overflow [role="menuitem"]').allTextContents();
          const labels = [
            '\uB458\uB7EC\uBCF4\uAE30', '\uC11C\uC7AC', '\uD2B8\uB9AC',
            '\uBCF4\uB4DC', '\uCC45', '\uC9C0\uB3C4',
          ];
          assert.deepEqual(folded.map((x) => x.trim()).filter((x) => labels.includes(x)), labels,
            width + '/' + theme + ': ?? ?? ??? ?? ??? ??');
          await page.keyboard.press('Escape');
        }


        const base = perScreen.shelf;
        const xsStable = SCREENS.every(([name]) => JSON.stringify(perScreen[name].xs) === JSON.stringify(base.xs));
        assert.deepEqual([...new Set([base.recordFont, ...base.tabFonts])].length, 1, '트리 단추·탭 글자 크기 같음');
        assert.equal(base.tabBorders, 0, '탭 칸 테두리 0');
        assert.equal(base.dividers, 0, '세로선 0');
        assert.equal(base.current, 1, '현재 탭 1개');
        assert.equal(base.recordVisible, false, '서재에서 트리 단추 보임');
        assert.equal(xsStable, true, '4화면 탭 x 좌표 동일');
        // 390은 서재·책에서 보기 전환이 둘째 줄로 내려가는 것이 정한 배치라 넓은 화면만 잰다.
        const hs = width < 780 ? [0] : [...new Set(Object.values(geoms).map((g) => g.headerH))];
        assert.equal(hs.length, 1, `${width}/${theme}: 첫 화면·서재·책·보드·지도 머리줄 높이가 같다 ${JSON.stringify(geoms)}`);
        for (const [name, g] of width < 780 ? [] : Object.entries(geoms)) {
          const mids = [...new Set(g.tops)];
          assert.ok(Math.max(...mids) - Math.min(...mids) <= 1, `${width}/${theme}/${name}: 머리줄 탭·단추의 세로 가운데가 한 줄이다 ${JSON.stringify(g.tops)}`);
          if (g.caretRightGap !== null) assert.ok(g.caretRightGap >= 11 && g.caretRightGap <= 15, `${width}/${theme}/${name}: 짧은 트리 이름에서도 ⌄는 단추 오른쪽 끝(여백 13±2) — ${g.caretRightGap}`);
        }
        results.push({ width, theme, ...base, xsStable });
        if (SHOT) {
          mkdirSync(SHOT, { recursive: true });
          await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
          await page.screenshot({ path: `${SHOT}/menu-${width}-${theme}.png` });
        }
        await testBackNavigation(page, {
          recorded: true,
          settleMs: 300,
          action: width === 390
            ? async () => {
                await page.locator('#mobile-more').click();
                await page.locator('#header-overflow [role="menuitem"]').filter({ hasText: /\uB458\uB7EC\uBCF4\uAE30/ }).click();
              }
            : () => page.locator('#community-menu').click(),
        });
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
    const two = [tree(1), {...tree(2), openView:'book'}];
    const state = { version: 1, trees: two, prefs: {} };
    await ctx.route("**/api/workspace**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision: 1, state, subject: "시험계정", writeSubjectBound: true, savedAt: "2026-11-18T09:00:00.000Z" }) }));
    const page = await ctx.newPage();
    await page.goto(`${origin}/v41/?account=1`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    await page.locator('#discover-ask-no').click().catch(() => {});
    await page.evaluate(() => { location.hash = '#my/shelf'; });
    await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some((f) => { try { return /track32-bookshelf/.test(f.contentWindow.location.href) && f.contentDocument.querySelector('.book-card.is-center'); } catch { return false; } }), null, { timeout: 15000 });
    await clickToolbarTreeChoice(page);
    await page.click(`[data-tree-id="${two[1].id}"]`);
    await page.waitForFunction((id) => window.LT41?.tree?.id === id &&
      location.hash.startsWith('#my/book?') &&
      [...document.querySelectorAll('iframe')].some(f => f.id==='view' && /track59-sketchbook/.test(f.contentWindow.location.href)),
      two[1].id, { timeout: 10000 });
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
        const record = document.querySelector('iframe#view')?.contentDocument?.querySelector('button.lt-toolbar-tree-choice');
        const label = record?.querySelector('.lt-toolbar-tree-name');
        const r = record.getBoundingClientRect();
        const caret = record.querySelector('.lt-toolbar-tree-caret').getBoundingClientRect();
        const frame = document.querySelector('.tree-frame');
        const fcs = getComputedStyle(frame);
        const tabs = [...document.querySelectorAll('#tree-views button[data-view]')];
        const cur = tabs.find((b) => b.getAttribute('aria-current') === 'true') || null;
        const ccs = cur ? getComputedStyle(cur) : null;
        return {
          recordW: Math.round(r.width), recordMax: parseFloat(getComputedStyle(record).maxWidth) || 0,
          recordWidth: parseFloat(getComputedStyle(record).width) || 0,
          paddingRight: parseFloat(getComputedStyle(record).paddingRight) || 0,
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
      // ⌄는 단추 오른쪽 끝에 붙는다 — 여백은 그 폭의 단추 안쪽 여백(padding-right)을 따른다.
      // 넓은 화면은 12px(고정 폭 180), 좁은 화면은 8px라서 기대값을 너비마다 따로 잰다.
      assert.ok(bar.caretRightGap >= bar.paddingRight - 1 && bar.caretRightGap <= bar.paddingRight + 3,
        `${width}: ⌄ 오른쪽 여백 ${bar.caretRightGap}px 는 단추 안쪽 여백 ${bar.paddingRight}px 기준`);
      // 넓은 화면은 max-width:none 대신 폭 180px로 고정된다 — 고정 폭이 상한이다.
      const recordLimit = bar.recordMax || bar.recordWidth;
      assert.ok(recordLimit > 0 && bar.recordW <= recordLimit + 1,
        `${width}: 단추 폭 ${bar.recordW} ≤ ${bar.recordMax ? '최대' : '고정 폭'} ${recordLimit}`);
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
      await clickToolbarTreeChoice(page);
      await page.mouse.move(width - 12, width === 390 ? 800 : 860);
      await page.waitForTimeout(200);
      const list = await page.evaluate(() => {
        const pop = document.getElementById('tree-popover');
        const items = [...pop.querySelectorAll('button')];
        const cs = getComputedStyle(pop);
        const firstItem = pop.querySelector('.tree-list [data-tree-id]');
        const first = firstItem ? getComputedStyle(firstItem) : null;
        const checked = items.filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => ({ bg: getComputedStyle(b).backgroundColor, shadow: getComputedStyle(b).boxShadow }));
        const plain = items.filter((b) => b.hasAttribute('data-tree-id') && b.getAttribute('aria-checked') !== 'true').map((b) => getComputedStyle(b).backgroundColor);
        return {
          openedBy: pop.dataset.ltOpenedBy,
          firstOutline: first ? (first.outlineStyle === 'none' || first.outlineColor === 'rgba(0, 0, 0, 0)' ? '0px' : first.outlineWidth) : null,
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
      assert.ok(list.checked.every((c) => c.bg !== 'rgba(0, 0, 0, 0)' && c.shadow === 'none'), `${width}: 지금 트리는 ✓ 하나로만 강조 — ${JSON.stringify(list.checked)}`);
      assert.ok(list.plain.every((bg) => bg !== 'rgba(0, 0, 0, 0)'), `${width}: 평상시 항목 바탕 투명 — ${JSON.stringify(list.plain)}`);
      assert.equal(list.checkMarks, 1, `${width}: ✓는 지금 트리 하나`);
      await ctx.close();
    }
  } finally { await browser.close(); await new Promise((ok) => server.close(ok)); }
});

// ─── 이슈 970: 트리 드롭다운을 실제로 열고 닫는 모습을 본다 ───
// 단추 폭·⌄ 자리·목록 아래 메뉴 순서(새 트리 → 관리 → 공유 → 꼬리표 정리)는 위 261119 시험이
// 이미 1440·390에서 잰다. 여기서는 닫힘 길과 키보드를 잰다(#940 결정): Esc·바깥 누르기로 닫히고
// aria-expanded가 false로 돌아오며, Esc에는 초점이 단추로 돌아오고, 키보드로 열어 ↑↓·Home·End로
// 항목을 옮기고 Enter로 그 트리를 연다. LT_970_REQUIRE=1 일 때 실행(CI 화면 잡 — 건너뜀=실패).
const REQUIRE970 = process.env.LT_970_REQUIRE === '1';

test('970 실행: 트리 드롭다운은 Esc·바깥 누르기로 닫히고, 키보드로 옮기고 Enter로 연다', { skip: skip || !REQUIRE970 ? skip || 'LT_970_REQUIRE=1 일 때 실행' : false, timeout: 180000 }, async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
      await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
      await ctx.route('**://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#333"/></svg>' }));
      await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      const state = { version: 1, trees: [tree(1), tree(2)], prefs: {} };
      await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-18T09:00:00.000Z' }) }));
      const page = await ctx.newPage();
      await page.goto(`${origin}/v41/?account=1`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
      await page.locator('#discover-ask-no').click().catch(() => {});
      await page.waitForTimeout(700);

      // 마우스로 열기 → Esc로 닫기: 초점이 단추로 돌아온다.
      await clickToolbarTreeChoice(page);
      await page.waitForFunction(() => !document.getElementById('tree-popover')?.hidden, null, { timeout: 10000 });
      assert.equal(await treeChoiceExpanded(page), 'true', `${width}: 열면 aria-expanded=true`);
      await page.keyboard.press('Escape');
      await waitTreeChoiceClosed(page, 5000);
      const afterEsc = { expanded: await treeChoiceExpanded(page), focus: await treeChoiceFocused(page) };
      assert.equal(afterEsc.expanded, 'false', `${width}: Esc로 닫으면 aria-expanded=false`);
      assert.equal(afterEsc.focus, true, `${width}: Esc로 닫으면 초점이 단추로 돌아온다`);

      // 키보드로 열기(단추에 초점을 남긴 채 Enter) → ↑↓·Home·End로 항목을 옮긴다.
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.getElementById('tree-popover')?.hidden, null, { timeout: 5000 });
      assert.equal(await page.evaluate(() => document.getElementById('tree-popover')?.dataset.ltOpenedBy), 'keyboard', `${width}: 키보드로 열면 opened-by=keyboard`);
      const moved = await page.evaluate(async () => {
        const pop = document.getElementById('tree-popover');
        const items = [...pop.querySelectorAll('button')];
        const at = () => items.indexOf(document.activeElement);
        const press = (key) => new Promise((done) => {
          document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
          setTimeout(done, 30);
        });
        const first = at();
        await press('ArrowDown'); const down = at();
        await press('ArrowUp'); const up = at();
        await press('Home'); const home = at();
        await press('End'); const end = at();
        return { count: items.length, first, down, up, home, end, last: items.length - 1 };
      });
      assert.equal(moved.first, 1, `${width}: 열면 첫 항목에 초점`);
      assert.equal(moved.down, 2, `${width}: ↓로 다음 항목`);
      assert.equal(moved.up, 1, `${width}: ↑로 다시 첫 항목`);
      assert.equal(moved.home, 0, `${width}: Home은 첫 항목`);
      assert.equal(moved.end, moved.last, `${width}: End는 마지막 항목`);

      // Enter로 그 트리를 연다: 두 번째 트리 줄에 초점을 옮기고 Enter → 목록이 닫히고 주소가 그 트리를 가리킨다.
      const wantTree = await page.evaluate(() => {
        const row = [...document.querySelectorAll('#tree-popover [data-tree-id]')][1];
        row.focus();
        return row.dataset.treeId;
      });
      await page.keyboard.press('Enter');
      await waitTreeChoiceClosed(page, 10000);
      assert.equal(await treeChoiceExpanded(page), 'false', `${width}: 트리를 고르면 목록이 닫힌다`);
      await page.waitForFunction((id) => /tree=/.test(location.hash) && new URLSearchParams(location.hash.split('?')[1] || '').get('tree') === id, wantTree, { timeout: 15000 });
      assert.ok(page.url().includes(`tree=${wantTree}`), `${width}: Enter로 고른 트리가 열린다(${page.url().split('#')[1] || ''})`);

      // 바깥 누르기로 닫기: aria-expanded가 false로 돌아온다.
      await page.waitForFunction(() => {
        const frame = document.querySelector('iframe#view');
        return frame?.contentWindow?.location.pathname.endsWith('/track61-tree.html') &&
          !!frame.contentDocument?.querySelector('button.lt-toolbar-tree-choice');
      }, null, { timeout: 5000 });
      await clickToolbarTreeChoice(page);
      await page.waitForFunction(() => !document.getElementById('tree-popover')?.hidden, null, { timeout: 5000 });
      // 아이프레임 위 좌표는 부모 문서까지 클릭이 오지 않으므로 부모 머리줄 빈 곳을 누른다.
      await page.click(".app-header", { position: { x: 5, y: 5 } });
      await page.waitForFunction(() => document.getElementById('tree-popover')?.hidden, null, { timeout: 5000 });
      await page.waitForFunction(() => document.querySelector('iframe#view')?.contentDocument?.querySelector('button.lt-toolbar-tree-choice')?.getAttribute('aria-expanded') === 'false', null, { timeout: 5000 });
      assert.equal(await treeChoiceExpanded(page), 'false', `${width}: 바깥을 누르면 닫히고 aria-expanded=false`);
      assert.equal(await page.evaluate(() => document.getElementById('tree-popover')?.contains(document.activeElement)), false, `${width}: 닫힌 목록 안에 초점이 남지 않는다`);
      await ctx.close();
    }
  } finally { await browser.close(); await new Promise((ok) => server.close(ok)); }
});

// #1028: 데스크탑(701px 이상)에서 메뉴 전체 스크롤 0, 목록 칸만 스크롤, 동작 4개 고정,
// 15개에서 트리 찾기·키보드·고른 트리 보이기를 숫자로 잰다. 휴대폰은 모양만 캡처한다.
test('1028 실행: 트리 목록만 스크롤하고 동작 칸은 고정이며 찾기·키보드가 동작한다', { skip: skip || !REQUIRE970 ? skip || 'LT_970_REQUIRE=1 일 때 실행' : false, timeout: 300000 }, async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const numbers = [];
  async function openMenu(width, height, theme, count) {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    const trees = Array.from({ length: count }, (_, i) => tree(i + 1));
    const state = { version: 1, trees, prefs: {} };
    await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-18T09:00:00.000Z' }) }));
    const page = await ctx.newPage();
    const current = trees.at(-1);
    await page.goto(`${origin}/v41/?account=1#my/board?tree=${current.id}&moment=${current.moments[0].id}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    await page.locator('#discover-ask-no').click().catch(() => {});
    await page.waitForTimeout(600);
    await clickToolbarTreeChoice(page);
    await page.waitForFunction(() => !document.getElementById('tree-popover')?.hidden, null, { timeout: 10000 });
    return { ctx, page, trees };
  }
  try {
    for (const width of [1440, 1920]) {
      for (const theme of ['night', 'garden']) {
        for (const count of [3, 6, 15]) {
          const { ctx, page, trees } = await openMenu(width, 900, theme, count);
          const m = await page.evaluate(() => {
            const pop = document.getElementById('tree-popover');
            const list = pop.querySelector('.tree-list');
            const search = pop.querySelector('[data-tree-search]');
            const actions = ['new', 'manage', 'share', 'tags'].map((a) => pop.querySelector(`[data-tree-action="${a}"]`));
            const inView = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight; };
            const active = pop.querySelector('[data-tree-id][aria-checked="true"]');
            const ar = active?.getBoundingClientRect(), lr = list?.getBoundingClientRect();
            return {
              menuScroll: pop.scrollHeight - pop.clientHeight,
              menuOverflow: getComputedStyle(pop).overflow,
              docScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
              listExists: !!list,
              listOver: list ? list.scrollHeight - list.clientHeight : -1,
              listVisibleRows: list ? [...list.querySelectorAll('[data-tree-id]')].filter((b) => !b.hidden).length : -1,
              searchExists: !!search,
              searchOutsideList: !!search && !search.closest('.tree-list'),
              actionsInView: actions.map((a) => !!a && inView(a)),
              listScrollTop: list ? Math.round(list.scrollTop) : -1,
              chosenInList: !!(lr && ar && ar.top >= lr.top - 1 && ar.bottom <= lr.bottom + 1)
            };
          });
          assert.equal(m.menuScroll, 0, `${width}/${theme}/${count}: 메뉴 바깥 스크롤 ${m.menuScroll}px`);
          assert.ok(/^(visible|hidden)/.test(m.menuOverflow), `${width}/${theme}/${count}: 메뉴 자체 스크롤 없음(${m.menuOverflow})`);
          assert.equal(m.docScroll, 0, `${width}/${theme}/${count}: 문서 스크롤 ${m.docScroll}px`);
          assert.equal(m.listExists, true, `${width}/${theme}/${count}: 목록 칸 존재`);
          assert.deepEqual(m.actionsInView, [true, true, true, true], `${width}/${theme}/${count}: 동작 4개 화면 안`);
          if (count === 15) {
            assert.ok(m.listOver > 0, `${width}/${theme}/15: 목록만 스크롤 가능(${m.listOver}px)`);
            assert.equal(m.searchExists, true, `${width}/${theme}/15: 트리 찾기 칸 존재`);
            assert.equal(m.searchOutsideList, true, `${width}/${theme}/15: 찾기 칸은 스크롤되는 목록 밖에 고정`);
            assert.ok(m.listScrollTop > 0, `${width}/${theme}/15: 고른 트리로 목록이 스크롤됨(${m.listScrollTop}px)`);
            assert.equal(m.chosenInList, true, `${width}/${theme}/15: 고른 트리 줄이 보임`);
            const fixed = await page.evaluate(() => {
              const pop = document.getElementById('tree-popover');
              const list = pop.querySelector('.tree-list');
              const search = pop.querySelector('[data-tree-search]');
              list.scrollTop = list.scrollHeight;
              const s = search.getBoundingClientRect(), p = pop.getBoundingClientRect();
              return { searchTop: Math.round(s.top), menuTop: Math.round(p.top), searchBottom: Math.round(s.bottom), menuBottom: Math.round(p.bottom), listScrollTop: Math.round(list.scrollTop) };
            });
            assert.ok(fixed.searchTop >= fixed.menuTop, `${width}/${theme}/15: 목록 맨 아래에서도 찾기 칸이 메뉴 안(top ${fixed.searchTop} ≥ ${fixed.menuTop})`);
            assert.ok(fixed.searchBottom <= fixed.menuBottom, `${width}/${theme}/15: 찾기 칸 아래쪽도 메뉴 안(bottom ${fixed.searchBottom} ≤ ${fixed.menuBottom})`);
            m.searchFixed = fixed;
            await page.fill('[data-tree-search]', trees.at(-1).subject);
            const found = await page.evaluate(() => [...document.querySelectorAll('#tree-popover [data-tree-id]')].filter((b) => !b.hidden).map((b) => b.querySelector('.tree-name').textContent.trim()));
            assert.deepEqual(found, [trees.at(-1).subject], `${width}/${theme}/15: 찾기로 한 줄만 남음(${JSON.stringify(found)})`);
            m.searchFound = found.length;
            await page.fill('[data-tree-search]', '');
            await page.evaluate(() => document.querySelector('#tree-popover [data-tree-id]')?.focus());
            await page.keyboard.press('ArrowDown');
            m.keyboardDown = await page.evaluate((id) => document.activeElement?.getAttribute('data-tree-id') === id, trees[1].id);
            assert.equal(m.keyboardDown, true, `${width}/${theme}/15: ↓로 두 번째 줄`);
            await page.keyboard.press('Escape');
            await page.waitForFunction(() => document.getElementById('tree-popover')?.hidden, null, { timeout: 5000 });
            await page.frameLocator('iframe#view').locator('button.lt-toolbar-tree-choice[aria-expanded="false"]').waitFor({state:'attached',timeout:5000});
            m.escapeClosed = await page.evaluate(() => document.querySelector('iframe#view')?.contentDocument?.querySelector('button.lt-toolbar-tree-choice')?.getAttribute('aria-expanded') === 'false');
            assert.equal(m.escapeClosed, true, `${width}/${theme}/15: Esc로 닫힘`);
          } else {
            assert.equal(m.listOver, 0, `${width}/${theme}/${count}: 넘치지 않으면 목록 스크롤 0`);
            assert.equal(m.searchExists, false, `${width}/${theme}/${count}: 8개 미만은 찾기 칸 없음`);
          }
          if (SHOT) {
            mkdirSync(SHOT, { recursive: true });
            if (await page.evaluate(() => document.getElementById('tree-popover')?.hidden)) await clickToolbarTreeChoice(page);
            await page.screenshot({ path: `${SHOT}/desktop-${width}-${theme}-${count}.png` });
          }
          numbers.push({ width, theme, count, ...m });
          await ctx.close();
        }
      }
    }
    // #1079: 휴대폰도 데스크탑과 같은 규칙 — 목록만 스크롤하고 동작 칸·찾기 칸이 고정된다.
    for (const theme of ['night', 'garden']) {
      for (const count of [1, 15]) {
        const { ctx, page, trees } = await openMenu(390, 844, theme, count);
        const m = await page.evaluate(() => {
          const pop = document.getElementById('tree-popover');
          const list = pop.querySelector('.tree-list');
          const search = pop.querySelector('[data-tree-search]');
          const actions = ['new', 'manage', 'share', 'tags'].map((a) => pop.querySelector(`[data-tree-action="${a}"]`));
          const inView = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight; };
          const active = pop.querySelector('[data-tree-id][aria-checked="true"]');
          const ar = active?.getBoundingClientRect(), lr = list?.getBoundingClientRect();
          return {
            menuScroll: pop.scrollHeight - pop.clientHeight,
            menuOverflow: getComputedStyle(pop).overflow,
            docScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
            listExists: !!list,
            listOver: list ? list.scrollHeight - list.clientHeight : -1,
            searchExists: !!search,
            searchOutsideList: !!search && !search.closest('.tree-list'),
            actionsInView: actions.map((a) => !!a && inView(a)),
            listScrollTop: list ? Math.round(list.scrollTop) : -1,
            chosenInList: !!(lr && ar && ar.top >= lr.top - 1 && ar.bottom <= lr.bottom + 1)
          };
        });
        assert.equal(m.menuScroll, 0, `390/${theme}/${count}: 메뉴 바깥 스크롤 ${m.menuScroll}px`);
        assert.ok(/^(visible|hidden)/.test(m.menuOverflow), `390/${theme}/${count}: 메뉴 자체 스크롤 없음(${m.menuOverflow})`);
        assert.equal(m.docScroll, 0, `390/${theme}/${count}: 문서 스크롤 ${m.docScroll}px`);
        assert.equal(m.listExists, true, `390/${theme}/${count}: 목록 칸 존재`);
        assert.deepEqual(m.actionsInView, [true, true, true, true], `390/${theme}/${count}: 동작 4개 화면 안`);
        assert.equal(m.searchExists, count >= 8, `390/${theme}/${count}: 찾기 칸 ${count >= 8 ? '있음' : '없음'}`);
        if (count === 15) {
          assert.ok(m.listOver > 0, `390/${theme}/15: 목록만 스크롤 가능(${m.listOver}px)`);
          assert.equal(m.searchOutsideList, true, `390/${theme}/15: 찾기 칸은 목록 밖에 고정`);
          assert.ok(m.listScrollTop > 0 && m.chosenInList, `390/${theme}/15: 고른 트리로 목록이 스크롤됨`);
          await page.fill('[data-tree-search]', trees.at(-1).subject);
          const found = await page.evaluate(() => [...document.querySelectorAll('#tree-popover [data-tree-id]')].filter((b) => !b.hidden).map((b) => b.querySelector('.tree-name').textContent.trim()));
          assert.deepEqual(found, [trees.at(-1).subject], `390/${theme}/15: 찾기로 한 줄만 남음`);
        } else {
          assert.equal(m.listOver, 0, `390/${theme}/1: 넘치지 않으면 목록 스크롤 0`);
        }
        if (SHOT) { mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: `${SHOT}/phone-390-${theme}-${count}.png` }); }
        numbers.push({ width: 390, theme, count, ...m });
        await ctx.close();
      }
    }
    if (SHOT) writeFileSync(`${SHOT}/numbers.json`, JSON.stringify(numbers, null, 2));
    console.log('MENU_1028_NUMBERS', JSON.stringify(numbers));
  } finally { await browser.close(); await new Promise((ok) => server.close(ok)); }
});


test('#1246 모든 화면의 순간 추가만 장미색·둘러보기 테두리', {skip: REQUIRE ? false : skip || 'LT_TOPMENU_REQUIRE=1 일 때 실행', timeout:180000}, async()=>{
  if(skip)assert.fail(skip);
  const server=await serve(),base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  try{
    for(const width of [1440,390])for(const theme of ['night','garden']){
      const ctx=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});
      try{
        await ctx.addInitScript(t=>{localStorage.setItem('lt41.theme',t);localStorage.setItem('lt41.tips.firstTree','1')},theme);
        const state={version:1,trees:[tree(1),tree(2)],prefs:{}};
        await ctx.route('**/*',r=>{
          const u=new URL(r.request().url());
          if(u.origin!==base)return r.abort();
          if(u.pathname==='/api/workspace')return r.fulfill({status:200,json:{revision:1,state,subject:'header-color-test',writeSubjectBound:true,savedAt:'2026-11-18T09:00:00Z'}});
          if(u.pathname.startsWith('/api/'))return r.fulfill({status:200,json:{ok:true,items:[],trees:0,moments:0}});
          return r.continue();
        });
        const page=await ctx.newPage();
        await page.goto(base+'/v41/?account=1#home');
        await page.waitForFunction(()=>window.LT41?.trees?.length===2&&document.body.dataset.member==='in');
        const ask=page.locator('#discover-ask-no');
        await ask.waitFor({state:'visible',timeout:4000}).catch(()=>{});
        if(await ask.isVisible())await ask.click();
        const read=()=>page.evaluate(()=>{
          const sample=document.createElement('span');
          sample.style.backgroundColor='var(--lt-cta-rose)';sample.style.color='var(--lt-cta-white)';document.body.append(sample);
          const rose=getComputedStyle(sample).backgroundColor,white=getComputedStyle(sample).color;sample.remove();
          const info=e=>{const s=getComputedStyle(e);return{id:e.id,bg:s.backgroundColor,ink:s.color,visible:e.checkVisibility({checkVisibilityCSS:true})}};
          const explore=document.getElementById('community-menu'),cs=getComputedStyle(explore),er=explore.getBoundingClientRect();
          const icon=explore.querySelector('svg'),ir=icon.getBoundingClientRect(),header=document.querySelector('.app-header').getBoundingClientRect();
          const picker=document.getElementById('record-menu').getBoundingClientRect();
          const hit=document.elementFromPoint(er.x+er.width/2,er.y+er.height/2);
          return {rose,white,head:info(document.getElementById('write-menu')),fab:info(document.getElementById('mobile-add')),
            explore:{...info(explore),current:explore.getAttribute('aria-current')==='true',border:cs.borderTopWidth,borderColor:cs.borderTopColor,borderStyle:cs.borderTopStyle,radius:parseFloat(cs.borderTopLeftRadius),deco:cs.textDecorationLine,weight:cs.fontWeight,icon:ir.width>0&&ir.height>0&&icon.getAttribute('stroke')==='currentColor'&&icon.getAttribute('fill')==='none'&&icon.getAttribute('aria-hidden')==='true',labelVisible:explore.querySelector('.community-menu-label').checkVisibility(),width:er.width,height:er.height,inside:er.left>=header.left&&er.right<=header.right&&er.top>=header.top&&er.bottom<=header.bottom,hit:hit===explore||explore.contains(hit),pickerOverlap:Math.max(0,Math.min(er.right,picker.right)-Math.max(er.left,picker.left))},
            headerHeight:Math.round(header.height),overflow:document.documentElement.scrollWidth-innerWidth,
            tabs:[...document.querySelectorAll('#tree-views button[data-view]')].map(e=>({border:getComputedStyle(e).borderTopWidth,deco:getComputedStyle(e).textDecorationLine,current:e.getAttribute('aria-current')==='true'})),
            other:[...document.querySelectorAll('.app-header button,.app-header a')].filter(e=>!['write-menu','mobile-add'].includes(e.id)&&e.checkVisibility({checkVisibilityCSS:true})).map(info)};
        });
        let idleExplore;
        for(const [name,hash] of [['home','#home'],...SCREENS,['community','#explore']]){
          if(name==='community'){
            if(width===390){await page.locator('#mobile-more').click();await page.locator('#header-overflow button').filter({hasText:/^둘러보기$/}).click();}
            else await page.locator('#community-menu').click();
          }
          else await page.evaluate(h=>location.hash=h,hash);
          await page.mouse.move(2,300);
          if(name==='community')await page.waitForFunction(()=>document.body.classList.contains('community-screen'));
          else if(name==='home')await page.waitForFunction(()=>document.body.classList.contains('home-existing'));
          else await page.waitForFunction(h=>[...document.querySelectorAll('iframe')].some(f=>f.checkVisibility()&&f.contentWindow?.location.href.includes(h)),({shelf:'track32-bookshelf',book:'track59-sketchbook',board:'track58-pinboard',map:'track56-network'})[name]);
          const m=await read(),key=[width,theme,name].join('/');
          assert.equal(m.head.bg,m.rose,key+' 머리줄 배경');
          assert.equal(m.head.ink,m.white,key+' 머리줄 글자');
          if(width===390){assert.equal(m.fab.bg,m.rose,key+' 휴대폰 배경');assert.equal(m.fab.ink,m.white,key+' 휴대폰 글자');}
          assert.deepEqual(m.other.filter(b=>b.bg===m.rose),[],key+' 다른 머리줄 단추에 장미색 없음');
          if(width===1440)assert.equal(m.head.visible,true,key+' 머리줄 순간 추가 표시');
          else if(!['home','community'].includes(name))assert.equal(m.fab.visible,true,key+' 휴대폰 순간 추가 표시');
          const e=m.explore;
          if(width===390){
            assert.equal(e.visible,false,key+' 둘러보기는 더보기 안으로 접힘');
            await page.locator('#mobile-more').click();
            await page.locator('#header-overflow button').filter({hasText:/^둘러보기$/}).waitFor({state:'visible'});
            await page.locator('#mobile-more').click();
          }else{
          assert.ok(e.visible&&e.icon&&e.inside&&e.hit&&e.pickerOverlap===0,key+' 둘러보기 아이콘·실제 누름 영역·겹침 0 '+JSON.stringify(e));
          assert.ok(e.width>=44&&e.height>=44,key+' 둘러보기 44px 누름 영역');
          assert.equal(e.bg,'rgba(0, 0, 0, 0)',key+' 투명 배경');
          assert.equal(e.border,'1px',key+' 테두리');
          assert.equal(e.borderStyle,'solid',key+' 테두리 모양');
          assert.ok(e.radius>=22,key+' 둥근 단추');
          assert.equal(e.deco,'none',key+' 밑줄 없음');
          assert.equal(e.labelVisible,width===1440,key+' 넓은 화면만 글자 표시');
          }
          assert.equal(e.current,name==='community',key+' 현재 둘러보기 표시');
          assert.ok(m.tabs.every(t=>t.border==='0px'),key+' 내 트리 탭은 테두리 없음');
          assert.equal(m.overflow,0,key+' 가로 넘침 0');
          if(width===390)assert.equal(m.headerHeight,57,key+' 머리줄 57px');
          if(name==='home')idleExplore=e;
          if(name==='community'&&width===1440){
            assert.notEqual(e.borderColor,idleExplore.borderColor,key+' 현재 테두리 강조');
            assert.notEqual(e.ink,idleExplore.ink,key+' 현재 글자 강조');
            assert.ok(Number(e.weight)>Number(idleExplore.weight),key+' 현재 글자 굵기');
          }
          console.log(key,JSON.stringify(m));
        }
      }finally{await ctx.close();}
    }
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});

test('#1367 4번: 트리 고르기 목록은 바깥 누름·안쪽 화면 누름·Esc로 닫히고 초점이 돌아온다(390·1440 × 밤·정원)', { skip: skip || !REQUIRE ? skip || 'LT_TOPMENU_REQUIRE=1 일 때 실행' : false, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390]) for (const theme of ['night', 'garden']) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
      await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
      await ctx.route('**://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#333"/></svg>' }));
      await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      const state = { version: 1, trees: [tree(1), tree(2)], prefs: {} };
      await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-18T09:00:00.000Z' }) }));
      const page = await ctx.newPage();
      try {
        await page.goto(`${origin}/v41/?account=1`, { waitUntil: 'load', timeout: 60000 });
        await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
        await page.locator('#discover-ask-no').click().catch(() => {});
        const hidden = () => page.evaluate(() => document.getElementById('tree-popover')?.hidden !== false);
        const open = async () => { assert.equal(await hidden(), true, '처음에는 닫혀 있다'); await clickToolbarTreeChoice(page); await page.waitForFunction(() => !document.getElementById('tree-popover')?.hidden, null, {timeout:5000}); assert.equal(await hidden(), false, '트리 고르기를 누르면 열린다'); };

        // 머리줄 빈 곳(테마 단추)을 눌러도 창을 닫기만 하고 테마는 바뀌지 않는다.
        await open();
        const themeBefore = await page.evaluate(() => localStorage.getItem('lt41.theme'));
        await page.click('#theme-toggle');
        assert.equal(await hidden(), true, `${width}/${theme}: 바깥 누름으로 닫힌다`);
        assert.equal(await page.evaluate(() => localStorage.getItem('lt41.theme')), themeBefore, `${width}/${theme}: 바깥 누름이 다른 동작을 실행하지 않는다`);

        // 안쪽 화면(iframe)을 눌러도 닫힌다.
        await open();
        // 목록 아래쪽의 안쪽 화면을 실제 마우스로 누른다(목록은 y≈497에서 끝난다).
        if (width === 1440) {
          await page.mouse.click(width - 40, 700);
        } else {
          const outsidePoint = await page.evaluate(() => {
            const rect = document.querySelector('#tree-popover').getBoundingClientRect();
            if (rect.top <= 4) return null;
            return { x: Math.min(innerWidth - 2, rect.right - 8), y: rect.top / 2 };
          });
          assert.ok(outsidePoint, `${width}/${theme}: sheet has an outside region above it`);
          await page.mouse.click(outsidePoint.x, outsidePoint.y);
        }
        assert.equal(await page.locator('#share-panel').evaluate(dialog => dialog.open), false, `${width}/${theme}: closing press does not open share panel`);
        assert.equal(await hidden(), true, `${width}/${theme}: 안쪽 화면 누름으로 닫힌다`);

        // Esc로 닫고 초점은 트리 고르기 단추로 돌아온다.
        await open();
        await page.keyboard.press('Escape');
        assert.equal(await hidden(), true, `${width}/${theme}: Esc로 닫힌다`);
        await page.waitForFunction(() => document.querySelector('iframe#view')?.contentDocument?.activeElement?.matches('button.lt-toolbar-tree-choice'), null, {timeout:5000});
        assert.equal(await treeChoiceFocused(page), true, `${width}/${theme}: 닫힌 뒤 초점 복귀`);
        if (width === 1440) {
          await page.evaluate(() => {
            const button = document.createElement('button');
            button.id = 'share-under-picker-test';
            button.textContent = '??';
            Object.assign(button.style, { position: 'fixed', right: '30px', bottom: '120px', zIndex: '2147483647' });
            button.onclick = () => document.getElementById('share-menu').click();
            document.body.append(button);
          });
          await open();
          await page.locator('#share-under-picker-test').click();
          assert.equal(await hidden(), true, `${width}/${theme}: ? ??? ??? ???`);
          assert.equal(await page.locator('#share-panel').evaluate(dialog => dialog.open), false, `${width}/${theme}: ? ??? ?? ?? ??? ???`);
          await page.locator('#share-under-picker-test').click();
          await page.locator('#share-panel[open]').waitFor({state:'visible',timeout:5000});
          assert.equal(await page.locator('#share-panel').evaluate(dialog => dialog.open), true, `${width}/${theme}: ? ?? ?? ??? ????`);
          await page.locator('#share-panel [data-close="share-panel"]').click();
          await page.locator('#share-panel').waitFor({state:'hidden',timeout:5000});
          await page.locator('#share-under-picker-test').evaluate(button => button.remove());
        }
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); await new Promise((r) => server.close(r)); }
});


// #1350: 실제 머리줄에서 상태별 간격과 가로 넘침, 로그인 확정 CLS를 검증한다.
const REQUIRE_GAP = process.env.LT_HEADER_GAP_REQUIRE === '1' || REQUIRE;
test('#1350 머리줄 오른쪽 간격: 390·844·1440 × 밤·정원 × 로그인·로그아웃·확인 중', {
  skip: skip || !REQUIRE_GAP ? skip || '간격 시험을 실행하도록 설정하지 않음' : false,
  timeout: 240000
}, async () => {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true });
  const measurements = [];
  try {
    for (const width of [390, 844, 1440]) for (const theme of ['night', 'garden']) {
      const ctx = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : width === 844 ? 390 : 900 },
        reducedMotion: 'reduce'
      });
      try {
        await ctx.route('**/api/**', route => route.fulfill({ status: 200,
          contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
        const page = await ctx.newPage();
        await page.goto(base + '/v41/#home', { waitUntil: 'load' });
        await page.waitForSelector('#theme-toggle');
        for (const auth of ['로그아웃', '로그인', '확인 중']) {
          const result = await page.evaluate(async ({ theme, auth }) => {
            const root = document.documentElement;
            root.dataset.ltTheme = theme;
            root.dataset.ltAuthPhase = auth === '확인 중' ? 'pending' : 'ready';
            root.dataset.ltAuthHint = auth === '로그아웃' ? 'out' : 'in';
            const write = document.getElementById('write-menu');
            write.hidden = auth !== '로그인';
            await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
            const themeButton = document.getElementById('theme-toggle').getBoundingClientRect();
            const slot = document.querySelector('.header-actions > .account-slot').getBoundingClientRect();
            const entry = document.getElementById('account-entry').getBoundingClientRect();
            return { gap: Math.round((slot.left - themeButton.right) * 100) / 100,
              slotWidth: Math.round(slot.width), entryWidth: Math.round(entry.width),
              overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth) };
          }, { theme, auth });
          const label = width + '/' + theme + '/' + auth;
          if (width >= 781) {
            const expected = auth === '로그아웃' ? (width === 1440 ? 12 : 8)
              : (width === 1440 ? 146 : 138);
            assert.equal(result.gap, expected, label + ': 테마와 계정 사이 간격');
            assert.equal(result.slotWidth, 80, label + ': 계정 칸 폭');
          } else {
            assert.equal(result.slotWidth, 66, label + ': 휴대폰 계정 칸 66px 유지');
            if (auth === '로그아웃') assert.equal(result.entryWidth, 56,
              label + ': 휴대폰 로그아웃 단추 56px 유지');
          }
          assert.equal(result.overflow, 0, label + ': 가로 넘침 0');
          measurements.push({ width, theme, auth, ...result });
          if (process.env.LT_HEADER_GAP_SHOT_DIR &&
              (auth === '로그인' || auth === '로그아웃')) {
            mkdirSync(process.env.LT_HEADER_GAP_SHOT_DIR, { recursive: true });
            await page.screenshot({ path: process.env.LT_HEADER_GAP_SHOT_DIR +
              '/머리줄-' + width + '-' + theme + '-' + auth + '.png' });
          }
        }

        // #1350: 로그인 흔적이 없는 확인 중 상태에서는 hidden 속성이 늦어도 예약 칸이 없어야 한다.
        const noHint = await page.evaluate(async () => {
          const root = document.documentElement;
          const write = document.getElementById('write-menu');
          root.dataset.ltAuthPhase = 'pending';
          delete root.dataset.ltAuthHint;
          write.hidden = false;
          await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
          const gap = () => {
            const a = document.getElementById('theme-toggle').getBoundingClientRect();
            const b = document.querySelector('.header-actions > .account-slot').getBoundingClientRect();
            return Math.round((b.left - a.right) * 100) / 100;
          };
          const before = gap();
          let cls = 0;
          const observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) if (!entry.hadRecentInput) cls += entry.value;
          });
          observer.observe({ type: 'layout-shift', buffered: false });
          root.dataset.ltAuthPhase = 'ready';
          root.dataset.ltAuthHint = 'out';
          write.hidden = true;
          await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
          observer.disconnect();
          return { before, after: gap(), cls };
        });
        const compactGap = width === 1440 ? 12 : width === 844 ? 8 : 4;
        assert.equal(noHint.before, compactGap,
          width + '/' + theme + ': 로그인 흔적이 없으면 확인 중에도 예약 칸을 두지 않는다');
        assert.equal(noHint.after, compactGap,
          width + '/' + theme + ': 로그아웃 확정 후 같은 간격을 유지한다');
        assert.ok(noHint.cls <= 0.01,
          width + '/' + theme + ': 로그인 흔적 없는 상태의 로그아웃 확정 CLS 0.01 이하');
        measurements.push({ width, theme, auth: '로그인 흔적 없는 확인 중', ...noHint });
        const cls = await page.evaluate(async () => {
          const root = document.documentElement;
          const write = document.getElementById('write-menu');
          root.dataset.ltAuthPhase = 'pending';
          root.dataset.ltAuthHint = 'in';
          write.hidden = true;
          await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
          let total = 0;
          const observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) if (!entry.hadRecentInput) total += entry.value;
          });
          observer.observe({ type: 'layout-shift', buffered: false });
          root.dataset.ltAuthPhase = 'ready';
          write.hidden = false;
          await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
          observer.disconnect();
          return total;
        });
        assert.ok(cls <= 0.01, width + '/' + theme + ': 로그인 확정 CLS ' + cls + ' ≤ 0.01');
        measurements.push({ width, theme, auth: '확정 전환', cls });
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); server.close(); }
  console.log('#1350 머리줄 측정 결과', JSON.stringify(measurements));
});
