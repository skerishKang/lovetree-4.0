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
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Debugger.enable');
await cdp.send('Runtime.enable');
const contexts = [];
cdp.on('Runtime.executionContextCreated', (e) => contexts.push(e.context));
page.on('dialog', () => console.log('!! dialog 발생'));
await page.goto(base + '/__h.html', { waitUntil: 'domcontentloaded' });
let frame = null;
for (let i = 0; i < 80 && !frame; i++) { frame = page.frames().find((f) => f !== page.mainFrame() && /views\/track58-pinboard/.test(f.url())); if (!frame) await page.waitForTimeout(250); }
await new Promise((r) => setTimeout(r, 4000)); // 카드가 그려질 시점 지나기
cdp.on('Debugger.paused', async (e) => {
  try {
    let found = false;
    for (const ctx of contexts) {
      try {
        const who = await cdp.send('Runtime.evaluate', { contextId: ctx.id, expression: 'location.href', returnByValue: true });
        if (!/track58-pinboard/.test(who.result.value)) continue;
        found = true;
        const r = await cdp.send('Runtime.evaluate', { contextId: ctx.id, returnByValue: true, expression: "JSON.stringify({ready:document.readyState, cards:document.querySelectorAll('#cardLayer .card').length, imgs:document.querySelectorAll('.lt-yt-preview img').length, complete:[...document.querySelectorAll('.lt-yt-preview img')].map(i=>i.complete), natural:[...document.querySelectorAll('.lt-yt-preview img')].map(i=>i.naturalWidth).slice(0,6), src0:(document.querySelector('.lt-yt-preview img')||{}).src})" });
        console.log('프레임 상태:', r.result.value);
        break;
      } catch (e2) { }
    }
    if (!found) console.log('프레임 컨텍스트 못 찾음, contexts=' + contexts.length);
  } catch (err) { console.log('evaluate 실패:', String(err).slice(0, 100)); }
  await cdp.send('Debugger.resume').catch(() => {});
  process.exit(0);
});
await new Promise((r) => setTimeout(r, 3000));
await cdp.send('Debugger.pause');
await new Promise((r) => setTimeout(r, 5000));
await browser.close(); server.close();
