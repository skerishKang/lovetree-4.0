import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { serve } from './helpers/screen-audit.mjs';

const REQUIRE = process.env.LT_GRAPH_842_REQUIRE === '1';
const CAPTURE_DIR = process.env.LT_GRAPH_CAPTURE_DIR || '';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 화면 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 화면 시험을 건너뜀'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 화면 시험을 건너뜀';

const MOMENTS = [
  { id: 'm1', date: '2026-11-18', title: '', url: '', keywords: [] },
  { id: 'm2', date: '2016-10-16', title: 'BTS 피 땀 눈물 무대 직캠', url: '', keywords: [] },
  { id: 'm3', date: '2026-11-17', title: '마지막으로 담은 순간', url: '', keywords: [] }
];
const TREE = { id: 't-842', name: '그래프 시험', moments: MOMENTS };

function host(inner) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body>
<script>window.__requests=[];window.addEventListener('message',e=>{if(e.data&&e.data.type==='lt-suggest-request')window.__requests.push(e.data);});window.LT41={source:'file',writable:false,owned:true,momentId:'m1',prefs:{},tree:${JSON.stringify(TREE)},trees:[${JSON.stringify(TREE)}]};</script>
<iframe src="${inner}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;
}

async function openGraph(browser, origin) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto(`${origin}/graph-host.html`);
  const frame = page.frameLocator('iframe');
  await frame.locator('#gBadge').waitFor();
  return { page, frame };
}

test('#842·#841 그래프 선반 목록과 제안 단추 — 숫자로 판정', { skip: skip || !REQUIRE ? skip || 'LT_GRAPH_842_REQUIRE=1 일 때 실행' : false }, async () => {
  const server = await serve({
    '/graph-host.html': host('/v41/views/graph/track60-graph.html'),
    '/proto-host.html': host('/v41/prototypes/graph-view.html')
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { page, frame } = await openGraph(browser, origin);
    assert.equal(await page.evaluate(() => window.__requests.length), 0, '클릭 전 제안 요청 0건');

    const cta = frame.locator('#gEmpty .g-empty-cta');
    if (await cta.count()) await cta.click();
    else await frame.locator('#shelfHint').click();
    await frame.locator('#detailCard li').first().waitFor();

    const listText = await frame.locator('#detailCard').innerText();
    const reqCount = await page.evaluate(() => window.__requests.length);
    const candidates = await frame.locator('#detailCard li').count();
    assert.equal((listText.match(/undefined/g) || []).length, 0, '목록에 undefined 0개');
    assert.equal((listText.match(/, ,/g) || []).length, 0, '목록에 ", ," 0개');
    assert.equal(reqCount, 1, '단추 클릭 당 제안 요청 1건');
    assert.ok(candidates >= 1 && candidates <= 3, `제안 후보 ${candidates}건`);
    assert.match(listText, /제목 없음|날짜| · /, '날짜 · 제목 형태');

    if (CAPTURE_DIR) {
      mkdirSync(CAPTURE_DIR, { recursive: true });
      await page.screenshot({ path: path.join(CAPTURE_DIR, '01-shelf-list.png') });
    }

    const proto = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
    await proto.goto(`${origin}/proto-host.html`);
    await proto.evaluate(() => { window.__requests = []; });
    await proto.locator('iframe').contentFrame().locator('#shelfHint').click();
    await proto.locator('iframe').contentFrame().locator('#detailCard li').first().waitFor();
    const protoText = await proto.locator('iframe').contentFrame().locator('#detailCard').innerText();
    const protoReq = await proto.evaluate(() => window.__requests.length);
    const protoCandidates = await proto.locator('iframe').contentFrame().locator('#detailCard li').count();
    assert.equal((protoText.match(/undefined/g) || []).length, 0);
    assert.equal((protoText.match(/, ,/g) || []).length, 0);
    assert.equal(protoReq, 1, '시안 단추도 제안 요청 1건');
    assert.ok(protoCandidates >= 1, '시안 제안 후보 1건 이상');
    if (CAPTURE_DIR) await proto.screenshot({ path: path.join(CAPTURE_DIR, '02-suggest-result.png') });

    console.log(JSON.stringify({ listText: listText.slice(0, 400), reqCount, candidates, protoReq, protoCandidates, protoText: protoText.slice(0, 200) }));
    await proto.close();
    await page.close();
  } finally {
    await browser.close();
    await new Promise((ok) => server.close(ok));
  }
});
