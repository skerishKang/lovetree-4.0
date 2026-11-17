import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { serve } from './helpers/screen-audit.mjs';

const REQUIRE = process.env.LT_GRAPH_842_REQUIRE === '1';
const CAPTURE_DIR = process.env.LT_GRAPH_CAPTURE_DIR_V2 || '';
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

const HOST = `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body>
<script>window.__requests=[];window.__tagsOpened=false;window.__candidates=[];window.LT41={source:'file',writable:false,owned:true,momentId:'m1',prefs:{},tree:${JSON.stringify(TREE)},trees:[${JSON.stringify(TREE)}]};</script>
<script type="module">
import { suggestForTree } from '/v41/tag-model.mjs';
const frame=document.querySelector('iframe');
addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==frame.contentWindow)return;
  if(e.data?.type==='lt-suggest-request')window.__requests.push(e.data);
  if(e.data?.type==='lt41-open-tags'){
    window.__tagsOpened=true;
    window.__candidates=suggestForTree(window.LT41.tree);
    const panel=document.getElementById('fake-tag-panel');panel.replaceChildren();
    const h=document.createElement('h3');h.textContent='꼬리표 정리';
    const p=document.createElement('p');p.textContent='후보 '+window.__candidates.length+'건';panel.append(h,p);
    for(const row of window.__candidates){
      const b=document.createElement('button');b.type='button';b.className='fake-save';
      b.dataset.moment=row.momentId;b.textContent='저장 · '+(row.title||'제목 없음');
      b.addEventListener('click',()=>{
        const keywords=['가수:BTS'];
        const others=window.LT41.tree.moments.filter(x=>x.id!==row.momentId&&!(x.keywords||[]).length).slice(0,1).map(x=>x.id);
        for(const id of [row.momentId,...others]){
          const m=window.LT41.tree.moments.find(x=>x.id===id);if(m)m.keywords=keywords;
          frame.contentWindow.postMessage({type:'lt41-tags-saved',ok:true,momentId:id,keywords},location.origin);
        }
      });
      panel.append(b);
    }
    panel.hidden=false;
  }
});
</script>
<iframe src="/v41/views/graph/track60-graph.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe>
<div id="fake-tag-panel" hidden style="position:fixed;right:8px;top:8px;z-index:99;background:#222;color:#fff;padding:8px"></div>
</body></html>`;

const PROTO_HOST = `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body>
<script>window.__requests=[];window.addEventListener('message',e=>{if(e.data&&e.data.type==='lt-suggest-request')window.__requests.push(e.data);});</script>
<iframe src="/v41/prototypes/graph-view.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

test('#842·#841 v2 — 문구·정리 판 연결·숫자', { skip: skip || !REQUIRE ? skip || 'LT_GRAPH_842_REQUIRE=1 일 때 실행' : false }, async () => {
  const server = await serve({ '/graph-host.html': HOST, '/proto-host.html': PROTO_HOST });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.goto(`${origin}/graph-host.html`);
    const frame = page.frameLocator('iframe');
    await frame.locator('#gBadge').waitFor();
    assert.equal((await frame.locator('#gBadge').innerText()).trim(), '순간 3 · 묶음 0');
    assert.equal(await page.evaluate(() => window.__tagsOpened), false);

    const cta = frame.locator('#gEmpty .g-empty-cta');
    if (await cta.count()) await cta.click(); else await frame.locator('#shelfHint').click();
    await frame.locator('#detailCard li').first().waitFor();

    const noteText = (await frame.locator('#detailCard .d-memo').innerText()).trim();
    const headText = (await frame.locator('#detailCard .d-kicker').innerText()).trim();
    const items = await frame.locator('#detailCard li').count();
    const fontNote = await frame.locator('#detailCard .d-memo').evaluate((el) => getComputedStyle(el).fontFamily);
    const fontCard = await frame.locator('.g-card').first().evaluate((el) => getComputedStyle(el).fontFamily);
    const reqCount = await page.evaluate(() => window.__requests.length);
    const tagsOpened = await page.evaluate(() => window.__tagsOpened);
    const candidates = await page.evaluate(() => window.__candidates.length);
    assert.equal(noteText, '제안을 고르면 바로 붙어요.');
    assert.equal(fontNote, fontCard, '판 설명 글꼴은 판의 다른 글과 같다');
    assert.equal(items, 3, '목록 항목 3개 = 제목 수 3');
    assert.match(headText, /아직 묶음에 안 든 순간 3/);
    assert.equal((headText.match(/undefined/g) || []).length, 0);
    assert.equal(reqCount, 1, '제안 요청 1건');
    assert.equal(tagsOpened, true, '정리 판 열림');
    assert.ok(candidates >= 1, `정리 판 후보 ${candidates}건`);

    if (CAPTURE_DIR) { mkdirSync(CAPTURE_DIR, { recursive: true }); await page.screenshot({ path: path.join(CAPTURE_DIR, '01-v2-shelf-list.png') }); }

    const saves = page.locator('.fake-save');
    const n = Math.min(2, await saves.count());
    for (let i = 0; i < n; i++) await saves.nth(i).click();
    await page.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.getElementById('gBadge')?.textContent?.includes('묶음 1'), null, { timeout: 10000 });
    const badgeAfter = (await frame.locator('#gBadge').innerText()).trim();
    assert.equal(badgeAfter, '순간 3 · 묶음 1', '저장 뒤 묶음 수 0 → 1');
    if (CAPTURE_DIR) await page.screenshot({ path: path.join(CAPTURE_DIR, '02-v2-hub-updated.png') });

    const proto = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
    await proto.goto(`${origin}/proto-host.html`);
    const pframe = proto.frameLocator('iframe');
    await pframe.locator('#shelfHint').click();
    await pframe.locator('#detailCard li').first().waitFor();
    const protoHead = (await pframe.locator('#detailCard .d-kicker').innerText()).trim();
    const protoShelf = (await pframe.locator('#shelfLabel').innerText()).trim();
    const protoNote = (await pframe.locator('#detailCard .d-memo').innerText()).trim();
    const protoReq = await proto.evaluate(() => window.__requests.length);
    assert.equal(protoNote, '제안을 고르면 바로 붙어요.');
    assert.equal(protoReq, 1);
    assert.equal((protoHead.match(/\d+/g) || [])[0], (protoShelf.match(/\d+/g) || [])[0], '시안의 두 수가 같은 기준');
    if (CAPTURE_DIR) await proto.screenshot({ path: path.join(CAPTURE_DIR, '03-v2-prototype.png') });

    console.log(JSON.stringify({ noteText, headText, items, fontNote, reqCount, tagsOpened, candidates, badgeAfter, protoHead, protoShelf, protoReq }));
    await proto.close();
    await page.close();
  } finally {
    await browser.close();
    await new Promise((ok) => server.close(ok));
  }
});
