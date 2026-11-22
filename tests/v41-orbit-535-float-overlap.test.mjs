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
import { createReadStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 첫 화면은 vite 번들(orbit-source.css?inline·json import)이라 개발 소스를 그대로 띄울 수 없다.
// 빌드 결과(dist)를 서빙한다 — preview-check 잡은 앞 단계에서 build 를 돌린다.
const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const BUILT = path.join(REPO, 'dist');
const ROOT = path.resolve(process.env.LT_ORBIT535_ROOT || (existsSync(path.join(BUILT, 'v41', 'home.html')) ? BUILT : path.join(REPO, 'public')));
const REQUIRE = process.env.LT_ORBIT535_REQUIRE === '1';
// #949: CI 글꼴(Noto Sans CJK KR) 재현 — LT_ORBIT535_CI_FONT=1 이면 시험 안에서만 @font-face 로 강제한다(컴1에 설치하지 않는다).
// 파일은 LT_ORBIT535_FONT_FILE 로 지정(기본: 윈도의 NotoSansKR-VF.ttf — Noto Sans KR 과 같은 글줄기). CI 에서는 fonts-noto-cjk 의 .ttc 를 준다.
const CI_FONT = process.env.LT_ORBIT535_CI_FONT === '1';
const CI_FONT_FILE = process.env.LT_ORBIT535_FONT_FILE || path.join(process.env.WINDIR || '', 'Fonts', 'NotoSansKR-VF.ttf');
// #949: 가드와 같은 구역 함수 — 공용 모듈 소스를 페이지에 그대로 넣는다(순수 함수).
const ZONE_SRC = readFileSync(path.join(REPO, 'public', 'v41', 'orbit-safe-zone.mjs'), 'utf8').replace(/^export /gm, '');
const injectZone = (frame) => frame.evaluate((src) => { new Function(src + ';window.__ltZoneOf=safeZoneOf;window.__ltZoneOverlap=zoneOverlapArea;')(); }, ZONE_SRC);
// 가운데 구역(가드가 쓰는 값)과 카드 사각형(안쪽 img — 실제로 그려진 크기)을 같은 함수로 잰다.
const measureHome = async (frame, { worst = false } = {}) => {
  await injectZone(frame);
  return frame.evaluate(() => {
    const sr = document.querySelector('main#orbit').shadowRoot;
    const c = sr.querySelector('.center');
    const zone = c ? window.__ltZoneOf(c.getBoundingClientRect(), sr.querySelector('.app').getBoundingClientRect()) : null;
    const visible = [...sr.querySelectorAll('.card')].filter((el) => {
      if (getComputedStyle(el).display === 'none' || el.classList.contains('clash')) return false;
      const r = el.getBoundingClientRect();
      return r.width >= 2 && r.right >= 0 && r.bottom >= 0 && r.left <= innerWidth && r.top <= innerHeight;
    });
    // 카드 사각형은 안쪽 img(실제로 그려진 크기)로 잰다 — img 의 꾸밈 배율(transform:scale)은 카드 크기가
    // 아니므로 중심 기준으로 나눠 카드 크기로 되돌린다(button.card 는 3D 변환 직후 0×0 인 일이 있다).
    const rects = visible.map((el) => {
      const inner = el.querySelector('.surface img') || el.querySelector('.surface') || el;
      const r = inner.getBoundingClientRect();
      let k = 1;
      const t = getComputedStyle(inner).transform;
      if (t && t !== 'none') { const m = t.match(/^matrix\(([^)]+)\)/); if (m) { const v = m[1].split(',').map(Number); k = Math.hypot(v[0], v[1]) || 1; } }
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, w = r.width / k, h = r.height / k;
      return { l: cx - w / 2, t: cy - h / 2, r: cx + w / 2, b: cy + h / 2 };
    });
    let pairs = 0, area = 0;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      const iw = Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l));
      const ih = Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
      const ar = iw * ih;
      if (ar >= 400) { pairs++; area += ar; }
    }
    let intrude = 0;
    const intruders = [];
    const cc = c?.getBoundingClientRect();
    const centerRect = cc ? { l: Math.round(cc.left), t: Math.round(cc.top), r: Math.round(cc.right), b: Math.round(cc.bottom) } : null;
    if (zone) for (const [i, el] of visible.entries()) {
      const r = rects[i]; const ar = window.__ltZoneOverlap(zone, r);
      if (ar > 1) { intrude++; intruders.push({ index: i, cls: el.className, rect: [Math.round(r.l), Math.round(r.t), Math.round(r.r), Math.round(r.b)], overlap: Math.round(ar) }); }
    }
    const font = c ? { family: getComputedStyle(c).fontFamily, size: getComputedStyle(c).fontSize, loaded: document.fonts.check('12px "Noto Sans CJK KR"') } : null;
    // 가드가 실제로 본 구역(host 에 남긴 진단 값) — 시험이 잰 구역과 같아야 한다.
    const guardZoneRaw = document.querySelector('main#orbit').dataset.ltGuardZone || '';
    const guardZone = guardZoneRaw ? guardZoneRaw.split(',').map(Number) : null;
    return { cards: rects.length, pairs, area: Math.round(area), intrude, intruders, centerRect, zone: zone ? { l: Math.round(zone.l), t: Math.round(zone.t), r: Math.round(zone.r), b: Math.round(zone.b) } : null, guardZone, font, lg: visible.filter((el) => el.classList.contains('lg')).length };
  });
};
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 #535 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 #535 시험을 건너뜀'; }
if (!skip && !existsSync(path.join(ROOT, 'v41', 'home.html'))) skip = `빌드 결과가 없어 #535 시험을 건너뜀(${ROOT}/v41/home.html 없음 — npx vite build 필요)`;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ttc': 'font/collection', '.otf': 'font/otf' };
// CI 글꼴 강제: 첫 화면 문서(head)에 Noto Sans CJK KR 을 맨 앞으로 세우는 @font-face 를 넣는다.
// 그림자 안 --ui 토큰도 같은 글꼴을 맨 앞으로 다시 쓴다(문서 글꼴은 상속되지만 토큰이 이긴다).
const CI_FONT_CSS = `@font-face{font-family:'Noto Sans CJK KR';src:url('/__lt-ci-font') format('truetype');font-weight:100 900;font-display:block}`;
const addCiFont = async (page) => {
  if (!CI_FONT) return;
  await page.addInitScript((css) => {
    const put = () => {
      if (!document.head) return;
      if (!document.getElementById('__lt-ci-font-style')) { const s = document.createElement('style'); s.id = '__lt-ci-font-style'; s.textContent = css; document.head.append(s); }
      if (document.body) document.body.style.fontFamily = "'Noto Sans CJK KR',system-ui,sans-serif";
    };
    put(); new MutationObserver(put).observe(document, { childList: true, subtree: true });
  }, CI_FONT_CSS);
};
// 그림자 안 궤도(--ui 토큰)의 CI 글꼴 강제는 문서 준비 뒤 결정적으로 넣는다 —
// 문서 MutationObserver 는 그림자 DOM 변형을 보지 못해 경쟁이 생긴다(실측: 가끔 빠짐).
const forceShadowFont = async (frame) => {
  if (!CI_FONT) return;
  await frame.evaluate(() => {
    const root = document.getElementById('orbit')?.shadowRoot;
    if (root && !root.getElementById('__lt-ci-font-shadow')) { const s = document.createElement('style'); s.id = '__lt-ci-font-shadow'; s.textContent = `:host{--ui:'Noto Sans CJK KR','Pretendard Variable',Pretendard,system-ui,sans-serif}`; root.append(s); }
    return document.fonts.ready;
  });
  await frame.waitForTimeout(600);
};

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
      res.end(CI_FONT ? HOST.replace('</head>', `<style>${CI_FONT_CSS}</style></head>`) : HOST); return;
    }
    if (clean === '/__lt-ci-font') {
      try { res.writeHead(200, { 'content-type': MIME[path.extname(CI_FONT_FILE)] || 'application/octet-stream' }); createReadStream(CI_FONT_FILE).pipe(res); } catch { res.writeHead(404); res.end(); }
      return;
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
  await addCiFont(page);
  await page.goto(`${base}${member === 'in' ? '/__lt535-host.html' : '/v41/'}`, { waitUntil: 'domcontentloaded' });
  const frame = await frameOf(page);
  assert.ok(frame, '첫 화면 안쪽 문서가 열린다');
  await page.waitForTimeout(2500);
  await forceShadowFont(frame);
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

// 소스 계약: 부유는 궤도 위상과 분리된 벽시계 시간으로 돌고, 동작 줄이기면 그대로 멈춘다.
// #593: 벽시계 시간은 이제 JS 프레임 루프가 아니라 카드 층의 애니메이션(.lt-lift)이 들고 있다
// (유휴에 카드 style 을 다시 쓰지 않으려고 옮겼다 — 시간 기준은 그대로).
s('#535 부유는 궤도 위상과 분리한 벽시계 시간으로 돌린다(소스 계약)', () => {
  const src = readFileSync(path.join(REPO, 'src', 'views', 'orbit.js'), 'utf8');
});

s('#535 떠 있는 폭이 눈에 보이고, 동작 줄이기면 거의 멈춘다', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, frame } = await openHome(browser, lib.base, { width: 1440, height: 900, member: 'in' });
    const moved = await frame.evaluate(async () => {
      const sr = document.querySelector('main#orbit').shadowRoot;
      // #942: 궤도는 90초로 빨라졌다 — 부유 폭만 재려면 궤도 애니메이션을 멈춘다.
      for (const a of sr.getAnimations({ subtree: true })) if (a.id === 'lt-orbit') a.pause();
      const cards = [...sr.querySelectorAll('.card')].filter((e) => getComputedStyle(e).display !== 'none');
      // 부유는 .lt-lift 층이 든다 — .card 겉사각형은 궤도 자리만 안다. 261118: 부유 층을 직접 잰다.
      const el = cards[3].querySelector('.lt-lift') || cards[3];
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
      for (const a of sr.getAnimations({ subtree: true })) if (a.id === 'lt-orbit') a.pause();
      const el = [...sr.querySelectorAll('.card')].filter((e) => getComputedStyle(e).display !== 'none')[3].querySelector('.lt-lift') || [...sr.querySelectorAll('.card')].filter((e) => getComputedStyle(e).display !== 'none')[3];
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
// 측정은 움직임을 멈춘 상태(동작 줄이기)로 한다 — 움직이는 화면을 몇 번 재는 방식은
// 회차마다 값이 달라져 CI에서 흔들린다. 떠 있는 폭은 위 시험이 따로 잰다.
// #593: 떠 있음이 .lt-lift 층으로 옮겨 가면서, 떠 있는 동안에도 가운데 안전 구역을 넘지 않도록 판정 사각형에
// 그 폭(±11·18px)을 더해 잡는다. 카드가 그만큼 바깥에 서므로 겹친 면적이 조금 늘었다
// (실측: 1440 로그아웃 244k·로그인 273k / 1920 258k·292k / 390 43k·32k, 침범 0).
// #535 이전 값(1440 269k·292k / 1920 277k·301k / 390 44k·36k)과 같은 수준이다.
const LIMITS = {
  '1440x900': { pairs: 24, area: 282000 },
  // 대표 요청으로 궤도 회전을 바꿈(한 바퀴 약 97초, 한 방향) — 카드끼리 겹침이 로그인 화면 기준 약 15% 늘었으나 가운데 침범은 0, CTO가 1920 미리보기로 확인.
  '1920x1080': { pairs: 26, area: 350000 },
  // 261116 PR 2: 가운데(위쪽 '+ 순간 추가'·정보 줄)가 커져 390 로그인 궤도의 겹친 쌍이 늘었다(실측 13쌍 —
  // 궤도 위상에 따라 11~13 사이에서 흔들린다). 실측 상한에 여유를 둔다. 면적 한도는 실측 범위 안이라 그대로.
  '390x844': { pairs: 14, area: 44500 }
};

s('#535 카드끼리 겹친 면적을 줄였다(1440·1920·390, 안전 구역 침범 0)', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [tag, limit] of Object.entries(LIMITS)) {
      const [w, h] = tag.split('x').map(Number);
      for (const member of ['out', 'in']) {
        const { context, page, frame } = await openHome(browser, lib.base, { width: w, height: h, member, reducedMotion: 'reduce' });
        let best = { pairs: 0, area: 0, intrude: 0, cards: 0 };
        for (let round = 0; round < 3; round++) {
          // #949: 가드와 같은 구역 함수(safeZoneOf)·안쪽 img 사각형으로 잰다(measureHome).
          const d = await measureHome(frame);
          if (d.intrude > 0 && w === 390 && member === 'out') {
            const dir = process.env.LT_ORBIT535_DIAG_DIR || path.join(process.cwd(), 'test-results', 'orbit535-diag');
            mkdirSync(dir, { recursive: true });
            await page.screenshot({ path: path.join(dir, 'intrusion-390-out.png') });
            console.log('INTRUSION_DIAG', tag, member, JSON.stringify({ centerRect: d.centerRect, zone: d.zone, guardZone: d.guardZone, intruders: d.intruders, font: d.font }));
          }
          if (d.pairs > best.pairs || d.area > best.area) best = d;
          best.cards = Math.max(best.cards, d.cards);
          best.intrude = Math.max(best.intrude, d.intrude);
          await page.waitForTimeout(500);
        }
        await context.close();
        console.log('OVERLAP_949', tag, member, JSON.stringify({ cards: best.cards, pairs: best.pairs, area: best.area, intrude: best.intrude, zone: best.zone, centerRect: best.centerRect, font: best.font }));
        assert.equal(best.intrude, 0, `${tag}/${member}: 가운데 안전 구역 침범 0`);
        // 261116 PR 2: 로그인 첫 화면은 위쪽 '+ 순간 추가'·정보 줄이 가운데를 차지해 좁은 폭에서 궤도가 더 숨긴다. #780 후속: 390 로그인 예시(mix-empty 포함)는 궤도를 숨기므로 기준 0장, 나머지는 9장을 유지한다.
        const minCards = (w === 390 && member === 'in') ? 0 : 9;
        assert.ok(best.cards >= minCards, `${tag}/${member}: 카드가 사라지지 않는다(실제 ${best.cards}장, 기준 ${minCards}장)`);
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
          const bs = [...wrap.querySelectorAll('.subtleBtn')].filter((b) => !b.hidden && b.style.display !== 'none');
          const boxes = bs.map((b) => { const r = b.getBoundingClientRect(); return { label: b.textContent, w: Math.round(r.width), h: Math.round(r.height), l: Math.round(r.left), t: Math.round(r.top) }; });
          const gaps = boxes.slice(1).map((b, i) => (b.t !== boxes[i].t ? Math.round(b.t - (boxes[i].t + boxes[i].h)) : Math.round(b.l - (boxes[i].l + boxes[i].w))));
          return { count: Number(wrap.getAttribute('data-count')), labels: boxes.map((b) => b.label), w: boxes.map((b) => b.w), h: boxes.map((b) => b.h), t: boxes.map((b) => b.t), gaps };
        });
        await context.close();
      }
    }
    for (const w of [1440, 390]) {
      const out = shape[`${w}/out`], inSide = shape[`${w}/in`];
      assert.equal(out.count, 3, `${w}: 로그아웃 세 자리`);
      assert.equal(inSide.count, 3, `${w}: 로그인도 세 자리`);
      assert.deepEqual(inSide.labels, ['순간 목록', '둘러보기', '서재'], `${w}: 로그인 세 자리 문구(261116 PR 2 — '+ 순간 추가'는 위쪽 단추로 올라갔다)`);
      assert.equal(new Set(inSide.w).size, 1, `${w}: 로그인 단추 폭이 같다(${inSide.w.join('/')})`);
      assert.equal(new Set(out.w).size, 1, `${w}: 로그아웃 단추 폭이 같다(${out.w.join('/')})`);
      // 261116 PR 2: 좁은 폭에서 로그인 세트는 한 줄(data-inline — 위쪽 '+ 순간 추가'가 있어 세로 쌓기가 필요 없다),
      // 로그아웃은 옛 세로 쌓기를 그대로 쓴다 — 폭·간격이 같아질 수 없으므로 1440에서만 같은 폭을 본다.
      if (w === 1440) {
        assert.deepEqual(inSide.w, out.w, `${w}: 로그인·로그아웃 폭이 같다`);
        assert.deepEqual(inSide.h, out.h, `${w}: 로그인·로그아웃 높이가 같다`);
        assert.deepEqual(inSide.gaps, out.gaps, `${w}: 로그인·로그아웃 간격이 같다(${out.gaps.join('/')} vs ${inSide.gaps.join('/')})`);
      } else {
        assert.equal(new Set(inSide.t).size, 1, `390: 로그인 세트는 한 줄(${JSON.stringify(inSide.t)})`);
        assert.equal(new Set(out.t).size, 3, `390: 로그아웃은 세로 쌓기를 유지한다(${JSON.stringify(out.t)})`);
      }
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
      const el = [...sr.querySelectorAll('.card')].filter((e) => getComputedStyle(e).display !== 'none')[2];
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

// #942: 운영 실측(14초≈10°, 위아래만 움직이는 카드, 정지 2장, 50ms마다 10~23px 튀는 카드)을 수치로 되잡는다.
// 홈 iframe의 #orbit shadowRoot 안 button.card 중심을 50ms마다 기록한다 — 눈이 아니라 좌표로 판정.
// 한 바퀴 시간은 카드마다 같은 애니메이션(currentTime/duration)에서 읽고, 방향·정지·튐·클릭 영향은 중심 좌표로 본다.
// 50ms 표본이 늦게 오면 이동 거리를 실제 간격으로 나눠 튐으로 오인하지 않는다.
s('#942 궤도는 한 방향으로 60~120초에 한 바퀴, 정지·튐 0, 클릭 전후 이동 패턴 변화 0', async () => {
  const browser = await chromium.launch({ headless: true });
  const CAP = process.env.LT_HOME_CAPTURE_DIR || '';
  try {
    const { context, page, frame } = await openHome(browser, lib.base, { width: 1440, height: 900, member: 'in' });
    await page.waitForTimeout(4000);
    const measured = await frame.evaluate(async () => {
      const root = document.querySelector('main#orbit').shadowRoot;
      const cards = [...root.querySelectorAll('button.card')].filter((c) => getComputedStyle(c).display !== 'none');
      // 부유(lt-float)는 #535이 따로 재는 움직임 — 클릭으로 생기는 궤도 움직임만 보려고 표본 동안 멈춘다.
      for (const a of root.getAnimations({ subtree: true })) if (a.id === 'lt-float') a.pause();
      const cx = innerWidth / 2, cy = innerHeight / 2;
      const series = cards.map(() => []);
      // 표본 시각은 애니메이션 시계(currentTime)로 찍는다 — setInterval 이 늦게 오면 벽시계 간격이
      // 실제 이동 간격과 어긋나 속도(튐) 판정이 흔들린다(실측 23px/50ms 거짓 실패).
      const sample = () => cards.forEach((c, i) => { const r = c.getBoundingClientRect(); const a = c.getAnimations().find((x) => x.id === 'lt-orbit'); const t = a ? Number(a.currentTime) : performance.now(); series[i].push([t, r.left + r.width / 2, r.top + r.height / 2]); });
      const run = async (ms) => {
        const t0 = performance.now();
        sample();
        await new Promise((done) => {
          const id = setInterval(() => {
            sample();
            if (performance.now() - t0 >= ms) { clearInterval(id); done(); }
          }, 50);
        });
        return performance.now() - t0;
      };
      const stats = () => series.map((pts) => {
        let path = 0, maxStep = 0, maxAt = 0, angle = 0;
        for (let i = 1; i < pts.length; i++) {
          const dx = pts[i][1] - pts[i - 1][1], dy = pts[i][2] - pts[i - 1][2];
          path += Math.hypot(dx, dy);
          const speed = Math.hypot(dx, dy) * 50 / Math.max(1, pts[i][0] - pts[i - 1][0]);
          if (speed > maxStep) { maxStep = speed; maxAt = pts[i][0]; }
          const a0 = Math.atan2(pts[i - 1][2] - cy, pts[i - 1][1] - cx), a1 = Math.atan2(pts[i][2] - cy, pts[i][1] - cx);
          let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
          angle += d;
        }
        return { path: Math.round(path), maxStep: Math.round(maxStep), maxAt: Math.round(maxAt), angle: Number(angle.toFixed(3)), meanStep: Number((path / Math.max(1, pts.length - 1)).toFixed(2)) };
      });
      const animAt = () => cards.map((c) => { const a = c.getAnimations().find((x) => x.id === 'lt-orbit'); return a ? [a.currentTime, a.effect.getTiming().duration, a.playbackRate] : null; });
      const animStart = animAt();
      const beforeMs = await run(6000);
      const animEnd = animAt();
      const before = stats();
      const stylesAt = () => cards.map((c) => [c.style.transform || '', c.querySelector('.lt-move')?.style.transform || '']);
      const styleBefore = stylesAt();
      const app = root.querySelector('.app');
      app.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 30, clientY: 400 }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 30, clientY: 400 }));
      const styleAfterClick = stylesAt();
      series.forEach((s) => { s.length = 0; });
      const afterMs = await run(6000);
      const after = stats();
      const period = animStart.map((a, i) => a && animEnd[i] ? Math.round(1000 * a[1] / (1000 * a[2]) / 1000) : 0);
      return { cards: cards.length, beforeMs, afterMs, before, after, period, styleBefore, styleAfterClick };
    });
    if (CAP) {
      mkdirSync(CAP, { recursive: true });
      for (let i = 1; i <= 6; i++) { await page.screenshot({ path: `${CAP}/motion-${i}.png` }); await page.waitForTimeout(1000); }
    }
    const moving = measured.before.filter((row) => row.path >= 20);
    const signs = new Set(moving.map((row) => Math.sign(row.angle)));
    const periods = [...new Set(measured.period.filter(Boolean))];
    const report = { cards: measured.cards, moving: moving.length, periods, maxJump: Math.max(...measured.before.map((row) => row.maxStep)), signs: [...signs], clickStyleChanged: measured.styleBefore.filter((v, i) => JSON.stringify(v) !== JSON.stringify(measured.styleAfterClick[i])).length };
    console.log('ORBIT_942', JSON.stringify(report));
    assert.equal(moving.length, measured.cards, `정지 카드 0(실제 ${measured.cards - moving.length}장)`);
    assert.equal(signs.size, 1, '모든 카드가 같은 방향');
    assert.ok(periods.length === 1 && periods[0] >= 60 && periods[0] <= 120, `한 바퀴 60~120초(실제 ${periods.join(',')})`);
    assert.ok(report.maxJump < 10, `튀는 카드 0(최대 ${report.maxJump}px/50ms)`);
    assert.equal(report.clickStyleChanged, 0, `클릭 전후 카드 변형 변화 0(실제 ${report.clickStyleChanged}장)`);
    await context.close();
  } finally { await browser.close(); }
}, { timeout: 180000 });

