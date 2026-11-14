import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(process.argv[2]);
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
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="#8a7a92"/></svg>';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const problems = [];
const page = await context.newPage();
page.on('pageerror', (e) => problems.push('pageerror: ' + String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 150)); });
page.on('requestfailed', (r) => problems.push('reqfail: ' + r.url().slice(0, 80) + ' ' + (r.failure()?.errorText || '')));
page.on('request', (r) => { if (!r.url().startsWith(base)) problems.push('req-out: ' + r.url().slice(0, 80)); });
await context.route('**/i.ytimg.com/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: SVG }));
await page.goto(base + '/__h.html', { waitUntil: 'domcontentloaded' });
let frame = null;
for (let i = 0; i < 80 && !frame; i++) { frame = page.frames().find((f) => f !== page.mainFrame() && /views\/track58-pinboard/.test(f.url())); if (!frame) await page.waitForTimeout(250); }
console.log('frame found:', !!frame, 'url:', frame?.url().slice(0, 60));
try {
  await frame.waitForSelector('.surface', { timeout: 20000 });
  console.log('surface ok');
  await frame.waitForFunction(() => document.querySelectorAll('#cardLayer .card').length > 0, null, { timeout: 20000 });
  console.log('cards ok:', await frame.evaluate(() => document.querySelectorAll('#cardLayer .card').length));
} catch (e) { console.log('WAIT FAIL:', String(e).split('\n')[0]); }
console.log('problems:', problems.slice(0, 8).join(' | ') || 'none');
await browser.close(); server.close();
