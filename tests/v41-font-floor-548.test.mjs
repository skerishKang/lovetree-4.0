// #548 — 화면마다 기준선(부수 글자 12px, 본문·안내·단추 13px)에 못 미치는 글자가 0개인지
// 실제 크롬으로 잰다. 대상: 홈·책·보드·지도·설정·순간 추가 × 390·1440.
// 잰다의 뜻: 화면에 실제로 그려진 글자의 computed font-size(그림자 DOM·안쪽 프레임 포함,
// display:none·visibility:hidden·opacity 0인 글자는 읽을 수 없으므로 제외).
// 크롬(Playwright chromium)이 없는 곳에서는 건너뛴다 — CI(LT_FONT_FLOOR_REQUIRE=1)에서는 건너뜀을 실패로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const REQUIRE = process.env.LT_FONT_FLOOR_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 글자 기준선 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 글자 기준선 시험을 건너뜀'; }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

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
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

// 화면에 그려진 글자(직접 텍스트 노드를 가진 요소)의 크기를 모은다. 그림자 DOM·안쪽 프레임까지.
const COLLECT = () => {
  const seen = new Map();
  const walk = (doc, tag) => {
    for (const el of doc.querySelectorAll('*')) {
      let hasText = false;
      for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { hasText = true; break; }
      if (!hasText) { if (el.shadowRoot) walk(el.shadowRoot, tag); continue; }
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.fontSize) === 0) continue;
      // 보이지 않는 글자(opacity 0, 조상 포함)는 읽을 수 없으므로 제외한다.
      let op = 1, n = el;
      while (n) { op *= Number(getComputedStyle(n).opacity || 1); if (op === 0) break; n = n.parentElement; }
      if (op === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const px = parseFloat(cs.fontSize);
      // 단추 판정은 요소 자신이 단추일 때(카드 단추 안의 부수 마크까지 단추로 세면 안 된다).
      const interactive = /^(button|a)$/i.test(el.tagName) || el.getAttribute('role') === 'button';
      const key = tag + '|' + px + '|' + (interactive ? 'i' : 't') + '|' + el.textContent.trim().slice(0, 30);
      if (!seen.has(key)) seen.set(key, { screen: tag, px, interactive, text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40) });
      if (el.shadowRoot) walk(el.shadowRoot, tag);
    }
  };
  walk(document, '셸');
  for (const f of Array.from(window.frames)) { try { walk(f.document, '안:' + (f.name || f.location.pathname.split('/').pop())); } catch {} }
  return [...seen.values()];
};

test('#548 기준선: 여섯 화면(390·1440)에서 12px 미만 글자 0개, 단추 13px 미만 0개', { skip: REQUIRE ? false : skip, timeout: 420000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const offenders = [];
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 852 : 900 }, reducedMotion: 'reduce' });
      await context.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
      const page = await context.newPage();
      for (const [name, url] of [
        ['홈', `${base}/v41/#home`],
        ['책', `${base}/v41/#book`],
        ['보드', `${base}/v41/#board`],
        ['지도', `${base}/v41/#network`],
      ]) {
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForTimeout(2200);
        for (const row of await page.evaluate(COLLECT)) {
          if (row.px < 12 || (row.interactive && row.px < 13)) offenders.push({ 화면: `${width}-${name}`, ...row });
        }
      }
      // 설정 창(셸 모달)과 순간 추가 창도 같은 기준선을 적용한다.
      await page.goto(`${base}/v41/#home`, { waitUntil: 'load' });
      await page.waitForTimeout(1800);
      for (const [name, id] of [['설정', 'account-settings'], ['순간 추가', 'write-panel']]) {
        await page.evaluate((dialogId) => document.getElementById(dialogId).showModal(), id);
        await page.waitForTimeout(350);
        for (const row of await page.evaluate(COLLECT)) {
          if (row.px < 12 || (row.interactive && row.px < 13)) offenders.push({ 화면: `${width}-${name}`, ...row });
        }
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
      }
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
  assert.deepEqual(offenders, [], `기준선 미만 글자 ${offenders.length}건: ` + offenders.slice(0, 6).map(o => `${o.화면} ${o.px}px ${o.text}`).join(' · '));
});
