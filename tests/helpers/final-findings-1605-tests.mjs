// #1605: 안쪽 다섯 화면은 새 소식 띠 없이 기존 무대·스크롤을 유지한다.
// 읽지 않은 표시는 기존 새 소식 읽음 키로 계정·휴대폰 메뉴에 함께 적용한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {serve} from './screen-audit.mjs';
import {evaluateWhenReady} from './visible-frame.mjs';

const skip=!existsSync(chromium.executablePath());
const port=Number(process.env.LT_TEST_PORT||0);
const SCREENS=[
 ['track32-bookshelf.html','shelf'],
 ['track61-tree.html','tree'],
 ['track58-pinboard.html','board'],
 ['track59-sketchbook.html','book'],
 ['track56-network.html','network']
];
const fixture={revision:1,subject:'test-1605',writeSubjectBound:true,
 state:{version:1,prefs:{theme:'night'},trees:[{
  id:'t6',subject:'시험 트리',title:'시험 기록',inbox:false,
  createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-06T00:00:00.000Z',
  moments:Array.from({length:1},(_,i)=>({
   id:'m'+(i+1),parentId:i?'m'+i:null,relation:i?'이어짐':'',
   title:'시험 순간 '+(i+1),date:'2026-01-0'+(i+1),emotion:'설렘',
   note:'시험 기록',type:'memo',url:'',createdOrder:i+1,keywords:[],links:[],
   createdAt:'2026-01-0'+(i+1)+'T00:00:00.000Z'
  }))
 }]}};
