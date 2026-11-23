import { chromium } from 'playwright';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('dist'),mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{let p=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));if((await stat(p)).isDirectory())p=path.join(p,'index.html');res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
let b;
try{
 b=await chromium.launch({headless:true});
 const c=await b.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 try{
  await c.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
  const page=await c.newPage();page.on('pageerror',e=>console.log('문서 오류',e.message));
  await page.goto(base+'/v41/',{waitUntil:'load'});
  let f;for(let i=0;i<80;i++){f=page.frames().find(x=>x.url().includes('home.html'));if(f)break;await page.waitForTimeout(250);}
  assert.ok(f);await f.waitForFunction(()=>globalThis.__LT_ORBIT_TEST__?.canvasReady());
  const state=()=>f.evaluate(()=>{const h=document.querySelector('main#orbit'),s=h.shadowRoot,c=s.querySelector('.orbit-canvas'),p=globalThis.__LT_ORBIT_TEST__,r=c.getBoundingClientRect();return {poses:p.poses(),width:c.width,height:c.height,rect:{x:r.left,y:r.top,w:r.width,h:r.height},cards:[...s.querySelectorAll('.card')].map(x=>({label:x.querySelector('.surface').getAttribute('aria-label'),display:getComputedStyle(x).display,visibility:getComputedStyle(x).visibility,opacity:getComputedStyle(x).opacity,will:getComputedStyle(x).willChange})),time:p.lastWriteAt()};});
  const s=await state();await page.waitForTimeout(500);const t=await state();
  assert.deepEqual(s.poses,t.poses,'동작 줄이기에서 카드 정지');assert.ok(s.cards.filter(x=>x.display!=='none').every(x=>x.opacity==='0'&&x.will==='auto'&&x.label),'DOM 카드 접근성 이름과 층 고정');
  console.log('정지 및 카드 이름 통과',s.cards.filter(x=>x.display!=='none').length);
  const point=await f.evaluate(()=>{const s=document.querySelector('main#orbit').shadowRoot,c=s.querySelector('.orbit-canvas'),r=c.getBoundingClientRect();const p=globalThis.__LT_ORBIT_TEST__.poses();for(let i=0;i<p.length;i++){const t=p[i];if(!t||t.hidden||t.x<30||t.x>r.width-30||t.y<30||t.y>r.height-30)continue;const near=p.filter((v,j)=>j!==i&&v&&!v.hidden&&v.box.l<t.x&&v.box.r>t.x&&v.box.t<t.y&&v.box.b>t.y);if(near.length)continue;const x=r.left+t.x,y=r.top+t.y;if(s.elementFromPoint(x,y)!==c)continue;return {x,y,i,label:s.querySelectorAll('.card')[i].querySelector('.surface').getAttribute('aria-label')};}return null;});
  assert.ok(point,'캔버스 클릭 가능 카드');const frameRect=await (await f.frameElement()).boundingBox();await page.mouse.click(frameRect.x+point.x,frameRect.y+point.y);
  await f.waitForFunction(()=>{const s=document.querySelector('main#orbit').shadowRoot;return s.querySelector('dialog')?.open||s.querySelector('#mediaViewerHome')?.getAttribute('aria-hidden')==='false';},{},{timeout:5000});
  console.log('첫 클릭 통과',point.label);await page.keyboard.press('Escape');
  const focused=await f.evaluate(()=>document.querySelector('main#orbit').shadowRoot.activeElement?.getAttribute('aria-label'));console.log('초점 복귀',focused);assert.equal(focused,point.label);
  await page.keyboard.press('Enter');await f.waitForFunction(()=>{const s=document.querySelector('main#orbit').shadowRoot;return s.querySelector('dialog')?.open||s.querySelector('#mediaViewerHome')?.getAttribute('aria-hidden')==='false';},{},{timeout:5000});
  console.log('키보드 열기 통과');await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await f.waitForFunction(()=>document.querySelector('main#orbit').shadowRoot.querySelector('.orbit-canvas').width===390);
  console.log('크기 변경 통과');
  assert.equal(await f.evaluate(()=>globalThis.__LT_ORBIT_TEST__.renderer()),'webgl','기본 WebGL 경로');
  await f.evaluate(()=>{const root=document.querySelector('main#orbit').shadowRoot,c=root.querySelector('.orbit-canvas');const ext=c.getContext('webgl').getExtension('WEBGL_lose_context');if(!ext)throw Error('컨텍스트 시험 확장 없음');globalThis.__LT_LOST_CONTEXT__=ext;ext.loseContext();});
  await f.waitForFunction(()=>globalThis.__LT_ORBIT_TEST__.renderer()==='2d');
  const fallback=await state();assert.equal(fallback.width,390);assert.ok(fallback.poses.some(p=>p&&!p.hidden));
  assert.equal(await f.evaluate(()=>document.querySelector('main#orbit').shadowRoot.querySelectorAll('.orbit-canvas').length),1);
  console.log('컨텍스트 손실 2D 복귀 통과');
  await f.evaluate(()=>globalThis.__LT_LOST_CONTEXT__.restoreContext());
  await f.waitForFunction(()=>globalThis.__LT_ORBIT_TEST__.renderer()==='webgl',{},{timeout:30000});
  const restored=await state();assert.equal(restored.width,390);assert.ok(restored.poses.some(p=>p&&!p.hidden));
  assert.equal(await f.evaluate(()=>document.querySelector('main#orbit').shadowRoot.querySelectorAll('.orbit-canvas').length),1);
  console.log('컨텍스트 복구 WebGL 통과');

 }finally{await c.close();}
}finally{try{await b?.close();}finally{server.close();}}
