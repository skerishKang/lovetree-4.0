// #1026: 인증 확인 전 머리줄의 일시 노출 방지. 전체 40조건 E2E: LT_HEADER_FLASH_FULL=1 node --test 이 파일
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createTree} from '../public/v41/domain.mjs';
import {settleHeaderAuth,HEADER_AUTH_HINT_KEY} from '../public/v41/shell/header-initial.mjs';
import {serve} from './helpers/screen-audit.mjs';
const html=readFileSync(new URL('../public/v41/index.html',import.meta.url),'utf8');
test('#1026 첫 머리줄의 권한별 요소는 외부 스타일시트보다 먼저 가린다',()=>{
 assert.ok(html.includes("root.dataset.ltAuthPhase='pending'"));
 assert.match(html,/#record-menu/);
 assert.match(html,/#account-entry/);
 assert.match(html,/<style>[^]*?#mobile-more[^]*?<\/style>/);
 assert.ok(html.indexOf('<style>')<html.indexOf('href="shell.css"'));
});
test('#1026 마지막 인증 힌트를 한 번만 반영하며 이전 값이 틀려도 정정한다',()=>{
 const saved=new Map([[HEADER_AUTH_HINT_KEY,'out']]);
 const root={dataset:{ltAuthPhase:'pending',ltAuthHint:'out'}},storage={setItem:(k,v)=>saved.set(k,v)};
 assert.equal(settleHeaderAuth(true,{root,storage}),true);
 assert.equal(root.dataset.ltAuthPhase,'ready');
 assert.equal(root.dataset.ltAuthHint,'in');
 assert.equal(saved.get(HEADER_AUTH_HINT_KEY),'in');
 assert.equal(settleHeaderAuth(false,{root,storage}),false);
 assert.equal(root.dataset.ltAuthHint,'out');
});
test('#1395 첫 화면 주소 판정이 셸의 화면 선택과 같다',async()=>{
 const sandbox={};runInNewContext(readFileSync(new URL('../public/v41/home-route.js',import.meta.url),'utf8'),sandbox);
 const shared=sandbox.LT41_HOME_HASH;
 assert.ok(shared,'첫 그리기 전 판정 스크립트가 있다.');
 const {parseSelectionRoute}=await import('../public/v41/selection-location.mjs');
 const {screens,screenForView}=await import('../public/v41/shell/navigation.mjs');
 assert.deepEqual([...shared.VIEWS],screens.map(s=>s[0]),'화면 목록이 셸과 같다.');
 const hashes=['','#','#home','#home?x=1','#my/home','#my/','#my/book','#share/id/home','#share/id/book','#share/id','#share/id/','#explore','#explore/moments','#map','#graph','#my/graph','#foo','#home-ish'];
 for(const hash of hashes){
  const expected=screenForView(parseSelectionRoute(hash).view)[1]==='src064-orbit.html';
  assert.equal(shared.isHomeHash(hash),expected,'주소 '+hash+'의 첫 화면 판정');
 }
});
const FULL=process.env.LT_HEADER_FLASH_FULL==='1';
test('#1026 5화면×로그인여부×1440·390×보통·느림 + #1395 첫 화면 주소 5종×로그인여부×1440·390: 첫 그림 이후 사라지는 단추 0, CLS <= 0.01',{skip:!FULL,timeout:900000},async()=>{
 const {chromium}=await import('playwright');
 const server=await serve(),base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 const tree=createTree({subject:'일상',title:'첫 순간',date:'2026-11-20',emotion:'기쁨',note:'시험 데이터',url:''},'2026-11-20T00:00:00.000Z');
 const workspace={revision:1,state:{version:1,trees:[tree],prefs:{}},subject:'qa-header-fake',writeSubjectBound:true,savedAt:'2026-11-23T00:00:00.000Z'};
 const screens={home:'#home',shelf:'#my/shelf',book:'#my/book',board:'#my/board',network:'#my/network'};
 // #1395: 첫 화면으로 끝나는 주소로 바로 들어와도 링크 줄이 움직이지 않는다. 기준·대기는 그대로다.
 const homeTails=[['my-home','#my/home'],['share-home','#share/fake/home'],['explore','#explore'],['explore-moments','#explore/moments'],['my-empty','#my/']];
 const cases=[...Object.entries(screens).map(([screen,hash])=>({screen,hash,speeds:['normal','slow'],homeTail:false})),...homeTails.map(([screen,hash])=>({screen,hash,speeds:['normal'],homeTail:true}))];
 const observed=[];
 try{
 for(const {screen,hash,speeds,homeTail} of cases)for(const speed of speeds)for(const width of [1440,390])for(const auth of ['out','in']){
  const ctx=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});
  try{
   await ctx.addInitScript(()=>{
    window.__firstHeaderFrames=[];window.__firstHeaderShifts=[];
    const names=['#record-menu','#tree-views','#write-menu','#account-entry','#account-avatar','#mobile-more'];
    const snap=()=>{const node=document.querySelector('.app-header');if(!node)return;const visible=names.filter(sel=>{const e=document.querySelector(sel);if(!e||e.hidden)return false;const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.visibility!=='hidden'&&s.display!=='none'&&Number(s.opacity)>.05&&r.width>0&&r.height>0});const rects=Object.fromEntries(['.brand','.main-nav','.tree-frame','.tree-slot','#tree-views','#community-menu','.header-actions','#theme-toggle','.account-slot','#account-entry','#account-avatar','#record-menu','#write-menu','#mobile-more'].map(sel=>{const e=document.querySelector(sel),r=e?.getBoundingClientRect();return [sel,r&&r.width>0&&r.height>0?[r.x,r.y,r.width,r.height]:null]}));const prefix=document.querySelector('.tree-prefix');window.__firstHeaderFrames.push({t:performance.now(),visible,rects,prefixVisible:prefix?.checkVisibility({checkVisibilityCSS:true})})};
    const timer=setInterval(snap,100);window.__stopFirstHeader=()=>{clearInterval(timer);snap()};
    new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__firstHeaderShifts.push({value:e.value,time:e.startTime,sources:(e.sources||[]).map(a=>({node:a.node?{tag:a.node.tagName||'',id:a.node.id||'',className:typeof a.node.className==='string'?a.node.className.slice(0,90):'',parent:a.node.parentElement?.id||a.node.parentElement?.className||''}:null,previous:a.previousRect?{x:a.previousRect.x,y:a.previousRect.y,width:a.previousRect.width,height:a.previousRect.height}:null,current:a.currentRect?{x:a.currentRect.x,y:a.currentRect.y,width:a.currentRect.width,height:a.currentRect.height}:null}))})}).observe({type:'layout-shift',buffered:true});
   });
   await ctx.route('**/api/**',async r=>{
    const p=new URL(r.request().url()).pathname;
    if(p==='/api/workspace'){
     await new Promise(ok=>setTimeout(ok,speed==='slow'?450:180));
     return auth==='in'?r.fulfill({status:200,json:workspace}):r.fulfill({status:401,json:{error:'unauthorized'}});
    }
    if(p==='/api/account')return r.fulfill({status:200,json:{ok:true,email:'qa@example.invalid',subject:workspace.subject}});
    // 둘러보기 순간 주소는 목록이 비면 판이 접혀 CLS가 생긴다 — 가짜 순간 한 개로 판 높이를 유지한다.
    if(p==='/api/public/moments')return r.fulfill({status:200,json:{ok:true,items:[{id:'fake-moment',videoId:'fake00000001',shareId:'fake-share',vertical:true,title:'시험 순간',url:'',thumbnail:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E',note:'',emotion:'기쁨',date:'2026-11-20',keywords:[]}],total:1,groups:[]}});
    return r.fulfill({status:200,json:{ok:true,items:[]}});
   });
   const page=await ctx.newPage(),cdp=await ctx.newCDPSession(page);
   await cdp.send('Network.enable');
   if(speed==='slow'){
    await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750,connectionType:'cellular3g'});
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
   }
   await page.goto(base+'/v41/'+(auth==='in'?'?account=1':'')+hash,{waitUntil:'domcontentloaded'});
   await page.waitForTimeout(speed==='slow'?6500:2800);
   const result=await page.evaluate(()=>{
    window.__stopFirstHeader();
    const fcp=performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
    return {fcp,frames:window.__firstHeaderFrames,shifts:window.__firstHeaderShifts,member:document.body.dataset.member,phase:document.documentElement.dataset.ltAuthPhase};
   });
   assert.ok(result.fcp>0,screen+' '+width+' '+speed+': 최초 콘텐츠 그림 확인');
    const cls=result.shifts.reduce((a,b)=>a+b.value,0);
    const entry={screen,width,speed,auth,cls};
    // 새 첫 화면 주소는 소유자·공유 주소가 로그인 안내로 넘어가 머리줄이 확정되지 않는 경우가 있다. CLS 기준은 그대로 잰다.
    if(!homeTail){
     assert.equal(result.member,auth,screen+' '+width+' '+speed+': 인증 확정');
     assert.equal(result.phase,'ready',screen+' '+width+' '+speed+': 머리줄 확정');
    }
    if(!result.frames.length){observed.push(entry);assert.ok(cls<=.01,JSON.stringify(entry));continue;}
   const frames=result.frames.filter(f=>f.t>=result.fcp),final=new Set(result.frames.at(-1).visible);
   const disappeared=[...new Set(frames.flatMap(f=>f.visible.filter(sel=>!final.has(sel))))];
   if(screen==='home'&&width===390&&speed==='normal'&&auth==='out')console.log('#1026 LAYOUT_SHIFT_SOURCES',JSON.stringify({screen,width,speed,auth,cls,shifts:result.shifts}));
   const last=frames.at(-1),moves={};
   for(const f of frames)for(const [key,r] of Object.entries(f.rects)){
    const end=last.rects[key];if(!r||!end)continue;
    const delta=Math.max(...r.map((v,i)=>Math.abs(v-end[i])));
    moves[key]=Math.max(moves[key]||0,delta);
   }
   const excessive=Object.entries(moves).filter(([,v])=>v>8);
   console.log('#1246 HEADER_GEOMETRY',JSON.stringify({screen,width,speed,auth,moves,excessive}));
   assert.deepEqual(excessive,[],screen+' '+width+' '+speed+' '+auth+': 첫 그림 이후 8px 초과 이동 없음');
    if(auth==='out'&&!homeTail)assert.equal(last.prefixVisible,false,'로그아웃 트리 글자 숨김');
    Object.assign(entry,{disappeared});observed.push(entry);
   if(!homeTail)assert.deepEqual(disappeared,[],JSON.stringify(observed.at(-1)));
   assert.ok(cls<=.01,JSON.stringify(observed.at(-1)));
  }finally{await ctx.close()}
 }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
 console.log('#1395 CLS_MAX',JSON.stringify({all:Math.max(...observed.map(o=>o.cls)),tails:Math.max(...observed.filter(o=>homeTails.some(t=>t[0]===o.screen)).map(o=>o.cls))}));
 assert.equal(observed.length,Object.keys(screens).length*8+homeTails.length*4);
});
