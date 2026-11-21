import { createRequire } from 'module';
const require = createRequire(new URL('../../package.json', import.meta.url).pathname);
const { chromium } = require('playwright');

const URL = 'https://lovetree-4-0.pages.dev/v41/';
const variant = process.argv[2] || 'base'; // base | noblur

const browser = await chromium.launch({ headless: false, args: ['--window-position=-2400,0','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-features=CalculateNativeWinOcclusion'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
let reqs = 0, bytes = 0; const byType = {};
page.on('response', async r => { reqs++; try { const b = (await r.body()).length; bytes += b; const t = r.request().resourceType(); byType[t] = (byType[t]||0) + b; } catch {} });

await ctx.addInitScript((variant) => {
  window.__lt = { lt: [], frames: [] };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch {}
  let last = performance.now();
  const tick = (now) => { window.__lt.frames.push([Math.round(now), Math.round(now - last)]); last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  if (variant === 'noblur') document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '*{filter:none!important;backdrop-filter:none!important}'; document.head.appendChild(s); });
}, variant);

const t = Date.now();
await page.goto(URL, { waitUntil: 'load' });
const loadMs = Date.now() - t;
await page.waitForTimeout(11000);

function summarize(name, x) {
  const fr = x.frames.slice(1);
  const win = (a, b) => fr.filter(([ts]) => ts >= a && ts < b);
  const s = (arr) => ({ n: arr.length, over33: arr.filter(f => f[1] > 33).length, over50: arr.filter(f => f[1] > 50).length, max: Math.max(0, ...arr.map(f => f[1])) });
  const lt = x.lt; const ltSum = lt.reduce((a, b) => a + b[1], 0);
  console.log('  ' + name, JSON.stringify({ longtasks: lt.length, longtaskMs: ltSum, top: [...lt].sort((a,b)=>b[1]-a[1]).slice(0,5), first4s: s(win(0, 4000)), from4to12s: s(win(4000, 12000)) }));
}
console.log('variant', variant, 'loadMs', loadMs, 'reqs', reqs, 'MB', (bytes/1e6).toFixed(2), JSON.stringify(Object.fromEntries(Object.entries(byType).map(([k,v])=>[k,(v/1e6).toFixed(2)]))));
for (const f of page.frames()) { try { const x = await f.evaluate(() => window.__lt); if (x) summarize(f === page.mainFrame() ? 'shell' : 'frame:' + f.url().split('/').pop().slice(0,40), x); } catch {} }
await browser.close();

