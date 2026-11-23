import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
const out=process.argv[2];
const layer=process.argv.find(x=>x.startsWith('--layer='))?.slice(8);
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
      await f.waitForFunction(()=>{const s=document.querySelector('main#orbit')?.shadowRoot;return s&&globalThis.__LT_ORBIT_TEST__?.canvasReady()&&[...s.querySelectorAll('.card:not(.off)')].filter(e=>e.style.transform).length>=9;});
      if(layer)await f.evaluate(l=>{const root=document.querySelector('main#orbit').shadowRoot,style=document.createElement('style');style.textContent=({vignette:'.app::before{display:none}',scrim:'.center-scrim{display:none}',background:'.app{background:#040407}',buttons:'.subtleBtn{backdrop-filter:none}'})[l];root.append(style);},layer);
      await page.waitForTimeout(1500);
      const facts=await f.evaluate(()=>{const h=document.querySelector('main#orbit'),cs=[...h.shadowRoot.querySelectorAll('.card:not(.off)')];return {renderer:globalThis.__LT_ORBIT_TEST__.renderer(),blurStages:globalThis.__LT_ORBIT_TEST__.blurStages(),theme:h.getAttribute('data-lt-theme')||document.documentElement.getAttribute('data-lt-theme')||'night',cards:cs.length,imgs:cs.flatMap(e=>[...e.querySelectorAll('img')]).map(i=>({ready:i.complete&&i.naturalWidth>0,w:i.naturalWidth,h:i.naturalHeight}))};});
      if(facts.renderer!=='webgl')throw Error('WebGL 미동작 '+facts.renderer);
      if(facts.theme!==theme)throw Error('테마 불일치 '+JSON.stringify(facts));
      console.log('측정 시작',width,theme,JSON.stringify(facts));
      const cdp=await ctx.newCDPSession(page);
      const done=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
      await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline,cc,gpu',transferMode:'ReturnAsStream'});
      const sample=await f.evaluate(async()=>{
        const groups=[];const initial=globalThis.__LT_ORBIT_TEST__.lastWriteAt();
        for(let group=0;group<3;group++)groups.push(await new Promise(resolve=>{
          const frames=[];let start;
          function tick(now){if(start===undefined)start=now;performance.mark('orbit1086-'+group+'-'+frames.length);frames.push(now);if(now-start>=10000)resolve(frames);else requestAnimationFrame(tick);}
          requestAnimationFrame(tick);
        }));
        return {groups,advanced:globalThis.__LT_ORBIT_TEST__.lastWriteAt()-initial};
      });
      if(sample.advanced<30000)throw Error('궤도 움직임 미충족 '+sample.advanced);
      console.log('표본',width,theme,sample.groups.map(x=>x.length));
      await writeFile(path.join(out,width+'-'+theme+'.raw-sample.json'),JSON.stringify(sample));
      await cdp.send('Tracing.end');const {stream}=await done;
      let data='';while(true){const r=await cdp.send('IO.read',{handle:stream});data+=r.data;if(r.eof)break;}await cdp.send('IO.close',{handle:stream});
      const events=JSON.parse(data).traceEvents;
      const categories={style:/^(UpdateLayoutTree|RecalculateStyles|AnimationFrame::StyleAndLayout)$/,layout:/^Layout$/,paint:/^(Paint|PrePaint|PaintImage|RasterTask)$/,composite:/^(CompositeLayers|Layerize|Commit|ActivateLayerTree|DrawFrame|DrawLayers|SubmitCompositorFrame)$/,decode:/^(Decode Image|ImageDecodeTask|DecodeImage)$/,script:/^(FunctionCall|EvaluateScript|FireAnimationFrame|TimerFire|V8.Execute|RunMicrotasks)$/};
      function union(intervals){intervals.sort((a,b)=>a[0]-b[0]);let total=0,end=-Infinity;for(const [a,b] of intervals){total+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}return Math.round(total/100)/10;}
      const groups=sample.groups.map((frames,group)=>{
        const marks=events.filter(e=>e.name.startsWith('orbit1086-'+group+'-')).sort((a,b)=>a.ts-b.ts);
        if(marks.length!==frames.length)throw Error('표식 수 불일치 '+marks.length+' vs '+frames.length);
        const spans=[];for(let i=1;i<frames.length;i++){const gap=frames[i]-frames[i-1];if(gap<=50)continue;
          const a=marks[i-1].ts,b=marks[i].ts;const relevant=events.filter(e=>e.ph==='X'&&e.dur&&e.ts<b&&e.ts+e.dur>a);
          const parts=Object.fromEntries(Object.entries(categories).map(([k,re])=>[k,union(relevant.filter(e=>re.test(e.name)).map(e=>[Math.max(a,e.ts),Math.min(b,e.ts+e.dur)]))]));
          spans.push({at:Math.round(frames[i-1]-frames[0]),gap:Math.round(gap*10)/10,...parts});
        }
        const gaps=frames.slice(1).map((t,i)=>t-frames[i]);
        return {n:gaps.length,median:[...gaps].sort((a,b)=>a-b)[Math.floor(gaps.length/2)],max:Math.max(...gaps),over50:spans.length,spans};
      });
      const spans=groups.flatMap(g=>g.spans);
      const maxima=Object.fromEntries(Object.keys(categories).map(k=>[k,spans.length?Math.max(...spans.map(s=>s[k])):0]));
      const result={width,theme,facts,groups,maxima};
      results.push(result);console.log(JSON.stringify({...result,groups:groups.map(({spans,...g})=>g)}));
      await writeFile(path.join(out,width+'-'+theme+'.trace.json'),data);
      await f.evaluate(async()=>{globalThis.__LT_ORBIT_TEST__.hold(true);globalThis.__LT_ORBIT_TEST__.seek(.2);const s=document.querySelector('main#orbit').shadowRoot;for(const a of s.getAnimations())if(a.id==='lt-float'){a.pause();a.currentTime=0;}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
      await page.screenshot({path:path.join(out,width+'-'+theme+'.png')});
      await writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    }finally{await ctx.close();}
  }
}finally{try{await browser?.close();}finally{server.close();}}