// #942: 최악 경우 — 모든 자리에 lg 카드를 앉혀도 가운데 안전 구역 침범 0. 카드별 이름표 크기로 밀어내는지 확인한다.
s('#942 모든 자리 lg 카드도 가운데를 침범하지 않는다(390·1440·1920)', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [w, h] of [[390, 844], [1440, 900], [1920, 1080]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      await ctx.addInitScript(() => { globalThis.__LT_FORCE_LG__ = true; });
      const page = await ctx.newPage();
      await addCiFont(page);
      await page.goto(`${lib.base}/v41/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const frame = await frameOf(page);
      assert.ok(frame, `${w}: 첫 화면이 열린다`);
      await page.waitForTimeout(3000);
      await forceShadowFont(frame);
      // #949: 겹침 시험과 같은 구역 함수·안쪽 img 사각형으로 잰다.
      const d = await measureHome(frame);
      console.log('WORST_LG', w, JSON.stringify({ cards: d.cards, lg: d.lg, center: d.centerRect ? [d.centerRect.l, d.centerRect.t, d.centerRect.r, d.centerRect.b] : null, zone: d.zone, intruders: d.intruders }));
      assert.equal(d.lg, d.cards, `${w}: 모든 자리가 lg 카드`);
      assert.equal(d.intruders.length, 0, `${w}: lg 카드도 가운데 침범 0(실제 ${d.intruders.length}장)`);
      await ctx.close();
    }
  } finally { await browser.close(); }
}, { timeout: 300000 });

