import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRE = process.env.LT_BOTTOM_LINKS_REQUIRE === '1';
const CAPTURE_DIR = process.env.LT_BOTTOM_LINKS_SHOT_DIR || '';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 화면 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 화면 시험을 건너뜀'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 화면 시험을 건너뜀';

function fixtureTree() {
  let tree = createTree({ subject: '겹침 시험', title: '겹침 시험', note: '', emotion: '설렘', date: '2026-11-18', url: '' }, '2026-11-18T00:00:00Z');
  for (const [title, date] of [['첫 순간', '2026-11-18'], ['둘 순간', '2026-11-17'], ['셋 순간', '2016-10-16']]) {
    tree = addMoment(tree, { title, note: '', emotion: '설렘', date, url: '' }, tree.moments[0].id, '2026-11-18T00:00:01Z');
  }
  return tree;
}

async function openScreen(page, view, file, selector) {
  await page.evaluate((v) => { location.hash = '#my/' + v; }, view);
  let frame = null;
  for (let i = 0; i < 60 && !frame; i++) {
    frame = page.frames().find((f) => new RegExp(file).test(f.url()));
    if (!frame) await page.waitForTimeout(250);
  }
  assert.ok(frame, `${file} 화면이 열린다`);
  await frame.waitForSelector(selector, { state: 'attached', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  return frame;
}

function measure(shellPage, file, selector) {
  return shellPage.evaluate(([file, selector]) => {
    const frame = [...document.querySelectorAll('iframe')].find((f) => new RegExp(file).test(f.contentWindow?.location?.href || ''));
    const links = document.querySelector('.home-links');
    const ls = getComputedStyle(links);
    const lr = links.getBoundingClientRect();
    const linksVisible = ls.display !== 'none' && ls.visibility !== 'hidden' && lr.width > 0 && lr.height > 0;
    const target = frame?.contentDocument?.querySelector(selector);
    if (!target) return { file, linksVisible, found: false, overlap: false };
    const fr = frame.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const a = { left: fr.left + r.left, top: fr.top + r.top, right: fr.left + r.right, bottom: fr.top + r.bottom };
    const b = { left: lr.left, top: lr.top, right: lr.right, bottom: lr.bottom };
    const overlap = linksVisible && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    return { file, linksVisible, found: true, target: { x: Math.round(a.left), y: Math.round(a.top), w: Math.round(a.right - a.left), h: Math.round(a.bottom - a.top) }, links: { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.right - b.left), h: Math.round(b.bottom - b.top) }, overlap };
  }, [file, selector]);
}

test('#850 하단 링크와 지도·그래프 하단 요소 겹침 0(1440·390)', { skip: skip || !REQUIRE ? skip || 'LT_BOTTOM_LINKS_REQUIRE=1 일 때 실행' : false }, async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
      await ctx.route('**://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }));
      await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      const tree = fixtureTree();
      await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [tree], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-18T09:00:00.000Z' }) }));
      const page = await ctx.newPage();
      await page.goto(`${origin}/v41/?account=1`, { waitUntil: 'load' });
      await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
      await page.locator('#discover-ask-no').click().catch(() => {});

      for (const [file, selector, name, view] of [['track56-network', '.left-rail .controls', 'map', 'network'], ['track60-graph', '.g-shelf', 'graph', 'graph']]) {
        await openScreen(page, view, file, selector);
        const m = await measure(page, file, selector);
        m.viewport = `${width}x${height}`;
        m.name = name;
        results.push(m);
        if (CAPTURE_DIR) { mkdirSync(CAPTURE_DIR, { recursive: true }); await page.screenshot({ path: path.join(CAPTURE_DIR, `${name}-${width}.png`) }); }
      }
      await ctx.close();
    }
    console.log(JSON.stringify(results));
    for (const r of results) assert.equal(r.overlap, false, `${r.name} ${r.viewport} 하단 링크 겹침 0`);
  } finally {
    await browser.close();
    await new Promise((ok) => server.close(ok));
  }
});

