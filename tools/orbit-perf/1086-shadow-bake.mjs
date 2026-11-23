import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.argv[2]),out=path.resolve('public/media/orbit/shadow');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{let f=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!f.startsWith(root+path.sep)&&f!==root)throw Error();if(f.endsWith(path.sep))f=path.join(f,'index.html');const b=await readFile(f);res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base='http://127.0.0.1:'+server.address().port,shapes=new Map(),manifest={};
let browser;try{
 browser=await chromium.launch({headless:true});
 for(const [width,height] of [[1440,900],[390,844]]){
  const ctx=await browser.newContext({viewport:{width,height}});
  try{
   await ctx.addInitScript(()=>localStorage.setItem('lt41.theme','garden'));
   await ctx.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
   const p=await ctx.newPage();await p.goto(base+'/v41/');
   let f;for(let i=0;i<80;i++){f=p.frames().find(x=>x.url().includes('home.html'));if(f)break;await p.waitForTimeout(250);}
   await f.waitForFunction(()=>document.querySelector('main#orbit')?.shadowRoot?.querySelectorAll('.card:not(.off)').length>=9);
   const list=await f.evaluate(()=>[...document.querySelector('main#orbit').shadowRoot.querySelectorAll('.card:not(.off)')].map(el=>{const c=getComputedStyle(el);return {w:el.offsetWidth,h:el.offsetHeight,r:c.borderTopLeftRadius,shadow:c.boxShadow};}));
   for(const s of list)if(s.w&&s.h&&s.shadow.includes('75, 51, 42'))shapes.set(s.w+'x'+s.h+'x'+parseFloat(s.r),s);
  }finally{await ctx.close();}
 }
 if(!shapes.size)throw Error('garden shadow unavailable');
 await mkdir(out,{recursive:true});
 for(const [key,s] of shapes){
  manifest[key]={shadow:s.shadow};
  for(const dpr of [1,2]){
   const w=s.w+192,h=s.h+192,ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:dpr});
   try{
    const p=await ctx.newPage();
    await p.setContent('<style>html,body{margin:0;background:transparent}div{position:absolute;left:96px;top:96px;width:'+s.w+'px;height:'+s.h+'px;border-radius:'+s.r+';box-shadow:'+s.shadow+'}</style><div></div>');
    await p.screenshot({path:path.join(out,key+'-'+dpr+'.png'),omitBackground:true});
   }finally{await ctx.close();}
  }
 }
 await writeFile('src/views/orbit-shadow.json',JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify(manifest));
}finally{try{await browser?.close();}finally{server.close();}}
