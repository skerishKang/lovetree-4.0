import { listenOnSafePort } from './helpers/safe-port.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {cardPose,hitProjective,sortPaintOrder} from '../src/views/orbit-canvas.js';
import {orbitMatrix} from '../src/views/orbit-webgl.js';
const M=(a,b)=>a.map(row=>b[0].map((_,j)=>row.reduce((sum,v,k)=>sum+v*b[k][j],0)));
const T=(x,y,z=0)=>[[1,0,0,x],[0,1,0,y],[0,0,1,z],[0,0,0,1]];
const S=s=>[[s,0,0,0],[0,s,0,0],[0,0,1,0],[0,0,0,1]];
const X=a=>[[1,0,0,0],[0,Math.cos(a),-Math.sin(a),0],[0,Math.sin(a),Math.cos(a),0],[0,0,0,1]];
const Y=a=>[[Math.cos(a),0,Math.sin(a),0],[0,1,0,0],[-Math.sin(a),0,Math.cos(a),0],[0,0,0,1]];
const Z=a=>[[Math.cos(a),-Math.sin(a),0,0],[Math.sin(a),Math.cos(a),0,0],[0,0,1,0],[0,0,0,1]];
const P=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,-1/1200,1]];
test('#1086 원근 행렬과 실제 카드 누름 판정',()=>{
 const toRad=x=>x*Math.PI/180;
 for(const [w,h] of [[1440,836],[390,780]])for(const values of [[1200,100,-200,0,.8,10,25,-13],[1200,-260,110,0,1.5,-17,35,22],[1200,0,0,0,.6,0,0,0]]){
  const bw=180,bh=232,fx=7.5,fy=-12.2;
  const pose=cardPose(values,w,h,bw,bh,fx,fy),m=orbitMatrix(pose,w,h,new Float64Array(16));
  const css=[T(w/2+bw/2,h/2+bh/2),P,T(values[1],values[2]),S(values[4]),X(toRad(values[5])),Y(toRad(values[6])),Z(toRad(values[7])),T(fx,fy)].reduce(M);
  for(const [u,v] of [[0,0],[-bw/2+.01,-bh/2+.01],[bw/2-.01,bh/2-.01],[bw/2+5,0],[0,-bh/2-5]]){
   const p=[u,v,0,1],r=css.map(row=>row.reduce((sum,val,k)=>sum+val*p[k],0));
   const gx=m[0]*u+m[4]*v+m[12],gy=m[1]*u+m[5]*v+m[13],gq=m[3]*u+m[7]*v+m[15];
   const sx=(gx/gq+1)*w/2,sy=(1-gy/gq)*h/2;
   assert.ok(Math.abs(sx-r[0]/r[3])<1e-8);assert.ok(Math.abs(sy-r[1]/r[3])<1e-8);
   assert.equal(hitProjective(pose,bw,bh,sx,sy),Math.abs(u)<=bw/2&&Math.abs(v)<=bh/2);
  }
 }
});

test('#1086 쌓임 순서는 z-index와 DOM 순서를 매번 따른다',()=>{
 const order=Array.from({length:28},(_,i)=>27-i),z=new Int32Array(28);
 for(let i=0;i<28;i++)z[i]=64*(i%5);
 assert.equal(sortPaintOrder(order,z),order);
 assert.deepEqual(order,Array.from({length:28},(_,i)=>i).sort((a,b)=>z[a]-z[b]||a-b));
 z[2]=3000;sortPaintOrder(order,z);assert.equal(order.at(-1),2);
 z[2]=0;sortPaintOrder(order,z);assert.equal(order[0],0);assert.equal(order[1],2);
});

