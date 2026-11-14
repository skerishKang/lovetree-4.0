// #467: 보드 카드 글자 대비를 "실제 그려진 화면"에서 잰다(PR #499 CTO 검토).
// 예전 시험은 변수 값(#fdfbf7 등)끼리 계산해, 밤 판에서 카드가 어두워지고 제목이 1.0:1이 된 것을 놓쳤다.
// 여기서는 보드 화면을 헤드리스 크롬으로 열어, 카드 종류(보통·첫 순간·마음 한마디 × 포스트잇·메모지·둥근·필름·티켓…)마다
// 제목·메모·날짜·표식의 getComputedStyle 글자색과 카드 바탕(반투명이면 판 위에 겹친 색)으로 대비를 낸다.
// 크롬(Playwright chromium)이 없는 곳에서는 건너뛴다 — 이유를 남긴다.
// LT_BOARD_CONTRAST_ROOT=<dist 폴더>로 다른 빌드(예: 고치기 전 커밋)를 대조해 볼 수 있다.
// #504: CI(미리보기 검사 잡)에서는 LT_BOARD_CONTRAST_REQUIRE=1로 돌려 건너뜀을 실패로 본다 —
// 이 시험이 막아야 할 회귀(밤 판 제목 1.0:1)가 다시 들어와도 건너뜀으로 조용히 지나가지 않게.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureBoardCardsInPage, worstByVariant } from './helpers/board-contrast.mjs';

const ROOT = path.resolve(process.env.LT_BOARD_CONTRAST_ROOT || fileURLToPath(new URL('../public', import.meta.url)));
let chromium = null;
let skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright chromium이 설치되어 있지 않아 실제 화면 대비 시험을 건너뜀(npx playwright install chromium 뒤 실행)';
} catch {
  skip = 'playwright 패키지가 없어 실제 화면 대비 시험을 건너뜀';
}

// #504: CI에서는 건너뜀을 실패로 본다(로컬에서는 지금처럼 건너뜀).
const REQUIRE = process.env.LT_BOARD_CONTRAST_REQUIRE === '1';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
function serve(root) {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    for (const file of [path.join(root, clean), path.join(root, clean, 'index.html')]) {
      if (!file.startsWith(root)) continue;
      try { if ((await stat(file)).isFile()) { res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(res); return; } } catch {}
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// 보드는 셸이 넘겨주는 예시 트리(parent.LT41)로 그린다 — 로그아웃 셸(/v41/#board)째 열고 보드 프레임 안에서 잰다.
async function openBoard(browser, base, { plate, appTheme }) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(([p, t]) => { try { localStorage.setItem('lt41.theme', t); if (p === 'night') localStorage.setItem('lt41.boardTheme', 'night'); } catch {} }, [plate, appTheme]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(`${base}/v41/#board`, { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    frame = page.frames().find((f) => /track58-pinboard/.test(f.url()));
    if (!frame) await page.waitForTimeout(250);
  }
  assert.ok(frame, '보드 프레임이 열리지 않음');
  await frame.waitForFunction(() => document.querySelectorAll('#cardLayer .card').length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(1500); // 카드 내려앉는 움직임이 끝난 뒤 잰다
  return { ctx, page, frame, errors };
}

test('보드 카드: 종이·밤 판 × 밤·정원 테마, 카드 종류마다 제목·메모·날짜·표식 대비 4.5:1 이상(실제 그려진 색)', { skip: REQUIRE ? false : skip, timeout: 120000 }, async () => {
  if (skip) assert.fail(`CI에서는 화면 대비 시험 건너뜀이 실패다(#504) — ${skip}`);
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const failures = [];
    for (const appTheme of ['night', 'garden']) {
      for (const plate of ['paper', 'night']) {
        const { ctx, frame, errors } = await openBoard(browser, base, { plate, appTheme });
        const result = await frame.evaluate(measureBoardCardsInPage);
        await ctx.close();
        assert.equal(errors.length, 0, `${appTheme}×${plate}: 페이지 오류 ${errors.join(' | ')}`);
        assert.ok(result.cardCount > 0, `${appTheme}×${plate}: 카드가 그려지지 않음`);
        const rows = worstByVariant(result);
        const variants = new Set(rows.map((r) => r.variant));
        // 카드 색 변형 전부를 쟀는지: 보통·첫 순간·마음 한마디 × 여섯 카드 모양
        for (const s of ['photo', 'postit', 'memo', 'rounded', 'film', 'ticket']) {
          for (const v of [`cardStyle-${s}`, `first cardStyle-${s}`, `noteCard cardStyle-${s}`]) assert.ok(variants.has(v), `${appTheme}×${plate}: ${v} 카드를 재지 못함`);
        }
        // #601: 카드에서 메모(.memo)는 상세로 옮겨졌다 — 제목·감정·날짜·표식을 잰다.
        for (const role of ['title', 'date', 'mark']) assert.ok(rows.some((r) => r.role === role), `${appTheme}×${plate}: ${role} 글자를 재지 못함`);
        for (const r of rows) if (r.ratio < 4.5) failures.push(`${appTheme}×${plate} ${r.variant} ${r.role}(${r.sel}) ${r.fg}/${r.bg} = ${r.ratio}:1`);
      }
    }
    assert.deepEqual(failures, [], `대비 4.5:1 미만:\n${failures.join('\n')}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
});

test('보드 안 클릭(카드·전체 보기)은 판을 바꾸지 않는다 — [종이|밤] 단추만 바꾼다', { skip: REQUIRE ? false : skip, timeout: 60000 }, async () => {
  if (skip) assert.fail(`CI에서는 화면 대비 시험 건너뜀이 실패다(#504) — ${skip}`);
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const { ctx, page, frame, errors } = await openBoard(browser, base, { plate: 'paper', appTheme: 'night' });
    const read = () => frame.evaluate(() => ({
      attr: document.documentElement.getAttribute('data-lt-board-theme'),
      stored: localStorage.getItem('lt41.boardTheme'),
      body: document.body.dataset.theme,
      toast: document.getElementById('toast')?.textContent || '',
      themes: document.querySelectorAll('#themeGrid .themeBtn').length
    }));
    const before = await read();
    assert.equal(before.attr, 'paper', '기본은 종이 판');
    assert.equal(before.body, 'pearl', '원본 보드 테마(진주빛)는 그대로');
    assert.equal(before.themes, 6, '고급 도구의 보드 테마 6종이 그대로 있다');
    await frame.click('#cardLayer .card:not(.first) h3');
    await frame.click('#fitBtn');
    await page.waitForTimeout(400);
    const after = await read();
    assert.equal(after.stored, null, '카드·전체 보기 클릭으로 판 테마가 저장되면 안 된다');
    assert.doesNotMatch(after.toast, /판으로 바꿨어요/, '카드·전체 보기 클릭에 판 바꿈 안내가 뜨면 안 된다');
    await frame.evaluate(() => document.querySelector('button[data-board-theme="night"]').click());
    const night = await read();
    assert.equal(night.attr, 'night');
    assert.equal(night.stored, 'night');
    assert.equal(night.body, 'pearl', '밤 판이어도 원본 "밤" 보드 테마(어두운 카드)를 켜지 않는다');
    await ctx.close();
    assert.equal(errors.length, 0, errors.join(' | '));
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
});
