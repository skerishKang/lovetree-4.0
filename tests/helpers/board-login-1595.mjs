import assert from 'node:assert/strict';
import {serve} from './screen-audit.mjs';
import {createTree,addMoment} from '../../src/domain.js';
// 실제 셸에서 로그인한 시험 자료를 읽어 보드 및 안쪽 화면을 검사한다.
export async function auditBoardLogin1595(chromium){
const server=await serve({}, {port:Number(process.env.LT_TEST_PORT)||0});
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280"><rect width="720" height="1280" fill="#897d94"/><path fill="#eee8e0" d="M260 440 L260 840 L530 640Z"/></svg>';
const makeTree=n=>{
 const input=i=>({subject:'모아둔 순간',title:'세로 영상 시험 '+String(i+1).padStart(2,'0')+' — 기록 화면',note:'',emotion:'설렘',date:'2026-11-'+String(i%28+1).padStart(2,'0'),url:'https://www.youtube.com/shorts/'+String(10000000000+i)});
 const time=i=>new Date(Date.UTC(2026,10,1,0,i)).toISOString();
 let t=createTree(input(0),time(0));
 for(let i=1;i<n;i++)t=addMoment(t,input(i),t.moments[0].id,time(i));
 t.id='board-fixture-'+n;
 t.moments=t.moments.map((m,i)=>({...m,id:'fixture-'+i,parentId:i?'fixture-0':null,mediaMetadata:{source:'youtube',vertical:true},keywords:[]}));
 t.edges=t.moments.slice(1).map((m,i)=>({id:'edge-'+i,kind:'parent',from:'fixture-0',to:m.id,reason:''}));
 return t;
};
const rows=[],logos=[],errors=[];
async function waitBoard(page,n){
 await page.waitForFunction(n=>{const f=document.getElementById('view');const d=f?.contentDocument;return f&&!f.hidden&&d?.documentElement.dataset.v41Screen==='board'&&d.documentElement.dataset.ltBoardView==='ready'&&d.querySelectorAll('#cardLayer .card[data-id]').length===n&&!!d.querySelector('.lt-moment-picker');},n,{timeout:25000});
 await page.waitForFunction(()=>{const f=document.getElementById('view-next');return !f||f.hidden||f.contentWindow?.location?.href==='about:blank'},{},{timeout:10000}).catch(()=>{});
 const frame=await (await page.locator('#view').elementHandle()).contentFrame();
 await frame.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 return frame;
}
function geometry(){
 const vp=document.getElementById('viewport'),vr=vp.getBoundingClientRect(),pk=document.querySelector('.lt-moment-picker'),pr=pk?.getBoundingClientRect(),world=document.getElementById('world');
 const R=r=>({x:+r.x.toFixed(2),y:+r.y.toFixed(2),l:+r.left.toFixed(2),t:+r.top.toFixed(2),r:+r.right.toFixed(2),b:+r.bottom.toFixed(2),w:+r.width.toFixed(2),h:+r.height.toFixed(2)});
 const overlap=(a,b,c)=>!b||!b.width?0:Math.max(0,Math.min(a.right,b.right,c.right)-Math.max(a.left,b.left,c.left))*Math.max(0,Math.min(a.bottom,b.bottom,c.bottom)-Math.max(a.top,b.top,c.top));
 const cards=[...document.querySelectorAll('#cardLayer .card[data-id]')].filter(e=>!e.classList.contains('filteredOut')).map(e=>{
  const r=e.getBoundingClientRect(),x=Math.max(vr.left+2,Math.min(vr.right-2,r.left+r.width/2)),y=r.bottom-3;
  const hit=[8,16,26].some(d=>[.25,.5,.75].some(f=>{
    const sx=r.left+r.width*f,sy=r.bottom-d;
    return sy>=Math.max(vr.top,pr?.width?pr.bottom:0)&&sy<vr.bottom&&sx>=vr.left&&sx<vr.right&&document.elementFromPoint(sx,sy)?.closest('.card')===e;
  }));
  return {id:e.dataset.id,offset:e.offsetTop+e.offsetHeight,rect:R(r),overlap:+overlap(r,pr,vr).toFixed(2),bottomHit:!!hit,vertical:!!e.querySelector('[data-lt-vertical="1"],.is-vertical')};
 });
 const last=[...cards].sort((a,b)=>b.offset-a.offset)[0];
 const first=[...cards].sort((a,b)=>a.rect.t-b.rect.t)[0];
 const points=[];
 for(const x of [vr.left+8,vr.right-8,vr.left+24,vr.right-24,vr.left+vr.width/2])for(const y of [vr.bottom-18,vr.bottom-42,vr.top+vr.height*.7,vr.top+vr.height*.4,vr.top+12]){
   const el=document.elementFromPoint(x,y);
   if(el&&vp.contains(el)&&!el.closest('.card,button,a,input,textarea,select,.lt-moment-picker'))points.push({x,y});
 }
 return {vp:R(vr),picker:pr?.width?R(pr):null,scroll:vp.scrollTop,maxScroll:vp.scrollHeight-vp.clientHeight,scrollMode:vp.classList.contains('board-scroll'),worldTransform:world.style.transform,first,last,cards:cards.length,vertical:cards.filter(c=>c.vertical).length,overlap:+Math.max(0,...cards.map(c=>c.overlap)).toFixed(2),overlapTotal:+cards.reduce((s,c)=>s+c.overlap,0).toFixed(2),bottomClipped:cards.filter(c=>c.rect.t<vr.bottom&&c.rect.b>vr.bottom).length,visible:cards.filter(c=>c.rect.b<=vr.bottom+1&&c.rect.t>=Math.max(vr.top,pr?.width?pr.bottom:0)-1&&c.rect.l>=vr.left-1&&c.rect.r<=vr.right+1).length,points,hint:document.getElementById('board-more-hint')?.textContent||'',hintVisible:!!document.getElementById('board-more-hint')?.getClientRects().length};
}
async function reach(page,frame,initial){
 let v=initial,actions=0;
 const fr=await page.locator('#view').boundingBox();
 if(v.scrollMode){
   const p=v.points[0]||{x:v.vp.x+12,y:v.vp.b-30};
   await page.mouse.move(fr.x+p.x,fr.y+p.y);
   while(v.scroll<v.maxScroll-1&&actions<60){
     const prev=v.scroll;
     await page.mouse.wheel(0,Math.max(240,v.vp.h-60));
     await frame.waitForFunction(y=>document.querySelector('#viewport').scrollTop>y,prev,{timeout:1500}).catch(()=>{});
     v=await frame.evaluate(geometry);actions++;
     if(v.scroll<=prev)break;
   }
 }else{
   while(v.last&&!v.last.bottomHit&&actions<60){
     const p=v.points.find(p=>p.y>v.vp.t+45);
     if(!p)break;
     const delta=v.last.rect.b-(v.vp.b-26),dx=v.last.rect.x+v.last.rect.w/2<v.vp.l+20?70:v.last.rect.x+v.last.rect.w/2>v.vp.r-20?-70:0;
     const dy=delta>0?-Math.min(delta,Math.max(1,p.y-v.vp.t-10)):Math.min(v.vp.b-p.y-10,Math.max(0,v.vp.t-v.last.rect.b+50));
     if(Math.abs(dy)<1&&!dx)break;
     await page.mouse.move(fr.x+p.x,fr.y+p.y);await page.mouse.down();
     await page.mouse.move(fr.x+p.x+dx,fr.y+p.y+dy,{steps:8});await page.mouse.up();
     const old=v.worldTransform;
     v=await frame.evaluate(geometry);actions++;
     if(v.worldTransform===old)break;
   }
 }
 await frame.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 v=await frame.evaluate(geometry);
 return {end:v,actions,reached:!!v.last?.bottomHit,bottomRemaining:v.last?+Math.max(0,v.last.rect.b-v.vp.b).toFixed(2):null};
}
function logoMeasure(){
 const a=document.querySelector('.app-header .brand'),b=a.getBoundingClientRect(),word=a.querySelector('.brand-word'),wr=word?.getBoundingClientRect(),p=getComputedStyle(a,'::before'),h=getComputedStyle(document.querySelector('.app-header'));
 const textLeft=p.content==='"LT"'?b.left+parseFloat(p.left)+(parseFloat(p.paddingLeft)||0)+(parseFloat(p.textIndent)||0):wr?.width?wr.left:b.left;
 return {anchorLeft:b.left,visibleLogoLeft:textLeft,pseudoContent:p.content,pseudoLeft:p.left,pseudoIndent:p.textIndent,outerPadding:h.paddingLeft,overflow:document.documentElement.scrollWidth-innerWidth};
}
async function run(w,h,theme,n){
 const tree=makeTree(n),ctx=await browser.newContext({viewport:{width:w,height:h},reducedMotion:'reduce',locale:'ko-KR'});
 const state={version:1,trees:[tree],prefs:{theme}};
 await ctx.addInitScript(t=>{try{localStorage.setItem('lt41.theme',t);localStorage.setItem('lt41.tips.firstTree','1');}catch{}},theme);
 await ctx.route('**/*',r=>{
   const u=new URL(r.request().url());
   if(u.hostname==='i.ytimg.com')return r.fulfill({contentType:'image/svg+xml',body:svg});
   if(u.origin!==base)return r.abort();
   if(u.pathname==='/api/workspace')return r.fulfill({status:200,json:{revision:1,state,subject:'fixture-account',writeSubjectBound:true,savedAt:'2026-11-28T00:00:00Z'}});
   if(u.pathname.startsWith('/api/')||u.pathname.startsWith('/auth/'))return r.fulfill({status:200,json:{ok:true,items:[],groups:[],shares:[],assets:[],visibility:'public',discover:false}});
   return r.continue();
 });
 const page=await ctx.newPage();const tag=w+'x'+h+'-'+theme+'-'+n;
 page.on('pageerror',e=>errors.push({tag,error:e.message}));
 try{
   await page.goto(base+'/v41/?account=1#my/board?tree='+encodeURIComponent(tree.id),{waitUntil:'load'});
   await page.waitForFunction(()=>window.LT41?.writable===true,null,{timeout:20000});
   const frame=await waitBoard(page,n);
   const initial=await frame.evaluate(geometry);
   assert.equal(initial.cards,n);
   const result=await reach(page,frame,initial);
   let overlapProbe=null;
   if(w===390){
     const fr=await page.locator('#view').boundingBox();
     // 실제 휠로 맨 위로 복귀하고 다시 90px 이동. 판 위로 흐르는 첫 카드의 겹침을 확인한다.
     await page.mouse.move(fr.x+20,fr.y+initial.vp.b-30);
     await page.mouse.wheel(0,-100000);
     await frame.waitForFunction(()=>document.getElementById('viewport').scrollTop===0);
     await page.mouse.wheel(0,90);
     await frame.waitForFunction(()=>document.getElementById('viewport').scrollTop>=89);
     overlapProbe=await frame.evaluate(geometry);
   }
   const item={w,h,theme,n,initial,result,overlapProbe,logo:await page.evaluate(logoMeasure)};
   rows.push(item);
   if(w===390&&n===5){
     for(const [screen,part] of [['home','home.html'],['shelf','track32-bookshelf'],['tree','track61-tree'],['board','track58-pinboard'],['book','track59-sketchbook'],['network','track56-network']]){
       const hash=screen==='home'?'#home':'#my/'+screen+'?tree='+encodeURIComponent(tree.id);
       await page.goto(base+'/v41/?account=1'+hash,{waitUntil:'load'});
       await page.waitForFunction(part=>{const f=document.getElementById('view');return f&&!f.hidden&&f.contentDocument?.URL.includes(part)&&f.contentDocument.readyState==='complete'},part,{timeout:20000});
       const m=await page.evaluate(logoMeasure);
       logos.push({screen,theme,...m});
     }
   }
 }catch(e){errors.push({tag,error:String(e).slice(0,400)});console.error('CASE_ERROR',tag,e.message);}
 finally{await ctx.close();}
}
try{
 for(const [w,h] of [[390,844],[844,390],[1440,900],[2560,1440]])for(const theme of ['night','garden'])for(const n of [5,30])await run(w,h,theme,n);
 return {rows,logos,errors};
}finally{await browser.close();await new Promise(r=>server.close(r))}
}
