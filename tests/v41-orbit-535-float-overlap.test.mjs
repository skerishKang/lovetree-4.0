// #535: 첫 화면 카드가 "떠 있는" 느낌 + 카드끼리 겹침 줄이기 + 끄는 동안 무거움을 실제 화면에서 잰다.
// - 떠 있음: 카드 하나의 24초 이동 폭·이동 거리. 동작 줄이기(prefers-reduced-motion)면 거의 멈춘다.
// - 유휴 그리기: 5초 동안 requestAnimationFrame 요청 수가 크게 늘지 않는다.
// - 겹침: 1440·1920·390 에서 겹친 쌍·겹친 면적 합의 최댓값, 가운데 안전 구역 침범 0.
// - 단추: 로그인·로그아웃 가운데 단추가 같은 세 자리·같은 폭·같은 간격.
// - 끄는 동안: data-lt-busy 가 켜지고, 손을 떼면 꺼지고, 관성으로 조금 더 미끄러진다.
// 로그아웃은 실제 /v41/ 예시 화면, 로그인은 같은 첫 화면(home.html)에 LT41 상태만 넣어 재현한다(계정 불필요).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 첫 화면은 vite 번들(orbit-source.css?inline·json import)이라 개발 소스를 그대로 띄울 수 없다.
// 빌드 결과(dist)를 서빙한다 — preview-check 잡은 앞 단계에서 build 를 돌린다.
const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const BUILT = path.join(REPO, 'dist');
const ROOT = path.resolve(process.env.LT_ORBIT535_ROOT || (existsSync(path.join(BUILT, 'v41', 'home.html')) ? BUILT : path.join(REPO, 'public')));
const REQUIRE = process.env.LT_ORBIT535_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 #535 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 #535 시험을 건너뜀'; }
if (!skip && !existsSync(path.join(ROOT, 'v41', 'home.html'))) skip = `빌드 결과가 없어 #535 시험을 건너뜀(${ROOT}/v41/home.html 없음 — npx vite build 필요)`;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };

// 로그인 상태 재현용 호스트: 첫 화면과 같은 문서를 띄우고 LT41(로그인·트리 3개)만 넣는다.
const HOST = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>첫 화면 호스트</title></head>
<body style="margin:0"><script>
const mk=(ti,n)=>{const id='t'+ti;const moments=[];for(let i=0;i<n;i++)moments.push({id:id+'m'+i,title:'순간 '+(i+1),note:'메모 '+(i+1),emotion:'설렘',date:'2026-0'+((i%9)+1)+'-0'+((i%9)+1),parentId:i?moments[i-1].id:null,relation:'이어서',x:100+i*40,y:120+(i%5)*30,rot:0,color:'rose',keywords:[]});
return {id,title:'트리 '+(ti+1),moments};};
const trees=[mk(0,12),mk(1,10),mk(2,8)];
window.LT41={source:'server',member:'in',writable:true,treeCount:3,trees,prefs:{},tree:trees[0]};
</script><iframe src="/v41/home.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

function serve() {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    if (clean === '/__lt535-host.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(HOST); return;
    }
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
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// 첫 화면 안쪽(orbit) 문서를 찾는다.
const frameOf = async (page) => {
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    frame = page.frames().find((f) => /home\.html/.test(f.url()));
    if (!frame) await page.waitForTimeout(250);
  }
  return frame;
};

const openHome = async (browser, base, { width, height, member, reducedMotion = 'no-preference' }) => {
  const mobile = width <= 650;
  const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, reducedMotion });
  const page = await context.newPage();
  await page.goto(`${base}${member === 'in' ? '/__lt535-host.html' : '/v41/'}`, { waitUntil: 'domcontentloaded' });
  const frame = await frameOf(page);
  assert.ok(frame, '첫 화면 안쪽 문서가 열린다');
  await page.waitForTimeout(2500);
  return { context, page, frame };
};

const s = (name, fn, opts = {}) => test(name, { skip: skip || undefined, timeout: opts.timeout || 120000 }, fn);
const lib = await (async () => {
  if (skip) return null;
  const server = await serve();
  return { server, base: `http://127.0.0.1:${server.address().port}` };
})();
test.after(() => lib?.server?.close());

