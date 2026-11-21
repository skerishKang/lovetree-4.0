import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
      await page.click('#record-menu');
      await page.waitForFunction(() => !document.getElementById('tree-popover')?.hidden, null, { timeout: 10000 });
      assert.equal(await page.evaluate(() => document.getElementById('record-menu')?.getAttribute('aria-expanded')), 'true', `${width}: 열면 aria-expanded=true`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.getElementById('tree-popover')?.hidden, null, { timeout: 5000 });
      const afterEsc = await page.evaluate(() => ({
        expanded: document.getElementById('record-menu')?.getAttribute('aria-expanded'),
        focus: document.activeElement?.id
      }));
      assert.equal(afterEsc.expanded, 'false', `${width}: Esc로 닫으면 aria-expanded=false`);
      assert.equal(afterEsc.focus, 'record-menu', `${width}: Esc로 닫으면 초점이 단추로 돌아온다`);

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
      assert.equal(moved.first, 0, `${width}: 열면 첫 항목에 초점`);
      assert.equal(moved.down, 1, `${width}: ↓로 다음 항목`);
      assert.equal(moved.up, 0, `${width}: ↑로 다시 첫 항목`);
      assert.equal(moved.home, 0, `${width}: Home은 첫 항목`);
      assert.equal(moved.end, moved.last, `${width}: End는 마지막 항목`);

      // Enter로 그 트리를 연다: 두 번째 트리 줄에 초점을 옮기고 Enter → 목록이 닫히고 주소가 그 트리를 가리킨다.
      const wantTree = await page.evaluate(() => {
        const row = [...document.querySelectorAll('#tree-popover [data-tree-id]')][1];
        row.focus();
        return row.dataset.treeId;
      });
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.getElementById('tree-popover')?.hidden, null, { timeout: 10000 });
      assert.equal(await page.evaluate(() => document.getElementById('record-menu')?.getAttribute('aria-expanded')), 'false', `${width}: 트리를 고르면 목록이 닫힌다`);
      await page.waitForFunction((id) => /tree=/.test(location.hash) && new URLSearchParams(location.hash.split('?')[1] || '').get('tree') === id, wantTree, { timeout: 15000 });
      assert.ok(page.url().includes(`tree=${wantTree}`), `${width}: Enter로 고른 트리가 열린다(${page.url().split('#')[1] || ''})`);

      // 바깥 누르기로 닫기: aria-expanded가 false로 돌아온다.
      await page.click('#record-menu');
      await page.waitForFunction(() => !document.getElementById('tree-popover')?.hidden, null, { timeout: 5000 });
      // 아이프레임 위 좌표는 부모 문서까지 클릭이 오지 않으므로 부모 머리줄 빈 곳을 누른다.
      await page.click(".app-header", { position: { x: 5, y: 5 } });
      await page.waitForFunction(() => document.getElementById('tree-popover')?.hidden, null, { timeout: 5000 });
      assert.equal(await page.evaluate(() => document.getElementById('record-menu')?.getAttribute('aria-expanded')), 'false', `${width}: 바깥을 누르면 닫히고 aria-expanded=false`);
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
    await page.click('#record-menu');
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
            m.escapeClosed = await page.evaluate(() => document.getElementById('record-menu')?.getAttribute('aria-expanded') === 'false');
            assert.equal(m.escapeClosed, true, `${width}/${theme}/15: Esc로 닫힘`);
          } else {
            assert.equal(m.listOver, 0, `${width}/${theme}/${count}: 넘치지 않으면 목록 스크롤 0`);
            assert.equal(m.searchExists, false, `${width}/${theme}/${count}: 8개 미만은 찾기 칸 없음`);
          }
          if (SHOT) {
            mkdirSync(SHOT, { recursive: true });
            if (await page.evaluate(() => document.getElementById('tree-popover')?.hidden)) await page.click('#record-menu');
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
