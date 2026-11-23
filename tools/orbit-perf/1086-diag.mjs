import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
const out=process.argv[2];
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{let f=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!f.startsWith(root+path.sep)&&f!==root)throw Error();if(f.endsWith(path.sep))f=path.join(f,'index.html');const b=await readFile(f);res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const results=[];
try{
  await mkdir(out,{recursive:true});
  for(const [width,height] of [[1440,900]])for(const theme of ['night'])for(const variant of ['float-paused','filter-off','shadow-off']){
    const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'no-preference'});
    try{
      await ctx.addInitScript(t=>{localStorage.setItem('lt41.theme',t);},theme);
      await ctx.route('**/*', route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
      const page=await ctx.newPage();
      await page.goto(base+'/v41/',{waitUntil:'load'});
      let f;for(let i=0;i<80;i++){f=page.frames().find(x=>x.url().includes('home.html'));if(f)break;await page.waitForTimeout(250);}
      if(!f)throw Error('home frame missing');
      await f.waitForFunction(()=>{const s=document.querySelector('main#orbit')?.shadowRoot;return s&&globalThis.__LT_ORBIT_TEST__&&[...s.querySelectorAll('.card:not(.off)')].filter(e=>e.style.transform).length>=9;});
      console.log('ready',width,theme);
      await f.evaluate(variant=>{const s=document.querySelector('main#orbit').shadowRoot;if(variant==='float-paused'){for(const a of s.getAnimations())if(a.id==='lt-float')a.pause();}else{const st=document.createElement('style');st.textContent=variant==='filter-off'?'.card,.card img{filter:none!important}':'.card,.card *{box-shadow:none!important}';s.append(st);}},variant);
      await page.waitForTimeout(1500);
      const cdp=await ctx.newCDPSession(page);
      const done=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
      console.log('trace start',width,theme);
      await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline,cc,gpu',transferMode:'ReturnAsStream'});
      const sample=await f.evaluate(()=>new Promise(resolve=>{
        const frames=[];let start;
        function tick(now){if(start===undefined)start=now;performance.mark('orbit1086-'+frames.length);frames.push(now);if(now-start>=10000)resolve(frames);else requestAnimationFrame(tick);}
        requestAnimationFrame(tick);
      }));
      console.log('sample',sample.length);await cdp.send('Tracing.end');const {stream}=await done;
      let data='';while(true){const r=await cdp.send('IO.read',{handle:stream});data+=r.data;if(r.eof)break;}await cdp.send('IO.close',{handle:stream});
      const events=JSON.parse(data).traceEvents;
      const marks=events.filter(e=>/^orbit1086-\d+$/.test(e.name)).sort((a,b)=>a.ts-b.ts);
      if(marks.length!==sample.length)throw Error('mark count '+marks.length+' vs '+sample.length);
      const categories={style:/^(UpdateLayoutTree|RecalculateStyles|AnimationFrame::StyleAndLayout)$/,layout:/^Layout$/,paint:/^(Paint|PrePaint|PaintImage|RasterTask)$/,composite:/^(CompositeLayers|Layerize|Commit|ActivateLayerTree|DrawFrame|DrawLayers|SubmitCompositorFrame)$/,decode:/^(Decode Image|ImageDecodeTask|DecodeImage)$/,script:/^(FunctionCall|EvaluateScript|FireAnimationFrame|TimerFire|V8.Execute|RunMicrotasks)$/};
      function union(intervals){intervals.sort((a,b)=>a[0]-b[0]);let total=0,end=-Infinity;for(const [a,b] of intervals){total+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}return Math.round(total/100)/10;}
      const spans=[];for(let i=1;i<sample.length;i++){const gap=sample[i]-sample[i-1];if(gap<=50)continue;
        const a=marks[i-1].ts,b=marks[i].ts;const relevant=events.filter(e=>e.ph==='X'&&e.dur&&e.ts<b&&e.ts+e.dur>a);
        const parts=Object.fromEntries(Object.entries(categories).map(([k,re])=>[k,union(relevant.filter(e=>re.test(e.name)).map(e=>[Math.max(a,e.ts),Math.min(b,e.ts+e.dur)]))]));
        const top=relevant.filter(e=>e.dur>5000&&!/ThreadController|RunTask|SequenceManager/.test(e.name)).sort((x,y)=>y.dur-x.dur).slice(0,5).map(e=>[e.name,Math.round(e.dur/100)/10]);
        spans.push({at:Math.round(sample[i-1]-sample[0]),gap:Math.round(gap*10)/10,...parts,top});
      }
      const gaps=sample.slice(1).map((t,i)=>t-sample[i]);const result={width,theme,variant,n:gaps.length,median:gaps.sort((a,b)=>a-b)[Math.floor(gaps.length/2)],max:Math.max(...gaps),over50:spans.length,spans};
      results.push(result);console.log(JSON.stringify({...result,spans:spans.slice(0,5)}));
      await writeFile(path.join(out,width+'-'+theme+'-'+variant+'.trace.json'),data);
      await f.evaluate(()=>{globalThis.__LT_ORBIT_TEST__.hold(true);globalThis.__LT_ORBIT_TEST__.seek(.2);for(const a of document.getAnimations({subtree:true}))if(a.id==='lt-float'){a.pause();a.currentTime=0;}});
      await page.screenshot({path:path.join(out,width+'-'+theme+'-'+variant+'.png')});
      await writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    } finally {await ctx.close();}
  }
} finally {await browser.close();server.close();}
