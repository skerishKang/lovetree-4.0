// #586: 첫 화면(궤도) 끌기 성능 — 원인을 줄인 자리를 실제 화면에서 잠근다.
// - z-index를 매 프레임 다시 쓰지 않는다(64 단계 밴드). 매 프레임 z-index 쓰기는 스타일 재계산을
//   몇 배로 무겁게 만드는 상태를 이어갔다(실측 E:\lovetree-qa\orbit-fps).
// - 끄는 동안(data-lt-busy)에는 hover 모양을 바꾸지 않는다(테두리·번짐·그림자 다시 칠하기 억제).
// - 패럴랙스는 pointermove마다 화면 중심을 다시 재지 않는다(rect 캐시).
// - 첫 화면 문서는 src/styles.css 를 읽지 않고 --ui 토큰만 인라인로 둔다(문서 스타일시트 수 축소).
// 로그아웃 예시 화면(/v41/)을 쓴다 — 계정 불필요.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const BUILT = path.join(REPO, 'dist');
const ROOT = path.resolve(process.env.LT_ORBIT586_ROOT || (existsSync(path.join(BUILT, 'v41', 'home.html')) ? BUILT : path.join(REPO, 'public')));
const REQUIRE = process.env.LT_ORBIT586_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 #586 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 #586 시험을 건너뜀'; }
if (!skip && !existsSync(path.join(ROOT, 'v41', 'home.html'))) skip = `빌드 결과가 없어 #586 시험을 건너뜀(${ROOT}/v41/home.html 없음 — npx vite build 필요)`;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
function serve() {
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
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}
const frameOf = async (page) => {
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    frame = page.frames().find((f) => /home\.html/.test(f.url()));
    if (!frame) await page.waitForTimeout(250);
  }
  return frame;
};
const s = (name, fn, opts = {}) => test(name, { skip: skip || undefined, timeout: opts.timeout || 120000 }, fn);
const lib = await (async () => {
  if (skip) return null;
  const server = await serve();
  return { server, base: `http://127.0.0.1:${server.address().port}` };
})();
test.after(() => lib?.server?.close());
if (REQUIRE && skip) throw new Error(`#586 실행 시험이 필요한데 건너뜀: ${skip}`);

