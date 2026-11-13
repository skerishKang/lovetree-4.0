import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
const ROOT = process.argv[2];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const starTree = (n) => {
  const moments = Array.from({ length: n }, (_, i) => ({ id: 's' + i, title: '모은 순간 ' + (i + 1), date: '2026-01-01', emotion: '설렘', note: '메모 ' + (i + 1), parentId: i ? 's0' : null, relation: '', url: i ? 'https://youtu.be/dQw4w9WgXcQ' : '', x: null, y: null, rot: 0, color: 'violet', keywords: [] }));
  const edges = []; for (let i = 1; i < n; i++) edges.push({ id: 'e' + i, kind: 'parent', from: 's0', to: 's' + i, reason: '' });
  return { id: 'star' + n, title: '모아둔 ' + n, moments, edges };
};
const hostHTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body data-member="in" data-record-source="server">
<script>window.LT41={source:'server',writable:true,owned:true,momentId:'s0',prefs:{},tree:${JSON.stringify(starTree(26))}};</script>
<iframe src="/v41/views/track58-pinboard.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;
const server = createServer(async (req, res) => {
  const clean = decodeURIComponent((req.url || '/').split('?')[0]);
  if (clean === '/__h.html') { res.writeHead(200, { 'content-type': MIME['.html'] }); res.end(hostHTML); return; }
  for (const file of [path.join(ROOT, clean), path.join(ROOT, clean, 'index.html')]) {
    try { if ((await stat(file)).isFile()) { res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(res); return; } } catch {}
  }
  res.writeHead(404); res.end('nf');
});
await new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
// i.ytimg.com 요청을 즉시 끊는다(CI에서의 외부 그림 실패 흉내).
await context.route('**/i.ytimg.com/**', () => {});
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)); });
await page.goto(base + '/__h.html', { waitUntil: 'domcontentloaded' });
let frame;
for (let i = 0; i < 80 && !frame; i++) { frame = page.frames().find((f) => f !== page.mainFrame() && /track58-pinboard/.test(f.url())); if (!frame) await page.waitForTimeout(250); }
console.log('frame found:', !!frame);
try {
  await frame.waitForSelector('.surface', { timeout: 10000 });
  console.log('surface ok');
} catch (e) { console.log('surface FAIL', String(e).slice(0, 120)); }
try {
  await frame.waitForFunction(() => document.querySelectorAll('#cardLayer .card').length > 0, null, { timeout: 15000 });
  const n = await frame.evaluate(() => document.querySelectorAll('#cardLayer .card').length);
  console.log('cards ok:', n);
} catch (e) { console.log('cards FAIL', String(e).slice(0, 120)); }
await browser.close(); server.close();
