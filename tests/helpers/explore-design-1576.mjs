import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {serve} from './screen-audit.mjs';

const REQUIRE=process.env.LT1576_REQUIRE==='1';
let chromium,unavailable=null;
try{({chromium}=await import('playwright'));if(!existsSync(chromium.executablePath()))unavailable='Chromium 없음';}catch{unavailable='Playwright 없음';}
if(REQUIRE&&unavailable)throw Error(unavailable);
const full=process.env.LT1576_FULL_GRID==='1';
const measureOnly=process.env.LT1576_MEASURE_ONLY==='1';
const output=process.env.LT1576_CAPTURE_DIR||'';
const sizes=full?[[390,844],[844,390],[1440,900],[2560,1440]]:[[844,390]];
const cards=Array.from({length:18},(_,i)=>({
 shareId:'mock-share-'+String(i+1).padStart(16,'0'),title:'공개 트리 '+(i+1),
 subject:'음악과 무대',summary:'서로 다른 순간을 천천히 살펴보세요. '.repeat(15),
 momentCount:8,aiTester:true,publicDisplayName:'시험 공개자',createdAt:'2026-11-20T00:00:00.000Z',
 cover:{title:'첫 순간',type:'photo',url:''},
 stats:{hearts:3,favorites:1,hearted:false,favored:false,reactions:{heart:3},mine:[]}
}));
const moments=[{id:'mock-moment-1',videoId:'a1111111111',shareId:cards[0].shareId,treeTitle:'공개 트리 1',
 title:'첫 순간',date:'2026-11-20',emotion:'설렘',url:'https://www.youtube.com/shorts/a1111111111',
 thumbnail:'https://i.ytimg.com/vi/a1111111111/hqdefault.jpg',keywords:[]}];
const workspace={revision:1,subject:'test-1576',writeSubjectBound:true,savedAt:'2026-11-20T00:00:00.000Z',
 state:{version:1,trees:[{id:'tree-1576',title:'시험 트리',subject:'시험 주제',moments:[],edges:[]}],
 prefs:{displayName:'화면 검증 계정'}}};
const respond=(r,x)=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(x)});
const records=[];

