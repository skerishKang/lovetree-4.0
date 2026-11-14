import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(process.argv[2]);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const starTree = (n, urls) => {
  const moments = Array.from({ length: n }, (_, i) => ({ id: 's' + i, title: '모은 순간 ' + (i + 1), date: '2026-01-01', emotion: '설렘', note: '메모 ' + (i + 1), parentId: i ? 's0' : null, relation: '', url: urls && i ? 'https://youtu.be/dQw4w9WgXcQ' : '', x: null, y: null, rot: 0, color: 'violet', keywords: [] }));
  const edges = []; for (let i = 1; i < n; i++) edges.push({ id: 'e' + i, kind: 'parent', from: 's0', to: 's' + i, reason: '' });
  return { id: 'star' + n, title: '모아둔 ' + n, moments, edges };
};
const server = createServer(async (req, res) => {
  const clean = decodeURIComponent((req.url || '/').split('?')[0]);
  if (clean === '/__h.html') {
    const tree = starTree(26, true);
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body data-member="in" data-record-source="server">
<script>window.LT41={source:'server',writable:true,owned:true,momentId:'s0',prefs:{},tree:${JSON.stringify(tree)}};</script>
<iframe src="/v41/views/track58-pinboard.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;
    res.writeHead(200, { 'content-type': MIME['.html'] }); require('node:fs').writeFileSync('dump-m3.html', html); res.end(html); return;
  }
  for (const file of [path.join(ROOT, clean), path.join(ROOT, clean, 'index.html')]) {
    try { if ((await stat(file)).isFile()) { res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(res); return; } } catch {}
  }
  res.writeHead(404); res.end('nf');
});
await new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
const base = `http://127.0.0.1:${server.address().port}`;
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="#8a7a92"/></svg>';
const browser = await chromium.launch({ headless: true });
const cases = () => [
  ['1 route-fulfill(SVG)', (ctx) => ctx.route(/i\.ytimg\.com/, (r) => r.fulfill({ contentType: 'image/svg+xml', body: SVG }))],
  ['2 route-abort', (ctx) => ctx.route(/i\.ytimg\.com/, (r) => r.abort())],
  ['3 route-fulfill(png)', (ctx) => ctx.route(/i\.ytimg\.com/, (r) => r.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }))],
  ['4 route 없음(실제 네트워크)', () => {}],
];
const chosen = [['4 solo', () => {}]];
for (const [label, setup] of chosen) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await setup(context);
  const page = await context.newPage();
  page.on('requestfinished',(r)=>{if(/ytimg/.test(r.url()))console.log('  [ytimg 완료]',Date.now()-t0,'ms');});
  page.on('requestfailed',(r)=>{if(/ytimg/.test(r.url()))console.log('  [ytimg 실패]',Date.now()-t0,'ms',r.failure()?.errorText);});
  const t0 = Date.now();
  await page.goto(base + '/__h.html', { waitUntil: 'domcontentloaded' });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) { frame = page.frames().find((f) => f !== page.mainFrame() && /views\/track58-pinboard/.test(f.url())); if (!frame) await page.waitForTimeout(250); }
  let result;
  try {
    await frame.waitForSelector('.surface', { timeout: 12000 });
    await frame.waitForFunction(() => document.querySelectorAll('#cardLayer .card').length > 0, null, { timeout: 12000 });
    result = 'OK cards=' + await frame.evaluate(() => document.querySelectorAll('#cardLayer .card').length);
  } catch (e) {
    const alive = await Promise.race([page.mainFrame().evaluate(() => 1 + 1).then(() => 'main 살아있음'), new Promise((r) => setTimeout(() => r('main 막힘'), 4000))]);
    result = 'FAIL / ' + alive;
  }
  console.log(label, '→', result, `(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  await context.close();
}
await browser.close(); server.close();