// #1488 1번(CTO 결정 #1452): 바닥 링크(새 소식·의견 보내기·개인정보 처리방침·이용약관)는 안쪽 다섯 화면(서재·트리·보드·책·지도)에서
// 빼고, 계정 메뉴(로그인)와 휴대폰 메뉴(☰)에 같은 네 항목을 둔다. 첫 화면·공개 감상에는 남긴다.
// 공개 감상에서는 링크 줄이 화면 내용과 겹치지 않고(겹침 0), 화면 틀이 링크 줄(44px) 위에서 끝난다.
const LINK_NAMES = ['새 소식', '의견 보내기', '개인정보 처리방침', '이용약관'];
test('#1488 바닥 링크: 안쪽 다섯 화면에서 빠지고 계정 메뉴·휴대폰 메뉴에 네 항목, 첫 화면·공개 감상은 남고 겹침 0', { skip: skip || !REQUIRE ? skip || 'LT_BOTTOM_LINKS_REQUIRE=1 일 때 실행' : false, timeout: 420000 }, async () => {
  const { openShellState, BOX_FN, FRAME_ITEMS_FN, overlapArea, INNER_SCREENS } = await import('./helpers/shell-states.mjs');
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const rows = [];
  try {
    for (const [width, height] of [[390, 844], [844, 390], [1440, 900]]) {
      for (const screen of INNER_SCREENS) {
        const { ctx, page, errors } = await openShellState(browser, origin, { kind: 'member', screen, width, height });
        try {
          const links = await page.evaluate(BOX_FN, '.home-links');
          rows.push({ case: 'inner', screen, width, links });
          assert.equal(links, null, `${screen} ${width}: 안쪽 화면에는 바닥 링크가 보이지 않는다(${JSON.stringify(links)})`);
          assert.deepEqual(errors, [], screen + ' 화면 스크립트 오류');
        } finally { await ctx.close(); }
      }
    }
    // 같은 네 항목이 계정 메뉴(넓은 화면)와 휴대폰 메뉴(390)에 있고, 링크 주소는 바닥 링크와 같다.
    const hrefs = async (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.home-links a')].map((a) => [a.textContent.trim(), a.getAttribute('href')])));
    {
      const { ctx, page } = await openShellState(browser, origin, { kind: 'member', screen: 'book', width: 1440, height: 900 });
      try {
        const bottomHrefs = await hrefs(page);
        await page.locator('#account-avatar').click();
        await page.waitForFunction(() => !document.getElementById('account-popover').hidden);
        const items = await page.evaluate(() => [...document.querySelectorAll('#account-popover [role=menuitem]')].filter((e) => e.getClientRects().length).map((e) => ({ t: e.textContent.replace(/\d+$/, '').trim(), href: e.getAttribute('href'), target: e.getAttribute('target'), h: Math.round(e.getBoundingClientRect().height) })));
        rows.push({ case: 'account-menu', items });
        for (const name of LINK_NAMES) {
          const item = items.find((i) => i.t === name);
          assert.ok(item, '계정 메뉴에 ' + name + ' 항목이 있다: ' + items.map((i) => i.t).join('|'));
          assert.ok(item.h >= 44, name + ' 누름 높이 44px 이상(' + item.h + ')');
          if (bottomHrefs[name]) { assert.equal(item.href, bottomHrefs[name], name + ' 주소가 바닥 링크와 같다'); assert.equal(item.target, '_blank', name + '는 새 창으로 연다'); }
        }
        await page.locator('#account-popover [role=menuitem]', { hasText: '의견 보내기' }).click();
        await page.waitForFunction(() => [...document.querySelectorAll('dialog[open]')].some((d) => /의견/.test(d.textContent || '')), null, { timeout: 5000 });
      } finally { await ctx.close(); }
    }
    {
      const { ctx, page } = await openShellState(browser, origin, { kind: 'member', screen: 'board', width: 390, height: 844 });
      try {
        const bottomHrefs = await hrefs(page);
        await page.locator('#mobile-more').click();
        const items = await page.evaluate(() => [...document.querySelectorAll('#header-overflow [role=menuitem]')].filter((e) => e.getClientRects().length).map((e) => ({ t: e.textContent.trim(), href: e.getAttribute('href'), target: e.getAttribute('target'), h: Math.round(e.getBoundingClientRect().height) })));
        rows.push({ case: 'mobile-menu', items });
        for (const name of LINK_NAMES) {
          const item = items.find((i) => i.t === name);
          assert.ok(item, '휴대폰 메뉴에 ' + name + ' 항목이 있다: ' + items.map((i) => i.t).join('|'));
          assert.ok(item.h >= 44, name + ' 누름 높이 44px 이상(' + item.h + ')');
          if (bottomHrefs[name]) { assert.equal(item.href, bottomHrefs[name], name + ' 주소가 바닥 링크와 같다'); assert.equal(item.target, '_blank', name + '는 새 창으로 연다'); }
        }
        await page.locator('#header-overflow [role=menuitem]', { hasText: '새 소식' }).click();
        await page.waitForFunction(() => [...document.querySelectorAll('dialog[open]')].some((d) => /새 소식/.test(d.textContent || '')), null, { timeout: 5000 });
      } finally { await ctx.close(); }
    }
    // 첫 화면에는 바닥 링크 네 개가 그대로 남는다.
    for (const kind of ['guest', 'member']) {
      const { ctx, page } = await openShellState(browser, origin, { kind, screen: 'home', width: 1440, height: 900 });
      try {
        const names = await page.evaluate(() => [...document.querySelectorAll('.home-links .feedback-link')].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').map((e) => e.textContent.trim()));
        rows.push({ case: 'home', kind, names });
        assert.deepEqual(names, LINK_NAMES, kind + ' 첫 화면 바닥 링크 네 개');
      } finally { await ctx.close(); }
    }
    // 공개 감상: 링크 줄은 남고, 화면 내용과 겹침 0 — 처음 자리와 맨 아래까지 굴린 자리 모두. 화면 틀은 링크 줄 위에서 끝난다.
    for (const [width, height] of [[844, 390], [1440, 900]]) for (const screen of ['book', 'map']) {
      const { ctx, page } = await openShellState(browser, origin, { kind: 'share', screen, width, height });
      try {
        const links = await page.evaluate(BOX_FN, '.home-links');
        assert.ok(links, `공개 감상 ${screen} ${width}: 바닥 링크가 보인다`);
        const frame = await page.evaluate(BOX_FN, '#view');
        const hit = (items) => items.filter((e) => overlapArea(e, links) > 0).map((e) => e.t || e.tag);
        const first = hit(await page.evaluate(FRAME_ITEMS_FN));
        await page.evaluate(() => { const d = document.querySelector('#view')?.contentDocument; if (!d) return; d.scrollingElement && (d.scrollingElement.scrollTop = d.scrollingElement.scrollHeight); for (const el of d.querySelectorAll('*')) if (el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight; });
        await page.waitForTimeout(300);
        const bottom = hit(await page.evaluate(FRAME_ITEMS_FN));
        rows.push({ case: 'public', screen, width, links, frame, first, bottom });
        assert.deepEqual(first, [], `공개 감상 ${screen} ${width}: 바닥 링크와 화면 내용 겹침 0`);
        assert.deepEqual(bottom, [], `공개 감상 ${screen} ${width}: 맨 아래까지 굴려도 겹침 0`);
        assert.ok(frame.b <= links.y + 0.5, `공개 감상 ${screen} ${width}: 화면 틀(아래 ${frame.b})이 링크 줄(위 ${links.y}) 위에서 끝난다`);
        assert.ok(frame.b >= links.y - 2, `공개 감상 ${screen} ${width}: 화면 틀이 링크 줄 바로 위까지 내려온다(아래 ${frame.b}, 링크 위 ${links.y}) — 화면이 줄어 빈 자리가 생기지 않는다`);
        assert.ok(links.h >= 44, '링크 줄 높이 44px 이상(' + links.h + ')');
      } finally { await ctx.close(); }
    }
  } finally {
    console.log('#1488 바닥 링크', JSON.stringify(rows));
    await browser.close();
    await new Promise((ok) => server.close(ok));
  }
});

// #1488 2번: 휴대폰 ＋ 단추(#mobile-add)는 다섯 화면(서재·트리·보드·책·지도)에 모두 보이고, 화면 안 단추·안내 카드·글자와 12px 이상 떨어진다
// (책 '▶ 이어 보기'·첫 안내 '알겠어요'를 덮던 것 — #1452 점검 shell-my-book-390).
test('#1488 휴대폰 ＋ 단추: 다섯 화면에 보이고 화면 안 단추·안내와 12px 이상 떨어진다(390·360)', { skip: skip || !REQUIRE ? skip || 'LT_BOTTOM_LINKS_REQUIRE=1 일 때 실행' : false, timeout: 300000 }, async () => {
  const { openShellState, BOX_FN, FRAME_ITEMS_FN, gapBetween, INNER_SCREENS } = await import('./helpers/shell-states.mjs');
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const rows = [];
  try {
    for (const [width, height] of [[390, 844], [360, 740]]) for (const theme of ['night', 'garden']) for (const screen of INNER_SCREENS) {
      const { ctx, page } = await openShellState(browser, origin, { kind: 'member', screen, width, height, theme });
      try {
        const fab = await page.evaluate(BOX_FN, '#mobile-add');
        assert.ok(fab, `${screen} ${width}×${height} ${theme}: ＋ 단추가 보인다`);
        assert.ok(fab.w >= 44 && fab.h >= 44 && fab.b <= height, '＋ 단추 누름 44px 이상·화면 안');
        // 화면에 고정된 단추 줄·안내 카드·상태 줄(굴러가는 내용 밖)과 12px 이상. 굴러가는 카드·목록 위에 뜨는 것은 떠 있는 단추의 원래 동작이다.
        const items = await page.evaluate(FRAME_ITEMS_FN);
        const fixedItems = items.filter((e) => !e.scroll);
        const near = fixedItems.map((e) => ({ t: e.t || e.tag, gap: gapBetween(e, fab) })).sort((a, b) => a.gap - b.gap);
        rows.push({ screen, width, height, theme, fab, near: near.slice(0, 3) });
        // 화면마다 아래에 붙은 조작부가 실제로 검사 대상에 들어 있어야 한다(헛통과 방지).
        const must = { book: ['이어 보기'], tree: ['순간 4/4'], map: ['전체 맞춤'] }[screen] || [];
        for (const name of must) assert.ok(fixedItems.some((e) => e.t.includes(name)), `${screen} ${width}×${height}: 아래 조작부 '${name}'를 고정 요소로 찾았다`);
        const close = near.filter((e) => e.gap < 12);
        assert.deepEqual(close, [], `${screen} ${width}×${height} ${theme}: ＋ 단추와 12px 안에 있는 고정 요소 ${JSON.stringify(close)}`);
        if (screen === 'book') {
          // 낮은 화면(360×740)은 책 문서가 굴러간다 — 맨 아래까지 굴린 자리에서도 아래 단추 줄·첫 안내('알겠어요')와 12px 이상.
          await page.evaluate(() => { const d = document.querySelector('#view')?.contentDocument; const s = d?.scrollingElement; if (s) s.scrollTop = s.scrollHeight; });
          await page.waitForTimeout(500);
          const fab2 = await page.evaluate(BOX_FN, '#mobile-add');
          const items2 = (await page.evaluate(FRAME_ITEMS_FN)).filter((e) => !e.scroll);
          // 첫 안내 카드는 390×844에서 보인다(360×740은 책 화면 아래로 잘려 보이지 않는다 — 책 화면 배치 문제로 따로 적는다).
          for (const name of height >= 844 ? ['이어 보기', '알겠어요'] : ['이어 보기']) assert.ok(items2.some((e) => e.t.includes(name)), `book ${width}×${height}: 맨 아래에서 '${name}'를 찾았다`);
          const close2 = items2.map((e) => ({ t: e.t || e.tag, gap: gapBetween(e, fab2) })).filter((e) => e.gap < 12);
          rows.push({ screen: 'book-bottom', width, height, theme, fab: fab2, close: close2 });
          assert.deepEqual(close2, [], `book ${width}×${height} ${theme}: 맨 아래까지 굴려도 ＋ 단추와 12px 안 고정 요소 없음 ${JSON.stringify(close2)}`);
        }
      } finally { await ctx.close(); }
    }
  } finally {
    console.log('#1488 ＋ 단추', JSON.stringify(rows));
    await browser.close();
    await new Promise((ok) => server.close(ok));
  }
});
