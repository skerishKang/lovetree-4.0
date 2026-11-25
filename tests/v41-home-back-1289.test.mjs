import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {serve} from './helpers/screen-audit.mjs';
import {createTree,addMoment} from '../public/v41/domain.mjs';
import {testBackNavigation} from './helpers/history-assert.mjs';

const REQUIRE=process.env.LT_HOME_1289_REQUIRE==='1';
const SHOTS=process.env.LT_HOME_1289_SHOTS||'';
if(REQUIRE&&!existsSync(new URL('../dist/v41/home.html',import.meta.url)))throw Error('화면 빌드가 필요합니다');
function fakeTree(){
 const mk=(i)=>({subject:'사진 기록',title:'순간 '+i,note:'기록 '+i,emotion:'설렘',date:'2026-11-01',url:i===1?'https://www.youtube.com/watch?v=jNQXAC9IVRw':''});
 let tree=createTree(mk(1),'2026-11-01T00:00:00.000Z');
 for(let i=2;i<=4;i++)tree=addMoment(tree,mk(i),tree.moments[0].id,'2026-11-01T00:00:00.000Z');
 return tree;
}
async function open(browser,base,width,theme){
 const ctx=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});
 await ctx.addInitScript(theme=>localStorage.setItem('lt41.theme',theme),theme);
 const workspace={revision:1,state:{version:1,trees:[fakeTree()],prefs:{}},subject:'시험계정',writeSubjectBound:true,savedAt:'2026-11-20T00:00:00.000Z'};
 await ctx.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin!==base)return route.abort();
  if(u.pathname==='/api/workspace')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(workspace)});
  if(u.pathname.startsWith('/api/'))return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[]}'});
  return route.continue();
 });
 const page=await ctx.newPage();
 await page.goto(base+'/v41/?account=1#home',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.LT41?.trees?.length,{timeout:20000});
 const ask=page.locator('#discover-ask-no');
 await ask.waitFor({state:'visible',timeout:5000}).catch(()=>{});
 if(await ask.isVisible())await ask.click();
 await page.waitForFunction(()=>!document.querySelector('#discover-ask')?.open,null,{timeout:5000});
 await page.waitForFunction(()=>!!document.querySelector('#view')?.contentDocument?.getElementById('orbit')?.shadowRoot?.querySelector('.center .actions'),null,{timeout:15000});
 const frame=page.frames().find(f=>/\/v41\/home\.html/.test(f.url()));
 assert.ok(frame,'첫 화면 프레임');
 return {ctx,page,frame};
}
async function screenshot(page,name){
 if(!SHOTS)return;
 mkdirSync(SHOTS,{recursive:true});
 await page.screenshot({path:path.join(SHOTS,name)});
}
test('#1289 첫 화면 방문 기록 및 복원', {skip:REQUIRE?false:'필수 화면 검사에서 실행',timeout:190000},async()=>{
 const server=await serve(),base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--disable-gpu']});
 try{
  for(const width of [390,1440])for(const theme of ['night','garden']){
   const label=width+'-'+theme;
   const setup=()=>open(browser,base,width,theme);
   {
    const {ctx,page,frame}=await setup();
    await screenshot(page,label+'-before.png');
    await testBackNavigation(page,{frame,recorded:true,panels:['html[data-lt-home-panel="index"]'],action:()=>frame.evaluate(()=>document.querySelector('#orbit')?.shadowRoot?.querySelector('[data-do="moments"]')?.click())});
    await screenshot(page,label+'-index-back.png');
    await ctx.close();
   }
   {
    const {ctx,page,frame}=await setup();
    await testBackNavigation(page,{frame,recorded:true,panels:['html[data-lt-home-panel="viewer"]'],action:async()=>{
     await frame.locator('#orbit .recent-meta strong').click();
     await frame.waitForFunction(()=>document.documentElement.dataset.ltHomePanel==='viewer');
     await screenshot(page,label+'-viewer-open.png');
    }});
    await screenshot(page,label+'-viewer-back.png');
    await ctx.close();
   }
   {
    const {ctx,page,frame}=await setup();
    await frame.evaluate(()=>document.querySelector('#orbit')?.shadowRoot?.querySelector('[data-do="moments"]')?.click());
    await frame.waitForFunction(()=>document.documentElement.dataset.ltHomePanel==='index');
    await testBackNavigation(page,{frame,recorded:true,panels:['html[data-lt-home-panel="index"]','html[data-lt-home-panel="detail"]'],action:async()=>{
      await frame.evaluate(()=>document.querySelector('#orbit')?.shadowRoot?.querySelector('dialog [data-next]')?.click());
      await frame.waitForFunction(()=>document.documentElement.dataset.ltHomePanel==='detail');
      await screenshot(page,label+'-detail-open.png');
    }});
    assert.equal(await frame.evaluate(()=>!!document.querySelector('#orbit')?.shadowRoot?.querySelector('dialog .index-list')),true,'뒤로 가면 순간 목록');
    await screenshot(page,label+'-detail-back.png');
    await ctx.close();
   }
   {
    const {ctx,page,frame}=await setup();
    await testBackNavigation(page,{frame,recorded:true,action:()=>frame.evaluate(()=>document.querySelector('#orbit')?.shadowRoot?.querySelector('[data-do="trees"]')?.click())});
    await ctx.close();
   }
   {
    const {ctx,page,frame}=await setup();
    await testBackNavigation(page,{frame,recorded:false,action:()=>page.locator('#theme-toggle').click()});
    await testBackNavigation(page,{frame,recorded:false,action:async()=>{
      await frame.evaluate(()=>document.querySelector('#orbit')?.shadowRoot?.querySelector('[data-recent-head]')?.click());
      await frame.waitForFunction(()=>!!document.querySelector('#orbit')?.shadowRoot?.querySelector('.recent-menu[open]'));
    }});
    await ctx.close();
   }
   {
    const {ctx,page,frame}=await setup();
    await testBackNavigation(page,{frame,recorded:true,action:()=>frame.evaluate(()=>document.querySelector('#orbit')?.shadowRoot?.querySelector('[data-do="community"]')?.click())});
    await ctx.close();
   }
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
