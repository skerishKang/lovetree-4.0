import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { serve } from './screen-audit.mjs';
import { createTree, addMoment } from '../../src/domain.js';
import { projectSharedTree } from '../../server/share-service.js';

let chromium;
try { ({chromium}=await import('playwright')); } catch {}
const skip=!chromium||!existsSync(chromium.executablePath())?'크롬 시험 환경 없음':false;
const id='s'.repeat(24),missing='x'.repeat(24),clock='2026-11-20T00:00:00Z';
let tree=createTree({subject:'시험 공개 트리',title:'시험 첫 순간',note:'첫 기록',date:'2026-11-20',emotion:'설렘',url:''},clock);
tree=addMoment(tree,{title:'둘째 순간',note:'둘째 기록',date:'2026-11-21',emotion:'설렘',url:''},tree.moments[0].id,clock);
const shared=projectSharedTree({version:1,trees:[tree]},tree.id,id).tree;

async function context(browser,base,width,height,theme,owned){
 const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',locale:'ko-KR'});
 await ctx.addInitScript(t=>{localStorage.setItem('lt41.theme',t);localStorage.setItem('lt41.tips.firstTree','1');},theme);
 await ctx.route('**/*',async r=>{
  const u=new URL(r.request().url());
  if(u.origin!==base)return r.abort();
  if(!u.pathname.startsWith('/api/')&&!u.pathname.startsWith('/auth/'))return r.continue();
  const send=(status,json)=>r.fulfill({status,json});
  const denied=()=>send(401,{error:{code:'unauthenticated'}});
  if(u.pathname==='/api/workspace')return owned?send(200,{revision:1,state:{version:1,trees:[tree],prefs:{theme}},subject:'fixture-account',writeSubjectBound:true,savedAt:clock}):denied();
  if(u.pathname==='/api/account')return owned?send(200,{ok:true,confirmKind:'phrase'}):denied();
  if(u.pathname.startsWith('/api/public/shares/'))return u.pathname.endsWith(id)?send(200,{share:{id,entryMomentId:shared.moments[0].id,view:'book'},tree:shared,aiTester:true,omittedPrivateMedia:0}):send(404,{error:{code:'share_not_found'}});
  return send(200,{ok:true,items:[],shares:[],groups:[],assets:[],visibility:'public',discover:false});
 });
 return ctx;
}
async function open(page,base,owned,hash){
 await page.goto(base+'/v41/'+(owned?'?account=1':'')+hash);
}
async function ready(page,part){
 await page.waitForFunction(part=>{const f=document.getElementById('view');return f&&!f.hidden&&f.contentDocument?.readyState==='complete'&&f.contentDocument.URL.includes(part)},part);
}
const click=(page,id)=>page.evaluate(id=>document.getElementById(id).click(),id);

test('#1581 설정 선택 표시와 가로 계정 메뉴의 마지막 단추', {skip,timeout:90000},async()=>{
 const server=await serve(),base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 try{
  for(const theme of ['night','garden']){
   const ctx=await context(browser,base,844,390,theme,true);
   try{
    const page=await ctx.newPage();
    await open(page,base,true,'#home');await ready(page,'home.html');
    await page.waitForFunction(()=>!document.getElementById('account-avatar').hidden);
    await click(page,'account-avatar');
    await page.waitForFunction(()=>!document.getElementById('account-popover').hidden);
    const menu=await page.evaluate(()=>{
     const p=document.getElementById('account-popover');p.scrollTop=p.scrollHeight;
     const last=p.lastElementChild,rect=p.getBoundingClientRect(),end=last.getBoundingClientRect();
     return {bottom:rect.bottom,scroll:getComputedStyle(p).overflowY,end:end.bottom};
    });
    assert.ok(menu.bottom<=391&&menu.end<=menu.bottom+1,JSON.stringify(menu));
    assert.equal(menu.scroll,'auto');
    await click(page,'account-open-settings');await page.waitForSelector('#account-settings[open]');
    await click(page,'settings-tab-records');
    assert.equal(await page.locator('[data-quick-target="current"]').getAttribute('aria-checked'),'true');
    await page.locator('[data-quick-target="fixed"]').click();
    assert.equal(await page.locator('[data-quick-target="fixed"]').getAttribute('aria-checked'),'true');
    await page.locator('[data-quick-target="current"]').click();
    assert.equal(await page.locator('[data-quick-target="current"]').getAttribute('aria-checked'),'true');
    await page.setViewportSize({width:1440,height:900});
    const surface=await page.locator('.account-settings-surface').evaluate(e=>{const c=getComputedStyle(e);return {border:parseFloat(c.borderTopWidth),radius:parseFloat(c.borderTopLeftRadius),background:c.backgroundColor}});
    assert.ok(surface.border>=1&&surface.radius>0&&surface.background!=='rgba(0, 0, 0, 0)',JSON.stringify(surface));
   }finally{await ctx.close();}
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});

test('#1581 공개 허용 정보와 없는 공유의 첫 화면 입구', {skip,timeout:90000},async()=>{
 const server=await serve(),base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 try{
  for(const theme of ['night','garden']){
   const ctx=await context(browser,base,390,844,theme,false);
   try{
    const page=await ctx.newPage();
    await open(page,base,false,'#share/'+id+'/book');await ready(page,'track59-sketchbook');
    await page.waitForFunction(()=>document.querySelector('#lt-visitor-caption')?.textContent.includes('AI 명예회원'));
    assert.match(await page.locator('#lt-visitor-caption').innerText(),/공개 트리/);
    await open(page,base,false,'#share/'+missing+'/book');
    await page.waitForFunction(()=>document.querySelector('#empty h1')?.textContent.includes('공유 주소를 찾을 수 없어요.'));
    assert.equal(await page.locator('#empty-file').isVisible(),false);
    assert.equal(await page.locator('#lt-visitor-caption').isVisible(),false);
    await page.getByRole('button',{name:'첫 화면으로 가기'}).click();
    await ready(page,'home.html');
    assert.equal(await page.locator('#empty-share-home').isVisible(),false);
   }finally{await ctx.close();}
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
