import { listenOnSafePort } from './helpers/safe-port.mjs';
// #583 부채꼴 나무·'이 순간 열기' — 지도 화면 실브라우저 시험.
// 평평한 트리(첫 순간 하나에 25개가 이어진 모양, 대표 트리와 같다)에서 그물 보기가 묶음 칸으로
// 쪼개지 않고 한 고리에 펼쳐 겹침 0인지, 주소 약속(?open=<순간> — 셸이 #my/network?moment=…로
// 열 때 붙인다)으로 열면 그 순간이 고른 상태로 화면 가운데에 오는지 잰다.
// 크롬이 없는 곳에서는 건너뛰고, LT_MAP_FAN_REQUIRE=1(미리보기 검사)에서는 건너뜀을 실패로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flat26, lt41Stub } from './helpers/map-shapes.mjs';
import { testBackNavigation } from './helpers/history-assert.mjs';
import { createTree } from '../public/v41/domain.mjs';

const ROOT = path.resolve(process.env.LT_MAP_FAN_ROOT || fileURLToPath(new URL('../public', import.meta.url)));
const REQUIRE = process.env.LT_MAP_FAN_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 지도 부채꼴 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 지도 부채꼴 시험을 건너뜀'; }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
async function serve() {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    for (const file of [path.join(ROOT, clean), path.join(ROOT, clean, 'index.html')]) {
      if (path.relative(ROOT, file).startsWith('..')) continue;
      try {
        if (!(await stat(file)).isFile()) continue;
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
        createReadStream(file).pipe(res); return;
      } catch {}
    }
    res.writeHead(404); res.end('not found');
  });
  await listenOnSafePort(server, '127.0.0.1');
  return server;
}
// 지도 한 장을 셸 없이 직접 연다(셸이 LT41로 넘기는 문맥을 같은 모양으로 심는다).
async function openMap(browser, base, { width, query = '' }) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 852 : 900 }, reducedMotion: 'reduce', locale: 'ko-KR' });
  await ctx.addInitScript(({ stub }) => {
    try { localStorage.setItem('lt41.theme', 'night'); localStorage.setItem('lt41.boardTheme', 'night'); } catch {}
    window.LT41 = stub;
  }, { stub: lt41Stub(flat26(), 'm01') });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  await page.goto(`${base}/v41/views/track56-network.html${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__lt?.dots?.().length > 0, null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}
// 화면에 실제로 그린 점·이름표를 읽어 겹침·잘림을 잰다(단언은 화면 기준 — 배치 함수의 자기 평가가 아니다).
async function measure(page) {
  return page.evaluate(() => {
    const lt = window.__lt, box = lt.box(), dots = lt.dots(), labels = lt.labels();
    let dotOverlaps = 0;
    for (let i = 0; i < dots.length; i++) for (let j = i + 1; j < dots.length; j++) {
      if (Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y) < dots[i].r + dots[j].r + 1) dotOverlaps++;
    }
    let labelOverlaps = 0, labelClipped = 0, labelOnDot = 0;
    for (let i = 0; i < labels.length; i++) {
      const a = labels[i].rect;
      if (a.l < box.x - 2 || a.r > box.x + box.w + 2 || a.t < box.y - 2 || a.b > box.y + box.h + 2) labelClipped++;
      if (dots.some(d => { const cx = Math.max(a.l, Math.min(d.x, a.r)), cy = Math.max(a.t, Math.min(d.y, a.b)); return Math.hypot(d.x - cx, d.y - cy) < d.r + 1; })) labelOnDot++;
      for (let j = i + 1; j < labels.length; j++) {
        const b = labels[j].rect;
        if (a.l < b.r + 2 && a.r > b.l - 2 && a.t < b.b + 2 && a.b > b.t - 2) labelOverlaps++;
      }
    }
    const outside = dots.filter(d => d.x < box.x || d.x > box.x + box.w || d.y < box.y || d.y > box.y + box.h).length;
    return { dots: dots.length, labels: labels.length, dotOverlaps, labelOverlaps, labelClipped, labelOnDot, outside, scale: lt.state.scale };
  });
}

test('평평한 26순간: 그물 보기가 한 고리(부채꼴)로 펼쳐 노드·이름표 겹침 0, 처음 보기는 화면에 맞게', { skip: REQUIRE ? false : skip, timeout: 120000 }, async () => {
  if (skip) assert.fail(`CI에서는 지도 부채꼴 시험 건너뜀이 실패다 — ${skip}`);
  const server = await serve(), base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const { ctx, page, errors } = await openMap(browser, base, { width });
      try {
        assert.deepEqual(errors, [], `페이지 오류 없이 떠야 한다(${width})`);
        const lt = await page.evaluate(() => ({ fan: window.__lt.fan(), mode: window.__lt.state.mode, selected: window.__lt.state.selected?.id || null }));
        assert.equal(lt.fan, true, `한 순간에 25개가 이어진 나무는 부채꼴 배치여야 한다(${width})`);
        assert.equal(lt.mode, 'OVERVIEW', `처음 보기는 전체 보기다(${width})`);
        const m = await measure(page);
        assert.equal(m.dots, 26, `순간 26개가 모두 그려져야 한다(${width})`);
        assert.equal(m.dotOverlaps, 0, `노드 겹침 0(${width})`);
        assert.equal(m.labelOverlaps, 0, `이름표 겹침 0(${width})`);
        assert.equal(m.labelClipped, 0, `이름표 잘림 0(${width})`);
        assert.equal(m.labelOnDot, 0, `이름표가 점 위에 겹치지 않는다(${width})`);
        assert.equal(m.outside, 0, `처음 보기에서 모든 순간이 화면 안이다(${width})`);
        assert.equal(m.scale, 1, `처음 보기는 화면에 맞게(배율 1)(${width})`);
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); server.close(); }
});

test("'이 순간 열기': ?open=<순간>으로 열면 그 순간이 고른 상태로 화면 가운데, 없으면 예전대로 전체 보기", { skip: REQUIRE ? false : skip, timeout: 120000 }, async () => {
  if (skip) assert.fail(`CI에서는 지도 부채꼴 시험 건너뜀이 실패다 — ${skip}`);
  const server = await serve(), base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { ctx, page, errors } = await openMap(browser, base, { width: 1440, query: '?open=m13' });
    try {
      assert.deepEqual(errors, [], '페이지 오류 없이 떠야 한다');
      const st = await page.evaluate(() => ({
        selected: window.__lt.state.selected?.id || null,
        mode: window.__lt.state.mode,
        detailOpen: document.getElementById('detail').classList.contains('open'),
        box: window.__lt.box(),
        dot: window.__lt.dots().find(d => d.id === 'm13') || null
      }));
      assert.equal(st.selected, 'm13', '주소가 가리킨 순간이 고른 상태여야 한다');
      assert.equal(st.mode, 'MOMENT_FOCUS', '고른 순간에 맞춘 모드여야 한다');
      assert.equal(st.detailOpen, true, '고른 순간의 상세 판이 열려야 한다');
      assert.ok(st.dot, '고른 순간이 화면에 그려져야 한다');
      const cx = st.box.x + st.box.w / 2, cy = st.box.y + st.box.h / 2;
      assert.ok(Math.abs(st.dot.x - cx) <= 30 && Math.abs(st.dot.y - cy) <= 30, `고른 순간이 화면 가운데여야 한다 — 점 (${Math.round(st.dot.x)},${Math.round(st.dot.y)}) / 상자 가운데 (${Math.round(cx)},${Math.round(cy)})`);
    } finally { await ctx.close(); }
    // ?open=이 없으면 예전대로: 전체 보기(배율 1)로 뜨고 상세는 닫혀 있다.
    const plain = await openMap(browser, base, { width: 1440 });
    try {
      const st = await plain.page.evaluate(() => ({
        mode: window.__lt.state.mode, scale: window.__lt.state.scale,
        detailOpen: document.getElementById('detail').classList.contains('open'),
        selected: window.__lt.state.selected?.id || null
      }));
      assert.equal(st.mode, 'OVERVIEW', '그냥 열면 전체 보기다');
      assert.equal(st.scale, 1, '그냥 열면 화면에 맞게(배율 1)이다');
      assert.equal(st.detailOpen, false, '그냥 열면 상세 판은 닫혀 있다');
      assert.equal(st.selected, 'm01', '셸이 고른 순간(첫 순간)은 선택으로 남는다(예전 동작)');
    } finally { await plain.ctx.close(); }
  } finally { await browser.close(); server.close(); }
});

// #952: 예전에 소스 글자(파일 문자열)를 보던 단정을 화면 결과로 바꾼 시험.
// ① 첫 로드에 안내가 흐려지지 않음 · ③ 연결 이유 툴팁(있는 이유/빈 이유) · 낭독기 속성 ·
// 눌린 보기 단추(계산된 색) · 오른쪽 진행 막대 숨김 · 키보드 이동·Enter 로 상세 판.
test('#366 지도 화면 결과: 안내 불투명·연결 이유 툴팁·눌린 보기 단추·진행 막대 숨김·키보드 이동', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(`CI에서는 지도 부채꼴 시험 건너뜀이 실패다 — ${skip}`);
  const server = await serve(), base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { ctx, page, errors } = await openMap(browser, base, { width: 1440 });
    try {
      assert.deepEqual(errors, [], '페이지 오류 없이 떠야 한다');

      // ① 첫 로드에 맨 위 한 줄 안내가 흐려지지 않는다(자동 맞춤이 안내를 덮지 않는다).
      const hero = await page.evaluate(() => {
        const el = document.querySelector('.hero');
        return { opacity: Number(getComputedStyle(el).opacity), dim: el.classList.contains('dim') };
      });
      assert.equal(hero.dim, false, '첫 로드에 안내가 흐려지지 않는다(dim 없음)');
      assert.ok(hero.opacity >= 0.9, `안내 불투명도 ${hero.opacity} ≥ 0.9`);

      // ③ 이유가 있는 순간에 올리면 그 이유가 뜨고, 이유가 비면 뜨지 않는다.
      const targets = await page.evaluate(() => {
        const lt = window.__lt;
        const reasonOf = (id) => {
          const e = lt.edges.find((x) => x.b === id && String(x.reason || '').trim());
          return e ? String(e.reason).trim() : '';
        };
        const dots = lt.dots();
        const withReason = dots.find((d) => d.id !== 'm01' && reasonOf(d.id));
        const without = dots.find((d) => !reasonOf(d.id));
        return {
          withReason: withReason ? { x: withReason.x, y: withReason.y, text: reasonOf(withReason.id) } : null,
          without: without ? { x: without.x, y: without.y } : null
        };
      });
      assert.ok(targets.withReason && targets.without, '이유가 있는 순간과 없는 순간이 모두 그려져 있다');
      const tip = () => page.evaluate(() => {
        const el = document.getElementById('edgeTip');
        return { text: (el.textContent || '').trim(), show: el.classList.contains('show') };
      });
      await page.mouse.move(targets.withReason.x, targets.withReason.y);
      await page.waitForTimeout(300);
      const shown = await tip();
      assert.equal(shown.show, true, '이유가 있는 순간에 올리면 툴팁이 뜬다');
      assert.equal(shown.text, targets.withReason.text, `툴팁이 그 연결 이유를 보여 준다 (${shown.text})`);
      await page.mouse.move(targets.without.x, targets.without.y);
      await page.waitForTimeout(300);
      assert.equal((await tip()).show, false, '이유가 비면 툴팁을 띄우지 않는다');

      // 낭독기: 툴팁은 상태 알림으로 읽히고(aria-hidden 아님), 캔버스가 초점·설명을 갖는다.
      const a11y = await page.evaluate(() => {
        const el = document.getElementById('edgeTip'), canvas = document.getElementById('stage');
        return {
          role: el.getAttribute('role'), live: el.getAttribute('aria-live'), hidden: el.getAttribute('aria-hidden'),
          described: canvas.getAttribute('aria-describedby'), tab: canvas.getAttribute('tabindex')
        };
      });
      assert.equal(a11y.role, 'status', '툴팁은 상태 알림');
      assert.equal(a11y.live, 'polite', '낭독기가 읽는다');
      assert.equal(a11y.hidden, null, 'aria-hidden 으로 숨기지 않는다');
      assert.equal(a11y.described, 'mapKbHint', '캔버스가 키보드 안내와 이어져 있다');
      assert.equal(a11y.tab, '0', '캔버스가 키보드 초점을 받는다');

      // 지금 고른 보기 단추는 색으로 구분되고, 오른쪽 진행 막대(빈 띠)는 보이지 않는다.
      const chrome = await page.evaluate(() => {
        const on = document.getElementById('viewNet'), off = document.getElementById('viewConc');
        return {
          pressed: on.getAttribute('aria-pressed'),
          onBg: getComputedStyle(on).backgroundColor, offBg: getComputedStyle(off).backgroundColor,
          rail: getComputedStyle(document.querySelector('.progress-rail')).display
        };
      });
      assert.equal(chrome.pressed, 'true', '그물 보기가 눌린 상태');
      assert.notEqual(chrome.onBg, chrome.offBg, `눌린 보기 단추가 색으로 구분된다 (${chrome.onBg} / ${chrome.offBg})`);
      assert.equal(chrome.rail, 'none', '오른쪽 진행 막대는 숨긴다');

      // 누름(탭)으로 바로 고르면 그 이유를 고정(pinned)으로 띄운다 — 손을 떼고 조금 지나도 남는다.
      await page.mouse.move(targets.withReason.x, targets.withReason.y);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(400);
      const pinned = await tip();
      assert.equal(pinned.show, true, '누름(탭)으로 고른 순간의 이유가 뜬다');
      assert.equal(pinned.text, targets.withReason.text);
      await page.waitForTimeout(3400);
      assert.equal((await tip()).show, false, '고정된 이유는 잠시 뒤 스스로 사라진다(3.2초)');

      // 키보드: 방향키로 고른 순간이 옮겨 가고, 길이 밝혀지고, Enter 로 상세 판이 열리고, Escape 로 닫는다.
      const before = await page.evaluate(() => window.__lt.state.selected?.id || null);
      await page.locator('#stage').focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);
      const afterKey = await page.evaluate(() => ({ id: window.__lt.state.selected?.id || null, mode: window.__lt.state.mode }));
      assert.notEqual(afterKey.id, before, `방향키로 고른 순간이 옮겨 간다 (${before} → ${afterKey.id})`);
      assert.equal(afterKey.mode, 'MOMENT_FOCUS', '방향키로 고르면 그 순간에 맞춘다');
      assert.ok(await page.evaluate(() => window.__lt.state.pathEdges.size > 0), '방향키로 고른 순간까지 지나온 길이 밝혀진다');
      // 키보드로 초점을 받으면 테두리가 보인다(:focus-visible 규칙이 살아 있다).
      const ring = await page.evaluate(() => {
        const c = document.getElementById('stage');
        const cs = getComputedStyle(c);
        return { visible: c.matches(':focus-visible'), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) || 0 };
      });
      assert.equal(ring.visible, true, '키보드 초점이면 :focus-visible 이 맞는다');
      assert.equal(ring.style, 'solid', '초점 테두리가 보인다');
      assert.ok(ring.width >= 1, `초점 테두리 두께 ${ring.width}px`);
      // Home·End 는 처음/마지막 순간으로 간다.
      await page.keyboard.press('End');
      await page.waitForTimeout(250);
      const end = await page.evaluate(() => window.__lt.state.selected?.id || null);
      await page.keyboard.press('Home');
      await page.waitForTimeout(250);
      const home = await page.evaluate(() => window.__lt.state.selected?.id || null);
      assert.equal(home, 'm01', 'Home 은 첫 순간으로');
      assert.notEqual(end, home, 'End 는 마지막 순간으로');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => document.getElementById('detail').classList.contains('open')), true, 'Enter 로 상세 판이 열린다');
      // #951 ⑤: Esc는 먼저 열린 상세 판을 닫는다(초점은 누른 순간으로). 판이 닫힌 뒤의 Esc가 선택을 푼다.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => document.getElementById('detail').classList.contains('open')), false, 'Escape 로 상세 판이 닫힌다');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const afterEsc = await page.evaluate(() => ({
        id: window.__lt.state.selected?.id || null,
        mode: window.__lt.state.mode,
        tip: document.getElementById('edgeTip').classList.contains('show')
      }));
      assert.equal(afterEsc.id, null, 'Escape 로 고른 순간을 놓는다');
      assert.equal(afterEsc.mode, 'OVERVIEW', 'Escape 뒤에는 전체 보기');
      assert.equal(afterEsc.tip, false, 'Escape 로 툴팁도 닫힌다');
    } finally { await ctx.close(); }
  } finally { await browser.close(); server.close(); }
});

test('#1378 지도 영상: 상세와 크게 보기 390·1440 × 밤·정원', {skip: REQUIRE ? false : skip, timeout: 180000}, async () => {
  if(skip) assert.fail(skip);
  const {inspectYoutubeIframe,countYoutubeAutoplay}=await import('./helpers/youtube-embed-audit.mjs');
  const shape=flat26(), url='https://youtu.be/dQw4w9WgXcQ';
  shape.moments[0].url=url;
  const server=await serve(), base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  try{
    for(const width of [390,1440]) for(const theme of ['night','garden']){
      const ctx=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});
      const stub=lt41Stub(shape,'m01');delete stub.tree.demoData;stub.source='server';stub.writable=true;stub.owned=true;
      await ctx.addInitScript(({stub,theme})=>{
        localStorage.setItem('lt41.theme',theme);
        localStorage.setItem('lt41.boardTheme',theme==='garden'?'paper':'night');
        window.LT41=stub;
      },{stub,theme});
      await ctx.route('**/track56-network.html*',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replace('<body>','<body data-member="in" data-record-source="server">')});});
      await ctx.route('**/i.ytimg.com/**',r=>r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#92829f"/></svg>'}));
      await ctx.route('**/www.youtube-nocookie.com/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<title>YouTube</title>'}));
      await ctx.route('**/api/youtube/oembed*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"title":"영상"}'}));
      const page=await ctx.newPage();
      try{
        await page.goto(base+'/v41/views/track56-network.html?open=m01',{waitUntil:'load'});
        await page.waitForSelector('#detail.open',{timeout:20000});
        await page.waitForFunction(()=>!!document.querySelector('#detailPlayer .lt-media'),null,{timeout:10000});
        const capture=process.env.LT_MAP_YT_CAPTURE_DIR;
        if(capture){const fs=await import('node:fs');fs.mkdirSync(capture,{recursive:true});await page.screenshot({path:path.join(capture,'before-'+width+'-'+theme+'.png')});}
        const detail=page.locator('#detailPlayer'), play=detail.locator('[data-lt-play]');
        assert.equal(await play.count(),1,'상세 썸네일');
        assert.equal(await detail.locator('iframe').count(),0,'상세 초기 iframe 0');
        await play.focus();await play.press('Enter');
        await page.waitForSelector('#ltViewer.open',{timeout:8000});
        assert.equal(await detail.locator('iframe').count(),0,'상세 iframe 0');
        await page.waitForSelector('#viewerMedia iframe.lt-yt-frame',{timeout:10000});
        const iframe=page.locator('#viewerMedia iframe.lt-yt-frame');
        await iframe.scrollIntoViewIfNeeded();
        const m=await inspectYoutubeIframe(iframe);
        console.log('MAP_PLAYER',JSON.stringify({width,theme,w:m.width,h:m.height,blocked:m.blocked}));
        assert.equal(m.minimum200,true,width+'/'+theme+': 크기 '+m.width+'×'+m.height);
        assert.equal(m.blocked,0,width+'/'+theme+': 9지점 가림 '+m.blockers.join(','));
        assert.ok(await countYoutubeAutoplay(page)<=1,'자동재생 최대 1');
        if(capture)await page.screenshot({path:path.join(capture,'after-'+width+'-'+theme+'.png')});
        if(width===390)await page.locator('#closeViewer').click();
        else await page.keyboard.press('Escape');
        assert.equal(await page.locator('#ltViewer.open').count(),0,'창 닫힘');
        assert.equal(await page.locator('#viewerMedia iframe').count(),0,'닫은 뒤 iframe 0');
      }finally{await ctx.close();}
    }
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});

test('#1378 지도 영상: 임베드 차단 시 iframe 제거와 원본 링크', {skip: REQUIRE ? false : skip, timeout: 90000}, async () => {
  if(skip) assert.fail(skip);
  const shape=flat26(), url='https://youtu.be/dQw4w9WgXcQ';
  shape.moments[0].url=url;
  const server=await serve(),base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  try{
    const stub=lt41Stub(shape,'m01');delete stub.tree.demoData;stub.source='server';stub.writable=true;
    await ctx.addInitScript(s=>{localStorage.setItem('lt41.theme','garden');localStorage.setItem('lt41.boardTheme','paper');window.LT41=s;},stub);
    await ctx.route('**/track56-network.html*',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replace('<body>','<body data-member="in" data-record-source="server">')});});
    await ctx.route('**/i.ytimg.com/**',r=>r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"/>'}));
    await ctx.route('**/api/youtube/oembed*',r=>r.fulfill({status:401,contentType:'application/json',body:'{"error":"youtube_embed_forbidden"}'}));
    await ctx.route('**/www.youtube-nocookie.com/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<title>Video</title>'}));
    const page=await ctx.newPage();
    await page.goto(base+'/v41/views/track56-network.html?open=m01',{waitUntil:'load'});
    await page.waitForSelector('#detailPlayer [data-lt-play]',{timeout:20000});
    await page.locator('#detailPlayer [data-lt-play]').click({force:true});
    await page.waitForSelector('#viewerMedia .lt-media-noembed-link',{timeout:10000});
    assert.equal(await page.locator('#viewerMedia iframe').count(),0,'차단 뒤 iframe 제거');
    assert.equal(await page.locator('#viewerMedia .lt-media-noembed-link[href*="youtube.com"]').count(),1,'원본 링크 1개');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#viewerMedia iframe').count(),0,'닫은 뒤 iframe 0');
    assert.equal(await page.locator('#ltViewer.open').count(),0,'Esc로 닫힘');
  }finally{await ctx.close();await browser.close();await new Promise(r=>server.close(r));}
});

// #1298: 지도 영상 크게 보기 — 뒤로 가기 한 번으로 닫히고 상세 판은 그대로 남는다.
test('#1298 지도 영상 크게 보기 뒤로 가기: 창 닫힘·iframe 0·상세 판 유지(390·1440)', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const tree = createTree({ subject: '시험', title: '시험 순간', date: '2026-11-20', emotion: '설렘', note: '', url: 'https://youtu.be/dQw4w9WgXcQ' }, '2026-11-20T00:00:00.000Z');
  const workspace = { revision: 1, state: { version: 1, trees: [tree], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-20T00:00:00.000Z' };
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'no-preference' });
      try {
        await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
        await ctx.route('**/api/account**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"email":"measure@example.invalid","subject":"시험계정"}' }));
        await ctx.route('**/api/workspace**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workspace) }));
        await ctx.route('**/i.ytimg.com/**', r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#92829f"/></svg>' }));
        await ctx.route('**/www.youtube-nocookie.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>YouTube</title>' }));
        await ctx.route('**/api/youtube/oembed*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"title":"영상"}' }));
        const page = await ctx.newPage();
        await page.goto(base + '/v41/?account=1#home', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 30000 });
        await page.locator('#discover-ask-no').click().catch(() => {});
        await page.evaluate(() => document.querySelector('[data-view="track56-network.html"]').click());
        await page.waitForFunction(() => { const f = document.querySelector('#view:not([hidden])'); try { return !!f && /track56-network/.test(f.contentWindow.location.href); } catch { return false; } }, null, { timeout: 20000 });
        const frame = await (await page.$('#view:not([hidden])')).contentFrame();
        await frame.waitForFunction(() => !!window.__lt?.selectMoment, null, { timeout: 20000 });
        await frame.evaluate(() => window.__lt.selectMoment(window.__lt.nodes.find(n => n.kind === 'moment'), true));
        await frame.waitForSelector('#detail.open', { timeout: 10000 });
        await frame.waitForFunction(() => !!document.querySelector('#detailPlayer .lt-media .lt-media-body'), null, { timeout: 10000 });
        await page.waitForTimeout(600);
        await testBackNavigation(page, { frame, recorded: true, panels: ['#ltViewer.open'], settleMs: 400, timeoutMs: 10000, action: async () => {
          await frame.evaluate(() => document.querySelector('#detailPlayer [data-lt-play]').click());
          await frame.waitForSelector('#ltViewer.open', { timeout: 8000 });
        } });
        const after = await frame.evaluate(() => ({ open: document.getElementById('ltViewer').classList.contains('open'), iframes: document.querySelectorAll('#viewerMedia iframe').length, detail: document.getElementById('detail').classList.contains('open') }));
        assert.equal(after.open, false, '뒤로 가기로 크게 보기가 닫힌다');
        assert.equal(after.iframes, 0, '뒤로 가기 뒤 iframe 0');
        assert.equal(after.detail, true, '상세 판은 그대로 열려 있다');
        console.log('MAP_BACK', width, JSON.stringify(after));
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
});