if (REQUIRE && skip) throw new Error(`#535 실행 시험이 필요한데 건너뜀: ${skip}`);

// 소스 계약: 얼어 있던 위상을 벽시계(elapsed)로 돌리고, 동작 줄이기면 그대로 멈춘다.
s('#535 부유는 궤도 위상과 분리한 벽시계 시간으로 돌린다(소스 계약)', () => {
  const src = readFileSync(path.join(REPO, 'src', 'views', 'orbit.js'), 'utf8');
  assert.match(src, /elapsed\+=Math\.min\(40,dt\)\/1000/, '프레임마다 초를 쌓는다');
  assert.match(src, /x\+=Math\.sin\(elapsed\*/, '가로 부유를 elapsed 로 돌린다');
  assert.match(src, /y\+=Math\.cos\(elapsed\*/, '세로 부유를 elapsed 로 돌린다');
  assert.match(src, /phase\+=\.000018\*dt/, '궤도 회전도 눈에 보이게 올렸다(전 .000006)');
  assert.match(src, /const reduced=matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches;let paused=reduced/, '동작 줄이기면 처음부터 멈춤');
  assert.match(src, /ringsNarrow/, '좁은 화면은 원래 반지름을 그대로 쓴다');
});

s('#535 떠 있는 폭이 눈에 보이고, 동작 줄이기면 거의 멈춘다', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, frame } = await openHome(browser, lib.base, { width: 1440, height: 900, member: 'in' });
    const moved = await frame.evaluate(async () => {
      const sr = document.querySelector('main#orbit').shadowRoot;
      const cards = [...sr.querySelectorAll('.card')].filter((e) => e.style.display !== 'none');
      const el = cards[3];
      const pts = []; const t0 = performance.now();
      await new Promise((done) => {
        const tick = () => {
          const b = el.getBoundingClientRect();
          pts.push([b.left + b.width / 2, b.top + b.height / 2]);
          if (performance.now() - t0 < 24000) requestAnimationFrame(tick); else done();
        };
        tick();
      });
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      return {
        dx: Math.round(Math.max(...xs) - Math.min(...xs)),
        dy: Math.round(Math.max(...ys) - Math.min(...ys)),
        path: Math.round(pts.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0))
      };
    });
    await context.close();

    const still = await openHome(browser, lib.base, { width: 1440, height: 900, member: 'in', reducedMotion: 'reduce' });
    const quiet = await still.frame.evaluate(async () => {
      const sr = document.querySelector('main#orbit').shadowRoot;
      const el = [...sr.querySelectorAll('.card')].filter((e) => e.style.display !== 'none')[3];
      const a = el.getBoundingClientRect(); const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2;
      const t0 = performance.now();
      await new Promise((done) => { const tick = () => { if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else done(); }; tick(); });
      const b = el.getBoundingClientRect();
      return Math.round(Math.hypot(b.left + b.width / 2 - x0, b.top + b.height / 2 - y0));
    });
    await still.context.close();

    // 전(옛 코드)은 10초에 1~2px 이었다 — 카드가 "떠 있다"고 느낄 수 없는 값.
    assert.ok(moved.path >= 60, `24초 동안 카드가 눈에 보이게 움직인다(실제 ${moved.path}px)`);
    assert.ok(moved.dy >= 20, `위아래로도 떠 있는 폭이 있다(실제 ${moved.dy}px)`);
    assert.ok(moved.dy <= 80, `멀미 나지 않게 폭을 과하게 키우지 않는다(실제 ${moved.dy}px)`);
    assert.ok(quiet <= 2, `동작 줄이기면 거의 멈춘다(실제 ${quiet}px)`);
  } finally { await browser.close(); }
});

