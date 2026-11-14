// #611 새 소식 화면: 알림 카드(한 번만) · 계정 단추 점 · 로그아웃 입구 · 출처 문구.
// 크롬이 필요한 실행형 시험이라 LT_UPDATES_611_REQUIRE=1 에서만 돈다(미리보기 검사 잡에 연결).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../public', import.meta.url)));
const REQUIRE = process.env.LT_UPDATES_611_REQUIRE === '1';
let chromium = null;
let skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright chromium이 설치되어 있지 않아 실행 시험을 건너뜀';
} catch {
  skip = 'playwright 패키지가 없어 실행 시험을 건너뜀';
}
if (REQUIRE && skip) throw new Error(`LT_UPDATES_611_REQUIRE=1 인데 실행 시험을 건너뛴다: ${skip}`);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
function hostHtml() {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="stylesheet" href="/v41/shell.css"><link rel="stylesheet" href="/v41/identity.css"></head><body>
<button type="button" class="account-avatar" id="account-avatar">나</button>
<button type="button" id="account-updates">새 소식</button>
<button type="button" id="settings-updates-open">새 소식 보기</button>
<div id="updates-card" class="updates-card" role="status" hidden><p class="updates-card-text" id="updates-card-text"></p><div class="updates-card-actions"><button type="button" id="updates-view">보기</button><button type="button" id="updates-dismiss" aria-label="새 소식 알림 닫기">×</button></div></div>
<div class="home-links"><button type="button" id="updates-link" class="feedback-link">새 소식</button></div>
<dialog id="updates-panel" data-lt-panel="full" aria-labelledby="updates-title"><div class="panel-heading"><div><span class="eyebrow">새 소식</span><h2 id="updates-title">새 소식</h2></div></div>
<div id="updates-list" class="updates-list"></div></dialog>
<script type="module">
import { mountUpdates } from '/v41/updates.mjs';
const $ = id => document.getElementById(id);
const mount = mountUpdates({ $, showPanel: id => $(id).showModal(), onDot: unread => $('account-avatar').classList.toggle('has-dot', !!unread) });
$('account-updates').onclick = () => mount.openUpdates();
$('updates-link').onclick = () => mount.openUpdates();
$('settings-updates-open').onclick = () => mount.openUpdates();
window.__updatesDot = null;
const probe = setInterval(() => {
  const avatar = $('account-avatar');
  window.__updatesDot = avatar.classList.contains('has-dot');
}, 50);
mount.start();
</script></body></html>`;
}
function serve() {
  const server = createServer(async (req, res) => {
    const url = req.url || '/';
    if (url.startsWith('/host611')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(hostHtml());
      return;
    }
    const clean = decodeURIComponent(url.split('?')[0]);
    for (const file of [path.join(ROOT, clean), path.join(ROOT, clean, 'index.html')]) {
      if (!file.startsWith(ROOT)) continue;
      try { if ((await stat(file)).isFile()) { res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(res); return; } } catch {}
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

let server, base;
test.before(async () => { server = await serve(); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise((ok) => server.close(ok)));

test('611 실행: 새 소식은 로그아웃 상태에서도 보이고, 알림 카드는 한 번만 뜬다', { skip }, async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await page.goto(`${base}/host611`, { waitUntil: 'load' });
    // 로그아웃 입구: 작은 링크 '새 소식'이 보인다(계정은 필요 없다).
    const link = page.locator('#updates-link');
    await link.waitFor({ state: 'visible', timeout: 8000 });
    assert.equal(await link.textContent(), '새 소식');
    // 첫 접속: 작은 카드 "러브트리가 새로워졌어요 — 4.1.3"가 한 번 뜬다.
    const card = page.locator('#updates-card');
    await card.waitFor({ state: 'visible', timeout: 8000 });
    assert.match(await page.locator('#updates-card-text').textContent(), /4\.1\.3/);
    assert.equal(await page.evaluate(() => document.getElementById('account-avatar').classList.contains('has-dot')), true, '계정 단추에 작은 점이 뜬다');
    // 닫으면 그 버전은 다시 안 뜬다.
    await page.click('#updates-dismiss');
    await page.waitForFunction(() => document.getElementById('updates-card').hidden, null, { timeout: 5000 });
    // 로그아웃 입구로 새 소식 창을 연다.
    await page.click('#updates-link');
    const panel = page.locator('#updates-panel');
    await panel.waitFor({ state: 'attached' });
    await page.waitForFunction(() => document.getElementById('updates-panel').open, null, { timeout: 5000 });
    const text = await page.locator('#updates-list').textContent();
    assert.match(text, /러브트리 4\.1\.3/, '버전 제목');
    assert.match(text, /새로워진 것/, '새로워진 것');
    assert.match(text, /고친 것/, '고친 것');
    assert.match(text, /AI 테스터가 찾아 준 것 · 윤제/, '출처 표시');
    assert.match(text, /핀보드/, '첫 노트 항목');
    assert.doesNotMatch(text, /여러분이/, '금지 문국이 없다');
    assert.doesNotMatch(text, /이슈 #|#[0-9]{2,}/, '이슈 번호를 보여 주지 않는다');
    assert.equal(await page.evaluate(() => document.getElementById('account-avatar').classList.contains('has-dot')), false, '새 소식을 보면 점이 사라진다');
    await page.evaluate(() => document.getElementById('updates-panel').close());
    // 새로고침(같은 저장소): 카드·점이 다시 뜨지 않는다.
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#updates-card').evaluate(el => el.hidden), true, '다시 접속하면 카드를 안 보인다');
    assert.equal(await page.evaluate(() => document.getElementById('account-avatar').classList.contains('has-dot')), false, '점도 다시 안 뜬다');
    assert.deepEqual(errors, [], '페이지 오류 없음');
    await ctx.close();
  } finally {
    await browser.close();
  }
});

test('611 실행: 390에서도 작은 카드와 새 소식 창이 보인다', { skip }, async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`${base}/host611`, { waitUntil: 'load' });
    const card = page.locator('#updates-card');
    await card.waitFor({ state: 'visible', timeout: 8000 });
    const box = await card.boundingBox();
    assert.ok(box && box.width <= 390, '카드는 390 화면 안에 든다');
    await page.click('#updates-link');
    await page.waitForFunction(() => document.getElementById('updates-panel').open, null, { timeout: 5000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, '가로 넘침이 없다');
    await ctx.close();
  } finally {
    await browser.close();
  }
});