const {createServer}=await import('node:http');
const {existsSync}=await import('node:fs');
const {readFile,stat}=await import('node:fs/promises');
const path=(await import('node:path')).default;
const {fileURLToPath}=await import('node:url');
const current=fileURLToPath(new URL('../dist/',import.meta.url)),baseline=process.env.LT_ORBIT1086_MAIN_DIST;
const requireBrowser=process.env.LT_ORBIT1086_REQUIRE==='1';
let chromium,skip;
try{({chromium}=await import('playwright'));if(!existsSync(chromium.executablePath()))skip='Chromium 없음';}catch{skip='화면 시험 도구 없음';}
if(!baseline||!existsSync(path.join(baseline,'v41/home.html'))||!existsSync(path.join(current,'v41/home.html')))skip='비교 빌드 없음';
if(requireBrowser&&skip)throw Error('#1086 필수 쌓임 순서 시험: '+skip);
test('#1086 실제 기존 DOM과 새 그림판의 카드 28장 쌓임 순서와 원근 좌표',{skip,timeout:120000},async()=>{
 const roots={before:path.resolve(baseline),after:path.resolve(current)};
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
 const server=createServer(async(req,res)=>{try{
  const [,v,...parts]=decodeURIComponent(new URL(req.url,'http://localhost').pathname).split('/'),root=roots[v];
  let file=path.resolve(root,...parts);if(!file.startsWith(root+path.sep))throw Error('경로');
  if((await stat(file)).isDirectory())file=path.join(file,'index.html');
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}});
 await listenOnSafePort(server, '127.0.0.1');const base='http://127.0.0.1:'+server.address().port;
 let browser;const results={};
 try{
  browser=await chromium.launch({headless:true});
  for(const variant of ['before','after']){
   const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
   try{
    await context.addInitScript(()=>localStorage.setItem('lt41.theme','garden'));
    await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===base?route.fetch({url:base+'/'+variant+u.pathname+u.search}).then(response=>route.fulfill({response})):route.abort();});
    const page=await context.newPage();await page.goto(base+'/v41/',{waitUntil:'load'});await page.mouse.move(0,0);
    let frame;for(let i=0;i<80;i++){frame=page.frames().find(f=>f.url().includes('home.html'));if(frame)break;await page.waitForTimeout(250);}
    assert.ok(frame,'첫 화면 문서');
    await frame.waitForFunction(v=>{const r=document.querySelector('#orbit')?.shadowRoot,t=globalThis.__LT_ORBIT_TEST__;return r&&t&&(v==='before'||t.canvasReady())&&[...r.querySelectorAll('.card:not(.off)')].filter(e=>e.style.transform).length===28;},variant);
    await page.waitForTimeout(1500);
    await frame.evaluate(async()=>{await document.fonts.ready;dispatchEvent(new Event('resize'));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    if(variant==='after')await frame.waitForFunction(()=>globalThis.__LT_ORBIT_TEST__.canvasSettled());
    results[variant]=await frame.evaluate(v=>{
     const host=document.querySelector('#orbit'),root=host.shadowRoot,hook=globalThis.__LT_ORBIT_TEST__,cards=[...root.querySelectorAll('.card')].slice(0,28),world=root.querySelector('.world'),cs=getComputedStyle(world);
     hook.hold(true);
     // 그림판은 그대로 두고 접근성 카드의 누름 판정만 잠시 드러낸다. 문서와 그림자 뿌리의 실제 쌓임 결과를 읽는다.
     const style=document.createElement('style');style.textContent='.world.lt-canvas .card,.world.lt-canvas .card .surface{pointer-events:auto!important}.orbit-canvas{pointer-events:none!important}';root.append(style);
     try{
      const phases=[];for(const phase of [0,.1,.2,.3,.4,.5,.6,.7,.8,.9]){
       hook.seek(phase);const poses=hook.poses?.(),order=hook.paintOrder?.(),points=[],errors=[];
       for(let y=20;y<innerHeight;y+=20)for(let x=20;x<innerWidth;x+=20){
        if(!document.elementsFromPoint(x,y).includes(host))continue;
        const hit=[...new Set(root.elementsFromPoint(x,y).map(e=>e.closest('.card')).filter(Boolean))].map(e=>cards.indexOf(e));
        if(hit.length>1)points.push({x,y,hit});
       }
       if(poses)for(let i=0;i<cards.length;i++){const p=poses[i]?.box,r=cards[i].getBoundingClientRect();if(p)errors.push(Math.hypot((p.l+p.r)/2-r.x-r.width/2,(p.t+p.b)/2-r.y-r.height/2));}
       phases.push({phase,points,errors,order,z:cards.map(c=>Number(getComputedStyle(c).zIndex)),labels:cards.map(c=>c.querySelector('.surface')?.getAttribute('aria-label'))});
      }return {flat:cs.transformStyle,perspective:cs.perspective,phases,depths:cards.map(c=>getComputedStyle(c).filter),rasters:hook.rasterStats?.()};
     }finally{style.remove();}
    },variant);
   }finally{await context.close();}
  }
 }finally{try{await browser?.close();}finally{server.close();}}
 assert.equal(results.before.flat,'flat');assert.equal(results.after.flat,'flat');assert.equal(results.before.perspective,'none');assert.equal(results.after.perspective,'none');
 const expectedDepth=results.before.depths.map(s=>{const m=s.match(/brightness\(([\d.]+)\) blur\(([\d.]+)px\)/);return m?[Number(m[1]),Number(m[2])]:null;});
 assert.deepEqual(results.after.rasters.slice(0,28).map(s=>s?[s.brightness,s.blur]:null),expectedDepth,"배치 갱신 뒤 기존 카드 깊이 필터와 비트맵 일치");
 let points=0,max=0;
 for(const [i,after] of results.after.phases.entries()){
  const before=results.before.phases[i];assert.equal(after.labels.length,28);
  // #1204: 카드 접근성 이름 끝에 ' 눌러서 크게 보기' 안내가 붙었다. 같은 카드가 같은 순서인지는 안내를 뗀 이름으로 비교한다(고정 기준은 #1221 직전이라 안내가 없다).
  const cardName=l=>String(l||'').replace(/ 눌러서 크게 보기$/,'');
  assert.deepEqual(after.labels.map(cardName),before.labels.map(cardName));
  assert.ok(after.labels.every(l=>/ 눌러서 크게 보기$/.test(l)),'새 그림판 카드 이름에 누름 안내가 붙는다');
  assert.deepEqual(after.z,before.z,'기존 DOM과 같은 깊이 밴드');
  assert.equal(after.order.length,28);assert.equal(new Set(after.order).size,28);
  for(const source of [before,after])for(const point of source.points){
   const actual=after.order.filter(card=>point.hit.includes(card)).reverse();
   assert.deepEqual(actual,point.hit,'겹친 카드의 앞뒤 순서 '+JSON.stringify({phase:after.phase,x:point.x,y:point.y}));points++;
  }
  assert.equal(after.errors.length,28);max=Math.max(max,...after.errors);
 }
 assert.ok(points>=100,'실제 겹친 여러 지점에서 비교');assert.ok(max<10,'원근 좌표 오차 '+max);
 console.log('쌓임 순서 비교 지점',points,'원근 좌표 최대 오차',max);
});