s('#535 가만히 있을 때 그리기 횟수는 크게 늘지 않는다', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page, frame } = await openHome(browser, lib.base, { width: 1440, height: 900, member: 'in' });
    await page.addInitScript(() => {});
    const before = await frame.evaluate(() => new Promise((ok) => {
      window.__raf535 = 0;
      const orig = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => { window.__raf535++; return orig(cb); };
      ok(window.__raf535);
    }));
    await page.waitForTimeout(5000);
    const drew = await frame.evaluate(() => window.__raf535);
    await context.close();
    // 전 값은 5초에 약 70~110회. 프레임 수 자체는 그대로여야 한다(늘리지 않는다).
    assert.ok(drew - before <= 400, `유휴 5초 그리기가 크게 늘지 않는다(실제 ${drew - before}회)`);
    assert.ok(drew - before >= 10, `화면이 살아 있다(실제 ${drew - before}회)`);
  } finally { await browser.close(); }
});

// 겹침: 움직이므로 여러 번 재서 최댓값을 쓴다. 가운데 안전 구역 침범은 언제나 0.
const LIMITS = {
  '1440x900': { pairs: 30, area: 280000 },
  '1920x1080': { pairs: 30, area: 285000 },
  '390x844': { pairs: 14, area: 46000 }
};

s('#535 카드끼리 겹친 면적을 줄였다(1440·1920·390, 안전 구역 침범 0)', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [tag, limit] of Object.entries(LIMITS)) {
      const [w, h] = tag.split('x').map(Number);
      for (const member of ['out', 'in']) {
        const { context, page, frame } = await openHome(browser, lib.base, { width: w, height: h, member });
        let best = { pairs: 0, area: 0, intrude: 0, cards: 0 };
        for (let round = 0; round < 8; round++) {
          const d = await frame.evaluate(() => {
            const sr = document.querySelector('main#orbit').shadowRoot;
            const rects = [];
            for (const el of sr.querySelectorAll('.card')) {
              if (el.style.display === 'none') continue;
              const r = el.getBoundingClientRect();
              if (r.width < 2 || r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
              rects.push({ l: r.left, t: r.top, r: r.right, b: r.bottom });
            }
            let pairs = 0, area = 0;
            for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
              const a = rects[i], b = rects[j];
              const iw = Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l));
              const ih = Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
              const ar = iw * ih;
              if (ar >= 400) { pairs++; area += ar; }
            }
            const c = sr.querySelector('.center');
            let intrude = 0;
            if (c) {
              const cc = c.getBoundingClientRect();
              for (const r of rects) {
                const iw = Math.max(0, Math.min(cc.right, r.r) - Math.max(cc.left, r.l));
                const ih = Math.max(0, Math.min(cc.bottom, r.b) - Math.max(cc.top, r.t));
                if (iw * ih > 1) intrude++;
              }
            }
            return { cards: rects.length, pairs, area: Math.round(area), intrude };
          });
          if (d.pairs > best.pairs || d.area > best.area) best = d;
          best.cards = Math.max(best.cards, d.cards);
          best.intrude = Math.max(best.intrude, d.intrude);
          await page.waitForTimeout(500);
        }
        await context.close();
        assert.equal(best.intrude, 0, `${tag}/${member}: 가운데 안전 구역 침범 0`);
        assert.ok(best.cards >= 9, `${tag}/${member}: 카드가 사라지지 않는다(실제 ${best.cards}장)`);
        // 전 값: 1440 269k·292k / 1920 277k·301k / 390 44k·36k
        assert.ok(best.area <= limit.area, `${tag}/${member}: 겹친 면적 합이 줄었다(실제 ${best.area}px², 한도 ${limit.area})`);
        assert.ok(best.pairs <= limit.pairs, `${tag}/${member}: 겹친 쌍이 늘지 않았다(실제 ${best.pairs}쌍, 한도 ${limit.pairs})`);
      }
    }
  } finally { await browser.close(); }
});