async function readyPage(browser,base,width,height,theme){
 const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
 await ctx.addInitScript(t=>{
  localStorage.setItem('lt41.theme',t);
  localStorage.setItem('lt41.tips.firstTree','1');
 },theme);
 await ctx.route('**/api/workspace*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...fixture,state:{...fixture.state,prefs:{theme}}})}));
 await ctx.route('**/*',r=>new URL(r.request().url()).origin===base?r.fallback():r.abort());
 const page=await ctx.newPage();
 await page.goto(base+'/v41/?account=1',{waitUntil:'load'});
 await page.waitForFunction(()=>window.LT41?.tree?.id==='t6',null,{timeout:18000});
 await page.waitForFunction(()=>document.querySelector('#account-updates')?.classList.contains('has-dot'),null,{timeout:18000});
 return{page,ctx};
}
function luminance(col){
 const a=col.match(/[\d.]+/g)?.slice(0,3).map(Number)||[0,0,0];
 const linear=n=>(n/=255,n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4);
 return 0.2126*linear(a[0])+0.7152*linear(a[1])+0.0722*linear(a[2]);
}
function ratio(a,b){const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (values[0]+0.05)/(values[1]+0.05);}
test('#1605 새 소식은 첫 화면에만 띠, 안쪽 다섯 화면은 머리줄 읽지 않은 점과 무대 유지',{skip},async t=>{
 const server=await serve({}, {port}),base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 t.after(async()=>{await browser.close();await new Promise(ok=>server.close(ok))});
 for(const [width,height] of [[390,844],[1440,900]])for(const theme of ['night','garden']){
  await t.test(width+' '+theme,async()=>{
   for(const [file,screen] of SCREENS){
    const{page,ctx}=await readyPage(browser,base,width,height,theme);
    try{
     // 첫 화면은 기존처럼 띠를 띄운다. 안쪽 화면으로 이동할 때만 감춘다.
     await page.locator('#updates-card').waitFor({state:'visible',timeout:8000});
     await page.evaluate(file=>document.querySelector('[data-view="'+file+'"]')?.click(),file);
     await page.waitForFunction(s=>document.querySelector('#view')?.contentDocument?.documentElement?.dataset?.v41Screen===s,screen,{timeout:18000});
     const baseline=await page.locator('#stage').boundingBox();
     const frameBaseline=await page.locator('#view').boundingBox();
     const initialFrameScroll=await page.locator('#view').evaluate(frame=>{
      const scroll=frame.contentDocument?.scrollingElement;
      return !!scroll&&scroll.scrollHeight>scroll.clientHeight+1;
     });
     await page.evaluate(()=>{
      const card=document.getElementById('updates-card');
      card.hidden=false; // 표시 요청이 늦게 와도 안쪽 화면에서는 띠가 그려지지 않아야 한다.
     });
     const sizes=await evaluateWhenReady(page,()=>{
      const frame=document.getElementById('view'),stage=document.getElementById('stage'),card=document.getElementById('updates-card');
      const doc=frame?.contentDocument;
      if(!doc?.documentElement)return false;
      const scroll=doc.scrollingElement;
      return{
       display:getComputedStyle(card).display,
       stageHeight:stage.getBoundingClientRect().height,
       frameHeight:frame.getBoundingClientRect().height,
       frameScroll:!!scroll&&scroll.scrollHeight>scroll.clientHeight+1,
       theme:document.documentElement.dataset.ltTheme,
       screen:doc?.documentElement?.dataset?.v41Screen
      };
     });
     assert.equal(sizes.display,'none',width+'/'+theme+'/'+screen+' 띠 숨김');
     assert.equal(sizes.stageHeight,baseline.height,width+'/'+theme+'/'+screen+' stage 높이 유지');
     assert.equal(sizes.frameHeight,frameBaseline.height,width+'/'+theme+'/'+screen+' iframe 높이 유지');
     assert.equal(sizes.frameScroll,initialFrameScroll,width+'/'+theme+'/'+screen+' 기존 iframe 스크롤 상태 불변');
     assert.equal(sizes.screen,screen);
     assert.equal(await page.locator('#account-updates').getAttribute('aria-label'),'새 소식 있음');
     if(width===390){
      assert.equal(await page.locator('#mobile-more').getAttribute('aria-label'),'메뉴 더보기 · 새 소식 있음');
      await page.locator('#mobile-more').click();
      const menu=page.locator('#header-overflow .lt-updates-entry');
      await menu.waitFor({state:'visible'});
      assert.equal(await menu.getAttribute('aria-label'),'새 소식 있음');
      assert.equal(await menu.evaluate(el=>el.classList.contains('has-dot')),true);
      const contrast=await menu.evaluate(el=>({fg:getComputedStyle(el,'::after').backgroundColor,bg:getComputedStyle(el.parentElement).backgroundColor}));
      assert.ok(ratio(contrast.fg,contrast.bg)>=3,'390 '+theme+' 메뉴 점 대비 3:1 이상 '+JSON.stringify(contrast));
      await menu.click();
     }else{
      await page.locator('#account-avatar').click();
      const menu=page.locator('#account-updates');
      await menu.waitFor({state:'visible'});
      assert.equal(await menu.getAttribute('aria-label'),'새 소식 있음');
      const contrast=await menu.evaluate(el=>({fg:getComputedStyle(el,'::before').backgroundColor,bg:getComputedStyle(el.parentElement).backgroundColor}));
      assert.ok(ratio(contrast.fg,contrast.bg)>=3,'1440 '+theme+' 계정 점 대비 3:1 이상 '+JSON.stringify(contrast));
      await menu.click();
     }
     await page.waitForFunction(()=>document.getElementById('updates-panel')?.open===true&&
      !document.getElementById('account-updates')?.classList.contains('has-dot'),null,{timeout:9000});
     assert.equal(await page.locator('#mobile-more').getAttribute('aria-label'),'메뉴 더보기');
     assert.equal(await page.locator('#account-updates').getAttribute('aria-label'),'새 소식');
     if(width===390){
      await page.locator('#mobile-more').click();
      assert.equal(await page.locator('#header-overflow .lt-updates-entry').getAttribute('aria-label'),'새 소식');
      assert.equal(await page.locator('#header-overflow .lt-updates-entry').evaluate(el=>el.classList.contains('has-dot')),false);
     }
    }finally{await ctx.close()}
   }
  });
 }
});