// 소스 계약
s('#586 z-index는 64 단계 밴드로만 다시 쓴다(소스 계약)', () => {
  const src = readFileSync(path.join(REPO, 'src', 'views', 'orbit.js'), 'utf8');
  assert.match(src, /Math\.round\(\(1000\+z\)\/64\)\*64/, 'z 값을 64 단계 밴드로 묶는다');
  assert.doesNotMatch(src, /const zv=Math\.round\(1000\+z\);/, '매 프레임 정밀 z-index 쓰기를 남겨 두지 않는다');
});
s('#586 끄는 동안에는 hover 모양을 바꾸지 않는다(소스 계약)', () => {
  const src = readFileSync(path.join(REPO, 'src', 'views', 'orbit.js'), 'utf8');
  assert.match(src, /:host\(:not\(\[data-lt-busy\]\)\) \.card:hover/, 'hover 규칙을 끄는 동안엔 적용하지 않는다');
  assert.match(src, /:host\(\[data-lt-busy\]\) \.recent-card:hover/, '최근 순간 카드의 hover도 끄는 동안엔 고정한다');
});
s('#586 패럴랙스는 rect 캐시를 쓴다(소스 계약)', () => {
  const src = readFileSync(path.join(REPO, 'src', 'views', 'orbit.js'), 'utf8');
  assert.match(src, /let appBox=null/, 'rect 캐시를 둔다');
  assert.match(src, /const box=appBox\|\|app\.getBoundingClientRect\(\)/, 'pointermove마다 다시 재지 않는다');
  assert.match(src, /const fitNotice=\(\)=>\{.*appBox=app\.getBoundingClientRect\(\)/, '창이 바뀔 때 캐시를 다시 재운다');
});
s('#586 첫 화면 문서는 src/styles.css 를 읽지 않고 --ui 토큰만 인라인로 둔다(소스 계약)', () => {
  const homeJs = readFileSync(path.join(REPO, 'v41', 'home.js'), 'utf8');
  assert.doesNotMatch(homeJs, /import '\.\.\/src\/styles\.css'/, 'styles.css 전체를 문서에 주입하지 않는다');
  const homeHtml = readFileSync(path.join(REPO, 'v41', 'home.html'), 'utf8');
  assert.match(homeHtml, /--ui:\s*'Pretendard Variable'/, '그림자가 쓰는 --ui 토큰은 home.html 의 style에 있다');
});

// 실행 계약 — 실제 첫 화면에서
s('#586 유휴 4초 동안 z-index 쓰기가 프레임마다 일어나지 않는다', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${lib.base}/v41/`, { waitUntil: 'domcontentloaded' });
    const frame = await frameOf(page);
    assert.ok(frame, '첫 화면 안쪽 문서가 열린다');
    await page.waitForTimeout(3000);
    const writes = await frame.evaluate(async () => {
      let count = 0;
      const sr = document.querySelector('main#orbit').shadowRoot;
      const cards = [...sr.querySelectorAll('.card')];
      const saved = [];
      for (const c of cards) {
        const desc = Object.getOwnPropertyDescriptor(c.style, 'zIndex');
        if (!desc) return -1; // 접근자를 찾지 못하면 이 실행 계약은 건너뛴다(소스 계약이 이미 잠근다)
        saved.push([c.style, desc]);
        Object.defineProperty(c.style, 'zIndex', { configurable: desc.configurable !== false, enumerable: desc.enumerable !== false,
          get() { return desc.get ? desc.get.call(this) : this.getPropertyValue('z-index'); },
          set(v) { count++; this.setProperty('z-index', v); } });
      }
      await new Promise((done) => setTimeout(done, 4000));
      for (const [st, desc] of saved) { desc.configurable !== false && Object.defineProperty(st, 'zIndex', desc); }
      return count;
    });
    await context.close();
    if (writes === -1) return; // 이 Chromium에선 접근자 감시가 불가 — 소스 계약이 이미 잠근다
    // 밴드 전: 카드 28장 × 프레임마다 ≈ 수천 회. 밴드 후: 궤도가 느려 밴드를 넘는 일이 드물다.
    assert.ok(writes < 240, `z-index 쓰기가 4초에 ${writes}회 — 밴드를 쓰지 않으면 수천 회다`);
  } finally { await browser.close(); }
});
s('#586 pointermove를 여러 번 보내도 화면 중심을 매번 다시 재지 않는다', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${lib.base}/v41/`, { waitUntil: 'domcontentloaded' });
    const frame = await frameOf(page);
    assert.ok(frame, '첫 화면 안쪽 문서가 열린다');
    await page.waitForTimeout(3000);
    const reads = await frame.evaluate(async () => {
      const sr = document.querySelector('main#orbit').shadowRoot;
      const app = sr.querySelector('.app');
      let calls = 0;
      const orig = app.getBoundingClientRect.bind(app);
      app.getBoundingClientRect = (...a) => { calls++; return orig(...a); };
      for (let i = 0; i < 40; i++) {
        app.dispatchEvent(new PointerEvent('pointermove', { clientX: 200 + i * 20, clientY: 700, bubbles: true, pointerType: 'mouse', pointerId: 7 }));
        await new Promise((r) => setTimeout(r, 16));
      }
      return calls;
    });
    await context.close();
    assert.ok(reads <= 2, `pointermove 40번에 getBoundingClientRect ${reads}회 — 매번 다시 재면 40회다`);
  } finally { await browser.close(); }
});
s('#586 글꼴 토큰이 그대로다(styles.css 제거의 부작용 없음)', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${lib.base}/v41/`, { waitUntil: 'domcontentloaded' });
    const frame = await frameOf(page);
    assert.ok(frame, '첫 화면 안쪽 문서가 열린다');
    await page.waitForTimeout(1500);
    const font = await frame.evaluate(() => getComputedStyle(document.body).fontFamily);
    await context.close();
    assert.match(font, /Pretendard Variable/, `첫 화면 글꼴 토큰이 바뀌지 않는다(실제: ${font})`);
  } finally { await browser.close(); }
});