s('#535 로그인·로그아웃 가운데 단추가 같은 세 자리·같은 폭·같은 간격', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const shape = {};
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      for (const member of ['out', 'in']) {
        const { context, frame } = await openHome(browser, lib.base, { width: w, height: h, member });
        shape[`${w}/${member}`] = await frame.evaluate(() => {
          const sr = document.querySelector('main#orbit').shadowRoot;
          const wrap = sr.querySelector('.center .actions');
          const bs = [...wrap.querySelectorAll('button')].filter((b) => !b.hidden && b.style.display !== 'none');
          const boxes = bs.map((b) => { const r = b.getBoundingClientRect(); return { label: b.textContent, w: Math.round(r.width), h: Math.round(r.height), l: Math.round(r.left), t: Math.round(r.top) }; });
          const gaps = boxes.slice(1).map((b, i) => (b.t !== boxes[i].t ? Math.round(b.t - (boxes[i].t + boxes[i].h)) : Math.round(b.l - (boxes[i].l + boxes[i].w))));
          return { count: Number(wrap.getAttribute('data-count')), labels: boxes.map((b) => b.label), w: boxes.map((b) => b.w), h: boxes.map((b) => b.h), gaps };
        });
        await context.close();
      }
    }
    for (const w of [1440, 390]) {
      const out = shape[`${w}/out`], inSide = shape[`${w}/in`];
      assert.equal(out.count, 3, `${w}: 로그아웃 세 자리`);
      assert.equal(inSide.count, 3, `${w}: 로그인도 세 자리`);
      assert.deepEqual(inSide.labels, ['＋ 순간 추가', '둘러보기', '내 트리'], `${w}: 로그인 세 자리 문구`);
      assert.equal(new Set(inSide.w).size, 1, `${w}: 로그인 단추 폭이 같다(${inSide.w.join('/')})`);
      assert.equal(new Set(out.w).size, 1, `${w}: 로그아웃 단추 폭이 같다(${out.w.join('/')})`);
      assert.deepEqual(inSide.w, out.w, `${w}: 로그인·로그아웃 폭이 같다`);
      assert.deepEqual(inSide.h, out.h, `${w}: 로그인·로그아웃 높이가 같다`);
      assert.deepEqual(inSide.gaps, out.gaps, `${w}: 로그인·로그아웃 간격이 같다(${out.gaps.join('/')} vs ${inSide.gaps.join('/')})`);
    }
  } finally { await browser.close(); }
});

s('#535 끄는 동안만 레이어를 승격하고, 손을 떼면 관성으로 조금 더 미끄러진다', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page, frame } = await openHome(browser, lib.base, { width: 1440, height: 900, member: 'in' });
    const cdp = await context.newCDPSession(page);
    const busy = () => frame.evaluate(() => document.querySelector('main#orbit').getAttribute('data-lt-busy'));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 320, y: 760, button: 'left', clickCount: 1, pointerType: 'mouse' });
    for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 320 + i * 18, y: 760, button: 'left', buttons: 1, pointerType: 'mouse' });
    assert.equal(await busy(), '1', '끄는 동안 data-lt-busy 가 켜진다(레이어 승격·번짐 경량)');
    const will = await frame.evaluate(() => getComputedStyle(document.querySelector('main#orbit').shadowRoot.querySelector('.card')).willChange);
    assert.match(will, /transform/, '끄는 동안 transform 레이어를 미리 승격한다');
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 536, y: 760, button: 'left', clickCount: 1, pointerType: 'mouse' });
    // 관성으로 조금 더 돈다 — 뗀 직후 0.4초 동안 카드가 계속 움직인다.
    const glide = await frame.evaluate(async () => {
      const sr = document.querySelector('main#orbit').shadowRoot;
      const el = [...sr.querySelectorAll('.card')].filter((e) => e.style.display !== 'none')[2];
      const a = el.getBoundingClientRect(); const x0 = a.left + a.width / 2;
      await new Promise((r) => setTimeout(r, 400));
      const b = el.getBoundingClientRect();
      return Math.round(Math.abs(b.left + b.width / 2 - x0));
    });
    await page.waitForTimeout(2200);
    assert.equal(await busy(), null, '손을 떼고 멈추면 표시를 지워 멈춘 화면 모양을 되돌린다');
    assert.ok(glide >= 1, `손을 떼도 관성으로 조금 더 미끄러진다(실제 ${glide}px)`);
    await context.close();
  } finally { await browser.close(); }
});
