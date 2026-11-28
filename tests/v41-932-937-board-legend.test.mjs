// #932·#937 화면 시험 — 932: 넓은 화면 보드의 가로 넘침 0과 상세 판이 화면 안.
//   937: 그래프 범례 줄 수 = 묶음 수(0·1·4), 묶음 0이면 범례 판 자체를 숨긴다.
// 셸을 그대로 띄우고 /api/workspace만 시험 기록으로 물린다(#842 시험과 같은 방식).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';
import { evaluateWhenReady } from './helpers/visible-frame.mjs';

const REQUIRE = process.env.LT_932_937_REQUIRE === '1';
const CAPTURE_DIR = process.env.LT_932_937_CAPTURE_DIR || '';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 화면 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 화면 시험을 건너뜀'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 화면 시험을 건너뜀';

// 순간 n개를 사슬로 만들고, moments[i]에 꼬리표를 붙인다. 꼬리표 값이 2개 이상 모이면 묶음(허브)이 된다.
function chainTree(count, tags = {}) {
  let tree = createTree({ subject: '넓은 화면 시험', title: '넓은 화면 시험', note: '', emotion: '설렘', date: '2026-11-18', url: '' }, '2026-11-18T00:00:00Z');
  tree.moments[0].title = '순간 1';
  tree.moments[0].keywords = tags[0] || [];
  for (let i = 1; i < count; i += 1) {
    tree = addMoment(tree, { title: '순간 ' + (i + 1), note: '메모 ' + (i + 1), emotion: '설렘', date: '2026-11-0' + ((i % 9) + 1), url: '' }, tree.moments[i - 1].id, '2026-11-18T00:00:0' + (i % 9) + 'Z');
    tree.moments[i].keywords = tags[i] || [];
  }
  return tree;
}

async function withShell(tree, fn) {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  try {
    await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
    await ctx.route('**://i.ytimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }));
    await ctx.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx.route('**/api/workspace**', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ revision: 1, state: { version: 1, trees: [tree], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-18T09:00:00.000Z' }),
    }));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error.message || error)));
    await page.goto(`${origin}/v41/?account=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    await fn({ page, errors, origin, tree });
  } finally {
    await browser.close();
    server.close();
  }
}

async function openBoard(page, href) {
  await page.goto(href, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
  for (let i = 0; i < 60; i += 1) {
    const frame = page.frames().find((f) => /track58-pinboard/.test(f.url()));
    if (frame) { await frame.waitForSelector('.card', { timeout: 20000 }); return frame; }
    await page.waitForTimeout(250);
  }
  throw new Error('보드 화면이 열리지 않음');
}

// #842 시험과 같은 길: 지도를 한 번 열어 두고 그래프로 넘어간다(그래프는 지도에서 이어진 화면).
async function openGraph(page) {
  await page.evaluate(() => { location.hash = '#my/network'; });
  for (let i = 0; i < 60; i += 1) {
    if (page.frames().some((f) => /track56-network/.test(f.url()))) break;
    await page.waitForTimeout(250);
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.evaluate(() => { location.hash = '#my/graph'; });
    for (let i = 0; i < 40; i += 1) {
      const frame = page.frames().find((f) => /track60-graph/.test(f.url()));
      if (frame) {
        if (await frame.locator('#gBadge').count()) {
          await frame.locator('#gBadge').waitFor({ timeout: 20000 });
          return frame;
        }
      }
      await page.waitForTimeout(250);
    }
  }
  throw new Error('그래프 화면이 열리지 않음');
}

test('#932 보드 — 1440·2560·390에서 가로 넘침 0, 상세 판이 화면 안', { skip: skip || !REQUIRE ? skip || 'LT_932_937_REQUIRE=1 일 때 실행' : false }, async () => {
  const tree = chainTree(6);
  await withShell(tree, async ({ page, errors, origin }) => {
    for (const [w, h] of [[1440, 900], [2560, 1440], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      const href = `${origin}/v41/?account=1#my/board?tree=${tree.id}&moment=${tree.moments[0].id}`;
      const frame = await openBoard(page, href);
      const before = await evaluateWhenReady(frame, () => {
        const root = document.documentElement;
        if (!root) return false;
        return { scroll: root.scrollWidth, client: root.clientWidth };
      });
      assert.equal(before.scroll - before.client, 0, `${w}: 보드 문서 가로 넘침 0 (scroll ${before.scroll} / client ${before.client})`);
      const shell = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      assert.equal(shell.scroll - shell.client, 0, `${w}: 셸 문서 가로 넘침 0`);
      // 좁은 화면(<700)은 주소로만 판이 열리지 않는다 — 화면의 순간 고르기 단추로 연다(실제 손길과 같다).
      if (w < 700) await frame.locator('.lt-moment-picker button').first().click();
      // #923처럼 카드가 다시 그려지면 판이 잠깐 inert로 돌아간다 — '열려 있고 잴 수 있는' 상태를 기다린다.
      await frame.waitForFunction(() => {
        const d = document.getElementById('detail');
        if (!d || !d.classList.contains('open') || d.inert) return false;
        const r = d.getBoundingClientRect();
        return r.width > 100 && r.height > 80;
      }, null, { timeout: 15000 });
      if (w === 1440) {
        await frame.locator('#detailClose').click();
        await frame.locator('.card[data-id]').first().click({ position: { x: 30, y: 35 } });
        await frame.waitForFunction(() => document.querySelector('#detail').classList.contains('open'));
        const immediate = await frame.locator('#detail').evaluate(el => el.getBoundingClientRect().right);
        assert.ok(immediate <= 1438, '1440: 상세 판을 다시 열자마자 화면 안');
      }
      await page.waitForTimeout(450); // 판이 밀려 들어오는 전환(0.35s)이 끝난 뒤에 잰다.
      const rect = await frame.locator('#detail').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), inner: innerWidth };
      });
      assert.ok(rect.left >= -1, `${w}: 상세 판 왼쪽이 화면 밖이 아님 (${rect.left})`);
      assert.ok(rect.right <= rect.inner + 1, `${w}: 상세 판 오른쪽이 화면 밖이 아님 (${rect.right} ≤ ${rect.inner})`);
      assert.equal(await evaluateWhenReady(frame, () => {
        const root = document.documentElement;
        return root ? root.scrollWidth - root.clientWidth : false;
      }), 0, `${w}: 판을 연 뒤에도 넘침 0`);
      if (CAPTURE_DIR && w === 2560) {
        mkdirSync(CAPTURE_DIR, { recursive: true });
        await page.screenshot({ path: path.join(CAPTURE_DIR, 'board-2560-detail.png') });
      }
    }
    assert.deepEqual(errors, [], '화면 오류 없음');
  });
});