test('#1576 둘러보기 목록·미리보기·순간 아이콘 크기', {skip:unavailable||undefined,timeout:600000},async()=>{
 if(unavailable)assert.fail(unavailable);
 const server=await serve({}, {port:Number(process.env.LT_TEST_PORT||0)});
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 const problems=[];
 try{
  if(output)await mkdir(output,{recursive:true});
  for(const [width,height] of sizes)for(const theme of ['night','garden'])for(const account of ['guest','member']){
   const key=width+'x'+height+'-'+theme+'-'+account;
   const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',locale:'ko-KR',timezoneId:'Asia/Seoul'});
   try{
    await ctx.addInitScript(t=>{localStorage.setItem('lt41.theme',t)},theme);
    await ctx.route('**/*',route=>{
     const u=new URL(route.request().url());
     if(u.hostname==='www.youtube-nocookie.com'||u.hostname==='www.youtube.com')
      return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><body style="margin:0;background:#333"></body>'});
     if(u.hostname==='i.ytimg.com')return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640"><rect width="360" height="640" fill="#526177"/></svg>'});
     if(u.origin!==base)return route.abort();
     if(u.pathname==='/api/workspace')return respond(route,workspace);
     if(u.pathname==='/api/community/shares')return respond(route,{ok:true,items:cards,totalVisible:cards.length,groups:[],groupsAll:[],nextCursor:''});
     if(u.pathname==='/api/public/moments')return respond(route,{items:moments,total:1,groups:[]});
     if(u.pathname.includes('/moments/')&&u.pathname.startsWith('/api/community/'))return respond(route,{hearts:3,comments:0,hearted:false,items:[]});
     if(u.pathname.startsWith('/api/'))return respond(route,{ok:true,items:[],trees:[],shares:[]});
     return route.continue();
    });
    const page=await ctx.newPage();
    await page.goto(base+'/v41/'+(account==='member'?'?account=1':'')+'#explore',{waitUntil:'domcontentloaded'});
    await page.locator('.community-card').first().waitFor({timeout:20000});
    if(account==='member')await page.waitForFunction(()=>document.body.dataset.member==='in',null,{timeout:15000});
    const panel=page.locator('#community-panel');
    const scrollBefore=await panel.evaluate(e=>({
     windowY:window.scrollY,windowMax:document.scrollingElement.scrollHeight-document.scrollingElement.clientHeight,
     scrollY:e.scrollTop,max:e.scrollHeight-e.clientHeight,itemCount:e.querySelectorAll('.community-card').length
    }));
    await page.mouse.move(Math.round(width/2),Math.round(height/2));
    await page.mouse.wheel(0,9999);await page.waitForTimeout(130);
    const scrollAfter=await panel.evaluate(e=>{
     const last=[...e.querySelectorAll('.community-card')].at(-1).getBoundingClientRect(),p=e.getBoundingClientRect();
     return {scrollY:e.scrollTop,max:e.scrollHeight-e.clientHeight,
      lastBottom:Math.round(last.bottom*100)/100,panelBottom:Math.round(p.bottom*100)/100,
      reached:e.scrollHeight-e.clientHeight-e.scrollTop<=1};
    });
    if(output)await page.screenshot({path:join(output,key+'-g-bottom.png'),animations:'disabled'});
    if(!measureOnly&&(!scrollAfter.reached||scrollAfter.lastBottom>scrollAfter.panelBottom+2))
     problems.push(key+' 목록 스크롤 미도달 '+JSON.stringify(scrollAfter));
    await panel.evaluate(e=>e.scrollTop=0);
    await page.locator('.community-card').first().click();
    await page.locator('#community-preview[open]').waitFor({timeout:7000});
    const previewBefore=await page.locator('#community-preview').evaluate(e=>({
     y:e.getBoundingClientRect().y,height:e.getBoundingClientRect().height,
     scrollY:e.scrollTop,max:e.scrollHeight-e.clientHeight
    }));
    await page.locator('#community-preview').evaluate(e=>e.scrollTop=e.scrollHeight);
    await page.waitForTimeout(80);
    const previewAfter=await page.evaluate(()=>{
     const e=document.querySelector('#community-preview');
     const p=e.getBoundingClientRect(),close=e.querySelector('.community-preview-close').getBoundingClientRect(),
      act=e.querySelector('.community-preview-open').getBoundingClientRect();
     const points=[[8,16],[innerWidth-8,16],[Math.round(innerWidth/2),8]];
     return {scrollY:e.scrollTop,max:e.scrollHeight-e.clientHeight,
      previewBottom:p.bottom,closeVisible:close.y>=p.y-1&&close.bottom<=p.bottom+1,
      actionVisible:act.y>=p.y-1&&act.bottom<=p.bottom+1,
      blocked:points.map(([x,y])=>document.elementFromPoint(x,y)?.closest('dialog')?.id||'')};
    });
    if(output)await page.screenshot({path:join(output,key+'-f-tree-open.png'),animations:'disabled'});
    if(!measureOnly&&(!previewAfter.closeVisible||!previewAfter.actionVisible||
      previewAfter.previewBottom>height+2||previewAfter.blocked.some(x=>x!=='community-preview')))
     problems.push(key+' 미리보기 접근성 미달 '+JSON.stringify(previewAfter));
    await page.locator('.community-preview-close').click();
    const focus=await page.evaluate(()=>({open:document.querySelector('#community-preview').open,
     active:document.activeElement?.tagName||''}));
    await page.locator('#community-tab-moments').click();
    await page.locator('.moments-stage[data-lt-moments-id]').waitFor({timeout:16000});
    const rail=await page.evaluate(()=>{
     const buttons=[...document.querySelectorAll('#community-moments-panel .moments-rail-button')].filter(e=>{
      const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&e.getBoundingClientRect().width>0;
     }).map(e=>{
      const box=e.getBoundingClientRect();
      const labels=[...e.querySelectorAll('.moments-rail-label,.moments-rail-count')].filter(x=>getComputedStyle(x).display!=='none');
      return {name:e.getAttribute('aria-label'),w:Math.round(box.width*100)/100,h:Math.round(box.height*100)/100,
       labels:labels.map(x=>({text:x.textContent,px:parseFloat(getComputedStyle(x).fontSize)}))};
     });
     return {buttons,below44:buttons.filter(e=>e.w<44||e.h<44).length,
      below12:buttons.flatMap(e=>e.labels).filter(x=>x.px<12).length};
    });
    if(output)await page.screenshot({path:join(output,key+'-e-moments.png'),animations:'disabled'});
    if(!measureOnly&&(rail.below44>0||rail.below12>0))problems.push(key+' 아이콘 미달 '+JSON.stringify(rail));
    records.push({key,width,height,theme,account,scroll:{before:scrollBefore,after:scrollAfter},
      preview:{before:previewBefore,after:previewAfter,focus},rail});
    console.log('MEASURE',JSON.stringify({key,scroll:scrollAfter.scrollY+'/'+scrollAfter.max,
      lastVisible:scrollAfter.lastBottom<=scrollAfter.panelBottom+2,
      preview:previewAfter.scrollY+'/'+previewAfter.max,
      closeVisible:previewAfter.closeVisible,actionVisible:previewAfter.actionVisible,
      blocked:previewAfter.blocked,smallHit:rail.below44,smallText:rail.below12}));
   }finally{await ctx.close();}
  }
  if(output)await writeFile(join(output,'measurements.json'),JSON.stringify(records,null,2));
  if(!measureOnly)assert.deepEqual(problems,[],problems.join('\n'));
 }finally{
  await browser.close();
  await new Promise(ok=>server.close(ok));
 }
});