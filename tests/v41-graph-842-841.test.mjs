import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRE = process.env.LT_GRAPH_842_REQUIRE === '1';
const CAPTURE_DIR = process.env.LT_GRAPH_CAPTURE_DIR_V3 || '';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 화면 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 화면 시험을 건너뜀'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 화면 시험을 건너뜀';

const THUMB = (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });

function fixtureTree() {
  let tree = createTree({ subject: '그래프 시험', title: '그래프 시험', note: '', emotion: '설렘', date: '2026-11-18', url: '' }, '2026-11-18T00:00:00Z');
  tree.moments[0].title = 'BTS 첫 무대';
  tree.moments[0].keywords = ['가수:BTS'];
  tree = addMoment(tree, { title: '다른 곡 무대', note: '', emotion: '설렘', date: '2026-11-17', url: '' }, tree.moments[0].id, '2026-11-18T00:00:01Z');
  tree.moments[1].keywords = ['노래:다른 곡'];
  tree = addMoment(tree, { title: 'BTS 피 땀 눈물 무대 직캠', note: '', emotion: '설렘', date: '2016-10-16', url: '' }, tree.moments[0].id, '2026-11-18T00:00:02Z');
  return tree;
}

test('#842·#841 v3 — 실제 셸의 꼬리표 정리 판 연결과 저장 뒤 묶음', { skip: skip || !REQUIRE ? skip || 'LT_GRAPH_842_REQUIRE=1 일 때 실행' : false }, async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const TREE = fixtureTree();
  const browser = await chromium.launch({ headless: true });
  let ctx;
  try {
    ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
    await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
    await ctx.route('**://i.ytimg.com/**', THUMB);
    await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    let workspace = { revision: 1, state: { version: 1, trees: [TREE], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-18T09:00:00.000Z' };
    await ctx.route('**/api/workspace**', (r) => {
      if (r.request().method() === 'PUT') {
        const body = r.request().postDataJSON() || {};
        workspace = { ...workspace, revision: workspace.revision + 1, state: body.state || workspace.state };
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision: workspace.revision, subject: workspace.subject }) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workspace) });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await page.goto(`${origin}/v41/?account=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    await page.locator('#discover-ask-no').click().catch(() => {});

    await page.locator('.tree-views [data-view="track56-network.html"]').click();
    await page.waitForFunction(() => /track56-network/.test(document.querySelector('#view')?.contentWindow?.location?.href || ''), null, { timeout: 10000 });
    const mapFrame = page.frames().find((f) => /track56-network/.test(f.url()));
    assert.ok(mapFrame, '지도 화면이 열린다');
    await mapFrame.locator('#viewGraph').waitFor();
    await page.evaluate(() => { location.hash = '#my/graph'; });
    let graph = null;
    for (let i = 0; i < 40 && !graph; i++) {
      graph = page.frames().find((f) => /track60-graph/.test(f.url()));
      if (!graph) await page.waitForTimeout(250);
    }
    assert.ok(graph, '그래프 화면이 열린다');
    await graph.locator('#gBadge').waitFor();
    assert.equal((await graph.locator('#gBadge').innerText()).trim(), '순간 3 · 묶음 0');

    const cta = graph.locator('#gEmpty .g-empty-cta');
    if (await cta.count()) await cta.click(); else await graph.locator('#shelfHint').click();

    await page.waitForFunction(() => document.querySelector('#tag-panel')?.open === true, null, { timeout: 10000 });
    const panelOpen = await page.locator('#tag-panel').evaluate((el) => el.open);
    const panelTitle = (await page.locator('#tag-panel-title').innerText()).trim();
    const renameButtons = await page.locator('#tag-list button:text-is("이름 바꾸기")').count();
    const mergeButtons = await page.locator('#tag-list button:text-is("합치기")').count();
    const suggestVisible = await page.locator('#tag-suggest-box').isVisible();
    const candidates = await page.locator('#tag-suggest-list input[type="checkbox"]').count();
    assert.equal(panelOpen, true, '진짜 꼬리표 정리 판이 열림');
    assert.equal(panelTitle, '꼬리표 정리');
    assert.equal(renameButtons, 2, '이름 바꾸기 단추 = 꼬리표 수 2');
    assert.equal(mergeButtons, 2);
    assert.equal(suggestVisible, true, '제목에서 한 번에 제안받기 펼침');
    assert.ok(candidates >= 1, `후보 ${candidates}건`);

    if (CAPTURE_DIR) { mkdirSync(CAPTURE_DIR, { recursive: true }); await page.screenshot({ path: path.join(CAPTURE_DIR, '01-v3-tag-panel-open.png') }); }

    await page.locator('#tag-suggest-list input[type="checkbox"]').first().check();
    await page.locator('#tag-suggest-save').click();
    await page.waitForFunction(() => document.querySelector('#tag-panel')?.open === false, null, { timeout: 10000 });
    const panelClosed = await page.locator('#tag-panel').evaluate((el) => !el.open);
    let after = null;
    for (let i = 0; i < 40 && !after; i++) {
      after = page.frames().find((f) => /track60-graph/.test(f.url()));
      if (!after) await page.waitForTimeout(250);
    }
    assert.ok(after, '저장 뒤 그래프 화면이 다시 열린다');
    await after.waitForFunction(() => document.getElementById('gBadge')?.textContent?.includes('묶음 1'), null, { timeout: 10000 });
    const badgeAfter = (await after.locator('#gBadge').innerText()).trim();
    assert.equal(panelClosed, true, '저장 뒤 판 닫힘');
    assert.equal(badgeAfter, '순간 3 · 묶음 1', '묶음 0 → 1');
    assert.deepEqual(errors, [], '화면 오류 없음');

    if (CAPTURE_DIR) await page.screenshot({ path: path.join(CAPTURE_DIR, '02-v3-graph-after-save.png') });
    console.log(JSON.stringify({ panelOpen, panelTitle, renameButtons, mergeButtons, suggestVisible, candidates, panelClosed, badgeAfter, errors }));
    await page.close();
  } finally {
    if (ctx) await ctx.close();
    await browser.close();
    await new Promise((ok) => server.close(ok));
  }
});
