// 보드·책 겹(패널)의 키보드 초점 계약 — 실제 화면에서 잰다(브라우저 없는 곳은 건너뜀, CI 미리보기 잡은 REQUIRE=1).
// 계약:
//  1) 닫힌 겹은 탭이 들어가지 못한다(inert) — 이 화면의 겹 몇몇은 display:none 대신 transform·opacity로
//     치워 둬서, 닫혀도 탭 가능한 채 남았다(보이지 않는 단추에 초점이 머물렀다).
//  2) 겹을 닫으면 연 곳으로 돌아간다. 화면이 뜰 때 저절로 열린 겹(보드 첫 순간 상세)은 연 곳이 없으므로
//     지금 고른 순간 카드로 돌아간다.
//  3) 사용자가 연 겹(책 목차)은 닫으면 원래 단추로 돌아간다(기존 동작 유지).
// 어댑터(public/v41/view-a11y.mjs)를 되돌리면 1)·2)가 빨갛다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.env.LT_VIEW_A11Y_ROOT || fileURLToPath(new URL('../public', import.meta.url)));
let chromium = null;
let skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright chromium이 설치되어 있지 않아 건너뜀(npx playwright install chromium 뒤 실행)';
} catch {
  skip = 'playwright 패키지가 없어 건너뜀';
}
const REQUIRE = process.env.LT_VIEW_A11Y_REQUIRE === '1';

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

async function openScreen(browser, base, hash) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', locale: 'ko-KR' });
  await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); localStorage.setItem('lt41.tips.firstTree', '1'); } catch {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(`${base}/v41/${hash}`, { waitUntil: 'load' });
  return { ctx, page, errors };
}
const viewFrame = (page) => page.evaluate(`(() => { const f = [...document.querySelectorAll('#view,#view-next')].filter((x) => !x.hidden).pop(); return f ? f.name || f.src : ''; })()`);
async function waitFrame(page, testid, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // 셸은 iframe에 src 속성을 쓰지 않고 문서를 직접 쓴다 — contentDocument.URL로 본다.
    const ready = await page.evaluate(({ pattern }) => {
      const f = [...document.querySelectorAll('#view,#view-next')].filter((x) => !x.hidden).pop();
      if (!f) return false;
      try {
        const d = f.contentDocument;
        return new RegExp(pattern).test(d.URL) && d.readyState === 'complete' && d.body && d.body.children.length > 0;
      } catch { return false; }
    }, { pattern: testid });
    if (ready) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

test('보드 상세: 열린 겹은 탭 가능, 닫으면 겹은 탭 불가(inert)·고른 순간 카드로 초점 복귀', { skip: REQUIRE ? false : skip, timeout: 120000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const { ctx, page, errors } = await openScreen(browser, base, '#board');
    try {
      assert.ok(await waitFrame(page, 'track58-pinboard'), '보드 프레임이 열리지 않음');
      // 화면이 뜰 때 첫 순간 상세가 저절로 열린다(700px 이상).
      await page.waitForFunction(`(() => { const f = [...document.querySelectorAll('#view,#view-next')].filter((x) => !x.hidden).pop(); const d = f.contentDocument.getElementById('detail'); return d && d.classList.contains('open'); })()`, null, { timeout: 15000 });
      const opened = await page.evaluate(`(() => {
        const f = [...document.querySelectorAll('#view,#view-next')].filter((x) => !x.hidden).pop();
        const d = f.contentDocument.getElementById('detail');
        return { inert: d.inert, focus: f.contentDocument.activeElement.id || f.contentDocument.activeElement.tagName };
      })()`);
      assert.equal(opened.inert, false, '열린 상세가 inert이면 안 된다');
      assert.equal(opened.focus, 'detailClose', '열린 상세의 첫 초점은 닫기 단추다');

      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      const closed = await page.evaluate(`(() => {
        const f = [...document.querySelectorAll('#view,#view-next')].filter((x) => !x.hidden).pop();
        const d = f.contentDocument.getElementById('detail');
        const ae = f.contentDocument.activeElement;
        const card = f.contentDocument.querySelector('#cardLayer article.card.selected');
        return {
          open: d.classList.contains('open'), inert: d.inert,
          focusId: ae.id || '', focusTag: ae.tagName,
          focusOnCard: card ? ae === card || card.contains(ae) : false,
          cardVisible: card ? card.getClientRects().length > 0 : false
        };
      })()`);
      assert.equal(closed.open, false, 'Esc로 상세가 닫혀야 한다');
      assert.equal(closed.inert, true, '닫힌 상세는 탭이 들어가지 않아야 한다(inert)');
      assert.equal(closed.focusOnCard, true, `닫은 뒤 초점은 고른 순간 카드여야 한다(지금: ${closed.focusTag}#${closed.focusId})`);
      assert.equal(closed.cardVisible, true, '초점이 돌아간 카드가 화면에 보여야 한다');

      // 닫힌 상세로 탭이 들어가지 않는다: 카드에서 Tab을 밟아도 상세 안에 머물지 않는다.
      for (let i = 0; i < 6; i += 1) {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(80);
        const inside = await page.evaluate(`(() => {
          const f = [...document.querySelectorAll('#view,#view-next')].filter((x) => !x.hidden).pop();
          const d = f.contentDocument.getElementById('detail');
          const ae = f.contentDocument.activeElement;
          return d.contains(ae) ? ae.id || ae.tagName : '';
        })()`);
        assert.equal(inside, '', `닫힌 상세 안으로 탭이 들어왔다(${i + 1}번째 Tab → ${inside})`);
      }
      assert.deepEqual(errors, [], `페이지 오류: ${errors.join(' | ')}`);
    } finally {
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
});

test('390 보드: 닫힌 상세는 처음부터 탭이 들어가지 않는다', { skip: REQUIRE ? false : skip, timeout: 120000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'ko-KR' });
    await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); localStorage.setItem('lt41.tips.firstTree', '1'); } catch {} });
    const page = await ctx.newPage();
    try {
      await page.goto(`${base}/v41/#board`, { waitUntil: 'load' });
      assert.ok(await waitFrame(page, 'track58-pinboard'), '보드 프레임이 열리지 않음');
      await page.waitForTimeout(1800);
      const state = await page.evaluate(`(() => {
        const f = [...document.querySelectorAll('#view,#view-next')].filter((x) => !x.hidden).pop();
        const d = f.contentDocument.getElementById('detail');
        return { open: d.classList.contains('open'), inert: d.inert };
      })()`);
      assert.equal(state.open, false, '390에서는 상세가 저절로 열리지 않는다');
      assert.equal(state.inert, true, '닫힌 상세는 탭이 들어가지 않아야 한다(inert)');
    } finally {
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
});

