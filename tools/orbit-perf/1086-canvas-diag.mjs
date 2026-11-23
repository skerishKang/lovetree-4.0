import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
const out=process.argv[2];
const combos=process.argv.includes('--wide-night')?[[1440,900,'night']]:[[1440,900,'night'],[1440,900,'garden'],[390,844,'night'],[390,844,'garden']];
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{let f=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!f.startsWith(root+path.sep)&&f!==root)throw Error();if(f.endsWith(path.sep))f=path.join(f,'index.html');const b=await readFile(f);res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base='http://127.0.0.1:'+server.address().port;
let browser;
const results=[];
try{
  browser=await chromium.launch({headless:true});
  await mkdir(out,{recursive:true});
  for(const [width,height,theme] of combos){
    const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'no-preference'});
    try{
      await ctx.addInitScript(t=>{localStorage.setItem('lt41.theme',t);},theme);
      await ctx.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
      const page=await ctx.newPage();
      await page.goto(base+'/v41/',{waitUntil:'load'});
      let f;for(let i=0;i<80;i++){f=page.frames().find(x=>x.url().includes('home.html'));if(f)break;await page.waitForTimeout(250);}
      if(!f)throw Error('첫 화면 문서 없음');
      await f.waitForFunction(()=>{const s=document.querySelector('main#orbit')?.shadowRoot;return s&&globalThis.__LT_ORBIT_TEST__&&[...s.querySelectorAll('.card:not(.off)')].filter(e=>e.style.transform).length>=9;});
      await page.waitForTimeout(1500);
      const facts=await f.evaluate(()=>{const h=document.querySelector('main#orbit'),cs=[...h.shadowRoot.querySelectorAll('.card:not(.off)')];return {theme:h.getAttribute('data-lt-theme')||document.documentElement.getAttribute('data-lt-theme')||'night',cards:cs.length,imgs:cs.flatMap(e=>[...e.querySelectorAll('img')]).map(i=>({ready:i.complete&&i.naturalWidth>0,w:i.naturalWidth,h:i.naturalHeight}))};});
      if(facts.theme!==theme)throw Error('테마 불일치 '+JSON.stringify(facts));
      console.log('측정 시작',width,theme,JSON.stringify(facts));
      console.log(JSON.stringify(await f.evaluate(()=>{const s=document.querySelector("main#orbit").shadowRoot,c=s.querySelector(".orbit-canvas"),p=globalThis.__LT_ORBIT_TEST__;return {canvasReady:p.canvasReady(),poses:p.poses().slice(0,8),canvas:[c.width,c.height],world:s.querySelector(".world").className,card:s.querySelector(".card").style.transform,apps:[c.getBoundingClientRect().width,c.getBoundingClientRect().height]}}))); await page.screenshot({path:out+"/diag.png"});
    }finally{await ctx.close();}
  }
}finally{try{await browser?.close();}finally{server.close();}}
