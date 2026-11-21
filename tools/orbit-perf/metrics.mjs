import { createRequire } from 'module';
const require = createRequire(new URL('../../package.json', import.meta.url).pathname);
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: false, args: ['--window-position=-2400,0','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-features=CalculateNativeWinOcclusion'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('https://lovetree-4-0.pages.dev/v41/', { waitUntil: 'load' });
await page.waitForTimeout(5000);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
const get = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
const a = await get();
await page.waitForTimeout(8000);
const b = await get();
const keys = ['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount','RecalcStyleCount','JSHeapUsedSize','Nodes'];
const out = {};
for (const k of keys) out[k] = k.endsWith('Duration') ? +((b[k]-a[k])*1000).toFixed(0) + 'ms/8s' : (k==='JSHeapUsedSize'||k==='Nodes') ? Math.round(b[k]) : (b[k]-a[k]);
console.log(JSON.stringify(out));
// orbit DOM facts in inner frame
for (const f of page.frames()) { if (!f.url().includes('home')) continue;
  const facts = await f.evaluate(() => { const imgs=[...document.images]; const big=imgs.filter(i=>i.naturalWidth>=1000); const anim=document.getAnimations().length;
    const styled=[...document.querySelectorAll('*')].filter(e=>{const s=getComputedStyle(e);return s.filter!=='none'||s.boxShadow!=='none'&&s.transform!=='none'}).length;
    return {imgs:imgs.length, bigImgs:big.length, sampleNatural: imgs.slice(0,3).map(i=>i.naturalWidth+'x'+i.naturalHeight), animations:anim, filteredOrShadowTransformed:styled}; });
  console.log('frame', JSON.stringify(facts)); }
await browser.close();