test('책 목차(사용자가 연 겹): 닫으면 원래 단추로 돌아간다(기존 동작 유지)', { skip: REQUIRE ? false : skip, timeout: 120000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const { ctx, page } = await openScreen(browser, base, '#book');
    try {
      assert.ok(await waitFrame(page, 'track59-sketchbook'), '책 프레임이 열리지 않음');
      await page.waitForTimeout(1500);
      // 키보드 사용자처럼: 목차 단추에 초점을 두고 Enter로 연다(프로그래밍 클릭은 초점을 옮기지 않는다).
      await page.evaluate(`(() => { const f = [...document.querySelectorAll('#view,#view-next')].filter((x) => !x.hidden).pop(); f.contentDocument.getElementById('archiveBtn').focus(); })()`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
      const opened = await page.evaluate(`(() => {
        const f = [...document.querySelectorAll('#view,#view-next')].filter((x) => !x.hidden).pop();
        const p = f.contentDocument.getElementById('archivePanel');
        return { open: p.classList.contains('open'), inert: p.inert };
      })()`);
      assert.equal(opened.open, true, '목차가 열려야 한다');
      assert.equal(opened.inert, false, '열린 목차는 inert이면 안 된다');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      const closed = await page.evaluate(`(() => {
        const f = [...document.querySelectorAll('#view,#view-next')].filter((x) => !x.hidden).pop();
        const p = f.contentDocument.getElementById('archivePanel');
        const ae = f.contentDocument.activeElement;
        return { open: p.classList.contains('open'), inert: p.inert, focusBack: ae.id || ae.tagName };
      })()`);
      assert.equal(closed.open, false, 'Esc로 목차가 닫혀야 한다');
      assert.equal(closed.inert, true, '닫힌 목차는 탭이 들어가지 않아야 한다');
      assert.equal(closed.focusBack, 'archiveBtn', `닫은 뒤 초점은 목차 단추로 돌아와야 한다(지금: ${closed.focusBack})`);
    } finally {
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
});
