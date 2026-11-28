// #1605: 기존 기준·기다림값을 변경하지 않는 새 브라우저 회귀 시험.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {serve} from './screen-audit.mjs';

const missing=!existsSync(chromium.executablePath());
const port=Number(process.env.LT_TEST_PORT||0);
function fixture(n){
 const moments=Array.from({length:n},(_,i)=>{
  const date=new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10);
  return{id:'m'+(i+1),parentId:i?'m'+i:null,relation:i?'이어짐':'',title:'시험 순간 '+(i+1),
   date,emotion:'설렘',note:'시험 기록',type:'memo',url:'',createdOrder:i+1,keywords:[],links:[],createdAt:date+'T00:00:00.000Z'};
 });
 return{revision:1,subject:'test-1605',writeSubjectBound:true,state:{version:1,prefs:{theme:'garden'},trees:[{
  id:'t6',subject:'시험 트리',title:'서재 시험',inbox:false,
  createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-06T00:00:00.000Z',moments
 }]}};
}
async function setup(browser,base,{width=390,height=844,theme='garden',count=40}={}){
 const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
 await ctx.addInitScript(t=>{localStorage.setItem('lt41.theme',t);localStorage.setItem('lt41.tips.firstTree','1')},theme);
 await ctx.route('**/api/workspace*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture(count))}));
 await ctx.route('**/*',route=>{
  if(new URL(route.request().url()).origin===base)return route.fallback();
  return route.abort();
 });
 const page=await ctx.newPage();
 await page.goto(base+'/v41/?account=1',{waitUntil:'load'});
 await page.waitForFunction(()=>window.LT41?.tree?.id==='t6',null,{timeout:18000});
 async function select(file,screen){
  await page.evaluate(f=>document.querySelector('[data-view="'+f+'"]')?.click(),file);
  await page.waitForFunction(s=>document.querySelector('#view')?.contentDocument?.documentElement?.dataset?.v41Screen===s,screen,{timeout:18000});
  return page.locator('#view').contentFrame();
 }
 return{page,ctx,select};
}
test('#1605 업데이트 띠가 안쪽 다섯 화면의 실제 iframe 영역을 덮지 않는다', {skip:missing},async t=>{
 const server=await serve({}, {port});
 const browser=await chromium.launch({headless:true});
 t.after(async()=>{await browser.close();await new Promise(r=>server.close(r))});
 const base='http://127.0.0.1:'+server.address().port;
 for(const [width,height] of [[390,844],[844,390],[1440,900],[2560,1440]]){
  await t.test(String(width),async()=>{
   const{page,ctx,select}=await setup(browser,base,{width,height,count:40});
   try{
    for(const [file,screen] of [
     ['track32-bookshelf.html','shelf'],['track61-tree.html','tree'],
     ['track58-pinboard.html','board'],['track59-sketchbook.html','book'],
     ['track56-network.html','network']]){
     await select(file,screen);
     await page.evaluate(()=>{
      const card=document.getElementById('updates-card');
      card.querySelector('#updates-card-text').textContent='러브트리가 새로워졌어요 — 4.1.15';
      card.hidden=false;
     });
     await page.waitForTimeout(60);
     const measured=await page.evaluate(()=>{
      const card=document.querySelector('#updates-card'),f=document.getElementById('view');
      const a=card.getBoundingClientRect(),b=f.getBoundingClientRect();
      return{visible:!card.hidden,coverHeight:Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)),
       stageBottom:b.bottom,noticeTop:a.top};
     });
     assert.equal(measured.visible,true,screen+' 띠 표시');
     assert.ok(measured.stageBottom<=measured.noticeTop+1.5,screen+' 화면과 띠가 수직 공간을 공유하지 않는다: '+JSON.stringify(measured));
    }
   }finally{await ctx.close()}
  });
 }
});
test('#1605 1440 책장 넘기기 안내 풍선은 책 본문 밖에 놓인다', {skip:missing},async t=>{
 const server=await serve({}, {port});
 const browser=await chromium.launch({headless:true});
 t.after(async()=>{await browser.close();await new Promise(r=>server.close(r))});
 const{page,ctx,select}=await setup(browser,'http://127.0.0.1:'+server.address().port,{width:1440,height:900,theme:'night',count:5});
 try{
  const frame=await select('track59-sketchbook.html','book');
  await frame.locator('#nextBtn').click();
  await page.waitForTimeout(500);
  await frame.locator('#turnWhy').evaluate(el=>el.classList.add('show'));
  const area=await frame.locator('#turnWhy').evaluate(el=>{
   const b=el.getBoundingClientRect(),a=document.getElementById('bookWrap').getBoundingClientRect();
   const w=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)),h=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
   return w*h;
  });
  assert.equal(area,0,'안내 풍선은 책 페이지 위가 아닌 책 아래 별도 공간에 있어야 한다');
 }finally{await ctx.close()}
});
test('#1605 40개 첫 보기: 누를 수 있는 카드 크기이고 전체 맞춤은 전체 단추로만', {skip:missing},async t=>{
 const server=await serve({}, {port});
 const browser=await chromium.launch({headless:true});
 t.after(async()=>{await browser.close();await new Promise(r=>server.close(r))});
 const base='http://127.0.0.1:'+server.address().port;
 for(const count of [5,40,120]){
  await t.test(String(count),async()=>{
   const{page,ctx,select}=await setup(browser,base,{width:390,height:844,theme:'night',count});
   try{
    const f=await select('track61-tree.html','tree');
    const first=await f.locator('#cards').evaluate(el=>{
     const view=window.__LT_TREE_VIEW__;
     const cards=[...el.querySelectorAll('[data-kind="moment"]')];
     const small=cards.filter(e=>{const r=e.getBoundingClientRect();return r.width<44||r.height<44}).length;
     return{mode:view.state.mode,scale:view.state.scale,cards:cards.length,small};
    });
    if(count>=40){assert.equal(first.mode,'root');assert.ok(first.scale>=1);assert.equal(first.small,0)}
    else assert.equal(first.mode,'fit');
    await f.locator('#goFit').click();
    await page.waitForTimeout(50);
    const fitted=await f.locator('#cards').evaluate(()=>window.__LT_TREE_VIEW__.state.mode);
    assert.equal(fitted,'fit');
   }finally{await ctx.close()}
  });
 }
});