// 그래프 iframe은 주소가 바뀔 때 다시 뜬다 — 잰 값이 사라지는 순간(문서 교체)이 있어 한 번 더 읽는다.
async function readLegend(page) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const frame = page.frames().find((f) => /track60-graph/.test(f.url()));
    if (frame) {
      try {
        const badge = (await frame.locator('#gBadge').innerText()).trim();
        const items = await frame.locator('#legendRow .g-legend-item').count();
        const cardHidden = await frame.locator('#legendRow').evaluate((row) => {
          const card = row.closest('.g-card');
          if (!card) return null;
          return card.hidden || getComputedStyle(card).display === 'none';
        });
        return { frame, badge, items, cardHidden };
      } catch { /* 문서가 바뀌었다 — 다시 읽는다 */ }
    }
    await page.waitForTimeout(400);
  }
  throw new Error('범례를 읽지 못함(그래프 화면이 계속 바뀜)');
}

// 범례 줄 높이 — 그래프 문서가 바뀌는 순간을 피해 다시 잰다.
async function legendHeight(page) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const frame = page.frames().find((f) => /track60-graph/.test(f.url()));
    if (frame) {
      try { return await frame.evaluate(() => document.getElementById('legendRow').getBoundingClientRect().height); } catch { /* 다시 */ }
    }
    await page.waitForTimeout(400);
  }
  throw new Error('범례 높이를 재지 못함(그래프 화면이 계속 바뀜)');
}

const legendCase = (tree, want) => async () => {
  await withShell(tree, async ({ page }) => {
    await openGraph(page);
    const { frame, badge, items, cardHidden } = await readLegend(page);
    assert.match(badge, new RegExp(`묶음 ${want}\\b`), `묶음 ${want} 화면: ${badge}`);
    assert.equal(items, want, `범례 줄 수 = 묶음 수 (${want})`);
    if (want === 0) {
      assert.equal(cardHidden, true, '묶음 0이면 범례 판 자체를 숨긴다');
      assert.equal(await legendHeight(page), 0, '빈 줄 높이 0');
      if (CAPTURE_DIR) { mkdirSync(CAPTURE_DIR, { recursive: true }); await page.screenshot({ path: path.join(CAPTURE_DIR, 'graph-legend-0.png') }); }
    } else {
      assert.equal(cardHidden, false, '묶음이 있으면 범례 판이 보인다');
    }
  });
};

// 0: 꼬리표 없음 → 묶음 0
test('#937 범례 — 묶음 0이면 판을 숨긴다', { skip: skip || !REQUIRE ? skip || 'LT_932_937_REQUIRE=1 일 때 실행' : false }, legendCase(chainTree(3), 0));
// 1: 두 순간이 같은 가수 꼬리표 → 묶음 1
test('#937 범례 — 묶음 1이면 줄 1개', { skip: skip || !REQUIRE ? skip || 'LT_932_937_REQUIRE=1 일 때 실행' : false }, legendCase(chainTree(3, { 0: ['가수:뉴진스'], 1: ['가수:뉴진스'] }), 1));
// 4: 네 가지 꼬리표가 각각 두 순간에 → 묶음 4
test('#937 범례 — 묶음 4면 줄 4개', { skip: skip || !REQUIRE ? skip || 'LT_932_937_REQUIRE=1 일 때 실행' : false }, legendCase(chainTree(8, {
  0: ['가수:뉴진스'], 1: ['가수:뉴진스'],
  2: ['노래:Super Shy'], 3: ['노래:Super Shy'],
  4: ['무대:뮤직뱅크'], 5: ['무대:뮤직뱅크'],
  6: ['가수:아일릿'], 7: ['가수:아일릿'],
}), 4));
