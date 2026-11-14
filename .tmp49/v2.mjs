import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(process.argv[2]);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const makeTree = ({ n, urls, owned }) => {
  const moments = Array.from({ length: n }, (_, i) => ({ id: 's' + i, title: '모은 순간 ' + (i + 1), date: '2026-01-01', emotion: '설렘', note: '메모 ' + (i + 1), parentId: i ? 's0' : null, relation: '', url: urls && i ? 'https://youtu.be/dQw4w9WgXcQ' : '', x: null, y: null, rot: 0, color: 'violet', keywords: [] }));
  const edges = []; for (let i = 1; i < n; i++) edges.push({ id: 'e' + i, kind: 'parent', from: 's0', to: 's' + i, reason: '' });
  return { id: 'star' + n, title: '모아둔 ' + n, moments, edges };
};
const server = createServer(async (req, res) => {
  const clean = decodeURIComponent((req.url || '/').split('?')[0]);
  const m = clean.match(/^\/__h\.html\??(.*)$/);
  if (m) {
    const q = new URLSearchParams(m[1]);
    const tree = makeTree({ n: Number(q.get('n') || 26), urls: q.get('urls') === '1', owned: q.get('owned') === '1' });
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body data-member="in" data-record-source="server">
<script>window.LT41={source:'server',writable:true,owned:${q.get('owned') === '1'},momentId:'s0',prefs:{},tree:${JSON.stringify(tree)}};</script>
<iframe src="/v41/views/track58-pinboard.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;
    res.writeHead(200, { 'content-type': MIME['.html'] }); res.end(html); return;
  }
  for (const file of [path.join(ROOT, clean), path.join(ROOT, clean, 'index.html')]) {
    try { if ((await stat(file)).isFile()) { res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(res); return; } } catch {}
  }
  res.writeHead(404); res.end('nf');
});
await new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const variants = [
  ['A 메모만(urls=0,owned=1)', '/__h.html?urls=0&owned=1'],
  ['B 링크 있음·자동아님(urls=1,owned=0)', '/__h.html?urls=1&owned=0'],
  ['C 썸네일 자동(urls=1,owned=1)', '/__h.html'],
];
for (const [label, qs] of variants) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const t0 = Date.now();
  await page.goto(base + qs, { waitUntil: 'domcontentloaded' });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) { frame = page.frames().find((f) => f !== page.mainFrame() && /views\/track58-pinboard/.test(f.url())); if (!frame) await page.waitForTimeout(250); }
  let result;
  try {
    await frame.waitForSelector('.surface', { timeout: 10000 });
    await frame.waitForFunction(() => document.querySelectorAll('#cardLayer .card').length > 0, null, { timeout: 10000 });
    result = 'OK cards=' + await frame.evaluate(() => document.querySelectorAll('#cardLayer .card').length);
  } catch (e) {
    const alive = await Promise.race([page.mainFrame().evaluate(() => 1 + 1).then(() => 'main-frame 살아있음'), new Promise((r) => setTimeout(() => r('main-frame도 막힘'), 4000))]);
    result = 'FAIL (' + String(e).split('\n')[0].slice(0, 60) + ') / ' + alive;
  }
  console.log(label, '→', result, `(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  await context.close();
}
await browser.close(); server.close();
